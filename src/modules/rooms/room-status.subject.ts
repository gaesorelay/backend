import { Injectable } from '@nestjs/common';
import { RoomStatus } from './types/room.type';

// 방 상태 변경 이벤트 페이로드
export type RoomStatusEvent = {
  roomUuid: string;
  status: RoomStatus;
};

type RoomStatusListener = (event: RoomStatusEvent) => void;

@Injectable()
export class RoomStatusSubject {
  // 구독자(리스너) 목록
  private readonly listeners = new Set<RoomStatusListener>();

  // 구독 등록 및 해제 함수 반환
  subscribe(listener: RoomStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // 상태 변경 이벤트를 모든 구독자에게 전파
  notify(event: RoomStatusEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
