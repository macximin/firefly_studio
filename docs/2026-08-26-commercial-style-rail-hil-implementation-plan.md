# 상업성 우선 레퍼런스 변형·전작 문체·Rail·Polishing HIL 구현 계획

- 작성일: 2026-08-26
- 상태: 계획 확정 / 구현 미시작
- 대상 작품: `처가에서-쫓겨난-날-재벌가가-나를-찾았다`
- 문체 원천: 《독식하는 재벌 3세》 751화 합본
- 원천 SHA-256: `66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45`
- 승인 분석: 751화 / 131개 자연 NarrativeArc / 관리자 QA 15/15 PASS

## 결론

Firefly 작품은 무(無)에서 독창성을 증명하는 산출물이 아니라, **검증된
기존 작품의 상업 엔진을 주축으로 삼고 표면과 국소 인과를 선택적으로
변주하는 reference-derived work**로 정의한다. 유사성 자체는 결함이
아니다. 원작과 멀어지는 정도를 품질로 측정하지 않는다.

Writer는 통계와 추상 카드뿐 아니라 실제 원문의 **이야기 예문과 문체
예문**을 받아야 한다. 원작의 사건 배열, 인물 역할, 압박, 반전, 보상
사다리, 장면 기능, 문장 호흡을 상업적 근거로 사용한다. 변주는 인명·조직·
소품·공간·국소 원인 같은 선택된 표면에서 시작하되, 바뀐 표면에 딸린 돈,
권한, 물증, 절차, 결과도 함께 정합화한다. 이름만 바꾸고 인과는 원작과
현재 캐논 사이에 걸쳐 두는 얕은 치환은 허용하지 않는다.

원문 겹침 가능성은 Writer 입력을 약화시키거나 초고를 차단하는 근거가
아니다. 초고 뒤 HIL은 원작에서 **유지한 상업 엔진과 실제로 변주한 표면**을
나란히 보여 주고, 사람에게 그대로 채택할지 추가 polishing할지 결정하게
한다. 자동 거리 확보, 자동 재작성, 자동 거절은 하지 않는다.

Firefly 장편의 기본 흐름은 다음으로 고정한다.

```text
주축 Gold + 보조 레퍼런스
  -> reference transformation map
  -> 기존 brief·book rules
  -> 누락 입력 자동 보완(Rail·이야기/문체 팩)
  -> 현재 Arc와 회차 의도
  -> 751화 색인에서 실제 이야기·문체 예문 검색
  -> Writer 상업성 우선 집필
  -> 창작·정본 검수
  -> 변형 비교 리포트 생성(차단하지 않음)
  -> Polishing HIL 후보 생성·비교
  -> 사람 적용/거절
```

우선순위는 `상업성 > 레퍼런스 엔진 보존 > 문체 재현 > 비핵심 세부
정합성`이다. 여기서 상업성은 빠른 진입, 압박, 선택, 지급, 다음 화 추진력을
뜻한다. 다만 현재 작품 정본, 돈, 증거 출처, 역할, 상태의 실제 모순과
손상된 runtime state는 변주 허용 범위가 아니므로 별도 실패 조건으로 둔다.

## 계획 안정성 재감리

### 1차 루프: 독창성 방어에서 레퍼런스 변형으로

기존 계획은 실제 원문을 Writer에 주면서도 결과를 `표면 겹침` 중심으로
감리했다. 이는 시스템의 관심을 상업 엔진 재현보다 복사 회피 쪽으로 다시
끌어당길 수 있다. 따라서 품질 질문을 다음처럼 바꾼다.

- 폐기: 원작과 얼마나 달라졌는가?
- 채택: 원작에서 무엇이 잘 팔렸고, 무엇을 유지했으며, 무엇을 왜
  변주했는가?
- 채택: 변주한 표면에 맞게 돈·물증·절차·역할·결과가 함께 바뀌었는가?

이 결론은 기존 Reference Core의 `승인 Gold 하나를 주축으로 잠금`, `구조
유사성은 결함이 아님`, `업종·사건 순서·보상 구조를 유사성 때문에 바꾸지
않음`과 일치한다. 새 계획은 그 철학을 Writer와 Rail까지 확장한다.

### 2차 루프: 단일 주축과 보조 은행

여러 작품을 무차별 혼합하면 각각의 상업 약속과 보상 리듬이 서로
상쇄된다. 따라서 작품마다 `spineReference` 하나를 필수로 두고, 다른
승인 Gold는 역할이 명시된 보조 은행으로만 쓴다.

- 주축 Gold: 장기 성장선, 반복 동사, 사건 배열, 압박·보상 리듬의 권위
- 보조 Gold: 특정 `engine | payoff | emotion | hook | wildcard` 슬롯만 보강
- 카드: 주축을 익명 추상화하는 대체물이 아니라 빠진 연결부 점검 도구
- 원문 예문: 주축의 실제 장면 표면과 문체를 Writer에게 전달하는 근거

현재 신작의 주축은 《독식하는 재벌 3세》로 고정한다. 다른 작품을 넣을
때는 어느 슬롯을 왜 보강하는지 먼저 기록하며, 전체 Spine을 바꾸지 않는다.

### 3차 루프: 표면 변주의 운영 가능성

`약간의 표면 변주`를 인명 일괄 치환으로 구현하면 모순과 밋밋함이 함께
생긴다. 변형 단위는 단어가 아니라 **장면 묶음**으로 둔다.

- 유지 가능: 사건 유형과 순서, 인물 역할, 협상 구조, 보상 종류와 지급
  타이밍, 관계 변화, 장면 순서, 훅 문법
- 선택 변주: 인명, 허구 조직명, 업종의 세부 대상, 소품, 공간, 국소 원인,
  수치, 장면 장식
- 연동 변주: 선택 표면이 바뀌면 관련 돈·계약·증거·절차·담당자·결과도
  같은 장면 묶음 안에서 함께 변경
- 그대로 사용 가능: 사실 검증된 실존 사건·기업·시대 표면. 단지 원작과
  달라 보이게 하려고 바꾸지 않음

최소 어휘 거리, 의미 거리, 사건 순서 차이, 구조 독창성 점수는 만들지
않는다. HIL은 변주량을 늘리는 심사대가 아니라 상업 엔진 보존과 현재
캐논 결속을 확인하는 선택 지점이다.

### 4차 루프: 전작 커버리지와 prompt 비용

15개 예문만으로 200화의 이야기 변형까지 담당시키는 안은 철회한다.
15개는 단계별 문체 기준으로는 충분하지만, 원작 전체의 사건·보상 사다리를
대표하지 못한다. 이야기 근거는 751/751 전수 검색 인덱스로 두고, 매 회차
매핑된 원천 회차 1~3개의 실제 구간만 Writer에 넣는다. 문체 기준만 5개
시기 × 3개 기능의 실제 예문 15개를 사용한다. 전수 근거와 prompt 비용을
동시에 만족한다.

### 5차 루프: 소유권과 실행 주체 재확인 — 변경 없음

Reference Lab은 원천·Gold·검색 팩을 소유하고, 작품별 변형 지도·Rail·Arc·
원고는 InkOS가 소유한다. HQ는 해시가 맞는 입력을 전달하고 receipt만
집계한다. HQ가 원고를 쓰거나 Reference Lab이 InkOS Book을 직접 바꾸지
않는다. 기존 레포 경계와 충돌하지 않아 역할 변경이 없다.

### 6차 루프: 상업성·HIL·정합성 재확인 — 변경 없음

최종 후보는 독창성 거리보다 진입·압박·선택·지급·훅과 주축 엔진 보존으로
고른다. HIL은 자동 rewrite 없이 채택·polish를 선택한다. 현재 작품의 돈·
증거·역할·상태 모순만 hard failure로 남긴다. 5차와 6차 연속 재검토에서
핵심 계약과 실행 순서가 바뀌지 않았다.

최종 불변축은 `주축 상업 엔진 보존 + 선택적 표면 변주 + 연동 인과 정합화
+ 사람 최종 선택`이다. 이후 구현 중 이 네 항목을 바꾸는 요구는 계획
변경으로 취급한다.

## 역할 분리

원문을 Writer에서 빼고 통계만 전달하면 문장 배열, 대화 간격, 묘사와
판단의 교대, 문단 호흡뿐 아니라 실제 사건의 장면화 근거도 사라진다.
역할은 다음처럼 나눈다.

- Reference Lab: 751화 원천 검증, Gold 구조, 변형 지도 입력, 실제 이야기·
  문체 예문 묶음 생성
- InkOS Writer: 실제 예문과 변형 지도를 읽고 상업 엔진·표면·문체를 함께
  구현
- InkOS 검수: 재미, 엔진 보존, 연동 변주, 현재 정본 모순을 확인
- Polishing HIL: 유지·변주 비교를 보고 후보를 만들고 사람이 적용/거절
- HQ: 승인 입력 전달, 자동 보완 실행, 영수증 집계

## 과보수 방지

다음 안은 상업성을 떨어뜨리므로 채택하지 않는다.

- 인명·조직명·숫자를 Writer 입력 전에 일괄 치환
- 문장·문단 평균이 목표 범위를 벗어났다는 이유만으로 초고 차단
- 의미 유사성이나 장르 관습을 복사로 간주
- 사건·장면 순서가 원작과 비슷하다는 이유로 감점
- 최소 어휘·의미·구조 거리 목표를 강제
- 겹침 탐지 뒤 자동 재작성
- Rail이 없다는 이유로 사용자에게 새 기획서를 다시 요구
- `brief.md`와 같은 내용을 별도 `project_pitch.md`에 중복 작성
- 매 회차 승인 전까지 다음 회차를 영구적으로 금지

실제 원문 예문은 로컬 비공개 묶음에 원문 그대로 둔다. Writer는 한
회차에 필요한 이야기·문체 예문만 읽는다. 원작 대비 리포트는 유지한 것과
변주한 것을 보여 주되 초고 저장, 상업성 평가, 사람 검토 진입을 막지
않는다.

문체 통계는 지시와 비교 자료다. 문장 길이를 맞추느라 훅, 지급, 대화의
압력, 장면의 결과를 약화시키면 그 후보는 탈락한다. 정합성 경고도 실제
독자 신뢰를 깨는 모순이 아니라면 자동 수정 근거가 아니다.

## 실패 원자성·비용·HIL

상업성 우선은 손상된 상태로 계속 쓰라는 뜻이 아니다. 자동 보완은 Book
write lock 안에서 임시 산출물을 만든 뒤, 모든 schema 검증이 끝났을 때
한 번에 저장한다.

- Rail 자동 생성 실패 시 chapter 파일과 index를 만들지 않음
- 변형 지도·이야기/문체 팩 설치·해시 확인 실패 시 예문 없는 대체 집필을
  몰래 하지 않음
- Polishing 후보는 현재 원고를 덮지 않고 별도 후보 경로에 저장
- 사람이 apply하기 전에는 현재 회차 본문과 truth를 바꾸지 않음
- 423만 자 전체를 매 회차 prompt에 넣지 않고 한 번 색인 후 3개 예문만 검색
- HIL 재시도에서만 최대 5개 예문까지 확대

이 조건은 창작 철학을 제한하기 위한 것이 아니라, 선택한 레퍼런스가 실제
Writer 입력으로 들어갔다는 사실과 현재 원고가 사람 승인 전 보존된다는
사실을 보장한다.

## 1. Reference Lab 레퍼런스 변형 팩

### 추적 메타 팩

제안 위치:

```text
edge_repos/firefly_reference_lab/
  inkos_handoffs/doksik-chaebol3-transformation-pack/v1/
    reference-pack.json
    transformation-contract.schema.json
    receipt.json
    README.md
```

Git에 남기는 `reference-pack.json`은 다음을 포함한다.

- 원천 작품 ID, 751화 SHA-256, 회차 수
- 131개 Gold Arc와 관리자 QA 상태
- 전작 통계와 5개 시기별 통계
- 751화 전수 이야기 검색 인덱스와 131개 Arc→회차 범위
- 문체 예문 ID, 원천 회차, 원천 Arc, 장면 기능, 예문 SHA-256
- 주축으로 유지 가능한 Spine·Engine·Payoff·Emotion·Hook 자산
- 표면 선택 변주와 연동 변주의 계약
- Writer 검색 규칙
- 단계별 공통 문체 지침
- 연결된 비공개 예문 묶음 SHA-256

원문 본문은 이 메타 팩에 넣지 않는다. 이는 Writer에게 원문을 숨기기
위한 조치가 아니라, 기존 `private_sources/` 비커밋 원칙을 유지하면서
실제 사용 바이트를 해시로 결속하기 위한 저장 경계다.

### 비공개 실제 이야기·문체 입력 팩

제안 위치:

```text
edge_repos/firefly_reference_lab/
  exports/reference-packs/doksik-chaebol3-ko-v1/
    story-index.jsonl
    style-examples.jsonl
    index.json
```

`exports/`는 계속 Git ignored다. 예문 본문은 원문 그대로 보존한다.

- `story-index.jsonl`: 751화 전수를 원천 SHA와 line/byte 범위로 색인하고,
  각 회차의 Gold Arc, 시작 조건, 실제 인물·조직·물건·수치·행동·지급·
  다음 압력을 연결
- `style-examples.jsonl`: 5개 시기마다 `entry | escalation | payoff` 3개씩,
  기본 15개 실제 문체 예문
- 이야기 입력은 변형 지도에 매핑된 원천 회차의 실제 raw 구간을 그때그때
  읽고, 문체 입력은 같은 시기·기능의 실제 본문을 함께 사용
- 실제 본문은 요약·익명화·재작성하지 않고 보존
- 각 항목은 원천 회차·Arc·line/byte 범위·기능·본문 SHA-256을 가짐
- 제목 표식은 문체 입력에서 제외하고 회차 본문은 유지

이야기 검색 커버리지는 처음부터 751/751로 둔다. 문체 기준 예문만 15개로
제한한다. 회차 내부를 임의로 추상화하거나 문장을 재작성하지 않는다.
전작 통계는 751화 전체를 사용하고, 원천 구간 선택은
`chapter_map.csv`, `arc_map.csv`, `arc_pacing.csv`, `surfaceRefs`의 실제
단계·인물·물건·수치·긴장·보상·훅 근거를 사용한다.

### 작품별 변형 지도

Reference Pack 자체는 여러 작품에서 재사용하되, InkOS Book마다
`reference_transformation.json`을 만든다.

```json
{
  "spineReference": "doksik-chaebol3",
  "supportingReferences": [],
  "sourceSegments": [
    {
      "sourceArcIds": ["<gold-arc-id>"],
      "sourceChapterIds": ["<chapter-id>"],
      "targetRailAnchorIds": ["<rail-anchor-id>"],
      "targetArcIds": ["<arc-id>"],
      "retain": ["engine", "event-order", "payoff", "hook"],
      "varySurface": ["people", "organization", "object", "local-cause"],
      "linkedConsequences": ["money", "evidence", "procedure", "role", "result"]
    }
  ]
}
```

이는 원작과의 거리를 증명하는 표가 아니다. 원작의 어떤 상업 자산을
신작의 어느 Rail·Arc·회차에 옮겼는지 증명하는 제작 지도다. Writer는
현재 회차에 매핑된 원천 구간을 우선 검색하며, 매핑이 없는 임의 Gold
구간을 섞지 않는다.

### 선택 규칙

현재 신작의 진행률로 5개 원천 시기 중 하나를 고르고, chapter memo와
활성 Arc에서 회차 기능을 판정한다.

- 새 목표·새 판 진입: `entry`
- 상대 압박·실행·협상: `escalation`
- 공개 역전·계약·권한·관계 지급: `payoff`

Writer의 이야기 입력은 변형 지도에 매핑된 원천 회차 1~3개에서 현재
장면 기능에 해당하는 실제 구간을 가져온다. 문체 입력은 같은 시기의 세
기능 예문 각 1개다. 특정 기능이 분명하면 같은 기능 2개와 인접 기능 1개를
쓴다. 한 번에 원천 전체나 문체 예문 15개 전부를 보내지 않는다.

## 2. InkOS 레퍼런스 팩 저장과 Writer 주입

### 프로젝트 저장

제안 위치:

```text
.inkos/reference-packs/<pack-id>/reference-pack.json
.inkos/reference-packs/<pack-id>/story-index.jsonl
.inkos/reference-packs/<pack-id>/style-examples.jsonl
books/<book-id>/story/reference_transformation.json
books/<book-id>/story/style_binding.json
```

`style_binding.json`은 `packId`, 공개 팩 SHA, 비공개 예문 팩 SHA,
적용 방식과 결속 시각만 가진다. 기존 `style_guide.md`와
`style_profile.json`은 하위 호환 fallback으로 유지한다.
`reference_transformation.json`은 주축/보조 출처와 source→target 매핑의
작품별 정본이다.

### Writer 입력

Writer는 기존 작품 캐논과 Arc 문맥 다음에 두 구획으로 실제 예문을 받는다.

- `REFERENCE STORY EXAMPLES`: 사건 순서, 역할, 압박, 선택, 물증, 지급,
  관계 변화, 마지막 프레임
- `REFERENCE STYLE EXAMPLES`: 문장 호흡, 문단 밀도, 대화 간격, 묘사와
  판단의 교대, 장면 전환 리듬

이 구획에는 다음 경계를 명시한다.

- 변형 지도에서 `retain`으로 고른 사건·역할·순서·보상은 적극 재사용
- `varySurface`로 고른 표면은 현재 Book 값으로 바꾸고 연동 결과도 갱신
- 예문의 실제 표면은 참고 근거이며 매핑 없이 현재 작품 정본으로 승격하지 않음
- 현재 작품의 brief, book rules, Arc, truth가 내용 권위
- 상업적 장면 결과와 독자 보상을 문체 수치보다 우선

예문은 수정 없이 들어간다. Writer 앞단에서 인명이나 표면 표현을
치환하지 않는다.

### 한국어 분석 수정

현재 CLI `style analyze/import`가 분석 언어를 전달하지 않아 기본 `zh`로
계산될 수 있다. 구현 시 다음을 고친다.

- `style analyze --lang ko`
- `style import`는 대상 Book 언어를 기본값으로 사용
- 전체 코퍼스와 회차 비교에는 raw TTR 대신 고정창 MATTR 사용
- `topPatterns` 같은 원작 인명 포함 필드는 통계 요약에서는 제외하되,
  이야기·문체 예문의 실제 표면은 별도 구획으로 그대로 전달
- Writer의 한국어 문체 통계 레이블을 한국어로 출력

이 수정은 실제 예문 주입을 대체하지 않는다.

## 3. 상업성 우선 후보 판정

후보 순위는 다음 순서로 판정한다.

1. 첫 장면 진입 속도와 현재 갈등
2. 주인공의 구체적 선택과 상대 대응
3. 회차 안에서 확인되는 돈·권한·정보·관계·평판 보상
4. 화말의 다음 행동 또는 더 큰 압력
5. 매핑된 원천의 사건 엔진·압박·지급·훅 보존
6. 선택한 표면과 연동 인과의 일관성
7. 원천 예문과의 문장·문단·대화 리듬 재현
8. 세부 문체 통계

정본·돈·증거·역할·상태 모순은 후보 탈락 조건이다. 일반적인 장르 표현,
유사한 사건 종류와 순서, 같은 보상 축, 원천과 가까운 장면 기능, 문장
길이 편차는 탈락 조건이 아니다. 원천과 다르다는 이유만으로 가점을 주지
않고, 원천과 가깝다는 이유만으로 감점하지 않는다.

상업성 판정은 최종 `overallScore` 하나에 묻지 않고 최소 다음 근거를
별도 기록한다.

- opening pressure
- protagonist agency
- resistance quality
- visible payoff
- ending propulsion
- reference engine retention
- transformation integrity
- style fidelity

문체 충실도가 높아도 visible payoff나 ending propulsion이 약한 후보는
선택하지 않는다.

## 4. 변형 비교 리포트와 Polishing HIL

변형 비교는 집필 차단기가 아니다. 초고가 `ready-for-review`에 들어갈 때
비공개 원천과 비교해 무엇을 유지하고 무엇을 바꿨는지 사람에게 보여 줄
리포트를 만든다.

제안 위치:

```text
books/<book-id>/chapters/.reviews/<chapter>/transformation-comparison.json
books/<book-id>/chapters/.candidates/<chapter>/<candidate-id>.md
books/<book-id>/chapters/.candidates/<chapter>/<candidate-id>.json
```

리포트는 다음을 기록한다.

- 생성 원고 위치와 source→target 변형 지도 항목
- 원천 예문 ID·회차·Arc와 목표 회차·Arc·Rail 앵커
- 유지된 사건 엔진·역할·순서·압박·지급·훅
- 선택 변주된 인명·조직·소품·공간·국소 원인
- 돈·증거·절차·역할·결과의 연동 변주 상태
- 참고용 겹친 문자열 또는 연속 어절 위치
- 상태 `unreviewed | accepted | polish-requested`

리포트가 있어도 초고를 삭제·차단·자동 수정하지 않는다. 의미·구조
유사도는 위험 점수가 아니라 **의도한 엔진 보존 증거**로 표시한다. 문장
겹침도 정보로만 보여 주며 자동 기준치와 자동 rewrite를 두지 않는다.

Polishing HIL은 세 단계다.

1. `prepare`: 사람이 선택한 표면 또는 문장만 대상으로 수정 후보 생성
2. `compare`: 현재 원고, 후보, 변형 지도, 원천 예문, 상업성 판정을 함께 표시
3. `apply | reject`: 사람 명령이 있을 때만 현재 원고 교체 또는 후보 폐기

기존 `revise --mode polish`는 결과를 바로 적용할 수 있으므로 그대로 HIL
후보 생성기로 재사용하지 않는다. 내부 Reviser를 호출하되 별도 후보
저장·적용 계약을 둔다.

## 5. Rail·레퍼런스 팩 자동 보완

### Book 정책

Firefly가 만드는 장편 Book에는 다음 정책을 명시한다.

```json
{
  "writing": {
    "reviewMode": "manual",
    "railPolicy": "auto-required",
    "referencePolicy": "auto-required",
    "referencePackId": "doksik-chaebol3-ko-v1",
    "spineReference": "doksik-chaebol3"
  }
}
```

범용 InkOS의 기존 Book은 필드가 없으면 현재 optional 동작을 유지한다.
Firefly 장편만 자동 보완 정책을 사용한다.

### 중앙 preflight

모든 새 회차 경로는 `PipelineRunner`의 같은 preflight를 통과한다.

1. 지정 레퍼런스 팩과 `spineReference` 결속 확인
2. 없지만 프로젝트에 설치돼 있으면 자동 결속
3. 설치본이 없거나 해시가 다르면 원고 생성 전 실패
4. 작품별 `reference_transformation.json` 확인 또는 초안 자동 생성
5. ready Rail과 활성 Arc 결속 확인
6. Rail이 없으면 주축 Gold의 성장·압박·지급 사다리를 기존 `brief.md`,
   `book_rules.md`, 현재 truth, 활성 Arc에 맞춰 압축·재배치한 얇은 Rail 생성
7. 활성 Arc가 없으면 첫 1~3화 Arc와 Rail을 함께 생성
8. schema·Book ID·source→target coverage·200화 capacity를 검증한 뒤
   원자적으로 저장
9. 검증 성공 뒤에만 Writer 실행

자동 Rail은 A-Rail 6개를 사용한다. 가까운 2개만 compound로 쓰고,
나머지 4개는 `irreversibleChange`, `readerDebt`, `payoffAxis` 중심의 sparse
앵커로 둔다. 먼 B-Rail을 가짜 회차 내용으로 채우지 않고 capacity
reservation으로 200화 수용량을 증명한다. 751화를 200화로 기계 등분하지
않고 Gold Arc의 자연 경계와 보상 간격을 기준으로 압축한다. 압축 과정에서
지급 장면을 삭제하거나 여러 결산을 한 문장으로 뭉개지 않는다.

현재 `assertChapterProductionReadyWithinBookLock`의 legacy fail-open은
optional Book에만 남긴다. `auto-required` Book은 손상된 Rail을 무시하고
쓰지 않는다. 누락은 자동 생성하고, 생성 불능만 실패한다.

### HQ Dispatcher

현재 `approvedInputs`는 Git blob만 검증하므로 Git ignored 실제 예문 팩을
전달할 수 없다. WorkOrder v1에 optional `privateInputs`를 추가한다.

각 private input은 다음을 가진다.

- 등록된 source repo
- repo 내부 상대경로
- 실제 파일 SHA-256
- 역할
- 해당 SHA를 선언한 tracked `approvedInputs` receipt 참조

Dispatcher는 symlink·repo 탈출을 거부하고 실제 바이트 SHA와 tracked
receipt 선언이 모두 맞을 때만 InkOS `reference-bind` capability에 전달한다.
원문 내용은 RunReceipt에 복사하지 않고 경로, SHA, 역할만 남긴다.

InkOS 자체 preflight가 실제 자동 보완 주체다. HQ는 같은 상태를 사전
확인하고 결과의 `referencePackId`, `spineReference`, 변형 지도 SHA,
`railPlanSha256`, `arcId`, 자동 생성 여부를 RunReceipt에 기록한다. HQ가
변형 지도, Rail, 원고 내용을 직접 작성하지 않는다.

## 6. 현재 신작 적용

대상:

```text
books/처가에서-쫓겨난-날-재벌가가-나를-찾았다
```

적용 순서:

1. 기존 공식 backup `20260825-160835` 확인
2. 기존 `brief.md`를 기획 입력 정본으로 사용
3. `book_rules.md`의 서술 시점을 3인칭으로 명시
4. 《독식하는 재벌 3세》를 `spineReference`로 고정
5. 현재 brief·Arc와 대응하는 원천 Gold Arc·회차를 선정해
   `reference_transformation.json` 초안 생성
6. `doksik-chaebol3-ko-v1` 공개·비공개 이야기/문체 팩 결속
7. 현재 활성 Arc `유아식 한 대의 역전`을 첫 active B에 결속
8. 주축 Gold의 초반 Entry·압박·지급 리듬을 압축한 6개 A 앵커와 capacity
   reservation을 가진 ready Rail 검증
9. 현재 1화는 baseline으로 보존
10. 실제 원문 이야기·문체 예문을 사용한 후보 A와 상업성 자유도를 더 준
    후보 B 생성
11. baseline/A/B를 상업성·엔진 보존·변형 정합성 우선으로 비교
12. 가장 강한 한 후보만 Polishing HIL 검토 대상으로 표시
13. 현재 원고를 자동 승인하지 않고 2화를 쓰지 않음

후보 B도 brief, book rules, 현재 Arc와 정본을 바꿀 수 없다. 하지만 기존
장면 순서와 문장만 보존하는 `style-only` 수정에 갇히지 않고, 더 빠른
진입·강한 상대 대응·명확한 지급을 위해 장면 구성을 바꿀 수 있다. 이때
원천 엔진을 의도 없이 제거한 후보보다 원천의 검증된 장면 순서와 지급을
잘 살린 후보를 우선한다.

## 7. 위험과 대응

### 진짜 위험

- **과잉 추상화:** 실제 인물·조직·물건·수치·행동을 카드 문구로 축소해
  상업 장면의 촉감이 사라짐 → 이야기 예문과 `surfaceRefs`를 Writer에 전달
- **다중 Spine 혼선:** 여러 Gold의 장기 약속을 섞어 성장선과 보상 리듬이
  흔들림 → 주축 하나 고정, 보조는 역할 슬롯 단위 opt-in
- **얕은 치환 모순:** 회사명·업종·물건만 바꾸고 계약·증거·절차·돈이
  원작 값에 남음 → 장면 묶음의 `linkedConsequences` 검증
- **단계 오매핑:** 원작 후반의 국가급 지급을 신작 초반에 당겨 성장 사다리
  붕괴 → Gold Arc 단계와 target progress를 함께 결속
- **751→200 과압축:** 중간 소지급과 저항을 삭제해 결과만 나열 → 자연 Arc
  경계와 지급 간격을 기준으로 압축하고 각 앵커에 visible receipt 유지
- **문체만 복제:** 리듬은 닮았지만 사건 압박과 보상이 약함 → 후보 판정에서
  engine retention과 visible payoff를 style fidelity보다 앞에 둠

### 위험으로 취급하지 않는 것

- 원작과 사건 종류·순서·역할·보상 구조가 비슷함
- 장르 관습이나 의미 구조가 가까움
- 실제 역사 사건·기업을 동일하게 사용함
- 사람 검토자가 의도한 표면을 그대로 채택함
- 구조를 유지한 결과 독창성 거리 점수가 낮음

### 기존 문서 정렬 필요

현재 Reference Core와 Gold Card는 구조 라우팅을 적극 허용하지만 `직접 전사
금지`를 문장·고유명 중심으로 강하게 표현한다. InkOS Writer의 한국어
프롬프트에도 레퍼런스를 복사하지 말라는 일반 문구가 있다. 구현 단계 A/B에서
이를 다음 운영 언어로 정렬한다.

- 원작 입력을 숨기거나 약화하지 않음
- 구조·사건 순서·역할·보상·실제 표면의 참고와 재사용을 감점하지 않음
- 문장·고유명도 Writer 입력에서는 그대로 제공
- 출력은 자동 거리 확보 없이 변형 비교 HIL로 전달
- 최종 채택·polish 여부는 사람 결정

이 문서 정렬은 계획 승인 후 각 소유 레포에서 별도 diff와 테스트로 한다.
이번 계획 보강에서는 자식 문서를 수정하지 않는다.

## 8. 구현 순서와 Git 경계

### 단계 A: Reference Lab

- 현재 미커밋 통계 전용 초안 2개를 이 계획에 맞춰 교체
- 전작 통계·단계별 이야기/문체 예문 선택기 구현
- tracked reference pack과 ignored 실제 예문 팩 생성
- 작품별 transformation map schema·검증기 구현
- Reference Core·Gold Card의 출력/HIL 언어 정렬
- source/Gold/예문 SHA 검증기와 테스트 추가
- Reference Lab 단독 커밋·푸시

### 단계 B: InkOS

- reference pack과 transformation map schema/store/binding/retrieval 구현
- 한국어 style CLI 수정
- Writer 실제 이야기/문체 예문 prompt 주입
- 상업성 판정 필드 추가
- transformation comparison과 Polishing HIL 후보 저장·적용 구현
- 한국어 Writer의 포괄적 복사 금지 문구를 reference-derived 계약으로 정렬
- Firefly Book 자동 reference/Rail preflight 구현
- Core·CLI·Studio 검증 후 InkOS 단독 커밋·푸시

### 단계 C: HQ

- manifest에 `reference-bind` capability와 Firefly 장편 기본 정책 선언
- WorkOrder `privateInputs`와 검증·receipt 추가
- Dispatcher preflight 결과 집계
- HQ 테스트·문서 갱신 후 parent 단독 커밋·푸시

### 단계 D: 로컬 제작 카나리

- 전체 레퍼런스 팩과 작품별 변형 지도 설치·결속
- Rail 자동 보완 실제 실행
- 1화 후보 A/B 생성·비교
- 최선 후보를 사람 검토 대기로 남김
- `books/**`는 기존대로 Git ignored 상태 유지

자식 커밋과 push를 먼저 완료한 뒤 parent가 실제 자식 SHA를 가리키게
한다. 어떤 단계에서도 `git add .`로 Git 루트를 넘지 않는다.

## 9. 완료 판정

다음 증거가 모두 있어야 구현 완료다.

### Reference Lab

- 원천 SHA가 현재 751화 합본과 일치
- 751/751 통계 커버리지
- 131/131 Gold Arc 커버리지
- 751/751 이야기 검색 인덱스와 실제 raw 구간 조회 검증
- 5개 시기 × 3개 기능 = 실제 문체 원문 예문 15개
- 각 예문 본문 SHA와 private bundle SHA 검증
- tracked 팩에는 원문 본문이 없고 private bundle에는 실제 본문이 있음
- 주축 상업 엔진과 선택/연동 변주 계약이 기계 판독 가능

### InkOS

- 한국어 style 분석이 `ko` 단위로 실행됨
- Writer prompt fixture에서 매핑된 원천 회차의 실제 이야기 구간과 문체
  예문 바이트가 확인됨
- 회차 진행률·기능에 따라 예문 선택이 달라짐
- source Arc/회차→target Rail/Arc/회차 매핑이 fixture에서 확인됨
- 원천 엔진 보존이 후보 판정에서 긍정 근거로 기록됨
- 최소 어휘·의미·구조 거리와 자동 유사성 감점이 없음
- 문체 편차만으로 초고가 차단되지 않음
- 변형 비교 리포트가 유지·변주·연동 결과를 모두 표시함
- 문장 겹침이 있어도 리포트만 생기고 원고는 유지됨
- Polishing `prepare`가 현재 본문을 바꾸지 않음
- 사람 `apply` 때만 후보가 버전 보존 후 반영됨
- legacy optional Book 동작은 유지됨
- Firefly Book의 Rail 누락은 자동 생성됨
- 자동 생성 실패 시 chapter와 index가 변하지 않음

### HQ

- private input의 repo 경계·symlink·SHA·tracked receipt 검증
- 원문 본문이 WorkOrder/RunReceipt에 복사되지 않음
- 실제 InkOS가 실행 주체로 남음
- receipt에 주축/보조 레퍼런스·변형 지도·Rail·Arc provenance가 기록됨
- idempotency와 Book lock이 기존처럼 유지됨

### 현재 작품

- 200화 capacity를 만족하는 ready Rail
- 활성 B와 현재 Arc의 정확한 결속
- `doksik-chaebol3-ko-v1` 전체 이야기/문체 팩 결속
- 《독식하는 재벌 3세》 source→target 변형 지도 결속
- baseline/A/B 상업성·엔진 보존·변형 정합성 비교 기록
- 최선 1화 후보 1개가 사람 검토 대기
- 승인 0, 2화 신규 생성 0
- 기존 baseline과 backup 복구 가능

### Git

- parent와 수정된 각 child worktree clean
- 각 HEAD가 각자의 upstream과 일치
- Reference Lab, InkOS, HQ의 테스트·typecheck·`git diff --check` PASS
- Market Radar 변경 없음

## 10. 비범위

- 원천 751화를 Git에 커밋
- 원천 예문을 Writer 전에 익명화·요약
- 독창성 최대화나 원작과의 거리 확보
- 최소 어휘·의미·구조 차이 점수
- 사건·장면·보상 순서를 다르게 만들기 위한 강제 변형
- 의미 유사성 자동 차단
- 표면·문장 겹침 자동 재작성 또는 자동 거절
- 후보 자동 인간 승인
- 현재 목표에서 2화 집필
- 모든 InkOS Book에 특정 작가 문체를 전역 적용
- 기존 `brief.md`와 같은 내용의 기획서 중복 생성
- 장기 Rail을 회차별 세부 사건으로 선작성

## 11. 구현 영수증

### 고정된 코드와 입력

- Reference Lab: `742a7eb6bd480a209f41eeb3e1a8c9bb1f8cd75e`
- InkOS reference flow: `7cf2616684f5280f36e02a7e40e17701e3d74709`
- InkOS Writer 정책 우선순위 보강: `d7d5a523`
- InkOS reference state hash 영수증: `d3a9e5a7`
- Reference pack: `doksik-chaebol3-ko-v1`
- tracked pack SHA-256:
  `ff8365b632fd85519f4dc5e1f51e1d36b3aaba8015de23427b0bb4dee954d57d`
- raw source SHA-256:
  `66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45`
- 751화 story index SHA-256:
  `821df0df9eb2f42dae8fac003f857c72bdcdf23cfc40c821fd19895540232043`
- 15개 style examples SHA-256:
  `6895542335651ff5df31fe54197e5080bb5935161819347b876e37d7d97b6e9b`

Reference Lab의 이전 통계 전용 미커밋 초안은 채택하지 않았다. 이야기
검색·실제 예문·변형 지도 계약을 가진 새 생성기와 테스트로 교체했다.

### HQ 실제 결속

- WorkOrder: `wo-doksik-reference-bind-canary-20260826`
- 최초 생성 RunReceipt: `rr-6ba281cb6f9befde0a96757d`
- 최종 계보 RunReceipt: `rr-62576fdaf59eceef32f9574f`
- 상태: `succeeded`, 사람 승인: `pending`
- InkOS HEAD 전후 동일, tracked worktree unchanged
- tracked pack 1개와 private input 3개 모두 검증됨
- active Arc:
  `arc-20260825145804-3920dd82-5b16-4de0-b5fb-2fe34b8d8d42`
- source chapter `1,2,3` → `A1-entry-proof` → 현재 Arc 매핑 생성
- 200화 capacity를 가진 ready 6-anchor Rail 생성
- preflight 재실행 시 transformation/Rail 추가 생성 없음
- transformation SHA-256:
  `6360a2c19b0637335d2e826f872f88053809074cef2b3be3ee8eb75e4c9c9ade`
- Rail plan SHA-256:
  `becc38d468cec17fec98952aae5e2fc723e3fc4304a884c0f159950fc1de323a`

### 1화 카나리

baseline, candidate A, candidate B를 같은 Arc와 Reference Context로 비교했다.
상업성 다섯 축 70%, 원천 엔진·변형·문체 세 축 30%로 합산했다.

| 원고 | 종합 | 오프닝 | 주도성 | 저항 | 지급 | 훅 | 엔진 | 변형 | 문체 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 89.1 | 91 | 88 | 87 | 84 | 90 | 95 | 92 | 90 |
| candidate A | 90.5 | 88 | 94 | 85 | 95 | 91 | 93 | 92 | 89 |
| candidate B | 92.3 | 93 | 95 | 91 | 94 | 94 | 92 | 91 | 93 |

candidate B `마지막 출고`를 HIL `prepared/unreviewed`로 남겼다. 기존 1화는
교체하지 않았다.

- candidate ID: `doksik-canary-b-20260826`
- 기존 1화 SHA-256:
  `d6abb814d668d06c50149ef49738b906face33998091108a2e0718d5fefcd5f8`
- 후보 SHA-256:
  `74a6ca59d2aae0c1c1b56e752ecfa1d24a1cbe282129bd1b83bed765fffad2c5`
- exact 12-token surface matches: 0
- similarity penalty: false
- automatic rewrite: false
- 실제 2화 파일: 0

사람 검토에서는 원본 운송지시서 반출을 사본·봉인 절차로 정리하고, 아직
처분권이 없는 도윤의 `청라물류 책임자` 선언을 첫 실적 뒤의 권한 요구로
정리하며, 한태석 측의 재고 인지 경로를 한 줄 보강하면 된다. 이는 후보
자동 수정이나 자동 승인 사유가 아니다.

### 보수 규칙 추가 감리

실제 Book의 `style_guide.md`에 있던 포괄적 재사용 금지 문구를 발견했다.
Book 로컬 지침은 reference pack의 사건 엔진·순서·역할·지급·훅과 실제
예문을 적극 쓰고 최종 표면 채택은 HIL에서 결정하도록 정렬했다. 서술 시점은
기존 `style_guide.md`와 맞춰 `3인칭 제한 시점, 강도윤 중심`으로 명시했다.

코드에서는 결속된 Reference Context를 일반 사용자 입력이 아니라 Writer
system policy 마지막에 붙인다. 기존 문체 지침보다 reference-derived 계약이
명시적으로 우선하며 원천 본문은 Writer에게 실제 바이트로 전달된다.

### 검증

- Reference Lab 생성기: 751화, Gold Arc 131개, style example 15개 PASS
- Reference Lab 테스트: 4/4 PASS
- Reference Core validator: PASS
- InkOS core 전체: 205 files, 2,123 tests PASS
- InkOS 추가 Writer/reference 회귀: 15/15 PASS
- InkOS Core·CLI typecheck/build: PASS
- HQ 테스트: 15/15 PASS
- HQ manifest validate: PASS
- 각 루트 `git diff --check`: PASS
- Market Radar 변경 없음

## 12. 내부 감리 후 최종 경로 보강

앞선 v3 카나리는 Writer의 Reference Context가 system policy로 승격되기 전에
생성됐다. 따라서 위 v3 점수와 candidate B는 역사적 비교 자료로 보존하되,
최종 런타임의 승인 후보로 사용하지 않는다.

내부 감리에서 다음 운영 결함을 확인하고 보강했다.

- `author_intent.md`, `brief.md`, `style_profile.json`의 IMF 승인 1화 전용
  지시를 전작 전체 Reference Pack 계약으로 교체
- active Arc가 `ready`가 아니면 Firefly production preflight를 실패 처리
- active Arc와 정확히 연결된 source segment가 없으면 첫 segment로 폴백하지
  않고 실패 처리
- ready A/B Rail이 active Arc에 결속되지 않으면 실패 처리
- HIL 비교 보고서를 후보별로 보존하고 apply/reject와 같은 원자적 쓰기에서
  `accepted/rejected`로 갱신
- 상업성 다섯 축 평균 70%, reference 세 축 평균 30%를
  `dopamine70-reference30-v1` 코드 산식으로 고정
- `reference-bind`의 Book config, binding, transformation, Rail plan을 InkOS가
  artifact로 보고하고 HQ가 실제 바이트와 SHA-256을 재검증
- bind 후 preflight 실패 시 Book·binding·installed pack을 이전 바이트로 복구

### 최종 governed 카나리 v4

두 후보를 각각 격리된 Book 복제본에서 `PipelineRunner.writeDraft`의 Planner →
Composer → Writer governed 경로로 생성했다. 기존 1화는 생성·평가·HIL 준비
전후 같은 SHA-256이며, 2화는 만들지 않았다.

| 원고 | 종합 | 오프닝 | 주도성 | 저항 | 지급 | 훅 | 엔진 | 변형 | 문체 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 87.2 | 91 | 88 | 88 | 68 | 87 | 94 | 96 | 91 |
| candidate A | 93.2 | 90 | 95 | 93 | 95 | 91 | 97 | 95 | 90 |
| candidate B | 87.6 | 89 | 89 | 88 | 76 | 90 | 93 | 89 | 89 |

최종 사람 검토 후보는 candidate A `마지막 출고`다.

- candidate ID: `doksik-canary-a-20260826-v4`
- HIL 상태: `prepared/unreviewed`
- 기존 1화 SHA-256:
  `d6abb814d668d06c50149ef49738b906face33998091108a2e0718d5fefcd5f8`
- 후보 SHA-256:
  `cada98e7eaf128eaacb56ab08bb3da47ce1e6558e913eefabb1a3d04e38e36c7`
- exact 12-token surface matches: 0
- similarity penalty: false
- automatic rewrite: false
- 실제 2화 파일: 0

사람 polishing에서는 한빛마트 당일 운임 지급의 정산 근거와 한성그룹이
청라 인수 검토 자료에서 배송 기록을 보게 된 정보 접근 경로만 확인한다.
이는 후보 자동 수정·거절 사유가 아니다. 현재 1화 교체는 아직 승인하지
않았다.

### 최종 실행 영수증

- InkOS implementation HEAD: `137afcdeae2e38806193549c97aa924fb43c1e69`
- WorkOrder: `wo-doksik-reference-bind-receipt-20260826-v3`
- RunReceipt: `rr-8ce5a61819d36fa5ff98a831`
- 상태: `succeeded`, 사람 승인: `pending`
- `artifactEvidence`: `child-reported`
- Book config, reference binding, transformation, Rail plan 네 artifact 모두
  InkOS 보고 SHA-256과 HQ 재해시 일치
- tracked worktree unchanged, write scope violation 0, artifact error 0
- InkOS core: 205 files, 2,124 tests PASS
- InkOS CLI: 45 files, 243 tests PASS
- HQ: 16 tests, manifest/status PASS
- Core·CLI typecheck/build와 각 Git diff check PASS
