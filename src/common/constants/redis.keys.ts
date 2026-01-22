export const redisKeys = {
  roomInfo: (roomUuid: string) => `room:${roomUuid}:info`,

  // 특정 방의 모든 유저를 찾기 위한 검색 패턴 (예: room:abc:users:*)
  roomUsers: (roomUuid: string) => `room:${roomUuid}:users:*`,

  roomUser: (roomUuid: string, userToken: string) => `room:${roomUuid}:users:${userToken}`,

  socketMap: (socketId: string) => `socket:${socketId}`,

  roomGameState: (roomUuid: string) => `room:${roomUuid}:game`,

  roomVote: (roomUuid: string) => `room:${roomUuid}:vote`,
};
