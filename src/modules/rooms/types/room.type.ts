// 1. RoomStatus: 프론트/DB와 통일 (LOBBY 삭제)
export type RoomStatus = 'WAITING' | 'PLAYING' | 'VOTING' | 'ENDED';

// 2. RoomConfig: 프론트엔드 createRoomApi에서 보내는 필드명과 100% 일치시킴
export interface RoomConfig {
  maxPlayers: number; // 👈 [추가] 전체 정원 (관전 포함)
  storytellerCount: number; // 👈 [추가] 이야기꾼 수 (슬롯 개수)
  rounds: number; // (roundCount -> rounds 변경)
  roundTime: number; // (roundTimeSeconds -> roundTime 변경)
  voteTime: number; // (votingTimeSeconds -> voteTime 변경)
}

export interface Room {
  roomUuid: string;
  ownerUserToken: string;
  title: string;
  status: RoomStatus; // 위에서 정의한 WAITING | PLAYING | ENDED
  config: RoomConfig;
  createdAt: number;
}
