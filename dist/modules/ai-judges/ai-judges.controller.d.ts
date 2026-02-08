import { AiJudgeService } from './ai-judges.service';
import { EvaluateRequestDto, PersonaResult } from './dto/judge.dto';
export declare class AiJudgeController {
    private readonly aiJudgeService;
    constructor(aiJudgeService: AiJudgeService);
    evaluate(dto: EvaluateRequestDto): Promise<PersonaResult[]>;
}
