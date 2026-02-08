export type RoomStatus = 'WAITING' | 'PLAYING' | 'RESULTING' | 'ENDED';
export interface RoomConfig {
    maxPlayers: number;
    storytellerCount: number;
    rounds: number;
    roundTime: number;
    voteTime: number;
}
export interface Room {
    roomUuid: string;
    ownerUserToken: string;
    title: string;
    status: RoomStatus;
    isStarted: boolean;
    config: RoomConfig;
    createdAt: number;
}
