import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { GameState } from '../../modules/games/types/game-state.type';
import { redisKeys } from '../../common/constants/redis.keys';

@Injectable()
export class AiJudgesRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {}
}
