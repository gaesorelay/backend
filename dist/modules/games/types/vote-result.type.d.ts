export interface AiJudgeReview {
    name: string;
    score: number;
    comment: string;
}
export interface AiJudgesResult {
    judges: [AiJudgeReview, AiJudgeReview, AiJudgeReview];
    averageScore?: number;
}
export interface VoteResult {
    roomUuid: string;
    votesTeamA: number;
    votesTeamB: number;
    aiJudgesResult: AiJudgesResult;
}
