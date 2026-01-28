import { IsString, IsNotEmpty, IsArray, ValidateNested, isNumber } from 'class-validator';
import { Type } from 'class-transformer';

// 1. 이미지 정보 객체 정의
export class ImageContextDto {
  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsString()
  @IsNotEmpty()
  description: string;
}

// 2. 심사 요청 데이터 (게임 로직용)
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

// 👇 [신규] 컨트롤러 요청용 DTO (EvaluateSubmissionDto + 심사위원 명단)
export class EvaluateRequestDto extends EvaluateSubmissionDto {
  @IsArray()
  @IsNotEmpty()
  judgeIds: number[];
}

// 응답 결과 타입 (변경 없음)
export interface PersonaResult {
  personaName: string;
  score: number;
  comment: string;
}
