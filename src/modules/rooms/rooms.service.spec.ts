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
  it('throws when room does not exist', async () => {
    roomsRepository.findById.mockResolvedValue(null);

    await expect(
      service.joinRoom(roomUuid, '111.111.111.111', 'user', 'socket1', 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // 인원이 가득 찼으면 입장 불가
  it('throws when room is full', async () => {
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUserCount.mockResolvedValue(4);

    await expect(
      service.joinRoom(roomUuid, '111.111.111.111', 'user', 'socket1', 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // 첫 입장은 HOST로 배정되고 owner 토큰 사용
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

  it('throws when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.setUserReady('socket1', true)).rejects.toBeInstanceOf(NotFoundException);
  });

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

  it('throws when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.kickUser('socket1', 2)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when requester is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: 'token-user',
    });
    roomsRepository.findUserByToken.mockResolvedValue(null);

    await expect(service.kickUser('socket1', 2)).rejects.toBeInstanceOf(NotFoundException);
  });

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

  it('returns null when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    const result = await service.leaveRoom('socket1');

    expect(result).toBeNull();
    expect(roomsRepository.findUserByToken).not.toHaveBeenCalled();
  });

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
