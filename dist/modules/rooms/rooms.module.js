"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsModule = void 0;
const common_1 = require("@nestjs/common");
const rooms_controller_1 = require("./rooms.controller");
const rooms_repository_1 = require("./rooms.repository");
const rooms_service_1 = require("./rooms.service");
const rooms_gateway_1 = require("./rooms.gateway");
const ai_judges_module_1 = require("../ai-judges/ai-judges.module");
const games_module_1 = require("../games/games.module");
const timer_module_1 = require("../timer/timer.module");
const game_flow_service_1 = require("./game-flow.service");
const room_status_subject_1 = require("./room-status.subject");
const throttler_1 = require("@nestjs/throttler");
let RoomsModule = class RoomsModule {
};
exports.RoomsModule = RoomsModule;
exports.RoomsModule = RoomsModule = __decorate([
    (0, common_1.Module)({
        imports: [(0, common_1.forwardRef)(() => ai_judges_module_1.AiJudgeModule), games_module_1.GamesModule, timer_module_1.TimerModule, throttler_1.ThrottlerModule],
        controllers: [rooms_controller_1.RoomsController],
        providers: [rooms_service_1.RoomsService, rooms_repository_1.RoomsRepository, rooms_gateway_1.RoomsGateway, game_flow_service_1.GameFlowService, room_status_subject_1.RoomStatusSubject],
        exports: [rooms_service_1.RoomsService],
    })
], RoomsModule);
//# sourceMappingURL=rooms.module.js.map