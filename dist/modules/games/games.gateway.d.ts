import { Server, Socket } from 'socket.io';
import { GamesService } from './games.service';
export declare class GamesGateway {
    private readonly gamesService;
    server: Server;
    constructor(gamesService: GamesService);
    handleJoinGameRoom(client: Socket, data: {
        roomId: string;
    }): void;
}
