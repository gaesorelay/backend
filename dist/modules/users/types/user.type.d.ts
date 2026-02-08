export type UserRole = 'PLAYER' | 'AUDIENCE';
export type UserTeam = 'A' | 'B' | null;
export interface User {
    userToken: string;
    publicUserId: number;
    currentSocketId: string | null;
    roomUuid: string;
    nickname: string;
    role: UserRole;
    isHost: boolean;
    team: UserTeam;
    slotIndex?: number | null;
    avatarId: number;
    isReady?: boolean;
    IP?: string;
}
