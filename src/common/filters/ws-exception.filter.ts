import { Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch() // 모든 예외를 잡겠다는 뜻 (특정 예외만 잡으려면 @Catch(WsException) 처럼 명시)
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();

    // 1. 에러 데이터 초기화
    let errorResponse: any;

    // 2. 예외 타입에 따라 처리
    if (exception instanceof WsException) {
      // 우리가 Guard에서 던진 throw new WsException(...) 데이터가 여기 들어있음
      errorResponse = exception.getError();
    } else if (exception instanceof HttpException) {
      // 혹시 모를 HTTP 예외 처리
      errorResponse = {
        status: 'error',
        code: exception.getStatus(),
        message: exception.message,
      };
    } else if (exception instanceof Error) {
      // 일반 자바스크립트 에러
      errorResponse = {
        status: 'error',
        code: 500,
        message: exception.message,
      };
    } else {
      // 알 수 없는 에러
      errorResponse = {
        status: 'error',
        code: 500,
        message: 'Internal Server Error',
      };
    }

    // 3. 로그 찍기 (서버 디버깅용)
    console.error(`[WS Error] ClientID: ${client.id}, Error:`, errorResponse);

    // 4. 클라이언트에게 'error'라는 이벤트명으로 전송
    // 프론트엔드에서는 socket.on('error', (data) => ...) 로 받게 됨
    client.emit('error', errorResponse);
  }
}
