export declare class ImageContextDto {
    tags: string[];
    description: string;
}
export declare class EvaluateSubmissionDto {
    genre: string;
    images: ImageContextDto[];
    sentence: string;
}
export declare class EvaluateRequestDto extends EvaluateSubmissionDto {
    judgeIds: number[];
}
export interface PersonaResult {
    personaName: string;
    score: number;
    comment: string;
}
