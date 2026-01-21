export type RoomStatus = 'LOBBY' | 'PLAYING' | 'VOTING' | 'RESULT';

export interface RoomConfig {
  roundCount: number;
  roundTimeSeconds: number;
  votingTimeSeconds: number;
  teamSize: number;
}

export interface Room {
  roomUuid: string;
  ownerUserToken: string;
  title: string;
  status: RoomStatus;
  config: RoomConfig;
  createdAt: number;
}
