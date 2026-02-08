import { Redis } from 'ioredis';
export declare class AiJudgesRepository {
    private readonly client;
    constructor(client: Redis);
}
