export interface GameState {
  roomUuid: string;
  currentRound: number;

  genre: string;
  aiJudgeIDs: number[];

  teamAOrder: string[];
  teamBOrder: string[];

  imageIDs: number[];

  teamAStory: string[];
  teamBStory: string[];

  turnEndAt: number;
}
