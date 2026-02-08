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
exports.AiJudgeController = void 0;
const common_1 = require("@nestjs/common");
const ai_judges_service_1 = require("./ai-judges.service");
const judge_dto_1 = require("./dto/judge.dto");
let AiJudgeController = class AiJudgeController {
    aiJudgeService;
    constructor(aiJudgeService) {
        this.aiJudgeService = aiJudgeService;
    }
    async evaluate(dto) {
        const { judgeIds, ...submissionDto } = dto;
        const targetJudges = this.aiJudgeService.mapIdsToJudges(judgeIds);
        return this.aiJudgeService.evaluateMultiple(targetJudges, submissionDto);
    }
};
exports.AiJudgeController = AiJudgeController;
__decorate([
    (0, common_1.Post)('evaluate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [judge_dto_1.EvaluateRequestDto]),
    __metadata("design:returntype", Promise)
], AiJudgeController.prototype, "evaluate", null);
exports.AiJudgeController = AiJudgeController = __decorate([
    (0, common_1.Controller)('ai-judge'),
    __metadata("design:paramtypes", [ai_judges_service_1.AiJudgeService])
], AiJudgeController);
//# sourceMappingURL=ai-judges.controller.js.map