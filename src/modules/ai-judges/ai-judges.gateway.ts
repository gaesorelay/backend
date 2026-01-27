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
import { AiJudgeService } from './ai-judges.service';
import { EvaluateSubmissionDto } from './dto/judge.dto';

@WebSocketGateway({
  namespace: 'ai-judge', // AI 관련 네임스페이스
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class AiJudgesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('AiJudgesGateway');

  constructor(private readonly aiJudgesService: AiJudgeService) {}

  afterInit(server: Server) {
    this.logger.log('✅ AI Judges WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client Connected to AI-Judge Namespace : ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client Disconnected from AI-Judge Namespace : ${client.id}`);
  }

  /**
   * 클라이언트가 AI 판정을 요청할 때 (테스트용 or 실제 호출)
   * { roomId: string, genre: string, ... }
   */
  @SubscribeMessage('request_ai_judge')
  async handleRequestAiJudge(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; submission: EvaluateSubmissionDto },
  ) {
    this.logger.log( 
      `⚖️ AI Judge Request from ${client.id} for Room ${data.roomId}`,
    );

    try {
      // 1. AI 평가 진행
      const aiResult = await this.aiJudgesService.evaluateSubmission(
        data.submission,
      );

      // 2. 결과 브로드캐스트 (해당 방의 모든 인원에게)
      // 주의: 'ai-judge' 네임스페이스에 접속한 클라이언트들에게만 전송됨
      // 클라이언트가 rooms 네임스페이스와 ai-judge 네임스페이스를 둘 다 연결하거나,
      // 혹은 Gateway간 통신이 필요할 수 있음.
      // 일단은 요청자에게 응답 + 해당 네임스페이스 룸으로 브로드캐스트
      
      // 방 개념이 네임스페이스마다 별도이므로, 클라이언트가 ai-judge 네임스페이스에서도 join을 해야 함.
      // 임시로 client.join(data.roomId)를 여기서 하거나, 별도 join 이벤트가 필요.
      client.join(data.roomId); 

      this.server.to(data.roomId).emit('ai_judge_result', {
        personaName: aiResult.personaName,
        score: aiResult.score,
        comment: aiResult.comment,
      });

      return { status: 'success', data: aiResult };
    } catch (error) {
      this.logger.error(`AI Judging Failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }
}
