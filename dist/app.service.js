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
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
let AppService = class AppService {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    getHello() {
        return 'DogSound Relay Server Running!';
    }
    async createTestRoom() {
        const roomUuid = 'test-room-uuid-1234';
        const roomKey = `room:${roomUuid}:info`;
        await this.redis.hset(roomKey, {
            owner_user_token: 'user-token-abc',
            status: 'WAITING',
            config: JSON.stringify({
                maxPlayers: 8,
                storytellerCount: 4,
                rounds: 3,
                roundTime: 60,
                voteTime: 30,
            }),
            created_at: new Date().toISOString(),
        });
        const roomInfo = await this.redis.hgetall(roomKey);
        return roomInfo;
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [ioredis_1.default])
], AppService);
//# sourceMappingURL=app.service.js.map