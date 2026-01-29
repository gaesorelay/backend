import { Injectable } from '@nestjs/common';
import { SchedulePayload } from './timer.types';
import { RoomStatus } from '../rooms/types/room.type';
import { redisKeys } from '../../common/constants/redis.keys';

@Injectable()
export class TimerService {
  // 방 + 단계 기준으로 타이머를 저장해 중복 예약을 방지
  private readonly timers = new Map<string, NodeJS.Timeout>();

  // 특정 방/단계에 대해 콜백을 예약
  schedule({ roomUuid, status, delayMs }: SchedulePayload, onFire: () => void): void {
    const key = this.makeKey(roomUuid, status);

    // 동일 키의 기존 타이머가 있으면 먼저 취소
    this.cancel(roomUuid, status);

    const timeout = setTimeout(() => {
      this.timers.delete(key);
      onFire();
    }, delayMs);

    this.timers.set(key, timeout);
  }

  // 특정 방/단계의 타이머만 취소
  cancel(roomUuid: string, status: RoomStatus): void {
    const key = this.makeKey(roomUuid, status);
    const timeout = this.timers.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.timers.delete(key);
    }
  }

  // 방 단위로 모든 타이머 취소 (게임 종료/방 삭제 등)
  cancelAll(roomUuid: string): void {
    for (const key of this.timers.keys()) {
      if (key.startsWith(`${roomUuid}:`)) {
        const timeout = this.timers.get(key);
        if (timeout) {
          clearTimeout(timeout);
        }
        this.timers.delete(key);
      }
    }
  }

  private makeKey(roomUuid: string, status: RoomStatus): string {
    return redisKeys.roomTimer(roomUuid, status);
  }
}
