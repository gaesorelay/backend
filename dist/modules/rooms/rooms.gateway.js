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
exports.RoomsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const rooms_service_1 = require("./rooms.service");
const join_room_dto_1 = require("./dto/join-room.dto");
const leave_team_dto_1 = require("./dto/leave-team.dto");
const kick_user_dto_1 = require("./dto/kick-user.dto");
const chat_dto_1 = require("./dto/chat.dto");
const ai_judges_service_1 = require("../ai-judges/ai-judges.service");
const games_service_1 = require("../games/games.service");
const common_2 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const ws_throttler_guard_1 = require("../../common/guards/ws-throttler.guard");
const game_flow_service_1 = require("./game-flow.service");
const common_3 = require("@nestjs/common");
const ws_exception_filter_1 = require("../../common/filters/ws-exception.filter");
const common_4 = require("@nestjs/common");
let RoomsGateway = class RoomsGateway {
    roomsService;
    aiJudgeService;
    gamesService;
    gameFlowService;
    server;
    logger = new common_1.Logger('RoomsGateway');
    constructor(roomsService, aiJudgeService, gamesService, gameFlowService) {
        this.roomsService = roomsService;
        this.aiJudgeService = aiJudgeService;
        this.gamesService = gamesService;
        this.gameFlowService = gameFlowService;
    }
    async handleJoinRoom(client, data) {
        this.logger.log(`join_room 요청: 방 ${data.roomId}, 닉네임 ${data.nickname}`);
        try {
            const room = await this.roomsService.getRoomById(data.roomId);
            if (room.isStarted) {
                return { status: 'error', message: '게임이 이미 시작된 방에는 입장할 수 없습니다.' };
            }
            const clientIp = this.getClientIp(client);
            const user = await this.roomsService.joinRoom(data.roomId, clientIp, data.nickname, client.id, data.avatarId, data.userToken);
            client.join(data.roomId);
            this.logger.log(`입장 성공: ${user.nickname} (Token: ${user.userToken}, Socket: ${client.id})`);
            const users = await this.roomsService.getUsersInRoom(data.roomId);
            this.server.to(data.roomId).emit('lobby_updated', {
                users: users,
            });
            this.server.to(data.roomId).emit('chat_message', {
                nickname: 'SYSTEM',
                message: `${user.nickname}님이 입장했습니다.`,
                type: 'system',
            });
            return { status: 'success', data: user };
        }
        catch (error) {
            this.logger.error(`입장 실패: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }
    async handleLeaveRoom(client) {
        this.logger.log(`leave_room 요청: socket ${client.id}`);
        try {
            let shouldCloseRoom = false;
            let closingRoomUuid = null;
            try {
                const user = await this.roomsService.getUserBySocket(client.id);
                const room = await this.roomsService.getRoomById(user.roomUuid);
                shouldCloseRoom = user.isHost && !room.isStarted;
                closingRoomUuid = user.roomUuid;
            }
            catch (precheckError) {
                const message = precheckError instanceof Error ? precheckError.message : 'unknown error';
                this.logger.warn(`leave_room precheck failed: ${message}`);
            }
            const result = await this.roomsService.leaveRoom(client.id);
            if (!result) {
                return { status: 'error', message: '유저 정보를 찾을 수 없습니다.' };
            }
            const { roomUuid, nickname } = result;
            client.leave(roomUuid);
            const users = await this.roomsService.getUsersInRoom(roomUuid);
            this.server.to(roomUuid).emit('lobby_updated', {
                users: users,
            });
            this.server.to(roomUuid).emit('chat_message', {
                nickname: 'SYSTEM',
                message: `${nickname}님이 퇴장했습니다.`,
                type: 'system',
            });
            if (shouldCloseRoom && closingRoomUuid === roomUuid) {
                this.server.to(roomUuid).emit('room_closed', {
                    reason: '방장이 나가서 방이 종료되었습니다.',
                });
            }
            return { status: 'success' };
        }
        catch (error) {
            this.logger.error(`leave_room failed: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }
    async handleRequestRoomInfo(client, data) {
        this.logger.log(`방 유저 목록 요청: ${data.roomId} (by ${client.id})`);
        try {
            const room = await this.roomsService.getRoomById(data.roomId);
            const users = await this.roomsService.getUsersInRoom(data.roomId);
            return {
                status: 'success',
                data: {
                    roomId: room.roomUuid,
                    title: room.title,
                    config: room.config,
                    status: room.status,
                    users: users,
                },
            };
        }
        catch (error) {
            this.logger.error(`방 정보 요청 실패: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }
    async handleUpdateConfig(client, data) {
        this.logger.log(`update_room_config 요청: socket ${client.id}, config: ${JSON.stringify(data.config)}`);
        const room = await this.roomsService.updateRoomConfig(client.id, data.config);
        this.server.to(room.roomUuid).emit('room_config_updated', { config: room.config });
    }
    async handleGameReady(client, data) {
        this.logger.log(`game_ready request: socket ${client.id}, ready ${data.isReady}`);
        try {
            const { updatedUser, users, roomUuid } = await this.roomsService.setUserReady(client.id, data.isReady);
            this.server.to(roomUuid).emit('lobby_updated', {
                users,
                updatedUser,
            });
            return { status: 'success', data: updatedUser };
        }
        catch (error) {
            this.logger.error(`game_ready failed: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }
    async handleChat(client, data) {
        try {
            const user = await this.roomsService.getUserBySocket(client.id);
            const cleanMessage = this.gamesService.convertToDogSound(data.message);
            this.server.to(user.roomUuid).emit('chat_message', {
                senderId: client.id,
                publicUserId: user.publicUserId,
                nickname: user.nickname,
                avatarId: user.avatarId,
                team: user.team,
                isHost: user.isHost,
                message: cleanMessage,
                timestamp: Date.now(),
            });
        }
        catch (error) {
            return { status: 'error', message: '메시지 전송 실패' };
        }
    }
    async handleReaction(client, data) {
        try {
            const user = await this.roomsService.getUserBySocket(client.id);
            if (!user)
                return;
            this.server.to(user.roomUuid).emit('receive_reaction', {
                emoji: data.emoji,
                nickname: data.nickname,
            });
        }
        catch (error) {
            this.logger.error(`리액션 전송 실패: ${error.message}`);
        }
    }
    async handleTyping(client, data) {
        try {
            const user = await this.roomsService.getUserBySocket(client.id);
            const roomId = user.roomUuid;
            const cleanMessage = this.gamesService.convertToDogSound(data.text);
            client.to(roomId).emit('story_update', {
                team: data.team,
                text: cleanMessage,
                writerToken: data.userToken,
            });
        }
        catch (e) {
            this.logger.error(e);
        }
    }
    async handleSubmitStory(client, data) {
        try {
            const user = await this.roomsService.getUserBySocket(client.id);
            if (!user)
                throw new websockets_1.WsException('유저 세션 없음');
            const clean = this.gamesService.convertToDogSound(data.message);
            await this.gamesService.submitStory(user.roomUuid, data.userToken, data.team, clean, data.turn);
            this.server.to(user.roomUuid).emit('story_submitted', {
                team: data.team,
                writerToken: data.userToken,
                text: clean,
            });
            return { status: 'success' };
        }
        catch (error) {
            return { status: 'error', message: error.message };
        }
    }
    async handleJoinTeam(client, data) {
        this.logger.log(`join_team request: socket ${client.id}, target ${data.public_user_id}, team ${data.team}, slot ${data.slot_index}`);
        try {
            const { updatedUser, users, roomUuid } = await this.roomsService.joinTeam(client.id, data.public_user_id, data.slot_index, data.team);
            this.server.to(roomUuid).emit('lobby_updated', {
                users,
                updatedUser,
            });
            this.server.to(roomUuid).emit('chat_message', {
                nickname: 'SYSTEM',
                message: `${updatedUser.nickname}님이 ${updatedUser.team}팀으로 이동했습니다.`,
                type: 'system',
            });
            return {
                status: 'success',
                data: {
                    updatedUser: {
                        publicUserId: updatedUser.publicUserId,
                        team: updatedUser.team,
                        role: updatedUser.role,
                        slotIndex: updatedUser.slotIndex,
                    },
                },
            };
        }
        catch (error) {
            this.logger.error(`join_team failed: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }
    async handleLeaveTeam(client, data) {
        this.logger.log(`leave_team request: socket ${client.id}, target ${data.public_user_id}, team ${data.team}, slot ${data.slot_index}`);
        try {
            const { updatedUser, users, roomUuid } = await this.roomsService.leaveTeam(client.id, data.public_user_id, data.slot_index, data.team);
            this.server.to(roomUuid).emit('lobby_updated', {
                users,
                updatedUser,
            });
            return {
                status: 'success',
                data: {
                    updatedUser: {
                        publicUserId: updatedUser.publicUserId,
                        team: updatedUser.team ?? 'NONE',
                        role: updatedUser.role,
                        slotIndex: updatedUser.slotIndex,
                    },
                },
            };
        }
        catch (error) {
            this.logger.error(`leave_team failed: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }
    async handleAutoFill(client, data) {
        this.logger.log(`auto_fill 요청: ${client.id}`);
        try {
            const { updatedUsers, roomUuid } = await this.roomsService.autoFillSlots(client.id);
            this.server.to(roomUuid).emit('lobby_updated', {
                users: updatedUsers,
            });
            return { status: 'success' };
        }
        catch (error) {
            return { status: 'error', message: error.message };
        }
    }
    async handleSkipPhase(client) {
        this.logger.log(`skip_phase 요청: ${client.id}`);
        try {
            const user = await this.roomsService.getUserBySocket(client.id);
            await this.gameFlowService.skipPhase(user.roomUuid);
            return { status: 'success' };
        }
        catch (error) {
            return { status: 'error', message: error.message };
        }
    }
    async handlePrevPhase(client) {
        this.logger.log(`prev_phase 요청: ${client.id}`);
        try {
            const user = await this.roomsService.getUserBySocket(client.id);
            await this.gameFlowService.prevPhase(user.roomUuid);
            return { status: 'success' };
        }
        catch (error) {
            return { status: 'error', message: error.message };
        }
    }
    async handleStartGame(client, data) {
        try {
            const { roomUuid } = await this.roomsService.startGame(client.id);
            const imageIds = await this.gamesService.selectAndSaveImages(roomUuid);
            const judges = await this.aiJudgeService.selectAndSaveJudges(roomUuid);
            this.server.to(roomUuid).emit('game_started', {
                imageIds: imageIds,
                judges: judges,
            });
            await this.roomsService.startGameFlow(roomUuid, (status, durationMs, displayStatus) => {
                this.emitPhase(roomUuid, status, durationMs, displayStatus);
            }, (outcome) => {
                this.server.to(roomUuid).emit('vote_result', outcome);
            });
            return { status: 'success' };
        }
        catch (error) {
            this.logger.error(`게임 시작 실패: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }
    async handleSubmitVote(client, data) {
        try {
            const user = await this.roomsService.getUserBySocket(client.id);
            const room = await this.roomsService.getRoomById(user.roomUuid);
            if (room.status !== 'RESULTING') {
                return { status: 'error', message: 'Resulting is not open.' };
            }
            const outcome = this.gamesService.submitAudienceVote(user.roomUuid, data.team);
            this.server.to(user.roomUuid).emit('vote_updated', {
                votesTeamA: outcome.votesTeamA,
                votesTeamB: outcome.votesTeamB,
            });
            return { status: 'success', data: outcome };
        }
        catch (error) {
            return { status: 'error', message: error.message };
        }
    }
    async handleRestartGame(client) {
        this.logger.log(`restart_game 요청: ${client.id}`);
        try {
            const { roomUuid, users } = await this.roomsService.restartGame(client.id);
            this.server.to(roomUuid).emit('lobby_updated', {
                users,
            });
            this.emitPhase(roomUuid, 'WAITING', 0, 'LOBBY');
            return { status: 'success' };
        }
        catch (error) {
            return { status: 'error', message: error.message };
        }
    }
    async handleKickUser(client, data) {
        this.logger.log(`kick_user request: socket ${client.id}, target ${data.public_user_id}`);
        try {
            const { kickedPublicUserId, users, roomUuid, kickedSocketId } = await this.roomsService.kickUser(client.id, data.public_user_id);
            this.server.to(roomUuid).emit('lobby_updated', {
                users,
            });
            if (kickedSocketId) {
                this.server.to(kickedSocketId).emit('kicked', {
                    roomUuid,
                    reason: '강퇴되었습니다.',
                });
                const kickedSocket = this.server.sockets.sockets.get(kickedSocketId);
                if (kickedSocket?.connected) {
                    kickedSocket.disconnect(true);
                }
            }
            return {
                status: 'success',
                data: {
                    kickedPublicUserId,
                },
            };
        }
        catch (error) {
            this.logger.error(`kick_user failed: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }
    emitPhase(roomUuid, status, durationMs, displayStatus) {
        const phase = displayStatus ?? status;
        this.logger.log(`📡 페이즈 전송: "${phase}" (serverStatus: "${status}")`);
        this.server.to(roomUuid).emit('change_phase', {
            phase,
            data: {
                duration: durationMs,
                startAt: Date.now(),
                serverStatus: status,
                roundName: phase,
            },
        });
    }
    getClientIp(client) {
        const headers = client.handshake.headers;
        const xForwardedFor = headers['x-forwarded-for'];
        if (xForwardedFor) {
            const ips = Array.isArray(xForwardedFor) ? xForwardedFor : xForwardedFor.split(',');
            return ips[0].trim();
        }
        return client.handshake.address === '::1' ? '127.0.0.1' : client.handshake.address;
    }
};
exports.RoomsGateway = RoomsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RoomsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join_room'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket,
        join_room_dto_1.JoinRoomDto]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleJoinRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leave_room'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleLeaveRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('request_room_info'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleRequestRoomInfo", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('update_room_config'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleUpdateConfig", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('game_ready'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleGameReady", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('send_chat'),
    (0, common_4.UsePipes)(new common_4.ValidationPipe({ transform: true })),
    (0, common_2.UseGuards)(ws_throttler_guard_1.WsThrottlerGuard),
    (0, throttler_1.SkipThrottle)({ 'room-creation': true }),
    (0, throttler_1.Throttle)({ chat: { limit: 5, ttl: 10000, blockDuration: 10000 } }),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket,
        chat_dto_1.ChatDto]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('send_reaction'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleReaction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('story_typing'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleTyping", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('submit_story'),
    (0, common_4.UsePipes)(new common_4.ValidationPipe({ transform: true })),
    (0, common_2.UseGuards)(ws_throttler_guard_1.WsThrottlerGuard),
    (0, throttler_1.SkipThrottle)({ 'room-creation': true }),
    (0, throttler_1.Throttle)({ chat: { limit: 5, ttl: 10000, blockDuration: 10000 } }),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleSubmitStory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('join_team'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleJoinTeam", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leave_team'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, leave_team_dto_1.LeaveTeamDto]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleLeaveTeam", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('auto_fill'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleAutoFill", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('skip_phase'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleSkipPhase", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('prev_phase'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handlePrevPhase", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('start_game'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleStartGame", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('submit_vote'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleSubmitVote", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('restart_game'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleRestartGame", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('kick_user'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, kick_user_dto_1.KickUserDto]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleKickUser", null);
exports.RoomsGateway = RoomsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: 'game',
        cors: {
            origin: true,
            credentials: true,
        },
    }),
    (0, common_3.UseFilters)(ws_exception_filter_1.WsExceptionFilter),
    __metadata("design:paramtypes", [rooms_service_1.RoomsService,
        ai_judges_service_1.AiJudgeService,
        games_service_1.GamesService,
        game_flow_service_1.GameFlowService])
], RoomsGateway);
//# sourceMappingURL=rooms.gateway.js.map