import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { EvaluateSubmissionDto, PersonaResult } from './dto/judge.dto';
import { PERSONAS } from './personas.constant';

@Injectable()
export class AiJudgeService {
  private readonly logger = new Logger(AiJudgeService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // 반환 타입이 배열([])에서 단일 객체(PersonaResult)로 변경됨
  async evaluateSubmission(dto: EvaluateSubmissionDto): Promise<PersonaResult> {
    const gmsKey = this.configService.get<string>('GMS_API_KEY');
    // 4o mini
    const url = 'https://gms.ssafy.io/gmsapi/api.openai.com/v1/chat/completions';

    // 1. 랜덤 페르소나 선택
    const randomIndex = Math.floor(Math.random() * PERSONAS.length);
    const selectedPersona = PERSONAS[randomIndex];

    this.logger.log(`선택된 페르소나: ${selectedPersona.name}`);

    // 2. 문맥 데이터 조립
    const contextPrompt = this.buildContextPrompt(dto);

    try {
      // 3. API 요청 (단일 호출)
      const response = await firstValueFrom(
        this.httpService.post<any>(
          url,
          {
            model: 'gpt-5-mini',
            messages: [
              {
                role: 'system',
                content: `${selectedPersona.prompt}
                          
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

      // 4. 응답 파싱
      const content = response.data.choices[0].message.content;
      const result = JSON.parse(content);

      return {
        personaName: selectedPersona.name,
        score: result.score,
        comment: result.comment,
      };
    } catch (error: any) {
      this.logger.error(`${selectedPersona.name} 평가 실패`, error.response?.data || error.message);

      // 에러 발생 시 예외를 던지거나 기본값 반환
      throw new InternalServerErrorException('AI 평가 중 오류가 발생했습니다.');
    }
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
