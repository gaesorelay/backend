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
import { AiJudgesRepository } from './ai-judges.repository';
import { JudgeConfig, PERSONAS } from './personas.constant';
import { GamesService } from '../games/games.service';

@Injectable()
export class AiJudgeService {
  private readonly logger = new Logger(AiJudgeService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly aiJudgesRepository: AiJudgesRepository,
    private readonly gamesService: GamesService,
  ) {}

  /**
   * [신규] 심사위원 선정 및 저장 (RoomsService가 호출함)
   */
  async selectAndSaveJudges(roomUuid: string): Promise<JudgeConfig[]> {
    const fixedJudgeIds = [1, 10, 12]; // 멍성재, 카니, 운동현
    const selectedJudges: JudgeConfig[] = [];

    for (const id of fixedJudgeIds) {
      const judge = PERSONAS.find((p) => p.id === id);
      if (judge) selectedJudges.push(judge);
    }

    // 3. ⭐️ [변경] 직접 저장 안 하고 GamesService에게 위임!
    await this.gamesService.updateGameJudges(roomUuid, fixedJudgeIds);

    return selectedJudges;
  }

  // ⭐️ [수정] 심사위원 명단 조회
  async getSelectedJudges(roomUuid: string): Promise<number[]> {
    // 1. GamesService에게 ID 리스트 요청
    const judgeIds = await this.gamesService.getJudgeIds(roomUuid); // [0, 2, 4]

    return judgeIds;
  }

  /**
   * [수정] 방 번호로 심사 진행
   */
  async evaluateRoom(roomUuid: string, dto: any): Promise<PersonaResult[]> {
    const judgeIds = await this.getSelectedJudges(roomUuid);

    if (!judgeIds || judgeIds.length === 0) {
      throw new NotFoundException('선정된 심사위원이 없습니다.');
    }

    // 1-2. ID -> JudgeConfig 객체로 변환
    const targetJudges = this.mapIdsToJudges(judgeIds);

    // 1-3. 병렬 심사 위임 (코드 재사용!)
    return this.evaluateMultiple(targetJudges, dto);
  }

  /**
   * [2. 테스트 및 공용] 다중 심사 실행
   * JudgeConfig 객체 배열을 받아 병렬로 처리합니다.
   * (컨트롤러나 evaluateRoom에서 이 메서드를 사용합니다)
   */
  async evaluateMultiple(judges: JudgeConfig[], dto: any): Promise<PersonaResult[]> {
    const promises = judges.map((judge) => this.evaluateSingle(judge, dto));

    return await Promise.all(promises);
  }

  /**
   * [내부용] 단일 심사 함수
   * 랜덤 선택 로직을 제거하고, 파라미터로 받은 persona로 심사합니다.
   */
  async evaluateSingle(judge: JudgeConfig, dto: EvaluateSubmissionDto): Promise<PersonaResult> {
    const gmsKey = this.configService.get<string>('GMS_API_KEY');
    const url = 'https://gms.ssafy.io/gmsapi/api.openai.com/v1/chat/completions';

    // 문맥 데이터 조립 (기존 로직 유지한다고 가정)
    const contextPrompt = this.buildContextPrompt(dto);

    try {
      const response = await firstValueFrom(
        this.httpService.post<any>(
          url,
          {
            model: 'gpt-4o-mini', // 모델명 유지
            messages: [
              {
                role: 'system',
                // 3번 수정사항: 선택된 judge의 텍스트 사용
                content: `
                    다음은 너의 페르소나이다. ${judge.persona}

                    너는 방금 끝난 릴레이 스토리를 읽고 반응하는 심사위원이다.

                    공통 규칙 (모든 페르소나 공통)
                    - 현실성이 없는 것을 감점 요소로 삼지 않는다.
                    - 느낌표는 절대 쓰지 않는다.
                    - 반드시 코멘트에 스토리 내용이 직접적으로 언급돼야 한다.
                    - 코멘트는 1~2문장.
                    - 점수는 60~100.

                    출력은 아래 JSON만 허용한다.
                    {"score": 60~100 사이 정수, "comment": "1~2문장, 70자 이내"}`,
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
        personaName: judge.name, // 3번 수정사항: name 사용
        score: result.score,
        comment: result.comment,
      };
    } catch (error: any) {
      this.logger.error(`${judge.name} 평가 실패`, error.response?.data || error.message);
      // 하나가 실패해도 전체가 죽지 않게 하려면 여기서 기본값을 리턴할 수도 있음
      // 현재는 에러를 던지도록 유지
      throw new InternalServerErrorException(`${judge.name} AI 평가 중 오류 발생`);
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

  // [Helper] ID 배열을 JudgeConfig 배열로 변환하는 헬퍼 함수
  mapIdsToJudges(ids: number[]): JudgeConfig[] {
    return ids.map((id) => {
      const found = PERSONAS.find((p) => p.id === id);
      if (!found) throw new NotFoundException(`심사위원 데이터 없음: ${id}`);
      return found;
    });
  }
}
