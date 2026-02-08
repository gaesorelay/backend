export type TeamSide = 'A' | 'B';
export interface AiJudgeScore {
    judgeName: string;
    commentA: string;
    commentB: string;
    scoreTeamA: number;
    scoreTeamB: number;
}
export interface VoteOutcome {
    roomUuid: string;
    votesTeamA: number;
    votesTeamB: number;
    winner: TeamSide | 'DRAW';
    aiJudges?: AiJudgeScore[];
}
