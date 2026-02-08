import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
export declare class WsThrottlerGuard extends ThrottlerGuard {
    handleRequest(requestProps: ThrottlerRequest): Promise<boolean>;
}
