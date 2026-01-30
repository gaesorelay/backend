// init-redis.js
const Redis = require('ioredis');
const redis = new Redis({ host: 'localhost', port: 6379 }); // 설정 확인

const ROOM_ID = 'TEST_ROOM';

// 🔑 테스트용 토큰 (이 토큰을 가진 사람만 입력 가능)
const WRITER_TOKEN = 'TOKEN_A_1';
const VIEWER_TOKEN = 'TOKEN_B_1';

const gameState = {
  roomUuid: ROOM_ID,

  // 👥 순서 리스트
  teamAOrder: [WRITER_TOKEN, 'TOKEN_A_2'],
  teamBOrder: [VIEWER_TOKEN, 'TOKEN_B_2'],

  imageIDs: [1, 2, 3, 4, 5, 6, 7, 8],

  // 🛠️ [수정] storyA -> teamAStory 로 변경 (여기가 범인!)
  teamAStory: [],
  teamBStory: [],

  genre: 'test',
  aiJudgeIDs: [], // (참고: 대소문자 주의, 인터페이스랑 맞춰주세요)
  turnEndAt: 0,
};

// 2. ⭐️ [추가] 방 데이터 (이게 없어서 에러가 난 것!)
const roomData = {
  uuid: ROOM_ID,
  title: '테스트 방입니다',
  hostId: 'HOST_USER',
  status: 'WAITING', // 초기 상태
  maxPlayers: 6,
  headCount: 4,
  config: {
    // GameFlowService가 시간을 계산할 때 참고함
    roundTime: 60,
    voteTime: 30,
    storytellerCount: 1, // 혹은 8
  },
  players: [
    { token: WRITER_TOKEN, nickname: 'UserA', team: 'A', socketId: 'mock-socket-a' },
    { token: VIEWER_TOKEN, nickname: 'UserB', team: 'B', socketId: 'mock-socket-b' },
  ],
};

async function init() {
  // 기존 데이터 날리고 새로 주입
  await redis.del(`room:${ROOM_ID}:game`);
  await redis.del(`room:${ROOM_ID}:info`);
  await redis.set(`room:${ROOM_ID}:game`, JSON.stringify(gameState));
  await redis.set(`room:${ROOM_ID}:info`, JSON.stringify(roomData));

  console.log(`✅ [Redis 준비 완료] 방: ${ROOM_ID}`);
  console.log(`👉 A팀 현재 턴: ${WRITER_TOKEN}`);
  console.log(`👉 B팀 현재 턴: ${VIEWER_TOKEN}`);

  process.exit();
}

init();
