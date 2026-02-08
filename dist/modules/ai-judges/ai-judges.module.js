"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiJudgeModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const ai_judges_controller_1 = require("./ai-judges.controller");
const ai_judges_service_1 = require("./ai-judges.service");
const ai_judges_gateway_1 = require("./ai-judges.gateway");
const ai_judges_repository_1 = require("./ai-judges.repository");
const games_module_1 = require("../games/games.module");
let AiJudgeModule = class AiJudgeModule {
};
exports.AiJudgeModule = AiJudgeModule;
exports.AiJudgeModule = AiJudgeModule = __decorate([
    (0, common_1.Module)({
        imports: [axios_1.HttpModule, config_1.ConfigModule, games_module_1.GamesModule],
        controllers: [ai_judges_controller_1.AiJudgeController],
        providers: [ai_judges_service_1.AiJudgeService, ai_judges_gateway_1.AiJudgesGateway, ai_judges_repository_1.AiJudgesRepository],
        exports: [ai_judges_service_1.AiJudgeService],
    })
], AiJudgeModule);
//# sourceMappingURL=ai-judges.module.js.map