import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { User } from '../../common/types/user.type';

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
    roomsRepository.getMappingBySocketId.mockResolvedValue({ roomUuid, userToken: requester.userToken });
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

    roomsRepository.getMappingBySocketId.mockResolvedValue({ roomUuid, userToken: requester.userToken });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.findAllUsersInRoom.mockResolvedValue([requester, target]);

    // 예외 발생 기대
    await expect(service.joinTeam('socket1', 2, 1, 'A')).rejects.toBeInstanceOf(BadRequestException);
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

    roomsRepository.getMappingBySocketId.mockResolvedValue({ roomUuid, userToken: requester.userToken });
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

    roomsRepository.getMappingBySocketId.mockResolvedValue({ roomUuid, userToken: requester.userToken });
    roomsRepository.findUserByToken.mockResolvedValue(requester);
    roomsRepository.findAllUsersInRoom.mockResolvedValue([requester]);

    await expect(service.joinTeam('socket1', 1, 0, 'C')).rejects.toBeInstanceOf(BadRequestException);
  });

  // 소켓 매핑 정보가 없으면 유저를 찾을 수 없음
  it('throws when mapping is missing', async () => {
    // socketId 매핑이 없으면 유저를 찾을 수 없음
    roomsRepository.getMappingBySocketId.mockResolvedValue(null);

    await expect(service.joinTeam('socket1', 1, 0, 'A')).rejects.toBeInstanceOf(NotFoundException);
  });
});
