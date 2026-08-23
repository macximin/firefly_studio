# 제작 준비·근거 복구 인계 — 2026-08-23

- 범위 정본: `config/edge-repos.json`
- 제작 엔진: InkOS
- 자문 입력: Firefly Reference Lab, Firefly Market Radar
- 자동 writeback: 금지
- 상태: IMF 제작 기준선 current, P9 삭제 경계 확정, 시장 근거 계약 복구, 선별 upstream 머지 완료

## 결론

우선 작업은 완료됐다.

1. 《IMF를 독식한 재벌 3세》의 정확 시각·이동시간·공장 권역을 창작 고정으로 분리하고, 일반 역사 기준선 claim 두 개만 검증했다.
2. 기존 원고를 바꾸지 않고 Arc, 승인 Allocation, snapshot/truth, 새 Baseline 002를 갱신해 제작 준비 상태를 `current`로 닫았다.
3. InkOS upstream 14개 커밋을 격리 감리하고, 현재 fork와 독립적인 Windows 경로 테스트 수정만 `master`에 머지했다.
4. 《부도난 회사만 삽니다》는 계속 작업 큐에서 제외한다. 새 명시적 복구 승인 전에는 복구·검토·집필하지 않는다.

다음 우선순위는 Codex 구독 어댑터의 모델 캐시 호환성을 복구해 실제 `inkos audit` 호출을 다시 통과시키는 것이다. 그 뒤 Baseline 002 아래에서 IMF 2화 제작을 이어간다. Node·pnpm 정책 전환은 이번 upstream 선별 머지와 분리한다.

이 문서는 아래 문서의 구현 기록은 보존하되, 그 안의 시점성 있는 현재 상태와 다음 작업을 대체한다.

- `docs/2026-08-20-inkos-current-session-context.md`
- `docs/2026-08-22-book-production-baseline-v1-handoff.md`

## 저장소 영수증

| 저장소 | 브랜치 | 검증 HEAD | 원격 상태 | 결과 |
| --- | --- | --- | --- | --- |
| InkOS | `master` | `86c1702d48e01ed0dfe4f017491b2be791cecfdb` | `origin/master` 일치 | IMF 기준선 current, 선별 upstream 경로 테스트 머지 완료 |
| Reference Lab | `main` | `34f21f5d4b5e2ee22e2321d703ba208567c0cfa3` | `origin/main` 일치 | P9 owner 삭제 경계와 11개 문서 tombstone 확정 |
| Market Radar | `main` | `2b4a88adf2ecd44c66a017c9073fc420ff131803` | `origin/main` 일치 | 비교 계약과 fail-closed 하네스 복구 |

HQ 저장소는 이 인계서를 포함한 커밋 자체가 최종 HQ 영수증이다. 각 자식은 독립 Git 루트이며 서로의 변경을 함께 stage하거나 commit하지 않는다.

## InkOS 제작 준비 상태

InkOS `86c1702d`은 기존 작품 상세 설정 화면의 live readiness를 유지하고 선별 upstream 경로 테스트를 머지했다. 별도 대시보드는 만들지 않았다.

《IMF를 독식한 재벌 3세》 live readiness API의 실제 확인 결과:

- 전체 상태: `current`
- 기획서·작품 규칙: 준비
- A/B Rail: 준비
- 승인 Allocation: 1개
- ready ArcPacket: 1개
- current GoldRouteReceipt: 1개
- 최신 1화 ChapterTruthReceipt: current
- 연구 영수증: `verified`, claim ID 2개
- 승인 제작 기준선: `BASELINE-IMF-CANARY-002`, current
- 열린 문제: 0개
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
pnpm 11 frozen install·lockfile 불변: PASS
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

## InkOS upstream 감리·머지

2026-08-23 재확인 기준 InkOS는 `origin/master@86c1702d`와 일치하며 `upstream/master@5da9fad03d65882adc030dc0043da8e8bc197dbd` 대비 26 commit ahead / 14 commit behind다.

전체 upstream merge 시뮬레이션은 32개 파일과 conflict-marker opening 115개를 냈다. pi-harness 전환, TUI, v1.8 문서 체인은 현재 fork 계약과 얽혀 있어 전체 머지를 제외했다.

선별 판정:

- `493df3a8` + `8922e3ab`: 제외. 현행 Node 20 SQLite fallback을 제거하지만 실제 `node:sqlite` 최소 버전과 배포 package manifest의 `engines`가 정렬되지 않았다.
- `de4e9fa5`: 제외. pnpm 9 호환을 위해 override를 root `package.json`으로 옮기지만 현재 검증 런타임은 pnpm 11.1.2이며 canonical override는 `pnpm-workspace.yaml`에 있다.
- `52075bb9`: 전체 제외, 독립적인 `atomic-file-set.test.ts` Windows separator 부분만 수동 이식했다. production hunk 두 개는 현재 fork에 없는 pi-harness 체인에 의존한다.

격리 브랜치 `codex/upstream-v1-8-runtime-compat`의 변경은 테스트 파일 1개, 4줄 교체뿐이다. 독립 감리에서 같은 파일의 후속 rollback 테스트에 남은 POSIX 전용 비교 두 곳을 추가로 찾아 함께 수정했다.

```text
8e30b89f test(core): make atomic staging assertion portable
2e7428b0 test(core): cover portable rollback injection paths
86c1702d merge: integrate audited upstream path portability
```

머지 후 `master`에서 focused test 5/5, 전체 테스트·타입검사·빌드·E2E·publish manifest·semantic audit가 통과했다. `flow-after.png`는 Playwright가 만든 확인용 임시 스크린샷임을 생성 코드와 시각으로 확인한 뒤 해당 파일 하나만 제거했다.

## IMF owner 결정·적용

owner 결정은 적용됐다. 원고의 정확 시각과 이동시간을 검증 사실로 만들거나 `authorizedDivergence`로 오분류하지 않았다.

- `RC-IMF-1996-GIMPO-INTL-001`: 1996년 김포공항 국제선 운영의 일반 기준선만 `verified`
- `RC-IMF-1996-INCHEON-TRANSIT-002`: 1996년 경인축 도로와 수도권 혼잡의 일반 개연성만 `verified`
- 오후 4시 18분: 특정 항공편 도착 기록이 아닌 창작 고정값
- “두 시간”: 정확한 실측이 아닌 운전기사의 보수적 현장 추정
- 대은정밀 공장: `인천항 배후 공업권역`, 세부 주소 미정
- 기존 역사 분기: `보고서가 본사 결재선에 오르기 전에 원본 흐름에 개입한다.` 1개 그대로 유지

공식 항공 자료상 1996년 김포공항 국제선 운영은 성립하며 국제선 기능은 2001년 3월 29일 인천공항으로 이전됐다. 인천시 도로 연혁과 서울연구데이터의 1996년 평균 통행속도 20.9km/h는 경인축·혼잡의 일반 배경을 뒷받침한다. 둘 다 정확한 항공편 시각이나 정확한 두 시간 이동을 입증하지는 않는다.

근거:

- 항공정보포털 2000 항공연감: `https://www.airportal.go.kr/file/htmlOpen/upload/library/yb00_03%ED%95%AD%EA%B3%B5%EC%88%98%EC%86%A1%EC%8B%A4%EC%A0%81.pdf`
- 항공정보포털 공항 연혁: `https://www.airportal.go.kr/file/htmlOpen/upload/library/yb2004_05_airports.pdf`
- 인천시 경인고속도로 연혁: `https://www.incheon.go.kr/traffic/TR050104`
- 서울연구데이터서비스: `https://data.si.re.kr/data-seoul/%EC%A7%80%EB%8F%84%EB%A1%9C-%EB%B3%B8-%EC%84%9C%EC%9A%B8-2013/120`

책 로컬 근거 패킷은 `story/research/ERA-IMF-C01-001.md`에 있다. `books/`는 의도적으로 Git ignored인 제작 데이터이므로 HQ 인계서가 Git 영수증이고, 전체책 공식 백업은 `.inkos/backups/imf를-독식한-재벌-3세/20260823-142906`이다.

적용 결과:

```text
원고 SHA-256: 07a0dda59864e5387d6f611334f4c301d2cd082cc457f2ea9d58631052e13aff
백업과 원고 byte-identical: PASS
Allocation ALLOC-IMF-CANARY-001: approved/current
Baseline BASELINE-IMF-CANARY-002: approved/current
Chapter 1 research receipt: verified, claim 2
snapshot 0: execution/receipt empty 유지
snapshot 1: live ledger/receipt와 byte-identical
ChapterTruthReceipt: current
readiness: current, open issues 0, owner lock clear
```

표준 `inkos audit` 재호출은 작품 판정 전에 Codex 모델 캐시 역직렬화 오류(`missing field base_instructions`)로 시작하지 못했다. 새 LLM 판정을 통과했다고 주장하지 않는다. 기존 승인 회차의 본문 실행 증거를 그대로 유지하고, owner가 승인한 공식 근거 패킷으로 research finding만 해소한 뒤 `ChapterMetaSchema`, canon rebuild, snapshot, truth receipt, Allocation, Baseline API를 순서대로 재검증했다. 생성 당시 runtime context/intent/plan/rule-stack/trace와 빈 claim 이력은 소급 수정하지 않았다.

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
