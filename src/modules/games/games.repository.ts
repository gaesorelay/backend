import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { GameState } from './types/game-state.type';
import { redisKeys } from '../../common/constants/redis.keys'; // import 확인

@Injectable()
export class GamesRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {}

  async createGame(state: GameState): Promise<void> {
    // ⭐️ [변경] 설계된 키 패턴 사용
    const key = redisKeys.roomGameState(state.roomUuid);

    // 방 삭제 로직에서 이 키도 같이 지워줘야 함
    await this.client.set(key, JSON.stringify(state), 'EX', 60 * 60);
  }

  async getGame(roomUuid: string): Promise<GameState | null> {
    const key = redisKeys.roomGameState(roomUuid);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async updateGame(
    roomUuid: string,
    applyChange: (state: GameState) => boolean,
  ): Promise<GameState | null> {
    const key = redisKeys.roomGameState(roomUuid);
    const client = this.client.duplicate();

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await client.watch(key);
        const data = await client.get(key);
        if (!data) {
          await client.unwatch();
          return null;
        }

        const state: GameState = JSON.parse(data);
        const changed = applyChange(state);
        if (!changed) {
          await client.unwatch();
          return state;
        }

        const tx = client.multi();
        tx.set(key, JSON.stringify(state), 'KEEPTTL');
        const result = await tx.exec();

        if (result) {
          return state;
        }
      }

      throw new Error(`[GamesRepository] updateGame conflict retry exceeded: ${roomUuid}`);
    } finally {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  }

  async saveGame(state: GameState): Promise<void> {
    const key = redisKeys.roomGameState(state.roomUuid);
    await this.client.set(key, JSON.stringify(state), 'KEEPTTL');
  }

  // 게임 종료 시 삭제
  async deleteGame(roomUuid: string): Promise<void> {
    const key = redisKeys.roomGameState(roomUuid);
    await this.client.del(key);
  }

  /**
   * ⭐️ [신규] 심사위원 ID 리스트 업데이트
   * - 게임 상태를 가져와서 aiJudgeIDs만 변경하고 저장
   */
  async updateJudges(roomUuid: string, judgeIds: number[]): Promise<void> {
    const state = await this.updateGame(roomUuid, (gameState) => {
      gameState.aiJudgeIDs = judgeIds;
      return true;
    });

    if (!state) {
      console.warn(`[GamesRepo] Game state missing. Update judges failed: ${roomUuid}`);
    }
  }

  // ⭐️ [신규] 게임에 설정된 심사위원 ID 리스트 조회
  async getGameJudgeIds(roomUuid: string): Promise<number[]> {
    const key = redisKeys.roomGameState(roomUuid);
    const data = await this.client.get(key);

    if (!data) return []; // 게임 정보가 없으면 빈 배열

    const state: GameState = JSON.parse(data);
    return state.aiJudgeIDs || []; // number[] 반환
  }

  /**
   * 🖼️ [신규] 이미지 ID 리스트 업데이트
   */
  async updateGameImages(roomUuid: string, imageIds: number[]): Promise<void> {
    const state = await this.updateGame(roomUuid, (gameState) => {
      gameState.imageIDs = imageIds;
      return true;
    });

    if (!state) {
      console.warn(`[GamesRepo] Game state missing. Update images failed: ${roomUuid}`);
    }
  }

  async addStorySegment(roomUuid: string, text: string) {
    // 스토리 세그먼트를 리스트에 추가 (RPUSH)
    await this.client.rpush(`game:${roomUuid}:story`, text);
  }

  async getFullStory(roomUuid: string) {
    // 전체 스토리 가져오기 (LRANGE 0 -1)
    return await this.client.lrange(`game:${roomUuid}:story`, 0, -1);
  }
}
