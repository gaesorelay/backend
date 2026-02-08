import { Server } from 'socket.io';
import { AiJudgeService } from '../../modules/ai-judges/ai-judges.service';
export declare class AiJudgesGateway {
    private readonly aiJudgeService;
    server: Server;
    private logger;
    constructor(aiJudgeService: AiJudgeService);
    handleJudging(data: {
        roomId: string;
    }): Promise<void>;
}
