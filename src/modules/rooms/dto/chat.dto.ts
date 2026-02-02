import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300, { message: '메시지는 300자를 넘을 수 없습니다.' })
  message: string;
}
