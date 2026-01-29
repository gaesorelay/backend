import { Module } from '@nestjs/common';
import { GamesService } from './games.service';
import { GamesRepository } from './games.repository';
import { GamesGateway } from './games.gateway';
// RedisModule 필요할 경우 import (Global이 아니면)

@Module({
  imports: [],
  providers: [GamesService, GamesRepository, GamesGateway],
  exports: [GamesService], // RoomsModule에서 사용하기 위해 export
})
export class GamesModule {}
