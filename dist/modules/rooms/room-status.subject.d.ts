import { RoomStatus } from './types/room.type';
export type RoomStatusEvent = {
    roomUuid: string;
    status: RoomStatus;
};
type RoomStatusListener = (event: RoomStatusEvent) => void;
export declare class RoomStatusSubject {
    private readonly listeners;
    subscribe(listener: RoomStatusListener): () => void;
    notify(event: RoomStatusEvent): void;
}
export {};
