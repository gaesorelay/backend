import { Injectable } from '@nestjs/common';
import { GamesRepository } from './games.repository';
import { GameState } from './types/game-state.type';
import { GAME_IMAGES } from './images.constant';
import { EvaluateSubmissionDto } from '../ai-judges/dto/judge.dto';
import { AiJudgeScore, TeamSide, VoteOutcome } from './types/vote-outcome.type';

@Injectable()
export class GamesService {
  // 관객 투표는 DB가 아니라 서버 메모리에 저장한다.
  // 라운드 종료 시 resetVoteState로 정리한다.
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

  constructor(private readonly gamesRepository: GamesRepository) {}

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
    // 필요한 시점(VOTING 시작)에 팀별 평가 입력을 조회한다.
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
}
