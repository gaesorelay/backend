import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsRepository } from './rooms.repository';
import { Room, RoomConfig } from '../../common/types/room.type';
import { redisKeys } from '../../common/constants/redis.keys';
import { User, UserRole } from '../../common/types/user.type';
import { generateOwnerToken, generateRoomId } from '../../common/utils/id.util';

@Injectable()
export class RoomsService {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  async createRoom(dto: CreateRoomDto): Promise<CreateRoomResponseDto> {
    const roomId = generateRoomId();
    const ownerToken = generateOwnerToken();
    const room: Room = {
      roomUuid: roomId,
      ownerUserToken: ownerToken,
      title: dto.title,
      status: 'LOBBY',
      config: dto.config,
      createdAt: Date.now(),
    };

    await this.roomsRepository.save(room);

    // TODO: USER 레코드(토큰 PK) 생성 후 실제 userId/token 반환.
    return {
      roomId,
      token: ownerToken,
    };
  }

  /**
   * 방 입장 로직
   */
  async joinRoom(roomUuid: string, nickname: string, socketId: string): Promise<User> {
    // 1. 방 존재 여부 확인 (Repository 사용)
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) {
      throw new NotFoundException('존재하지 않는 방입니다.');
    }

    // 3. 인원 수 체크
    const currentCount = await this.roomsRepository.getUserCount(roomUuid);
    const maxUser = (room.config.teamSize || 4) * 2; // config 접근 방식 확인

    if (currentCount >= maxUser) {
      throw new BadRequestException('방이 꽉 찼습니다.');
    }

    // 4. 유저 객체 생성
    // 첫 입장(currentCount === 0)이면 HOST, 아니면 PLAYER
    const role: UserRole = currentCount === 0 ? 'HOST' : 'PLAYER';
    const userToken = uuidv4();

    const newUser: User = {
      userToken: userToken,
      currentSocketId: socketId,
      roomUuid: roomUuid,
      nickname: nickname,
      role: role,
      team: 'NONE', // 팀은 나중에 선택
      avatarId: Math.floor(Math.random() * 5) + 1, // 임시: 1~5 랜덤 아바타
      isReady: false, // User 인터페이스에 정의된 대로
    };

    // 5. Redis에 저장 (Repository 사용)
    // 유저 정보 저장
    await this.roomsRepository.saveUser(newUser);

    // 소켓 ID 매핑 저장 (나중에 끊김 처리 등을 위해 필수)
    await this.roomsRepository.saveSocketMapping(socketId, userToken);

    return newUser;
  }

  async getRoomInfo(roomUuid: string) {
    // 1. 방 정보 가져오기
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) {
      throw new NotFoundException('존재하지 않는 방입니다.');
    }

    // 2. 현재 인원 수 실시간 조회
    const currentCount = await this.roomsRepository.getUserCount(roomUuid);

    // 3. 필요한 정보만 추려서 리턴 (비밀번호 같은 게 있다면 제외)
    return {
      ...room,
      currentUserCount: currentCount,
      // config 정보 등을 풀어서 줘도 좋음
    };
  }
}
