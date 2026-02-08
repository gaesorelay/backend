import { SchedulePayload } from './timer.types';
import { RoomStatus } from '../rooms/types/room.type';
export declare class TimerService {
    private readonly timers;
    schedule({ roomUuid, status, delayMs }: SchedulePayload, onFire: () => void): void;
    cancel(roomUuid: string, status: RoomStatus): void;
    cancelAll(roomUuid: string): void;
    private makeKey;
}
