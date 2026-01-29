import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GamesService } from './games.service';

@WebSocketGateway({ namespace: 'game', cors: { origin: '*' } })
export class GamesGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gamesService: GamesService) {}

  @SubscribeMessage('story_typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; text: string; team: 'A' | 'B'; userToken: string },
  ) {
    // 1. 서비스에 물어보기: "이 사람 지금 써도 되는 사람이야?"
    const isValid = await this.gamesService.validateWriter(data.roomId, data.userToken, data.team);

    // 2. 권한이 있는 경우에만 방의 다른 사람들에게 전달
    if (isValid) {
      // 발신자 본인을 제외한 방 안의 모든 유저에게 '실시간 텍스트' 전송
      client.broadcast.to(data.roomId).emit('story_update', {
        team: data.team,
        text: data.text,
        writerToken: data.userToken, // 누가 쓰고 있는지 프론트가 알 수 있게 포함
      });
    } else {
      // 권한 없는 유저가 보내면 무시하거나 경고 (선택)
      client.emit('error', { message: '당신의 턴이 아닙니다.' });
    }
  }
}
