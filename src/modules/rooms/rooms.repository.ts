import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import Redis from 'ioredis';

import { redisKeys } from '../../common/constants/redis.keys';
import { Room } from './types/room.type';
import { User } from '../users/types/user.type';

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
  async findById(roomUuid: string): Promise<Room> {
    const key = redisKeys.roomInfo(roomUuid);
    const raw = await this.client.get(key);
    if (!raw) {
      throw new NotFoundException('room not found');
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

  async findUserTokenBySocketId(socketId: string): Promise<string | null> {
    const key = redisKeys.socketMap(socketId);
    const userToken = await this.client.get(key);
    return userToken ?? null;
  }

  async nextPublicUserId(roomUuid: string): Promise<number> {
    const key = redisKeys.roomUserSeq(roomUuid);
    return this.client.incr(key);
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

  // [수정] 소켓 매핑 저장: roomUuid와 userToken을 같이 저장
  async saveSocketMapping(socketId: string, roomUuid: string, userToken: string): Promise<void> {
    const key = redisKeys.socketMap(socketId);
    const value = `${roomUuid}:${userToken}`; // 예: "room-123:user-456"
    await this.client.set(key, value);
  }

  // 👇 [추가 4] 방의 모든 유저 목록 가져오기 (이미 입장한 유저 체크용)
  async findAllUsersInRoom(roomUuid: string): Promise<User[]> {
    const pattern = redisKeys.roomUsers(roomUuid);
    const keys = await this.client.keys(pattern);

    if (keys.length === 0) return [];

    // 여러 키의 값을 한 번에 가져옴 (MGET)
    const rawUsers = await this.client.mget(keys);

    return rawUsers.filter((raw) => raw !== null).map((raw) => JSON.parse(raw) as User);
  }

  // [수정] 매핑 정보 파싱해서 가져오기
  async getMappingBySocketId(socketId: string): Promise<{ roomUuid: string; userToken: string }> {
    const key = redisKeys.socketMap(socketId);
    const value = await this.client.get(key);
    if (!value) throw new NotFoundException('Socket mapping not found');

    const [roomUuid, userToken] = value.split(':');
    return { roomUuid, userToken };
  }

  // 👇 [추가] 유저 정보 조회 (삭제 전 정보 확인용)
  async findUserByToken(roomUuid: string, userToken: string): Promise<User> {
    const key = redisKeys.roomUser(roomUuid, userToken);
    const data = await this.client.get(key);
    if (!data) throw new NotFoundException('user not found');
    return JSON.parse(data);
  }

  async findUserByTokenOrNull(roomUuid: string, token: string): Promise<User | null> {
    const key = redisKeys.roomUser(roomUuid, token);
    const data = await this.client.get(key);

    if (!data) {
      return null; // 에러 대신 null 반환
    }
    return JSON.parse(data);
  }

  // 👇 [추가] 유저 데이터 삭제 (유저 정보 + 소켓 매핑)
  async deleteUser(roomUuid: string, userToken: string, socketId: string): Promise<void> {
    const userKey = redisKeys.roomUser(roomUuid, userToken);
    const socketKey = redisKeys.socketMap(socketId);

    // 두 키를 동시에 삭제
    await this.client.del(userKey, socketKey);
  }
  /**
   * 강퇴 등으로 유저를 제거할 때 사용하는 유저 삭제 로직
   * - socketId가 있을 때만 소켓 매핑까지 함께 삭제
   */
  async deleteUserByToken(
    roomUuid: string,
    userToken: string,
    socketId?: string | null,
  ): Promise<void> {
    const userKey = redisKeys.roomUser(roomUuid, userToken);
    if (socketId) {
      const socketKey = redisKeys.socketMap(socketId);
      await this.client.del(userKey, socketKey);
      return;
    }

    await this.client.del(userKey);
  }

  // [추가] 특정 유저 데이터에 TTL 설정
  async setUserTTL(roomUuid: string, userToken: string, ttlSeconds: number): Promise<void> {
    const key = redisKeys.roomUser(roomUuid, userToken);
    // 'EXPIRE' 명령어: 해당 키를 ttlSeconds 초 뒤에 삭제함
    await this.client.expire(key, ttlSeconds);
  }

  // 👇 [추가] 특정 유저의 만료 시간 해제 (재접속 시 사용)
  async clearUserTTL(roomUuid: string, userToken: string): Promise<void> {
    const key = redisKeys.roomUser(roomUuid, userToken);
    // 'PERSIST' 명령어: 만료 시간을 없애고 영구 저장으로 되돌림
    await this.client.persist(key);
  }

  // 👇 [추가] 소켓 매핑 삭제 (연결 끊길 때 청소용)
  async deleteSocketMapping(socketId: string): Promise<void> {
    const key = redisKeys.socketMap(socketId);
    await this.client.del(key);
  }

  // 👇 [수정] 유저 소켓 ID 업데이트 (NULL 처리를 위해)
  async updateUserSocket(
    roomUuid: string,
    userToken: string,
    socketId: string | null,
  ): Promise<void> {
    const key = redisKeys.roomUser(roomUuid, userToken);

    // 기존 데이터를 가져와서 socketId만 수정 후 덮어쓰기 (Partial Update가 안되므로)
    const data = await this.client.get(key);
    if (data) {
      const user = JSON.parse(data);
      user.currentSocketId = socketId; // 연결 끊기면 null
      await this.client.set(key, JSON.stringify(user));

      // ⚠️ 주의: set을 하면 기존 TTL이 사라질 수 있으므로, TTL 설정은 set 직후에 해야 함
      // (이 로직은 Service에서 제어하는 게 안전)
    }
  }

  async saveInviteCodeMapping(code: string, uuid: string, ttl: number): Promise<void> {
    // 예: room:code:XYVYFA -> "550e8400-..."
    await this.client.set(`room:code:${code}`, uuid, 'EX', ttl);
  }

  // [추가] 심사위원 목록 저장/조회 메서드
  async saveRoomJudges(roomUuid: string, judgeNames: string[]): Promise<void> {
    const key = `room:${roomUuid}:ai_judge`;
    // 배열을 JSON 문자열로 변환하여 저장
    await this.client.set(key, JSON.stringify(judgeNames));
  }

  async getRoomJudges(roomUuid: string): Promise<string[] | null> {
    const key = `room:${roomUuid}:ai_judge`;
    const data = await this.client.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }
}
