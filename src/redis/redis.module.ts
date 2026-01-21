import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global() // 1. Global 데코레이터를 쓰면 다른 모듈에서 import 안 해도 사용 가능!
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT', // 2. 이 이름으로 의존성을 주입받게 됩니다.
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'], // 3. 다른 곳에서 쓸 수 있게 내보내기
})
export class RedisModule {}
