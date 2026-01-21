export const redisKeys = {
  roomInfo: (roomUuid: string) => `room:${roomUuid}:info`,
  roomVote: (roomUuid: string) => `room:${roomUuid}:vote`,
};
