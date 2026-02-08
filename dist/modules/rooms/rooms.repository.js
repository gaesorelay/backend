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
exports.RoomsRepository = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const redis_keys_1 = require("../../common/constants/redis.keys");
const BAN_TTL_SECONDS = 30 * 60;
let RoomsRepository = class RoomsRepository {
    client;
    constructor(client) {
        this.client = client;
    }
    async save(room, ttlSeconds) {
        const key = redis_keys_1.redisKeys.roomInfo(room.roomUuid);
        const payload = JSON.stringify(room);
        if (ttlSeconds && ttlSeconds > 0) {
            await this.client.set(key, payload, 'EX', ttlSeconds);
            return;
        }
        await this.client.set(key, payload);
    }
    async findById(roomUuid) {
        const key = redis_keys_1.redisKeys.roomInfo(roomUuid);
        const raw = await this.client.get(key);
        if (!raw) {
            throw new common_1.NotFoundException('room not found');
        }
        return JSON.parse(raw);
    }
    async delete(roomUuid) {
        const key = redis_keys_1.redisKeys.roomInfo(roomUuid);
        await this.client.del(key);
    }
    async saveUser(user) {
        const key = redis_keys_1.redisKeys.roomUser(user.roomUuid, user.userToken);
        await this.client.set(key, JSON.stringify(user));
        await this.client.expire(key, 60 * 60);
    }
    async findUserTokenBySocketId(socketId) {
        const key = redis_keys_1.redisKeys.socketMap(socketId);
        const userToken = await this.client.get(key);
        return userToken ?? null;
    }
    async nextPublicUserId(roomUuid) {
        const key = redis_keys_1.redisKeys.roomUserSeq(roomUuid);
        const results = await this.client
            .pipeline()
            .incr(key)
            .expire(key, 60 * 60)
            .exec();
        if (!results) {
            throw new Error('Redis pipeline failed to execute');
        }
        const [err, nextId] = results[0];
        if (err) {
            throw err;
        }
        return nextId;
    }
    async saveSocketMapping(socketId, roomUuid, userToken) {
        const key = redis_keys_1.redisKeys.socketMap(socketId);
        const value = `${roomUuid}:${userToken}`;
        await this.client.set(key, value);
    }
    async addUserToRoomList(roomUuid, userToken) {
        const key = `room:${roomUuid}:users`;
        await this.client.sadd(key, userToken);
        await this.client.expire(key, 60 * 60);
    }
    async removeUserFromRoomList(roomUuid, userToken) {
        const key = `room:${roomUuid}:users`;
        await this.client.srem(key, userToken);
    }
    async getUserTokensInRoom(roomUuid) {
        const key = `room:${roomUuid}:users`;
        return await this.client.smembers(key);
    }
    async getUsersInRoom(roomUuid) {
        const tokens = await this.getUserTokensInRoom(roomUuid);
        if (tokens.length === 0)
            return [];
        const users = [];
        for (const token of tokens) {
            const user = await this.findUserByTokenOrNull(roomUuid, token);
            if (user) {
                users.push(user);
            }
            else {
                await this.removeUserFromRoomList(roomUuid, token);
            }
        }
        return users;
    }
    async getUserCount(roomUuid) {
        const key = `room:${roomUuid}:users`;
        return await this.client.scard(key);
    }
    async getMappingBySocketId(socketId) {
        const key = redis_keys_1.redisKeys.socketMap(socketId);
        const value = await this.client.get(key);
        if (!value)
            throw new common_1.NotFoundException('Socket mapping not found');
        const [roomUuid, userToken] = value.split(':');
        return { roomUuid, userToken };
    }
    async findUserByToken(roomUuid, userToken) {
        const key = redis_keys_1.redisKeys.roomUser(roomUuid, userToken);
        const data = await this.client.get(key);
        if (!data)
            throw new common_1.NotFoundException('user not found');
        return JSON.parse(data);
    }
    async findUserByTokenOrNull(roomUuid, token) {
        const key = redis_keys_1.redisKeys.roomUser(roomUuid, token);
        const data = await this.client.get(key);
        if (!data) {
            return null;
        }
        return JSON.parse(data);
    }
    async deleteUser(roomUuid, userToken, socketId) {
        const userKey = redis_keys_1.redisKeys.roomUser(roomUuid, userToken);
        if (socketId) {
            const socketKey = redis_keys_1.redisKeys.socketMap(socketId);
            await this.client.del(userKey, socketKey);
            return;
        }
        await this.client.del(userKey);
    }
    async setUserTTL(roomUuid, userToken, ttlSeconds) {
        const key = redis_keys_1.redisKeys.roomUser(roomUuid, userToken);
        await this.client.expire(key, ttlSeconds);
    }
    async clearUserTTL(roomUuid, userToken) {
        const key = redis_keys_1.redisKeys.roomUser(roomUuid, userToken);
        await this.client.persist(key);
    }
    async deleteSocketMapping(socketId) {
        const key = redis_keys_1.redisKeys.socketMap(socketId);
        await this.client.del(key);
    }
    async updateUserSocket(roomUuid, userToken, socketId) {
        const key = redis_keys_1.redisKeys.roomUser(roomUuid, userToken);
        const data = await this.client.get(key);
        if (data) {
            const user = JSON.parse(data);
            user.currentSocketId = socketId;
            await this.client.set(key, JSON.stringify(user));
        }
    }
    async addIpBan(roomUuid, ip) {
        const key = redis_keys_1.redisKeys.roomIpban(roomUuid, ip);
        await this.client.set(key, '1', 'EX', BAN_TTL_SECONDS);
    }
    async isIpBanned(roomUuid, ip) {
        const key = redis_keys_1.redisKeys.roomIpban(roomUuid, ip);
        const exists = await this.client.exists(key);
        return exists === 1;
    }
};
exports.RoomsRepository = RoomsRepository;
exports.RoomsRepository = RoomsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [ioredis_1.default])
], RoomsRepository);
//# sourceMappingURL=rooms.repository.js.map