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
exports.RoomsService = void 0;
const common_1 = require("@nestjs/common");
const rooms_repository_1 = require("./rooms.repository");
const id_util_1 = require("../../common/utils/id.util");
const games_service_1 = require("../games/games.service");
const game_flow_service_1 = require("./game-flow.service");
const room_status_subject_1 = require("./room-status.subject");
const websockets_1 = require("@nestjs/websockets");
let RoomsService = class RoomsService {
    roomsRepository;
    gamesService;
    gameFlowService;
    roomStatusSubject;
    constructor(roomsRepository, gamesService, gameFlowService, roomStatusSubject) {
        this.roomsRepository = roomsRepository;
        this.gamesService = gamesService;
        this.gameFlowService = gameFlowService;
        this.roomStatusSubject = roomStatusSubject;
    }
    async createRoom(dto) {
        const roomUuid = (0, id_util_1.generateRoomId)();
        const ownerToken = (0, id_util_1.generateUUIDToken)();
        const room = {
            roomUuid: roomUuid,
            ownerUserToken: ownerToken,
            title: dto.title,
            status: 'WAITING',
            isStarted: false,
            config: dto.config,
            createdAt: Date.now(),
        };
        const TTL_SECONDS = 60 * 60;
        await this.roomsRepository.save(room, TTL_SECONDS);
        return {
            roomId: roomUuid,
            token: ownerToken,
        };
    }
    async joinRoom(roomUuid, ip, nickname, socketId, avatarId, userToken) {
        const room = await this.roomsRepository.findById(roomUuid);
        if (!room) {
            throw new common_1.NotFoundException('존재하지 않는 방입니다.');
        }
        const isBanned = await this.roomsRepository.isIpBanned(roomUuid, ip);
        if (isBanned) {
            throw new websockets_1.WsException('강퇴당한 방에는 30분간 재입장할 수 없습니다. 🚫');
        }
        if (userToken) {
            const existingUser = await this.roomsRepository.findUserByTokenOrNull(roomUuid, userToken);
            if (existingUser) {
                console.log(`♻️ 재접속 감지: ${nickname} (${userToken})`);
                await this.roomsRepository.updateUserSocket(roomUuid, userToken, socketId);
                await this.roomsRepository.saveSocketMapping(socketId, roomUuid, userToken);
                await this.roomsRepository.clearUserTTL(roomUuid, userToken);
                return existingUser;
            }
        }
        const currentCount = await this.roomsRepository.getUserCount(roomUuid);
        const maxUser = room.config.maxPlayers || 8;
        if (currentCount >= maxUser) {
            throw new common_1.BadRequestException('방이 꽉 찼습니다.');
        }
        const isFirstUser = currentCount === 0;
        const isHost = isFirstUser;
        const newUserToken = userToken ? userToken : (0, id_util_1.generateUUIDToken)();
        const role = 'AUDIENCE';
        const team = null;
        const slotIndex = null;
        const publicUserId = await this.roomsRepository.nextPublicUserId(roomUuid);
        const resolvedAvatarId = avatarId ?? Math.floor(Math.random() * 5) + 1;
        const newUser = {
            userToken: newUserToken,
            publicUserId: publicUserId,
            currentSocketId: socketId,
            roomUuid: roomUuid,
            nickname: nickname,
            role: role,
            isHost: isHost,
            team: team,
            slotIndex: slotIndex,
            avatarId: resolvedAvatarId,
            isReady: false,
            IP: ip,
        };
        await this.roomsRepository.saveUser(newUser);
        await this.roomsRepository.saveSocketMapping(socketId, roomUuid, newUserToken);
        await this.roomsRepository.addUserToRoomList(roomUuid, newUserToken);
        return newUser;
    }
    async getRoomInfo(roomUuid) {
        const room = await this.roomsRepository.findById(roomUuid);
        if (!room) {
            throw new common_1.NotFoundException('존재하지 않는 방입니다.');
        }
        const currentCount = await this.roomsRepository.getUserCount(roomUuid);
        return {
            ...room,
            currentUserCount: currentCount,
        };
    }
    async getRoomById(roomUuid) {
        const room = await this.roomsRepository.findById(roomUuid);
        if (!room) {
            throw new common_1.NotFoundException('존재하지 않는 방입니다.');
        }
        return room;
    }
    async updateRoomStatus(roomUuid, status) {
        const room = await this.roomsRepository.findById(roomUuid);
        if (!room) {
            throw new common_1.NotFoundException('존재하지 않는 방입니다.');
        }
        room.status = status;
        await this.roomsRepository.save(room, 60 * 60);
        this.roomStatusSubject.notify({ roomUuid, status });
        return room;
    }
    async getUsersInRoom(roomUuid) {
        return this.roomsRepository.getUsersInRoom(roomUuid);
    }
    async setUserReady(socketId, isReady) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            throw new common_1.NotFoundException('User not found.');
        const user = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
        if (!user)
            throw new common_1.NotFoundException('User not found.');
        const updatedUser = {
            ...user,
            isReady,
        };
        await this.roomsRepository.saveUser(updatedUser);
        const users = await this.roomsRepository.getUsersInRoom(user.roomUuid);
        return { updatedUser, users, roomUuid: user.roomUuid };
    }
    async updateRoomConfig(socketId, newConfig) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        const { roomUuid, userToken } = mapping;
        const user = await this.roomsRepository.findUserByToken(roomUuid, userToken);
        if (!user.isHost)
            throw new common_1.BadRequestException('방장만 설정을 변경할 수 있습니다.');
        const room = await this.roomsRepository.findById(roomUuid);
        room.config = { ...room.config, ...newConfig };
        await this.roomsRepository.save(room, 60 * 60);
        console.log(`방 설정 변경: ${roomUuid} by ${user.nickname}`, room.config);
        return room;
    }
    async joinTeam(socketId, targetPublicUserId, slotIndex, teamInput) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            throw new common_1.NotFoundException('User not found.');
        const requester = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
        if (!requester)
            throw new common_1.NotFoundException('User not found.');
        if (requester.publicUserId !== targetPublicUserId && !requester.isHost) {
            throw new common_1.BadRequestException('Only host can assign other users.');
        }
        let team;
        if (teamInput === 'A' || teamInput === 'B') {
            team = teamInput;
        }
        else {
            throw new common_1.BadRequestException('Invalid team. Use "A" or "B".');
        }
        const users = await this.roomsRepository.getUsersInRoom(mapping.roomUuid);
        const target = users.find((user) => user.publicUserId === targetPublicUserId);
        if (!target)
            throw new common_1.NotFoundException('Target user not found.');
        const isSlotTaken = users.some((u) => u.team === team && u.slotIndex === slotIndex);
        if (isSlotTaken) {
            throw new common_1.BadRequestException('이미 다른 유저가 있는 자리입니다.');
        }
        const updatedUser = {
            ...target,
            role: 'PLAYER',
            team,
            slotIndex,
        };
        await this.roomsRepository.saveUser(updatedUser);
        const updatedUsers = users.map((user) => user.publicUserId === targetPublicUserId ? updatedUser : user);
        return { updatedUser, users: updatedUsers, roomUuid: mapping.roomUuid };
    }
    async leaveTeam(socketId, targetPublicUserId, slotIndex, teamInput) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            throw new common_1.NotFoundException('User not found.');
        const requester = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
        if (!requester)
            throw new common_1.NotFoundException('User not found.');
        if (requester.publicUserId !== targetPublicUserId && !requester.isHost) {
            throw new common_1.BadRequestException('Only host can remove other users.');
        }
        if (teamInput !== 'A' && teamInput !== 'B') {
            throw new common_1.BadRequestException('Invalid team. Use "A" or "B".');
        }
        const users = await this.roomsRepository.getUsersInRoom(mapping.roomUuid);
        const target = users.find((user) => user.publicUserId === targetPublicUserId);
        if (!target)
            throw new common_1.NotFoundException('Target user not found.');
        const updatedUser = {
            ...target,
            role: 'AUDIENCE',
            team: null,
            slotIndex,
        };
        await this.roomsRepository.saveUser(updatedUser);
        const updatedUsers = users.map((user) => user.publicUserId === targetPublicUserId ? updatedUser : user);
        return { updatedUser, users: updatedUsers, roomUuid: mapping.roomUuid };
    }
    async kickUser(socketId, targetPublicUserId) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            throw new common_1.NotFoundException('User not found.');
        const requester = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
        if (!requester)
            throw new common_1.NotFoundException('User not found.');
        if (!requester.isHost) {
            throw new common_1.BadRequestException('Only host can kick users.');
        }
        const users = await this.roomsRepository.getUsersInRoom(mapping.roomUuid);
        const target = users.find((user) => user.publicUserId === targetPublicUserId);
        if (!target)
            throw new common_1.NotFoundException('Target user not found.');
        if (target.userToken === requester.userToken) {
            throw new common_1.BadRequestException('Host cannot kick themselves.');
        }
        if (target.IP) {
            await this.roomsRepository.addIpBan(mapping.roomUuid, target.IP);
        }
        const kickedSocketId = target.currentSocketId ?? null;
        await this.roomsRepository.deleteUser(mapping.roomUuid, target.userToken, target.currentSocketId);
        const updatedUsers = users.filter((user) => user.publicUserId !== targetPublicUserId);
        return {
            kickedPublicUserId: targetPublicUserId,
            users: updatedUsers,
            roomUuid: mapping.roomUuid,
            kickedSocketId,
        };
    }
    async leaveRoom(socketId) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            return null;
        const { roomUuid, userToken } = mapping;
        const user = await this.roomsRepository.findUserByToken(roomUuid, userToken);
        if (!user)
            return null;
        await this.roomsRepository.deleteUser(roomUuid, userToken, socketId);
        const userCount = await this.roomsRepository.getUserCount(roomUuid);
        if (userCount === 0) {
            await this.roomsRepository.delete(roomUuid);
            console.log(`빈 방 삭제 완료: ${roomUuid}`);
        }
        return { roomUuid, nickname: user.nickname };
    }
    async handleConnectionLoss(socketId) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            return;
        const { roomUuid, userToken } = mapping;
        await this.roomsRepository.updateUserSocket(roomUuid, userToken, null);
        const RECONNECT_WINDOW = 120;
        await this.roomsRepository.setUserTTL(roomUuid, userToken, RECONNECT_WINDOW);
        await this.roomsRepository.deleteSocketMapping(socketId);
        console.log(`유저 연결 끊김 (재접속 대기 ${RECONNECT_WINDOW}초): ${userToken}`);
    }
    async autoFillSlots(socketId) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            throw new common_1.NotFoundException();
        const requester = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
        if (!requester.isHost)
            throw new common_1.BadRequestException('방장만 자동 채우기를 할 수 있습니다.');
        const roomUuid = mapping.roomUuid;
        const room = await this.roomsRepository.findById(roomUuid);
        const users = await this.roomsRepository.getUsersInRoom(roomUuid);
        const TEAM_SIZE = room.config.storytellerCount || 4;
        const emptySlotsA = [];
        const emptySlotsB = [];
        for (let i = 0; i < TEAM_SIZE; i++) {
            if (!users.some((u) => u.team === 'A' && u.slotIndex === i))
                emptySlotsA.push(i);
            if (!users.some((u) => u.team === 'B' && u.slotIndex === i))
                emptySlotsB.push(i);
        }
        const totalNeeded = emptySlotsA.length + emptySlotsB.length;
        if (totalNeeded === 0) {
            throw new common_1.BadRequestException('빈 슬롯이 없습니다.');
        }
        const audience = users.filter((u) => u.role === 'AUDIENCE');
        const shuffledAudience = this.shuffleArray([...audience]);
        const updatedUsersList = [];
        let teamACount = users.filter((u) => u.team === 'A').length;
        let teamBCount = users.filter((u) => u.team === 'B').length;
        const getNextTeam = () => {
            const hasA = emptySlotsA.length > 0;
            const hasB = emptySlotsB.length > 0;
            if (!hasA && !hasB)
                return null;
            if (hasA && !hasB)
                return 'A';
            if (hasB && !hasA)
                return 'B';
            if (teamACount < teamBCount)
                return 'A';
            if (teamBCount < teamACount)
                return 'B';
            if (emptySlotsA.length > emptySlotsB.length)
                return 'A';
            if (emptySlotsB.length > emptySlotsA.length)
                return 'B';
            return 'A';
        };
        while (shuffledAudience.length > 0) {
            const nextTeam = getNextTeam();
            if (!nextTeam)
                break;
            const targetUser = shuffledAudience.pop();
            if (!targetUser)
                break;
            const slot = nextTeam === 'A' ? emptySlotsA.shift() : emptySlotsB.shift();
            if (slot === undefined) {
                continue;
            }
            targetUser.role = 'PLAYER';
            targetUser.team = nextTeam;
            targetUser.slotIndex = slot;
            targetUser.isReady = false;
            await this.roomsRepository.saveUser(targetUser);
            updatedUsersList.push(targetUser);
            if (nextTeam === 'A')
                teamACount += 1;
            else
                teamBCount += 1;
        }
        const allUsers = await this.roomsRepository.getUsersInRoom(roomUuid);
        return { updatedUsers: allUsers, roomUuid };
    }
    async startGame(socketId) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        const roomUuid = mapping.roomUuid;
        const room = await this.roomsRepository.findById(roomUuid);
        const users = await this.roomsRepository.getUsersInRoom(roomUuid);
        const TEAM_SIZE = room.config.storytellerCount || 4;
        const teamAUsers = users.filter((u) => u.team === 'A');
        const teamBUsers = users.filter((u) => u.team === 'B');
        const sortedTeamA = teamAUsers
            .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
            .map((u) => u.publicUserId.toString());
        const sortedTeamB = teamBUsers
            .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
            .map((u) => u.publicUserId.toString());
        console.log(`게임 시작 조건 만족! A: ${sortedTeamA}, B: ${sortedTeamB}`);
        room.isStarted = true;
        await this.roomsRepository.save(room, 60 * 60);
        await this.gamesService.initGame(roomUuid, sortedTeamA, sortedTeamB);
        return { roomUuid };
    }
    async startGameFlow(roomUuid, emitStatus, emitVoteResult) {
        this.gameFlowService.startGameFlow(roomUuid, emitStatus, emitVoteResult);
    }
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    async getUserBySocket(socketId) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            throw new common_1.NotFoundException('Socket mapping not found');
        const user = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async restartGame(socketId) {
        const mapping = await this.roomsRepository.getMappingBySocketId(socketId);
        if (!mapping)
            throw new common_1.NotFoundException();
        const requester = await this.roomsRepository.findUserByToken(mapping.roomUuid, mapping.userToken);
        if (!requester.isHost)
            throw new common_1.BadRequestException('방장만 재시작할 수 있습니다.');
        const roomUuid = mapping.roomUuid;
        const room = await this.roomsRepository.findById(roomUuid);
        const users = await this.roomsRepository.getUsersInRoom(roomUuid);
        await this.gameFlowService.resetFlow(roomUuid);
        room.isStarted = false;
        room.status = 'WAITING';
        await this.roomsRepository.save(room, 60 * 60);
        const resetUsers = [];
        for (const user of users) {
            if (user.isReady) {
                user.isReady = false;
                await this.roomsRepository.saveUser(user);
            }
            resetUsers.push(user);
        }
        return { roomUuid, users: resetUsers };
    }
};
exports.RoomsService = RoomsService;
exports.RoomsService = RoomsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rooms_repository_1.RoomsRepository,
        games_service_1.GamesService,
        game_flow_service_1.GameFlowService,
        room_status_subject_1.RoomStatusSubject])
], RoomsService);
//# sourceMappingURL=rooms.service.js.map