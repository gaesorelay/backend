import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsRepository } from './rooms.repository';
import { Room, RoomStatus } from './types/room.type';
import { User } from '../users/types/user.type';
import { GamesService } from '../games/games.service';
import { VoteOutcome } from '../games/types/vote-outcome.type';
import { GameFlowService } from './game-flow.service';
import { RoomStatusSubject } from './room-status.subject';
export declare class RoomsService {
    private readonly roomsRepository;
    private readonly gamesService;
    private readonly gameFlowService;
    private readonly roomStatusSubject;
    constructor(roomsRepository: RoomsRepository, gamesService: GamesService, gameFlowService: GameFlowService, roomStatusSubject: RoomStatusSubject);
    createRoom(dto: CreateRoomDto): Promise<CreateRoomResponseDto>;
    joinRoom(roomUuid: string, ip: string, nickname: string, socketId: string, avatarId: number, userToken?: string): Promise<User>;
    getRoomInfo(roomUuid: string): Promise<{
        currentUserCount: number;
        roomUuid: string;
        ownerUserToken: string;
        title: string;
        status: RoomStatus;
        isStarted: boolean;
        config: import("./types/room.type").RoomConfig;
        createdAt: number;
    }>;
    getRoomById(roomUuid: string): Promise<Room>;
    updateRoomStatus(roomUuid: string, status: RoomStatus): Promise<Room>;
    getUsersInRoom(roomUuid: string): Promise<User[]>;
    setUserReady(socketId: string, isReady: boolean): Promise<{
        updatedUser: User;
        users: User[];
        roomUuid: string;
    }>;
    updateRoomConfig(socketId: string, newConfig: any): Promise<Room>;
    joinTeam(socketId: string, targetPublicUserId: number, slotIndex: number, teamInput: string): Promise<{
        updatedUser: User;
        users: User[];
        roomUuid: string;
    }>;
    leaveTeam(socketId: string, targetPublicUserId: number, slotIndex: number, teamInput: string): Promise<{
        updatedUser: User;
        users: User[];
        roomUuid: string;
    }>;
    kickUser(socketId: string, targetPublicUserId: number): Promise<{
        kickedPublicUserId: number;
        users: User[];
        roomUuid: string;
        kickedSocketId: string | null;
    }>;
    leaveRoom(socketId: string): Promise<{
        roomUuid: string;
        nickname: string;
    } | null>;
    handleConnectionLoss(socketId: string): Promise<void>;
    autoFillSlots(socketId: string): Promise<{
        updatedUsers: User[];
        roomUuid: string;
    }>;
    startGame(socketId: string): Promise<{
        roomUuid: string;
    }>;
    startGameFlow(roomUuid: string, emitStatus: (status: RoomStatus, durationMs: number, displayStatus?: string) => void, emitVoteResult?: (outcome: VoteOutcome) => void): Promise<void>;
    private shuffleArray;
    getUserBySocket(socketId: string): Promise<User>;
    restartGame(socketId: string): Promise<{
        roomUuid: string;
        users: User[];
    }>;
}
