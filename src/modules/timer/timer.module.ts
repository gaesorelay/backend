import { Module } from '@nestjs/common';
import { TimerService } from './timer.service';

@Module({
  // 타이머 서비스 등록
  providers: [TimerService],
  // 다른 모듈에서 주입해 사용할 수 있도록 export
  exports: [TimerService],
})
export class TimerModule {}
