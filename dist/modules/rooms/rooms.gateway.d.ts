import { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service';
import { JoinRoomDto } from './dto/join-room.dto';
import { LeaveTeamDto } from './dto/leave-team.dto';
import { RoomConfig, RoomStatus } from './types/room.type';
import { KickUserDto } from './dto/kick-user.dto';
import { ChatDto } from './dto/chat.dto';
import { User } from '../users/types/user.type';
import { AiJudgeService } from '../ai-judges/ai-judges.service';
import { GamesService } from '../games/games.service';
import { GameFlowService } from './game-flow.service';
export declare class RoomsGateway {
    private readonly roomsService;
    private readonly aiJudgeService;
    private readonly gamesService;
    private readonly gameFlowService;
    server: Server;
    private logger;
    constructor(roomsService: RoomsService, aiJudgeService: AiJudgeService, gamesService: GamesService, gameFlowService: GameFlowService);
    handleJoinRoom(client: Socket, data: JoinRoomDto): Promise<{
        status: string;
        data: User;
        message?: undefined;
    } | {
        status: string;
        message: any;
        data?: undefined;
    }>;
    handleLeaveRoom(client: Socket): Promise<{
        status: string;
        message?: undefined;
    } | {
        status: string;
        message: any;
    }>;
    handleRequestRoomInfo(client: Socket, data: {
        roomId: string;
    }): Promise<{
        status: string;
        data: {
            roomId: string;
            title: string;
            config: RoomConfig;
            status: RoomStatus;
            users: User[];
        };
        message?: undefined;
    } | {
        status: string;
        message: any;
        data?: undefined;
    }>;
    handleUpdateConfig(client: Socket, data: {
        config: RoomConfig;
    }): Promise<void>;
    handleGameReady(client: Socket, data: {
        isReady: boolean;
    }): Promise<{
        status: string;
        data: User;
        message?: undefined;
    } | {
        status: string;
        message: any;
        data?: undefined;
    }>;
    handleChat(client: Socket, data: ChatDto): Promise<{
        status: string;
        message: string;
    } | undefined>;
    handleReaction(client: Socket, data: {
        emoji: string;
        nickname: string;
    }): Promise<void>;
    handleTyping(client: Socket, data: {
        text: string;
        team: 'A' | 'B';
        userToken: string;
    }): Promise<void>;
    handleSubmitStory(client: Socket, data: ChatDto & {
        team: 'A' | 'B';
        userToken: string;
        turn: number;
    }): Promise<{
        status: string;
        message?: undefined;
    } | {
        status: string;
        message: any;
    }>;
    handleJoinTeam(client: Socket, data: {
        public_user_id: number;
        slot_index: number;
        team: string;
    }): Promise<{
        status: string;
        data: {
            updatedUser: {
                publicUserId: number;
                team: import("../users/types/user.type").UserTeam;
                role: import("../users/types/user.type").UserRole;
                slotIndex: number | null | undefined;
            };
        };
        message?: undefined;
    } | {
        status: string;
        message: any;
        data?: undefined;
    }>;
    handleLeaveTeam(client: Socket, data: LeaveTeamDto): Promise<{
        status: string;
        data: {
            updatedUser: {
                publicUserId: number;
                team: string;
                role: import("../users/types/user.type").UserRole;
                slotIndex: number | null | undefined;
            };
        };
        message?: undefined;
    } | {
        status: string;
        message: any;
        data?: undefined;
    }>;
    handleAutoFill(client: Socket, data: {
        roomId: string;
    }): Promise<{
        status: string;
        message?: undefined;
    } | {
        status: string;
        message: any;
    }>;
    handleSkipPhase(client: Socket): Promise<{
        status: string;
        message?: undefined;
    } | {
        status: string;
        message: any;
    }>;
    handlePrevPhase(client: Socket): Promise<{
        status: string;
        message?: undefined;
    } | {
        status: string;
        message: any;
    }>;
    handleStartGame(client: Socket, data: {
        roomId: string;
    }): Promise<{
        status: string;
        message?: undefined;
    } | {
        status: string;
        message: any;
    }>;
    handleSubmitVote(client: Socket, data: {
        team: 'A' | 'B';
    }): Promise<{
        status: string;
        data: import("../games/types/vote-outcome.type").VoteOutcome;
        message?: undefined;
    } | {
        status: string;
        message: any;
        data?: undefined;
    }>;
    handleRestartGame(client: Socket): Promise<{
        status: string;
        message?: undefined;
    } | {
        status: string;
        message: any;
    }>;
    handleKickUser(client: Socket, data: KickUserDto): Promise<{
        status: string;
        data: {
            kickedPublicUserId: number;
        };
        message?: undefined;
    } | {
        status: string;
        message: any;
        data?: undefined;
    }>;
    private emitPhase;
    getClientIp(client: Socket): string;
}
