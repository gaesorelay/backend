import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import Redis from 'ioredis';

import { redisKeys } from '../../common/constants/redis.keys';
import { Room } from './types/room.type';
import { User } from '../users/types/user.type';

const BAN_TTL_SECONDS = 30 * 60; // 30분 (초 단위)

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

  // [수정] 소켓 매핑 저장: roomUuid와 userToken을 같이 저장
  async saveSocketMapping(socketId: string, roomUuid: string, userToken: string): Promise<void> {
    const key = redisKeys.socketMap(socketId);
    const value = `${roomUuid}:${userToken}`; // 예: "room-123:user-456"
    await this.client.set(key, value);
  }

  /// 방명록에 유저 토큰 추가 (입장 시) Redis Key: room:{uuid}:users (Set 구조)
  async addUserToRoomList(roomUuid: string, userToken: string): Promise<void> {
    const key = `room:${roomUuid}:users`;
    await this.client.sadd(key, userToken);
    // 방 데이터랑 수명을 맞추기 위해 TTL 설정 (선택사항)
    await this.client.expire(key, 60 * 60 * 12);
  }

  // 방명록에서 유저 토큰 제거 (퇴장 시)
  async removeUserFromRoomList(roomUuid: string, userToken: string): Promise<void> {
    const key = `room:${roomUuid}:users`;
    await this.client.srem(key, userToken); // SREM: Set에서 제거
  }

  // 방에 있는 모든 유저 토큰 가져오기
  async getUserTokensInRoom(roomUuid: string): Promise<string[]> {
    const key = `room:${roomUuid}:users`;
    return await this.client.smembers(key); // SMEMBERS: 모든 멤버 조회
  }

  // 방에 있는 모든 유저의 '상세 정보'까지 한 번에 가져오기
  async getUsersInRoom(roomUuid: string): Promise<User[]> {
    const tokens = await this.getUserTokensInRoom(roomUuid);
    if (tokens.length === 0) return [];

    // 각 토큰으로 유저 정보 조회 (병렬 처리)
    const users: User[] = [];
    for (const token of tokens) {
      const user = await this.findUserByTokenOrNull(roomUuid, token);
      if (user) {
        users.push(user);
      } else {
        // (예외 처리) 리스트엔 있는데 실제 데이터가 만료돼서 없으면 리스트에서도 지워줌
        await this.removeUserFromRoomList(roomUuid, token);
      }
    }
    return users;
  }

  // 현재 방 인원수 조회 (최적화)
  async getUserCount(roomUuid: string): Promise<number> {
    const key = `room:${roomUuid}:users`;
    return await this.client.scard(key); // SCARD: Set의 개수 조회
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
  async deleteUser(roomUuid: string, userToken: string, socketId?: string | null): Promise<void> {
    const userKey = redisKeys.roomUser(roomUuid, userToken);
    if (socketId) {
      const socketKey = redisKeys.socketMap(socketId);

      // 유저와 소켓 키를 동시에 삭제
      await this.client.del(userKey, socketKey);
      return;
    }

    // 소켓이 없으면 유저 키만 삭제
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

  async addIpBan(roomUuid: string, ip: string): Promise<void> {
    const key = redisKeys.roomIpban(roomUuid, ip);
    // 값은 중요하지 않음('1'). 'EX' 옵션으로 1800초 설정
    await this.client.set(key, '1', 'EX', BAN_TTL_SECONDS);
  }

  async isIpBanned(roomUuid: string, ip: string): Promise<boolean> {
    const key = redisKeys.roomIpban(roomUuid, ip);
    const exists = await this.client.exists(key);
    return exists === 1; // 1이면 존재(밴 당함), 0이면 없음
  }
}
