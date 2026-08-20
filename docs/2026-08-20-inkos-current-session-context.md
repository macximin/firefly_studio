# InkOS 현재 세션 컨텍스트

- 기록일: 2026-08-20
- 목적: 다음 세션이 이 문서 하나로 현재 구현·작품·Git 경계를 복구하도록 한다.
- 현재 결론: 미래 선점 시스템 P0~P7은 완료됐다. 《IMF를 독식한 재벌 3세》에는 아직 적용하지 않았다.

## 1. 먼저 읽을 문서

1. 이 문서
2. 구현 상세: `edge_repos/inkos/docs/2026-08-18-future-advantage-divergence-research-audit-implementation-plan.md`
3. 단계별 검증 영수증: `docs/2026-08-20-inkos-future-advantage-followup-roadmap.md`

## 2. 저장소 경계

`config/edge-repos.json`이 하위 저장소 범위의 정본이다.

| 구분 | 경로 | 브랜치 | 원격 | 역할 |
| --- | --- | --- | --- | --- |
| 부모 | `/Users/a2501/Desktop/firefly_studio` | `main` | `macximin/firefly_studio` | 경계·라우팅·인계 |
| 자식 | `/Users/a2501/Desktop/firefly_studio/edge_repos/inkos` | `master` | `macximin/inkos` | 기획·Arc·집필·감리·정본 실행 |

- 자식 InkOS는 독립 Git 루트다. 부모와 따로 상태를 확인하고 커밋·푸시한다.
- 부모 구현 완료 기준은 `dc9a12c docs: record InkOS P7 canary completion`이다.
- 자식 구현 완료 기준은 `3d78b532 feat(core): validate future advantage canaries`다.
- 자식 구현 인계 문서는 `c669d5f2 docs: hand off future advantage implementation`에 저장됐다.
- `/Users/a2501/Desktop/inkos`는 Git 저장소가 아니다. 현재는 같은 작품 slug의 빈 디렉터리 골격만 있으므로 실제 작품 경로로 사용하지 않는다.

## 3. 시스템 완료 상태

### P0·P1

- `book_rules.md` 선택형 미래 선점 계약
- Arc의 분야 공통 `futureAdvantageMove`
- ready Arc의 구현 다리·증거·보상 검사
- `eraResearch=true`와 실시간 검색 분리
- 명시적 `research_web`만 프로젝트 검색 설정과 프로젝트 언어 사용
- 실제 역사 기준선이 작가 의도·허용 분기를 덮어쓰지 못하도록 고정

### P2·P3

- Architect가 회귀·예지·미래 기억 중심 작품에만 미래 선점 계약 생성
- Forecast/Arc가 A 레일의 실행·증거·보상과 B 레일의 저항·후폭풍·기억 위험 생성
- 현재 회차에 필요한 move만 Planner·Composer·Writer로 전달
- move·claim·허용 분기 ID를 intent·plan·trace에 기록

### P4·P5

- 창작 통과와 고증 상태를 별도 결과로 반환
- 허용된 조기 도입과 검색 미확인을 자동 수정 사유에서 제외
- 금지 지름길·정보 경계 위반·정본 모순만 창작 critical 경로 유지
- 승인된 회차에서 본문으로 확인된 move만 `story/future_advantage_ledger.json`에 정본화
- 고증 상태는 `story/research/future_advantage_receipts.json`에 분리
- snapshot·restore·rollback·delete에 장부와 receipt 동시 복원

### P6·P7

- 기존 기획서 화면에 미래 선점 계약 표시
- 기존 Arc 지도에 A/B 레일과 기억 열화 위험 표시
- 기존 작품 상세에서 창작 통과와 고증 상태 분리 표시
- 기술·금융·경영·유통·문화·인재·정책·복합 8종 카나리 통과
- `실제 역사보다 빠르다`만으로 창작 탈락한 사례 0개
- 무손실 예언은 `memoryRisk`, 구현 생략은 `bridgeSteps` 누락 gate로 보완 요구
- 정보 경계 위반은 계속 창작 critical로 차단

## 4. 최종 검증 영수증

- Core: 2026 PASS
- Studio: 642 PASS
- CLI: 243 PASS
- 합계: 2911 PASS
- Core·Studio·CLI 타입 검사: PASS
- Core·Studio·CLI 프로덕션 빌드: PASS
- 패키지 manifest 검사: PASS
- `git diff --check`: PASS
- semantic pattern audit: 신규 후보 없음. 기존 후보 26개만 보고
- 현재 작품 원고·작품 데이터·Tavily 키·자격 증명: 구현 과정에서 자동 변경하지 않음

## 5. 현재 작품 상태

실제 작품 경로:

`/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/books/imf를-독식한-재벌-3세`

`books/`는 Git 제외 작업 데이터다.

- 제목: 《IMF를 독식한 재벌 3세》
- 상태: `active`
- 언어·장르: `ko` / 현대판타지 재벌물
- 기획서: 존재. 외부 레퍼런스 연결 기록 없음
- 현재 회차: 1화 `미처리함`
- 회차 상태: `ready-for-review`
- 글자 수: 4295 (`ko_chars`)
- 현재 감리: 1996년 시대 배경 일부가 고증 확인 필요. 검색 도구 없이 교차 확인하지 않은 info 상태
- `book_rules.md#미래 선점`: 없음
- `story/future_advantage_ledger.json`: 없음
- `story/research/future_advantage_receipts.json`: 없음
- 결론: 시스템은 준비됐지만 이 작품에는 계약·Arc·장부를 자동 이식하지 않았다.

## 6. 다음 재개점

시스템 구현을 더 밀 필요는 없다. 다음 결정은 하나다.

**《IMF를 독식한 재벌 3세》에 미래 선점 계약을 적용할지 사람이 승인한다.**

승인 전에는 아래를 하지 않는다.

- 현재 `book_rules.md`, 기획서, Arc, 원고 자동 수정
- 미래 선점 장부나 고증 receipt 선생성
- Tavily 키 또는 자격 증명 확인·설치·변경
- 실제 역사 검색 결과로 작품의 허용 분기 삭제

적용이 승인되면 다음 순서로만 진행한다.

1. 현재 작품 파일과 회차 상태를 복구 가능한 snapshot으로 보존한다.
2. `book_rules.md`에 미래 선점 계약만 먼저 추가한다.
3. Forecast/Arc 후보에서 A 레일·B 레일·`memoryRisk`를 사람이 검토한다.
4. 승인된 Arc만 회차 집필 컨텍스트로 전달한다.
5. 본문 실행과 회차 승인이 확인된 move만 장부 정본으로 올린다.
6. 실제 역사 조사가 필요할 때만 별도 승인으로 `research_web`을 사용한다.

## 7. 재개 직후 확인 명령

```bash
git -C /Users/a2501/Desktop/firefly_studio status --short --branch
git -C /Users/a2501/Desktop/firefly_studio/edge_repos/inkos status --short --branch
git -C /Users/a2501/Desktop/firefly_studio rev-list --left-right --count HEAD...origin/main
git -C /Users/a2501/Desktop/firefly_studio/edge_repos/inkos rev-list --left-right --count HEAD...origin/master
```

작품 적용 승인이 없으면 여기서 멈춘다.

## 8. 현재 실행 상태

- 2026-08-20 컨텍스트 기록 시점에 `localhost:4567` listener는 없었다.
- InkOS를 다시 띄울 때는 자식 저장소와 위 실제 작품 경로를 사용한다.
