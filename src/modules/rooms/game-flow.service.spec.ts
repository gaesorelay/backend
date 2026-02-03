import { GameFlowService } from './game-flow.service';
import { RoomsRepository } from './rooms.repository';
import { TimerService } from '../timer/timer.service';
import { GamesService } from '../games/games.service';
import { AiJudgeService } from '../ai-judges/ai-judges.service';
import { RoomStatusSubject } from './room-status.subject';
import {
  CARD_SHUFFLE_TIME,
  JUDGE_SHUFFLE_TIME,
  JUDGING_TIME,
  STORY_TIME,
  TURN_COUNT,
} from '../../common/constants/game-flow.constants';

const flushPromises = async () => {
  // 비동기 마이크로태스크를 여러 번 비워 타이머 콜백 내 await 처리를 진행시킨다.
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

const runAllTimers = async () => {
  // 중첩 스케줄까지 모두 실행될 때까지 남은 타이머를 반복 소진한다.
  while (jest.getTimerCount() > 0) {
    jest.runOnlyPendingTimers();
    await flushPromises();
  }
};

describe('GameFlowService', () => {
  const roomUuid = 'ROOM-1';
  const room = {
    roomUuid,
    status: 'WAITING',
    isStarted: false,
    config: {
      roundTime: 1,
      voteTime: 2,
      maxPlayers: 8,
      storytellerCount: 4,
      rounds: TURN_COUNT,
    },
  };

  let roomsRepository: jest.Mocked<RoomsRepository>;
  let timerService: TimerService;
  let gamesService: jest.Mocked<GamesService>;
  let aiJudgeService: jest.Mocked<AiJudgeService>;
  let roomStatusSubject: RoomStatusSubject;
  let service: GameFlowService;

  beforeEach(() => {
    jest.useFakeTimers();

    room.status = 'WAITING';

    roomsRepository = {
      findById: jest.fn().mockResolvedValue(room),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RoomsRepository>;

    timerService = new TimerService();

    gamesService = {
      resetVoteState: jest.fn(),
      getVoteOutcome: jest.fn().mockReturnValue({
        roomUuid,
        votesTeamA: 0,
        votesTeamB: 0,
        winner: 'DRAW',
      }),
      applyAiJudgeVotes: jest.fn(),
      getEvaluateDto: jest.fn().mockReturnValue(null),
      startTurn: jest.fn().mockResolvedValue({
        turn: 1,
        imageId: 1,
        writerA: 'token-a',
        writerB: 'token-b',
      }),
    } as unknown as jest.Mocked<GamesService>;

    aiJudgeService = {
      evaluateRoom: jest.fn(),
    } as unknown as jest.Mocked<AiJudgeService>;

    roomStatusSubject = new RoomStatusSubject();

    service = new GameFlowService(
      roomsRepository,
      timerService,
      gamesService,
      aiJudgeService,
      roomStatusSubject,
    );
    service.onModuleInit();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits phases in order across the full game flow', async () => {
    // 전체 게임 흐름에서 phase가 지정된 순서로 emit되는지 검증한다.
    const emitStatus = jest.fn();
    const emitVoteResult = jest.fn();

    // 게임 흐름 시작 후 모든 타이머를 끝까지 진행한다.
    service.startGameFlow(roomUuid, emitStatus, emitVoteResult);
    await flushPromises();

    await runAllTimers();

    const roundMs = room.config.roundTime * 1000;
    const voteMs = room.config.voteTime * 1000;

    // 서버가 보내야 하는 phase 순서와 지속시간을 고정 배열로 정의한다.
    const expectedTurns = Array.from({ length: TURN_COUNT }, (_, index) => {
      const turnNumber = index + 1;
      const duration = turnNumber === 1 ? roundMs + 3000 : roundMs;
      return ['PLAYING', duration, `TURN${turnNumber}`] as [string, number, string?];
    });

    const expected: Array<[string, number, string?]> = [
      ['WAITING', CARD_SHUFFLE_TIME, 'CARD_SHUFFLE'],
      ['WAITING', JUDGE_SHUFFLE_TIME, 'JUDGE_SHUFFLE'],
      ...expectedTurns,
      ['RESULTING', STORY_TIME, 'STORY'],
      ['RESULTING', voteMs, 'VOTING'],
      ['RESULTING', JUDGING_TIME, 'JUDGE_RESULT'],
      ['ENDED', 0, 'JUDGE_RESULT'],
    ];

    // 실제 emit된 status 호출을 [status, duration, displayStatus] 형태로 추출한다.
    const actual = emitStatus.mock.calls.map(
      (call) => [call[0], call[1], call[2]] as [string, number, string?],
    );

    // 기대 순서와 완전히 일치하는지 확인한다.
    expect(actual).toEqual(expected);
  });

  it('emits vote result at the end and resets vote state', async () => {
    // 종료 시점에 vote 결과가 전달되고, 투표 상태가 초기화되는지 확인한다.
    const emitStatus = jest.fn();
    const emitVoteResult = jest.fn();

    // 게임 흐름을 끝까지 진행한다.
    service.startGameFlow(roomUuid, emitStatus, emitVoteResult);
    await flushPromises();

    await runAllTimers();

    // 종료 이벤트에서 결과가 1회 전송되는지 검증한다.
    expect(emitVoteResult).toHaveBeenCalledTimes(1);
    expect(emitVoteResult).toHaveBeenCalledWith({
      roomUuid,
      votesTeamA: 0,
      votesTeamB: 0,
      winner: 'DRAW',
    });
    // 시작 시 1회, 종료 시 1회 초기화되므로 총 2회 호출을 기대한다.
    expect(gamesService.resetVoteState).toHaveBeenCalledTimes(2);
  });
});
