import { randomBytes, randomUUID } from 'crypto';

// 방 ID 랜덤 생성 로직
export const generateRoomId = (length = 6): string => {
  const bytes = randomBytes(length);
  let result = '';

  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(65 + (bytes[index] % 26));
  }

  return result;
};

export const generateOwnerToken = (): string => randomUUID();
