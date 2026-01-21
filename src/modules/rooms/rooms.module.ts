import { Module } from '@nestjs/common';

import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomsRepository],
  exports: [RoomsService],
})
export class RoomsModule {}
