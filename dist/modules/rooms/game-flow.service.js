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
var GameFlowService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameFlowService = void 0;
const common_1 = require("@nestjs/common");
const rooms_repository_1 = require("./rooms.repository");
const timer_service_1 = require("../timer/timer.service");
const games_service_1 = require("../games/games.service");
const ai_judges_service_1 = require("../ai-judges/ai-judges.service");
const room_status_subject_1 = require("./room-status.subject");
const game_flow_constants_1 = require("../../common/constants/game-flow.constants");
let GameFlowService = GameFlowService_1 = class GameFlowService {
    roomsRepository;
    timerService;
    gamesService;
    aiJudgeService;
    roomStatusSubject;
    logger = new common_1.Logger(GameFlowService_1.name);
    contexts = new Map();
    aiVotePromises = new Map();
    unsubscribe;
    constructor(roomsRepository, timerService, gamesService, aiJudgeService, roomStatusSubject) {
        this.roomsRepository = roomsRepository;
        this.timerService = timerService;
        this.gamesService = gamesService;
        this.aiJudgeService = aiJudgeService;
        this.roomStatusSubject = roomStatusSubject;
    }
    onModuleInit() {
        this.unsubscribe = this.roomStatusSubject.subscribe((event) => {
            void this.handleStatusChange(event.roomUuid, event.status);
        });
    }
    onModuleDestroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
    startGameFlow(roomUuid, emitStatus, emitVoteResult) {
        this.contexts.set(roomUuid, { emitStatus, emitVoteResult });
        void this.setRoomStatus(roomUuid, 'WAITING');
    }
    getContext(roomUuid) {
        return this.contexts.get(roomUuid);
    }
    async skipPhase(roomUuid) {
        const context = this.contexts.get(roomUuid);
        if (!context || !context.nextAction)
            return;
        if (context.currentStatus) {
            this.timerService.cancel(roomUuid, context.currentStatus);
        }
        const action = context.nextAction;
        context.nextAction = undefined;
        action();
    }
    async prevPhase(roomUuid) {
        const context = this.getContext(roomUuid);
        if (!context || !context.currentStatus)
            return;
        this.timerService.cancel(roomUuid, context.currentStatus);
        context.nextAction = undefined;
        if (context.currentStatus === 'PLAYING' && context.currentTurn) {
            const currentTurn = context.currentTurn;
            if (currentTurn <= 1) {
                await this.gamesService.rollbackStory(roomUuid, 0);
                await this.restartWaitingFromJudge(roomUuid, context);
                return;
            }
            const prevTurn = currentTurn - 1;
            await this.gamesService.rollbackStory(roomUuid, prevTurn - 1);
            const room = await this.roomsRepository.findById(roomUuid);
            const roundMs = (room?.config.roundTime ?? 60) * 1000;
            await this.startTurnFlow(roomUuid, context, prevTurn, context.totalTurns || game_flow_constants_1.TURN_COUNT, roundMs);
            return;
        }
        if (context.currentStatus === 'WAITING') {
            if (context.subStatus === 'JUDGE_SHUFFLE') {
                await this.handleWaiting(roomUuid, context);
                return;
            }
            await this.handleWaiting(roomUuid, context);
            return;
        }
        if (context.currentStatus === 'RESULTING' || context.currentStatus === 'ENDED') {
            const room = await this.roomsRepository.findById(roomUuid);
            const roundMs = (room?.config?.roundTime ?? 60) * 1000;
            const totalTurns = game_flow_constants_1.TURN_COUNT;
            await this.gamesService.rollbackStory(roomUuid, totalTurns - 1);
            context.currentStatus = 'PLAYING';
            await this.setRoomStatus(roomUuid, 'PLAYING');
            await this.startTurnFlow(roomUuid, context, totalTurns, totalTurns, roundMs);
            return;
        }
    }
    scheduleNext(roomUuid, context, status, delayMs, callback) {
        context.currentStatus = status;
        context.nextAction = callback;
        this.timerService.schedule({ roomUuid, status, delayMs }, () => {
            context.nextAction = undefined;
            callback();
        });
    }
    async resetFlow(roomUuid) {
        const context = this.contexts.get(roomUuid);
        if (!context)
            return;
        if (context.currentStatus) {
            this.timerService.cancel(roomUuid, context.currentStatus);
        }
        this.contexts.delete(roomUuid);
        this.aiVotePromises.delete(roomUuid);
        this.logger.log(`[resetFlow] Game flow reset for room ${roomUuid}`);
    }
    async handleStatusChange(roomUuid, status) {
        const context = this.contexts.get(roomUuid);
        if (!context)
            return;
        if (context.currentStatus && context.currentStatus !== status) {
            this.timerService.cancel(roomUuid, context.currentStatus);
        }
        context.currentStatus = status;
        if (status === 'WAITING') {
            await this.handleWaiting(roomUuid, context);
            return;
        }
        if (status === 'PLAYING') {
            await this.handlePlaying(roomUuid, context);
            return;
        }
        if (status === 'RESULTING') {
            await this.handleVoting(roomUuid, context);
            return;
        }
        if (status === 'ENDED') {
            await this.handleEnded(roomUuid, context);
        }
    }
    async handleWaiting(roomUuid, context) {
        const room = await this.roomsRepository.findById(roomUuid);
        if (!room)
            return;
        this.gamesService.resetVoteState(roomUuid);
        context.subStatus = 'CARD_SHUFFLE';
        context.emitStatus('WAITING', game_flow_constants_1.CARD_SHUFFLE_TIME, 'CARD_SHUFFLE');
        this.scheduleNext(roomUuid, context, 'WAITING', game_flow_constants_1.CARD_SHUFFLE_TIME, () => {
            this.restartWaitingFromJudge(roomUuid, context);
        });
    }
    async restartWaitingFromJudge(roomUuid, context) {
        context.subStatus = 'JUDGE_SHUFFLE';
        context.emitStatus('WAITING', game_flow_constants_1.JUDGE_SHUFFLE_TIME, 'JUDGE_SHUFFLE');
        this.scheduleNext(roomUuid, context, 'WAITING', game_flow_constants_1.JUDGE_SHUFFLE_TIME, () => {
            void this.setRoomStatus(roomUuid, 'PLAYING');
        });
    }
    async handlePlaying(roomUuid, context) {
        const room = await this.roomsRepository.findById(roomUuid);
        if (!room)
            return;
        const roundMs = room.config.roundTime * 1000;
        const totalTurns = game_flow_constants_1.TURN_COUNT;
        context.totalTurns = totalTurns;
        this.startTurnFlow(roomUuid, context, 1, totalTurns, roundMs);
    }
    async handleVoting(roomUuid, context) {
        const room = await this.roomsRepository.findById(roomUuid);
        if (!room)
            return;
        context.subStatus = 'STORY';
        context.emitStatus('RESULTING', game_flow_constants_1.STORY_TIME, 'STORY');
        this.scheduleNext(roomUuid, context, 'RESULTING', game_flow_constants_1.STORY_TIME, () => {
            const aiVotesPromise = this.buildAiJudgeScores(roomUuid);
            this.aiVotePromises.set(roomUuid, aiVotesPromise);
            const votingMs = room.config.voteTime * 1000;
            context.subStatus = 'VOTING';
            context.emitStatus('RESULTING', votingMs, 'VOTING');
            this.scheduleNext(roomUuid, context, 'RESULTING', votingMs, async () => {
                context.subStatus = 'JUDGE_RESULT';
                context.emitStatus('RESULTING', game_flow_constants_1.JUDGING_TIME, 'JUDGE_RESULT');
                await this.sendVoteResult(roomUuid, context);
                this.scheduleNext(roomUuid, context, 'RESULTING', game_flow_constants_1.JUDGING_TIME, () => {
                    void this.setRoomStatus(roomUuid, 'ENDED');
                });
            });
        });
    }
    async sendVoteResult(roomUuid, context) {
        const aiVotesPromise = this.aiVotePromises.get(roomUuid);
        const aiScores = aiVotesPromise ? await aiVotesPromise : null;
        let outcome = this.gamesService.getVoteOutcome(roomUuid);
        if (aiScores && aiScores.length > 0) {
            console.log(`\n🤖 [AI 심사 결과 - Room ${roomUuid}]`);
            aiScores.forEach((s) => {
                console.log(`   [${s.judgeName}] A: ${s.scoreTeamA} / B: ${s.scoreTeamB}`);
            });
            outcome = this.gamesService.applyAiJudgeVotes(roomUuid, aiScores);
            console.log('🔥 [DEBUG] 최종 outcome 데이터 확인:', JSON.stringify(outcome, null, 2));
        }
        if (context.emitVoteResult) {
            context.emitVoteResult(outcome);
        }
    }
    async handleEnded(roomUuid, context) {
        context.emitStatus('ENDED', 0, 'JUDGE_RESULT');
        this.gamesService.resetVoteState(roomUuid);
        this.aiVotePromises.delete(roomUuid);
        this.contexts.delete(roomUuid);
    }
    async startTurnFlow(roomUuid, context, turnIndex, totalTurns, roundMs) {
        const effectiveRoundMs = turnIndex === 1 ? roundMs + 3000 : roundMs;
        this.logger.log(`[startTurnFlow] room=${roomUuid} turn=${turnIndex}/${totalTurns} roundMs=${effectiveRoundMs}`);
        context.currentTurn = turnIndex;
        const displayStatus = `TURN${turnIndex}`;
        context.emitStatus('PLAYING', effectiveRoundMs, displayStatus);
        await this.gamesService.startTurn(roomUuid, turnIndex);
        this.scheduleNext(roomUuid, context, 'PLAYING', effectiveRoundMs, async () => {
            if (turnIndex < totalTurns) {
                await this.startTurnFlow(roomUuid, context, turnIndex + 1, totalTurns, roundMs);
            }
            else {
                void this.setRoomStatus(roomUuid, 'RESULTING');
            }
        });
    }
    async setRoomStatus(roomUuid, status) {
        const room = await this.roomsRepository.findById(roomUuid);
        if (!room)
            return;
        room.status = status;
        await this.roomsRepository.save(room, 60 * 60);
        this.roomStatusSubject.notify({ roomUuid, status });
    }
    async buildAiJudgeScores(roomUuid) {
        const teamAEvaluateDto = await this.gamesService.getEvaluateDto(roomUuid, 'A');
        const teamBEvaluateDto = await this.gamesService.getEvaluateDto(roomUuid, 'B');
        if (!teamAEvaluateDto || !teamBEvaluateDto) {
            return null;
        }
        console.time(`⏱️ AI Evaluation Time (${roomUuid})`);
        console.log(`🚀 Sending AI Request for Team A... (Room: ${roomUuid})`);
        console.log(`🚀 Sending AI Request for Team B... (Room: ${roomUuid})`);
        const startTime = Date.now();
        return Promise.all([
            this.aiJudgeService.evaluateRoom(roomUuid, teamAEvaluateDto),
            this.aiJudgeService.evaluateRoom(roomUuid, teamBEvaluateDto),
        ])
            .then(([teamAResults, teamBResults]) => {
            const duration = Date.now() - startTime;
            console.timeEnd(`⏱️ AI Evaluation Time (${roomUuid})`);
            console.log(`✅ AI Evaluation Completed in ${duration}ms`);
            const teamBMap = new Map(teamBResults.map((result) => [result.personaName, result]));
            return teamAResults
                .map((aResult) => {
                const bResult = teamBMap.get(aResult.personaName);
                if (!bResult)
                    return null;
                return {
                    judgeName: aResult.personaName,
                    commentA: aResult.comment,
                    commentB: bResult.comment,
                    scoreTeamA: aResult.score,
                    scoreTeamB: bResult.score,
                };
            })
                .filter((result) => result !== null);
        })
            .catch((error) => {
            console.error(`❌ AI Evaluation Failed:`, error);
            return null;
        });
    }
};
exports.GameFlowService = GameFlowService;
exports.GameFlowService = GameFlowService = GameFlowService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rooms_repository_1.RoomsRepository,
        timer_service_1.TimerService,
        games_service_1.GamesService,
        ai_judges_service_1.AiJudgeService,
        room_status_subject_1.RoomStatusSubject])
], GameFlowService);
//# sourceMappingURL=game-flow.service.js.map