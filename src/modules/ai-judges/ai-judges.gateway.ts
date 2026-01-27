import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { AiJudgeService } from '../../modules/ai-judges/ai-judges.service';

@WebSocketGateway({
  namespace: 'rooms', // 네임스페이스 확인
  cors: {
    origin: '*', // CORS 허용
    credentials: true,
  },
})
export class AiJudgesGateway {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('EventsGateway');
  constructor(private readonly aiJudgeService: AiJudgeService) {}

  /**
   * 심사 요청 처리
   * 클라이언트가 게임 종료 후 'request_judging' 이벤트를 보내면 실행됨
   */
  @SubscribeMessage('request_judging')
  async handleJudging(@MessageBody() data: { roomId: string }) {
    this.logger.log(`🤖 심사 요청 수신: 방 ${data.roomId}`);

    try {
      // 1. 평가할 게임 데이터 준비
      // (지금은 임시 데이터지만, 나중에 Redis에서 유저들이 작성한 실제 스토리를 가져와야 함)
      const storyData = {
        genre: '판타지',
        content: '옛날 옛적에 코딩하는 고양이가 살았는데 버그를 잡아서 생선을 샀대.', // 임시 내용
      };

      // 2. 서비스 호출 (방 번호만 넘기면 알아서 심사위원 조회 후 평가함)
      const results = await this.aiJudgeService.evaluateRoom(data.roomId, storyData);

      this.logger.log(`✅ 심사 완료: 방 ${data.roomId}, 결과 ${results.length}건`);

      // 3. 결과 방송
      this.server.to(data.roomId).emit('judging_finished', {
        results: results, // [{ personaName, score, comment }, ...]
      });
    } catch (error) {
      this.logger.error(`심사 중 에러 발생: ${error.message}`);

      // 에러 발생 시 클라이언트에게 알림
      this.server.to(data.roomId).emit('error', {
        message: 'AI 심사 중 오류가 발생했습니다.',
      });
    }
  }
}
