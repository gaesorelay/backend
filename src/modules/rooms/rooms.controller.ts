import { Body, Controller, Post, Get, Param } from '@nestjs/common';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  createRoom(@Body() body: CreateRoomDto): Promise<CreateRoomResponseDto> {
    return this.roomsService.createRoom(body);
  }

  @Get(':roomUuid')
  async getRoom(@Param('roomUuid') roomUuid: string) {
    const roomInfo = await this.roomsService.getRoomInfo(roomUuid);
    return {
      status: 'success',
      data: roomInfo,
    };
  }
}
