import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class AppService {
  // 1. 만들어둔 Redis 클라이언트를 주입받습니다.
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  getHello(): string {
    return 'DogSound Relay Server Running!';
  }

  // 2. 기획서의 "방 생성" 시나리오 테스트
  async createTestRoom() {
    const roomUuid = 'test-room-uuid-1234';
    const roomKey = `room:${roomUuid}:info`; // ERD에 설계하신 키 패턴

    // Redis에 Hash 형태로 방 정보 저장 (HSET)
    await this.redis.hset(roomKey, {
      owner_user_token: 'user-token-abc',
      status: 'LOBBY',
      config: JSON.stringify({ maxUser: 8, round: 3 }),
      created_at: new Date().toISOString(),
    });

    // 저장된 데이터 불러오기
    const roomInfo = await this.redis.hgetall(roomKey);
    return roomInfo;
  }
}