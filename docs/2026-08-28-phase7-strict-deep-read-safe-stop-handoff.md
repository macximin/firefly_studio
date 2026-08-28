# Phase 7 strict deep-read 안전 중단·재개 인계서

- 체크포인트 시각: 2026-08-28 KST
- 상태: **owner 요청으로 의도적 중단**
- 재개 조건: **다음 사용량 리셋 뒤 owner가 명시적으로 재개를 지시할 때**
- 실행 중단 당시 HQ 기준: `ed30be5a5492af91f6c5572e7d9e5ce9cda566dd`
- Reference Lab 체크포인트: `c148cda929c05d84a81f0571277fc9e8cd003137`
- 정본 계획:
  [InkOS v1.8 선택 이식·Production Kernel 구현안](./2026-08-28-inkos-v18-selective-production-kernel-plan.md),
  [Hermes 남성향 장르 Soul 원문 학습 계획](./2026-08-27-hermes-male-genre-soul-learning-plan.md)

## 1. 중단 상태

현재 Hermes `--oneshot`과 `genre-soul-deep-read-runner` 프로세스는 0개다.
HQ와 manifest 등록 하위 레포 네 개는 모두 clean이고 각 origin과
`behind 0 / ahead 0`이다.

| 저장소 | branch | checkpoint |
| --- | --- | --- |
| HQ | `main` | `ed30be5` |
| InkOS | `master` | `77591412` |
| Reference Lab | `main` | `c148cda` |
| Market Radar | `main` | `2b4a88ad` |
| Storyyard | `main` | `f1c4e1e` |

이 시점에는 genre profile 합성, manager QA, Soul promotion, 격리 Book
path canary, InkOS canon mutation을 시작하지 않았다. manifest의
`active/ready`는 저장소 운영 상태이지 Soul production 승격을 뜻하지 않는다.

## 2. tracked 완료 5/9

아래 5편만 작품별 strict deep-read 완료로 주장할 수 있다. 합계는
1,226/1,226 exact chapter reads, 40,284,423 tokens, 524 API calls다.
모든 work-study는 gap-free byte coverage와 no-compaction trace를 통과했고,
tracked projection은 available private corpus 32편 대비 누출 0건이다.

| 장르 | 작품 | source ID | 회차 | segments | tokens | calls |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 현대판타지 | 이혼 후 재벌 각성! | `gdrive-1IveOliU4R7FSbNU6nAtAVSFp9cp4iUDf` | 219 | 8 | 9,387,643 | 117 |
| 판타지 | 하급 서기관의 회귀 | `gdrive-1tvlx7aVmtCQfgCkO5rB5Ea1iy5-K_19b` | 222 | 10 | 5,503,446 | 79 |
| 판타지 | 기사학교의 검술천재 | `gdrive-1fwf7btYmJFpKLM8I3YYrF9qbsmOCtAE1` | 233 | 10 | 5,255,518 | 70 |
| 무협 | 무당귀환 | `gdrive-1T4OGOvaC_VF83tDj31m5vqloM6ERHKLq` | 152 | 7 | 6,085,596 | 74 |
| 무협 | 마교육제 | `gdrive-1fmc_c6WhPri_u7pH8OAwBuxDZnheUomI` | 400 | 17 | 14,052,220 | 184 |

관련 Reference Lab 이력은 `de53f0f` exact readback 보강,
`2df069b` 첫 strict run, `54b157d` 4편 체크포인트,
`c148cda` 5편 체크포인트다.

## 3. 부분 진행 2편

아래 두 작업은 ignored `exports/`에만 재개 증거가 있다. **tracked 완료가
아니며**, work-study와 leak receipt도 생성되지 않았다.

| 순서 | 작품 | source ID | 검증 완료 | 다음 구간 | 전체 |
| ---: | --- | --- | --- | --- | ---: |
| 1 | 재벌가 막둥이는 만능 천재(개정판) | `gdrive-1SRFbbNIAztKYRIQGzhDdhsEz6BjOOKLM` | s0001~s0013, 1~350화 | s0014, 351~377화 | 380화 / 15 segments |
| 2 | 화산대도 | `gdrive-1B5jgTxwxyabDX4N-u-hchbZCP8GS3NfI` | s0001~s0015, 1~326화 | s0016, 327~350화 | 425화 / 20 segments |

- 현대판타지 s0013 완료 포인터:
  `attempts/attempt-20260828090313239-fb82b110`, receipt SHA
  `912b48ecd5570601cc581f6e2137161e2d757b207e186d26c80be9896ece035b`
- 무협 s0015 완료 포인터:
  `attempts/attempt-20260828090322679-4f7962e3`, receipt SHA
  `99ece4584730005226c09b632b3c3f43e4e0c76626654d079e25e7eeca701ba0`
- 중단 당시 생성된 현대 s0014와 무협 s0016에는 chapter files·manifest와
  파일이 하나도 없는 빈 attempt 디렉터리가 각각 남아 있다. 현대는
  `attempt-20260828090610321-96baab80`, 무협은
  `attempt-20260828090605156-ec94e988`이며 둘 다 `completed.json`이 없다.
  runner는 불완전 attempt를 건너뛰고 새 immutable attempt를 만들므로,
  성공이나 재사용 가능한 호출로 간주하지 않는다.
- runner는 기존 `completed.json`이 있는 구간을 model 재호출 없이
  source/config/manifest/usage/trace/exact bytes까지 다시 검증한다.
- 이 재개 상태와 private source registry는 **현재 Mac mini의 같은 checkout에만
  있는 ignored local state**다. Git clone, 새 worktree, 다른 host나 remote
  commit만으로 13/15·15/20 포인터가 복원되지 않는다. 아래 pointer preflight가
  실패하면 재개 가능하다고 추정하지 말고 local source와 registry부터 다시
  감리한다.

## 4. 미착수 2편

| 순서 | 작품 | source ID | 회차 |
| ---: | --- | --- | ---: |
| 3 | 독식하는 재벌 3세 | `gdrive-1BzfNJPOBwauB9HxQq6_HZIDLllb46vJN` | 751 |
| 4 | 카레인 | `gdrive-1cKpe8b5G76V2EraDdWjPJ_70_6qfjFJH` | 300 |

## 5. 재개 전 fail-closed 확인

다음 작업자는 먼저 HQ와 Reference Lab의 `AGENTS.md`, 이 인계서, 두 정본
계획, `config/edge-repos.json`을 읽는다. 아래 확인 전에는 Hermes를 호출하지
않는다.

```bash
cd /Users/a2501/Desktop/firefly_studio
git status --short --branch
node scripts/status-edge-repos.mjs --fetch --json
ps -Ao pid,ppid,stat,command | rg '[g]enre-soul-deep-read-runner|[h]ermes' || true

cd edge_repos/firefly_reference_lab
git status --short --branch
node --test tests/*.test.mjs
test -z "$(git ls-files -- private_sources exports)"

modern_segments='exports/genre-souls/male-modern-fantasy-ko/v1/deep-read-runs/gdrive-1SRFbbNIAztKYRIQGzhDdhsEz6BjOOKLM/segments'
murim_segments='exports/genre-souls/male-murim-ko/v1/deep-read-runs/gdrive-1B5jgTxwxyabDX4N-u-hchbZCP8GS3NfI/segments'
test "$(find "$modern_segments" -name completed.json | wc -l | tr -d ' ')" = 13
test "$(find "$murim_segments" -name completed.json | wc -l | tr -d ' ')" = 15
test ! -e "$modern_segments/s0014/completed.json"
test ! -e "$murim_segments/s0016/completed.json"
```

다음 중 하나라도 발생하면 실행하지 말고 먼저 상태를 감리한다.

- HQ 또는 child가 dirty, ahead, behind, branch drift 상태다.
- Reference Lab HEAD가 위 기준과 다르면서 변경 이유를 읽지 못했다.
- private registry, manager selection, Hermes profile/config 또는 context limit
  readback이 실패한다.
- 기존 완료 포인터 수가 현대 13개·무협 15개와 다르다.
- 다른 deep-read/Hermes 프로세스가 실행 중이다.
- owner가 사용량 리셋 뒤 재개를 아직 지시하지 않았다.

## 6. 재개 명령과 순서

현재 runner default `TARGET_SEGMENT_BYTES=360000`에서 파생된 segment boundary와
chapter files가 manifest SHA를 거쳐 receipt와 완료 포인터에 결속돼 있다.
따라서 **`--target-bytes`를 추가하거나 값을 바꾸지 않는다.** 토큰 손실과
동시 실패 반경을 줄이기 위해 한 작품씩 아래 순서로 실행한다.

```bash
cd /Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab

node tools/genre-soul-deep-read-runner.mjs \
  --source-id gdrive-1SRFbbNIAztKYRIQGzhDdhsEz6BjOOKLM

node tools/genre-soul-deep-read-runner.mjs \
  --source-id gdrive-1B5jgTxwxyabDX4N-u-hchbZCP8GS3NfI

node tools/genre-soul-deep-read-runner.mjs \
  --source-id gdrive-1BzfNJPOBwauB9HxQq6_HZIDLllb46vJN

node tools/genre-soul-deep-read-runner.mjs \
  --source-id gdrive-1cKpe8b5G76V2EraDdWjPJ_70_6qfjFJH
```

첫 두 명령은 검증된 완료 포인터를 재사용한다. 한 명령이 실패하거나 owner가
중단을 요청하면 즉시 해당 프로세스를 종료하고, 새 `completed.json` 수와
tracked artifact 존재 여부만 확인한 뒤 멈춘다. 다음 작품을 자동으로 시작하지
않는다. 종료 뒤에는 아래 명령에서 관련 프로세스가 0개임을 다시 증명한다.

```bash
ps -Ao pid,ppid,stat,command | rg '[g]enre-soul-deep-read-runner|[h]ermes' || true
```

## 7. 작품별 완료·커밋 gate

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
8. `git ls-files private_sources exports`가 계속 빈 출력이다.

검증된 작품의 위 두 파일만 explicit `git add -- <path1> <path2>`로 stage한다.
`git add .`, `git clean`, reset, stash, ignored `exports/` 삭제를 금지한다.
작품 하나마다 Reference Lab에 독립 커밋·push하고 fetch 뒤
`HEAD == origin/main`, clean을 확인한다.

## 8. 9/9 이후의 완료선

9개 work-study가 생겨도 Phase 7이나 Soul 학습 전체가 완료된 것은 아니다.
먼저 9편 전수의 strict validation과 누출 0을 다시 합산하고 HQ 두 정본 문서와
이 인계서를 실제 commit으로 갱신한다. 이후 순서는 `genre profile 합성 ->
manager QA -> HQ agent-operate adapter·adoption dispatch gate·session-less path
canary adapter 완료 -> 격리 Book path canary -> promotion pair와 Storyyard blind
review -> owner adoption`이다. 각 단계는 정본 계획의 별도 gate이며 앞 단계를
생략하지 않는다.

Reference Lab은 owner promotion 결정을 내릴 수 없고, Storyyard는 InkOS
canon을 쓸 수 없다. owner 승인 전에는 Soul을 active로 바꾸거나 path canary,
Book·Arc·Rail·Chapter mutation으로 넘어가지 않는다. 이번 체크포인트의
goal은 계속 진행 중이며 complete나 blocked로 표시하지 않는다.
