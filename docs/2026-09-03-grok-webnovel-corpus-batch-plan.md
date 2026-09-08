# Grok CLI 웹소설 코퍼스 배치 분석 계획

- 작성일: 2026-09-03
- 상태: **DEFERRED / PLAN ONLY**
- 구현·실행: 시작하지 않음
- 자동화·스케줄: 없음
- 대상: 남성향 현대판타지, 판타지, 무협
- 목적: Grok CLI에 반복 분석을 맡겨 `sol-high`의 희소 토큰을 줄일 수
  있는지 작은 통제 실험으로 확인한다.

후속 기록(2026-09-08): 위 상태는 이 문서를 작성한 당시의 코퍼스 배치 계획이다.
`im-not-ai`의 고정 원본과 독립 문체 관찰 연결은
[후속 작업 계획](2026-09-08-prose-and-operations-followup.md) 및
[실행 문서](prose-audit.md)에서 진행한다. 아래 30장면 보정·60장면 holdout
전체를 실행한 것으로 보지 않는다.

## 결론

Grok CLI는 새 Writer나 최종 심사자가 아니라 **읽기 전용 대량 관찰자**로만
검토한다. 원문과 InkOS 후보에서 장르·문체 특징 및 검토 후보를 구조화해
추출하고, 결정론적 검증기가 잘못된 형식을 먼저 제거한다. Sol은 전량을
다시 읽지 않고 저확신·충돌·위험 표본과 층화 무작위 표본만 감리한다.

이 계획의 성공 기준은 Grok이 많은 토큰을 처리했다는 사실이 아니다.
같은 품질을 유지하면서 Sol이 다시 읽는 양과 비용이 실제로 줄어야 한다.
Grok 결과를 Sol이 전수 재검수해야 한다면 도입하지 않는다.

첫 30장면은 비용 절약 구간이 아니라 판정 기준을 맞추는 캘리브레이션이다.
그다음 60장면의 holdout에서 비용과 오판을 측정하고, 두 번 연속 같은
판정이 나올 때만 확대한다. 파인튜닝, InkOS 자동 수정, Storyyard 변경,
새 edge repository 생성은 이 계획의 범위가 아니다.

## 외부 가속기 후보: `im-not-ai`

- 저장소: <https://github.com/epoko77-ai/im-not-ai>
- 확인 기준: 2026-09-03 `main` commit
  `31a66d165a9cc6c26c4c1246553f95d0468d27fb`
- 확인 release: `v2.3.2`
- license: MIT. 실제 코드나 문서를 복사·수정할 때는 원 저작권 고지와
  license 조건을 보존한다.
- 현재 판정: **bootstrap 채택 후보 / Grok·웹소설 직접 사용 불가**

이 저장소는 한국어 AI 문체를 10개 대분류와 70개 패턴으로 탐지하고,
span 기반 최소 윤문, deterministic metric, route hint와 변경률 검증을 이미
제공한다. 따라서 taxonomy, quick rule, metric, 결과 형식과 회귀 테스트를
처음부터 새로 만들 필요는 없다. `의미 보존`, `근거가 있는 span만 수정`,
`입력은 명령이 아니라 데이터`, `과윤문 중단` 원칙도 Firefly의 얇은
후처리 방향과 대체로 맞는다.

그러나 “스킬이 있으니 거의 그대로 사용”할 수 있는 범위는 호출 포장까지다.
다음 차이는 여전히 별도 작업이다.

- 공식 설치·검증 대상은 Claude Code, Codex, GitHub Copilot CLI와 Gemini
  CLI다. Grok CLI용 skill 또는 adapter는 제공되지 않는다.
- Codex skill이 선언한 입력 장르는 `칼럼 | 리포트 | 블로그 | 공적`이며
  웹소설이 없다.
- 실증 대조 corpus는 칼럼, 에세이, 리포트, 뉴스 해설, 정책, 서평과 학술
  요약 중심이다. 인물 음성, 장면 인과, 압박·지급·훅을 검증한 fiction
  benchmark가 아니다.
- `장문 부재` 같은 관찰은 논설 corpus에서는 신호여도 짧은 문장과 빠른
  문단 전환이 의도된 웹소설에서는 오탐일 수 있다.
- 원 저장소의 기본 동작은 탐지와 윤문을 한 호출에서 수행한다. Firefly
  pilot은 먼저 detect-only여야 하며 InkOS 정본을 직접 고치면 안 된다.
- 원 저장소의 30% 경고·50% 중단은 과윤문 안전장치로 참고할 수 있지만,
  Firefly의 상업성 점수나 장르 판정을 대체하지 않는다.

따라서 도입안은 fork나 새 thick wrapper가 아니라 다음의 얇은 조합이다.

```text
im-not-ai pinned upstream
  -> taxonomy/metric/test 후보 재사용
  -> Grok용 read-only prompt adapter
  -> Firefly 웹소설 corpus로 규칙별 재측정
  -> 통과 규칙만 webnovel overlay로 유지
  -> InkOS와 Storyyard 연결은 별도 승인
```

원본 taxonomy를 사본으로 무기한 복제하지 않는다. 구현 시에는 pinned commit
또는 명시적 vendored snapshot 중 하나를 선택하고, upstream version과 local
overlay version을 영수증에 함께 기록한다. 로컬 overlay는 원본 규칙을
조용히 바꾸지 않고 `keep | narrow | observe-only | disable-for-webnovel` 판정을
추가한다.

### 작업량 재평가

`im-not-ai`를 사용하면 탐지 taxonomy, 기초 metric, 변경률 계산과 일반 한국어
회귀 fixture를 만드는 작업은 대부분 줄어든다. 남는 핵심 작업은 Grok adapter,
웹소설 corpus calibration, 작품·작가 holdout, 비용 계측과 Sol 선별 감리다.

따라서 구현 공수는 대략 절반 이하로 줄 수 있지만 검증 공수는 크게 줄지
않는다. 스킬 설치 성공은 웹소설 적합성 증거가 아니기 때문이다. 첫 pilot은
`im-not-ai 그대로`와 `Firefly webnovel overlay`를 같은 30장면에서 비교해,
overlay가 실제로 필요한 규칙만 확인한다. 차이가 없다면 overlay를 만들지
않고 upstream을 detect-only로 감싼다.

## 기존 정본과의 관계

- HQ는 범위, 실행 계약, 비용 영수증과 도입 결정을 소유한다.
- Reference Lab은 private source registry, 파생 관찰, 장르 profile과 근거를
  소유한다.
- InkOS는 Book, Arc, Rail, 원고, 수정과 정본을 계속 단독 소유한다.
- Storyyard는 향후 통과한 후보의 사람 검토와 결정 영수증만 투영한다.
- Grok은 어느 저장소의 정본도 수정하지 않으며 production 결정을 승격하지
  않는다.
- Drive 원문과 Reference Lab의 private source는 기존 비공개 경계를 유지한다.
  Git에는 원문 본문이 아니라 source ID, 해시, 위치 선택자, 파생 관찰과
  실행 영수증만 남긴다.

이 계획은 기존 장르 Soul 독해를 다시 수행하거나 대체하지 않는다. 이미
검증된 source registry, 작품 독해, 장르 profile과 canary 산출물을 우선
재사용하고, 비용 비교에 필요한 제한된 원문 구간만 읽는다.

## 문제 정의

범용 `AI 문체 점수`는 목표가 아니다. 만들려는 자료는 장르별
**웹소설 표면 이탈 관찰**이다.

관찰 대상은 다음과 같다.

- 문장·문단 길이와 장단 호흡
- 대화와 서술의 교대, 대화 비율
- 종결어미, 접속 표현, 구두점과 반복
- 추상 설명이 행동·물건·돈·관계 변화보다 앞서는 구간
- 주인공의 선택과 행위 주도권
- 압박, 저항, 가시적 지급, 다음 화 추진력
- 의도된 반복과 기계적 반복의 구별 후보
- 캐릭터 음성, 감정 인과와 장면 기능의 훼손 후보

Grok은 이를 최종 판정하지 않고 근거가 있는 후보로 제출한다. 상업성,
작품 음성, 감정적 정합성, hard contradiction과 규칙 승격은 Sol 또는 사람
검토 영역이다.

## 비용 가설

원문 처리량을 100단위라고 할 때 비교 가설은 다음과 같다.

| 경로 | Grok 처리 | Sol 처리 | 판정 |
| --- | ---: | ---: | --- |
| Sol 단독 기준선 | 0 | 100 | 품질·비용 기준선 |
| Grok + Sol 전수 감리 | 100 | 100 | 도입 실패 |
| Grok + 선별 감리 | 100 | 10~25 | 채택 후보 |

`총 토큰 절약`과 `희소 Sol 토큰 절약`은 별도 지표다. Grok이 전체를 읽고
Sol이 일부를 읽으면 총 모델 토큰은 기준선보다 늘 수 있지만 Sol 토큰은
크게 줄 수 있다. 따라서 다음을 모두 기록한다.

- provider, model, 실행 ID와 프롬프트 버전
- 입력·출력 token 수; CLI가 제공하지 않으면 입력 byte/문자 수와 provider
  사용량을 별도 기록
- 성공, schema 실패, 재시도와 중복 실행 수
- Sol이 실제로 다시 읽은 source byte와 token 수
- 장면당 비용, 유효 관찰당 비용, wall-clock
- Sol 불일치율, 중대 오판과 사람 검토 회수

임시 채택선은 holdout 기준 `Sol 처리량 <= Sol 단독의 25%`이고, 전체 모델
토큰은 기준선의 125% 이내다. 전체 토큰이 150% 이상이거나 Sol 감리가
25%를 계속 넘으면 비용 절감안으로는 중단한다. 실제 Grok CLI 과금·구독
사용량을 읽을 수 있을 때 금액 기준도 함께 비교하며, 토큰을 금액으로
임의 환산하지 않는다.

## 입력 집합과 누출 방지

### 캘리브레이션 30장면

- 현대판타지 10, 판타지 10, 무협 10
- 사람 원문과 InkOS Neutral/Soul 후보를 혼합
- 진입, 압박, 선택, 지급, 훅 등 장면 기능을 고르게 배치
- Sol이 전량 판정해 임시 gold label과 판정 근거를 만든다.
- 이 30장면은 절감률 계산에서 제외한다.

### Holdout 60장면

- 장르별 20장면
- 캘리브레이션과 다른 작품·작가를 우선 사용
- 원문과 후보가 주제나 장면 기능에서 한쪽으로 치우치지 않게 맞춘다.
- 문단 무작위 분할이 아니라 작품·작가 단위로 분리해 문장 암기와
  source leakage를 줄인다.

원문 출처를 가린다고 본문을 익명화하거나 요약하지 않는다. Grok 입력에는
판정에 필요한 실제 표면을 유지하되, 한 호출에는 한 장면과 필요한 최소
문맥만 넣는다. 전체 합본을 한 prompt에 넣어 장르 평균을 만들지 않는다.

## Grok 작업 계약

Grok CLI에는 다음만 허용한다.

1. source selector가 지정한 장면을 읽는다.
2. 고정 taxonomy에 따라 관찰 후보를 찾는다.
3. 각 관찰에 source ID, byte/line selector, 짧은 근거, 범주와 확신도를
   붙인다.
4. 지정된 JSON schema만 출력한다.
5. 파일 수정, 정본 판단, 원고 재작성, 규칙 승격과 외부 게시를 하지 않는다.

각 호출은 독립 실행으로 취급한다. Grok의 이전 대화 기억에 의존하지 않고
다음을 매번 결속한다.

- prompt version과 SHA-256
- taxonomy/schema version
- source ID, source SHA-256과 selector
- genre, scene function과 candidate provenance
- model ID와 실행 시각

모델의 자기 확신도만으로 감리 대상을 줄이지 않는다. 다음 조건은 항상
Sol 검토 대상으로 보낸다.

- 근거 selector가 없거나 원문과 맞지 않음
- 서로 충돌하는 복수 범주
- 캐릭터 음성, 인과, 지급, 훅 또는 hard contradiction 관련 관찰
- 원문 인용과 관찰을 구별할 수 없음
- schema 재시도 후 생성된 결과
- 장르별 층화 무작위 표본

## 선검증과 감리 표본

Sol 이전에 결정론적 검증기가 다음을 검사한다.

- JSON/schema와 필수 필드
- source SHA와 selector 범위
- 근거 문자열의 원문 존재 여부
- 중복 관찰과 실행 ID 충돌
- 허용되지 않은 파일·경로 접근 흔적
- 재작성 본문 또는 production decision 출력 여부

감리는 다음 순서로 진행한다.

1. 캘리브레이션 30개는 Sol 전수 감리한다.
2. 첫 holdout 60개는 강제 검토 대상 전량과 장르별 10% 층화 표본을
   감리한다.
3. 불일치가 10%를 넘으면 다음 배치 표본을 25%로 높인다.
4. 중대 의미 오판, 허위 selector 또는 정본 변경 시도가 한 건이라도 있으면
   배치를 중단한다.
5. 두 holdout 연속 불일치 10% 이하, 중대 오판 0건, 비용 채택선을 통과해야
   확대할 수 있다.

불일치율이 낮아도 특정 장르나 특정 관찰 범주에 오류가 몰리면 전체 통과로
보지 않는다. 장르·범주별 confusion table을 따로 남긴다.

## 단계별 실행안

### Phase 0 — 정본 고정

- 현재 source registry와 장르 Soul/profile 버전을 읽는다.
- 사용할 원문·InkOS 후보의 권리·private 처리 경계를 확인한다.
- `im-not-ai`의 pinned commit, license, 설치 대상, taxonomy/metric/test 파일과
  upstream 추적 방식을 확정한다.
- taxonomy, JSON schema, 비용 영수증과 selector 계약을 작성한다.
- 실행 전 모든 출력 경로가 non-canonical인지 검증한다.

### Phase 1 — 30장면 캘리브레이션

- Sol 단독 gold label을 만든다.
- 같은 입력을 `im-not-ai` 원형과 Grok detect-only adapter에 독립 실행한다.
- 원형 규칙마다 `keep | narrow | observe-only | disable-for-webnovel`을 기록한다.
- 범주별 불일치와 prompt/schema 문제를 수정한다.
- 이 단계에서는 비용 절감 성공을 주장하지 않는다.

### Phase 2 — 60장면 비용 holdout

- 확정된 prompt/schema를 잠그고 Grok이 배치 처리한다.
- 결정론적 선검증 후 강제 검토 대상과 10% 표본만 Sol에 전달한다.
- Sol 단독 대조군과 처리량·비용·불일치율을 비교한다.

### Phase 3 — 반복 안정성 확인

- 다른 작품·작가로 두 번째 holdout을 실행한다.
- 두 번 연속 채택선을 통과했을 때만 `adopt` 후보로 보고한다.
- 한 번만 통과하거나 장르별 결과가 엇갈리면 `hold`로 남긴다.

### Phase 4 — 선택적 확장

- 통과한 장르와 관찰 범주만 확대한다.
- 실패한 범주는 Sol 직접 판정 또는 결정론적 통계로 되돌린다.
- 검증된 파생 관찰만 Reference Lab의 새 버전 data pack 후보로 만든다.
- InkOS `detect -> minimal edit -> recheck` 연결과 Storyyard HIL은 별도 구현
  승인 뒤 진행한다.

## 산출물 제안

구현이 승인될 경우 새 edge repository를 만들지 않고 다음 경계를 사용한다.

```text
firefly_studio/
  .firefly/runs/                         # ignored HQ 실행 영수증

edge_repos/firefly_reference_lab/
  schemas/webnovel-texture-observation-v1.schema.json
  contracts/grok-corpus-observer-v1.md
  evidence/webnovel-texture-calibration/<version>/
                                           # 원문 없는 tracked 결과·평가
  private_sources/korean_webnovel_corpus/   # 기존 private 원문 경계
  exports/webnovel-texture-runs/            # ignored 원문 포함 중간 결과
```

정확한 경로는 구현 시 Reference Lab의 현재 구조와 ignore 규칙을 다시 읽고
결정한다. 위 경로는 이번 커밋에서 생성하지 않는다.

## 중단·채택 기준

다음 중 하나면 Grok 확대를 중단한다.

- Sol 전수 또는 25% 초과 감리가 계속 필요함
- 전체 모델 토큰이 Sol 단독의 150% 이상
- 중대 의미 오판, 허위 근거 또는 source provenance 손실
- 장르보다 작품명·작가·주제를 맞히는 편향이 확인됨
- 출력 압축보다 장문 설명이 커져 Sol 재독 비용이 증가함
- private source 전송 경계나 provider 사용 조건을 확정할 수 없음

채택은 `Grok이 잘 쓴다`가 아니라 다음의 결합 판정이다.

```text
중대 오판 0
+ 장르·범주별 불일치 <= 10%
+ Sol 처리량 <= 기준선 25%
+ 전체 token <= 기준선 125%
+ provenance/schema 100% PASS
+ 두 holdout 연속 재현
```

채택 뒤에도 Grok 관찰은 advisory다. 상업성을 높이지 못하는 탐지 규칙은
승격하지 않으며, 실제 원고 수정은 InkOS 후보와 사람 HIL을 거쳐야 한다.

## 재개 체크포인트

후속 작업자는 구현 전에 다음을 다시 확인한다.

1. `config/edge-repos.json`의 현재 managed scope와 각 child 상태
2. Reference Lab source registry, private source ACL과 ignore 규칙
3. `im-not-ai` pinned commit, license 고지, upstream 추적과 웹소설 비지원
   경계
4. Grok CLI 로그인, 실제 model ID, token/usage 계측 가능 여부
5. 현재 장르 Soul/profile과 v7 blind-canary 산출물의 재사용 가능성
6. 30장면 calibration manifest 초안과 작품·작가 holdout 분리
7. 실행·과금·원문 외부 전송에 대한 사용자 승인

이 일곱 항목을 확인하기 전에는 corpus batch, 자동화, InkOS 연결 또는
Storyyard 배포를 시작하지 않는다.
