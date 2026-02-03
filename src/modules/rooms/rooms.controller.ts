import { Body, Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { CreateRoomResponseDto } from './dto/create-room.response.dto';
import { RoomsService } from './rooms.service';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'room-creation': { limit: 3, ttl: 60000 } })
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
