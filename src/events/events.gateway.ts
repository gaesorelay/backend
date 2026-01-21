import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RoomsService } from '../modules/rooms/rooms.service';

@WebSocketGateway({
  cors: {
    origin: '*', // 개발 단계에서는 누구나 접속 허용 (배포 시 프론트엔드 주소로 변경 필요)
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: 'game', // 소켓 엔드포인트: localhost:3000/game
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server; // 소켓 서버 인스턴스 (메시지 전체 전송용)
  private logger: Logger = new Logger('EventsGateway');

  // 1. 초기화 시 실행
  afterInit(server: Server) {
    this.logger.log('웹소켓 서버 초기화 완료 🚀');
  }

  // 2. 클라이언트 연결 시 실행
  handleConnection(client: Socket) {
    this.logger.log(`Client Connected : ${client.id}`);

    // (옵션) 클라이언트에게 환영 메시지 보내보기
    client.emit('welcome', '개소릴레이 서버에 오신 것을 환영합니다!');
  }

  // 3. 클라이언트 연결 해제 시 실행
  handleDisconnect(client: Socket) {
    this.logger.log(`Client Disconnected : ${client.id}`);
  }

  // 4. 테스트용 메시지 수신 핸들러
  @SubscribeMessage('test_message')
  handleTestMessage(client: Socket, payload: string) {
    this.logger.log(`받은 메시지: ${payload}`);
    // 보낸 사람에게만 응답
    client.emit('test_response', `서버에서 응답함: ${payload}`);
  }
}
