export const redisKeys = {
  roomInfo: (roomUuid: string) => `room:${roomUuid}:info`,
  roomUsers: (roomUuid: string) => `room:${roomUuid}:users`,
  roomUser: (roomUuid: string, userToken: string) =>
    `room:${roomUuid}:users:${userToken}`,
  socketMap: (socketId: string) => `socket:${socketId}`,
  roomGameState: (roomUuid: string) => `room:${roomUuid}:game`,
  roomVote: (roomUuid: string) => `room:${roomUuid}:vote`,
};
