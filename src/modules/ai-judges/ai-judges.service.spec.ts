// src/ai-judge/ai-judge.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AiJudgeService } from './ai-judges.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs'; // RxJS observable 생성용

describe('AiJudgeService', () => {
  let service: AiJudgeService;
  let httpService: HttpService;

  // 가짜 응답 데이터 (GMS가 줄 것이라고 가정하는 데이터)
  const mockGptResponse = {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 95,
              comment: '테스트 코멘트입니다.',
            }),
          },
        },
      ],
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiJudgeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('FAKE_API_KEY'), // 가짜 키
          },
        },
        {
          provide: HttpService,
          useValue: {
            // post 메서드가 호출되면 위의 mockGptResponse를 Observable로 반환
            post: jest.fn().mockReturnValue(of(mockGptResponse)),
          },
        },
      ],
    }).compile();

    service = module.get<AiJudgeService>(AiJudgeService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('문장을 평가하고 페르소나 결과(객체)를 반환해야 한다', async () => {
    // 1. 입력 데이터 준비
    const dto = {
      genre: '테스트 장르',
      images: [{ tags: ['태그1'], description: '설명1' }],
      sentence: '테스트 문장',
    };

    // 2. 서비스 실행
    const result = await service.evaluateSubmission(dto);

    // 3. 검증 (Expectation)
    expect(result).toHaveProperty('personaName'); // 페르소나 이름이 있어야 함
    expect(result.score).toBe(95); // Mock 점수와 같아야 함
    expect(result.comment).toBe('테스트 코멘트입니다.'); // Mock 코멘트와 같아야 함

    // httpService.post가 1번 호출되었는지 확인
    expect(httpService.post).toHaveBeenCalledTimes(1);
  });
});
