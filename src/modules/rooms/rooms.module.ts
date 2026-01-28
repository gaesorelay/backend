import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { AiJudgeService } from '../ai-judges/ai-judges.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomsRepository, RoomsGateway, AiJudgeService],
  exports: [RoomsService],
})
export class RoomsModule {}
