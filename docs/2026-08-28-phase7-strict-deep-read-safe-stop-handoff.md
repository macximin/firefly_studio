# Phase 7 strict deep-read 9/9 완료·다음 게이트 인계서

- 체크포인트 시각: 2026-08-29 KST
- 상태: **strict deep-read 9/9 완료 / genre profile 합성 대기**
- 다음 실행선: **profile 합성 -> 별도 manager QA. Book path canary는 아직 금지**
- 문서 갱신 직전 HQ 기준: `7246d6c68eb1532ca0e4cad40e35972471c38364`
- Reference Lab 체크포인트: `b7b77d78eed4939930c3c0eb8f4a52710c8e8978`
- 정본 계획:
  [InkOS v1.8 선택 이식·Production Kernel 구현안](./2026-08-28-inkos-v18-selective-production-kernel-plan.md),
  [Hermes 남성향 장르 Soul 원문 학습 계획](./2026-08-27-hermes-male-genre-soul-learning-plan.md)

## 1. 체크포인트 상태

현재 Hermes `--oneshot`과 `genre-soul-deep-read-runner` 프로세스는 0개다.
HQ와 manifest 등록 하위 레포 네 개는 모두 clean이고 각 origin과
`behind 0 / ahead 0`이다.

| 저장소 | branch | checkpoint |
| --- | --- | --- |
| HQ | `main` | `7246d6c` (이 문서 갱신 직전) |
| InkOS | `master` | `77591412` |
| Reference Lab | `main` | `b7b77d7` |
| Market Radar | `main` | `2b4a88ad` |
| Storyyard | `main` | `f1c4e1e` |

이 시점에는 genre profile 합성, manager QA, Soul promotion, 격리 Book
path canary, InkOS canon mutation을 시작하지 않았다. manifest의
`active/ready`는 저장소 운영 상태이지 Soul production 승격을 뜻하지 않는다.

## 2. tracked 완료 9/9

아래 9편의 작품별 strict deep-read가 완료됐다. 합계는 3,082/3,082 exact
chapter reads, 129 segments, 96,584,605 tokens, 1,286 API calls다.
모든 work-study는 gap-free byte coverage와 no-compaction trace를 통과했고,
tracked projection은 available private corpus 32편 대비 누출 0건이다.

| 장르 | 작품 | source ID | 회차 | segments | tokens | calls |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 현대판타지 | 독식하는 재벌 3세 | `gdrive-1BzfNJPOBwauB9HxQq6_HZIDLllb46vJN` | 751 | 29 | 23,747,063 | 321 |
| 현대판타지 | 재벌가 막둥이는 만능 천재(개정판) | `gdrive-1SRFbbNIAztKYRIQGzhDdhsEz6BjOOKLM` | 380 | 15 | 13,231,429 | 173 |
| 현대판타지 | 이혼 후 재벌 각성! | `gdrive-1IveOliU4R7FSbNU6nAtAVSFp9cp4iUDf` | 219 | 8 | 9,387,643 | 117 |
| 판타지 | 하급 서기관의 회귀 | `gdrive-1tvlx7aVmtCQfgCkO5rB5Ea1iy5-K_19b` | 222 | 10 | 5,503,446 | 79 |
| 판타지 | 기사학교의 검술천재 | `gdrive-1fwf7btYmJFpKLM8I3YYrF9qbsmOCtAE1` | 233 | 10 | 5,255,518 | 70 |
| 판타지 | 카레인 | `gdrive-1cKpe8b5G76V2EraDdWjPJ_70_6qfjFJH` | 300 | 13 | 8,456,103 | 123 |
| 무협 | 무당귀환 | `gdrive-1T4OGOvaC_VF83tDj31m5vqloM6ERHKLq` | 152 | 7 | 6,085,596 | 74 |
| 무협 | 마교육제 | `gdrive-1fmc_c6WhPri_u7pH8OAwBuxDZnheUomI` | 400 | 17 | 14,052,220 | 184 |
| 무협 | 화산대도 | `gdrive-1B5jgTxwxyabDX4N-u-hchbZCP8GS3NfI` | 425 | 20 | 10,865,587 | 145 |

관련 Reference Lab 이력은 `de53f0f` exact readback 보강,
`2df069b` 첫 strict run, `54b157d` 4편 체크포인트,
`c148cda` 5편 체크포인트, `3b45587` 6편 완료,
`781e8c2` 7편 완료, `1d19c2e` 8편 완료,
`b7b77d7` 9편 완료다.

## 3. 9/9 aggregate 영수증

완료 시점에 manager selection 9개, private deep-read receipt 9개, tracked
work-study 9개, tracked leak receipt 9개의 source ID union과 1:1 대응을 실제
bytes로 다시 확인했다. 전 작품은 아래 공통 gate를 통과했다.

- `gpt-5.6-sol / openai-codex / high`
- manager selection의 전 자연 회차와 `exactReadCount` 일치
- source byte 0부터 `sizeBytes`까지 gap-free coverage
- segment manifest, chapter bytes, Hermes trace, host receipt, bundle receipt,
  tracked artifact와 leak receipt SHA chain 일치
- compaction·truncation 0, leak `status=pass`, match 0
- Reference Lab tests 36/36, `git diff --check` PASS
- `private_sources/`와 `exports/` tracked 파일 0

ignored `exports/`는 원문·호출 trace·private receipt를 보존하지만 Git 정본이
아니다. 원격 정본의 완료 증거는 Reference Lab `b7b77d7`에 있는 9개
work-study와 9개 leak receipt다. token/API aggregate는 이 체크포인트에서
ignored receipt 9개를 실제 readback해 기록한 운영 영수증이다.

## 4. 다음 작업자 preflight

다음 작업자는 HQ와 Reference Lab의 `AGENTS.md`, 이 인계서, 두 정본 계획,
`config/edge-repos.json`을 먼저 읽는다. 아래 확인 전에는 profile 합성이나
production 경로를 실행하지 않는다.

```bash
cd /Users/a2501/Desktop/firefly_studio
git status --short --branch
node scripts/status-edge-repos.mjs --fetch --json
ps -Ao pid,ppid,stat,command | rg '[g]enre-soul-deep-read-runner|[h]ermes' || true

cd edge_repos/firefly_reference_lab
git status --short --branch
node --test tests/*.test.mjs
test -z "$(git ls-files -- private_sources exports)"
test "$(find analyses/genre_souls -path '*/work-studies/*.deep-read.json' -type f | wc -l | tr -d ' ')" = 9
test "$(find analyses/genre_souls -path '*/leak-scan-receipts/*.deep-read.json' -type f | wc -l | tr -d ' ')" = 9
```

HQ 또는 child가 dirty/ahead/behind/branch drift 상태거나 Reference Lab
checkpoint가 달라졌는데 이유를 읽지 못했으면 먼저 감리한다. 9/9 deep-read를
다시 실행하거나 ignored `exports/`를 삭제·재생성하지 않는다.

## 5. 다음 구현 순서

9/9 완료 뒤의 첫 실행은 Book 카나리가 아니다. 아래 순서를 고정한다.

1. Reference Lab의 genre profile contract를 3개 선택작 receipt와 leak bytes에
   fail-closed로 결속하고 profile 합성기를 구현한다.
2. profile 합성과 분리된 manager QA runner·receipt를 구현한다. 서로 다른
   상업 엔진, raw 표본 selector와 별도 manager 실행 증거를 검증한다.
3. HQ `agent-operate`, adoption dispatch gate, literal-null session-less adapter와
   InkOS의 candidate/promoted 실행 경계·4중 adoption byte binding을 구현한다.
4. 새 ignored Book 하나에서만 direct path canary를 실행한다. 이 결과는 승격
   점수에 넣지 않는다.
5. 장르별 neutral/Soul promotion pair 3개와 Storyyard blind review를 실행한다.
6. Reference Lab은 eligibility만 계산하고, 마지막 owner approval 뒤에만 HQ
   decision·active registry·InkOS binding을 함께 바꾼다.

현재 P0 공백은 `agent-operate` 실행 경로 부재, 현 WorkOrder/InkOS의 필수
`sessionId` 때문에 literal-null path 증거를 만들 수 없는 점, owner adoption의
analysis/writer/routing/HQ decision bytes를 production dispatch에 함께 결속할 수
없는 점이다. profile/manager validator와 blind pair runner의 얇은 계약은
promotion 전 P1이다. 이 공백을 우회해 기존 `write-next`를 path canary나 Hermes
E2E로 재분류하지 않는다.

## 6. 변경·중단 원칙

각 저장소는 독립 Git root다. 명시 경로만 stage하고 `git add .`, reset, stash,
ignored `exports/` 삭제를 금지한다. owner가 중단을 요청하면 child process를
먼저 종료하고 프로세스 0, 현재 gate의 durable receipt, 각 repo clean/sync를
확인한 뒤 이 문서를 갱신한다.

## 7. 작품별 완료·커밋 gate (적용 완료)

runner가 전 segments를 통과해야만 다음 두 tracked 파일이 생긴다.

```text
analyses/genre_souls/<soul-id>/v1/work-studies/<source-id>.deep-read.json
analyses/genre_souls/<soul-id>/v1/leak-scan-receipts/<source-id>.deep-read.json
```

각 작품마다 다음을 확인한다.

1. `chapterCount`가 manager selection과 일치한다.
2. coverage가 byte 0에서 source `sizeBytes`까지 gap-free다.
3. private bundle의 `exactReadCount`가 전 회차와 일치한다.
4. model/provider/reasoning은 `gpt-5.6-sol/openai-codex/high`다.
5. 모든 trace는 compaction·truncation 0이고 context upper bound가
   272,000 미만이다.
6. leak receipt는 `status=pass`, `matchCount=0`, `truncated=false`다.
7. `node --test tests/*.test.mjs` 36 tests와 `git diff --check`가 통과한다.
8. `test -z "$(git ls-files -- private_sources exports)"`가 통과한다.

검증된 작품의 위 두 파일만 explicit `git add -- <path1> <path2>`로 stage한다.
`git add .`, `git clean`, reset, stash, ignored `exports/` 삭제를 금지한다.
작품 하나마다 Reference Lab에 독립 커밋·push하고 fetch 뒤
`HEAD == origin/main`, clean을 확인한다.

## 8. 다음 완료선

9개 work-study 전수 strict validation, 누출 0 재합산과 이 정본 갱신까지
완료했다. 다음 완료선은 `genre profile 합성 -> manager QA -> HQ agent-operate
adapter·adoption dispatch gate·session-less path canary adapter -> 격리 Book
path canary -> promotion pair와 Storyyard blind review -> owner adoption`이다.
각 단계는 정본 계획의 별도 gate이며 앞 단계를 생략하지 않는다.

Reference Lab은 owner promotion 결정을 내릴 수 없고, Storyyard는 InkOS
canon을 쓸 수 없다. owner 승인 전에는 Soul을 active로 바꾸지 않는다. 격리
path canary도 위 P0/P1 선행 gate와 manager QA를 통과한 뒤에만 새 ignored
Book에서 실행한다. 이번 체크포인트의 goal은 계속 진행 중이며 complete나
blocked로 표시하지 않는다.
