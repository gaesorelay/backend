import { Module, forwardRef } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { AiJudgeModule } from '../ai-judges/ai-judges.module';
@Module({
  imports: [forwardRef(() => AiJudgeModule)],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsRepository, RoomsGateway],
  exports: [RoomsService],
})
export class RoomsModule {}
