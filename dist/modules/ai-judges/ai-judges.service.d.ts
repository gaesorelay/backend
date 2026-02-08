import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { EvaluateSubmissionDto, PersonaResult } from './dto/judge.dto';
import { AiJudgesRepository } from './ai-judges.repository';
import { JudgeConfig } from './personas.constant';
import { GamesService } from '../games/games.service';
export declare class AiJudgeService {
    private readonly httpService;
    private readonly configService;
    private readonly aiJudgesRepository;
    private readonly gamesService;
    private readonly logger;
    constructor(httpService: HttpService, configService: ConfigService, aiJudgesRepository: AiJudgesRepository, gamesService: GamesService);
    selectAndSaveJudges(roomUuid: string): Promise<JudgeConfig[]>;
    getSelectedJudges(roomUuid: string): Promise<number[]>;
    evaluateRoom(roomUuid: string, dto: any): Promise<PersonaResult[]>;
    evaluateMultiple(judges: JudgeConfig[], dto: any): Promise<PersonaResult[]>;
    evaluateSingle(judge: JudgeConfig, dto: EvaluateSubmissionDto): Promise<PersonaResult>;
    private buildContextPrompt;
    mapIdsToJudges(ids: number[]): JudgeConfig[];
}
