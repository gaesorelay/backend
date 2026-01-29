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
import { RoomConfig, RoomStatus } from './types/room.type';
import { KickUserDto } from './dto/kick-user.dto';
import { ChatDto } from './dto/chat.dto';
import { User } from '../users/types/user.type';
import { AiJudgeService } from '../ai-judges/ai-judges.service';
import { GamesService } from '../games/games.service';

@WebSocketGateway({
  namespace: 'game',
  cors: {
    origin: true, // 실제 배포 시에는 프론트엔드 도메인으로 제한
    credentials: true,
  },
})
export class RoomsGateway {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('RoomsGateway');

  constructor(
    private readonly roomsService: RoomsService,
    private readonly aiJudgeService: AiJudgeService,
    private readonly gamesService: GamesService,
  ) {}

  /**
   * 1. 방 입장 (Setup -> GameRoom 진입)
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: JoinRoomDto,
  ) {
    this.logger.log(`join_room 요청: 방 ${data.roomId}, 닉네임 ${data.nickname}`);

    try {
      const user: User = await this.roomsService.joinRoom(
        data.roomId,
        data.nickname,
        client.id,
        data.avatarId,
        data.userToken,
      );

      // 해당 방 소켓 룸 join
      client.join(data.roomId);

      this.logger.log(
        `입장 성공: ${user.nickname} (Token: ${user.userToken}, Socket: ${client.id})`,
      );

      // 최신 유저 목록 브로드캐스트
      const users = await this.roomsService.getUsersInRoom(data.roomId);

      this.server.to(data.roomId).emit('lobby_updated', {
        users: users,
      });

      this.server.to(data.roomId).emit('chat_message', {
        nickname: 'SYSTEM',
        message: `${user.nickname}님이 입장했습니다.`,
        type: 'system', // 시스템 메시지
      });

      // 요청자에게 응답 반환
      return { status: 'success', data: user };
    } catch (error) {
      this.logger.error(`입장 실패: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 2. 방 퇴장
   */
  @SubscribeMessage('leave_room')
  async handleLeaveRoom(@ConnectedSocket() client: Socket) {
    this.logger.log(`leave_room 요청: socket ${client.id}`);

    try {
      const result = await this.roomsService.leaveRoom(client.id);
      if (!result) {
        return { status: 'error', message: '유저 정보를 찾을 수 없습니다.' };
      }

      const { roomUuid, nickname } = result;

      client.leave(roomUuid);

      const users = await this.roomsService.getUsersInRoom(roomUuid);

      this.server.to(roomUuid).emit('lobby_updated', {
        users: users,
      });

      this.server.to(roomUuid).emit('chat_message', {
        nickname: 'SYSTEM',
        message: `${nickname}님이 퇴장했습니다.`,
        type: 'system',
      });

      return { status: 'success' };
    } catch (error) {
      this.logger.error(`leave_room failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 3. 방 정보/유저 목록 요청
   */
  @SubscribeMessage('request_room_info')
  async handleRequestRoomInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    this.logger.log(`방 유저 목록 요청: ${data.roomId} (by ${client.id})`);

    try {
      // (1) 방의 상세 정보(제목, 초대코드, 설정) 가져오기
      const room = await this.roomsService.getRoomById(data.roomId);

      // (2) 현재 방에 있는 유저 명단 가져오기
      const users = await this.roomsService.getUsersInRoom(data.roomId);

      // (3) ⭐️ [수정] ACK 패턴: 데이터를 바로 리턴 (클라이언트는 callback으로 수신)
      return {
        status: 'success',
        data: {
          roomId: room.roomUuid, // UUID (소켓 연결용)
          title: room.title, // ⭐️ 방 제목 (aa 해결용)
          config: room.config, // 게임 설정 (타이머 등)
          status: room.status, // 대기중/게임중 상태
          users: users, // 유저 명단
        },
      };
    } catch (error) {
      this.logger.error(`방 정보 요청 실패: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('update_room_config')
  async handleUpdateConfig(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { config: RoomConfig }, // 구체적인 Config 타입 사용 권장
  ) {
    // Service 호출
    const room = await this.roomsService.updateRoomConfig(client.id, data.config);

    // 변경된 설정 브로드캐스트
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

  @SubscribeMessage('send_chat')
  async handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ChatDto, // DTO 적용
  ) {
    try {
      // 1. 소켓 ID로 유저 정보 조회 (Service 통해서 사용)
      const user = await this.roomsService.getUserBySocket(client.id);

      // 2. 로그 (선택 사항)

      // 3. 방 전체 브로드캐스트
      this.server.to(user.roomUuid).emit('chat_message', {
        senderId: client.id, // 메시지 구분용
        nickname: user.nickname, // 화면 표시 닉네임
        avatarId: user.avatarId, // 아바타 표시용
        team: user.team, // (선택) 팀별 색상 표시 등
        isHost: user.isHost, // (선택) 방장 표시
        message: data.message,
        timestamp: Date.now(),
      });
    } catch (error) {
      // 유저를 찾지 못하거나 오류가 나면 에러 반환
      return { status: 'error', message: '메시지 전송 실패' };
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

      this.server.to(roomUuid).emit('chat_message', {
        nickname: 'SYSTEM',
        message: `${updatedUser.nickname}님이 ${updatedUser.team}팀으로 이동했습니다.`,
        type: 'system', // 시스템 메시지
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
   * [옵션] 자동 채우기 요청
   * - 방장이 빈 팀 슬롯을 관전자에서 채움
   */
  @SubscribeMessage('auto_fill')
  async handleAutoFill(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    this.logger.log(`auto_fill 요청: ${client.id}`);

    try {
      // Service 호출
      const { updatedUsers, roomUuid } = await this.roomsService.autoFillSlots(client.id);

      // 변경된 유저 목록 브로드캐스트
      this.server.to(roomUuid).emit('lobby_updated', {
        users: updatedUsers,
      });

      return { status: 'success' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 게임 시작 요청
   * - 서버 검증 후 실제 게임 시작
   */
  @SubscribeMessage('start_game')
  async handleStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      // Service에서 조건 검증 후 게임 시작 처리
      const { roomUuid } = await this.roomsService.startGame(client.id);

      // 이미지 8개 랜덤 선정 및 저장
      const imageIds = await this.gamesService.selectAndSaveImages(roomUuid);

      // 심사위원 선정
      const judges = await this.aiJudgeService.selectAndSaveJudges(roomUuid);

      // 게임 시작 브로드캐스트
      this.server.to(roomUuid).emit('game_started', {
        imageIds: imageIds,
        judges: judges,
      });

      // await this.roomsService.startGameFlow(roomUuid, (status, durationMs) => {
      //   this.emitPhase(roomUuid, status, durationMs);
      // });

      // 4. ⭐️ [수정] 게임 흐름 시작 (이벤트 이름 change_phase로 통일)
      await this.roomsService.startGameFlow(
        roomUuid,
        (status, durationMs, displayStatus) => {
          this.emitPhase(roomUuid, status, durationMs, displayStatus);
        },
        (outcome) => {
          this.server.to(roomUuid).emit('vote_result', outcome);
        },
      );

      return { status: 'success' };
    } catch (error) {
      // 조건 미충족 등 에러 메시지 반환
      this.logger.error(`게임 시작 실패: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('submit_vote')
  async handleSubmitVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { team: 'A' | 'B' },
  ) {
    try {
      // 관객 투표는 서버 메모리에 누적 저장하고 즉시 브로드캐스트한다.
      const user = await this.roomsService.getUserBySocket(client.id);
      const room = await this.roomsService.getRoomById(user.roomUuid);
      if (room.status !== 'VOTING') {
        return { status: 'error', message: 'Voting is not open.' };
      }
      const outcome = this.gamesService.submitAudienceVote(user.roomUuid, data.team);

      this.server.to(user.roomUuid).emit('vote_updated', {
        votesTeamA: outcome.votesTeamA,
        votesTeamB: outcome.votesTeamB,
      });

      return { status: 'success', data: outcome };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  // AI 투표 반영은 VOTING 시작 시점에 내부 로직으로 처리

  /**
   * 6. 유저 강퇴 (방장만 가능)
   */
  @SubscribeMessage('kick_user')
  async handleKickUser(@ConnectedSocket() client: Socket, @MessageBody() data: KickUserDto) {
    this.logger.log(`kick_user request: socket ${client.id}, target ${data.public_user_id}`);

    try {
      const { kickedPublicUserId, users, roomUuid } = await this.roomsService.kickUser(
        client.id,
        data.public_user_id,
      );

      // 강퇴 이후에도 같은 방의 유저 목록 브로드캐스트
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
  private emitPhase(
    roomUuid: string,
    status: RoomStatus,
    durationMs: number,
    displayStatus?: string,
  ) {
    this.server.to(roomUuid).emit('change_phase', {
      status,
      displayStatus: displayStatus ?? status,
      startAt: Date.now(),
      durationMs,
    });
  }
}
