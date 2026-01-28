// 1. HOST 제거 -> PLAYER / AUDIENCE 만 남김
export type UserRole = 'PLAYER' | 'AUDIENCE';

// 2. TEAM_A -> A 로 단순화 (프론트와 통일)
export type UserTeam = 'A' | 'B' | null;

export interface User {
  userToken: string;
  publicUserId: number;
  currentSocketId: string | null; // null 허용 (연결 끊김 시)
  roomUuid: string;
  nickname: string;
  role: UserRole;
  isHost: boolean;
  team: UserTeam;
  slotIndex?: number | null;
  avatarId: number;
  isReady?: boolean;
}
