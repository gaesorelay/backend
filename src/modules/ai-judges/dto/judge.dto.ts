import { IsString, IsNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ImageContextDto {
  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class EvaluateSubmissionDto {
  @IsString()
  @IsNotEmpty()
  genre: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageContextDto)
  images: ImageContextDto[];

  @IsString()
  @IsNotEmpty()
  sentence: string;
}

// 응답 결과 타입 (변경 없음)
export interface PersonaResult {
  personaName: string;
  score: number;
  comment: string;
}
