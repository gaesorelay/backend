export interface GameState {
  roomUuid: string;
  currentRound: number;
  teamAOrder: string[];
  teamBOrder: string[];
  imageIDs: number[];
  aiJudgeIDs: number[];
  teamAStory: string[];
  teamBStory: string[];
  turnEndAt: number;
}
