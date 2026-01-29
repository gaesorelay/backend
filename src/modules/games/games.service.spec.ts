import { GamesService } from './games.service';
import { AiJudgeScore } from './types/vote-outcome.type';

describe('GamesService voting', () => {
  let service: GamesService;
  const gamesRepository = {
    createGame: jest.fn(),
    updateJudges: jest.fn(),
    getGameJudgeIds: jest.fn(),
    updateGameImages: jest.fn(),
  };

  const roomUuid = 'ROOM123';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GamesService(gamesRepository as unknown as any);
  });

  it('accumulates audience votes and returns winner', () => {
    // 관객 투표가 누적되고 승자 계산이 되는지 확인
    service.submitAudienceVote(roomUuid, 'A');
    service.submitAudienceVote(roomUuid, 'A');
    const outcome = service.submitAudienceVote(roomUuid, 'B');

    expect(outcome.votesTeamA).toBe(2);
    expect(outcome.votesTeamB).toBe(1);
    expect(outcome.winner).toBe('A');
  });

  it('applies AI votes to higher scored team', () => {
    // AI 점수가 높은 팀에 가중치가 제대로 더해지는지 확인
    service.submitAudienceVote(roomUuid, 'A');

    const aiScores: AiJudgeScore[] = [
      { judgeName: 'J1', scoreTeamA: 70, scoreTeamB: 60 },
      { judgeName: 'J2', scoreTeamA: 40, scoreTeamB: 80 },
      { judgeName: 'J3', scoreTeamA: 90, scoreTeamB: 30 },
    ];

    const outcome = service.applyAiJudgeVotes(roomUuid, aiScores, 2);

    // J1, J3 -> Team A +2 each, J2 -> Team B +2
    expect(outcome.votesTeamA).toBe(1 + 4);
    expect(outcome.votesTeamB).toBe(2);
    expect(outcome.winner).toBe('A');
  });

  it('does not apply AI votes twice', () => {
    // AI 투표가 한 번만 반영되는지 확인
    const aiScores: AiJudgeScore[] = [{ judgeName: 'J1', scoreTeamA: 70, scoreTeamB: 60 }];

    const first = service.applyAiJudgeVotes(roomUuid, aiScores, 3);
    const second = service.applyAiJudgeVotes(roomUuid, aiScores, 3);

    expect(first.votesTeamA).toBe(3);
    expect(second.votesTeamA).toBe(3);
  });

  it('skips AI votes on tie', () => {
    // 동점인 경우 AI 투표가 반영되지 않는지 확인
    const aiScores: AiJudgeScore[] = [{ judgeName: 'J1', scoreTeamA: 50, scoreTeamB: 50 }];

    const outcome = service.applyAiJudgeVotes(roomUuid, aiScores, 5);

    expect(outcome.votesTeamA).toBe(0);
    expect(outcome.votesTeamB).toBe(0);
    expect(outcome.winner).toBe('DRAW');
  });
});
