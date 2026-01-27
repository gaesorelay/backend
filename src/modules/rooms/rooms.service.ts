import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import Redis from 'ioredis';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsRepository } from './rooms.repository';
import { Room, RoomConfig } from '../../common/types/room.type';
import { redisKeys } from '../../common/constants/redis.keys';
import { PERSONAS, JudgeConfig } from '../../modules/ai-judges/personas.constant';
import { User, UserRole } from '../../common/types/user.type';
import { generateUUIDToken, generateRoomId } from '../../common/utils/id.util';

@Injectable()
export class RoomsService {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  async createRoom(dto: CreateRoomDto): Promise<CreateRoomResponseDto> {
    const roomId = generateRoomId();
    // 방 입
    const ownerToken = generateUUIDToken();
    const room: Room = {
      roomUuid: roomId,
      ownerUserToken: ownerToken,
      title: dto.title,
      status: 'LOBBY',
      config: dto.config,
      createdAt: Date.now(),
    };
    const TTL_SECONDS = 60 * 60 * 12; // 12시간
    await this.roomsRepository.save(room, TTL_SECONDS);

    // TODO: USER 레코드(토큰 PK) 생성 후 실제 userId/token 반환.
    return {
      roomId,
      token: ownerToken,
    };
  }

  /**
   * 방 입장 로직
   */
  async joinRoom(
    roomUuid: string,
    nickname: string,
    socketId: string,
    userToken?: string,
  ): Promise<User> {
    // 1. 방 존재 여부 확인 (Repository 사용)
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) {
      throw new NotFoundException('존재하지 않는 방입니다.');
    }
    // ⭐️ [신규] 재접속 시도인지 확인 (토큰을 들고 왔는가?)
    if (userToken) {
      // 2-1. Redis에서 기존 유저 정보 조회
      const existingUser = await this.roomsRepository.findUserByToken(roomUuid, userToken);

      // 유저가 존재한다면? (TTL이 안 끝나서 살아있다면)
      if (existingUser) {
        console.log(`♻️ 재접속 감지: ${nickname} (${userToken})`);

        // A. 소켓 ID 업데이트 (새 소켓 ID로 갱신)
        await this.roomsRepository.updateUserSocket(roomUuid, userToken, socketId);

        // B. 소켓 매핑 새로 저장 (새 소켓 ID -> 기존 토큰)
        await this.roomsRepository.saveSocketMapping(socketId, roomUuid, userToken);

        // C. TTL 해제 (삭제 예약 취소)
        await this.roomsRepository.clearUserTTL(roomUuid, userToken);

        // D. 유저 상태를 '접속중'으로 변경 (필요하다면 isReady 등을 조정)
        return existingUser; // 기존 정보 반환하고 끝!
      }
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

    // 호스트일 경우 기존에 룸 정보에 저장되어 있던 토큰 사용
    const newuserToken = role === 'HOST' ? room.ownerUserToken : generateUUIDToken();

    const newUser: User = {
      userToken: newuserToken,
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
    await this.roomsRepository.saveSocketMapping(socketId, roomUuid, newuserToken);

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

  async setUserReady(socketId: string, isReady: boolean) {
    // 대기실 준비 상태 토글 및 최신 유저 목록 반환
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) {
      throw new NotFoundException('User not found.');
    }

    const user = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const updatedUser: User = {
      ...user,
      isReady,
    };

    await this.roomsRepository.saveUser(updatedUser);
    const users = await this.roomsRepository.findAllUsersInRoom(user.roomUuid);

    return { updatedUser, users, roomUuid: user.roomUuid };
  }

  /**
   * 게임 시작 (임시 구현)
   * 1. 심사위원 3명 랜덤 선정
   * 2. Redis에 선정된 심사위원 이름 저장
   * 3. 선정된 심사위원 정보 반환
   */
  async startGame(roomUuid: string) {
    // 1. 방 상태 확인 (생략 가능)
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) throw new BadRequestException('방이 없습니다.');

    // 2. 랜덤 심사위원 3명 선정 로직
    // 원본 배열 복사 (원본 훼손 방지)
    const tempPersonas = [...PERSONAS];
    const selectedJudges: JudgeConfig[] = [];

    // Fisher-Yates Shuffle 응용 (3개만 뽑고 종료)
    for (let i = 0; i < 3; i++) {
      if (tempPersonas.length === 0) break;

      // 남은 것 중에서 랜덤 인덱스 선택
      const randomIdx = Math.floor(Math.random() * tempPersonas.length);

      // 선택된 요소를 결과 배열에 넣음
      selectedJudges.push(tempPersonas[randomIdx]);

      // 선택된 요소를 임시 배열에서 제거 (중복 방지)
      tempPersonas.splice(randomIdx, 1);
    }

    // 3. 선정된 심사위원 이름(name) 목록 추출
    const judgeNames = selectedJudges.map((judge) => judge.name);

    // 4. Redis에 저장 (나중에 심사할 때 꺼내 쓰기 위함)
    // Repository에 saveRoomJudges 메서드가 필요함
    await this.roomsRepository.saveRoomJudges(roomUuid, judgeNames);

    // 5. 프론트엔드에 보여줄 정보 반환 (이미지, 이름 등)
    return selectedJudges;
  }

  // 👇 leaveRoom 구현
  async leaveRoom(socketId: string): Promise<{ roomUuid: string; nickname: string } | null> {
    // 1. 소켓 ID로 방ID와 토큰 찾기
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) return null; // 정보 없음

    const { roomUuid, userToken } = mapping;

    // 2. 유저 정보 가져오기 (닉네임 확보용)
    const user = await this.roomsRepository.findUserByToken(roomUuid, userToken);
    if (!user) return null;

    // 3. 유저 삭제 (Redis)
    await this.roomsRepository.deleteUser(roomUuid, userToken, socketId);

    // 4. 방의 남은 인원 체크
    const userCount = await this.roomsRepository.getUserCount(roomUuid);

    // 5. 남은 사람이 0명이면 방 삭제 (자동 청소)
    if (userCount === 0) {
      await this.roomsRepository.delete(roomUuid);
      console.log(`🧹 빈 방 삭제 완료: ${roomUuid}`);
    }

    return { roomUuid, nickname: user.nickname };
  }

  /**
   * 소켓 연결이 끊어졌을 때 (재접속 대기 모드)
   */
  async handleConnectionLoss(socketId: string): Promise<void> {
    // 1. 소켓 매핑정보 조회
    const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
    if (!mapping) return; // 이미 없는 유저

    const { roomUuid, userToken } = mapping;

    // 2. 유저 정보 업데이트 (SocketId = null)
    // 유저가 "나간 상태"임을 표시 (인게임에서 회색 화면 처리 등에 활용 가능)
    await this.roomsRepository.updateUserSocket(roomUuid, userToken, null);

    // 3. TTL 설정 (예: 120초 뒤에 자동 삭제)
    // 120초 안에 다시 들어오지 않으면 Redis가 알아서 삭제함
    const RECONNECT_WINDOW = 120;
    await this.roomsRepository.setUserTTL(roomUuid, userToken, RECONNECT_WINDOW);

    // 4. 끊어진 소켓 매핑 정보는 삭제 (재접속하면 새 소켓 ID를 받으므로)
    await this.roomsRepository.deleteSocketMapping(socketId);

    console.log(`⏳ 유저 연결 끊김 (재접속 대기 ${RECONNECT_WINDOW}초): ${userToken}`);
  }
}
