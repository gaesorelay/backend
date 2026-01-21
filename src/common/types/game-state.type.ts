export interface GameState {
  roomUuid: string;
  currentRound: number;
  teamAOrder: string[];
  teamBOrder: string[];
  teamAImages: string[]; //이미지는 url로 저장
  teamBImages: string[]; //이미지는 url로 저장
  teamAStory: string[];
  teamBStory: string[];
  turnEndAt: number;
}
