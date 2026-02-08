import { RoomConfig } from '../types/room.type';
export interface CreateRoomDto {
    title: string;
    config: RoomConfig;
    avatarId: number;
}
