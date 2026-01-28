// 단일 라운드 게임 진행 단계
export type Phase = 'WAITING' | 'PLAYING' | 'VOTING' | 'ENDED';

// 각 단계별 시간은 외부에서 주입 (밀리초)
export interface PhaseDurations {
  WAITING: number;
  PLAYING: number;
  VOTING: number;
  ENDED: number;
}

// 타이머 예약에 필요한 최소 정보
export interface SchedulePayload {
  roomUuid: string;
  phase: Phase;
  delayMs: number;
}
