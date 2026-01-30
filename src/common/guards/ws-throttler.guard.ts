import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler } = requestProps;

    const client = context.switchToWs().getClient();
    const ip = client.handshake?.address || client.id;
    const throttlerName = throttler.name ?? 'default';
    const key = this.generateKey(context, ip, throttlerName);

    const blockDuration = (throttler.blockDuration as number) || 0;

    // 5. increment 호출
    const { totalHits } = await this.storageService.increment(
      key,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );

    // 6. 제한 초과 시 에러 던지기
    if (totalHits > limit) {
      throw new WsException({
        status: 'error',
        message: '도배하지 마세요! 🐶 (요청 과다)',
        code: 429,
      });
    }

    return true;
  }
}
