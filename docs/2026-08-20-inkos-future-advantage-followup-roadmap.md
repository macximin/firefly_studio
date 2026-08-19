# InkOS 미래 선점 후속 작업 로드맵

- 작성일: 2026-08-20
- 대상 하위 레포: `edge_repos/inkos`
- 현재 기준: P0·P1 구현 완료, P2 이후 미착수
- 현재 작품 적용: 금지. 별도 카나리와 사람 승인 전에는 《IMF를 독식한 재벌 3세》를 자동 마이그레이션하지 않는다.

## 2026-08-20 저장 완료 영수증

- 하위 InkOS Core: `1f4b4c38 feat(core): add native Korean authoring and future advantage contracts`
- 하위 InkOS Studio: `47434a70 feat(studio): add project pitch and Arc map views`
- 하위 원격: `macximin/inkos`의 `master`
- 전체 테스트: Core 2001 + Studio 639 + CLI 243 = 2883 PASS
- 전체 타입 검사: PASS
- 전체 프로덕션 빌드: PASS
- `git diff --check`: PASS
- 원고·Tavily 키·자격 증명: 변경 없음
- P2 이후: 미착수

## 현재 완료 범위

### P0. 계약과 회귀 테스트

- `book_rules.md`의 선택형 `미래 선점` 계약
- 분야 공통 `futureAdvantageMove`
- ready Arc의 구현 다리·증거·보상 검사
- 회차 intent의 move·claim·허용 분기 연결 필드

### P1. 검색 경계 복구

- `eraResearch=true`와 회차 실시간 검색 분리
- 명시적 `research_web`만 프로젝트 검색 설정 사용
- 한국어 프로젝트의 한국어 질의·보고서
- 실제 역사 기준선과 허용된 가상 분기의 권위 분리

## 후속 작업 순서

### 1. 현재 변경 감리·검증·저장

상태: 2026-08-20 완료.

- 상위/하위 Git 상태와 원격 최신성 확인
- 누적 변경을 한국어 창작 품질, Studio 기획서·아크 화면, P0·P1로 분류
- 기존 원고·검색 키·자격 증명 미변경 확인
- Core 전체 테스트, 타입 검사, Studio 관련 검증
- 검증된 경로만 명시적으로 스테이징해 하위 InkOS 커밋·푸시
- 하위 결과를 이 상위 레포 문서와 함께 커밋·푸시
- 최종 `HEAD == origin` 및 남은 dirty 상태 확인

### 2. P2-A — Architect 미래 선점 계약 생성

- 회귀·빙의·예지·미래 기억이 핵심 재미인지 판별
- 해당 작품만 `book_rules.md#미래 선점` 생성
- 기술·금융·경영·유통·문화·인재·정책을 동일 계약으로 표현
- `알고 있는 것 / 모르는 것 / 금지된 지름길 / 기억 원칙` 생성
- 일반 작품의 기존 결과를 바꾸지 않는 회귀 테스트
- 한국어 네이티브 기획 언어 감리

### 3. P2-B — Arc 생성·편집 연결

- Architect 계약을 Arc 생성기가 읽게 함
- `mode / target / rememberedOutcome / bridgeSteps / resistance / proof / reward` 생성
- A 레일에 선점 실행·보상, B 레일에 저항·후폭풍·역사 변화·기억 열화 배치
- ready 전환에서 구현 다리·증거·보상 누락 차단
- Core 계약을 먼저 완성하고 Studio 편집은 최소 표시만 추가

### 4. P3 — Context·Planner·Writer 전달

- 회차별 관련 move만 context package에 선택
- `futureAdvantageMoveIds`, `researchClaimIds`, `authorizedDivergences`를 intent와 trace에 기록
- Writer가 미래 결과와 현재 구현 방법을 구분
- 실제 역사 연구 근거가 작가 의도나 허용 분기보다 높은 규칙이 되지 않게 고정

### 5. P4 — 창작 감리·고증 상태·수정 분리

- 창작 통과와 고증 상태를 별도 결과로 반환
- 허용된 조기 도입을 시대 오류로 처리하지 않음
- 검색 미확인만으로 자동 수정하지 않음
- 금지된 지름길·정보 경계 위반·분기 정본 모순만 critical 후보로 제한
- Reviser가 미래 선점 자체를 지우지 못하도록 회귀 테스트

### 6. P5 — 미래 선점 장부 정본화

- 본문에서 실제 실행된 move만 정본화
- 세계 변화와 미래 기억 신뢰도 기록
- snapshot·rollback·회차 삭제와 함께 복원
- 실제 역사 receipt와 작품 정본을 별도 보관
- 가장 비싸고 위험한 단계이므로 독립 세션에서 수행

### 7. P6 — Studio 최소 표시

- 기획서: 미래 선점 계약
- 아크지도: 선점·보상과 후폭풍·기억 열화
- 회차 감리: 창작 통과와 고증 상태 분리
- 별도 관리 페이지나 대시보드는 만들지 않음

### 8. P7 — 독립 카나리와 사람 승인

- 기술·금융·경영·유통·문화·인재·정책·복합 8종 카나리
- `실제 역사보다 빠르다`만으로 탈락하는 사례 0개 확인
- 무손실 예언·구현 생략·정보 경계 위반은 경고 또는 차단되는지 확인
- snapshot·rollback·delete 정합성 확인
- 마지막에만 현재 작품 적용 여부를 사람이 승인

## 진행 원칙

- 현재 작품 원고를 구현 실험 대상으로 사용하지 않는다.
- Tavily 키는 claim 근거 전달 경로가 생긴 뒤 연결한다.
- P2는 Core의 Foundation 생성과 Arc 계약부터 시작하고 Studio UI는 뒤에 둔다.
- 각 단계는 기존 한국어·중국어·영어 작품의 하위 호환성 테스트를 포함한다.
- 상위 레포는 경계·라우팅·인계만 소유하고, InkOS 구현은 하위 독립 Git 레포에 둔다.
