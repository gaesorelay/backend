import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AiJudgeController } from './ai-judges.controller';
import { AiJudgeService } from './ai-judges.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [AiJudgeController],
  providers: [AiJudgeService],
  exports: [AiJudgeService],
})
export class AiJudgeModule {}
