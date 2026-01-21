import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { redisKeys } from '../../common/constants/redis.keys';
import { Room } from '../../common/types/room.type';

@Injectable()
export class RoomsRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {}

  //방 저장
  async save(room: Room, ttlSeconds?: number): Promise<void> {
    const key = redisKeys.roomInfo(room.roomUuid);
    const payload = JSON.stringify(room);

    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
      return;
    }

    await this.client.set(key, payload);
  }

  //방 검색
  async findById(roomUuid: string): Promise<Room | null> {
    const key = redisKeys.roomInfo(roomUuid);
    const raw = await this.client.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Room;
  }

  //방 삭제
  async delete(roomUuid: string): Promise<void> {
    const key = redisKeys.roomInfo(roomUuid);
    await this.client.del(key);
  }
}
