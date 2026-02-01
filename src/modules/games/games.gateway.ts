import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GamesService } from './games.service';
import { UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WsThrottlerGuard } from '../../common/guards/ws-throttler.guard';

@WebSocketGateway({ namespace: 'game', cors: { origin: '*' } })
export class GamesGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gamesService: GamesService) {}

  /**
   * 🚪 게임 소켓 방 입장 처리 (이게 없으면 broadcast 수신 불가!)
   */
  @SubscribeMessage('join_game_room')
  handleJoinGameRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    client.join(data.roomId); // 👈 이 한 줄이 핵심입니다!
    console.log(`🔌 [GamesGateway] 소켓 방 입장: ${client.id} -> ${data.roomId}`);
  }

 
}
