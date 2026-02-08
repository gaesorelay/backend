import Redis from 'ioredis';
import { GameState } from './types/game-state.type';
export declare class GamesRepository {
    private readonly client;
    constructor(client: Redis);
    createGame(state: GameState): Promise<void>;
    getGame(roomUuid: string): Promise<GameState | null>;
    updateGame(roomUuid: string, applyChange: (state: GameState) => boolean): Promise<GameState | null>;
    saveGame(state: GameState): Promise<void>;
    deleteGame(roomUuid: string): Promise<void>;
    updateJudges(roomUuid: string, judgeIds: number[]): Promise<void>;
    getGameJudgeIds(roomUuid: string): Promise<number[]>;
    updateGameImages(roomUuid: string, imageIds: number[]): Promise<void>;
    addStorySegment(roomUuid: string, text: string): Promise<void>;
    getFullStory(roomUuid: string): Promise<string[]>;
}
