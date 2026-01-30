import { Injectable } from '@nestjs/common';
import { GamesRepository } from './games.repository';
import { GameState } from './types/game-state.type';
import { GAME_IMAGES } from './images.constant';
import { EvaluateSubmissionDto } from '../ai-judges/dto/judge.dto';
import { AiJudgeScore, TeamSide, VoteOutcome } from './types/vote-outcome.type';
import { Server } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import Filter from 'badwords-ko';

@Injectable()
export class GamesService {
  // 관객 투표는 DB가 아니라 서버 메모리에 저장한다.
  // 라운드 종료 시 resetVoteState로 정리한다.
  private server: Server;
  private readonly voteStore = new Map<
    string,
    { votesTeamA: number; votesTeamB: number; aiApplied: boolean }
  >();
  // AI 평가 입력 DTO도 서버 메모리에 저장한다.
  // 스토리 제출 이벤트에서 setEvaluateDto로 저장해둔다.
  private readonly evaluateStore = new Map<
    string,
    { teamA?: EvaluateSubmissionDto; teamB?: EvaluateSubmissionDto }
  >();
  private filter: Filter;

  private readonly dogSounds = [
    '개소리!',
    '멍멍!',
    '왈왈!',
    '으르르...',
    '컹컹!',
    '깨갱',
    '끼잉끼잉',
    '앙!',
    '캥...',
    '멍',
  ];

  constructor(private readonly gamesRepository: GamesRepository) {
    this.filter = new Filter();
  }

  // Gateway가 생성될 때 Server 인스턴스를 넣어줌 (브로드캐스트용)
  setServer(server: Server) {
    this.server = server;
  }

  /**
   * 게임 초기 상태 생성 (뼈대만 생성)
   * - 이미지와 심사위원은 빈 배열로 초기화
   * - 턴 종료 시간도 아직 시작 안 했으므로 0으로 설정
   */
  async initGame(roomUuid: string, teamAIds: string[], teamBIds: string[]) {
    const initialState: GameState = {
      roomUuid,
      genre: '',
      currentRound: 1,
      teamAOrder: teamAIds,
      teamBOrder: teamBIds,
      imageIDs: [],
      aiJudgeIDs: [],
      teamAStory: [],
      teamBStory: [],
      turnEndAt: 0,
    };

    await this.gamesRepository.createGame(initialState);
    return initialState;
  }

  async updateGameJudges(roomUuid: string, judgeIds: number[]) {
    await this.gamesRepository.updateJudges(roomUuid, judgeIds);
  }

  async getJudgeIds(roomUuid: string): Promise<number[]> {
    return this.gamesRepository.getGameJudgeIds(roomUuid);
  }

  /**
   * 🎲 [신규] 랜덤 이미지 8개 선정 및 저장
   */
  async selectAndSaveImages(roomUuid: string): Promise<number[]> {
    // 1. 전체 이미지 목록 복사 (원본 보호)
    const allImages = [...GAME_IMAGES];

    // 2. Fisher-Yates Shuffle (무작위 섞기)
    for (let i = allImages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allImages[i], allImages[j]] = [allImages[j], allImages[i]];
    }

    // 3. 앞에서 8개 자르기
    const selectedImages = allImages.slice(0, 8);

    // 4. ID만 추출
    const imageIds = selectedImages.map((img) => img.id);

    // 5. Repository 호출하여 저장
    await this.gamesRepository.updateGameImages(roomUuid, imageIds);

    console.log(`🖼️ [Game] 방 ${roomUuid} 이미지 8개 선정 완료: ${imageIds}`);
    return imageIds;
  }

  setEvaluateDto(roomUuid: string, team: TeamSide, dto: EvaluateSubmissionDto): void {
    // 팀별 평가 입력을 누적 저장한다.
    const state = this.evaluateStore.get(roomUuid) ?? {};
    if (team === 'A') {
      state.teamA = dto;
    } else {
      state.teamB = dto;
    }
    this.evaluateStore.set(roomUuid, state);
  }

  getEvaluateDto(roomUuid: string, team: TeamSide): EvaluateSubmissionDto | null {
    // 필요한 시점(RESULTING 시작)에 팀별 평가 입력을 조회한다.
    const state = this.evaluateStore.get(roomUuid);
    if (!state) return null;
    return team === 'A' ? (state.teamA ?? null) : (state.teamB ?? null);
  }

  submitAudienceVote(roomUuid: string, team: TeamSide): VoteOutcome {
    // 관객 투표는 팀별 카운트만 증가시킨다.
    const state = this.getOrCreateVoteState(roomUuid);

    if (team === 'A') {
      state.votesTeamA += 1;
    } else {
      state.votesTeamB += 1;
    }

    return this.toOutcome(roomUuid, state);
  }

  applyAiJudgeVotes(
    roomUuid: string,
    aiJudgeScores: AiJudgeScore[],
    aiVotingCount: number,
  ): VoteOutcome {
    // AI 평가 결과는 1회만 반영되도록 aiApplied로 제어한다.
    const state = this.getOrCreateVoteState(roomUuid);

    if (state.aiApplied) {
      return this.toOutcome(roomUuid, state);
    }

    for (const judge of aiJudgeScores) {
      if (judge.scoreTeamA > judge.scoreTeamB) {
        state.votesTeamA += aiVotingCount;
      } else if (judge.scoreTeamB > judge.scoreTeamA) {
        state.votesTeamB += aiVotingCount;
      }
      // On tie, no AI votes are added.
    }

    state.aiApplied = true;
    return this.toOutcome(roomUuid, state);
  }

  getVoteOutcome(roomUuid: string): VoteOutcome {
    const state = this.getOrCreateVoteState(roomUuid);
    return this.toOutcome(roomUuid, state);
  }

  resetVoteState(roomUuid: string): void {
    this.voteStore.delete(roomUuid);
  }

  private getOrCreateVoteState(roomUuid: string) {
    const existing = this.voteStore.get(roomUuid);
    if (existing) return existing;

    const initial = { votesTeamA: 0, votesTeamB: 0, aiApplied: false };
    this.voteStore.set(roomUuid, initial);
    return initial;
  }

  private toOutcome(
    roomUuid: string,
    state: { votesTeamA: number; votesTeamB: number },
  ): VoteOutcome {
    let winner: TeamSide | 'DRAW' = 'DRAW';
    if (state.votesTeamA > state.votesTeamB) winner = 'A';
    if (state.votesTeamB > state.votesTeamA) winner = 'B';

    return {
      roomUuid,
      votesTeamA: state.votesTeamA,
      votesTeamB: state.votesTeamB,
      winner,
    };
  }
  /**
   * 🔒 실시간 권한 검증 (DB 저장 X)
   * - 현재 GameState를 읽어서, 보낸 사람이 해당 팀의 현재 턴인지 확인만 함
   */
  async validateWriter(roomUuid: string, userToken: string, team: 'A' | 'B'): Promise<boolean> {
    const state = await this.gamesRepository.getGame(roomUuid);
    if (!state) {
      console.log('❌ [Validate] 방 데이터(State)가 Redis에 없습니다!');
      return false;
    }

    // 고정된 GameState 구조 사용
    const orderList = team === 'A' ? state.teamAOrder : state.teamBOrder;
    const storyList = team === 'A' ? state.teamAStory : state.teamBStory;

    // 🧮 턴 계산: (이미 완성된 스토리 개수) % (전체 인원수)
    const currentIndex = storyList.length % orderList.length;
    const expectedToken = orderList[currentIndex];

    // 👇 [디버깅 로그] 이것만 확인하면 됩니다!
    console.log(
      `🔍 [Validate] 요청자: ${userToken} / 실제턴: ${expectedToken} / 결과: ${expectedToken === userToken}`,
    );

    // 지금 들어온 토큰이 작성할 차례인 토큰과 일치하는지 확인
    return expectedToken === userToken;
  }

  /**
   * 🔄 [턴 시작] 이번 턴의 정보(이미지, 작성자) 조회
   * - GameFlowService가 턴 시작 시 호출함
   */
  async startTurn(roomUuid: string, turnIndex: number) {
    const state = await this.gamesRepository.getGame(roomUuid);
    if (!state) return null;

    // 0부터 시작하므로 turnIndex - 1 (1턴 -> index 0)
    const index = turnIndex - 1;

    // 이번 턴에 글을 써야 할 유저 토큰 계산
    // (A팀/B팀 각각 순서에 맞춰서)
    const writerA = state.teamAOrder[index % state.teamAOrder.length];
    const writerB = state.teamBOrder[index % state.teamBOrder.length];

    // 이번 턴 이미지 ID
    const imageId = state.imageIDs[index];

    await this.gamesRepository.saveGame(state);

    return {
      turn: turnIndex,
      imageId: imageId,
      writerA: writerA,
      writerB: writerB,
    };
  }

  /**
   * 📝 [제출] 유저가 작성을 완료해서 보냄
   */
  async submitStory(roomUuid: string, userToken: string, team: 'A' | 'B', text: string) {
    const state = await this.gamesRepository.getGame(roomUuid);
    if (!state) return;

    // 1. 권한 검증 (내 턴 맞나?)
    const storyList = team === 'A' ? state.teamAStory : state.teamBStory;
    const orderList = team === 'A' ? state.teamAOrder : state.teamBOrder;

    // 현재 라운드 인덱스 = 이미 저장된 스토리 개수
    // (예: 1라운드면 스토리 0개 -> index 0)
    const currentRoundIndex = storyList.length;

    // 이미 제출했는지 확인 (중복 제출 방지)
    // startTurn에서 계산된 이번 라운드 목표 개수와 비교해도 됨
    // 여기서는 단순하게 "내 순서가 맞으면 저장"

    const turnUser = orderList[currentRoundIndex % orderList.length];
    if (turnUser !== userToken) {
      throw new WsException('당신의 차례가 아닙니다.');
    }

    // 2. 스토리 저장 (Push)
    storyList.push(text);

    // 3. 변경사항 저장
    await this.gamesRepository.saveGame(state);

    // 💡 [중요] 만약 A, B 둘 다 제출했다면? -> 즉시 다음 턴으로 넘어가야 함!
    // 이 부분은 GameFlowService와 연동이 필요한데,
    // 일단 여기서는 저장만 하고 "둘 다 찼는지" 확인하는 로직은 별도로 체크하거나
    // GameFlowService가 주기적으로 확인하게 해야 합니다.
    // (가장 깔끔한 건 여기서 둘 다 찼으면 gameFlowService.triggerNextTurn()을 부르는 구조)
  }

  /**
   * 🛑 [턴 종료] 타이머에 의해 강제로 턴이 끝남
   * - 버퍼 저장이 아니라, "혹시 제출 안 한 팀이 있나?" 확인해서 땜빵 처리
   */
  async endTurn(roomUuid: string) {
    const state = await this.gamesRepository.getGame(roomUuid);
    if (!state) return;

    // A팀 확인: 이번 라운드에 제출했나?
    // startTurn에서 설정한 turnIndex(현재 라운드)와 스토리 개수를 비교
    // 하지만 여기선 간단하게 "A팀 스토리 개수 vs B팀 스토리 개수" 비교로 처리 가능
    // 혹은 "현재 진행중이어야 할 라운드 수"를 기준으로 판단.

    // 예: 현재 3라운드(turnIndex=3)가 끝나야 함.
    // 근데 storyA.length가 2개다? -> A팀 제출 안 함 -> 빈 문자열 강제 추가.

    // (편의상 A/B 길이를 맞추는 로직 사용)
    const maxLen = Math.max(state.teamAStory.length, state.teamBStory.length);

    // 사실 maxLen보다는 "현재 라운드 수"가 기준이 되어야 합니다.
    // 하지만 여기서는 간단히 "상대방보다 적으면 채워넣기" 로직 예시:
    if (state.teamAStory.length < maxLen) {
      state.teamAStory.push('(시간 초과)');
    }
    if (state.teamBStory.length < maxLen) {
      state.teamBStory.push('(시간 초과)');
    }

    // 만약 둘 다 안 냈을 수도 있으니,
    // 원래는 turnIndex를 인자로 받아서 story.length < turnIndex 면 push 하는 게 정확함.

    await this.gamesRepository.saveGame(state);
  }

  /**
   * 🐕 [핵심] 욕설을 개소리로 변환하는 함수
   */
  public convertToDogSound(text: string): string {
    if (!text) return '';

    // 임시 필터를 하나 만들어서 처리 (또는 생성자에서 설정)
    const tempFilter = new Filter({ placeHolder: '§' });
    const masked = tempFilter.clean(text);

    // 2. '§' 가 나올 때마다 랜덤 개소리로 교체합니다.
    return masked.replace(/§+/g, () => {
      return this.getRandomDogSound(); // "멍멍!"
    });
  }

  // 🎲 랜덤 개소리 뽑기
  private getRandomDogSound(): string {
    const index = Math.floor(Math.random() * this.dogSounds.length);
    return this.dogSounds[index];
  }
}
