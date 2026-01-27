import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { EvaluateSubmissionDto, PersonaResult } from './dto/judge.dto';
import { JudgeConfig, PERSONAS } from './personas.constant';

@Injectable()
export class AiJudgeService {
  private readonly logger = new Logger(AiJudgeService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * [내부용] 단일 심사 함수
   * 랜덤 선택 로직을 제거하고, 파라미터로 받은 persona로 심사합니다.
   */
  private async evaluateSingle(
    JudgeConfig: JudgeConfig,
    dto: EvaluateSubmissionDto,
  ): Promise<PersonaResult> {
    const gmsKey = this.configService.get<string>('GMS_API_KEY');
    const url = 'https://gms.ssafy.io/gmsapi/api.openai.com/v1/chat/completions';

    // 문맥 데이터 조립 (기존 로직 유지한다고 가정)
    // 이 함수는 질문자님의 코드에 포함되어 있지 않아, 있다고 가정하고 작성합니다.
    const contextPrompt = this.buildContextPrompt(dto);

    try {
      const response = await firstValueFrom(
        this.httpService.post<any>(
          url,
          {
            model: 'gpt-5-mini', // 모델명 유지
            messages: [
              {
                role: 'system',
                // 3번 수정사항: 선택된 persona의 텍스트 사용
                content: `${JudgeConfig.persona}
                          
                          [평가 기준]
                          1. 제시된 '장르'의 분위기를 잘 살렸는가?
                          2. 제공된 '이미지들의 태그와 설명'을 문장에 잘 녹여냈는가?
                          3. 말이 되지는 않아도 앞 내용과 완전히 끊기지 않고 자연스럽게 이어지는가?
                          4. 이야기가 완결성을 갖추었는가?
                          5. 현실로 돌아오지 않고 끝까지 개소리를 유지하는가?

                          위 기준을 바탕으로 평가하고, 반드시 아래 JSON 포맷으로만 응답해.
                          {"score": 0~100사이정수, "comment": "너의 말투로 된 200자 이내의 평가"}`,
              },
              {
                role: 'user',
                content: contextPrompt,
              },
            ],
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              Authorization: `Bearer ${gmsKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const content = response.data.choices[0].message.content;
      const result = JSON.parse(content);

      return {
        personaName: JudgeConfig.name, // 3번 수정사항: name 사용
        score: result.score,
        comment: result.comment,
      };
    } catch (error: any) {
      this.logger.error(`${JudgeConfig.name} 평가 실패`, error.response?.data || error.message);
      // 하나가 실패해도 전체가 죽지 않게 하려면 여기서 기본값을 리턴할 수도 있음
      // 현재는 에러를 던지도록 유지
      throw new InternalServerErrorException(`${JudgeConfig.name} AI 평가 중 오류 발생`);
    }
  }

  /**
   * [메인] 병렬 심사 요청 함수
   * 저장된 심사위원 이름 목록(judgeNames)과 게임 데이터(dto)를 받아 병렬로 처리합니다.
   */
  async evaluateMultiple(
    judgeNames: string[],
    dto: EvaluateSubmissionDto,
  ): Promise<PersonaResult[]> {
    this.logger.log(`병렬 심사 시작: 심사위원 ${judgeNames.join(', ')}`);

    // 1. 이름으로 실제 페르소나 객체 찾기
    const targetPersonas = judgeNames.map((name) => {
      const found = PERSONAS.find((p) => p.name === name);
      if (!found) {
        throw new NotFoundException(`페르소나를 찾을 수 없습니다: ${name}`);
      }
      return found;
    });

    // 2. Promise.all로 병렬 요청 생성
    const promises = targetPersonas.map(
      (persona) => this.evaluateSingle(persona, dto), // 아래 분리된 함수 호출
    );

    // 3. 동시에 실행하고 결과 기다림
    const results = await Promise.all(promises);

    return results;
  }

  private buildContextPrompt(dto: EvaluateSubmissionDto): string {
    const imagesInfo = dto.images
      .map(
        (img, idx) =>
          `[이미지 ${idx + 1}]
           - 태그: ${img.tags.join(', ')}
           - 설명: ${img.description}`,
      )
      .join('\n\n');

    return `
      다음 정보를 바탕으로 작성된 문장을 평가해줘.

      === [제시된 조건] ===
      1. 목표 장르: ${dto.genre}
      
      2. 참고 이미지 정보:
      ${imagesInfo}

      === [사용자가 작성한 문장] ===
      "${dto.sentence}"
    `;
  }
}
