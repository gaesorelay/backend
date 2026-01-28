import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JoinRoomDto } from './dto/join-room.dto';
import { LeaveTeamDto } from './dto/leave-team.dto';
import { Room, RoomConfig } from '../../common/types/room.type';
import { KickUserDto } from './dto/kick-user.dto';
import { User } from '../../common/types/user.type';
import { AiJudgeService } from '../ai-judges/ai-judges.service';

@WebSocketGateway({
  namespace: 'game',
  cors: {
    origin: true, //['http://localhost:5173'], 실제 배포 시에는 프론트엔드 도메인으로 제한해야 함
    credentials: true,
  },
})
export class RoomsGateway {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('RoomsGateway');

  constructor(
    private readonly roomsService: RoomsService,
    private readonly aiJudgeService: AiJudgeService,
  ) {}

  /**
   * 1. 방 입장 (Setup -> GameRoom 진입 시)
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: JoinRoomDto,
  ) {
    this.logger.log(`🔍 join_room 요청: 방=${data.roomId}, 닉네임=${data.nickname}`);

    try {
      const user: User = await this.roomsService.joinRoom(
        data.roomId,
        data.nickname,
        client.id,
        data.avatarId,
        data.userToken,
      );

      // 소켓을 해당 방 채널에 조인
      client.join(data.roomId);

      this.logger.log(
        `✅ 입장 성공: ${user.nickname} (Token: ${user.userToken}, Socket: ${client.id})`,
      );

      // ⭐️ [변경] 단순히 "누가 왔다"가 아니라, "최신 유저 리스트"를 방 전체에 뿌립니다.
      // 이를 위해선 Service에 getUsersInRoom 함수가 있어야 합니다.
      const users = await this.roomsService.getUsersInRoom(data.roomId);

      this.server.to(data.roomId).emit('lobby_updated', {
        users: users,
        // 필요하다면 여기에 roomConfig 같은 방 정보도 같이 보낼 수 있음
      });

      // 요청자에게는 내 정보를 리턴 (콜백용)
      return { status: 'success', data: user };
    } catch (error) {
      this.logger.error(`❌ 입장 실패: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 2. 방 정보/유저리스트 요청 (새로고침, 게스트 입장 시 사용)
   * ⭐️ [신규 추가된 메서드]
   */
  @SubscribeMessage('request_room_info')
  async handleRequestRoomInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    this.logger.log(`📥 유저 리스트 요청: ${data.roomId} (by ${client.id})`);

    try {
      // 최신 유저 리스트 조회
      const users = await this.roomsService.getUsersInRoom(data.roomId);

      // 요청한 사람에게만(client.emit) 최신 리스트 전송
      client.emit('lobby_updated', {
        users: users,
      });
    } catch (error) {
      this.logger.error(`정보 요청 실패: ${error.message}`);
    }
  }

  @SubscribeMessage('update_room_config')
  async handleUpdateConfig(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { config: RoomConfig }, // 구체적인 Config 타입 사용 권장
  ) {
    // Service 호출
    const room = await this.roomsService.updateRoomConfig(client.id, data.config);

    // 변경된 설정 방송
    this.server.to(room.roomUuid).emit('room_config_updated', { config: room.config });
  }

  @SubscribeMessage('game_ready')
  async handleGameReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { isReady: boolean },
  ) {
    this.logger.log(`game_ready request: socket ${client.id}, ready ${data.isReady}`);

    try {
      const { updatedUser, users, roomUuid } = await this.roomsService.setUserReady(
        client.id,
        data.isReady,
      );

      this.server.to(roomUuid).emit('lobby_updated', {
        users,
        updatedUser,
      });

      return { status: 'success', data: updatedUser };
    } catch (error) {
      this.logger.error(`game_ready failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('join_team')
  async handleJoinTeam(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { public_user_id: number; slot_index: number; team: string },
  ) {
    this.logger.log(
      `join_team request: socket ${client.id}, target ${data.public_user_id}, team ${data.team}, slot ${data.slot_index}`,
    );

    try {
      const { updatedUser, users, roomUuid } = await this.roomsService.joinTeam(
        client.id,
        data.public_user_id,
        data.slot_index,
        data.team,
      );

      this.server.to(roomUuid).emit('lobby_updated', {
        users,
        updatedUser,
      });

      return {
        status: 'success',
        data: {
          updatedUser: {
            publicUserId: updatedUser.publicUserId,
            team: updatedUser.team,
            role: updatedUser.role,
            slotIndex: updatedUser.slotIndex,
          },
        },
      };
    } catch (error) {
      this.logger.error(`join_team failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 5. 팀 슬롯 퇴장 (PLAYER -> AUDIENCE)
   */
  @SubscribeMessage('leave_team')
  async handleLeaveTeam(@ConnectedSocket() client: Socket, @MessageBody() data: LeaveTeamDto) {
    this.logger.log(
      `leave_team request: socket ${client.id}, target ${data.public_user_id}, team ${data.team}, slot ${data.slot_index}`,
    );

    try {
      const { updatedUser, users, roomUuid } = await this.roomsService.leaveTeam(
        client.id,
        data.public_user_id,
        data.slot_index,
        data.team,
      );

      this.server.to(roomUuid).emit('lobby_updated', {
        users,
        updatedUser,
      });

      return {
        status: 'success',
        data: {
          updatedUser: {
            publicUserId: updatedUser.publicUserId,
            team: updatedUser.team ?? 'NONE',
            role: updatedUser.role,
            slotIndex: updatedUser.slotIndex,
          },
        },
      };
    } catch (error) {
      this.logger.error(`leave_team failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * ⭐️ [신규] 자동 채우기 요청
   * - 방장이 누르면 빈 슬롯에 관객을 채워넣음
   */
  @SubscribeMessage('auto_fill')
  async handleAutoFill(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    this.logger.log(`🤖 Auto-fill request by ${client.id}`);

    try {
      // Service 호출
      const { updatedUsers, roomUuid } = await this.roomsService.autoFillSlots(client.id);

      // 변경된 유저 리스트 방송 (화면에 누가 어디로 들어갔는지 보여줌)
      this.server.to(roomUuid).emit('lobby_updated', {
        users: updatedUsers,
      });

      return { status: 'success' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  /**
   * ⭐️ [변경] 게임 시작 요청
   * - 이제는 "검증"만 하고 바로 시작함 (자동 채우기 로직 빠짐)
   */
  @SubscribeMessage('start_game')
  async handleStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      // Service에서 조건 검사(풀방+전원레디) 후 시작 처리
      const { roomUuid } = await this.roomsService.startGame(client.id);

      // 심사위원 선정 (기존 로직 유지)
      const judges = await this.aiJudgeService.selectAndSaveJudges(roomUuid);

      // 게임 시작 방송
      this.server.to(roomUuid).emit('game_started', {
        judges: judges,
      });

      return { status: 'success' };
    } catch (error) {
      // 조건 불만족 시 에러 메시지 리턴 (프론트에서 alert 띄우기 용)
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 6. 🚫 유저 강퇴 (방장만 가능)
   */
  @SubscribeMessage('kick_user')
  async handleKickUser(@ConnectedSocket() client: Socket, @MessageBody() data: KickUserDto) {
    this.logger.log(`kick_user request: socket ${client.id}, target ${data.public_user_id}`);

    try {
      const { kickedPublicUserId, users, roomUuid } = await this.roomsService.kickUser(
        client.id,
        data.public_user_id,
      );

      // 강퇴 이후에도 같은 방의 유저 목록을 최신 상태로 브로드캐스트
      this.server.to(roomUuid).emit('lobby_updated', {
        users,
      });

      return {
        status: 'success',
        data: {
          kickedPublicUserId,
        },
      };
    } catch (error) {
      this.logger.error(`kick_user failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }
}
