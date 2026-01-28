import { RoomConfig } from '../../../common/types/room.type';

// 방 생성 API 요청 시 Request 값
export interface CreateRoomDto {
  title: string;
  config: RoomConfig;
  avatarId: number;
}
