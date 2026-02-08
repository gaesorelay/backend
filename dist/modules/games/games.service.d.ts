import { GamesRepository } from './games.repository';
import { GameState } from './types/game-state.type';
import { EvaluateSubmissionDto } from '../ai-judges/dto/judge.dto';
import { AiJudgeScore, TeamSide, VoteOutcome } from './types/vote-outcome.type';
import { Server } from 'socket.io';
export declare class GamesService {
    private readonly gamesRepository;
    private server;
    private readonly voteStore;
    private filter;
    private readonly dogSounds;
    constructor(gamesRepository: GamesRepository);
    setServer(server: Server): void;
    initGame(roomUuid: string, teamAIds: string[], teamBIds: string[]): Promise<GameState>;
    updateGameJudges(roomUuid: string, judgeIds: number[]): Promise<void>;
    getJudgeIds(roomUuid: string): Promise<number[]>;
    selectAndSaveImages(roomUuid: string): Promise<number[]>;
    getEvaluateDto(roomUuid: string, team: TeamSide): Promise<EvaluateSubmissionDto | null>;
    submitAudienceVote(roomUuid: string, team: TeamSide): VoteOutcome;
    applyAiJudgeVotes(roomUuid: string, aiJudgeScores: AiJudgeScore[]): VoteOutcome;
    getVoteOutcome(roomUuid: string): VoteOutcome;
    resetVoteState(roomUuid: string): void;
    private getOrCreateVoteState;
    private toOutcome;
    validateWriter(roomUuid: string, userToken: string, team: 'A' | 'B'): Promise<boolean>;
    startTurn(roomUuid: string, turnIndex: number): Promise<{
        turn: number;
        imageId: number;
        writerA: string;
        writerB: string;
    } | null>;
    submitStory(roomUuid: string, userToken: string, team: 'A' | 'B', text: string, turn: number): Promise<void>;
    rollbackStory(roomUuid: string, targetRoundIndex: number): Promise<void>;
    convertToDogSound(text: string): string;
    private getRandomDogSound;
}
