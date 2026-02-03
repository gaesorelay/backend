import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
  TURN_COUNT,
} from '../../common/constants/game-flow.constants';

type GameFlowContext = {
  emitStatus: (status: RoomStatus, durationMs: number, displayStatus?: string) => void;
  emitVoteResult?: (outcome: VoteOutcome) => void;
  nextAction?: () => void;
  currentStatus?: RoomStatus;

  // ⭐️ [추가] 롤백을 위한 상태 추적
  currentTurn?: number; // 현재 턴 (PLAYING 시)
  subStatus?: 'CARD_SHUFFLE' | 'JUDGE_SHUFFLE' | 'STORY' | 'VOTING' | 'JUDGE_RESULT';
  totalTurns?: number;
};

@Injectable()
export class GameFlowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameFlowService.name);
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
  ) { }

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
   * 캐시된 컨텍스트 없으면 조용히 리턴
   */
  private getContext(roomUuid: string) {
    return this.contexts.get(roomUuid);
  }

  /**
   * ⏭️ 현재 단계를 건너뛰고 바로 다음 로직을 실행한다.
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
    context.nextAction = undefined;
    action();
  }

  /**
   * ⏪ [테스트용] 이전 단계로 돌아간다 + 데이터 롤백
   */
  async prevPhase(roomUuid: string) {
    const context = this.getContext(roomUuid);
    if (!context || !context.currentStatus) return;

    // 1. 현재 타이머 취소
    this.timerService.cancel(roomUuid, context.currentStatus);
    context.nextAction = undefined; // 예약된 동작 제거

    // 2. 상태별 분기
    // PLAYING 상태 (턴 진행 중)
    if (context.currentStatus === 'PLAYING' && context.currentTurn) {
      const currentTurn = context.currentTurn;

      // 1턴이면 -> WAITING (JUDGE_SHUFFLE) 로 이동
      if (currentTurn <= 1) {
        // 데이터 롤백 (0턴까지 = 다 지움)
        await this.gamesService.rollbackStory(roomUuid, 0);
        // WAITING의 JUDGE_SHUFFLE 단계로 진입
        await this.restartWaitingFromJudge(roomUuid, context);
        return;
      }

      // 2턴 이상이면 -> 이전 턴으로 이동
      // 예: 2턴 중단 -> 1턴만 남김 (index 0, 1 중 0만 남김) -> 길이는 1
      const prevTurn = currentTurn - 1;
      await this.gamesService.rollbackStory(roomUuid, prevTurn - 1);

      const room = await this.roomsRepository.findById(roomUuid);
      const roundMs = (room?.config.roundTime ?? 60) * 1000;

      // 이전 턴 시작
      await this.startTurnFlow(
        roomUuid,
        context,
        prevTurn,
        context.totalTurns || TURN_COUNT,
        roundMs,
      );
      return;
    }

    // WAITING 상태
    if (context.currentStatus === 'WAITING') {
      // JUDGE_SHUFFLE -> CARD_SHUFFLE로
      if (context.subStatus === 'JUDGE_SHUFFLE') {
        await this.handleWaiting(roomUuid, context); // 처음(CARD)부터 다시
        return;
      }
      // 이미 CARD_SHUFFLE이면 -> 더 갈 곳 없음 (혹은 LOBBY?)
      // 여기선 그냥 재시작
      await this.handleWaiting(roomUuid, context);
      return;
    }

    // RESULTING 상태
    // 스토리/투표 중이면 -> 마지막 턴으로 복귀
    if (context.currentStatus === 'RESULTING' || context.currentStatus === 'ENDED') {
      const room = await this.roomsRepository.findById(roomUuid);
      const roundMs = (room?.config?.roundTime ?? 60) * 1000;
      const totalTurns = TURN_COUNT;

      // 마지막 턴 이전까지 남기고 -> 마지막 턴 시작
      await this.gamesService.rollbackStory(roomUuid, totalTurns - 1);

      // 다시 PLAYING 상태로 강제 변경 필요
      context.currentStatus = 'PLAYING';
      // startTurnFlow 내부에서 저장하겠지만 여기서 미리 setRoomStatus 할 수도 있음
      // 하지만 startTurnFlow는 상태 변경 없이 PLAYING 유지 + emitStatus만 함
      // 따라서 DB 상태도 되돌려야 함
      await this.setRoomStatus(roomUuid, 'PLAYING');

      await this.startTurnFlow(roomUuid, context, totalTurns, totalTurns, roundMs);
      return;
    }
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

    context.subStatus = 'CARD_SHUFFLE';
    context.emitStatus('WAITING', CARD_SHUFFLE_TIME, 'CARD_SHUFFLE');

    // CARD_SHUFFLE 종료 후 JUDGE_SHUFFLE로 전환, 이후 PLAYING 시작
    this.scheduleNext(roomUuid, context, 'WAITING', CARD_SHUFFLE_TIME, () => {
      this.restartWaitingFromJudge(roomUuid, context);
    });
  }

  // 💡 [Helper] JUDGE_SHUFFLE 단계부터 시작 (PrevPhase 등에서 호출)
  private async restartWaitingFromJudge(roomUuid: string, context: GameFlowContext) {
    context.subStatus = 'JUDGE_SHUFFLE';
    context.emitStatus('WAITING', JUDGE_SHUFFLE_TIME, 'JUDGE_SHUFFLE');

    this.scheduleNext(roomUuid, context, 'WAITING', JUDGE_SHUFFLE_TIME, () => {
      void this.setRoomStatus(roomUuid, 'PLAYING');
    });
  }

  private async handlePlaying(roomUuid: string, context: GameFlowContext): Promise<void> {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) return;

    // 라운드 시간은 방 설정값을 사용한다.
    const roundMs = room.config.roundTime * 1000;
    const totalTurns = TURN_COUNT; // 고정값

    context.totalTurns = totalTurns;

    this.startTurnFlow(roomUuid, context, 1, totalTurns, roundMs);
  }

  private async handleVoting(roomUuid: string, context: GameFlowContext): Promise<void> {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) return;

    // 1. STORY 단계
    context.subStatus = 'STORY';
    context.emitStatus('RESULTING', STORY_TIME, 'STORY');

    // AI 평가 요청 (비동기 시작)
    const aiVotesPromise = this.buildAiJudgeScores(roomUuid);
    this.aiVotePromises.set(roomUuid, aiVotesPromise);

    // 2. STORY -> VOTING
    this.scheduleNext(roomUuid, context, 'RESULTING', STORY_TIME, () => {
      const votingMs = room.config.voteTime * 1000;
      context.subStatus = 'VOTING';
      context.emitStatus('RESULTING', votingMs, 'VOTING');

      // 3. VOTING -> JUDGE_RESULT (✨ 여기서 결과 전송!)
      this.scheduleNext(roomUuid, context, 'RESULTING', votingMs, async () => {
        // ⭐️ [중요] JUDGE_RESULT 페이즈 시작 알림
        context.subStatus = 'JUDGE_RESULT';
        context.emitStatus('RESULTING', JUDGING_TIME, 'JUDGE_RESULT');

        // ⭐️ [중요] AI 결과 및 투표 집계 후 클라이언트로 전송
        await this.sendVoteResult(roomUuid, context);

        // 4. JUDGE_RESULT -> ENDED
        this.scheduleNext(roomUuid, context, 'RESULTING', JUDGING_TIME, () => {
          void this.setRoomStatus(roomUuid, 'ENDED');
        });
      });
    });
  }

  // ✨ 새로 분리한 결과 전송 메서드 (handleEnded에서 로직 가져옴)
  private async sendVoteResult(roomUuid: string, context: GameFlowContext) {
    // 1. AI 평가 결과 대기 (이미 요청해둔 것)
    const aiVotesPromise = this.aiVotePromises.get(roomUuid);
    const aiScores = aiVotesPromise ? await aiVotesPromise : null;

    // 2. 관객 투표 결과 집계
    let outcome = this.gamesService.getVoteOutcome(roomUuid);

    if (aiScores && aiScores.length > 0) {
      console.log(`\n🤖 [AI 심사 결과 - Room ${roomUuid}]`);
      aiScores.forEach((s) => {
        console.log(`   [${s.judgeName}] A: ${s.scoreTeamA} / B: ${s.scoreTeamB}`);
      });

      // 1. 함수 실행
      outcome = this.gamesService.applyAiJudgeVotes(roomUuid, aiScores);

      // 🔍 [디버깅] 여기서 찍었을 때 aiJudges가 들어있나요?
      console.log('🔥 [DEBUG] 최종 outcome 데이터 확인:', JSON.stringify(outcome, null, 2));
    }

    if (context.emitVoteResult) {
      // 2. 전송
      context.emitVoteResult(outcome);
    }
  }

  // 기존 handleEnded는 단순히 상태 정리만 하도록 축소
  private async handleEnded(roomUuid: string, context: GameFlowContext): Promise<void> {
    // 이미 결과는 보냈으니 상태 정리만 수행
    context.emitStatus('ENDED', 0, 'JUDGE_RESULT');
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
    const effectiveRoundMs = turnIndex === 1 ? roundMs + 3000 : roundMs;
    this.logger.log(
      `[startTurnFlow] room=${roomUuid} turn=${turnIndex}/${totalTurns} roundMs=${effectiveRoundMs}`,
    );
    // Context에 현재 턴 저장
    context.currentTurn = turnIndex;

    // PLAYING 상태는 유지하되, 사용자에게는 TURN 메시지로 안내한다.
    const displayStatus = `TURN${turnIndex}`;
    context.emitStatus('PLAYING', effectiveRoundMs, displayStatus);

    // 💡 [추가] 턴 시작 로직 호출 (이미지/순서 계산)
    await this.gamesService.startTurn(roomUuid, turnIndex);

    // 3. 타이머 스케줄링
    this.scheduleNext(roomUuid, context, 'PLAYING', effectiveRoundMs, async () => {
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
    await this.roomsRepository.save(room, 60 * 60);
    this.roomStatusSubject.notify({ roomUuid, status });
  }

  private async buildAiJudgeScores(roomUuid: string): Promise<AiJudgeScore[] | null> {
    // Redis에서 데이터 조회 (await 사용)
    const teamAEvaluateDto = await this.gamesService.getEvaluateDto(roomUuid, 'A');
    const teamBEvaluateDto = await this.gamesService.getEvaluateDto(roomUuid, 'B');

    if (!teamAEvaluateDto || !teamBEvaluateDto) {
      return null;
    }

    // 팀 A/B의 평가를 동시에 요청한다.
    console.time(`⏱️ AI Evaluation Time (${roomUuid})`);
    console.log(`🚀 Sending AI Request for Team A... (Room: ${roomUuid})`);
    console.log(`🚀 Sending AI Request for Team B... (Room: ${roomUuid})`);

    const startTime = Date.now();

    return Promise.all([
      this.aiJudgeService.evaluateRoom(roomUuid, teamAEvaluateDto),
      this.aiJudgeService.evaluateRoom(roomUuid, teamBEvaluateDto),
    ])
      .then(([teamAResults, teamBResults]) => {
        const duration = Date.now() - startTime;
        console.timeEnd(`⏱️ AI Evaluation Time (${roomUuid})`);
        console.log(`✅ AI Evaluation Completed in ${duration}ms`);

        // 결과 처리 로직 (Map & Filter)
        const teamBMap = new Map(
          teamBResults.map((result: PersonaResult) => [result.personaName, result]),
        );

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
      })
      .catch((error) => {
        console.error(`❌ AI Evaluation Failed:`, error);
        return null;
      });
  }
}
