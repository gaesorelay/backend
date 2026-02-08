"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisKeys = void 0;
exports.redisKeys = {
    roomInfo: (roomUuid) => `room:${roomUuid}:info`,
    roomUsers: (roomUuid) => `room:${roomUuid}:users:*`,
    roomUser: (roomUuid, userToken) => `room:${roomUuid}:users:${userToken}`,
    roomUserByTokenPattern: (userToken) => `room:*:users:${userToken}`,
    roomUserSeq: (roomUuid) => `room:${roomUuid}:user_seq`,
    socketMap: (socketId) => `socket:${socketId}`,
    roomGameState: (roomUuid) => `room:${roomUuid}:game`,
    roomTimer: (roomUuid, phase) => `room:${roomUuid}:timer:${phase}`,
    roomVote: (roomUuid) => `room:${roomUuid}:vote`,
    roomIpban: (roomUuid, ip) => `ban:room:${roomUuid}:ip:${ip}`,
};
//# sourceMappingURL=redis.keys.js.map