import { RoomsGateway } from './rooms.gateway';

describe('RoomsGateway.submit_vote', () => {
  const roomsService = {
    getUserBySocket: jest.fn(),
    getRoomById: jest.fn(),
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
