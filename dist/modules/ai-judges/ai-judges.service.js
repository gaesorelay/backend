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
var AiJudgeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiJudgeService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const ai_judges_repository_1 = require("./ai-judges.repository");
const personas_constant_1 = require("./personas.constant");
const games_service_1 = require("../games/games.service");
let AiJudgeService = AiJudgeService_1 = class AiJudgeService {
    httpService;
    configService;
    aiJudgesRepository;
    gamesService;
    logger = new common_1.Logger(AiJudgeService_1.name);
    constructor(httpService, configService, aiJudgesRepository, gamesService) {
        this.httpService = httpService;
        this.configService = configService;
        this.aiJudgesRepository = aiJudgesRepository;
        this.gamesService = gamesService;
    }
    async selectAndSaveJudges(roomUuid) {
        const tempPersonas = [...personas_constant_1.PERSONAS];
        const selectedJudges = [];
        for (let i = 0; i < 3; i++) {
            if (tempPersonas.length === 0)
                break;
            const randomIdx = Math.floor(Math.random() * tempPersonas.length);
            selectedJudges.push(tempPersonas[randomIdx]);
            tempPersonas.splice(randomIdx, 1);
        }
        const judgeIds = selectedJudges.map((j) => j.id);
        await this.gamesService.updateGameJudges(roomUuid, judgeIds);
        return selectedJudges;
    }
    async getSelectedJudges(roomUuid) {
        const judgeIds = await this.gamesService.getJudgeIds(roomUuid);
        return judgeIds;
    }
    async evaluateRoom(roomUuid, dto) {
        const judgeIds = await this.getSelectedJudges(roomUuid);
        if (!judgeIds || judgeIds.length === 0) {
            throw new common_1.NotFoundException('선정된 심사위원이 없습니다.');
        }
        const targetJudges = this.mapIdsToJudges(judgeIds);
        return this.evaluateMultiple(targetJudges, dto);
    }
    async evaluateMultiple(judges, dto) {
        const promises = judges.map((judge) => this.evaluateSingle(judge, dto));
        return await Promise.all(promises);
    }
    async evaluateSingle(judge, dto) {
        const gmsKey = this.configService.get('GMS_API_KEY');
        const url = 'https://gms.ssafy.io/gmsapi/api.openai.com/v1/chat/completions';
        const contextPrompt = this.buildContextPrompt(dto);
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(url, {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `
                    다음은 너의 페르소나이다. ${judge.persona}

                    너는 방금 끝난 릴레이 스토리를 읽고 반응하는 심사위원이다.

                    공통 규칙 (모든 페르소나 공통)
                    - 현실성이 없는 것을 감점 요소로 삼지 않는다.
                    - 느낌표는 절대 쓰지 않는다.
                    - 반드시 코멘트에 스토리 내용이 직접적으로 언급돼야 한다.
                    - 코멘트는 1~2문장.
                    - 점수는 60~100.

                    출력은 아래 JSON만 허용한다.
                    {"score": 60~100 사이 정수, "comment": "1~2문장, 70자 이내"}`,
                    },
                    {
                        role: 'user',
                        content: contextPrompt,
                    },
                ],
                response_format: { type: 'json_object' },
            }, {
                headers: {
                    Authorization: `Bearer ${gmsKey}`,
                    'Content-Type': 'application/json',
                },
            }));
            const content = response.data.choices[0].message.content;
            const result = JSON.parse(content);
            return {
                personaName: judge.name,
                score: result.score,
                comment: result.comment,
            };
        }
        catch (error) {
            this.logger.error(`${judge.name} 평가 실패`, error.response?.data || error.message);
            throw new common_1.InternalServerErrorException(`${judge.name} AI 평가 중 오류 발생`);
        }
    }
    buildContextPrompt(dto) {
        const imagesInfo = dto.images
            .map((img, idx) => `[이미지 ${idx + 1}]
           - 태그: ${img.tags.join(', ')}
           - 설명: ${img.description}`)
            .join('\n\n');
        return `
      다음 정보를 바탕으로 작성된 문장을 평가해줘.

      === [제시된 조건] ===
      1. 목표 장르: ${dto.genre}
      
      2. 참고 이미지 정보:
      ${imagesInfo}

      === [사용자가 작성한 문장] ===
      "${dto.sentence}"
    `;
    }
    mapIdsToJudges(ids) {
        return ids.map((id) => {
            const found = personas_constant_1.PERSONAS.find((p) => p.id === id);
            if (!found)
                throw new common_1.NotFoundException(`심사위원 데이터 없음: ${id}`);
            return found;
        });
    }
};
exports.AiJudgeService = AiJudgeService;
exports.AiJudgeService = AiJudgeService = AiJudgeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        ai_judges_repository_1.AiJudgesRepository,
        games_service_1.GamesService])
], AiJudgeService);
//# sourceMappingURL=ai-judges.service.js.map