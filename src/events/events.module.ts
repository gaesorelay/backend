import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { RoomsModule } from '../modules/rooms/rooms.module';
import { AiJudgeModule } from '../modules/ai-judges/ai-judges.module';

@Module({
  imports: [RoomsModule, AiJudgeModule], // 필요한 모듈들 임포트
  providers: [EventsGateway], // 게이트웨이를 프로바이더로 등록
})
export class EventsModule {}
