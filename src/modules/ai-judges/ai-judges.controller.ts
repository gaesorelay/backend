import { Body, Controller, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { AiJudgeService } from './ai-judges.service';
import { EvaluateSubmissionDto, PersonaResult } from './dto/judge.dto';

@Controller('ai-judge')
export class AiJudgeController {
  constructor(private readonly aiJudgeService: AiJudgeService) {}

  @Post('evaluate')
  @UsePipes(new ValidationPipe({ transform: true }))
  async evaluate(@Body() dto: EvaluateSubmissionDto): Promise<PersonaResult> {
    return this.aiJudgeService.evaluateSubmission(dto);
  }
}
