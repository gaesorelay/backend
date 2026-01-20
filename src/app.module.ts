import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // 추가
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module'; // 추가

@Module({
  imports: [
    // 1. 환경변수 모듈 설정 (isGlobal: true로 해야 전체에서 접근 가능)
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // 2. 우리가 만든 Redis 모듈 등록
    RedisModule, 
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}