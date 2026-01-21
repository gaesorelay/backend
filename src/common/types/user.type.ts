export type UserRole = 'HOST' | 'PLAYER' | 'AUDIENCE';
export type UserTeam = 'TEAM_A' | 'TEAM_B' | 'NONE';

export interface User {
  userToken: string;
  currentSocketId: string | null;
  roomUuid: string;
  nickname: string;
  role: UserRole;
  team: UserTeam;
  avatarId: number;
  ipAddress?: string;
  isReady?: boolean;
}
