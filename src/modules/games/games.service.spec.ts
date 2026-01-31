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
      {
        judgeName: 'J1',
        commentA: 'A good',
        commentB: 'B ok',
        scoreTeamA: 70,
        scoreTeamB: 60,
      },
      {
        judgeName: 'J2',
        commentA: 'A ok',
        commentB: 'B good',
        scoreTeamA: 40,
        scoreTeamB: 80,
      },
      {
        judgeName: 'J3',
        commentA: 'A best',
        commentB: 'B weak',
        scoreTeamA: 90,
        scoreTeamB: 30,
      },
    ];

    const outcome = service.applyAiJudgeVotes(roomUuid, aiScores);

    expect(outcome.votesTeamA).toBe(1);
    expect(outcome.votesTeamB).toBe(0);
    expect(outcome.winner).toBe('A');
    expect(outcome.aiJudges).toEqual(aiScores);
  });

  it('does not mutate votes when AI scores are attached multiple times', () => {
    const aiScores: AiJudgeScore[] = [
      {
        judgeName: 'J1',
        commentA: 'Tie A',
        commentB: 'Tie B',
        scoreTeamA: 50,
        scoreTeamB: 50,
      },
    ];

    const first = service.applyAiJudgeVotes(roomUuid, aiScores);
    const second = service.applyAiJudgeVotes(roomUuid, aiScores);

    expect(first.votesTeamA).toBe(0);
    expect(second.votesTeamA).toBe(0);
  });
});
