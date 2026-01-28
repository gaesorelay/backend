import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: '메시지는 100자를 넘을 수 없습니다.' })
  message: string;
}
