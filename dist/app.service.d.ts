import Redis from 'ioredis';
export declare class AppService {
    private readonly redis;
    constructor(redis: Redis);
    getHello(): string;
    createTestRoom(): Promise<Record<string, string>>;
}
