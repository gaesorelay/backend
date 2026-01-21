import { Injectable } from '@nestjs/common';

import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsRepository } from './rooms.repository';
import { Room } from '../../common/types/room.type';
import { generateOwnerToken, generateRoomId } from '../../common/utils/id.util';

@Injectable()
export class RoomsService {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  async createRoom(dto: CreateRoomDto): Promise<CreateRoomResponseDto> {
    const roomId = generateRoomId();
    const ownerToken = generateOwnerToken();
    const room: Room = {
      roomUuid: roomId,
      ownerUserToken: ownerToken,
      title: dto.title,
      status: 'LOBBY',
      config: dto.config,
      createdAt: Date.now(),
    };

    await this.roomsRepository.save(room);

    // TODO: USER 레코드(토큰 PK) 생성 후 실제 userId/token 반환.
    return {
      roomId,
      token: ownerToken,
    };
  }
}
