import { Body, Controller, Post } from '@nestjs/common';
// 타입으로만 사용되기 때문에 import type 사용
import type { CreateRoomDto } from './dto/create-room.dto';
import type { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsService } from './rooms.service';

@Controller('api/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  createRoom(@Body() body: CreateRoomDto): Promise<CreateRoomResponseDto> {
    return this.roomsService.createRoom(body);
  }
}
