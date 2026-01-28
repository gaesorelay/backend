import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { AiJudgeService } from './ai-judges.service';
// DTO 경로 확인 필요
import { EvaluateRequestDto, PersonaResult } from './dto/judge.dto';

@Controller('ai-judge')
export class AiJudgeController {
  constructor(private readonly aiJudgeService: AiJudgeService) {}

  @Post('evaluate')
  async evaluate(@Body() dto: EvaluateRequestDto): Promise<PersonaResult[]> {
    const { judgeIds, ...submissionDto } = dto;

    // 1. 문자열 이름 -> JudgeConfig 객체로 변환 (서비스의 헬퍼 함수 활용)
    const targetJudges = this.aiJudgeService.mapIdsToJudges(judgeIds);

    // 2. 병렬 심사 요청 (Redis 없이 즉시 실행 가능!)
    return this.aiJudgeService.evaluateMultiple(targetJudges, submissionDto);
  }
}
