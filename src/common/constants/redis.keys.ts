export const redisKeys = {
  roomInfo: (roomUuid: string) => `room:${roomUuid}:info`,
  roomGameState: (roomUuid: string) => `room:${roomUuid}:game`,
  roomVote: (roomUuid: string) => `room:${roomUuid}:vote`,
};
