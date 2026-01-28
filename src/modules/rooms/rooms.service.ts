// import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
// import Redis from 'ioredis';
// import { CreateRoomDto } from './dto/create-room.dto';
// import { CreateRoomResponseDto } from './dto/create-room.response.dto';
// import { RoomsRepository } from './rooms.repository';
// import { Room, RoomConfig } from '../../common/types/room.type';
// import { redisKeys } from '../../common/constants/redis.keys';
// import { User, UserRole, UserTeam } from '../../common/types/user.type';
// import { PERSONAS, JudgeConfig } from '../../modules/ai-judges/personas.constant';
// import { generateUUIDToken, generateRoomId } from '../../common/utils/id.util';

// @Injectable()
// export class RoomsService {
//   constructor(private readonly roomsRepository: RoomsRepository) {}

//   async createRoom(dto: CreateRoomDto): Promise<CreateRoomResponseDto> {
//     const roomId = generateRoomId();
//     // 방 입
//     const ownerToken = generateUUIDToken();
//     const room: Room = {
//       roomUuid: roomId,
//       ownerUserToken: ownerToken,
//       title: dto.title,
//       status: 'LOBBY',
//       config: dto.config,
//       createdAt: Date.now(),
//     };
//     const TTL_SECONDS = 60 * 60 * 12; // 12시간
//     await this.roomsRepository.save(room, TTL_SECONDS);

//     // TODO: USER 레코드(토큰 PK) 생성 후 실제 userId/token 반환.
//     return {
//       roomId,
//       token: ownerToken,
//     };
//   }

//   /**
//    * 방 입장 로직
//    */
//   async joinRoom(
//     roomUuid: string,
//     nickname: string,
//     socketId: string,
//     avatarId: number,
//     userToken?: string,
//   ): Promise<User> {
//     // 1. 방 존재 여부 확인 (Repository 사용)
//     const room = await this.roomsRepository.findById(roomUuid);
//     if (!room) {
//       throw new NotFoundException('존재하지 않는 방입니다.');
//     }
//     // ⭐️ [신규] 재접속 시도인지 확인 (토큰을 들고 왔는가?)
//     if (userToken) {
//       // 2-1. Redis에서 기존 유저 정보 조회
//       const existingUser = await this.roomsRepository.findUserByToken(roomUuid, userToken);

//       // 유저가 존재한다면? (TTL이 안 끝나서 살아있다면)
//       if (existingUser) {
//         console.log(`♻️ 재접속 감지: ${nickname} (${userToken})`);

//         // A. 소켓 ID 업데이트 (새 소켓 ID로 갱신)
//         await this.roomsRepository.updateUserSocket(roomUuid, userToken, socketId);

//         // B. 소켓 매핑 새로 저장 (새 소켓 ID -> 기존 토큰)
//         await this.roomsRepository.saveSocketMapping(socketId, roomUuid, userToken);

//         // C. TTL 해제 (삭제 예약 취소)
//         await this.roomsRepository.clearUserTTL(roomUuid, userToken);

//         // D. 유저 상태를 '접속중'으로 변경 (필요하다면 isReady 등을 조정)
//         return existingUser; // 기존 정보 반환하고 끝!
//       }
//     }

//     // 3. 인원 수 체크
//     const currentCount = await this.roomsRepository.getUserCount(roomUuid);
//     const maxUser = (room.config.teamSize || 4) * 2; // config 접근 방식 확인

//     if (currentCount >= maxUser) {
//       throw new BadRequestException('방이 꽉 찼습니다.');
//     }

//     // 4. 유저 객체 생성
//     // 첫 입장(currentCount === 0)이면 HOST, 아니면 PLAYER
//     const role: UserRole = currentCount === 0 ? 'HOST' : 'PLAYER';

//     // 호스트일 경우 기존에 룸 정보에 저장되어 있던 토큰 사용
//     const newuserToken = role === 'HOST' ? room.ownerUserToken : generateUUIDToken();

//     const publicUserId = await this.roomsRepository.nextPublicUserId(roomUuid);

//     //사용자가 지정한 아바타가 없을 경우, 랜덤으로 결정
//     const resolvedAvatarId = avatarId ?? Math.floor(Math.random() * 5) + 1;

//     const newUser: User = {
//       userToken: newuserToken,
//       publicUserId: publicUserId,
//       currentSocketId: socketId,
//       roomUuid: roomUuid,
//       nickname: nickname,
//       role: role,
//       team: 'NONE', // 팀은 나중에 선택
//       avatarId: resolvedAvatarId,
//       isReady: false, // User 인터페이스에 정의된 대로
//     };

//     // 5. Redis에 저장 (Repository 사용)
//     // 유저 정보 저장
//     await this.roomsRepository.saveUser(newUser);

//     // 소켓 ID 매핑 저장 (나중에 끊김 처리 등을 위해 필수)
//     await this.roomsRepository.saveSocketMapping(socketId, roomUuid, newuserToken);

//     return newUser;
//   }

//   async getRoomInfo(roomUuid: string) {
//     // 1. 방 정보 가져오기
//     const room = await this.roomsRepository.findById(roomUuid);
//     if (!room) {
//       throw new NotFoundException('존재하지 않는 방입니다.');
//     }

//     // 2. 현재 인원 수 실시간 조회
//     const currentCount = await this.roomsRepository.getUserCount(roomUuid);

//     // 3. 필요한 정보만 추려서 리턴 (비밀번호 같은 게 있다면 제외)
//     return {
//       ...room,
//       currentUserCount: currentCount,
//       // config 정보 등을 풀어서 줘도 좋음
//     };
//   }

//   async setUserReady(socketId: string, isReady: boolean) {
//     // 대기실 준비 상태 토글 및 최신 유저 목록 반환
//     const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
//     if (!mapping) {
//       throw new NotFoundException('User not found.');
//     }

//     const user = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
//     if (!user) {
//       throw new NotFoundException('User not found.');
//     }

//     const updatedUser: User = {
//       ...user,
//       isReady,
//     };

//     await this.roomsRepository.saveUser(updatedUser);
//     const users = await this.roomsRepository.findAllUsersInRoom(user.roomUuid);

//     return { updatedUser, users, roomUuid: user.roomUuid };
//   }

//   async joinTeam(
//     socketId: string,
//     targetPublicUserId: number,
//     slotIndex: number,
//     teamInput: string,
//   ): Promise<{ updatedUser: User; users: User[]; roomUuid: string }> {
//     const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
//     if (!mapping) {
//       throw new NotFoundException('User not found.');
//     }

//     const requester = await this.roomsRepository.findUserByToken(
//       mapping.roomUuid,
//       mapping.userToken,
//     );
//     if (!requester) {
//       throw new NotFoundException('User not found.');
//     }

//     if (requester.publicUserId !== targetPublicUserId && requester.role !== 'HOST') {
//       throw new BadRequestException('Only host can assign other users.');
//     }

//     let team: UserTeam;
//     if (teamInput === 'A' || teamInput === 'TEAM_A') {
//       team = 'TEAM_A';
//     } else if (teamInput === 'B' || teamInput === 'TEAM_B') {
//       team = 'TEAM_B';
//     } else {
//       throw new BadRequestException('Invalid team.');
//     }

//     const users = await this.roomsRepository.findAllUsersInRoom(mapping.roomUuid);
//     const target = users.find((user) => user.publicUserId === targetPublicUserId);
//     if (!target) {
//       throw new NotFoundException('Target user not found.');
//     }

//     const updatedUser: User = {
//       ...target,
//       team,
//       slotIndex,
//     };

//     await this.roomsRepository.saveUser(updatedUser);

//     const updatedUsers = users.map((user) =>
//       user.publicUserId === targetPublicUserId ? updatedUser : user,
//     );

//     return { updatedUser, users: updatedUsers, roomUuid: mapping.roomUuid };
//   }
//   // 👇 leaveRoom 구현
//   async leaveRoom(socketId: string): Promise<{ roomUuid: string; nickname: string } | null> {
//     // 1. 소켓 ID로 방ID와 토큰 찾기
//     const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
//     if (!mapping) return null; // 정보 없음

//     const { roomUuid, userToken } = mapping;

//     // 2. 유저 정보 가져오기 (닉네임 확보용)
//     const user = await this.roomsRepository.findUserByToken(roomUuid, userToken);
//     if (!user) return null;

//     // 3. 유저 삭제 (Redis)
//     await this.roomsRepository.deleteUser(roomUuid, userToken, socketId);

//     // 4. 방의 남은 인원 체크
//     const userCount = await this.roomsRepository.getUserCount(roomUuid);

//     // 5. 남은 사람이 0명이면 방 삭제 (자동 청소)
//     if (userCount === 0) {
//       await this.roomsRepository.delete(roomUuid);
//       console.log(`🧹 빈 방 삭제 완료: ${roomUuid}`);
//     }

//     return { roomUuid, nickname: user.nickname };
//   }

//   /**
//    * 소켓 연결이 끊어졌을 때 (재접속 대기 모드)
//    */
//   async handleConnectionLoss(socketId: string): Promise<void> {
//     // 1. 소켓 매핑정보 조회
//     const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
//     if (!mapping) return; // 이미 없는 유저

//     const { roomUuid, userToken } = mapping;

//     // 2. 유저 정보 업데이트 (SocketId = null)
//     // 유저가 "나간 상태"임을 표시 (인게임에서 회색 화면 처리 등에 활용 가능)
//     await this.roomsRepository.updateUserSocket(roomUuid, userToken, null);

//     // 3. TTL 설정 (예: 120초 뒤에 자동 삭제)
//     // 120초 안에 다시 들어오지 않으면 Redis가 알아서 삭제함
//     const RECONNECT_WINDOW = 120;
//     await this.roomsRepository.setUserTTL(roomUuid, userToken, RECONNECT_WINDOW);

//     // 4. 끊어진 소켓 매핑 정보는 삭제 (재접속하면 새 소켓 ID를 받으므로)
//     await this.roomsRepository.deleteSocketMapping(socketId);

//     console.log(`⏳ 유저 연결 끊김 (재접속 대기 ${RECONNECT_WINDOW}초): ${userToken}`);
//   }
// }

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsRepository } from './rooms.repository';
import { Room } from './types/room.type';
import { User, UserRole, UserTeam } from '../users/types/user.type'; // 🚨 types/user.type.ts가 수정되어 있어야 함
import { generateUUIDToken, generateRoomId } from '../../common/utils/id.util';
import { GamesService } from '../games/games.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly gamesService: GamesService,
  ) {}

  async createRoom(dto: CreateRoomDto): Promise<CreateRoomResponseDto> {
    const roomId = generateRoomId();
    const ownerToken = generateUUIDToken();

    const room: Room = {
      roomUuid: roomId,
      ownerUserToken: ownerToken,
      title: dto.title,
      status: 'WAITING', // LOBBY -> WAITING (프론트/백엔드 통일 권장)
      config: dto.config,
      createdAt: Date.now(),
    };

    const TTL_SECONDS = 60 * 60 * 12; // 12시간
    await this.roomsRepository.save(room, TTL_SECONDS);

    return {
      roomId,
      token: ownerToken,
    };
  }

  /**
   * 🚪 방 입장 로직
   */
  async joinRoom(
    roomUuid: string,
    nickname: string,
    socketId: string,
    avatarId: number,
    userToken?: string,
  ): Promise<User> {
    // 1. 방 존재 여부 확인
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) {
      throw new NotFoundException('존재하지 않는 방입니다.');
    }

    // 2. 재접속 시도 확인
    if (userToken) {
      const existingUser = await this.roomsRepository.findUserByToken(roomUuid, userToken);
      if (existingUser) {
        console.log(`♻️ 재접속 감지: ${nickname} (${userToken})`);

        await this.roomsRepository.updateUserSocket(roomUuid, userToken, socketId);
        await this.roomsRepository.saveSocketMapping(socketId, roomUuid, userToken);
        await this.roomsRepository.clearUserTTL(roomUuid, userToken);

        return existingUser;
      }
    }

    // 3. 인원 수 체크

    const currentCount = await this.roomsRepository.getUserCount(roomUuid);
    // config에 따라 최대 인원 계산 (기본값 처리)
    const maxUser = room.config.maxPlayers || 8;

    if (currentCount >= maxUser) {
      throw new BadRequestException('방이 꽉 찼습니다.');
    }

    // ⭐️ 4. 역할(Role) 및 호스트(isHost) 결정 [핵심 변경]
    const isFirstUser = currentCount === 0;
    const isHost = isFirstUser; // 첫 입장이면 무조건 호스트

    // 호스트는 자동으로 PLAYER & A팀 0번 슬롯
    // 게스트는 AUDIENCE(관전) & 팀 없음
    const role: UserRole = isHost ? 'PLAYER' : 'AUDIENCE';
    const team: UserTeam = isHost ? 'A' : null;
    const slotIndex: number | null = isHost ? 0 : null;

    // 호스트면 방 생성 때 만든 토큰 사용, 아니면 새로 발급
    const newUserToken = isHost ? room.ownerUserToken : generateUUIDToken();
    const publicUserId = await this.roomsRepository.nextPublicUserId(roomUuid);

    // 아바타 랜덤 설정
    const resolvedAvatarId = avatarId ?? Math.floor(Math.random() * 5) + 1;

    const newUser: User = {
      userToken: newUserToken,
      publicUserId: publicUserId,
      currentSocketId: socketId,
      roomUuid: roomUuid,
      nickname: nickname,

      // ✨ 변경된 필드들
      role: role,
      isHost: isHost, // boolean 값
      team: team,
      slotIndex: slotIndex,

      avatarId: resolvedAvatarId,
      isReady: false,
    };

    // 5. Redis 저장
    await this.roomsRepository.saveUser(newUser);
    await this.roomsRepository.saveSocketMapping(socketId, roomUuid, newUserToken);

    return newUser;
  }

  async getRoomInfo(roomUuid: string) {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) {
      throw new NotFoundException('존재하지 않는 방입니다.');
    }
    const currentCount = await this.roomsRepository.getUserCount(roomUuid);

    return {
      ...room,
      currentUserCount: currentCount,
    };
  }

  async getUsersInRoom(roomUuid: string): Promise<User[]> {
    //방의 유저 정보 조회
    return this.roomsRepository.findAllUsersInRoom(roomUuid);
  }

  async setUserReady(socketId: string, isReady: boolean) {
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) throw new NotFoundException('User not found.');

    const user = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
    if (!user) throw new NotFoundException('User not found.');

    const updatedUser: User = {
      ...user,
      isReady,
    };

    await this.roomsRepository.saveUser(updatedUser);
    const users = await this.roomsRepository.findAllUsersInRoom(user.roomUuid);

    return { updatedUser, users, roomUuid: user.roomUuid };
  }

  async updateRoomConfig(socketId: string, newConfig: any) {
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    const { roomUuid, userToken } = mapping;
    const user = await this.roomsRepository.findUserByToken(roomUuid, userToken);
    if (!user.isHost) throw new BadRequestException('방장만 설정을 변경할 수 있습니다.');

    const room = await this.roomsRepository.findById(roomUuid);

    // 설정 업데이트 및 저장
    room.config = { ...room.config, ...newConfig };
    await this.roomsRepository.save(room); // TTL 유지 로직 주의

    return room;
  }

  /**
   * 🏃 팀/자리 변경 로직
   */
  async joinTeam(
    socketId: string,
    targetPublicUserId: number,
    slotIndex: number,
    teamInput: string,
  ): Promise<{ updatedUser: User; users: User[]; roomUuid: string }> {
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) throw new NotFoundException('User not found.');

    const requester = await this.roomsRepository.findUserByToken(
      mapping.roomUuid,
      mapping.userToken,
    );
    if (!requester) throw new NotFoundException('User not found.');

    // ⭐️ [변경] 권한 체크: 본인이거나 '방장(isHost)'이어야 함
    if (requester.publicUserId !== targetPublicUserId && !requester.isHost) {
      throw new BadRequestException('Only host can assign other users.');
    }

    // ⭐️ [변경] 팀 이름 단순화 ('A' or 'B')
    let team: UserTeam;
    if (teamInput === 'A' || teamInput === 'B') {
      team = teamInput as UserTeam;
    } else {
      throw new BadRequestException('Invalid team. Use "A" or "B".');
    }

    const users = await this.roomsRepository.findAllUsersInRoom(mapping.roomUuid);
    const target = users.find((user) => user.publicUserId === targetPublicUserId);
    if (!target) throw new NotFoundException('Target user not found.');

    // 🚨 [추가] 해당 팀의 해당 슬롯이 비어있는지 확인
    const isSlotTaken = users.some((u) => u.team === team && u.slotIndex === slotIndex);
    if (isSlotTaken) {
      throw new BadRequestException('이미 다른 유저가 있는 자리입니다.');
    }

    // ⭐️ [변경] 팀에 배정되면 역할은 무조건 'PLAYER'가 됨
    const updatedUser: User = {
      ...target,
      role: 'PLAYER',
      team,
      slotIndex,
    };

    await this.roomsRepository.saveUser(updatedUser);

    const updatedUsers = users.map((user) =>
      user.publicUserId === targetPublicUserId ? updatedUser : user,
    );

    return { updatedUser, users: updatedUsers, roomUuid: mapping.roomUuid };
  }

  /**
   * 🚪 팀 슬롯 퇴장 (PLAYER -> AUDIENCE)
   * - 본인 또는 방장만 퇴장 처리 가능
   * - 팀은 null로 초기화, role은 AUDIENCE로 전환
   */
  async leaveTeam(
    socketId: string,
    targetPublicUserId: number,
    slotIndex: number,
    teamInput: string,
  ): Promise<{ updatedUser: User; users: User[]; roomUuid: string }> {
    // 1) 요청자 식별
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) throw new NotFoundException('User not found.');

    const requester = await this.roomsRepository.findUserByToken(
      mapping.roomUuid,
      mapping.userToken,
    );
    if (!requester) throw new NotFoundException('User not found.');

    // 2) 권한 체크: 본인이 아니면 방장만 가능
    if (requester.publicUserId !== targetPublicUserId && !requester.isHost) {
      throw new BadRequestException('Only host can remove other users.');
    }

    // 3) 입력된 team 값은 A/B만 허용 (형식 검증용)
    if (teamInput !== 'A' && teamInput !== 'B') {
      throw new BadRequestException('Invalid team. Use "A" or "B".');
    }

    // 4) 대상 유저 조회
    const users = await this.roomsRepository.findAllUsersInRoom(mapping.roomUuid);
    const target = users.find((user) => user.publicUserId === targetPublicUserId);
    if (!target) throw new NotFoundException('Target user not found.');

    // 5) 팀에서 내보내고 관전자로 전환
    const updatedUser: User = {
      ...target,
      role: 'AUDIENCE',
      team: null,
      // 명세 상 slotIndex가 유지되므로 전달받은 값으로 보존
      slotIndex,
    };

    await this.roomsRepository.saveUser(updatedUser);

    const updatedUsers = users.map((user) =>
      user.publicUserId === targetPublicUserId ? updatedUser : user,
    );

    return { updatedUser, users: updatedUsers, roomUuid: mapping.roomUuid };
  }

  /**
   * 🚫 유저 강퇴 로직
   * - 방장만 가능 (isHost 체크)
   * - 대상 유저의 Redis 데이터와 소켓 매핑을 함께 제거
   */
  async kickUser(
    socketId: string,
    targetPublicUserId: number,
  ): Promise<{ kickedPublicUserId: number; users: User[]; roomUuid: string }> {
    // 1) 요청자(방장) 식별
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) throw new NotFoundException('User not found.');

    const requester = await this.roomsRepository.findUserByToken(
      mapping.roomUuid,
      mapping.userToken,
    );
    if (!requester) throw new NotFoundException('User not found.');

    // 2) 권한 체크: 방장만 강퇴 가능
    if (!requester.isHost) {
      throw new BadRequestException('Only host can kick users.');
    }

    // 3) 대상 유저 조회
    const users = await this.roomsRepository.findAllUsersInRoom(mapping.roomUuid);
    const target = users.find((user) => user.publicUserId === targetPublicUserId);
    if (!target) throw new NotFoundException('Target user not found.');

    // 4) 대상 유저 데이터/소켓 매핑 삭제
    await this.roomsRepository.deleteUserByToken(
      mapping.roomUuid,
      target.userToken,
      target.currentSocketId,
    );

    // 5) 최신 유저 목록 반환 (강퇴된 유저 제외)
    const updatedUsers = users.filter((user) => user.publicUserId !== targetPublicUserId);

    return {
      kickedPublicUserId: targetPublicUserId,
      users: updatedUsers,
      roomUuid: mapping.roomUuid,
    };
  }

  async leaveRoom(socketId: string): Promise<{ roomUuid: string; nickname: string } | null> {
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) return null;

    const { roomUuid, userToken } = mapping;
    const user = await this.roomsRepository.findUserByToken(roomUuid, userToken);
    if (!user) return null;

    await this.roomsRepository.deleteUser(roomUuid, userToken, socketId);

    const userCount = await this.roomsRepository.getUserCount(roomUuid);
    if (userCount === 0) {
      await this.roomsRepository.delete(roomUuid);
      console.log(`🧹 빈 방 삭제 완료: ${roomUuid}`);
    }

    return { roomUuid, nickname: user.nickname };
  }

  async handleConnectionLoss(socketId: string): Promise<void> {
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) return;

    const { roomUuid, userToken } = mapping;

    await this.roomsRepository.updateUserSocket(roomUuid, userToken, null);

    const RECONNECT_WINDOW = 120;
    await this.roomsRepository.setUserTTL(roomUuid, userToken, RECONNECT_WINDOW);
    await this.roomsRepository.deleteSocketMapping(socketId);

    console.log(`⏳ 유저 연결 끊김 (재접속 대기 ${RECONNECT_WINDOW}초): ${userToken}`);
  }

  /**
   * 🤖 [신규] 빈 슬롯 자동 채우기
   */
  async autoFillSlots(socketId: string) {
    // 1. 권한 확인
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) throw new NotFoundException();

    const requester = await this.roomsRepository.findUserByToken(
      mapping.roomUuid,
      mapping.userToken,
    );
    if (!requester.isHost) throw new BadRequestException('방장만 자동 채우기를 할 수 있습니다.');

    const roomUuid = mapping.roomUuid;
    const room = await this.roomsRepository.findById(roomUuid);
    const users = await this.roomsRepository.findAllUsersInRoom(roomUuid);

    // 2. 빈 슬롯 파악
    const TEAM_SIZE = room.config.storytellerCount || 4; // 기본값 4
    const emptySlotsA: number[] = [];
    const emptySlotsB: number[] = [];

    for (let i = 0; i < TEAM_SIZE; i++) {
      if (!users.some((u) => u.team === 'A' && u.slotIndex === i)) emptySlotsA.push(i);
      if (!users.some((u) => u.team === 'B' && u.slotIndex === i)) emptySlotsB.push(i);
    }

    const totalNeeded = emptySlotsA.length + emptySlotsB.length;
    if (totalNeeded === 0) {
      throw new BadRequestException('빈 슬롯이 없습니다.');
    }

    // 3. 관객(AUDIENCE) 리스트 확보 및 셔플
    const audience = users.filter((u) => u.role === 'AUDIENCE');

    // (선택사항) 관객이 부족하면 에러? 아니면 있는 만큼만? -> 보통은 부족하면 에러 띄우는 게 낫습니다.
    if (audience.length < totalNeeded) {
      throw new BadRequestException(
        `관객이 부족합니다. (필요: ${totalNeeded}, 현재 관객: ${audience.length})`,
      );
    }

    const shuffledAudience = this.shuffleArray([...audience]);
    const updatedUsersList: User[] = []; // 업데이트된 유저들 저장용

    // 4. 슬롯 채우기 (DB 업데이트)
    // Team A
    for (const slot of emptySlotsA) {
      const targetUser = shuffledAudience.pop();
      if (targetUser) {
        targetUser.role = 'PLAYER';
        targetUser.team = 'A';
        targetUser.slotIndex = slot;
        targetUser.isReady = false; // 강제로 들어갔으니 준비 해제
        await this.roomsRepository.saveUser(targetUser);
        updatedUsersList.push(targetUser);
      }
    }
    // Team B
    for (const slot of emptySlotsB) {
      const targetUser = shuffledAudience.pop();
      if (targetUser) {
        targetUser.role = 'PLAYER';
        targetUser.team = 'B';
        targetUser.slotIndex = slot;
        targetUser.isReady = false;
        await this.roomsRepository.saveUser(targetUser);
        updatedUsersList.push(targetUser);
      }
    }

    // 5. 전체 유저 리스트 다시 조회 (방송용)
    const allUsers = await this.roomsRepository.findAllUsersInRoom(roomUuid);

    return { updatedUsers: allUsers, roomUuid };
  }

  /**
   * 🚀 [변경] 게임 시작 (엄격한 검증)
   * - 슬롯이 꽉 찼는지 확인
   * - 모든 플레이어가 Ready 상태인지 확인
   */
  async startGame(socketId: string) {
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) throw new NotFoundException();

    const requester = await this.roomsRepository.findUserByToken(
      mapping.roomUuid,
      mapping.userToken,
    );
    if (!requester.isHost) throw new BadRequestException('방장만 시작할 수 있습니다.');

    const roomUuid = mapping.roomUuid;
    const room = await this.roomsRepository.findById(roomUuid);
    const users = await this.roomsRepository.findAllUsersInRoom(roomUuid);
    const TEAM_SIZE = room.config.storytellerCount || 4;

    // 1. 슬롯 검증 (풀방 체크)
    const teamAUsers = users.filter((u) => u.team === 'A');
    const teamBUsers = users.filter((u) => u.team === 'B');

    if (teamAUsers.length !== TEAM_SIZE || teamBUsers.length !== TEAM_SIZE) {
      throw new BadRequestException(
        `모든 팀 슬롯이 채워져야 시작할 수 있습니다. (설정: ${TEAM_SIZE}인)`,
      );
    }

    // 2. 레디 검증 (전원 레디 체크)
    // 플레이어(팀이 있는 사람)만 체크합니다. 방장은 제외할지 포함할지 결정해야 함.
    // 보통 방장은 시작 버튼 누르는 사람이니 Ready가 true여야 하거나, 체크에서 제외합니다.
    // 여기서는 "방장 포함 모든 플레이어 Ready"로 구현합니다.
    const notReadyPlayers = users.filter((u) => u.role === 'PLAYER' && !u.isReady);

    if (notReadyPlayers.length > 0) {
      // 누구누구 안 했는지 알려주면 좋음
      const names = notReadyPlayers.map((u) => u.nickname).join(', ');
      throw new BadRequestException(`준비하지 않은 유저가 있습니다: ${names}`);
    }

    // 3. 게임 상태 초기화 및 DB 저장
    // 팀원 순서대로 ID 추출
    const sortedTeamA = teamAUsers
      .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
      .map((u) => u.publicUserId.toString());
    const sortedTeamB = teamBUsers
      .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
      .map((u) => u.publicUserId.toString());

    console.log(`🚀 게임 시작 조건 만족! A: ${sortedTeamA}, B: ${sortedTeamB}`);

    // TODO: GameState DB 초기화 로직 (this.gameStateRepository.initGame...)
    // GameState 초기화 호출
    await this.gamesService.initGame(roomUuid, sortedTeamA, sortedTeamB);

    // 4. 방 상태 변경
    room.status = 'PLAYING';
    await this.roomsRepository.save(room);

    return { roomUuid };
  }

  // 배열 섞기 유틸
  private shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * 🔍 소켓 ID로 유저 정보 찾기 (Gateway에서 사용)
   */
  async getUserBySocket(socketId: string): Promise<User> {
    // 1. 매핑 정보 조회
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) throw new NotFoundException('Socket mapping not found');

    // 2. 유저 상세 정보 조회
    const user = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
    if (!user) throw new NotFoundException('User not found');

    return user;
  }
}
