import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler } = requestProps;
    console.log(limit);

    const client = context.switchToWs().getClient();
    const headers = client.handshake?.headers || {};
    const ip = headers['x-forwarded-for'] || client.handshake?.address || 'unknown';

    const throttlerName = throttler.name ?? 'default';

    // 🚨 [해결] 함수인지 숫자인지 체크해서 무조건 'number'로 뽑아냅니다.
    const numericTtl = typeof ttl === 'function' ? await (ttl as Function)(context) : ttl;
    console.log(ttl, numericTtl, throttler.blockDuration);

    // 🚨 [핵심] 키를 'IP-이름'으로 고정해서 카운트가 리셋되지 않게 합니다.
    const key = `${ip}-${throttlerName}`;
    const numericBlockDuration =
      typeof throttler.blockDuration === 'function'
        ? await (throttler.blockDuration as Function)(context)
        : (throttler.blockDuration as number) || 0;

    // 이제 numericTtl과 numericLimit은 확실히 number 타입입니다.
    const { totalHits, timeToExpire } = await this.storageService.increment(
      key,
      numericTtl,
      limit,
      numericBlockDuration as number,
      throttlerName,
    );

    console.log(
      `🛡️ [${throttlerName}] Key:${key} | Count: ${totalHits}/${limit} | TTL: ${numericTtl}남은시간(초): ${timeToExpire}, BlockDuration: ${numericBlockDuration}`,
    );

    if (totalHits > limit) {
      console.error(`🚫 [차단됨] ${throttlerName} 규칙 위반!`);
      throw new WsException({
        status: 'error',
        message: '도배하지 마세요! 🐶 (요청 과다)',
        code: 429,
      });
    }

    return true;
  }
}
