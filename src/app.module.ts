import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RoomsModule } from './modules/rooms/rooms.module';
import { RedisModule } from './common/redis/redis.module';
import { AiJudgeModule } from './modules/ai-judges/ai-judges.module';
import configuration from './config/configuration';
import * as Joi from 'joi';
import { CoreGateway } from './common/gateways/core.gateway';
import { GamesModule } from './modules/games/games.module';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development',
      load: [configuration],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number(),
        REDIS_HOST: Joi.string(),
        REDIS_PORT: Joi.number(),
      }),
    }),
    RedisModule,
    RoomsModule,
    AiJudgeModule,
    GamesModule,
    ThrottlerModule.forRoot([
      {
        // 1. 방 생성 규칙 (이름: 'room-creation')
        name: 'room-creation',
        ttl: 60000, // 1분 (밀리초 단위)
        limit: 3, // 3회
      },
      {
        // 2. 채팅 규칙 (이름: 'chat')
        name: 'chat',
        ttl: 1000, // 1초
        limit: 5, // 5회
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, CoreGateway],
})
export class AppModule {}
