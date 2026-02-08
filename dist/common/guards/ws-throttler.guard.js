"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsThrottlerGuard = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const websockets_1 = require("@nestjs/websockets");
let WsThrottlerGuard = class WsThrottlerGuard extends throttler_1.ThrottlerGuard {
    async handleRequest(requestProps) {
        const { context, limit, ttl, throttler } = requestProps;
        console.log(limit);
        const client = context.switchToWs().getClient();
        const headers = client.handshake?.headers || {};
        const ip = headers['x-forwarded-for'] || client.handshake?.address || 'unknown';
        const throttlerName = throttler.name ?? 'default';
        const numericTtl = typeof ttl === 'function' ? await ttl(context) : ttl;
        console.log(ttl, numericTtl, throttler.blockDuration);
        const key = `${ip}-${throttlerName}`;
        const numericBlockDuration = typeof throttler.blockDuration === 'function'
            ? await throttler.blockDuration(context)
            : throttler.blockDuration || 0;
        const { totalHits, timeToExpire } = await this.storageService.increment(key, numericTtl, limit, numericBlockDuration, throttlerName);
        console.log(`🛡️ [${throttlerName}] Key:${key} | Count: ${totalHits}/${limit} | TTL: ${numericTtl}남은시간(초): ${timeToExpire}, BlockDuration: ${numericBlockDuration}`);
        if (totalHits > limit) {
            console.error(`🚫 [차단됨] ${throttlerName} 규칙 위반!`);
            throw new websockets_1.WsException({
                status: 'error',
                message: '도배하지 마세요! 🐶 (요청 과다)',
                code: 429,
            });
        }
        return true;
    }
};
exports.WsThrottlerGuard = WsThrottlerGuard;
exports.WsThrottlerGuard = WsThrottlerGuard = __decorate([
    (0, common_1.Injectable)()
], WsThrottlerGuard);
//# sourceMappingURL=ws-throttler.guard.js.map