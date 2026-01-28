import { Injectable } from '@nestjs/common';
import { GamesRepository } from './games.repository';
import { GameState } from './types/game-state.type';

@Injectable()
export class GamesService {
  constructor(private readonly gamesRepository: GamesRepository) {}

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
}
