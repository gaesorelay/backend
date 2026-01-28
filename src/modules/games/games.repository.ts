import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { GameState } from '../../common/types/game-state.type';
import { redisKeys } from '../../common/constants/redis.keys'; // import 확인

@Injectable()
export class GamesRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {}

  async createGame(state: GameState): Promise<void> {
    // ⭐️ [변경] 설계된 키 패턴 사용
    const key = redisKeys.roomGameState(state.roomUuid);

    // 방 삭제 로직에서 이 키도 같이 지워줘야 함
    await this.client.set(key, JSON.stringify(state), 'EX', 60 * 60 * 2);
  }

  async getGame(roomUuid: string): Promise<GameState | null> {
    const key = redisKeys.roomGameState(roomUuid);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
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
}
