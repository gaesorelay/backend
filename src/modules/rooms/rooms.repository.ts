import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { redisKeys } from '../../common/constants/redis.keys';
import { Room } from '../../common/types/room.type';
import { User } from '../../common/types/user.type';

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

  // 👇 [추가 1] 유저 저장
  async saveUser(user: User): Promise<void> {
    const key = redisKeys.roomUser(user.roomUuid, user.userToken);

    // 👇 [로그 추가] 저장할 때 어떤 키로 저장하는지 확인
    // console.log(`💾 [Redis 저장] Key: ${key}`);

    // 동료 스타일처럼 JSON 문자열로 변환하여 저장
    await this.client.set(key, JSON.stringify(user));
  }

  // 👇 [추가 2] 특정 방의 현재 인원 수 조회
  async getUserCount(roomUuid: string): Promise<number> {
    const pattern = redisKeys.roomUsers(roomUuid);

    // 👇 [로그 추가] 검색할 때 어떤 패턴을 쓰는지 확인
    // console.log(`🔎 [Redis 검색] Pattern: ${pattern}`);

    const keys = await this.client.keys(pattern);

    // 👇 [로그 추가] 몇 개나 찾았는지 확인
    // console.log(`🔢 [Redis 카운트] 발견된 키 개수: ${keys.length}`, keys);

    return keys.length;
  }

  // 👇 [추가 3] 소켓 매핑 저장 (Socket ID -> User Token)
  async saveSocketMapping(socketId: string, userToken: string): Promise<void> {
    const key = redisKeys.socketMap(socketId);
    await this.client.set(key, userToken);
  }

  // 👇 [추가 4] 방의 모든 유저 목록 가져오기 (이미 입장한 유저 체크용)
  async findAllUsersInRoom(roomUuid: string): Promise<User[]> {
    const pattern = redisKeys.roomUsers(roomUuid);
    const keys = await this.client.keys(pattern);

    if (keys.length === 0) return [];

    // 여러 키의 값을 한 번에 가져옴 (MGET)
    const rawUsers = await this.client.mget(keys);

    return rawUsers.filter((raw) => raw !== null).map((raw) => JSON.parse(raw as string) as User);
  }
}
