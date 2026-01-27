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
  ],
  controllers: [AppController],
  providers: [AppService, CoreGateway],
})
export class AppModule {}
