import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AiJudgeService } from './ai-judges.service';
import { AiJudgesRepository } from './ai-judges.repository';
import { GamesService } from '../games/games.service'; // 👈 GamesService Import 필수
import { of } from 'rxjs';
import { PERSONAS } from './personas.constant';

// 1. Mocking용 데이터 준비 (ID 포함)
const mockSubmission = {
  genre: '스릴러',
  images: [],
  sentence: '테스트 문장입니다.',
};

// 2. HTTP 응답 Mock
const mockGptResponse = {
  data: {
    choices: [
      {
        message: {
          content: JSON.stringify({ score: 90, comment: '잘했어' }),
        },
      },
    ],
  },
};

describe('AiJudgeService', () => {
  let service: AiJudgeService;
  let gamesService: GamesService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiJudgeService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('TEST_API_KEY') },
        },
        {
          provide: AiJudgesRepository,
          useValue: {
            // Repository 메서드 Mock (필요한 경우)
          },
        },
        // ⭐️ [핵심 1] GamesService Mocking (ID 배열 반환하도록 설정)
        {
          provide: GamesService,
          useValue: {
            getJudgeIds: jest.fn().mockResolvedValue([1, 2]), // number[] 반환!
            updateGameJudges: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn().mockReturnValue(of(mockGptResponse)),
          },
        },
      ],
    }).compile();

    service = module.get<AiJudgeService>(AiJudgeService);
    gamesService = module.get<GamesService>(GamesService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateRoom', () => {
    it('방 ID로 심사위원 ID를 조회하여 평가를 수행해야 한다', async () => {
      // Arrange
      const roomId = 'room-123';
      // GamesService가 1번, 2번 심사위원 ID를 반환한다고 가정
      // (PERSONAS[0].id, PERSONAS[1].id와 매칭되는지 확인 필요. 보통 1부터 시작하면 인덱스 주의)
      // 여기서는 PERSONAS에 id: 1, id: 2인 데이터가 있다고 가정합니다.
      jest.spyOn(gamesService, 'getJudgeIds').mockResolvedValue([1, 2]);

      // Act
      const results = await service.evaluateRoom(roomId, mockSubmission);

      // Assert
      expect(gamesService.getJudgeIds).toHaveBeenCalledWith(roomId);
      expect(httpService.post).toHaveBeenCalledTimes(2); // 심사위원이 2명이므로 2번 호출
      expect(results).toHaveLength(2);

      // 결과 검증 (id 기반인지 확인)
      // 만약 PersonaResult에 id가 있다면: expect(results[0].personaId).toBe(1);
      expect(results[0].score).toBe(90);
    });

    it('심사위원이 설정되지 않았으면 에러를 던져야 한다', async () => {
      // ⭐️ [핵심 2] 빈 배열(number[]) 반환
      jest.spyOn(gamesService, 'getJudgeIds').mockResolvedValue([]);

      await expect(service.evaluateRoom('room-empty', mockSubmission)).rejects.toThrow(
        '선정된 심사위원이 없습니다.',
      );
    });
  });

  describe('mapIdsToJudges', () => {
    it('유효한 ID 목록을 받으면 Persona 객체 배열을 반환해야 한다', () => {
      // PERSONAS 상수에 id: 1인 데이터가 있다고 가정
      const targetId = PERSONAS[0].id;

      // ⭐️ [핵심 3] 문자열 이름이 아니라 ID 전달
      const result = service['mapIdsToJudges']([targetId]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(targetId);
    });

    it('존재하지 않는 ID가 있으면 에러를 던져야 한다', () => {
      const invalidId = 99999;
      expect(() => service['mapIdsToJudges']([invalidId])).toThrow(); // 또는 NotFoundException
    });
  });
});
