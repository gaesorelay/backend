import { Module, forwardRef } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { AiJudgeModule } from '../ai-judges/ai-judges.module';
import { GamesModule } from '../games/games.module';
import { TimerModule } from '../timer/timer.module';
import { GameFlowService } from './game-flow.service';
import { RoomStatusSubject } from './room-status.subject';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [forwardRef(() => AiJudgeModule), GamesModule, TimerModule, ThrottlerModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsRepository, RoomsGateway, GameFlowService, RoomStatusSubject],
  exports: [RoomsService],
})
export class RoomsModule {}
