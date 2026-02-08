"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamesRepository = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const redis_keys_1 = require("../../common/constants/redis.keys");
let GamesRepository = class GamesRepository {
    client;
    constructor(client) {
        this.client = client;
    }
    async createGame(state) {
        const key = redis_keys_1.redisKeys.roomGameState(state.roomUuid);
        await this.client.set(key, JSON.stringify(state), 'EX', 60 * 60);
    }
    async getGame(roomUuid) {
        const key = redis_keys_1.redisKeys.roomGameState(roomUuid);
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
    }
    async updateGame(roomUuid, applyChange) {
        const key = redis_keys_1.redisKeys.roomGameState(roomUuid);
        const client = this.client.duplicate();
        try {
            for (let attempt = 0; attempt < 5; attempt += 1) {
                await client.watch(key);
                const data = await client.get(key);
                if (!data) {
                    await client.unwatch();
                    return null;
                }
                const state = JSON.parse(data);
                const changed = applyChange(state);
                if (!changed) {
                    await client.unwatch();
                    return state;
                }
                const tx = client.multi();
                tx.set(key, JSON.stringify(state), 'KEEPTTL');
                const result = await tx.exec();
                if (result) {
                    return state;
                }
            }
            throw new Error(`[GamesRepository] updateGame conflict retry exceeded: ${roomUuid}`);
        }
        finally {
            try {
                await client.quit();
            }
            catch {
                client.disconnect();
            }
        }
    }
    async saveGame(state) {
        const key = redis_keys_1.redisKeys.roomGameState(state.roomUuid);
        await this.client.set(key, JSON.stringify(state), 'KEEPTTL');
    }
    async deleteGame(roomUuid) {
        const key = redis_keys_1.redisKeys.roomGameState(roomUuid);
        await this.client.del(key);
    }
    async updateJudges(roomUuid, judgeIds) {
        const state = await this.updateGame(roomUuid, (gameState) => {
            gameState.aiJudgeIDs = judgeIds;
            return true;
        });
        if (!state) {
            console.warn(`[GamesRepo] Game state missing. Update judges failed: ${roomUuid}`);
        }
    }
    async getGameJudgeIds(roomUuid) {
        const key = redis_keys_1.redisKeys.roomGameState(roomUuid);
        const data = await this.client.get(key);
        if (!data)
            return [];
        const state = JSON.parse(data);
        return state.aiJudgeIDs || [];
    }
    async updateGameImages(roomUuid, imageIds) {
        const state = await this.updateGame(roomUuid, (gameState) => {
            gameState.imageIDs = imageIds;
            return true;
        });
        if (!state) {
            console.warn(`[GamesRepo] Game state missing. Update images failed: ${roomUuid}`);
        }
    }
    async addStorySegment(roomUuid, text) {
        await this.client.rpush(`game:${roomUuid}:story`, text);
    }
    async getFullStory(roomUuid) {
        return await this.client.lrange(`game:${roomUuid}:story`, 0, -1);
    }
};
exports.GamesRepository = GamesRepository;
exports.GamesRepository = GamesRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [ioredis_1.default])
], GamesRepository);
//# sourceMappingURL=games.repository.js.map