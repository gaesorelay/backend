import { RoomStatus } from '../rooms/types/room.type';
export interface SchedulePayload {
    roomUuid: string;
    status: RoomStatus;
    delayMs: number;
}
