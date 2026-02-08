export declare const redisKeys: {
    roomInfo: (roomUuid: string) => string;
    roomUsers: (roomUuid: string) => string;
    roomUser: (roomUuid: string, userToken: string) => string;
    roomUserByTokenPattern: (userToken: string) => string;
    roomUserSeq: (roomUuid: string) => string;
    socketMap: (socketId: string) => string;
    roomGameState: (roomUuid: string) => string;
    roomTimer: (roomUuid: string, phase: string) => string;
    roomVote: (roomUuid: string) => string;
    roomIpban: (roomUuid: string, ip: string) => string;
};
