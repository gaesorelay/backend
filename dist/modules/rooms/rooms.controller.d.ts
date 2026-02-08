import type { CreateRoomDto } from './dto/create-room.dto';
import type { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsService } from './rooms.service';
export declare class RoomsController {
    private readonly roomsService;
    constructor(roomsService: RoomsService);
    createRoom(body: CreateRoomDto): Promise<CreateRoomResponseDto>;
    getRoom(roomUuid: string): Promise<{
        status: string;
        data: {
            currentUserCount: number;
            roomUuid: string;
            ownerUserToken: string;
            title: string;
            status: import("./types/room.type").RoomStatus;
            isStarted: boolean;
            config: import("./types/room.type").RoomConfig;
            createdAt: number;
        };
    }>;
}
