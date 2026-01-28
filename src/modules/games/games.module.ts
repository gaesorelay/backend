import { Module } from '@nestjs/common';
import { GamesService } from './games.service';
import { GamesRepository } from './games.repository';
// RedisModule 등 필요한 모듈 import (Global이 아니라면)

@Module({
  imports: [],
  providers: [GamesService, GamesRepository],
  exports: [GamesService], // 👈 RoomsModule에서 쓰기 위해 내보내기
})
export class GamesModule {}
