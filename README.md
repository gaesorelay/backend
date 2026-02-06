# 🐶 개소릴레이 (Gaeso Relay) - Backend

> **"상상력의 한계를 넘는 릴레이 소설 창작 게임"**  
> 개소릴레이는 여러 플레이어가 실시간으로 턴을 이어가며 하나의 엉뚱하고 재미있는 이야기를 완성하는 **웹 기반 멀티플레이어 게임**입니다.

---

## 📖 프로젝트 소개

**개소릴레이**는 "개소리"와 "릴레이"의 합성어로, 친구들과 함께 예측 불가능한 스토리 흐름을 즐길 수 있는 서비스입니다. 
플레이어들은 제한된 시간 내에 자신의 문장을 이어 써야 하며, AI 심사위원이 문맥과 재미를 평가하거나 투표를 통해 승자를 결정합니다.

### 🎯 기획 의도
- 아이스브레이킹을 위한 게임
- 텍스트 기반의 창의적이고 유쾌한 소통 경험 제공
- 실시간 상호작용을 통한 몰입감 있는 게임 플레이
- 생성형 AI를 활용한 보조 및 심사 기능 도입

---

## ✨ 주요 기능

### 1. 🕒 실시간 턴제 릴레이
- Socket.IO를 활용한 저지연 실시간 통신
- 정해진 순서와 시간(타이머)에 맞춰 스토리 입력
- 턴이 돌아오면 즉시 알림 및 입력창 활성화

### 2. 🤖 AI 심사위원 (AI Judge)
- LLM(Large Language Model) 기반의 AI가 플레이어들의 문장을 분석
- 문맥적 개연성, 창의성, 재미 요소를 평가하여 점수 부여
- 게임의 공정성과 의외성을 더해주는 핵심 요소

### 3. 🗳️ 투표 및 결과 시스템
- 게임 종료 후 플레이어 간 상호 투표 진행
- AI 점수와 유저 투표를 합산하여 최종 결과 선정

### 4. 🃏 카드(키워드) 시스템
- 매 턴마다 무작위 키워드 카드 제공
- 창작의 어려움을 해소하고 이야기에 반전을 주는 장치

---

## 🛠️ 기술 스택 (Tech Stack)

| 분류 | 기술 | 비고 |
| --- | --- | --- |
| **Language** | ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) | |
| **Framework** | ![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white) | Backend Core |
| **Database** | ![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white) | In-memory Game State / Session |
| **Communication** | ![Socket.IO](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socketdotio&logoColor=white) | Real-time WebSocket |
| **External API** | **OpenAI / GMS** | AI Story Evaluation |

---

## 📂 프로젝트 구조

```bash
backend
├── 📂 exec                 # 포팅 매뉴얼 및 산출물 폴더
├── 📂 src
│   ├── 📂 common           # 공통 모듈 (Filters, Guards, Pipes 등)
│   ├── 📂 config           # 환경 변수 및 설정 파일
│   ├── 📂 modules          # 도메인별 모듈
│   │   ├── 📂 auth         # 인증/인가
│   │   ├── 📂 games        # 게임 로직 (Core)
│   │   ├── 📂 rooms        # 대기방 관리
│   │   ├── 📂 users        # 사용자 관리
│   │   └── ...
│   ├── 📂 lib              # 외부 라이브러리 연동
│   └── 📄 main.ts          # 진입점 (Entry Point)
├── 📄 .env.example         # 환경 변수 예시
└── 📄 package.json
```

---

## 🚀 시작 가이드 (Getting Started)

### 1. 사전 요구 사항
- **Node.js**: v20 이상
- **Redis**: 6379 포트 실행 중

### 2. 설치 및 실행

**의존성 설치**
```bash
npm install
```

**개발 모드 실행**
```bash
npm run start:dev
```

**프로덕션 빌드 및 실행**
```bash
npm run build
npm run start:prod
```

### 3. 환경 변수 설정
최상위 경로에 `.env` 파일을 생성하고 다음 변수를 설정하세요.
```env
PORT=8000
REDIS_HOST=localhost
REDIS_PORT=6379
GMS_API_KEY=your_api_key_here
```
