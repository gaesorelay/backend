import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { User } from '../../common/types/user.type';

@WebSocketGateway({
  namespace: 'game',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RoomsGateway {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('RoomsGateway');

  constructor(private readonly roomsService: RoomsService) {}

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { roomId: string; nickname: string; avatarId: number; userToken?: string },
  ) {
    this.logger.log(`🔍 join_room 요청: 방=${data.roomId}, 닉네임=${data.nickname}`);

    try {
      const user: User = await this.roomsService.joinRoom(
        data.roomId,
        data.nickname,
        client.id,
        data.avatarId,
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

  @SubscribeMessage('join_team')
  async handleJoinTeam(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { public_user_id: number; slot_index: number; team: string },
  ) {
    this.logger.log(
      `join_team request: socket ${client.id}, target ${data.public_user_id}, team ${data.team}, slot ${data.slot_index}`,
    );

    try {
      const { updatedUser, users, roomUuid } = await this.roomsService.joinTeam(
        client.id,
        data.public_user_id,
        data.slot_index,
        data.team,
      );

      this.server.to(roomUuid).emit('lobby_updated', {
        users,
        updatedUser,
      });

      return {
        status: 'success',
        data: {
          updatedUser: {
            publicUserId: updatedUser.publicUserId,
            team: updatedUser.team,
            role: updatedUser.role,
            slotIndex: updatedUser.slotIndex,
          },
        },
      };
    } catch (error) {
      this.logger.error(`join_team failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }
}
