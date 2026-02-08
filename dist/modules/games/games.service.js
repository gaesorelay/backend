"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamesService = void 0;
const common_1 = require("@nestjs/common");
const games_repository_1 = require("./games.repository");
const images_constant_1 = require("./images.constant");
const badwords_ko_1 = __importDefault(require("badwords-ko"));
const game_flow_constants_1 = require("../../common/constants/game-flow.constants");
let GamesService = class GamesService {
    gamesRepository;
    server;
    voteStore = new Map();
    filter;
    dogSounds = [
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
    constructor(gamesRepository) {
        this.gamesRepository = gamesRepository;
        this.filter = new badwords_ko_1.default();
    }
    setServer(server) {
        this.server = server;
    }
    async initGame(roomUuid, teamAIds, teamBIds) {
        const initialState = {
            roomUuid,
            genre: '',
            currentRound: 1,
            teamAOrder: teamAIds,
            teamBOrder: teamBIds,
            imageIDs: [],
            aiJudgeIDs: [],
            teamAStory: Array(game_flow_constants_1.TURN_COUNT).fill(''),
            teamBStory: Array(game_flow_constants_1.TURN_COUNT).fill(''),
            turnEndAt: 0,
        };
        await this.gamesRepository.createGame(initialState);
        return initialState;
    }
    async updateGameJudges(roomUuid, judgeIds) {
        await this.gamesRepository.updateJudges(roomUuid, judgeIds);
    }
    async getJudgeIds(roomUuid) {
        return this.gamesRepository.getGameJudgeIds(roomUuid);
    }
    async selectAndSaveImages(roomUuid) {
        const allImages = [...images_constant_1.GAME_IMAGES];
        for (let i = allImages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allImages[i], allImages[j]] = [allImages[j], allImages[i]];
        }
        const selectedImages = allImages.slice(0, game_flow_constants_1.TURN_COUNT);
        const imageIds = selectedImages.map((img) => img.id);
        await this.gamesRepository.updateGameImages(roomUuid, imageIds);
        console.log(`🖼️ [Game] 방 ${roomUuid} 이미지 ${game_flow_constants_1.TURN_COUNT}개 선정 완료: ${imageIds}`);
        return imageIds;
    }
    async getEvaluateDto(roomUuid, team) {
        const state = await this.gamesRepository.getGame(roomUuid);
        if (!state) {
            console.log(`[getEvaluateDto] Redis에 방 데이터가 없습니다: ${roomUuid}`);
            return null;
        }
        const storyList = team === 'A' ? state.teamAStory : state.teamBStory;
        const fullStory = storyList.join(' ');
        const images = state.imageIDs
            .map((id) => images_constant_1.GAME_IMAGES.find((img) => img.id === id))
            .filter((img) => !!img);
        return {
            sentence: fullStory,
            genre: state.genre,
            images: images,
        };
    }
    submitAudienceVote(roomUuid, team) {
        const state = this.getOrCreateVoteState(roomUuid);
        if (team === 'A') {
            state.votesTeamA += 1;
        }
        else {
            state.votesTeamB += 1;
        }
        return this.toOutcome(roomUuid, state);
    }
    applyAiJudgeVotes(roomUuid, aiJudgeScores) {
        const state = this.getOrCreateVoteState(roomUuid);
        return { ...this.toOutcome(roomUuid, state), aiJudges: aiJudgeScores };
    }
    getVoteOutcome(roomUuid) {
        const state = this.getOrCreateVoteState(roomUuid);
        return this.toOutcome(roomUuid, state);
    }
    resetVoteState(roomUuid) {
        this.voteStore.delete(roomUuid);
    }
    getOrCreateVoteState(roomUuid) {
        const existing = this.voteStore.get(roomUuid);
        if (existing)
            return existing;
        const initial = { votesTeamA: 0, votesTeamB: 0 };
        this.voteStore.set(roomUuid, initial);
        return initial;
    }
    toOutcome(roomUuid, state) {
        let winner = 'DRAW';
        if (state.votesTeamA > state.votesTeamB)
            winner = 'A';
        if (state.votesTeamB > state.votesTeamA)
            winner = 'B';
        return {
            roomUuid,
            votesTeamA: state.votesTeamA,
            votesTeamB: state.votesTeamB,
            winner,
        };
    }
    async validateWriter(roomUuid, userToken, team) {
        const state = await this.gamesRepository.getGame(roomUuid);
        if (!state) {
            console.log('❌ [Validate] 방 데이터(State)가 Redis에 없습니다!');
            return false;
        }
        const orderList = team === 'A' ? state.teamAOrder : state.teamBOrder;
        const storyList = team === 'A' ? state.teamAStory : state.teamBStory;
        const currentIndex = storyList.length % orderList.length;
        const expectedToken = orderList[currentIndex];
        console.log(`🔍 [Validate] 요청자: ${userToken} / 실제턴: ${expectedToken} / 결과: ${expectedToken === userToken}`);
        return expectedToken === userToken;
    }
    async startTurn(roomUuid, turnIndex) {
        const state = await this.gamesRepository.updateGame(roomUuid, (gameState) => {
            gameState.currentRound = turnIndex;
            return true;
        });
        if (!state)
            return null;
        const index = turnIndex - 1;
        const writerA = state.teamAOrder[index % state.teamAOrder.length];
        const writerB = state.teamBOrder[index % state.teamBOrder.length];
        const imageId = state.imageIDs[index];
        return {
            turn: turnIndex,
            imageId: imageId,
            writerA: writerA,
            writerB: writerB,
        };
    }
    async submitStory(roomUuid, userToken, team, text, turn) {
        const targetIndex = turn - 1;
        if (targetIndex < 0)
            return;
        await this.gamesRepository.updateGame(roomUuid, (state) => {
            const storyList = team === 'A' ? state.teamAStory : state.teamBStory;
            if (storyList[targetIndex]) {
                console.log(`[SubmitStory] Overwrite turn ${turn}: ${text}`);
            }
            else {
                console.log(`[SubmitStory] New submission turn ${turn}: ${text}`);
            }
            storyList[targetIndex] = text;
            return true;
        });
    }
    async rollbackStory(roomUuid, targetRoundIndex) {
        await this.gamesRepository.updateGame(roomUuid, (state) => {
            let changed = false;
            if (state.teamAStory.length > targetRoundIndex) {
                state.teamAStory.splice(targetRoundIndex);
                changed = true;
            }
            if (state.teamBStory.length > targetRoundIndex) {
                state.teamBStory.splice(targetRoundIndex);
                changed = true;
            }
            return changed;
        });
    }
    convertToDogSound(text) {
        if (!text)
            return '';
        const tempFilter = new badwords_ko_1.default({ placeHolder: '§' });
        tempFilter.addWords('야옹', '애옹', '고양이', '냥냥', '냐옹', '냥이');
        const masked = tempFilter.clean(text);
        return masked.replace(/§+/g, () => {
            return this.getRandomDogSound();
        });
    }
    getRandomDogSound() {
        const index = Math.floor(Math.random() * this.dogSounds.length);
        return this.dogSounds[index];
    }
};
exports.GamesService = GamesService;
exports.GamesService = GamesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [games_repository_1.GamesRepository])
], GamesService);
//# sourceMappingURL=games.service.js.map