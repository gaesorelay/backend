import { Test, TestingModule } from '@nestjs/testing';
import { GamesService } from './games.service';
import { GamesRepository } from './games.repository';
import { GameState } from './types/game-state.type';

// Mock용 가짜 Repository
const mockGamesRepository = {
  getGame: jest.fn(),
};

describe('GamesService', () => {
  let service: GamesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GamesService, { provide: GamesRepository, useValue: mockGamesRepository }],
    }).compile();

    service = module.get<GamesService>(GamesService);
  });

  describe('validateWriter', () => {
    const roomUuid = 'ROOM_123';
    // 우리가 약속한 고정된 GameState
    const mockState: GameState = {
      roomUuid,
      currentRound: 1,
      genre: 'horror',
      aiJudgeIDs: [],
      imageIDs: [1, 2, 3],

      // 👥 A팀 순서: 유저1 -> 유저2
      teamAOrder: ['Token-User1', 'Token-User2'],
      teamBOrder: ['Token-User3', 'Token-User4'],

      // 📝 현재 작성된 스토리가 0개 -> 즉 0번 인덱스(유저1) 차례
      teamAStory: [],
      teamBStory: [],

      turnEndAt: 0,
    };

    it('✅ 내 차례일 때 true를 반환해야 한다 (Round 1, User 1)', async () => {
      mockGamesRepository.getGame.mockResolvedValue(mockState);

      const result = await service.validateWriter(roomUuid, 'Token-User1', 'A');
      expect(result).toBe(true);
    });

    it('❌ 내 차례가 아닐 때 false를 반환해야 한다 (Round 1, User 2)', async () => {
      mockGamesRepository.getGame.mockResolvedValue(mockState);

      const result = await service.validateWriter(roomUuid, 'Token-User2', 'A');
      expect(result).toBe(false);
    });

    it('✅ 스토리가 하나 쌓이면 다음 사람 차례가 되어야 한다 (Round 2, User 2)', async () => {
      // 상황 변경: 스토리가 1개 생김 -> 이제 1번 인덱스(User2) 차례
      const round2State = { ...mockState, teamAStory: ['첫번째 문장'] };
      mockGamesRepository.getGame.mockResolvedValue(round2State);

      const result = await service.validateWriter(roomUuid, 'Token-User2', 'A');
      expect(result).toBe(true);
    });

    it('❌ 다른 팀 유저가 요청하면 false여야 한다', async () => {
      mockGamesRepository.getGame.mockResolvedValue(mockState);

      // A팀 턴 계산 로직에 B팀 유저 토큰을 넣음
      const result = await service.validateWriter(roomUuid, 'Token-User3', 'A');
      expect(result).toBe(false);
    });
  });
});
