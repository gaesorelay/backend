import { Injectable } from '@nestjs/common';
import { GamesRepository } from './games.repository';
import { GameState } from './types/game-state.type';
import { TimerService } from '../timer/timer.service';
import { Phase } from '../timer/timer.types';

@Injectable()
export class GamesService {
  constructor(
    private readonly gamesRepository: GamesRepository,
    private readonly timerService: TimerService,
  ) {}

  /**
   * [수정] 게임 초기 상태 생성 (뼈대만 생성)
   * - 이미지와 심사위원은 빈 배열로 초기화
   * - 턴 종료 시간도 아직 시작 안 했으므로 0으로 설정
   */
  async initGame(roomUuid: string, teamAIds: string[], teamBIds: string[]) {
    const initialState: GameState = {
      roomUuid,
      genre: '', // 장르는 아직 설정하지 않음
      currentRound: 1,
      teamAOrder: teamAIds,
      teamBOrder: teamBIds,

      imageIDs: [],
      aiJudgeIDs: [],
      teamAStory: [],
      teamBStory: [],
      turnEndAt: 0,
    };

    // Redis에 저장
    await this.gamesRepository.createGame(initialState);

    console.log(`🎮 [Game Init] 방 ${roomUuid} 게임 상태 생성 완료 (데이터 비어있음)`);
    return initialState;
  }

  // 외부(AiJudgeService 등)에서 호출할 메서드
  async updateGameJudges(roomUuid: string, judgeIds: number[]) {
    await this.gamesRepository.updateJudges(roomUuid, judgeIds);
  }

  async getJudgeIds(roomUuid: string): Promise<number[]> {
    return this.gamesRepository.getGameJudgeIds(roomUuid);
  }

  async startGameFlow(
    roomUuid: string,
    roundMs: number,
    votingMs: number,
    emitPhase: (phase: Phase, durationMs: number) => void,
    onEnded: () => Promise<void>,
  ) {
    const animationMs = this.getAnimationDurationMs();

    // 1) 카드/AI 배정 애니메이션 단계 알림
    emitPhase('WAITING', animationMs);

    // 2) 애니메이션 종료 후 라운드 타이머 시작
    this.timerService.schedule({ roomUuid, phase: 'WAITING', delayMs: animationMs }, () => {
      this.startRoundFlow(roomUuid, roundMs, votingMs, emitPhase, onEnded);
    });
  }

  private startRoundFlow(
    roomUuid: string,
    roundMs: number,
    votingMs: number,
    emitPhase: (phase: Phase, durationMs: number) => void,
    onEnded: () => Promise<void>,
  ) {
    // 3) 라운드 진행 단계
    emitPhase('PLAYING', roundMs);
    this.timerService.schedule({ roomUuid, phase: 'PLAYING', delayMs: roundMs }, () => {
      // 4) 투표 단계
      emitPhase('VOTING', votingMs);
      this.timerService.schedule({ roomUuid, phase: 'VOTING', delayMs: votingMs }, () => {
        void onEnded().then(() => {
          emitPhase('ENDED', 0);
        });
      });
    });
  }

  private getAnimationDurationMs() {
    const fixedMs = 15_000;
    return fixedMs;
  }
}
