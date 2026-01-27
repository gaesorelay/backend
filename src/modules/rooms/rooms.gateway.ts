import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { User } from '../../common/types/user.type';

@WebSocketGateway({
  namespace: 'rooms',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RoomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('RoomsGateway');

  constructor(private readonly roomsService: RoomsService) {}

  afterInit(server: Server) {
    this.logger.log('✅ Rooms WebSocket Gateway Initialized on /ws');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client Connected to Rooms Namespace : ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client Disconnected from Rooms Namespace : ${client.id}`);

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

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { roomId: string; nickname: string; userToken?: string },
  ) {
    this.logger.log(`🔍 join_room 요청: 방=${data.roomId}, 닉네임=${data.nickname}`);

    try {
      const user: User = await this.roomsService.joinRoom(
        data.roomId,
        data.nickname,
        client.id,
        data.userToken,
      );

      client.join(data.roomId);
      this.logger.log(
        `join_room token: ${user.userToken} (room: ${data.roomId}, nickname: ${user.nickname})`,
      );
      this.logger.log(`✅ 소켓 룸 입장 완료: ${client.id} -> ${data.roomId}`);

      client.to(data.roomId).emit('user_joined', {
        nickname: user.nickname,
        role: user.role,
        avatarId: user.avatarId,
      });

      return { status: 'success', data: user };
    } catch (error) {
      this.logger.error(`❌ 입장 실패: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('game_ready')
  async handleGameReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { isReady: boolean },
  ) {
    this.logger.log(`game_ready request: socket ${client.id}, ready ${data.isReady}`);

    try {
      const { updatedUser, users, roomUuid } = await this.roomsService.setUserReady(
        client.id,
        data.isReady,
      );

      this.server.to(roomUuid).emit('lobby_updated', {
        users,
        updatedUser,
      });

      return { status: 'success', data: updatedUser };
    } catch (error) {
      this.logger.error(`game_ready failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }
}
