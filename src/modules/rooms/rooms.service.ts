import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsRepository } from './rooms.repository';
import { Room, RoomStatus } from './types/room.type';
import { User, UserRole, UserTeam } from '../users/types/user.type'; // 🚨 types/user.type.ts가 수정되어 있어야 함
import { generateUUIDToken, generateRoomId } from '../../common/utils/id.util';
import { GamesService } from '../games/games.service';
import { TimerService } from '../timer/timer.service';
import { AiJudgeService } from '../ai-judges/ai-judges.service';
import { PersonaResult } from '../ai-judges/dto/judge.dto';
import { AiJudgeScore, VoteOutcome } from '../games/types/vote-outcome.type';

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly gamesService: GamesService,
    private readonly timerService: TimerService,
    private readonly aiJudgeService: AiJudgeService,
  ) {}

  async createRoom(dto: CreateRoomDto): Promise<CreateRoomResponseDto> {
    const roomUuid = generateRoomId();
    const ownerToken = generateUUIDToken();

    const room: Room = {
      roomUuid: roomUuid,
      ownerUserToken: ownerToken,
      title: dto.title,
      status: 'WAITING', // LOBBY -> WAITING (프론트/백엔드 통일 권장)
      config: dto.config,
      createdAt: Date.now(),
    };

    const TTL_SECONDS = 60 * 60 * 12; // 12시간
    await this.roomsRepository.save(room, TTL_SECONDS);

    return {
      roomId: roomUuid, // 👈 클라이언트는 소켓 연결 시 이 UUID를 사용합니다.
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
    userToken?: string, // 클라이언트가 가져온 토큰 (방장이면 createRoom 때 받은 것)
  ): Promise<User> {
    // 1. 방 존재 여부 확인
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) {
      throw new NotFoundException('존재하지 않는 방입니다.');
    }

    // 2. 재접속 시도 확인 (DB에 유저 정보가 있는지 체크)
    // 아까 만든 findUserByTokenOrNull 사용
    if (userToken) {
      const existingUser = await this.roomsRepository.findUserByTokenOrNull(roomUuid, userToken);
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
    const maxUser = room.config.maxPlayers || 8;

    if (currentCount >= maxUser) {
      throw new BadRequestException('방이 꽉 찼습니다.');
    }

    // 방에 사람이 0명이면, 지금 들어오는 사람이 무조건 방장입니다.
    const isFirstUser = currentCount === 0;
    const isHost = isFirstUser;

    // - 클라이언트가 토큰을 들고 왔으면(createRoom 직후) 그 토큰 사용
    // - 빈손으로 왔으면(초대 링크 등) 새로 발급
    const newUserToken = userToken ? userToken : generateUUIDToken();

    // 역할 및 팀 설정
    // - 처음엔 팀/슬롯 없음, 역할은 관전자(AUDIENCE)로 시작
    // - 단, 호스트 권한(isHost)은 True
    const role: UserRole = 'AUDIENCE';
    const team: UserTeam = null;
    const slotIndex: number | null = null;

    const publicUserId = await this.roomsRepository.nextPublicUserId(roomUuid);

    // 아바타 랜덤 (없으면)
    const resolvedAvatarId = avatarId ?? Math.floor(Math.random() * 5) + 1;

    const newUser: User = {
      userToken: newUserToken,
      publicUserId: publicUserId,
      currentSocketId: socketId,
      roomUuid: roomUuid,
      nickname: nickname,

      role: role,
      isHost: isHost,
      team: team,
      slotIndex: slotIndex,

      avatarId: resolvedAvatarId,
      isReady: false,
    };

    // 5. Redis 저장
    await this.roomsRepository.saveUser(newUser);
    await this.roomsRepository.saveSocketMapping(socketId, roomUuid, newUserToken);

    // 유저 리스트에 추가
    await this.roomsRepository.addUserToRoomList(roomUuid, newUserToken);

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

  async getRoomById(roomUuid: string): Promise<Room> {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) {
      throw new NotFoundException('존재하지 않는 방입니다.');
    }
    return room;
  }

  async updateRoomStatus(roomUuid: string, status: RoomStatus): Promise<Room> {
    const room = await this.roomsRepository.findById(roomUuid);
    if (!room) {
      throw new NotFoundException('존재하지 않는 방입니다.');
    }

    room.status = status;
    await this.roomsRepository.save(room);

    return room;
  }

  async getUsersInRoom(roomUuid: string): Promise<User[]> {
    //방의 유저 정보 조회
    return this.roomsRepository.getUsersInRoom(roomUuid);
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
    const users = await this.roomsRepository.getUsersInRoom(user.roomUuid);

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

    const users = await this.roomsRepository.getUsersInRoom(mapping.roomUuid);
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
    const users = await this.roomsRepository.getUsersInRoom(mapping.roomUuid);
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
    const users = await this.roomsRepository.getUsersInRoom(mapping.roomUuid);
    const target = users.find((user) => user.publicUserId === targetPublicUserId);
    if (!target) throw new NotFoundException('Target user not found.');

    // 4) 대상 유저 데이터/소켓 매핑 삭제
    await this.roomsRepository.deleteUser(
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
    const users = await this.roomsRepository.getUsersInRoom(roomUuid);

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
    const allUsers = await this.roomsRepository.getUsersInRoom(roomUuid);

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
    const users = await this.roomsRepository.getUsersInRoom(roomUuid);
    const TEAM_SIZE = room.config.storytellerCount || 4;

    // 1. 슬롯 검증 (풀방 체크)
    const teamAUsers = users.filter((u) => u.team === 'A');
    const teamBUsers = users.filter((u) => u.team === 'B');

    // if (teamAUsers.length !== TEAM_SIZE || teamBUsers.length !== TEAM_SIZE) {
    //   throw new BadRequestException(
    //     `모든 팀 슬롯이 채워져야 시작할 수 있습니다. (설정: ${TEAM_SIZE}인)`,
    //   );
    // }

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

    return { roomUuid };
  }

  async startGameFlow(
    roomUuid: string,
    emitStatus: (status: RoomStatus, durationMs: number) => void,
    emitVoteResult?: (outcome: VoteOutcome) => void,
  ) {
    // 게임 흐름 타이머는 Rooms 도메인에서 관리한다.
    // 이유: RoomStatus 변경과 강하게 연결되어 있고, 순환 참조를 피하기 위함.
    const room = await this.getRoomById(roomUuid);
    const animationMs = this.getAnimationDurationMs();
    const roundMs = room.config.roundTime * 1000;
    const votingMs = room.config.voteTime * 1000;

    // 1) 카드/AI 배정 애니메이션 단계 알림
    await this.updateRoomStatus(roomUuid, 'WAITING');
    emitStatus('WAITING', animationMs);

    // 2) 애니메이션 종료 후 라운드 타이머 시작
    this.timerService.schedule({ roomUuid, status: 'WAITING', delayMs: animationMs }, () => {
      void this.startRoundFlow(roomUuid, roundMs, votingMs, emitStatus, emitVoteResult);
    });
  }

  private async startRoundFlow(
    roomUuid: string,
    roundMs: number,
    votingMs: number,
    emitStatus: (status: RoomStatus, durationMs: number) => void,
    emitVoteResult?: (outcome: VoteOutcome) => void,
  ) {
    // 3) 라운드 진행 단계
    await this.updateRoomStatus(roomUuid, 'PLAYING');
    emitStatus('PLAYING', roundMs);
    this.timerService.schedule({ roomUuid, status: 'PLAYING', delayMs: roundMs }, () => {
      // 4) 투표 단계
      let aiVotesPromise: Promise<AiJudgeScore[] | null> = Promise.resolve(null);

      void this.updateRoomStatus(roomUuid, 'VOTING').then(() => {
        emitStatus('VOTING', votingMs);

        // VOTING 진입 시점에 AI 평가를 시작한다.
        // 평가 결과는 VOTING 종료 시점에 관객 투표와 합산한다.
        aiVotesPromise = this.buildAiJudgeScores(roomUuid);
      });

      this.timerService.schedule({ roomUuid, status: 'VOTING', delayMs: votingMs }, () => {
        void this.finishVoting(roomUuid, aiVotesPromise, emitVoteResult, emitStatus);
      });
    });
  }

  private getAnimationDurationMs() {
    const fixedMs = 15_000;
    return fixedMs;
  }

  private static readonly AI_VOTING_COUNT = 1;

  private async buildAiJudgeScores(roomUuid: string): Promise<AiJudgeScore[] | null> {
    // 스토리 제출 시 저장해 둔 평가 입력을 가져온다.
    // 입력이 없으면 AI 평가는 건너뛰고 관객 투표만 사용한다.
    const teamAEvaluateDto = this.gamesService.getEvaluateDto(roomUuid, 'A');
    const teamBEvaluateDto = this.gamesService.getEvaluateDto(roomUuid, 'B');
    if (!teamAEvaluateDto || !teamBEvaluateDto) {
      return null;
    }

    const [teamAResults, teamBResults] = await Promise.all([
      this.aiJudgeService.evaluateRoom(roomUuid, teamAEvaluateDto),
      this.aiJudgeService.evaluateRoom(roomUuid, teamBEvaluateDto),
    ]);

    const teamBMap = new Map(
      teamBResults.map((result: PersonaResult) => [result.personaName, result]),
    );

    return teamAResults
      .map((aResult: PersonaResult) => {
        const bResult = teamBMap.get(aResult.personaName);
        if (!bResult) return null;

        return {
          judgeName: aResult.personaName,
          scoreTeamA: aResult.score,
          scoreTeamB: bResult.score,
        } as AiJudgeScore;
      })
      .filter((result): result is AiJudgeScore => result !== null);
  }

  private async finishVoting(
    roomUuid: string,
    aiVotesPromise: Promise<AiJudgeScore[] | null>,
    emitVoteResult: ((outcome: VoteOutcome) => void) | undefined,
    emitStatus: (status: RoomStatus, durationMs: number) => void,
  ) {
    // VOTING 종료 시점의 최종 집계:
    // 1) 관객 투표 집계
    // 2) AI 평가 결과 가중치 반영
    // 3) 승자 결정 및 브로드캐스트
    const aiScores = await aiVotesPromise;
    let outcome = this.gamesService.getVoteOutcome(roomUuid);

    if (aiScores && aiScores.length > 0) {
      outcome = this.gamesService.applyAiJudgeVotes(
        roomUuid,
        aiScores,
        RoomsService.AI_VOTING_COUNT,
      );
    }

    if (emitVoteResult) {
      emitVoteResult(outcome);
    }

    // 게임 종료 상태로 전환
    await this.updateRoomStatus(roomUuid, 'ENDED');
    emitStatus('ENDED', 0);
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
