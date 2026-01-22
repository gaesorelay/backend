import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { RoomsModule } from '../modules/rooms/rooms.module';

@Module({
  imports: [RoomsModule],
  providers: [EventsGateway], // 게이트웨이를 프로바이더로 등록
})
export class EventsModule {}
