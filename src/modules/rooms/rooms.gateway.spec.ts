import { RoomsGateway } from './rooms.gateway';

describe('RoomsGateway.submit_vote', () => {
  const roomsService = {
    getUserBySocket: jest.fn(),
    getRoomById: jest.fn(),
    kickUser: jest.fn(),
  };
  const gamesService = {
    submitAudienceVote: jest.fn(),
  };
  const aiJudgeService = {
    selectAndSaveJudges: jest.fn(),
  };

  const socket: any = { id: 'socket-1' };
  const roomUuid = 'ROOM123';

  let gateway: RoomsGateway;
  let emitSpy: jest.Mock;

  beforeEach(() => {
    emitSpy = jest.fn();
    gateway = new RoomsGateway(
      roomsService as unknown as any,
      aiJudgeService as unknown as any,
      gamesService as unknown as any,
    );
    // Mock socket.io server
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit: emitSpy }),
      sockets: {
        sockets: new Map(),
      },
    };

    roomsService.getUserBySocket.mockResolvedValue({ roomUuid });
  });

  it('rejects votes when room is not in RESULTING state', async () => {
    // RESULTING 상태가 아닐 때 투표가 차단되는지 확인
    roomsService.getRoomById.mockResolvedValue({ status: 'PLAYING' });

    const result = await gateway.handleSubmitVote(socket, { team: 'A' });

    expect(result).toEqual({ status: 'error', message: 'Resulting is not open.' });
    expect(gamesService.submitAudienceVote).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('accepts votes when room is in RESULTING state', async () => {
    // RSEULTING 상태일 때 투표가 수락되고 브로드캐스트되는지 확인
    roomsService.getRoomById.mockResolvedValue({ status: 'RESULTING' });
    gamesService.submitAudienceVote.mockReturnValue({
      roomUuid,
      votesTeamA: 1,
      votesTeamB: 0,
      winner: 'A',
    });

    const result = await gateway.handleSubmitVote(socket, { team: 'A' });

    expect(gamesService.submitAudienceVote).toHaveBeenCalledWith(roomUuid, 'A');
    expect(emitSpy).toHaveBeenCalledWith('vote_updated', {
      votesTeamA: 1,
      votesTeamB: 0,
    });
    expect(result).toEqual({
      status: 'success',
      data: {
        roomUuid,
        votesTeamA: 1,
        votesTeamB: 0,
        winner: 'A',
      },
    });
  });
});

describe('RoomsGateway.kick_user', () => {
  const roomsService = {
    kickUser: jest.fn(),
  };
  const gamesService = {};
  const aiJudgeService = {};

  const socket: any = { id: 'host-socket' };
  const roomUuid = 'ROOM123';

  let gateway: RoomsGateway;
  let emitSpy: jest.Mock;
  let kickedSocketDisconnect: jest.Mock;

  beforeEach(() => {
    emitSpy = jest.fn();
    kickedSocketDisconnect = jest.fn();

    gateway = new RoomsGateway(
      roomsService as unknown as any,
      aiJudgeService as unknown as any,
      gamesService as unknown as any,
    );

    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit: emitSpy }),
      sockets: {
        sockets: new Map(),
      },
    };
  });

  it('sends kicked event and disconnects target socket when available', async () => {
    const kickedSocketId = 'kicked-socket';
    const kickedSocket = { connected: true, disconnect: kickedSocketDisconnect };
    (gateway as any).server.sockets.sockets.set(kickedSocketId, kickedSocket);

    roomsService.kickUser.mockResolvedValue({
      kickedPublicUserId: 2,
      users: [{ publicUserId: 1 }],
      roomUuid,
      kickedSocketId,
    });

    const result = await gateway.handleKickUser(socket, { public_user_id: 2 });

    expect(roomsService.kickUser).toHaveBeenCalledWith('host-socket', 2);
    expect((gateway as any).server.to).toHaveBeenCalledWith(roomUuid);
    expect(emitSpy).toHaveBeenCalledWith('lobby_updated', { users: [{ publicUserId: 1 }] });

    expect((gateway as any).server.to).toHaveBeenCalledWith(kickedSocketId);
    expect(emitSpy).toHaveBeenCalledWith('kicked', {
      roomUuid,
      reason: '강퇴되었습니다.',
    });
    expect(kickedSocketDisconnect).toHaveBeenCalledWith(true);
    expect(result).toEqual({ status: 'success', data: { kickedPublicUserId: 2 } });
  });

  it('does not emit kicked when kickedSocketId is null', async () => {
    roomsService.kickUser.mockResolvedValue({
      kickedPublicUserId: 2,
      users: [{ publicUserId: 1 }],
      roomUuid,
      kickedSocketId: null,
    });

    const result = await gateway.handleKickUser(socket, { public_user_id: 2 });

    expect((gateway as any).server.to).toHaveBeenCalledWith(roomUuid);
    expect(emitSpy).toHaveBeenCalledWith('lobby_updated', { users: [{ publicUserId: 1 }] });
    expect(result).toEqual({ status: 'success', data: { kickedPublicUserId: 2 } });
  });
});
