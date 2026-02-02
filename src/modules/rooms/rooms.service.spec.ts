import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { User } from '../users/types/user.type';
import { Room } from './types/room.type';
import * as idUtil from '../../common/utils/id.util';

// 의존성 주입을 위한 가짜 객체 타입 정의 (any로 처리하여 테스트 복잡도 감소)
const mockGamesService = {} as any;
const mockTimerService = {} as any;
const mockAiJudgeService = {} as any;

describe('RoomsService.joinTeam', () => {
  let service: RoomsService;
  let roomsRepository: {
    getMappingBySocketId: jest.Mock;
    findUserByToken: jest.Mock;
    findUserByTokenOrNull: jest.Mock;
    getUsersInRoom: jest.Mock;
    saveUser: jest.Mock;
    addUserToRoomList: jest.Mock;
    isIPBannedInRoom: jest.Mock;
  };

  const roomUuid = 'ROOM123';

  beforeEach(() => {
    roomsRepository = {
      getMappingBySocketId: jest.fn(),
      findUserByToken: jest.fn(),
      findUserByTokenOrNull: jest.fn(),
      getUsersInRoom: jest.fn(),
      saveUser: jest.fn(),
      addUserToRoomList: jest.fn(),
      isIPBannedInRoom: jest.fn(),
    };
    // ⭐️ [수정] gamesService, timerService 추가 주입
    service = new RoomsService(
      roomsRepository as unknown as any,
      mockGamesService,
      mockTimerService,
      mockAiJudgeService,
    );
  });

  // 방장이 다른 유저를 팀에 배정하는 정상 케이스
  // 방장이 다른 유저를 팀에 배정하는 정상 케이스
  it('assigns team when requester is host', async () => {
    const requester: User = {
      userToken: 'token-host',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'host',
      role: 'PLAYER',
      isHost: true,
      team: 'A',
      slotIndex: 0,
      avatarId: 1,
      isReady: false,
      IP: '111.111.111.111',
    };
    const target: User = {
      userToken: 'token-user',
      publicUserId: 2,
      currentSocketId: 'socket2',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 2,
      isReady: false,
      IP: '111.111.111.111',
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester, target]);

    const result = await service.joinTeam('socket1', 2, 1, 'A');

    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(roomsRepository.saveUser.mock.calls[0][0]).toMatchObject({
      publicUserId: 2,
      team: 'A',
      role: 'PLAYER',
      slotIndex: 1,
    });
    expect(result.roomUuid).toBe(roomUuid);
    expect(result.updatedUser.publicUserId).toBe(2);
    expect(result.updatedUser.team).toBe('A');
  });

  // 일반 유저가 다른 유저를 배정하려고 하면 거부
  // 일반 유저가 다른 유저를 배정하려고 하면 거절
  it('rejects when non-host assigns other user', async () => {
    const requester: User = {
      userToken: 'token-user',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user1',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 1,
      isReady: false,
      IP: '111.111.111.111',
    };
    const target: User = {
      userToken: 'token-user2',
      publicUserId: 2,
      currentSocketId: 'socket2',
      roomUuid,
      nickname: 'user2',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 2,
      isReady: false,
      IP: '111.111.111.111',
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester, target]);

    await expect(service.joinTeam('socket1', 2, 1, 'A')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // 일반 유저가 자기 자신을 팀에 배정하는 경우 허용
  // 일반 유저가 본인을 배정하는 경우는 허용
  it('allows non-host to assign self', async () => {
    const requester: User = {
      userToken: 'token-user',
      publicUserId: 2,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user1',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 1,
      isReady: false,
      IP: '111.111.111.111',
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester]);

    const result = await service.joinTeam('socket1', 2, 0, 'B');

    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(result.updatedUser.publicUserId).toBe(2);
    expect(result.updatedUser.team).toBe('B');
  });

  // 팀 값이 잘못된 경우 예외 발생
  // 팀 입력이 잘못된 경우 예외 발생
  it('throws when team input is invalid', async () => {
    const requester: User = {
      userToken: 'token-host',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'host',
      role: 'PLAYER',
      isHost: true,
      team: 'A',
      slotIndex: 0,
      avatarId: 1,
      isReady: false,
      IP: '111.111.111.111',
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester]);

    await expect(service.joinTeam('socket1', 1, 0, 'C')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // 소켓 매핑 정보가 없으면 유저를 찾을 수 없음
  // 소켓 매핑이 없으면 유저를 찾을 수 없음
  it('throws when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.joinTeam('socket1', 1, 0, 'A')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RoomsService.joinRoom', () => {
  let service: RoomsService;
  let roomsRepository: {
    findById: jest.Mock;
    findUserByToken: jest.Mock;
    findUserByTokenOrNull: jest.Mock;
    updateUserSocket: jest.Mock;
    saveSocketMapping: jest.Mock;
    clearUserTTL: jest.Mock;
    getUserCount: jest.Mock;
    saveUser: jest.Mock;
    nextPublicUserId: jest.Mock;
    addUserToRoomList: jest.Mock;
    isIpBanned: jest.Mock;
  };

  const roomUuid = 'ROOM123';
  const room: Room = {
    roomUuid,
    ownerUserToken: 'owner-token',
    title: 'room',
    status: 'WAITING',
    config: {
      maxPlayers: 4,
      storytellerCount: 2,
      rounds: 1,
      roundTime: 60,
      voteTime: 60,
    },
    createdAt: 0,
  };

  beforeEach(() => {
    roomsRepository = {
      findById: jest.fn(),
      findUserByToken: jest.fn(),
      findUserByTokenOrNull: jest.fn(),
      updateUserSocket: jest.fn(),
      saveSocketMapping: jest.fn(),
      clearUserTTL: jest.fn(),
      getUserCount: jest.fn(),
      saveUser: jest.fn(),
      nextPublicUserId: jest.fn(),
      addUserToRoomList: jest.fn(),
      isIpBanned: jest.fn(),
    };
    // ⭐️ [수정] gamesService, timerService 추가 주입
    service = new RoomsService(
      roomsRepository as unknown as any,
      mockGamesService,
      mockTimerService,
      mockAiJudgeService,
    );
    jest.spyOn(idUtil, 'generateUUIDToken').mockReturnValue('new-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 재접속 토큰이 유효하면 기존 유저를 반환하고 소켓/TTL을 갱신
  // 재접속 시 기존 유저를 반환하고 소켓/TTL을 갱신
  it('returns existing user on reconnect', async () => {
    const existingUser: User = {
      userToken: 'existing-token',
      publicUserId: 1,
      currentSocketId: 'old-socket',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 1,
      isReady: false,
      IP: '111.111.111.111',
    };

    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.findUserByTokenOrNull.mockResolvedValue(existingUser);

    const result = await service.joinRoom(
      roomUuid,
      '111.111.111.111',
      'user',
      'new-socket',
      1,
      'existing-token',
    );

    expect(result).toBe(existingUser);
    expect(roomsRepository.updateUserSocket).toHaveBeenCalledWith(
      roomUuid,
      'existing-token',
      'new-socket',
    );
    expect(roomsRepository.saveSocketMapping).toHaveBeenCalledWith(
      'new-socket',
      roomUuid,
      'existing-token',
    );
    expect(roomsRepository.clearUserTTL).toHaveBeenCalledWith(roomUuid, 'existing-token');
    expect(roomsRepository.saveUser).not.toHaveBeenCalled();
  });

  // 방이 없으면 예외
  // 방이 존재하지 않으면 예외 발생
  it('throws when room does not exist', async () => {
    roomsRepository.findById.mockResolvedValue(null);

    await expect(
      service.joinRoom(roomUuid, '111.111.111.111', 'user', 'socket1', 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // 인원이 가득 찼으면 입장 불가
  // 정원 초과일 때 입장 불가
  it('throws when room is full', async () => {
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUserCount.mockResolvedValue(4);

    await expect(
      service.joinRoom(roomUuid, '111.111.111.111', 'user', 'socket1', 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // 첫 입장은 HOST로 배정되고 owner 토큰 사용
  // 첫 입장 유저는 호스트로 생성
  it('creates host when first user', async () => {
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUserCount.mockResolvedValue(0);
    roomsRepository.nextPublicUserId.mockResolvedValue(7);

    const result = await service.joinRoom(
      roomUuid,
      '111.111.111.111',
      'host',
      'socket1',
      1,
      'owner-token',
    );

    expect(result.role).toBe('AUDIENCE');
    expect(result.isHost).toBe(true);
    expect(result.team).toBe(null);
    expect(result.slotIndex).toBe(null);
    expect(result.userToken).toBe('owner-token');
    expect(result.publicUserId).toBe(7);
    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(idUtil.generateUUIDToken).not.toHaveBeenCalled();
  });

  // 일반 입장은 PLAYER(AUDIENCE)로 배정되고 새 토큰 발급
  // 첫 입장이 아닌 경우 관전자(AUDIENCE)로 생성
  it('creates audience when not first user', async () => {
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUserCount.mockResolvedValue(1);
    roomsRepository.nextPublicUserId.mockResolvedValue(8);

    const result = await service.joinRoom(roomUuid, '111.111.111.111', 'user', 'socket1', 1);

    expect(result.role).toBe('AUDIENCE');
    expect(result.isHost).toBe(false);
    expect(result.team).toBeNull();
    expect(result.slotIndex).toBeNull();
    expect(result.userToken).toBe('new-token');
    expect(result.publicUserId).toBe(8);
    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
  });
});

describe('RoomsService.autoFillSlots', () => {
  let service: RoomsService;
  let roomsRepository: {
    getMappingBySocketId: jest.Mock;
    findUserByToken: jest.Mock;
    findById: jest.Mock;
    getUsersInRoom: jest.Mock;
    saveUser: jest.Mock;
  };

  const roomUuid = 'ROOM123';
  const room: Room = {
    roomUuid,
    ownerUserToken: 'owner-token',
    title: 'room',
    status: 'WAITING',
    config: {
      maxPlayers: 8,
      storytellerCount: 4,
      rounds: 1,
      roundTime: 60,
      voteTime: 60,
    },
    createdAt: 0,
  };

  const makeUser = (overrides: Partial<User>): User => ({
    userToken: overrides.userToken ?? 'token',
    publicUserId: overrides.publicUserId ?? 1,
    currentSocketId: overrides.currentSocketId ?? 'socket',
    roomUuid,
    nickname: overrides.nickname ?? 'user',
    role: overrides.role ?? 'AUDIENCE',
    isHost: overrides.isHost ?? false,
    team: overrides.team ?? null,
    slotIndex: overrides.slotIndex ?? null,
    avatarId: overrides.avatarId ?? 1,
    isReady: overrides.isReady ?? false,
    IP: overrides.IP ?? '111.111.111.111',
  });

  beforeEach(() => {
    roomsRepository = {
      getMappingBySocketId: jest.fn(),
      findUserByToken: jest.fn(),
      findById: jest.fn(),
      getUsersInRoom: jest.fn(),
      saveUser: jest.fn(),
    };
    service = new RoomsService(
      roomsRepository as unknown as any,
      mockGamesService,
      mockTimerService,
      mockAiJudgeService,
    );
    jest
      .spyOn(service as any, 'shuffleArray')
      .mockImplementation((array: User[]) => array);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // A 1명, B 3명, 관객 3명인 경우 팀 균형을 먼저 맞춤
  it('fills to balance teams first (A:1, B:3, audience:3 -> A gets 3)', async () => {
    // Given: A has 1, B has 3, and there are 3 audience members.
    const host = makeUser({
      userToken: 'host',
      publicUserId: 10,
      isHost: true,
      role: 'AUDIENCE',
      team: null,
    });
    const teamA = [makeUser({ publicUserId: 1, role: 'PLAYER', team: 'A', slotIndex: 0 })];
    const teamB = [
      makeUser({ publicUserId: 2, role: 'PLAYER', team: 'B', slotIndex: 0 }),
      makeUser({ publicUserId: 3, role: 'PLAYER', team: 'B', slotIndex: 1 }),
      makeUser({ publicUserId: 4, role: 'PLAYER', team: 'B', slotIndex: 2 }),
    ];
    const audience = [
      makeUser({ publicUserId: 5 }),
      makeUser({ publicUserId: 6 }),
      makeUser({ publicUserId: 7 }),
    ];
    const users = [host, ...teamA, ...teamB, ...audience];

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: host.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(host);
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUsersInRoom.mockResolvedValue(users);

    const result = await service.autoFillSlots('socket-host');

    // Then: 4 audience members 중 3명은 A, 1명은 B로 이동해 균형을 맞춤.
    const savedUsers = roomsRepository.saveUser.mock.calls.map((call) => call[0] as User);
    const filledToA = savedUsers.filter((u) => u.team === 'A');
    const filledToB = savedUsers.filter((u) => u.team === 'B');
    expect(filledToA).toHaveLength(3);
    expect(filledToB).toHaveLength(1);
    expect(result.updatedUsers.length).toBe(users.length);
  });

  // 양 팀이 비었고 관객 수가 짝수면 1:1로 분배
  it('splits evenly when both teams are empty and audience is even', async () => {
    // Given: A=0, B=0, audience=2.
    const host = makeUser({
      userToken: 'host',
      publicUserId: 10,
      isHost: true,
      role: 'AUDIENCE',
      team: null,
    });
    const audience = [makeUser({ publicUserId: 5 }), makeUser({ publicUserId: 6 })];
    const users = [host, ...audience];

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: host.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(host);
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUsersInRoom.mockResolvedValue(users);

    await service.autoFillSlots('socket-host');

    const savedUsers = roomsRepository.saveUser.mock.calls.map((call) => call[0] as User);
    // 총 3명이 배정되므로 A 2명, B 1명 배정이 기대됨.
    expect(savedUsers.filter((u) => u.team === 'A')).toHaveLength(2);
    expect(savedUsers.filter((u) => u.team === 'B')).toHaveLength(1);
  });

  // 한 팀이 꽉 찼으면 다른 팀만 채움
  it('fills only the team with empty slots when the other team is full', async () => {
    // Given: A is full, B has empty slots, audience=2.
    const host = makeUser({
      userToken: 'host',
      publicUserId: 10,
      isHost: true,
      role: 'AUDIENCE',
      team: null,
    });
    const teamA = [
      makeUser({ publicUserId: 1, role: 'PLAYER', team: 'A', slotIndex: 0 }),
      makeUser({ publicUserId: 2, role: 'PLAYER', team: 'A', slotIndex: 1 }),
      makeUser({ publicUserId: 3, role: 'PLAYER', team: 'A', slotIndex: 2 }),
      makeUser({ publicUserId: 4, role: 'PLAYER', team: 'A', slotIndex: 3 }),
    ];
    const audience = [makeUser({ publicUserId: 5 }), makeUser({ publicUserId: 6 })];
    const users = [host, ...teamA, ...audience];

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: host.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(host);
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUsersInRoom.mockResolvedValue(users);

    await service.autoFillSlots('socket-host');

    const savedUsers = roomsRepository.saveUser.mock.calls.map((call) => call[0] as User);
    expect(savedUsers.every((u) => u.team === 'B')).toBe(true);
  });

  // 빈 슬롯이 없으면 예외 발생
  it('throws when there are no empty slots', async () => {
    // Given: all slots are already filled.
    const host = makeUser({
      userToken: 'host',
      publicUserId: 10,
      isHost: true,
      role: 'AUDIENCE',
      team: null,
    });
    const teamA = [
      makeUser({ publicUserId: 1, role: 'PLAYER', team: 'A', slotIndex: 0 }),
      makeUser({ publicUserId: 2, role: 'PLAYER', team: 'A', slotIndex: 1 }),
      makeUser({ publicUserId: 3, role: 'PLAYER', team: 'A', slotIndex: 2 }),
      makeUser({ publicUserId: 4, role: 'PLAYER', team: 'A', slotIndex: 3 }),
    ];
    const teamB = [
      makeUser({ publicUserId: 5, role: 'PLAYER', team: 'B', slotIndex: 0 }),
      makeUser({ publicUserId: 6, role: 'PLAYER', team: 'B', slotIndex: 1 }),
      makeUser({ publicUserId: 7, role: 'PLAYER', team: 'B', slotIndex: 2 }),
      makeUser({ publicUserId: 8, role: 'PLAYER', team: 'B', slotIndex: 3 }),
    ];
    const users = [host, ...teamA, ...teamB];

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: host.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(host);
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUsersInRoom.mockResolvedValue(users);

    await expect(service.autoFillSlots('socket-host')).rejects.toBeInstanceOf(BadRequestException);
  });

  // 요청자가 방장이 아니면 거절
  it('throws when requester is not host', async () => {
    // Given: requester is not host.
    const requester = makeUser({ userToken: 'user', publicUserId: 10, isHost: false });

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);

    await expect(service.autoFillSlots('socket-user')).rejects.toBeInstanceOf(BadRequestException);
  });

  // 소켓 매핑이 없으면 예외 발생
  it('throws when socket mapping is missing', async () => {
    // Given: socket mapping does not exist.
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.autoFillSlots('socket-missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RoomsService.leaveTeam', () => {
  let service: RoomsService;
  let roomsRepository: {
    getMappingBySocketId: jest.Mock;
    findUserByToken: jest.Mock;
    findUserByTokenOrNull: jest.Mock;
    getUsersInRoom: jest.Mock;
    saveUser: jest.Mock;
    isIPBannedInRoom: jest.Mock;
  };

  const roomUuid = 'ROOM123';

  beforeEach(() => {
    roomsRepository = {
      getMappingBySocketId: jest.fn(),
      findUserByToken: jest.fn(),
      findUserByTokenOrNull: jest.fn(),
      getUsersInRoom: jest.fn(),
      saveUser: jest.fn(),
      isIPBannedInRoom: jest.fn(),
    };
    // ⭐️ [수정] gamesService, timerService 추가 주입
    service = new RoomsService(
      roomsRepository as unknown as any,
      mockGamesService,
      mockTimerService,
      mockAiJudgeService,
    );
  });

  // 방장은 다른 유저를 팀에서 제거 가능
  it('allows host to remove another user from team', async () => {
    const requester: User = {
      userToken: 'token-host',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'host',
      role: 'PLAYER',
      isHost: true,
      team: 'A',
      slotIndex: 0,
      avatarId: 1,
      isReady: false,
    };
    const target: User = {
      userToken: 'token-user',
      publicUserId: 2,
      currentSocketId: 'socket2',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      isHost: false,
      team: 'A',
      slotIndex: 1,
      avatarId: 2,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester, target]);

    const result = await service.leaveTeam('socket1', 2, 1, 'A');

    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(roomsRepository.saveUser.mock.calls[0][0]).toMatchObject({
      publicUserId: 2,
      role: 'AUDIENCE',
      team: null,
      slotIndex: 1,
    });
    expect(result.updatedUser.publicUserId).toBe(2);
    expect(result.updatedUser.role).toBe('AUDIENCE');
    expect(result.updatedUser.team).toBeNull();
    expect(result.roomUuid).toBe(roomUuid);
  });

  // 본인은 스스로 팀에서 나갈 수 있음
  it('allows user to remove self from team', async () => {
    const requester: User = {
      userToken: 'token-user',
      publicUserId: 2,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      isHost: false,
      team: 'B',
      slotIndex: 2,
      avatarId: 2,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester]);

    const result = await service.leaveTeam('socket1', 2, 2, 'B');

    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(result.updatedUser.role).toBe('AUDIENCE');
    expect(result.updatedUser.team).toBeNull();
    expect(result.updatedUser.slotIndex).toBe(2);
  });

  // 일반 유저가 타인을 제거하려 하면 거절
  it('rejects when non-host removes other user', async () => {
    const requester: User = {
      userToken: 'token-user1',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user1',
      role: 'PLAYER',
      isHost: false,
      team: 'A',
      slotIndex: 0,
      avatarId: 1,
      isReady: false,
    };
    const target: User = {
      userToken: 'token-user2',
      publicUserId: 2,
      currentSocketId: 'socket2',
      roomUuid,
      nickname: 'user2',
      role: 'PLAYER',
      isHost: false,
      team: 'A',
      slotIndex: 1,
      avatarId: 2,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester, target]);

    await expect(service.leaveTeam('socket1', 2, 1, 'A')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // 팀 입력이 잘못되면 거절
  it('rejects when team input is invalid', async () => {
    const requester: User = {
      userToken: 'token-user',
      publicUserId: 2,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      isHost: false,
      team: 'A',
      slotIndex: 1,
      avatarId: 2,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester]);

    await expect(service.leaveTeam('socket1', 2, 1, 'C')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // 소켓 매핑이 없으면 예외 발생
  it('throws when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.leaveTeam('socket1', 1, 0, 'A')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RoomsService.setUserReady', () => {
  let service: RoomsService;
  let roomsRepository: {
    getMappingBySocketId: jest.Mock;
    findUserByToken: jest.Mock;
    findUserByTokenOrNull: jest.Mock;
    saveUser: jest.Mock;
    getUsersInRoom: jest.Mock;
  };

  const roomUuid = 'ROOM123';

  beforeEach(() => {
    roomsRepository = {
      getMappingBySocketId: jest.fn(),
      findUserByToken: jest.fn(),
      findUserByTokenOrNull: jest.fn(),
      saveUser: jest.fn(),
      getUsersInRoom: jest.fn(),
    };
    // ⭐️ [수정] gamesService, timerService 추가 주입
    service = new RoomsService(
      roomsRepository as unknown as any,
      mockGamesService,
      mockTimerService,
      mockAiJudgeService,
    );
  });

  // 준비 상태 업데이트 후 유저 목록을 반환
  it('updates ready state and returns users', async () => {
    const user: User = {
      userToken: 'token-user',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 1,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: user.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(user);
    roomsRepository.getUsersInRoom.mockResolvedValue([user]);

    const result = await service.setUserReady('socket1', true);

    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(roomsRepository.saveUser.mock.calls[0][0]).toMatchObject({
      userToken: user.userToken,
      isReady: true,
    });
    expect(result.updatedUser.isReady).toBe(true);
    expect(result.users).toHaveLength(1);
    expect(result.roomUuid).toBe(roomUuid);
  });

  // 소켓 매핑이 없으면 예외 발생
  it('throws when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.setUserReady('socket1', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  // 유저가 없으면 예외 발생
  it('throws when user is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: 'token-user',
    });
    roomsRepository.findUserByToken.mockResolvedValue(null);

    await expect(service.setUserReady('socket1', true)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RoomsService.kickUser', () => {
  let service: RoomsService;
  let roomsRepository: {
    getMappingBySocketId: jest.Mock;
    findUserByToken: jest.Mock;
    findUserByTokenOrNull: jest.Mock;
    getUsersInRoom: jest.Mock;
    deleteUser: jest.Mock;
  };

  const roomUuid = 'ROOM123';

  beforeEach(() => {
    roomsRepository = {
      getMappingBySocketId: jest.fn(),
      findUserByToken: jest.fn(),
      findUserByTokenOrNull: jest.fn(),
      getUsersInRoom: jest.fn(),
      deleteUser: jest.fn(),
    };
    // ⭐️ [수정] gamesService, timerService 추가 주입
    service = new RoomsService(
      roomsRepository as unknown as any,
      mockGamesService,
      mockTimerService,
      mockAiJudgeService,
    );
  });

  // 방장이 대상 유저를 강퇴하는 정상 케이스
  it('kicks target user when requester is host', async () => {
    const requester: User = {
      userToken: 'token-host',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'host',
      role: 'PLAYER',
      isHost: true,
      team: 'A',
      slotIndex: 0,
      avatarId: 1,
      isReady: false,
    };
    const target: User = {
      userToken: 'token-user',
      publicUserId: 2,
      currentSocketId: 'socket2',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 2,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester, target]);

    const result = await service.kickUser('socket1', 2);

    expect(roomsRepository.deleteUser).toHaveBeenCalledTimes(1);
    expect(roomsRepository.deleteUser).toHaveBeenCalledWith(
      roomUuid,
      target.userToken,
      target.currentSocketId,
    );
    expect(result.kickedPublicUserId).toBe(2);
    expect(result.users).toHaveLength(1);
    expect(result.users[0].publicUserId).toBe(1);
    expect(result.roomUuid).toBe(roomUuid);
  });

  // 방장이 아니면 강퇴 불가
  it('rejects when requester is not host', async () => {
    const requester: User = {
      userToken: 'token-user1',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user1',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 1,
      isReady: false,
    };
    const target: User = {
      userToken: 'token-user2',
      publicUserId: 2,
      currentSocketId: 'socket2',
      roomUuid,
      nickname: 'user2',
      role: 'PLAYER',
      isHost: false,
      team: null,
      slotIndex: null,
      avatarId: 2,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester, target]);

    await expect(service.kickUser('socket1', 2)).rejects.toBeInstanceOf(BadRequestException);
  });

  // 방장이 자기 자신을 강퇴하려 하면 거절
  it('rejects when host tries to kick self', async () => {
    const requester: User = {
      userToken: 'token-host',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'host',
      role: 'PLAYER',
      isHost: true,
      team: 'A',
      slotIndex: 0,
      avatarId: 1,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester]);

    await expect(service.kickUser('socket1', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  // 소켓 매핑이 없으면 예외 발생
  it('throws when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.kickUser('socket1', 2)).rejects.toBeInstanceOf(NotFoundException);
  });

  // 요청자가 없으면 예외 발생
  it('throws when requester is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: 'token-user',
    });
    roomsRepository.findUserByToken.mockResolvedValue(null);

    await expect(service.kickUser('socket1', 2)).rejects.toBeInstanceOf(NotFoundException);
  });

  // 대상 유저가 없으면 예외 발생
  it('throws when target user is missing', async () => {
    const requester: User = {
      userToken: 'token-host',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'host',
      role: 'PLAYER',
      isHost: true,
      team: 'A',
      slotIndex: 0,
      avatarId: 1,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.getUsersInRoom.mockResolvedValue([requester]);

    await expect(service.kickUser('socket1', 2)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RoomsService.leaveRoom', () => {
  let service: RoomsService;
  let roomsRepository: {
    getMappingBySocketId: jest.Mock;
    findUserByToken: jest.Mock;
    findUserByTokenOrNull: jest.Mock;
    deleteUser: jest.Mock;
    getUserCount: jest.Mock;
    delete: jest.Mock;
  };

  const roomUuid = 'ROOM123';

  beforeEach(() => {
    roomsRepository = {
      getMappingBySocketId: jest.fn(),
      findUserByToken: jest.fn(),
      findUserByTokenOrNull: jest.fn(),
      deleteUser: jest.fn(),
      getUserCount: jest.fn(),
      delete: jest.fn(),
    };
    // ⭐️ [수정] gamesService, timerService 추가 주입
    service = new RoomsService(
      roomsRepository as unknown as any,
      mockGamesService,
      mockTimerService,
      mockAiJudgeService,
    );
  });

  // 소켓 매핑이 없으면 null 반환
  it('returns null when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    const result = await service.leaveRoom('socket1');

    expect(result).toBeNull();
    expect(roomsRepository.findUserByToken).not.toHaveBeenCalled();
  });

  // 유저가 없으면 null 반환
  it('returns null when user is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: 'token-user',
    });
    roomsRepository.findUserByToken.mockResolvedValue(null);

    const result = await service.leaveRoom('socket1');

    expect(result).toBeNull();
    expect(roomsRepository.deleteUser).not.toHaveBeenCalled();
  });

  // 마지막 유저가 나가면 방 삭제
  it('deletes room when last user leaves', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: 'token-user',
    });
    roomsRepository.findUserByToken.mockResolvedValue({
      userToken: 'token-user',
      nickname: 'user',
    });
    roomsRepository.getUserCount.mockResolvedValue(0);

    const result = await service.leaveRoom('socket1');

    expect(roomsRepository.deleteUser).toHaveBeenCalledWith(roomUuid, 'token-user', 'socket1');
    expect(roomsRepository.delete).toHaveBeenCalledWith(roomUuid);
    expect(result).toEqual({ roomUuid, nickname: 'user' });
  });

  // 유저가 남아있으면 방 유지
  it('keeps room when users remain', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: 'token-user',
    });
    roomsRepository.findUserByToken.mockResolvedValue({
      userToken: 'token-user',
      nickname: 'user',
    });
    roomsRepository.getUserCount.mockResolvedValue(2);

    const result = await service.leaveRoom('socket1');

    expect(roomsRepository.deleteUser).toHaveBeenCalledWith(roomUuid, 'token-user', 'socket1');
    expect(roomsRepository.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ roomUuid, nickname: 'user' });
  });
});
