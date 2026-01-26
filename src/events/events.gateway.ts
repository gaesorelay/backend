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
import { RoomsService } from '../modules/rooms/rooms.service'; // Service import 필수
import { User } from '../common/types/user.type'; // User 타입 import

@WebSocketGateway({
  namespace: 'game', // 네임스페이스 확인
  cors: {
    origin: '*', // CORS 허용
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('EventsGateway');

  // ⭐️ [핵심] RoomsService 주입!
  // 이제 Gateway가 Service의 함수(joinRoom 등)를 쓸 수 있게 됩니다.
  constructor(private readonly roomsService: RoomsService) {}

  afterInit(server: Server) {
    this.logger.log('✅ Socket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client Connected : ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client Disconnected : ${client.id}`);

    try {
      // 1. 서비스 호출: "이 사람 잠깐 나갔어요, 60초 타이머 켜세요"
      await this.roomsService.handleConnectionLoss(client.id);

      // 1. 서비스 호출: 유저 삭제 및 빈 방 정리
      const leftUser = await this.roomsService.leaveRoom(client.id);

      if (leftUser) {
        this.logger.log(`🚪 유저 퇴장: ${leftUser.nickname} (방: ${leftUser.roomUuid})`);

        // 2. 같은 방에 있는 사람들에게 알림
        // (중요: 소켓은 이미 끊겼으므로 client.to() 대신 server.to()를 써야 할 수도 있지만,
        //  client 인스턴스가 살아있다면 client.to()도 동작합니다. 안전하게 server 사용 추천)
        this.server.to(leftUser.roomUuid).emit('user_left', {
          nickname: leftUser.nickname,
        });
      }
    } catch (error) {
      this.logger.error(`퇴장 처리 중 에러: ${error.message}`);
    }
  }

  // 👇 [핵심] 클라이언트의 'join_room' 요청을 받는 핸들러
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; nickname: string; userToken?: string },
  ) {
    this.logger.log(`🔍 join_room 요청: 방=${data.roomId}, 닉네임=${data.nickname}`);

    try {
      // 1. 비즈니스 로직 실행 (Redis에 유저 저장)
      // Service의 joinRoom 함수가 User 객체를 리턴한다고 가정
      const user: User = await this.roomsService.joinRoom(
        data.roomId,
        data.nickname,
        client.id,
        data.userToken,
      );

      // 2. 소켓을 해당 방 채널(Room)에 실제로 접속시킴
      // 이게 되어야 server.to(roomId).emit()을 했을 때 메시지를 받을 수 있음
      client.join(data.roomId);
      this.logger.log(
        `join_room token: ${user.userToken} (room: ${data.roomId}, nickname: ${user.nickname})`,
      );
      this.logger.log(`✅ 소켓 룸 입장 완료: ${client.id} -> ${data.roomId}`);

      // 3. [방송] 방에 있는 다른 사람들에게 "새 유저가 왔다"고 알림
      client.to(data.roomId).emit('user_joined', {
        nickname: user.nickname,
        role: user.role,
        avatarId: user.avatarId, // 아바타 정보도 보내주면 좋음
      });

      // 4. [응답] 요청을 보낸 본인에게 성공 메시지와 내 정보 반환
      return { status: 'success', data: user };
    } catch (error) {
      this.logger.error(`❌ 입장 실패: ${error.message}`);
      // 에러가 나면 클라이언트에게 실패 이유를 알려줌
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('game_ready')
  async handleGameReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { isReady: boolean },
  ) {
    // 유저가 준비 상태를 변경하면 대기실 상태를 전체에게 브로드캐스트
    this.logger.log(
      `game_ready request: socket ${client.id}, ready ${data.isReady}`,
    );

    try {
      const { updatedUser, users, roomUuid } = await this.roomsService.setUserReady(
        client.id,
        data.isReady,
      );

      // 대기실 UI 갱신 이벤트
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
