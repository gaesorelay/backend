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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoreGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const rooms_service_1 = require("../../modules/rooms/rooms.service");
let CoreGateway = class CoreGateway {
    roomsService;
    server;
    logger = new common_1.Logger('CoreGateway');
    constructor(roomsService) {
        this.roomsService = roomsService;
    }
    handleConnection(client) {
        this.logger.log(`Client Connected to Game Namespace : ${client.id}`);
    }
    async handleDisconnect(client) {
        this.logger.log(`Client Disconnected from Game Namespace : ${client.id}`);
        let shouldCloseRoom = false;
        let closingRoomUuid = null;
        try {
            const user = await this.roomsService.getUserBySocket(client.id);
            const room = await this.roomsService.getRoomById(user.roomUuid);
            shouldCloseRoom = user.isHost && !room.isStarted;
            closingRoomUuid = user.roomUuid;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            this.logger.warn(`disconnect precheck failed: ${message}`);
        }
        try {
            await this.roomsService.handleConnectionLoss(client.id);
            const leftUser = await this.roomsService.leaveRoom(client.id);
            if (leftUser) {
                this.logger.log(`🚪 유저 퇴장: ${leftUser.nickname} (방: ${leftUser.roomUuid})`);
                this.server.to(leftUser.roomUuid).emit('user_left', {
                    nickname: leftUser.nickname,
                });
            }
        }
        catch (error) {
            this.logger.error(`퇴장 처리 중 에러: ${error.message}`);
        }
        if (shouldCloseRoom && closingRoomUuid) {
            this.server.to(closingRoomUuid).emit('room_closed', {
                reason: 'Host disconnected. Room closed.',
            });
        }
    }
};
exports.CoreGateway = CoreGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], CoreGateway.prototype, "server", void 0);
exports.CoreGateway = CoreGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: 'game',
        cors: {
            origin: true,
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [rooms_service_1.RoomsService])
], CoreGateway);
//# sourceMappingURL=core.gateway.js.map