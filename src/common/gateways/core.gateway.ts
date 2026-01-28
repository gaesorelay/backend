import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RoomsService } from '../../modules/rooms/rooms.service';

@WebSocketGateway({
  namespace: 'game',
  cors: {
    origin: true, //['http://localhost:5173'], 실제 배포 시에는 프론트엔드 도메인으로 제한해야 함
    credentials: true,
  },
})
export class CoreGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('CoreGateway');

  constructor(private readonly roomsService: RoomsService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client Connected to Game Namespace : ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client Disconnected from Game Namespace : ${client.id}`);

    try {
      await this.roomsService.handleConnectionLoss(client.id);

      const leftUser = await this.roomsService.leaveRoom(client.id);

      if (leftUser) {
        this.logger.log(`🚪 유저 퇴장: ${leftUser.nickname} (방: ${leftUser.roomUuid})`);

        this.server.to(leftUser.roomUuid).emit('user_left', {
          nickname: leftUser.nickname,
        });
      }
    } catch (error) {
      this.logger.error(`퇴장 처리 중 에러: ${error.message}`);
    }
  }
}
