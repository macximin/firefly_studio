# InkOS 미래 선점 후속 작업 로드맵

- 작성일: 2026-08-20
- 대상 하위 레포: `edge_repos/inkos`
- 현재 기준: P0·P1 저장 완료, P2-A·P2-B·P3·P4·P5 구현 및 검증 완료
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
- P2-A·P2-B: 2026-08-20 구현 완료. 현재 작품 자동 적용 없음

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

상태: 2026-08-20 완료.

- 호스트가 제목·장르·사용자 브리프에서 명시된 회귀·빙의·예지·미래 기억·미래 당겨오기를 판별
- 해당 작품만 `book_rules.md#미래 선점`을 요구하고 일반 작품에서는 섹션 생성을 금지
- 기존 계약을 수정할 때는 `preserve` 모드로 정보 경계와 핵심 약속 유지
- 기준 시점·핵심 재미·허용 분야·known/unknown·금지 지름길·기억 원칙 완전성 검사와 1회 형식 복구
- 기술·금융·경영·유통·문화·인재·정책을 분야 중립 계약으로 표현
- 한국어·영어·중국어 생성 경로와 일반 작품 하위 호환 유지

### 3. P2-B — Arc 생성·편집 연결

상태: 2026-08-20 완료.

- Forecast 정사 컨텍스트와 fingerprint에 `book_rules.md` 포함
- 미래 선점 계약이 있는 작품의 모든 후보 분기에 구조화된 `futureAdvantageMove` 요구
- `mode / target / rememberedOutcome / bridgeSteps / resistance / proof / reward / downstreamConsequences` 생성 검증
- A 레일은 구현 다리·가시적 증거·독자 보상, B 레일은 저항·후폭풍·역사 변화·기억 열화로 분리
- 일반 작품이 move를 발명하거나 미래 선점 작품이 move를 누락하면 1회 재생성 후 차단
- 선택한 Forecast 분기의 move만 비정사 Arc 초안과 회차 provenance에 복사
- 기존 ready 전환의 구현 다리·증거·보상 gate 유지
- Studio Arc 지도 상세 패널에 A/B 레일 최소 읽기 전용 표시 추가

### 2026-08-20 P2 검증 영수증

- 전체 테스트: Core 2007 + Studio 639 + CLI 243 = 2889 PASS
- Core·Studio·CLI 타입 검사: PASS
- Core·Studio·CLI 프로덕션 빌드: PASS
- 패키지 manifest 검증: PASS
- 변경문법 검사: PASS
- semantic pattern audit: 신규 후보 없음(기존 후보 26개만 보고)
- 원고·작품 데이터·Tavily 키·자격 증명: 변경 없음
- 《IMF를 독식한 재벌 3세》: 자동 생성·마이그레이션·원고 변경 없음

### 4. P3 — Context·Planner·Writer 전달

상태: 2026-08-20 완료.

- 회차별 관련 move만 context package에 선택
- `futureAdvantageMoveIds`, `researchClaimIds`, `authorizedDivergences`를 intent와 trace에 기록
- Writer가 미래 결과와 현재 구현 방법을 구분
- 실제 역사 연구 근거가 작가 의도나 허용 분기보다 높은 규칙이 되지 않게 고정

### 2026-08-20 P3 검증 영수증

- 활성 Arc가 소유한 현재 회차의 move 하나만 보호 context로 선택
- move·claim·허용 분기 라우팅을 intent, 저장 plan, trace에 동일하게 기록
- 실제 역사 리서치를 작가 의도보다 낮은 `L5 research_evidence`로 고정
- Writer에 미래 결과와 현재 구현법의 구분, 구현 다리·저항·증거·보상 원칙 전달
- 일반 작품에서는 새 라우팅 필드와 L5가 생성되지 않음
- 전체 테스트: Core 2009 + Studio 639 + CLI 243 = 2891 PASS
- Core·Studio·CLI 타입 검사: PASS
- Core·Studio·CLI 프로덕션 빌드: PASS
- 패키지 manifest 검증 및 변경문법 검사: PASS
- semantic pattern audit: 신규 후보 없음(기존 후보 26개만 보고)
- 원고·작품 데이터·Tavily 키·자격 증명: 변경 없음
- 《IMF를 독식한 재벌 3세》: 자동 생성·마이그레이션·원고 변경 없음

### 5. P4 — 창작 감리·고증 상태·수정 분리

상태: 2026-08-20 완료.

- 창작 통과와 고증 상태를 별도 결과로 반환
- 허용된 조기 도입을 시대 오류로 처리하지 않음
- 검색 미확인만으로 자동 수정하지 않음
- 금지된 지름길·정보 경계 위반·분기 정본 모순만 critical 후보로 제한
- Reviser가 미래 선점 자체를 지우지 못하도록 회귀 테스트

### 2026-08-20 P4 검증 영수증

- Auditor 결과를 `creativePassed`와 `researchStatus`로 분리하고 issue마다 `creative|research` track을 기록
- 모델이 고증 문제를 creative로 잘못 표시해도 호스트가 research/info로 재분류
- 허용된 조기 도입과 근거 미확인은 원고 자동 수정 사유에서 제외
- 금지된 지름길·정보 경계 위반·정본 모순은 기존 창작 critical 경로 유지
- Reviser 직접 호출에서도 research-only 문제는 모델 호출 없이 무수정 종료
- 구현된 미래 선점 anchor를 전부 지우는 Reviser 결과는 원문 보존으로 거부
- 한국어 Auditor 본체와 제어 입력을 영어 번역 경유가 아닌 한국어 네이티브 프롬프트로 교체
- 전체 테스트: Core 2012 + Studio 639 + CLI 243 = 2894 PASS
- Core·Studio·CLI 타입 검사: PASS
- Core·Studio·CLI 프로덕션 빌드: PASS
- 패키지 manifest 검증 및 변경문법 검사: PASS
- semantic pattern audit: 신규 후보 없음(기존 후보 26개만 보고)
- 원고·작품 데이터·Tavily 키·자격 증명: 변경 없음
- 《IMF를 독식한 재벌 3세》: 자동 생성·마이그레이션·원고 변경 없음

### 6. P5 — 미래 선점 장부 정본화

상태: 2026-08-20 완료.

- 본문에서 실제 실행된 move만 정본화
- 세계 변화와 미래 기억 신뢰도 기록
- snapshot·rollback·회차 삭제와 함께 복원
- 실제 역사 receipt와 작품 정본을 별도 보관

### 2026-08-20 P5 검증 영수증

- Auditor가 본문에서 그대로 인용한 구현 다리·증거·보상을 모두 확인한 move만 비정본 실행 후보로 기록
- 회차 승인 시점에만 `story/future_advantage_ledger.json` 정본 장부로 승격
- 실제 역사·검색 고증 상태는 `story/research/future_advantage_receipts.json`에 분리 보관
- 승인 전 본문이 바뀌어 감리 후보 해시와 불일치하면 정본 승격을 차단하고 승인 상태를 원복
- snapshot에 장부와 고증 receipt를 함께 복제하며 restore·rollback·delete가 동일 시점으로 복원
- 수동 회차 편집은 기존 실행 후보를 제거해 재감리 없이 정본화되지 않도록 고정
- 일반 작품은 장부·receipt 파일을 만들지 않는 하위 호환 유지
- 전체 테스트: Core 2014 + Studio 639 + CLI 243 = 2896 PASS
- Core·Studio·CLI 타입 검사: PASS
- Core·Studio·CLI 프로덕션 빌드: PASS
- 패키지 manifest 검증 및 변경문법 검사: PASS
- semantic pattern audit: 신규 후보 없음(기존 후보 26개만 보고)
- 원고·작품 데이터·Tavily 키·자격 증명: 변경 없음
- 《IMF를 독식한 재벌 3세》: 자동 생성·마이그레이션·원고 변경 없음

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
