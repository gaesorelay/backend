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

  /**
   * 🚪 게임 소켓 방 입장 처리 (이게 없으면 broadcast 수신 불가!)
   */
  @SubscribeMessage('join_game_room')
  handleJoinGameRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    client.join(data.roomId); // 👈 이 한 줄이 핵심입니다!
    console.log(`🔌 [GamesGateway] 소켓 방 입장: ${client.id} -> ${data.roomId}`);
  }

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

  // 2. ⭐️ [신규] 스토리 제출 (저장은 이때 딱 한 번!)
  // 유저가 엔터를 치거나, 프론트엔드 타이머가 0초가 됐을 때 이 이벤트를 보냄
  @SubscribeMessage('submit_story')
  async handleSubmitStory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; text: string; team: 'A' | 'B'; userToken: string },
  ) {
    await this.gamesService.submitStory(data.roomId, data.userToken, data.team, data.text);

    // (옵션) 제출 완료되었다고 방에 알림
    this.server.to(data.roomId).emit('story_submitted', { team: data.team });
  }
}
