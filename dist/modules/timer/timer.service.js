"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerService = void 0;
const common_1 = require("@nestjs/common");
const redis_keys_1 = require("../../common/constants/redis.keys");
let TimerService = class TimerService {
    timers = new Map();
    schedule({ roomUuid, status, delayMs }, onFire) {
        const key = this.makeKey(roomUuid, status);
        this.cancel(roomUuid, status);
        const timeout = setTimeout(() => {
            this.timers.delete(key);
            onFire();
        }, delayMs);
        this.timers.set(key, timeout);
    }
    cancel(roomUuid, status) {
        const key = this.makeKey(roomUuid, status);
        const timeout = this.timers.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.timers.delete(key);
        }
    }
    cancelAll(roomUuid) {
        for (const key of this.timers.keys()) {
            if (key.startsWith(`${roomUuid}:`)) {
                const timeout = this.timers.get(key);
                if (timeout) {
                    clearTimeout(timeout);
                }
                this.timers.delete(key);
            }
        }
    }
    makeKey(roomUuid, status) {
        return redis_keys_1.redisKeys.roomTimer(roomUuid, status);
    }
};
exports.TimerService = TimerService;
exports.TimerService = TimerService = __decorate([
    (0, common_1.Injectable)()
], TimerService);
//# sourceMappingURL=timer.service.js.map