# 포팅 매뉴얼 (Backend)

## 1. 프로젝트 개요
- **프로젝트명**: 개소릴레이 (Gaeso Relay) - Backend
- **서비스 설명**: 실시간 다중 사용자 스토리 릴레이 게임 서버

## 2. 개발 환경
| 항목 | 내용 | 비고 |
| --- | --- | --- |
| **OS** | Windows 10/11 | Local 개발 환경 |
| **Language** | TypeScript | Node.js v20 이상 권장 (v22.10.7 Tested) |
| **Framework** | NestJS v11.0.1 | Backend Framework |
| **Database** | Redis 7.x | In-memory 데이터 스토어 (게임 상태 저장) |
| **IDE** | Visual Studio Code | |

## 3. 빌드 및 실행 방법

### 3.1 사전 준비 사항
- **Node.js**: v20 이상 설치
- **Redis**: Local 또는 Remote 실행 중이어야 함 (Default Port: 6379)

### 3.2 프로젝트 빌드
터미널에서 프로젝트 루트 경로(`backend`)로 이동 후 아래 명령어 실행

```bash
# 1. 의존성 패키지 설치
npm install

# 2. 프로젝트 빌드 (dist 폴더 생성)
npm run build
```

### 3.3 프로젝트 실행

**개발 모드 (Hot-reload 지원)**
```bash
npm run start:dev
```

**배포 모드**
```bash
npm run start:prod
```

## 4. 환경 변수 설정 (.env)
프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 아래 내용을 설정해야 합니다.

| 변수명 | 설명 | 예시 값 |
| --- | --- | --- |
| `PORT` | 서버 실행 포트 | `8000` |
| `REDIS_HOST` | Redis 호스트 주소 | `localhost` 또는 `redis` (Docker 사용 시) |
| `REDIS_PORT` | Redis 포트 | `6379` |
| `GMS_API_KEY` | 외부 GMS 서비스 연동 키 | `S14P12A608-...` |

## 5. 외부 서비스 정보
1.  **Redis**
    -   용도: 실시간 게임 룸 상태, 플레이어 순서, 투표 집계 등 게임 데이터 저장
    -   접속 정보: 환경 변수 `REDIS_HOST`, `REDIS_PORT` 참조

2.  **GMS (Game Management Service)**
    -   용도: 게임 내 외부 API 연동
    -   설정: `GMS_API_KEY` 환경 변수 사용

## 6. DB 덤프 파일
본 프로젝트는 **Redis (Key-Value Store)**를 메인 데이터베이스로 사용하므로, 정형화된 스키마 덤프(SQL) 파일은 존재하지 않습니다.

- **초기 데이터 설정 (로컬 테스트용)**:
  `init-redis.js` 스크립트를 통해 테스트 룸 데이터를 Redis에 주입할 수 있습니다.
  ```bash
  node init-redis.js
  ```

## 7. 시연 시나리오
1.  **서버 구동**: `npm run start:prod` 실행
2.  **Redis 실행**: Redis 서버 정상 동작 확인
3.  **API 호출**: `/deploy/asyncapi/asyncapi.yaml` 또는 `/deploy/swagger/public/openapi.yaml` 참조
