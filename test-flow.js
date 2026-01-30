const io = require('socket.io-client');

const URL = 'http://localhost:8000/game';
const ROOM_ID = 'TEST_ROOM';
const WRITER_TOKEN = 'TOKEN_A_1'; // init-redis.js의 A팀 첫 타자

const client = io(URL);

client.on('connect', () => {
  console.log(`✅ 접속 완료 (${client.id})`);

  // 1. 방 입장
  client.emit('join_game_room', { roomId: ROOM_ID });

  // 2. 1초 뒤 게임 시작 트리거 당김!
  setTimeout(() => {
    console.log(`🔫 게임 시작 요청 (start_game)`);
    client.emit('start_game', { roomId: ROOM_ID });
  }, 1000);
});

// 🔄 상태 변화 감지 (핵심)
client.on('change_phase', (data) => {
  console.log(`\n============== [PHASE: ${data.status}] ==============`);
  console.log(`⏱ 남은 시간: ${data.durationMs}초`);

  if (data.status === 'PLAYING') {
    const turnData = data.data; // 서버에서 보내준 TurnData
    console.log(`   👉 Turn: ${turnData.turn}`);
    console.log(`   👉 Writer A: ${turnData.writerA}`);
    console.log(`   👉 Image ID: ${turnData.imageId}`);

    // 내 차례면 자동으로 글 써보기 (매크로)
    if (turnData.writerA === WRITER_TOKEN) {
      console.log(`   🤖 내 차례다! 매크로 작동!`);
      setTimeout(() => {
        client.emit('submit_story', {
          roomId: ROOM_ID,
          team: 'A',
          userToken: WRITER_TOKEN,
          text: `매크로가 쓴 글 - 턴 ${turnData.turn}`,
        });
        console.log(`   📝 스토리 제출 완료`);
      }, 1000);
    }
  }
});

// 🏆 최종 결과 감지
client.on('vote_result', (outcome) => {
  console.log(`\n🏆 게임 종료! 투표 결과 도착`);
  console.log(outcome);
  process.exit();
});
