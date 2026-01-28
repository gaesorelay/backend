import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AiJudgeController } from './ai-judges.controller';
import { AiJudgeService } from './ai-judges.service';
import { AiJudgesGateway } from './ai-judges.gateway';
import { AiJudgesRepository } from './ai-judges.repository';
import { GamesModule } from '../games/games.module';

@Module({
  imports: [HttpModule, ConfigModule, GamesModule],
  controllers: [AiJudgeController],
  providers: [AiJudgeService, AiJudgesGateway, AiJudgesRepository],
  exports: [AiJudgeService],
})
export class AiJudgeModule {}
