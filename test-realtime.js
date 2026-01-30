// test-realtime.js
const io = require('socket.io-client');

const URL = 'http://localhost:8000/game'; // 네임스페이스 /game 확인
const ROOM_ID = 'TEST_ROOM';
const WRITER_TOKEN = 'TOKEN_A_1'; // init-redis.js에서 설정한 토큰

// ==========================================
// 👁️ [User B] 관전자 (아무것도 안 하고 구경만 함)
// ==========================================
const userB = io(URL);

userB.on('connect', () => {
  console.log(`👁️ [User B] 접속 성공 (ID: ${userB.id})`);
  userB.emit('join_game_room', { roomId: ROOM_ID }); // 방 입장 필수
});

// 🔥 핵심: User A가 친 글자가 여기 떠야 성공!
userB.on('story_update', (data) => {
  console.log(`\n✨ [User B 화면] 실시간 업데이트 수신!`);
  console.log(`   └─ 팀: ${data.team}`);
  console.log(`   └─ 작성자: ${data.writerToken}`);
  console.log(`   └─ 내용: "${data.text}"`);
});

// ==========================================
// ✍️ [User A] 작성자 (자기 차례인 유저)
// ==========================================
const userA = io(URL);

userA.on('connect', () => {
  console.log(`✍️ [User A] 접속 성공 (ID: ${userA.id})`);
  userA.emit('join_game_room', { roomId: ROOM_ID });

  // 1초 뒤부터 타이핑 시뮬레이션 시작
  setTimeout(() => startTyping(), 1000);
});

// 타자 치는 척 하는 함수
function startTyping() {
  const messages = ['안', '안녕', '안녕하', '안녕하세요', '안녕하세요!'];
  let index = 0;

  console.log(`\n🚀 [User A] 타이핑 시작...`);

  const interval = setInterval(() => {
    if (index >= messages.length) {
      clearInterval(interval);
      console.log(`✅ [User A] 입력 끝. (User B 화면을 확인하세요)`);
      return;
    }

    const text = messages[index];
    const cleanMessage = this.gamesService.convertToDogSound(text);

    // 서버로 전송 (DB 저장 X, 중계 O)
    userA.emit('story_typing', {
      roomId: ROOM_ID,
      text: cleanMessage,
      team: 'A',
      userToken: WRITER_TOKEN, // 권한 있는 토큰
    });

    console.log(`   📤 [User A] 전송: "${text}"`);
    index++;
  }, 500); // 0.5초마다 한 글자씩 침
}
