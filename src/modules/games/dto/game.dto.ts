import { IsString, IsNotEmpty } from 'class-validator';

// ⌨️ [수정] 실시간 타이핑 DTO
export class TypingStoryDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  text: string; // 입력 중인 텍스트

  @IsString()
  @IsNotEmpty()
  team: string; // ⭐️ [추가] 'A' 또는 'B'
}

// 2. 작성을 완료하고 제출할 때 보내는 데이터
export class SubmitStoryDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  text: string; // 최종 완성된 문장
}
