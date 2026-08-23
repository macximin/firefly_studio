# 제작 준비·근거 복구 인계 — 2026-08-23

- 범위 정본: `config/edge-repos.json`
- 제작 엔진: InkOS
- 자문 입력: Firefly Reference Lab, Firefly Market Radar
- 자동 writeback: 금지
- 상태: 제작 준비 화면 완료, P9 삭제 경계 확정, 시장 근거 계약 복구

## 결론

다음 우선순위는 새 기능 추가가 아니다.

1. 《IMF를 독식한 재벌 3세》의 두 현실 배경 표현을 창작값으로 잠글지 owner가 결정한다.
2. 결정 후 하나의 시대고증 리서치 패킷 안에 분리된 claim ID 두 개를 발급하고, 재감리와 snapshot/truth만 갱신한다.
3. InkOS upstream은 자동 병합하지 않고 별도 격리 브랜치에서 저위험 변경만 선별 감리한다.
4. 《부도난 회사만 삽니다》는 작업 큐에서 제외한다. 새 명시적 복구 승인이 생기기 전에는 복구·검토·집필하지 않는다.

이 문서는 아래 문서의 구현 기록은 보존하되, 그 안의 시점성 있는 현재 상태와 다음 작업을 대체한다.

- `docs/2026-08-20-inkos-current-session-context.md`
- `docs/2026-08-22-book-production-baseline-v1-handoff.md`

## 저장소 영수증

| 저장소 | 브랜치 | 검증 HEAD | 원격 상태 | 결과 |
| --- | --- | --- | --- | --- |
| InkOS | `master` | `fd3e07b0a6fb5b3aa09838abc4f5b8ec089ffc28` | `origin/master` 일치 | 제작 준비 UI와 한국어 검수 표면 완료 |
| Reference Lab | `main` | `34f21f5d4b5e2ee22e2321d703ba208567c0cfa3` | `origin/main` 일치 | P9 owner 삭제 경계와 11개 문서 tombstone 확정 |
| Market Radar | `main` | `2b4a88adf2ecd44c66a017c9073fc420ff131803` | `origin/main` 일치 | 비교 계약과 fail-closed 하네스 복구 |

HQ 저장소는 이 인계서를 포함한 커밋 자체가 최종 HQ 영수증이다. 각 자식은 독립 Git 루트이며 서로의 변경을 함께 stage하거나 commit하지 않는다.

## InkOS 제작 준비 상태

InkOS `fd3e07b0`은 기존 작품 상세 설정 화면에 live readiness를 읽기 전용으로 연결했다. 별도 대시보드는 만들지 않았다.

《IMF를 독식한 재벌 3세》 화면의 실제 확인 결과:

- 전체 상태: `확인 대기`
- 기획서·작품 규칙: 준비
- A/B Rail: 준비
- 승인 Allocation: 1개
- ready ArcPacket: 1개
- current GoldRouteReceipt: 1개
- 최신 1화 ChapterTruthReceipt: current
- 열린 문제 표시: 2개
- 검수 버튼: `검수: 자동`; 기존 중국어 표기 없음

검증 영수증:

```text
Core: 201 files / 2,052 tests PASS
Studio: 61 files / 645 tests PASS
CLI: 45 files / 243 tests PASS
Studio Playwright E2E: 15/15 PASS
Core·Studio·CLI typecheck: PASS
Core·Studio·CLI production build: PASS
publish manifest 3/3: PASS
semantic audit: exit 0, informational candidates 26
git diff --check: PASS
```

루트 `lint`는 자식 패키지에 lint script가 연결되지 않아 검증 PASS로 주장하지 않는다.

## P9 삭제 경계

《부도난 회사만 삽니다》는 2026-08-17 owner가 외부 기획 출발을 이유로 거부하고 삭제한 작품이다.

- 상태: `INTENTIONALLY_DELETED_BY_OWNER`
- canonical InkOS `books/`에는 존재하지 않음
- Reference Lab 권위: `34f21f5d`
- 복구 조건: 작품명을 명시한 새로운 owner 승인
- 승인 전 금지: 복구, 1화 검토, 2~3화 집필, B002 개방

2026-08-23 확인 시 로컬 휴지통 보존본은 다음 경로에 있었다.

```text
/Users/a2501/.Trash/부도난-회사만-삽니다-deleted-2026-08-17
```

전체 트리 SHA-256:

```text
91c1f2d3a991b66a26b3bad8d4a64f28fd46a600efd99831fb1937c34333fe1d
```

휴지통 존재 여부는 시점 증거다. 삭제 팩의 production 권위를 뜻하지 않는다. 최신 상세 근거는 Reference Lab의 `docs/2026-08-23-p9-owner-deletion-receipt.md`다.

Reference Lab 검증:

```text
P9 historical body: tombstone을 제외한 11/11 역사 본문이 Trash 원문과 byte-identical
P9 tombstone boundary test: PASS
Node tests: 12/12 PASS
P0~P8 writing contracts: 14/14 PASS
독식하는 재벌 3세 strict: 751 chapters / 131 Arc / 0 errors / 0 warnings
리턴 에이스 strict: 310 chapters / 55 Arc / 0 errors / 0 warnings
git diff --check: PASS
```

## Market Radar 근거 계약

이번 복구에서는 라이브 플랫폼 수집을 실행하지 않았다. 저장된 공개 메타데이터와 합성 fixture를 오프라인에서 검증했으며, Market Radar가 InkOS 제작 결정을 자동 승격하지 못하는 경계를 유지했다.

엄격 계약은 다음을 fail-closed로 검사한다.

- 정확히 하나의 `quality_harness_status`
- 비어 있지 않은 제목과 HTTP(S) 출처 URL
- URL 내부 whitespace·control 문자와 malformed CSV quoting
- 유효한 Gregorian KST 시각
- 완전하고 중복 없는 안정 키
- 공백 카운터를 0으로 강제하지 않고 unavailable로 처리하며, 음수·소수·비정규 base-10 카운터는 거부
- 비교 metric과 source counter의 일치
- 이전·현재 값의 delta 산술과 반올림된 음의 0 정규화
- 보고서 verdict와 실제 CSV 상태의 일치

2026-08-16의 기존 120행 자료는 비교 계약 도입 전 단일 관측 자료다.

```text
status: rejected_by_harness
evidenceStatus: incomplete_contract
contractStatus: invalid
productionReady: false
rowCount: 120
```

원본 platform CSV SHA-256은 유지됐다.

```text
d66365fb44c9288e6e406aae1248551d0dc221eaadfae66897321440527a5d72
```

이 자료는 역사적 시장 참고층으로만 남긴다. production-ready 판정에는 v0 계약을 만족하는 새로운 이전·현재 snapshot 쌍이 필요하다. freshness `7/7`은 날짜 경계 통과일 뿐 품질 통과가 아니다. report-only exit 0도 문구 검사 통과일 뿐 evidence CSV 없이는 `productionReady: false`다. 라이브 플랫폼 HTML/API drift는 이번 작업에서 검증하지 않았다.

Market Radar 검증:

```text
npm run validate: PASS
freshness gate: PASS, age 7 / max 7 days
legacy bundle harness: expected exit 1
original platform CSV: HEAD byte-identical
git diff --check: PASS
```

## InkOS upstream 경계

InkOS는 `origin/master`와 일치하지만 `upstream/master@5da9fad03d65882adc030dc0043da8e8bc197dbd` 대비 23 commit ahead / 14 commit behind다.

`git merge-tree` 시뮬레이션은 `changed in both` 79개 구간과 conflict-marker opening 115개를 냈다. 최신 로컬 커밋도 upstream과 다음 5개 파일에서 겹친다.

```text
packages/core/src/__tests__/pipeline-runner.test.ts
packages/core/src/index.ts
packages/core/src/pipeline/runner.ts
packages/studio/src/api/server.test.ts
packages/studio/src/api/server.ts
```

따라서 `master`에 upstream을 자동 merge하지 않는다. 아래 세 변경은 별도 격리 브랜치에서 한 커밋씩 감리할 우선 후보다.

- `493df3a8 chore: require node 22 runtime`
- `de4e9fa5 fix(build): keep overrides compatible with pnpm 9`
- `52075bb9 fix(core): normalize persisted paths across platforms`

## IMF owner 결정

화면의 열린 문제 2개는 저장된 claim 두 개가 아니다. 하나의 미해결 감리·리서치 상태가 chapter audit와 research receipt에 각각 보이며, 현재 `claimIds`는 비어 있다. 그 메모 안에서 분리해야 할 현실 배경은 다음 두 가지다.

1. 1996년 11월 14일 오후 4시 18분 무렵 김포공항 국제선 출구
2. 여의도 본사에서 가상 인천 공장까지 퇴근 시간 “두 시간”

공식 항공 자료상 1996년 김포공항 국제선 운영 자체는 충분히 성립하며, 국제선 기능은 2001년 3월 29일 인천공항으로 이전됐다. 다만 출발지·항공사·편명이 없어 정확한 항공편과 4시 18분 무렵의 출구 도달은 확인하지 않았다.

인천시 기록상 당시 경인고속도로가 존재했고 신월IC~서인천IC는 1993년 왕복 8차로로 확장됐다. 서울연구데이터의 1996년 평균 차량 통행속도 20.9km/h는 혼잡 배경을 뒷받침하지만, 공장 주소가 없어 정확히 두 시간인지는 검증할 수 없다.

근거:

- 항공정보포털 2000 항공연감: `https://www.airportal.go.kr/file/htmlOpen/upload/library/yb00_03%ED%95%AD%EA%B3%B5%EC%88%98%EC%86%A1%EC%8B%A4%EC%A0%81.pdf`
- 항공정보포털 공항 연혁: `https://www.airportal.go.kr/file/htmlOpen/upload/library/yb2004_05_airports.pdf`
- 인천시 경인고속도로 연혁: `https://www.incheon.go.kr/traffic/TR050104`
- 서울연구데이터서비스: `https://data.si.re.kr/data-seoul/%EC%A7%80%EB%8F%84%EB%A1%9C-%EB%B3%B8-%EC%84%9C%EC%9A%B8-2013/120`

권장 owner 결정은 원고를 바꾸지 않고 두 표현을 창작상 구체값으로 유지하되, 검증된 정확 시각·정확 이동시간이라고 주장하지 않는 것이다. 공장 권역까지 잠그려면 `인천항 배후 공업권역`을 후보로 owner가 명시한다.

결정 후 하나의 시대고증 리서치 패킷 안에 아래 claim ID 두 개를 분리 발급한다.

1. 김포공항 국제선 운영 및 1996년 이용 가능성
2. 여의도에서 인천 공장까지의 퇴근 시간 이동

owner 결정 전에는 `needs-research`를 자동 해제하거나 원고를 수정하지 않는다.

## 재현 명령

Reference Lab:

```bash
node --test tests/*.test.mjs
node tools/validate-writing-system-contracts.mjs
node tools/validate-five-work-analyses.mjs doksik-chaebol3 --strict --require-pitch
node tools/validate-five-work-analyses.mjs return-ace --strict --require-pitch
git diff --check
```

Market Radar:

```bash
npm run validate
npm run check:freshness
git diff --check
git diff --quiet HEAD -- ssot/projects/market-intel-evidence-2026-08-16/2026-08-16_market_intel_platform_items.csv
```

기존 legacy bundle 직접 검사는 exit 1이 정상이며 결과가 `rejected_by_harness / incomplete_contract / productionReady:false`여야 한다.

InkOS:

```bash
pnpm --filter @actalk/inkos-core test
pnpm --filter @actalk/inkos-studio test
pnpm --filter @actalk/inkos test
pnpm --filter @actalk/inkos-studio test:e2e
pnpm -r typecheck
pnpm -r build
pnpm verify:publish-manifests
pnpm audit:semantic-patterns
git diff --check
```

HQ:

```bash
npm run validate
npm test
npm run status
git diff --check
```
