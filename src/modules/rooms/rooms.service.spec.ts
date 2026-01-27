import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { User } from '../../common/types/user.type';
import { Room } from '../../common/types/room.type';
import * as idUtil from '../../common/utils/id.util';

describe('RoomsService.joinTeam', () => {
  let service: RoomsService;
  // Repository는 실제 구현 대신 jest mock으로 대체
  let roomsRepository: {
    getMappingBySocketId: jest.Mock;
    findUserByToken: jest.Mock;
    findAllUsersInRoom: jest.Mock;
    saveUser: jest.Mock;
  };

  const roomUuid = 'ROOM123';

  beforeEach(() => {
    // 각 테스트마다 mock을 초기화해서 독립적으로 동작하게 함
    roomsRepository = {
      getMappingBySocketId: jest.fn(),
      findUserByToken: jest.fn(),
      findAllUsersInRoom: jest.fn(),
      saveUser: jest.fn(),
    };
    // 실제 RoomsRepository 대신 mock 객체를 주입해 테스트
    service = new RoomsService(roomsRepository as unknown as any);
  });

  // 방장이 다른 유저를 팀에 배정하는 정상 케이스
  it('assigns team when requester is host', async () => {
    // 방장(요청자)과 대상 유저 준비
    const requester: User = {
      userToken: 'token-host',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'host',
      role: 'HOST',
      team: 'NONE',
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
      team: 'NONE',
      avatarId: 2,
      isReady: false,
    };

    // socketId -> (roomUuid, userToken) 매핑 리턴
    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    // 요청자의 user 정보 조회
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    // 방 내 전체 유저 목록
    roomsRepository.findAllUsersInRoom.mockResolvedValue([requester, target]);

    // 실행
    const result = await service.joinTeam('socket1', 2, 1, 'A');

    // 저장된 유저에 팀/슬롯이 반영됐는지 확인
    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(roomsRepository.saveUser.mock.calls[0][0]).toMatchObject({
      publicUserId: 2,
      team: 'TEAM_A',
      role: 'PLAYER',
      slotIndex: 1,
    });
    expect(result.roomUuid).toBe(roomUuid);
    expect(result.updatedUser.publicUserId).toBe(2);
    expect(result.updatedUser.team).toBe('TEAM_A');
  });

  // 일반 유저가 다른 유저를 배정하려고 하면 거부
  it('rejects when non-host assigns other user', async () => {
    // 요청자가 HOST가 아니면 타인 변경 불가
    const requester: User = {
      userToken: 'token-user',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user1',
      role: 'PLAYER',
      team: 'NONE',
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
      team: 'NONE',
      avatarId: 2,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.findAllUsersInRoom.mockResolvedValue([requester, target]);

    // 예외 발생 기대
    await expect(service.joinTeam('socket1', 2, 1, 'A')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // 일반 유저가 자기 자신을 팀에 배정하는 경우 허용
  it('allows non-host to assign self', async () => {
    // 자기 자신이라면 HOST가 아니어도 가능
    const requester: User = {
      userToken: 'token-user',
      publicUserId: 2,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user1',
      role: 'PLAYER',
      team: 'NONE',
      avatarId: 1,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.findAllUsersInRoom.mockResolvedValue([requester]);

    const result = await service.joinTeam('socket1', 2, 0, 'B');

    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(result.updatedUser.publicUserId).toBe(2);
    expect(result.updatedUser.team).toBe('TEAM_B');
  });

  // 팀 값이 잘못된 경우 예외 발생
  it('throws when team input is invalid', async () => {
    // 팀 입력값이 A/B가 아니면 예외
    const requester: User = {
      userToken: 'token-host',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'host',
      role: 'HOST',
      team: 'NONE',
      avatarId: 1,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({
      roomUuid,
      userToken: requester.userToken,
    });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.findAllUsersInRoom.mockResolvedValue([requester]);

    await expect(service.joinTeam('socket1', 1, 0, 'C')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // 소켓 매핑 정보가 없으면 유저를 찾을 수 없음
  it('throws when mapping is missing', async () => {
    // socketId 매핑이 없으면 유저를 찾을 수 없음
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.joinTeam('socket1', 1, 0, 'A')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RoomsService.joinRoom', () => {
  let service: RoomsService;
  let roomsRepository: {
    findById: jest.Mock;
    findUserByToken: jest.Mock;
    updateUserSocket: jest.Mock;
    saveSocketMapping: jest.Mock;
    clearUserTTL: jest.Mock;
    getUserCount: jest.Mock;
    saveUser: jest.Mock;
    nextPublicUserId: jest.Mock;
  };

  const roomUuid = 'ROOM123';
  const room: Room = {
    roomUuid,
    ownerUserToken: 'owner-token',
    title: 'room',
    status: 'LOBBY',
    config: { roundCount: 1, roundTimeSeconds: 60, votingTimeSeconds: 60, teamSize: 2 },
    createdAt: 0,
  };

  beforeEach(() => {
    // joinRoom 테스트용 Repository mock 구성
    roomsRepository = {
      findById: jest.fn(),
      findUserByToken: jest.fn(),
      updateUserSocket: jest.fn(),
      saveSocketMapping: jest.fn(),
      clearUserTTL: jest.fn(),
      getUserCount: jest.fn(),
      saveUser: jest.fn(),
      nextPublicUserId: jest.fn(),
    };
    // 실제 Repository 대신 mock 주입
    service = new RoomsService(roomsRepository as unknown as any);
    // 랜덤 토큰 생성을 고정값으로 통제
    jest.spyOn(idUtil, 'generateUUIDToken').mockReturnValue('new-token');
  });

  afterEach(() => {
    // 테스트 간 영향 제거
    jest.restoreAllMocks();
  });

  // 재접속 토큰이 유효하면 기존 유저를 반환하고 소켓/TTL을 갱신
  it('returns existing user on reconnect', async () => {
    // 기존 유저 데이터 준비
    const existingUser: User = {
      userToken: 'existing-token',
      publicUserId: 1,
      currentSocketId: 'old-socket',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      team: 'NONE',
      avatarId: 1,
      isReady: false,
    };

    // 방 조회 성공 & 기존 유저 존재
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.findUserByToken.mockResolvedValue(existingUser);

    // 재접속 시도
    const result = await service.joinRoom(roomUuid, 'user', 'new-socket', 1, 'existing-token');

    // 기존 유저 반환 및 연결 정보 갱신 여부 확인
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
    // 방 조회 실패
    roomsRepository.findById.mockResolvedValue(null);

    // 존재하지 않는 방이면 NotFoundException
    await expect(service.joinRoom(roomUuid, 'user', 'socket1', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // 인원이 가득 찼으면 입장 불가
  it('throws when room is full', async () => {
    // 방은 존재하지만 인원이 최대치
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUserCount.mockResolvedValue(4); // teamSize 2 -> max 4

    // 정원 초과 시 BadRequestException
    await expect(service.joinRoom(roomUuid, 'user', 'socket1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // 첫 입장은 HOST로 배정되고 owner 토큰 사용
  it('creates host when first user', async () => {
    // 첫 입장 시나리오
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUserCount.mockResolvedValue(0);
    roomsRepository.nextPublicUserId.mockResolvedValue(7);

    // 첫 유저 입장
    const result = await service.joinRoom(roomUuid, 'host', 'socket1', 1);

    // HOST 배정 및 ownerToken 사용 검증
    expect(result.role).toBe('HOST');
    expect(result.userToken).toBe('owner-token');
    expect(result.publicUserId).toBe(7);
    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
    expect(idUtil.generateUUIDToken).not.toHaveBeenCalled();
  });

  // 일반 입장은 PLAYER로 배정되고 새 토큰 발급
  it('creates player when not first user', async () => {
    // 두 번째 이후 입장 시나리오
    roomsRepository.findById.mockResolvedValue(room);
    roomsRepository.getUserCount.mockResolvedValue(1);
    roomsRepository.nextPublicUserId.mockResolvedValue(8);

    // 일반 유저 입장
    const result = await service.joinRoom(roomUuid, 'user', 'socket1', 1);

    // PLAYER 배정 및 신규 토큰 발급 확인
    expect(result.role).toBe('PLAYER');
    expect(result.userToken).toBe('new-token');
    expect(result.publicUserId).toBe(8);
    expect(roomsRepository.saveUser).toHaveBeenCalledTimes(1);
  });
});

describe('RoomsService.setUserReady', () => {
  let service: RoomsService;
  let roomsRepository: {
    getMappingBySocketId: jest.Mock;
    findUserByToken: jest.Mock;
    saveUser: jest.Mock;
    findAllUsersInRoom: jest.Mock;
  };

  const roomUuid = 'ROOM123';

  beforeEach(() => {
    // setUserReady 테스트용 Repository mock 구성
    roomsRepository = {
      getMappingBySocketId: jest.fn(),
      findUserByToken: jest.fn(),
      saveUser: jest.fn(),
      findAllUsersInRoom: jest.fn(),
    };
    // 실제 Repository 대신 mock 주입
    service = new RoomsService(roomsRepository as unknown as any);
  });

  // 정상적으로 준비 상태를 변경하고 최신 유저 목록을 반환
  it('updates ready state and returns users', async () => {
    const user: User = {
      userToken: 'token-user',
      publicUserId: 1,
      currentSocketId: 'socket1',
      roomUuid,
      nickname: 'user',
      role: 'PLAYER',
      team: 'NONE',
      avatarId: 1,
      isReady: false,
    };

    roomsRepository.getMappingBySocketId.mockResolvedValue({ roomUuid, userToken: user.userToken });
    roomsRepository.findUserByToken.mockResolvedValue(user);
    roomsRepository.findAllUsersInRoom.mockResolvedValue([user]);

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

  // 소켓 매핑 정보가 없으면 예외
  it('throws when mapping is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.setUserReady('socket1', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  // 유저 정보가 없으면 예외
  it('throws when user is missing', async () => {
    roomsRepository.getMappingBySocketId.mockResolvedValue({ roomUuid, userToken: 'token-user' });
    roomsRepository.findUserByToken.mockResolvedValue(null);

    await expect(service.setUserReady('socket1', true)).rejects.toBeInstanceOf(NotFoundException);
  });
});
