// src/ai-judge/ai-judge.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AiJudgeService } from './ai-judges.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs'; // RxJS observable 생성용
import { JudgeConfig, PERSONAS } from './personas.constant';
import { AiJudgesRepository } from './ai-judges.repository';

describe('AiJudgeService', () => {
  let service: AiJudgeService;
  let httpService: HttpService;

  // 1. GMS API가 줄 것이라고 가정하는 가짜 응답 데이터
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

  const mockAiJudgesRepository = {
    saveSelectedJudges: jest.fn(),
    getSelectedJudges: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiJudgeService,
        {
          provide: ConfigService,
          useValue: {
            // 코드에서 'GMS_API_KEY'를 찾으므로 이에 맞춰줍니다.
            get: jest.fn().mockReturnValue('FAKE_API_KEY'),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn().mockReturnValue(of(mockGptResponse)),
          },
        },
        {
          provide: AiJudgesRepository, // 실제 클래스 이름
          useValue: mockAiJudgesRepository, // 위에서 만든 가짜 객체
        },
      ],
    }).compile();

    service = module.get<AiJudgeService>(AiJudgeService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('단일 심사위원(judge) 정보로 평가를 수행하고 결과를 반환해야 한다', async () => {
    // [준비 1] 가상의 심사위원 데이터 생성 (JudgeConfig 타입)
    const mockJudge: JudgeConfig = {
      name: '테스트 판사',
      persona: '너는 테스트를 위한 가상의 판사야.',
    };

    // [준비 2] 평가받을 문장 데이터 생성 (DTO)
    const dto = {
      genre: '테스트 장르',
      images: [{ tags: ['태그1'], description: '설명1' }],
      sentence: '테스트 문장입니다.',
    };

    // [실행] evaluateSingle 호출 (심사위원 + DTO 전달)
    const result = await service.evaluateSingle(mockJudge, dto);

    // [검증]
    // 1. 결과에 심사위원 이름이 제대로 매핑되었는지 확인
    expect(result.personaName).toBe('테스트 판사');

    // 2. 점수와 코멘트가 Mock API 응답대로 왔는지 확인
    expect(result.score).toBe(95);
    expect(result.comment).toBe('테스트 코멘트입니다.');

    // 3. HTTP 요청이 1번 발생했는지 확인
    expect(httpService.post).toHaveBeenCalledTimes(1);

    // (선택) HTTP 요청 시 시스템 프롬프트에 심사위원 페르소나가 잘 들어갔는지 확인
    expect(httpService.post).toHaveBeenCalledWith(
      expect.stringContaining('gmsapi/api.openai.com/v1/chat/completions'), // URL 체크
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('너는 테스트를 위한 가상의 판사야.'), // 페르소나 주입 확인
          }),
        ]),
      }),
      expect.anything(), // 헤더 부분은 체크 생략 (anything)
    );
  });
});
