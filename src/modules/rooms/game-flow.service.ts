import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RoomsRepository } from './rooms.repository';
import { RoomStatus } from './types/room.type';
import { TimerService } from '../timer/timer.service';
import { GamesService } from '../games/games.service';
import { AiJudgeService } from '../ai-judges/ai-judges.service';
import { PersonaResult } from '../ai-judges/dto/judge.dto';
import { AiJudgeScore, VoteOutcome } from '../games/types/vote-outcome.type';
import { RoomStatusSubject } from './room-status.subject';
import {
  CARD_SHUFFLE_TIME,
  JUDGE_SHUFFLE_TIME,
  JUDGING_TIME,
  STORY_TIME,
} from '../../common/constants/game-flow.constants';

type GameFlowContext = {
  emitStatus: (status: RoomStatus, durationMs: number, displayStatus?: string) => void;
  emitVoteResult?: (outcome: VoteOutcome) => void;
  nextAction?: () => void;
  currentStatus?: RoomStatus;
};

@Injectable()
export class GameFlowService implements OnModuleInit, OnModuleDestroy {
  // 방별 게임 흐름에 필요한 콜백을 보관한다.
  private readonly contexts = new Map<string, GameFlowContext>();
  // RESULTING 단계에서 시작한 AI 평가 Promise를 보관한다.
  private readonly aiVotePromises = new Map<string, Promise<AiJudgeScore[] | null>>();
  private unsubscribe?: () => void;

  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly timerService: TimerService,
    private readonly gamesService: GamesService,
    private readonly aiJudgeService: AiJudgeService,
    private readonly roomStatusSubject: RoomStatusSubject,
  ) {}

  onModuleInit() {
    // RoomStatusSubject를 구독해서 상태 변화마다 로직이 이어지도록 한다.
    this.unsubscribe = this.roomStatusSubject.subscribe((event) => {
      void this.handleStatusChange(event.roomUuid, event.status);
    });
  }

  onModuleDestroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  startGameFlow(
    roomUuid: string,
    emitStatus: (status: RoomStatus, durationMs: number, displayStatus?: string) => void,
    emitVoteResult?: (outcome: VoteOutcome) => void,
  ) {
    // 시작 요청 시 콜백을 저장하고 첫 상태(WAITING)로 전환한다.
    this.contexts.set(roomUuid, { emitStatus, emitVoteResult });
    void this.setRoomStatus(roomUuid, 'WAITING');
  }

  /**
   * 현재 단계를 건너뛰고 바로 다음 로직을 실행한다.
   */
  async skipPhase(roomUuid: string) {
    const context = this.contexts.get(roomUuid);
    if (!context || !context.nextAction) return; // 예약된 다음 동작이 없으면 무시

    // 1. 걸려있는 타이머 취소
    if (context.currentStatus) {
      this.timerService.cancel(roomUuid, context.currentStatus);
    }

    // 2. 다음 로직 즉시 실행
    const action = context.nextAction;
    context.nextAction = undefined; // 실행했으므로 비움
    action();
  }

  /**
   * 타이머를 걸면서 nextAction을 컨텍스트에 저장한다.
   */
  private scheduleNext(
    roomUuid: string,
    context: GameFlowContext,
    status: RoomStatus,
    delayMs: number,
    callback: () => void,
  ) {
    context.currentStatus = status;
    context.nextAction = callback; // 콜백 저장

    this.timerService.schedule({ roomUuid, status, delayMs }, () => {
      context.nextAction = undefined; // 타이머에 의해 실행되면 저장된 콜백 제거
      callback();
    });
  }

  private async handleStatusChange(roomUuid: string, status: RoomStatus): Promise<void> {
    // 방에 등록된 흐름 정보가 없으면 무시한다.
    const context = this.contexts.get(roomUuid);
    if (!context) return;
    
    context.currentStatus = status; // 상태 갱신

    // 상태에 맞는 단계별 핸들러를 호출한다.
    if (status === 'WAITING') {
      await this.handleWaiting(roomUuid, context);
      return;
    }

    if (status === 'PLAYING') {
      await this.handlePlaying(roomUuid, context);
      return;
    }

    if (status === 'RESULTING') {
      await this.handleVoting(roomUuid, context);
      return;
    }

    if (status === 'ENDED') {
      await this.handleEnded(roomUuid, context);
    }
  }

  private async handleWaiting(roomUuid: string, context: GameFlowContext): Promise<void> {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) return;

    // 새 게임 시작 시 이전 투표 상태는 초기화한다.
    this.gamesService.resetVoteState(roomUuid);
    context.emitStatus('WAITING', CARD_SHUFFLE_TIME, 'CARD_SHUFFLE');

    // CARD_SHUFFLE 종료 후 JUDGE_SHUFFLE로 전환, 이후 PLAYING 시작
    this.scheduleNext(roomUuid, context, 'WAITING', CARD_SHUFFLE_TIME, () => {
      context.emitStatus('WAITING', JUDGE_SHUFFLE_TIME, 'JUDGE_SHUFFLE');
      this.scheduleNext(
        roomUuid,
        context,
        'WAITING',
        JUDGE_SHUFFLE_TIME,
        () => {
          void this.setRoomStatus(roomUuid, 'PLAYING');
        },
      );
    });
  }

  private async handlePlaying(roomUuid: string, context: GameFlowContext): Promise<void> {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) return;

    // 라운드 시간은 방 설정값을 사용한다.
    const roundMs = room.config.roundTime * 1000;
    // const roundMs = 3000;
    const totalTurns = 8; // 고정값
    this.startTurnFlow(roomUuid, context, 1, totalTurns, roundMs);
  }

  private async handleVoting(roomUuid: string, context: GameFlowContext): Promise<void> {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) return;

    // STORY 단계
    context.emitStatus('RESULTING', STORY_TIME, 'STORY');

    const aiVotesPromise = this.buildAiJudgeScores(roomUuid);
    this.aiVotePromises.set(roomUuid, aiVotesPromise);

    // STORY -> VOTING -> JUDGING 순서로 진행
    this.scheduleNext(roomUuid, context, 'RESULTING', STORY_TIME, () => {
      const votingMs = room.config.voteTime * 1000;
      context.emitStatus('RESULTING', votingMs, 'VOTING');

      this.scheduleNext(roomUuid, context, 'RESULTING', votingMs, () => {
        context.emitStatus('RESULTING', JUDGING_TIME, 'JUDGING');

        this.scheduleNext(roomUuid, context, 'RESULTING', JUDGING_TIME, () => {
          void this.setRoomStatus(roomUuid, 'ENDED');
        });
      });
    });
  }

  private async handleEnded(roomUuid: string, context: GameFlowContext): Promise<void> {
    // RESULTING 동안 진행한 AI 평가 결과를 가져온다.
    const aiVotesPromise = this.aiVotePromises.get(roomUuid);
    const aiScores = aiVotesPromise ? await aiVotesPromise : null;

    // 관객 투표 결과를 기본으로 가져온다.
    let outcome = this.gamesService.getVoteOutcome(roomUuid);
    if (aiScores && aiScores.length > 0) {
      // AI 평가는 투표 수에 반영하지 않고 결과에 첨부한다.
      outcome = this.gamesService.applyAiJudgeVotes(roomUuid, aiScores);
    }

    // 최종 결과를 브로드캐스트한다.
    if (context.emitVoteResult) {
      context.emitVoteResult(outcome);
    }

    // 종료 상태 알림 및 내부 상태 정리
    context.emitStatus('ENDED', 0, 'FINAL_RESULT');
    this.gamesService.resetVoteState(roomUuid);
    this.aiVotePromises.delete(roomUuid);
    this.contexts.delete(roomUuid);
  }

  private async startTurnFlow(
    roomUuid: string,
    context: GameFlowContext,
    turnIndex: number,
    totalTurns: number,
    roundMs: number,
  ): Promise<void> {
    // PLAYING 상태는 유지하되, 사용자에게는 TURN 메시지로 안내한다.
    const displayStatus = `TURN${turnIndex}`;
    context.emitStatus('PLAYING', roundMs, displayStatus);

    // 3. 타이머 스케줄링
    this.scheduleNext(roomUuid, context, 'PLAYING', roundMs, async () => {
      // 4. ⭐️ [추가] 턴 종료 처리 (버퍼 -> 스토리 저장)
      await this.gamesService.endTurn(roomUuid);

      // 다음 턴인지 투표인지 결정
      if (turnIndex < totalTurns) {
        await this.startTurnFlow(roomUuid, context, turnIndex + 1, totalTurns, roundMs);
      } else {
        void this.setRoomStatus(roomUuid, 'RESULTING');
      }
    });
  }

  private async setRoomStatus(roomUuid: string, status: RoomStatus): Promise<void> {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) return;

    // RoomStatus 업데이트 후 Subject로 상태 변경을 전파한다.
    room.status = status;
    await this.roomsRepository.save(room);
    this.roomStatusSubject.notify({ roomUuid, status });
  }

  private async buildAiJudgeScores(roomUuid: string): Promise<AiJudgeScore[] | null> {
    // 스토리 제출 시 저장된 평가 입력이 없으면 AI 평가는 생략한다.
    const teamAEvaluateDto = this.gamesService.getEvaluateDto(roomUuid, 'A');
    const teamBEvaluateDto = this.gamesService.getEvaluateDto(roomUuid, 'B');
    if (!teamAEvaluateDto || !teamBEvaluateDto) {
      return null;
    }

    // 팀 A/B의 평가를 동시에 요청한다.
    const [teamAResults, teamBResults] = await Promise.all([
      this.aiJudgeService.evaluateRoom(roomUuid, teamAEvaluateDto),
      this.aiJudgeService.evaluateRoom(roomUuid, teamBEvaluateDto),
    ]);

    // 동일한 페르소나 기준으로 점수를 비교하기 위해 맵을 만든다.
    const teamBMap = new Map(
      teamBResults.map((result: PersonaResult) => [result.personaName, result]),
    );

    // 페르소나별 점수 비교 데이터를 만든다.
    return teamAResults
      .map((aResult: PersonaResult) => {
        const bResult = teamBMap.get(aResult.personaName);
        if (!bResult) return null;

        return {
          judgeName: aResult.personaName,
          commentA: aResult.comment,
          commentB: bResult.comment,
          scoreTeamA: aResult.score,
          scoreTeamB: bResult.score,
        } as AiJudgeScore;
      })
      .filter((result): result is AiJudgeScore => result !== null);
  }
}
