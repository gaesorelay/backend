export interface ImageConfig {
  id: number;
  description: string;
}

// 🖼️ 게임에 사용될 이미지 데이터 (예시 15개)
export const GAME_IMAGES: ImageConfig[] = [
  { id: 1, description: '화려한 샹들리에 아래서 와인잔을 깨트리는 귀부인' },
  { id: 2, description: '비 오는 날 공중전화 부스에서 오열하는 여자' },
  { id: 3, description: '트럭과 충돌하기 직전의 빨간색 스포츠카' },
  { id: 4, description: '유전자 검사 결과지를 구겨 쥐고 있는 손' },
  { id: 5, description: '김치로 상대방의 뺨을 때리는 중년 여성' },
  { id: 6, description: '병원 침대에서 머리에 붕대를 감고 깨어난 남자' },
  { id: 7, description: '결혼식장에 난입하여 소리치는 전 애인' },
  { id: 8, description: '거울을 보며 눈 밑에 점을 찍고 있는 여자' },
  { id: 9, description: '한강 다리 위에서 고뇌하며 서 있는 양복 입은 남자' },
  { id: 10, description: '시골집 장독대 뒤에 숨겨진 금괴 가방' },
  { id: 11, description: '변호사 사무실에서 이혼 서류에 도장을 찍는 부부' },
  { id: 12, description: '출생의 비밀을 듣고 충격받아 뒷목 잡고 쓰러지는 회장님' },
  { id: 13, description: '포장마차에서 소주를 마시며 신세 한탄하는 주인공' },
  { id: 14, description: '공항 게이트 앞에서 떠나는 연인을 붙잡는 장면' },
  { id: 15, description: '비서가 건넨 서류봉투를 보고 사악하게 웃는 실장님' },
];
