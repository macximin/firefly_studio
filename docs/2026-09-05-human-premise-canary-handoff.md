# Human Premise Canary HIL · Current Context and Handoff

작성일: 2026-09-05  
현재 단계: 신규 Human Premise 카나리 생성·독립심사·Storyyard 배포 완료 / 오너 HIL 대기  
다음 허용 단계: 오너가 선택한 전제의 해시 결속 결정 기록 → Commercial Expansion → 기획서 HIL  
현재 금지: Book 생성, Arc/Rail 생성, 원고 집필, 캐논 승격, 그래프 엔지니어링

## 한 줄 결론

현재 Firefly는 `독식하는 재벌 3세`의 검증된 원문·구조·문체 근거를 실제 입력에
넣어 신규 전제 두 개를 만들었고, Storyyard에서 첫 번째 사람 HIL을 기다리고 있다.
기획서 HIL까지 한 번에 진행하는 상태가 아니다. 사람이 전제를 하나 선택해야만
그 선택안을 상업 기획서로 확장하고, 두 번째 HIL에서 다시 멈춘다.

```text
Reference Lab 원문·구조 증거
→ InkOS Human Premise 2안
→ 독립 Human Premise 심사
→ Storyyard 사람 전제 HIL  ← 현재 위치
→ 선택 전제 해시 결속
→ Commercial Expansion 1안
→ 독립 Planning Entry 심사
→ Storyyard 기획서 HIL
→ 이후 별도 승인에만 Book → Arc/Rail → 원고
```

## 저장소 권한 경계

- HQ root는 지시, 단계 순서, 계약 검증, 영수증 집계만 담당한다.
- `edge_repos/firefly_reference_lab`은 원문에서 파생한 구조·문체·참고 증거를
  제공한다. 생산 결정이나 InkOS 직접 쓰기는 하지 않는다.
- `edge_repos/inkos`가 전제·기획·심사·결정 적용·Book/Arc/Rail/원고의 유일한
  실행 주체다.
- `edge_repos/storyyard`는 immutable review packet과 사람의 pending 결정을
  투영한다. InkOS 캐논을 직접 수정하거나 원고를 적용하지 않는다.
- `edge_repos/firefly_market_radar`는 이번 카나리에 사용하지 않았다.
- `config/edge-repos.json` 밖의 V3·Shortform 계열은 이 HQ 범위가 아니다.

## 이번에 해결한 P0

이전 실패의 원인은 원문 자산 소실이 아니라 피치 실행계약 미결속이었다. 기존
피치는 Reference Transformation Pack, story index, 문체 예문, 장르 Soul을 실제
모델 입력과 심사에 강제하지 않아 `권한·접근권·물류권` 같은 기계적 욕망을
상업적 목표로 오인했다.

현재 구현은 다음을 fail closed로 강제한다.

1. 원문 pack/source/story-index/style/structure SHA 결속
2. `gpt-5.6-sol/high`와 canary-scoped 남성향 현대판타지 Soul 영수증
3. 회사·돈·권리를 지워도 남는 사람 욕망, 오늘의 선택, 관계의 감정 지급
4. 생성자와 분리된 독립심사
5. 사람 선택 전 Commercial Expansion 차단
6. 확장 기획서의 참고 작품명·참고 역할·보존 요소·표면 변주·beat/Arc 매핑 공개
7. 기획 HIL 전 Book·Arc·Rail·원고 생성 차단

세부 설계와 감리 기록은
`docs/2026-09-04-pitch-human-grounding-p0-plan.md`를 기준으로 한다.

## 현재 신규 카나리 정본

### 식별자와 권한

- Slate: `chaebol-human-premise-20260904-v3`
- Canon status: `non-canonical`
- Review status: `pending`
- Human decision: `pending`
- Storyyard packet: `frp-643e0fc8422a6ba2f6962176`
- Packet authority:
  - `commercialExpansion: false`
  - `bookCreation: false`
  - `manuscriptApply: false`
  - `reverseSync: false`

### 실제 실행 결속

- Runtime: `codex-cli / gpt-5.6-sol / high`
- Soul: `male-modern-fantasy-ko/v1`, `canary-scoped`
- 주축 참고작: `독식하는 재벌 3세`
- Work slug: `doksik-chaebol3`
- Reference pack: `doksik-chaebol3-ko-v1`
- 원문 beat: sequence `1`, `2`, `75`
- 문체 예문: `phase-1-entry-1`, `phase-1-escalation-75`,
  `phase-1-payoff-150`
- 구조 근거: `project_bible`, `chapter_map`, `arc_atlas`

### 무결성 증거

- Slate SHA-256:
  `3f1faafb316e3c8cc0fb9aa9af43bc68c578f238002ea822cd1eeb610191babd`
- Independent review SHA-256:
  `d7e96afcfd7ab34c7db4ab10d46d1638e843e126e3c2131b210f73804adaf196`
- Storyyard packet file SHA-256:
  `c08bf0b39d04e5b2d53ade8b17fb18732da2ad4b97926503792dd67fa902f795`
- InkOS export와 Storyyard immutable packet의 파일 SHA가 동일함을 확인했다.

### 로컬 증거 경로

- `edge_repos/inkos/.inkos/human-premise-slates/chaebol-human-premise-20260904-v3/slate.json`
- `edge_repos/inkos/.inkos/human-premise-slates/chaebol-human-premise-20260904-v3/independent-review/review.json`
- `edge_repos/inkos/.inkos/exports/storyyard/human-premise-slates/chaebol-human-premise-20260904-v3/packet.json`
- `edge_repos/storyyard/data/firefly/review-packets/immutable/frp-643e0fc8422a6ba2f6962176.json`

## 후보와 현재 판단

### 후보 A · p01 · 독립심사 SURVIVE

- 권장 제목: `회귀한 재벌 손자는 사람부터 고른다`
- 사적 욕망: 첫 생에 지키지 못한 할아버지에게 이번에는 끝까지 곁을 지킬
  가족으로 믿음받고 싶다.
- 첫 행동: 가족연에서 협력사 대표의 고가 커프스와 거짓 호소를 공개적으로
  깨뜨린다.
- 지급: 할아버지가 손자의 말을 먼저 믿고 옆자리를 내준 뒤 종잣돈과 투자팀
  선발권을 준다.
- 장점: 조손 신뢰 회복과 재벌물의 돈·인재·투자·해외 확장 엔진이 함께 산다.
- 필수 수선: 감정 지급과 150만 달러/투자팀 지급을 한 박자 분리해, 가족 인정이
  사업 보상의 부속품처럼 보이지 않게 한다.

### 후보 B · p02 · 독립심사 HOLD

- 대표 제목: `이번 생은 할아버지부터 지킨다`
- 핵심 구조가 A와 거의 같고, 첫 행동·소품 폭로·해외계좌·인재 선택까지
  중복된다.
- 독립적인 상업 훅이 약하므로 현재 상태에서는 생존시킬 이유가 없다.

### 오너와 작업자의 최근 판단

- 작업자 판단: `p01 select`, `p02 reject`가 적절하다.
- `오빠라 불러도 돼?`로 기억되는 남매 감정안은 현재 v3가 아니라 이전 v2의
  p01이다. 순수 감정 훅은 강하지만 가족치유물로 이탈할 위험이 있어 이번
  `현대판타지 재벌물 역설계 변주`의 주축 후보로 선택하지 않았다.
- 이 대화는 판정 제안일 뿐이다. 오너 선택 영수증은 아직 기록되지 않았다.

## Storyyard 실제 상태

- 검토 URL: `https://storyyard-wjjo.macximin11123.chatgpt.site/review`
- Sites version: `66`
- 배포 소스 커밋: `8c43e0ba7e640098211cba43abb574f56cfc1741`
- 실화면에서 `chaebol-human-premise-20260904-v3`와 후보 A/B 노출을 확인했다.
- Storyyard GitHub `main`과 로컬 HEAD가 위 커밋으로 일치하고 worktree는 clean이다.
- 현재 Sites 접근 정책은 `public`이다. 검토 패킷 화면은 공개될 수 있지만,
  결정 POST와 결정 조회는 Storyyard 관리자 또는 별도 검토 동기화 권한으로
  제한된다. 이를 `private site`라고 오기하지 않는다.

## 2026-09-05 Git 체크포인트

| Git root | Branch | HEAD | Dirty | 의미 |
| --- | --- | --- | ---: | --- |
| HQ root | `main` | `b7b1c217ae45` | 6 | P0 dispatcher/계약/문서 변경 미커밋 |
| InkOS | `master` | `e375a8cab945` | 15 | Human Premise·Expansion 구현 미커밋 |
| Reference Lab | `main` | `31e2b7788c28` | 0 | 읽기 전용 증거 사용, clean |
| Market Radar | `main` | `2b4a88adf2ec` | 0 | 이번 카나리 미사용, clean |
| Storyyard | `main` | `8c43e0ba7e64` | 0 | HIL UI·packet 배포 완료, clean |

이 문서를 추가하면 HQ root의 dirty count는 1 증가한다. 위 표는 문서 작성 직전
체크포인트다. HQ와 InkOS의 dirty 변경은 이번 P0 구현분이지만, 후속 작업자는
파일별 diff를 다시 감리하고 별도 승인 없이 reset/stash/자동 커밋하면 안 된다.

## 최근 검증 영수증

- HQ: 전체 `154` tests PASS
- InkOS Core: `2,537` tests PASS
- InkOS CLI: `271` tests PASS
- InkOS Core/CLI typecheck PASS
- Storyyard: build PASS, `44/44` tests PASS
- 세 저장소 `git diff --check` PASS
- v3 Storyyard import 이후 Storyyard build와 44 tests를 다시 통과했다.
- Book, Arc, Rail, chapter manuscript는 생성하지 않았다.

## 안전한 현재 중단점

현재가 의도한 안전 중단점이다. Storyyard에 후보와 추천은 보이지만, 어느 후보도
선택·확장·승격되지 않았다. 아래 중 하나가 확인되기 전에는 다음 명령을 실행하지
않는다.

- Storyyard에 기록된 정확한 pending 결정
- 또는 오너의 명시적인 `p01 select`, `hold`, `reject` 지시와 근거

작업자의 추천을 사람 결정으로 간주하거나 자동으로 `p01`을 선택하면 안 된다.

## 정확한 재개 절차

### 1. 사람 결정 재확인

1. Storyyard에서 v3 packet ID와 SHA를 다시 읽는다.
2. candidate ID, candidate SHA, `select | hold | reject`, 오너 코멘트를 확인한다.
3. 기존 InkOS `human-decision/decision.json`이 없는지 확인한다. 결정은 한 번만
   기록할 수 있다.

### 2. InkOS에 Human Premise 결정 기록

오너가 A를 선택했다면 InkOS root에서 다음 의미의 명령을 실행한다.

```bash
node packages/cli/dist/index.js pitch premise-decision \
  --id chaebol-human-premise-20260904-v3 \
  --candidate p01 \
  --decision select \
  --comment "오너의 실제 선택 근거" \
  --json
```

`hold` 또는 `reject`면 Expansion을 실행하지 않는다. Storyyard 선택을 수동으로
옮길 때는 화면의 실제 코멘트를 그대로 보존하고 작업자가 새 근거를 지어내지 않는다.

### 3. 선택된 전제만 Commercial Expansion

결정 영수증과 source pack SHA를 검증한 뒤 다음 의미의 명령을 실행한다.

```bash
node packages/cli/dist/index.js pitch premise-expand \
  --id chaebol-human-premise-20260904-v3 \
  --out-id chaebol-commercial-expansion-20260905-v1 \
  --target-chapters 200 \
  --instruction "p01의 사람 욕망과 원문 재벌물 골격을 유지하고 감정 지급과 사업 지급을 분리한다" \
  --session hq-premise-expand-chaebol-20260905-v1 \
  --json
```

확장 결과는 반드시 아래를 포함해야 한다.

- 불변 selected Human Premise
- `referenceDisclosure`: 작품명, slug, 참고 역할, 선정 이유
- 보존 요소 최소 4개와 표면 변주 최소 1개
- source beat/Arc 매핑
- 1~4화 사건과 물질·감정 동시 지급
- 반복 가능한 사업 행동과 장편 성장 사다리

### 4. 기획서 HIL에서 다시 중단

1. 확장 slate에 독립 `pitch-review`를 실행한다.
2. `pitch export-storyyard`로 immutable v3 planning packet을 만든다.
3. Storyyard index에 import하고 테스트·배포한다.
4. 오너가 전체 기획서를 `select | hold | reject`하기 전에는 `pitch-promote`,
   Book 생성, Arc/Rail, `/write`를 실행하지 않는다.

## 다음 작업 우선순위

### P0

1. 오너의 v3 Human Premise HIL 결정 확보
2. 선택된 p01에 필수 수선 적용하여 Commercial Expansion 1안 생성
3. 독립 Planning Entry review
4. 참고 작품과 보존/변주 근거가 보이는 Storyyard 기획서 HIL 배포

### P1

1. HQ와 InkOS dirty P0 변경에 대한 최종 diff 감리
2. 승인 후 각 Git root를 독립 커밋·푸시
3. clean 상태에서 HQ dispatcher 실제 mutating 경로로 동일 계약 1회 재검증

### Defer

- 그래프 DB/벡터 DB
- 다작품 자동 donor-scene 추천
- 먼 Arc 전체 생성
- Book/원고 자동 승격
- v2 남매 감정안 재활성화

그래프 엔지니어링 재검토 조건은 v3 전제 선택과 확장 기획서 HIL이 연속으로 한 번
통과하는 것이다. 그 전에는 잘못된 추상화를 구조로 굳힐 가능성이 더 크다.

## 후속 작업자 금지선

- Storyyard 추천을 오너 승인으로 간주하지 않는다.
- p01 선택 전에 `premise-expand`를 실행하지 않는다.
- 기획서 HIL 전에 Book·Arc·Rail·원고를 만들지 않는다.
- Storyyard에서 InkOS로 직접 reverse sync하지 않는다.
- 참고작 공개 정보를 원고나 공개 작품 소개로 자동 투영하지 않는다.
- Reference Lab/Market Radar가 생산 결정을 쓰게 하지 않는다.
- HQ/InkOS dirty worktree를 reset, stash, overwrite, 자동 커밋하지 않는다.
- `git add .`로 Git root 경계를 넘지 않는다.

