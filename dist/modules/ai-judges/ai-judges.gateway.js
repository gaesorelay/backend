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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiJudgesGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const ai_judges_service_1 = require("../../modules/ai-judges/ai-judges.service");
let AiJudgesGateway = class AiJudgesGateway {
    aiJudgeService;
    server;
    logger = new common_1.Logger('EventsGateway');
    constructor(aiJudgeService) {
        this.aiJudgeService = aiJudgeService;
    }
    async handleJudging(data) {
        this.logger.log(`🤖 심사 요청 수신: 방 ${data.roomId}`);
        try {
            const storyData = {
                genre: '막장드라마',
                images: [
                    { tags: ['귀부인', '와인'], description: '귀부인이 와인잔을 깨트리고 있다.' },
                    { tags: ['스포츠카', '트럭'], description: '스포츠카가 트럭과 충돌하기 직전이다.' },
                    { tags: ['김치', '싸대기'], description: '여성이 김치로 싸대기를 때리고 있다.' },
                    { tags: ['점', '복수'], description: '거울을 보며 눈 밑에 점을 찍고 있다.' },
                ],
                sentence: "청담동 사모님은 와인잔을 깼는데, 스포츠카를 타고 도주하다 트럭과 충돌해 기억을 잃었으나, 기적적으로 기억을 되찾고 김치 싸대기를 날리며 점을 찍고 '복수할거야!'라고 소리쳤다.",
            };
            const results = await this.aiJudgeService.evaluateRoom(data.roomId, storyData);
            this.logger.log(`✅ 심사 완료: 방 ${data.roomId}, 결과 ${results.length}건`);
            this.server.to(data.roomId).emit('judging_finished', {
                results: results,
            });
        }
        catch (error) {
            this.logger.error(`심사 중 에러 발생: ${error.message}`);
            this.server.to(data.roomId).emit('error', {
                message: 'AI 심사 중 오류가 발생했습니다.',
            });
        }
    }
};
exports.AiJudgesGateway = AiJudgesGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], AiJudgesGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('request_judging'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiJudgesGateway.prototype, "handleJudging", null);
exports.AiJudgesGateway = AiJudgesGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: 'game',
        cors: {
            origin: '*',
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [ai_judges_service_1.AiJudgeService])
], AiJudgesGateway);
//# sourceMappingURL=ai-judges.gateway.js.map