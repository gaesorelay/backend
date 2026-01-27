import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomsRepository, RoomsGateway],
  exports: [RoomsService],
})
export class RoomsModule {}
