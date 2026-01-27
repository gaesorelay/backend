import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class AiJudgesRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {}

  // 심사위원 목록 저장
  async saveSelectedJudges(roomUuid: string, judgeNames: string[]): Promise<void> {
    const key = `room:${roomUuid}:ai_judges`;
    await this.client.set(key, JSON.stringify(judgeNames));
  }

  // 심사위원 목록 조회
  async getSelectedJudges(roomUuid: string): Promise<string[] | null> {
    const key = `room:${roomUuid}:ai_judges`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }
}
