# Hermes 남성향 장르 Soul 원문 학습 계획

- 작성일: 2026-08-27
- 상태: Soul shell·런타임·Review v2·manager selection·survey 완료 / strict deep-read 5/9 완료·승격 대기
- 범위: 남성향 현대판타지, 판타지, 무협
- 실행 기본값: Hermes와 InkOS에서 실제 호출된 agent 모두 `gpt-5.6-sol / high`
- 프롬프트 정본: [Hermes 남성향 장르 Soul 프롬프트 v1](./2026-08-27-hermes-male-genre-soul-prompts-v1.md)

## 결론

장르 Soul은 원문을 얕게 요약한 장르 상식 모음이 아니다. 승인된 원문을
실제 표면 그대로 읽고, 작품별 독해 기록과 검색 인덱스, 장르 합성 결과를
버전으로 묶은 실행 프로필이다. 여기서 `학습`은 모델 가중치 튜닝이 아니라
`원문 독해 + 근거화 + 검색 가능 자산 + 지속 프롬프트`를 뜻한다.

표면 복사 우려는 입력을 익명화하거나 요약할 이유가 아니다. 원문 인명,
조직, 수치, 대사, 문장 호흡, 사건 배열까지 분석 입력으로 보존한다. 출력이
나온 뒤에만 전체 코퍼스 비교 결과를 HIL에 표시한다. 겹침은 상업성 점수에
합산하지 않고 자동 재작성·자동 거절도 하지 않는다. 현재 Book 캐논에
결속되지 않은 원천 고유명이 유입된 경우만 정본 오류로 처리한다.

세 Soul은 같은 InkOS 저장소를 사용해도 된다. 서로 다른 Hermes 프로필,
Soul 버전, Book ID, 지속 세션 ID, 장르 프로필, reference binding을 사용하면
원고 상태는 섞이지 않는다. HQ가 지시 창구로 남고, Hermes는 장르별 실행을
조율하며, 실제 기획·Arc·Rail·원고·수정은 InkOS가 수행한다.

품질 우선순위는 `도파민·재미와 상업성 > 감정적 정합성 > 레퍼런스 엔진·
문체 재현 > 비핵심 세부 정합성`이다. 감정적 정합성은 욕망, 모욕, 선택,
목격, 보상이 독자가 납득할 순서로 회수되는지를 뜻한다. 돈, 증거 출처,
권한, 생존 상태, 현재 Arc처럼 작품을 깨는 hard contradiction은 이
우선순위와 별도로 0건이어야 한다.

여기서 감정적 정합성은 도덕적 정당성이나 응보를 뜻하지 않는다. `권한`도
극중 인물이 실제로 행사할 수 있는 접근·통제력이지 법적 허가의 동의어가
아니다. 허구 속 범죄, 폭력, 강압, 배신, 착취, 편견, 부당한 승리와 정의가
회복되지 않는 결말은 그 존재만으로 결함이 아니다. 시스템은 Book과
사용자 지시나 확립된 인물·장면 인과가 아니라 외부 도덕 교정만을 위해
훈계, 면책, 합법 대안, 사과, 처벌, 갱생, 균형 장면을 덧붙이거나 지우지
않는다. 수위는 사용자·Book·HIL이 정하며, 새 지시가 없으면 기존 brief,
reference, 작품 톤을 보존한다.

## 정본 관계

이 HQ 문서는 Soul 라우팅, prompt interface, 상태와 승격 조건을 소유한다.
정확한 프롬프트 본문은 companion 문서가 소유한다. Reference Lab은 재고,
작품 독해, 장르 profile과 Gold 근거를 소유하고, 로컬 Hermes registry는
설치된 `SOUL.md`와 실행 config를 소유한다. InkOS는 Writer context와 제작
상태를 소유한다.

- [InkOS v1.8 선택 이식·Production Kernel 구현안](./2026-08-28-inkos-v18-selective-production-kernel-plan.md)은
  Soul을 실제 production에 결속하는 Kernel, execution receipt, Skill binding,
  FTS와 HQ adapter의 구현 순서를 소유한다. 이 문서의 corpus inventory,
  survey, deep-read, genre profile, Review Packet과 Soul 승격 기준은 계속
  유효하다. 아래 P0 목록의 runtime 항목은 새 구현안의 단계·gate 순서를
  우선하며, 두 트랙은 promotion canary에서만 합친다.
- [HQ Dispatcher v1](./2026-08-25-hq-dispatcher-v1.md)은 현재 WorkOrder와
  RunReceipt 경계의 정본이다.
- [상업성 우선 레퍼런스 변형·전작 문체·Rail·HIL 이력](./2026-08-26-commercial-style-rail-hil-implementation-plan.md)은
  실제 원문 예문을 Writer에 전달하고 출력 뒤 HIL에서 표면을 고르는 구현
  선례다.
- [production routing contract](../contracts/production-routing.md)은 HQ,
  Reference Lab, InkOS의 소유권 경계다.
- InkOS의 `HERMES_BULK_USAGE_PLAN.md`는 기존 범용 실행 안전 기준이다. 이
  문서가 장르 Soul 학습 부분만 구체화하며, InkOS의 캐논 소유권은 바꾸지
  않는다.

WorkOrder/RunReceipt v2, BookSoulBinding과 production input receipt가 구현됐고,
HQ는 세 격리 Hermes 프로필의 실제 Soul/config bytes와 `gpt-5.6-sol / high`를
readback한다. 프로필 생성만으로 학습이나 production 승격이라고 보고하지
않는 원칙은 유지한다.

## 현재 확인된 사실

2026-08-27 정적 조사와 2026-08-28 실행 readback 기준이다.

- Drive 정본 경로는 `FF_STUDIO/01_원천_코퍼스/원고들_코퍼스`다.
- 바로 아래 남성향 `_합본.txt`는 398개다. 이 숫자는 재고 수량이며 학습
  완료 수량이 아니다.
- 여성향 374개는 별도 하위 폴더에 있고 v1 범위에서 제외한다.
- 제목 키워드로 얻은 현대판타지 81, 판타지 35, 무협 20은 예비 후보일
  뿐이다. 중복과 장르 겹침을 정리하기 전에는 Soul 입력으로 확정하지 않는다.
- 불완전 합본과 제목 변형 중복 후보가 확인돼 있다. 해시, 회차 수, 끝부분
  파싱을 통과한 정본 하나만 활성 원천으로 삼아야 한다.
- 현대판타지의 첫 앵커 후보는 《독식하는 재벌 3세》다. 전작 751화 분석과
  실제 Writer 예문 결속 경로가 이미 검증돼 있다.
- Reference Lab의 현재 전작 생성기는 위 한 작품의 751화·131 Arc에
  맞춰져 있다. 세 장르 공용 Soul builder가 아니다.
- Reference Lab에는 398개 재고와 32개 로컬 검증본을 결속한 canonical
  private source registry와 tracked receipt가 있다. 관리자가 현대판타지·판타지·
  무협에 3개씩 총 9개를 선택해 `eligibleForSoulInput=true`로 결속했고, 기존
  작품별 절대경로 receipt는 resolver allowlist로 사용하지 않는다.
- 선택된 9개는 UTF-8, replacement character, 지원 chapter marker, 회차 수와
  순차성 gate를 다시 통과했다. 손상·회차 이상이 있던 초기 후보 3개는 입력에서
  제외하고 동일 장르의 검증된 합본으로 교체했다.
- 세 격리 Hermes profile이 9개 합본의 시작·분산 중간·결말 48개 window를
  별도 read call로 읽었다. 실제 `gpt-5.6-sol/high` config, 9 session trace,
  744,526 tokens와 28 API calls를 private receipt로 결속했다. 세 tracked survey는
  원문 없이 source/coverage/observation pointer만 담고, 32개 available 원문 전체와
  대조한 exact 12-token·120-byte scanner에서 모두 zero-match PASS다.
- strict full-work deep-read는 5/9편을 완료했다. 자연 회차 1,226/1,226개를
  각각 별도 Hermes `read_file`로 읽고 원본 바이트와 exact readback을
  검증했으며, 총 40,284,423 tokens와 524 API calls다. gap-free coverage,
  no-compaction trace와 32개 available 원문 대비 tracked projection 누출 0건을
  모두 통과했다. 이는 작품별 독해 완료이지 장르 Soul 합성·manager QA·승격
  완료가 아니다.
- Reference Lab README는 실제 private 원문 전달과 tracked projection의 분리를
  HQ 계약에 맞춰 정렬했다. manager selection은 survey/deep-read 입력 허가일 뿐
  학습 완료나 Soul 승격 근거가 아니다.
- InkOS에는 `modern-fantasy-ko`, `fantasy-ko`, `murim-ko` profile과 세
  versioned Soul이 있으며 실제 loaded byte SHA가 production input receipt에
  결속된다. 아직 deep-read에서 합성된 production Soul은 아니다.
- `inkos write next`, `inkos agent`와 Book-bound
  `inkos interact /write`는 context file을 명령 문자열과 분리해 exact detached
  owner-direction lease로 전달한다. 빈 파일과 non-write interact 사용은
  모델 호출 전에 거절한다.
- `sub_agent(writer)`의 지시는 owner direction과 구분된 model-mediated
  context로 Writer에 전달된다. Soul/Skill input은 host-bound bytes와 receipt로
  결속되고 Reference Pack context는 별도 provenance를 유지한다.
- InkOS `style import`는 파일 하나를 Book 단위 프로필로 덮어쓰는 기능이다.
  다작품 코퍼스 누적 학습기로 사용하지 않는다.
- Reference Pack schema에는 supporting reference가 있지만 현재 retrieval은
  spine source만 사용한다. 기능별 보조 원천은 구현·테스트 전까지 Writer가
  실제 읽는다고 주장하지 않는다.
- 현재 InkOS 표면 비교는 Writer에 주입된 예문을 대상으로 한 12-token
  exact match다. 장르 Soul 전체 코퍼스 비교라고 부를 수 없다.
- 기존 Hermes `firefly-studio`와 `author_*` 프로필은 이번 Soul의 정본이
  아니다. 구 v3 문구와 `terra` 설정을 새 InkOS 운영에 재사용하지 않는다.
- 기존 `firefly-studio` 프로필은 계속 정본이 아니다. 신규 세 candidate
  profile만 `gpt-5.6-sol / high`, skills 0, 격리 Soul/config hash를 통과했다.

### 2026-08-28 안전 중단 체크포인트

- 실행 중인 Hermes와 deep-read runner는 0개다.
- 현대판타지 `gdrive-1SRFbbNIAztKYRIQGzhDdhsEz6BjOOKLM`은 13/15 segments,
  무협 `gdrive-1B5jgTxwxyabDX4N-u-hchbZCP8GS3NfI`은 15/20 segments까지
  ignored immutable attempt와 검증된 `completed.json`이 남아 있다.
- 두 부분 실행은 tracked work-study로 승격하지 않았다. 같은 source ID로
  재실행하면 완료 포인터를 재사용하며, 그 뒤 미착수 현대판타지 751화와
  판타지 300화를 처리한다.
- 현재 5편만 tracked 완료다. genre profile 합성, manager QA, Soul promotion,
  격리 Book path canary와 InkOS canon mutation은 시작하지 않았다.

## 허구 내용 중립 계약과 정적 감리

`fiction-content-neutral-ko/v1`은 장르 취향이 아니라 제작 경로 전체의
불변 계약이다. Architect, Planner, Writer, Auditor, Reviser, Polisher,
commercial/HIL reviewer, blind reviewer가 같은 계약 바이트와 SHA를 받아야
한다.

- 범죄성, 비윤리성, 불쾌감, 편향된 인물·서술자, 부당한 결과만으로 기획,
  장면, 문장, 점수, 승패를 바꾸지 않는다.
- 외부 도덕 교정만을 이유로 훈계, 합법 대안, 면책 설명, 응보, 사과,
  갱생, 피해자 대변, 대표성 균형을 추가하거나 자연스러운 죄책감·용서·
  관계 회복을 삭제하지 않는다.
- 감리는 인물의 욕망과 행동 인과, 장르 효과, 감정적 가독성, 상업적 지급,
  사용자가 정한 수위, 캐논만 본다. 극중 불법은 그 자체로 hard
  contradiction이 아니다.
- 현실적 저항, 죄책감, 용서, 응보, 후속 비용은 확립된 인물 욕망과 사건
  인과에서 자연스럽게 생기거나 Book이 요구할 때 둔다. 악행마다 붙이는
  도덕 부채나 처벌 할당량으로 만들지 않는다.
- 확립된 인물·사건 인과나 Book이 반성, 응보, 구원, 절제를 요구하면 그대로
  구현한다. 내용 중립은 도덕 서사 금지가 아니라 시스템의 무단 도덕
  개입 금지다.
- 수위 상향·하향은 사용자나 HIL의 명시적 지시만 따른다. 명시가 없으면
  기존 톤을 유지하며 임의로 순화하거나 자극하지 않는다.
- 이 계약은 저장소 권한, private source ACL, 개인정보, InkOS 캐논 소유,
  실제 외부 행위나 provider 경계를 넓히지 않는다.

2026-08-27 정적 감리에서 발견한 차단점은 2026-08-28 InkOS HEAD
`44eeaeca508bf3aa6dffb1cf5a6a142e2b2042c8`에서 다시 읽었다. 현재 상태의
정본은 [InkOS fiction-content-neutral runtime](../edge_repos/inkos/docs/2026-08-27-fiction-content-neutral-runtime.md)이다.

| 경계 | 2026-08-27 발견 | 2026-08-28 현재 판정 | Soul 트랙 잔여 |
| --- | --- | --- | --- |
| BookRules provenance | 모델 제안이 owner hard rule처럼 전달될 수 있었음 | 완료·보존 기준선. exact selector, authority/adoption receipt, hard/soft/diagnostic projection과 자동 수정 제한 구현 | 새 Soul·Hermes ingress가 같은 provenance를 우회하지 않는 E2E만 추가 |
| fiction-content-neutral control | 전 agent 계약·SHA와 free-form finding 자동 권위 제한이 없었음 | 완료·보존 기준선. Book-bound 호출, refusal/outcome, creative 자동 수정 경계와 호출 집합 receipt 구현 | 새 Soul/Skill/Pi 경로의 동일 contract byte·SHA 수신 검증 |
| publication compatibility | 민감 표현이 creative pass·수정과 섞였음 | 완료·보존 기준선. `publicationCompatibility` advisory로 분리 | Storyyard·Soul review packet이 이를 상업 점수나 canon gate로 다시 합치지 않는 회귀 |
| 기존 genre profile·Dimension 14 | 성별·도덕 규범과 플롯 기능 자체를 결함화할 수 있었음 | 완료·보존 기준선. 재벌·urban·litrpg 문구와 legacy current-state read projection을 인물 인과·능력 기준으로 정렬 | 신규 세 profile semantic lint에 같은 기준 적용 |
| 신규 한국어 profile | 현대판타지·판타지·무협의 독립 alias/fallback이 없었음 | shell 완료. 세 profile·Soul과 loaded SHA 회귀 구현 | deep-read 합성 뒤 production 승격 필요 |
| Reference Lab `윤리 감리` | Gold 도덕 적합성 gate인지 정의가 불명확 | 미완료 | 원문 인과·후속 비용의 비점수 관찰로 좁히고 Gold 차단·장르 공통 hard rule 승격 금지 |

완료된 네 runtime 경계를 Sol Max가 다시 설계하거나 교체하지 않는다. 선택
이식은 그 경계를 새 ingress와 worker가 실제로 소비했는지만 증명한다.

플랫폼 호환성은 사용자가 특정 출고처를 선택했을 때만 별도 preflight로
계산한다. 결과는 보고서일 뿐 원고를 조용히 순화하거나 creative pass를
실패시키지 않는다. provider가 호출을 거절하면 그 상태와 미변경 캐논을
영수증으로 남기며, 다른 도덕극을 성공 원고처럼 대체하지 않는다.

## 계획 안정성 감리

### 1차: 복사 우려와 원문 입력

초안의 위험은 원문을 먼저 익명화하거나 줄거리 카드로 축약하는 것이다.
그렇게 하면 사건이 장면으로 구현되는 방식, 대사와 행동의 교대, 지급의
구체성, 문단 호흡을 잃는다. Soul은 흔한 장르 문법만 반복하게 된다.

확정안은 원문 바이트를 private input으로 보존하고 실제 구간을 분석
프롬프트에 넣는 것이다. Git 정본에는 원문 대신 source ID, SHA-256,
회차·byte 범위, 파생 분석과 독해 영수증을 남긴다. 저장 경계는 입력 축소가
아니다.

### 2차: 전작 재독과 비용

매 작업마다 398개 합본을 다시 읽는 안은 비용이 크고 실행 결과도
재현하기 어렵다. 반대로 첫 1~3화만 읽고 전작을 대표하는 안은 결말 지급,
후반 권력 변화, 장기 반복 동사를 놓친다.

확정안은 한 번 만든 결정론적 목록·해시·회차 인덱스를 재사용하고,
`전체 재고 분류 -> 장르 후보 전작 분산 독해 -> 앵커 전수 독해 -> 장르
합성 -> 작품별 retrieval` 순서로 비용을 나누는 것이다. 해시·구간 분리는
결정론적 도구가 맡고 `sol-high`는 판정, 독해, 비교, 합성에만 쓴다.

### 3차: Soul 수와 문체 평균화

재벌, 헌터, 연예계, 영지, 아카데미, 정파, 사파마다 Soul을 먼저 만들면
프로필 수가 작품 수처럼 늘어난다. 여러 작가 문체를 장르 평균으로 만들면
어느 작품과도 닮지 않은 밋밋한 문체가 된다.

v1은 `현대판타지 | 판타지 | 무협` 세 Soul만 둔다. Soul은 주인공 운용,
압박, 보상, Arc, 독자 약속 같은 장르 prior를 담당한다. 실제 작품에는
`spineReference` 하나와 `styleBinding` 하나를 고르고, 보조 레퍼런스는
기능별로만 붙인다. 《독식하는 재벌 3세》의 전반 문체는 현대판타지 Soul의
평균 문체가 아니라 해당 Book의 style binding이다.

### 4차: HQ와 실행 주체

HQ가 장르 분석과 Writer 프롬프트까지 직접 만들면 사용자는 HQ가 원고를
쓰는 것으로 느낀다. Hermes가 InkOS 파일을 직접 수정하면 실행 주체 분리는
이름만 남는다.

확정안은 다음 경계다.

```text
사용자/HQ 지시
  -> 장르별 Hermes Soul이 근거·작업 의도·reference routing 구성
  -> HQ가 검증된 WorkOrder로 InkOS 호출
  -> InkOS가 Book·Arc·Rail·Chapter 실행
  -> Storyyard가 후보와 HIL을 투영
  -> 사람 결정
  -> InkOS만 승인 결과 적용
```

Hermes는 InkOS 성공을 추정하지 않는다. 실제 Book artifact와 RunReceipt를
읽고 종료한다. Soul 독해 단계에서는 Book, Rail, Arc, 원고를 만들지 않는다.

### 5차: 그래프 런타임

세 Soul 도입만으로 그래프 런타임을 먼저 만들 필요는 없다. 현재 필요한
것은 단계 상태, artifact hash, 지속 session ID, 실행 영수증이다. 아래 상태
머신으로 재개와 감사를 검증한 뒤, 병렬 작업·부분 재실행·승인 분기가 실제
병목이 될 때 그래프 런타임을 검토한다.

4차와 5차 재검토에서도 `원문 입력 보존`, `작품별 앵커`, `InkOS 캐논
소유`, `출력 뒤 사람 HIL`은 바뀌지 않았다. 이 네 항목을 구현 중 바꾸려면
계획 변경으로 기록한다.

### 6차: 허구 내용 중립

상업성 우선 문구만으로는 도덕 교과서화를 막지 못한다. 실제 InkOS에는
Architect가 만든 금지·대가·성장을 Book 규칙으로 굳히는 경로, 민감 표현
creative gate, 성별 장르 금지, 정의 없는 dimension 14가 남아 있었다.

확정안은 범죄·비윤리성 자체를 허용 문구로만 선언하는 데서 끝내지 않는다.
Book rule provenance와 강도, 전 agent 계약 SHA, creative critical code,
출고 preflight 분리, 실제 후보 content-neutral hard gate를 함께 구현한다.

### 7차: provenance와 우회 경로 red-team

모델이 새 금지를 `premise/hard`로 재라벨하거나 BookRules 밖 story frame과
role에 대가·속죄를 강제하면 6차 계약을 우회할 수 있다. fixture만 통과하고
실제 Soul 후보가 도덕화된 채 상업 점수로 승격되는 경로도 있었다.

최종안은 source selector·text SHA·owner adoption receipt를 host가 소유하고,
실행 참여 invocation과 contract receipt의 set equality를 검증한다. 실제 Soul
후보 세 개 모두 content-neutrality를 별도 hard gate로 통과해야 한다.
7차 재검토 뒤에도 `도덕 서사 자체는 허용`, `무단 도덕 개입은 금지`,
`수위는 사용자 권위`, `실제 보안·권한 경계는 유지`라는 네 결론은 바뀌지
않았다.

## Soul과 실행 프로필

| Hermes profile ID | Soul ID | 책임 | 초기 앵커 |
| --- | --- | --- | --- |
| `inkos_male_modern_fantasy` | `male-modern-fantasy-ko` | 현대 사회의 자산·직업·기업·지위 상승, 가시적 지급과 인정 | 《독식하는 재벌 3세》 포함 Gold 후보 |
| `inkos_male_fantasy` | `male-fantasy-ko` | 이세계 권력·성장·영지·조직, 능력의 사용과 보상 확대 | 코퍼스 조사 뒤 확정 |
| `inkos_male_murim` | `male-murim-ko` | 문파·세가·강호 위계, 무력·명분·평판·복수의 지급 | 코퍼스 조사 뒤 확정 |

세 프로필의 Hermes 기본값은 `gpt-5.6-sol / high`다. InkOS 내부 agent가
다른 모델 설정을 쓰면 Hermes 설정은 자동 승계되지 않는다. 고정된 agent
이름을 미리 영수증에 채우지 않고, 실제 실행 trace에서 호출된 agent 전체의
이름, model, reasoning, invocation count를 수집한다. 카나리에서 호출된 agent
중 하나라도 목표와 다르면 실패한다.

Soul은 권한 경계가 아니다. 프로필 지시가 HQ manifest와 InkOS Book
계약을 넘을 수 없다. 세션 키는 최소 `{soulId, soulVersion, bookId}`이며 같은 작품의
지속 `sessionId` 하나를 재사용한다. Arc 종료나 의도적 분기 때만 새
세션을 만든다. Soul 하나의 세션을 여러 Book에서 공유하지 않는다. 문자열
규칙에만 기대지 않고 persisted `session_created.bookId`와 요청 Book ID가
다르면 호출 전에 거절한다.

예외는 Writer context만 확인하는 `direct-write canary`다. `inkos write next
--context-file`은 Agent session을 만들지 않으므로 session binding이 없다.
이 카나리는 Writer 전달 경로만 증명하며 Hermes orchestration E2E로
승격하지 않는다. Hermes/Agent canary와 production은 persisted session↔Book
검증이 필수다.

## 학습 상태와 승격

```text
shell -> indexed -> surveyed -> deep-read -> path-canary
  -> promotion-canary -> production
```

| 상태 | 완료 조건 |
| --- | --- |
| `shell` | 격리된 Hermes 프로필과 versioned SOUL이 존재하나 학습을 주장하지 않음 |
| `indexed` | Drive 재고 100% 목록, SHA, byte·회차 수, 파싱, 중복 그룹, 성향·장르 판정이 있음 |
| `surveyed` | 해당 장르 활성 후보 전부에 시작·초반·중반·후반·결말 분산 독해 receipt가 있음 |
| `deep-read` | 앵커 작품 전 회차의 기계 coverage 검증, 작품별 독립 보고서, 관리자 QA를 통과함 |
| `path-canary` | 전수 독해 1편 뒤 Writer context·reference·receipt 경로만 검증하며 승격 근거로 사용하지 않음 |
| `promotion-canary` | 전수 독해 3편 이상과 Review Packet v2 뒤 격리 Book의 기획·Arc·1화를 blind 비교함 |
| `production` | 모델·입력·출력 영수증, 장르성, 상업성, 캐논 검수와 사람 승격을 모두 통과함 |

`path-canary`는 장르당 전수 독해 1편 이후 가능하지만 Soul 승격 증거가
아니다. `promotion-canary`와 production에는 장르당 최소 3편의 전수 독해,
서로 다른 상업 엔진, Review Packet v2가 필요하다. 운영 목표는 장르당
5~10편이다. 편수만 채우지 않고 작품별 전체 회차 coverage가 100%인지
확인한다.

## 코퍼스 처리 규칙

### 1. 재고와 정본 선정

모든 직접 하위 합본에 다음을 기록한다.

- `sourceId`, Drive file ID, 경로, 제목, byte 수, SHA-256
- 회차 수, 회차 경계 파싱률, 첫·마지막 회차 번호
- 남성향 여부, 장르 후보와 confidence, 판정 근거 구간
- 중복 그룹과 canonical variant
- `eligible | duplicate | incomplete | parse-error | excluded-female`

같은 작품의 수정본·제목 변형은 한 그룹으로 묶는다. byte 수가 작거나
마지막 회차가 비정상인 합본은 자동 폐기하지 않고 `incomplete`로 격리한 뒤
사람 확인을 기다린다.

### 2. 전 작품 분산 독해

장르 후보마다 자연 회차 경계를 기준으로 최소 다섯 구간을 읽는다. 작품이
길면 `max(5, ceil(전체 회차 / 100))`개로 늘리고, 탐지된 대전환·대결산
구간을 추가한다.

- 시작: 약속, 결핍, 첫 선택
- 초반: 반복 동사와 첫 지급
- 중반: 적대 수준과 자산·권한 확대
- 후반: 관계·세력·목표의 변화
- 결말: 최종 지급, 장기 약속 회수, 남은 여운

각 구간은 실제 연속 회차와 byte 범위를 영수증에 남긴다. 첫 몇 화의
패턴으로 읽지 않은 후반을 추정하지 않는다. 자연 Arc 경계가 탐지되면
고정 백분위보다 그 경계를 우선한다. survey 결과는 장르 규칙을 만드는
근거가 아니라 앵커 선정과 추가 독해 필요성 판단에만 사용한다.

### 3. 앵커 전수 독해

한 작품의 전수 독해 세션은 다른 작품의 분석을 보지 않는다. 모든 회차를
segment로 나눠 읽고, 각 segment에서 장면·선택·저항·지급·훅과 문체 근거를
기록한다. 빠진 회차가 있으면 합성 단계로 넘어가지 않는다.

완료 여부는 모델이 쓰는 `coverage=1.0` 문구로 판정하지 않는다. 결정론적
validator가 원천 chapter index와 read ledger의 1:1 대응, chapter·byte 범위
누락·중복 0, segment 입력·출력 SHA를 검증한다. 그 뒤 독립 관리자 QA가
초·중·후반과 자연 Arc 근거를 raw source에서 재확인한다. 장르 production
근거에는 이 strict-clean 전수 독해만 들어간다.

각 segment host receipt는 조립된 실제 요청 payload SHA, 입력 token 수,
context limit, `truncation=false`를 기록한다. context limit을 넘기면 segment를
더 작게 나누고 다시 실행한다. 관리자 QA에서 근거 누락이나 왜곡이 나오면
인접 구간과 같은 Arc 전체로 QA 표본을 확대하며, 통과 전에는 deep-read로
승격하지 않는다.

전수 독해 산출물은 다음을 분리한다.

- 상업 엔진: 주인공 반복 동사, 압박, 능동 선택, 저항, 지급, 인정
- 장기 구조: 자연 Arc, 자산·권한 사다리, 관계 변화, 회수
- 장면 표면: 돈, 물건, 절차, 공간, 목격자 반응, 화말 장면
- 문체 표면: 시점, 문장 길이, 대화 간격, 판단과 행동의 배열, 문단 호흡
- 실패 구간: 늘어짐, 무상 지급, 적대 무능화, 설명 과다, 훅 약화

### 4. 장르 합성

작품 보고서를 바로 평균 내지 않는다. 공통형, 작품 조건형, 작가 고유형,
실패형을 나누고 충돌하는 성공 문법은 각각 어떤 조건에서 작동했는지
보존한다. 모든 주장에는 source ID와 회차·byte 근거가 있어야 한다.

Soul에는 장르 prior만 넣는다. 특정 이름, 고유 설정, 한 작가의 문장
습관은 작품별 reference pack과 style binding에 남긴다.

### 5. 작품별 결속

새 Book마다 다음을 먼저 고른다.

- `spineReference`: 장기 상업 엔진과 사건 사다리의 주축 1편
- `styleBinding`: 실제 문체 예문의 권위 1편 또는 검증된 단일 군집
- `supportingReferences`: `engine | payoff | emotion | hook | wildcard`
  역할이 명시된 2~5개
- `transformationMap`: 유지, 선택 변주, 연동 변주, 현재 Book 캐논

Soul 전체 코퍼스를 Writer prompt에 한꺼번에 섞지 않는다. 현재 Arc와
회차 의도에 맞는 실제 원문 구간만 retrieval하고, 주입 ID·범위·SHA를
실행 영수증에 남긴다. 보조 reference retrieval은 현재 미구현이므로 먼저
spine 단일 경로를 유지하고, 역할별 retrieval과 provenance 테스트가 생긴
뒤 활성화한다.

현행 canary에서는 Reference Pack이 단일 source만 지원하므로
`styleBinding.sourceId == spineReference.sourceId`를 강제한다. 다른 작품의
style source나 문체 군집은 dedicated binding·retrieval이 생긴 뒤에만
허용한다. Book `style_guide.md`와 `style_profile.json`을 함께 쓰는 경우
실제 파일 SHA를 별도 영수증에 남긴다.

## 산출물 계약

아래는 구현 예정 경로다. 아직 존재한다고 간주하지 않는다.

Reference Lab tracked:

```text
analyses/genre_souls/<soul-id>/<version>/source-manifest.json
analyses/genre_souls/<soul-id>/<version>/survey-report.md
analyses/genre_souls/<soul-id>/<version>/work-studies/<source-id>.json
analyses/genre_souls/<soul-id>/<version>/genre-profile.json
analyses/genre_souls/<soul-id>/<version>/genre-profile.md
analyses/genre_souls/<soul-id>/<version>/leak-scan-receipts/
analyses/genre_souls/<soul-id>/<version>/promotion-eligibility.json
inkos_handoffs/genre-souls/<soul-id>/<version>/reference-routing-catalog.json
evidence/source-registry-receipt.json
```

InkOS proposed Book binding:

```text
books/<book-id>/story/soul-bindings/v0001.json
books/<book-id>/story/soul_binding.json
```

HQ proposed adoption authority:

```text
adoptions/genre-souls/<soul-id>/<version>/decision.json
config/genre-soul-adoptions.json
```

HQ local execution evidence:

```text
.firefly/hermes-context-receipts/<work-order-id>.json
```

Reference Lab private/ignored:

```text
exports/genre-souls/<soul-id>/<version>/source-index.jsonl
exports/genre-souls/<soul-id>/<version>/read-ledger.jsonl
exports/genre-souls/<soul-id>/<version>/raw-excerpts.jsonl
exports/genre-souls/<soul-id>/<version>/surface-index/
exports/genre-souls/<soul-id>/<version>/tracked-projection-quarantine/
exports/source-registry/source-registry.json
private_sources/korean_webnovel_corpus/<author>/<existing-source-file>.txt
```

Tracked 파일은 원문 본문을 담지 않는다. private 파일은 실제 원문을
축약·익명화하지 않는다. 원문은 기존 canonical path에 한 번만 두며 Soul별로
재복사하지 않는다. index와 ledger가 Drive file ID, 기존 path, SHA를
참조한다. 모든 파생 파일은 `sourceSha256`, `promptVersion`, host가 기록한
실제 model·reasoning, 읽은 chapter·byte 범위, 생성 시각을 기록한다.

raw를 읽은 work-study·genre-profile·routing catalog는 처음부터 tracked path에
쓰지 않는다. ignored
`exports/genre-souls/<soul-id>/<version>/tracked-projection-quarantine/`에 만든
뒤 전체 활성 source corpus surface index와 비교한다. deterministic validator는
최소 exact 12-token match, 120 UTF-8 byte 이상 long-common match, known raw
excerpt exact match를 검사한다. threshold는 상업성·독창성 점수가 아니라
tracked 저장소에 원문 본문이 섞였는지 잡는 publication boundary다.

match가 있으면 artifact는 quarantine에 남고 tracked 경로로 promote하지
않는다. LLM에게 원문 독해를 줄이거나 창작 후보를 자동 재작성시키지 않고,
tracked projection의 해당 본문만 source ID·chapter/byte range·excerpt SHA
pointer로 바꿔 다시 검사한다. private full-fidelity 분석과 raw excerpt는
그대로 보존한다. PASS receipt는 artifact SHA, corpus index SHA, scanner
version/threshold, match count 0, 검사 시각을 담고 raw matched text는 담지
않는다. tracked artifact와 이 receipt를 한 묶음으로 검증하기 전에는
Reference Lab commit 대상이 아니다.

`soul-bindings/vNNNN.json`은 append-only history다. `bindingVersion`,
`bindingId`, `bindingKind`, `decisionId`, `previousBindingSha256`, `createdAt`, `bookId`,
`soulId`, `soulVersion`, `soulSha256`, `promptPackSha256`, analysis/writer genre
profile SHA, routing catalog SHA, style/spine binding ID처럼 안정된 identity
필드와 HQ promotion decision SHA를 영속한다. candidate canary에서는 HQ
decision SHA가 `null`이고 production binding에서는 필수다.
`soul_binding.json`은 현재 history path와 SHA만 가리키는
mutable active pointer다. rebind는 새 history 파일을 쓰고 pointer를
원자적으로 바꾸며 이전 history를 덮어쓰지 않는다.

`bindingKind=genre-soul`이면 Soul ID/version/SHA와 candidate analysis profile,
writer profile, stable routing catalog·style·spine identity가 필수다. 실제
control-context SHA와 reference transformation SHA는 회차별 per-run receipt에만
둔다. canary의
`bindingKind=neutral-baseline`은 Soul ID/version/SHA와 analysis profile을
명시적 `null`로 허용하고 현재 production baseline의 writer profile,
reference routing, neutral Hermes profile/config SHA를 기록한다. 두 kind를
같은 schema의 암묵적 nullable field로 섞지 않고 conditional strict validator로
검사한다. neutral binding은 production adoption이 아니므로 HQ promotion
decision SHA도 `null`이다.

Arc별로 바뀌는 reference transformation SHA는 Book Soul binding에서 빼고
per-run receipt에 기록한다. 승격된 Soul version은 immutable이다. Soul,
version, genre profile, spine/style routing을 바꾸려면 사람 승인, 새 binding
version, 명시적 rebind, 새 session이 필요하다. direct-write와 Agent receipt
모두 active history SHA와 해당 run의 transformation SHA를 따로 포함한다.

Reference Lab의 `promotion-eligibility.json`은 후보 근거와 입력 SHA만 담으며
production 결정을 내리지 않는다. HQ의 `decision.json`이 사람 `decisionId`,
`decision=promote|hold|reject`, 결정 시각, 모든 학습·coverage·manager QA·
canary·blind review·Review Packet SHA를 strict schema로 검증한다.
`config/genre-soul-adoptions.json`은 HQ가 승인한 active Soul ID·version·SHA와
decision receipt SHA를 가리킨다. production WorkOrder는 두 HQ artifact를
검증해야 하며 `promote`만 실행 기본값을 바꾼다.

production dispatch는 네 artifact를 따로 존재 확인하는 데서 끝내지 않는다.
executor의 `soulId/version/soulSha256`, 선택된 immutable binding history,
HQ decision, active registry의 같은 필드를 모두 byte readback해 일치시킨다.
binding history의 `hqPromotionDecisionSha256`은 WorkOrder의
`hqSoulAdoption.decisionSha256`과 같아야 하고, active registry의
`decisionReceiptSha256`도 같은 decision SHA를 가리켜야 한다. WorkOrder의
registry SHA는 dispatch 시점의 실제 registry byte SHA와 같아야 한다. 하나라도
stale이거나 어긋나면 production을 실행하지 않는다.

## 실행 계약 보강안

WorkOrder v1은 `additionalProperties=false`이며 Hermes 정보를 받을 수 없다.
호환성을 깨는 임의 필드 추가 대신 WorkOrder v2와 RunReceipt v2를 만든다.
v2는 최소한 다음을 검증해야 한다.

```json
{
  "executionMode": "direct-write-canary",
  "capability": "write-next",
  "adapterContract": "inkos-write-next/v2",
  "approvalMode": "human",
  "executor": {
    "kind": "hermes-profile",
    "profileId": "inkos_male_modern_fantasy",
    "soulId": "male-modern-fantasy-ko",
    "soulVersion": "v1",
    "soulSha256": "<sha256>",
    "model": "gpt-5.6-sol",
    "reasoningEffort": "high"
  },
  "worker": {
    "repo": "inkos",
    "invokedAgentPolicy": {
      "model": "gpt-5.6-sol",
      "reasoningEffort": "high",
      "scope": "all-invoked",
      "requiredAgents": ["writer"]
    }
  },
  "hermesContextReceipt": {
    "path": ".firefly/hermes-context-receipts/<work-order-id>.json",
    "sha256": "<sha256>",
    "status": "succeeded"
  },
  "controlContext": {
    "path": ".firefly/contexts/<work-order-id>.md",
    "sha256": "<sha256>",
    "containsRawSourceProse": false
  },
  "bookSoulBinding": {
    "activePointerPath": "books/<book-id>/story/soul_binding.json",
    "activePointerSha256": "<sha256>",
    "historyPath": "books/<book-id>/story/soul-bindings/v0001.json",
    "historySha256": "<sha256>"
  },
  "analysisGenreProfile": {
    "repo": "firefly_reference_lab",
    "commit": "<40-hex>",
    "path": "analyses/genre_souls/<soul-id>/<version>/genre-profile.json",
    "sha256": "<sha256>"
  },
  "writerGenreProfile": {
    "repo": "inkos",
    "lifecycle": "planned-p0",
    "profileId": "modern-fantasy-ko",
    "bookGenre": "modern-fantasy-ko",
    "path": "packages/core/genres/modern-fantasy-ko.md",
    "sha256": "<sha256>"
  }
}
```

`agent-operate` production WorkOrder에는 다음 HQ gate가 추가로 필수다.

```json
{
  "hqSoulAdoption": {
    "repo": "firefly_studio",
    "commit": "<40-hex>",
    "decisionPath": "adoptions/genre-souls/<soul-id>/<version>/decision.json",
    "decisionSha256": "<sha256>",
    "activeRegistryPath": "config/genre-soul-adoptions.json",
    "activeRegistrySha256": "<sha256>",
    "decision": "promote"
  }
}
```

위 `modern-fantasy-ko` ID와 path는 P0에서 만들 계획값이다. 현재 존재하는
현대 계열 정본은 `chaebol-modern-fantasy-ko`이며, 새 profile 설치·alias
테스트 전에는 위 값을 resolved runtime 사실로 쓰지 않는다.

Hermes는 Book 파일을 쓰지 않고 SHA-bound control-context artifact만 만든다.
`hermesContextReceipt`는 profile ID, Hermes run/session ID, 실제
model·reasoning trace, 입력 artifact SHA 목록, 출력 control-context path/SHA,
exit status를 host readback으로 기록한다. Dispatcher는 receipt의 output SHA와
WorkOrder control-context SHA가 같을 때만 Hermes E2E로 인정한다. Hermes를
실제로 호출하지 않은 path canary는 `hermesE2E=false`이며 production 근거로
쓰지 않는다.

HQ manifest에는 두 mutating capability를 등록한다.

- `write-next` + `inkos-write-next/v2`: Dispatcher가 검증된 context path로
  `inkos write next <bookId> --context-file <verified-path>`를 실행하는
  session 없는 path canary
- `agent-operate` + `inkos-agent-operate/v2`: InkOS `interact`에
  `--context-file`을 추가한 뒤 승인 instruction을 stdin, Book ID와 persistent
  session ID를 옵션으로 전달하는 Hermes/Agent promotion·production 경로

두 capability는 v1의 mutating base gate를 그대로 상속한다. WorkOrder의
`approvalMode=human`, clean child, bounded write scopes, stdin instruction,
idempotency lock, 사람 결정 전 `pending`을 모두 요구한다.

미등록 capability, context SHA 불일치, Book Soul binding 불일치,
RunReceipt v2 미생성은 fail closed한다. manifest validator도 v2 receipt
contract를 허용·검증하도록 함께 바꾼다.

Dispatcher는 프로필 요청값이나 LLM 자기신고를 영수증에 복사하지 않는다.
host adapter가 Hermes 설정과 InkOS effective config를 out-of-band로 읽어
모델·reasoning을 채운다. InkOS는 `inkos.json`의 `llm.model`, Studio
`defaultModel`, service model allowlist와 실제 resolved model을 함께
검증한다. Agent subcommand 전용 model 옵션은 없지만 InkOS global
`--model` override는 존재한다. 어느 설정 경로를 쓰든 effective config가
`sol/high`가 아니면 호출 전에 실패한다.

RunReceipt v2는 고정 agent 목록을 요청값에서 복사하지 않는다. 실행 trace에
실제로 나타난 모든 agent name, resolved model, reasoning, invocation count를
host가 수집한다. 미호출 agent는 `not-invoked`로 구분하며, 호출된 agent 중
하나라도 목표와 다르면 canary를 실패시킨다.

장르 프로필 영수증은 Reference Lab의 분석 profile과 InkOS Writer가 실제
로드한 profile을 분리한다. 후자는 Book.genre, resolved profile ID, 실제
profile byte SHA를 포함한다. InkOS 실행에는 versioned Soul/genre context를
`externalContext`로 전달한다. 이 제어 context에는 raw 원문을 섞지 않는다.
실제 story/style 예문은 SHA-bound Reference Pack system context로만
전달한다. 최종 Writer request에 들어간 externalContext byte SHA와 Reference
Pack system context SHA를 따로 artifact evidence에 포함한다. Hermes 프로필
readback만 있고 Writer request evidence가 없으면 실행 성공으로 보지 않는다.

Hermes/Agent session 영수증도 요청값을 복사하지 않는다. transcript의
persisted `session_created` event에서 session ID와 Book ID를 readback하며,
Book Soul binding ID와 선택된 immutable history SHA도 event와 receipt에
기록한다. 요청 Book 또는 binding과 다르면 fail closed한다. direct-write canary는
`sessionBinding.mode=none-direct-write`와 나머지 session 필드 `null`을
기록한다.

Hermes는 저장소가 아니므로 `config/edge-repos.json`에 가짜 child로 넣지
않는다. 실행 어댑터와 프로필 registry는 HQ가 별도 계약으로 관리한다.
Reference Lab은 bounded read-only tool이지만 학습·promotion 결정권은 없고,
일반 Dispatcher CLI에서도 private resolver를 직접 실행할 수 없다.

## 출력 표면 HIL

Review Packet v2와 Storyyard 비교 HIL은 구현됐다. 남은 목표는 Soul 버전별
전체 활성 코퍼스 surface index를 실제 deep-read 산출물에서 만드는 것이다.
후보마다 다음을 표시한다.

- 실제 Writer 주입 source ID, chapter·byte 범위, excerpt SHA
- 검사한 Soul ID·version과 surface index SHA
- exact n-gram, 긴 공통 부분 문자열, 근접 문자열 후보와 원문 위치
- `상업 엔진/사건 기능 | 일반 장르 관습 | 원천 고유 표면 | 캐논 유입`
  분류

`상업 엔진/사건 기능`과 `일반 장르 관습`은 감점하지 않는다. `원천 고유
표면`은 비교 정보만 제공한다. `캐논 유입`만 정본 오류로 처리한다. 어떤
종류도 자동 rewrite나 자동 reject를 일으키지 않는다. 현재 HIL은 사람이
고른 구간을 `polish-requested` 상태로만 기록한다. 실제 구간·의도를
Polisher에 전달하고 새 후보를 readback하는 adapter는 별도 구현 전까지
작동한다고 주장하지 않는다.

v1은 그대로 유지하고 아래 v2 계약을 additive로 구현했다. 아직 corpus
surface index 생성과 실제 사람 promotion 판정은 남아 있다.

- 기존 8개 commercial field와 새 감정적 정합성 축의 명시적 mapping 또는
  Commercial Evaluation v2
- Soul corpus comparison report schema와 index provenance
- Firefly Review Packet v2
- Storyyard의 코퍼스 표면 비교·감정적 정합성 UI
- 기존 v1 후보 readback과 하위 호환 회귀 테스트

Review Packet v2 tracked JSON에는 source ID, typed 좌표, SHA, match method와
`classification=pending`만 넣고 raw 원문 문자열을 넣지 않는다. 사람
classification은 별도 인증 receipt다. 비교 원문은 인증된 비추적 private store의
일회성 resolver가 인증된 사람 UI에만 필요한 slice를 반환하며 review model
입력에는 넣지 않는다. Storyyard는 응답 원문을
packet·로그·persistent browser storage에 영속하지 않는다. resolver 인증·만료·감사와
source SHA가 맞지 않으면 source-surface HIL은 `needs-attention`으로 멈춘다.
surface match schema에는 free-text note를 두지 않고 enum/code, source ID,
좌표, SHA만 허용한다. host validator가 resolver slice와 serialized packet·
로그를 byte 비교해 raw 유입을 거절한다.
사람 후보 결정 vocabulary는 기존 계약과 같은
`approve|polish|hold|reject`를 쓴다. Soul 승격 결정은 별도
`promote|hold|reject` schema를 쓴다.

좌표 정본은 resolver와 surface index 모두 `utf8-byte`다. InkOS의
`inkos-utf8-selector-bridge/1` converter는 story의 JavaScript UTF-16 code-unit
`sourceCharacterRange`로 잘린 실제 prose와 prose SHA를 먼저 검증한 뒤
canonical source의 UTF-8 byte start/end로 변환한다. range-less style example은
source ID·full source SHA·prose SHA와 함께 exact 위치를 역매핑하며, 단일
일치가 아니면 import 시 저장된 UTF-8 좌표를 요구한다. 중복 일치, source SHA
drift, prose SHA 불일치, surrogate/UTF 경계 실패에서는 typed selector를 만들지
않는다. candidate 쪽 selector도 candidate 전체 body SHA, UTF-8 byte start/end,
candidate slice SHA와 함께 결속하며 Storyyard는 packet candidate SHA와 다시
대조한다. 실제 Doksik pack canary에서 story와 style 경로가 같은 `32..138`
byte selector로 수렴했다.

surface match의 의미 분류는 raw를 보지 못하는 review model에게 맡기지
않는다. deterministic scanner는 match ID·방법·양측 typed selector와 SHA만
만들고, Storyyard의 인증된 사람이 후보와 일회성 source slice를 나란히 본
뒤 `engine|genre-convention|source-surface|canon-leak`를 선택한다. classification
receipt는 actor ID/role, match/selector SHA, category, 시각을 남긴다. model의
근거 없는 분류나 host 자동 분류는 Soul 승격 근거가 아니다.

resolver 실행 소유자는 raw store를 가진 Reference Lab이다. 구현 전에 HQ
manifest에 Reference Lab의 bounded read-only
`private-source-slice`/`reference-source-slice/v1` capability를 추가한다. HQ는
승인된 Review Packet의 source ID·range·SHA만 검증·라우팅하고 접근 receipt를
집계한다. Storyyard는 인증된 transient client일 뿐이다. HQ와 Storyyard가
Reference Lab 로컬 path를 직접 읽는 경로는 만들지 않는다. 이 resolver
capability는 Reference Lab의 production decision 권한을 늘리지 않는다.

현재 manifest의 Reference Lab은 `execution.kind=tool`인 bounded read-only
resolver다. 일반 Dispatcher는 계속 worker만 실행하고, private slice는
Storyyard signed grant를 검증하는 전용 HQ gateway만 호출한다. 구현된 계약은
다음과 같다.

- child entrypoint: `tools/private-source-slice.mjs` 계획값
- HQ adapter: `reference-lab-read-v1`
- capability: `private-source-slice`, `mode=read-only`, `approval=human`
- receipt: 원문이 아닌 request ID, actor ID/role, verified grant SHA,
  packet/source/range SHA, tracked registry receipt SHA, actual private registry
  SHA, 반환 byte count와 slice SHA, 결과·시각만 담는
  `source-access-receipt/v1`
- read ACL: `observationScopes`와 별개인 non-empty `readScopes`를 manifest에
  추가해 canonical source store와 private registry만 허용
- private registry: inventory가 만든 `sourceId -> repo-relative path -> full
  source SHA -> byte size/status` allowlist와 tracked registry receipt
- manifest validator: read-only tool의 adapter·entrypoint·receipt·readScopes를
  허용하되 `writeScopes`와 mutating capability는 거절
- Dispatcher: worker-only 검사를 dispatchable worker/tool로 분리하고 이
  adapter의 strict WorkOrder v2와 raw stdout 비기록 경로를 별도 구현.
  request에는 sourceId만 받고 path를 받지 않으며, adapter가 registry path를
  realpath한 뒤 readScopes 밖·symlink·SHA drift를 거절
- sensitive return: child의 stdout/stderr는 metadata JSON만 허용하고 raw는
  전용 fd3 pipe로만 gateway에 stream. 현 `childResult`·`.firefly/runs`·CLI
  출력 경로에는 raw를 전달하지 않으며 일반 `dispatch-edge` CLI는 이
  capability를 직접 실행하지 못함

resolver WorkOrder v2의 최소 입력은 다음처럼 raw byte 없이 닫는다.

```json
{
  "executionMode": "human-source-review",
  "capability": "private-source-slice",
  "adapterContract": "reference-source-slice/v1",
  "approvalMode": "human",
  "sourceSlice": {
    "requestId": "<uuid>",
    "packetId": "<id>",
    "packetSha256": "<sha256>",
    "matchId": "<host-owned-id>",
    "selectorSha256": "<sha256>",
    "selector": {
      "coordinateKind": "utf8-byte",
      "sourceId": "<id>",
      "sourceSha256": "<sha256>",
      "startByte": 0,
      "endByte": 1024,
      "expectedSliceSha256": "<sha256>"
    },
    "maxBytes": 32768
  },
  "sourceRegistry": {
    "receiptRepo": "firefly_reference_lab",
    "receiptCommit": "<40-hex>",
    "receiptPath": "evidence/source-registry-receipt.json",
    "receiptSha256": "<sha256>",
    "declaredPrivateRegistrySha256": "<sha256>"
  },
  "grant": {
    "issuer": "storyyard",
    "audience": "firefly-hq-source-slice",
    "actorId": "<authenticated-user-id>",
    "authenticatedRole": "admin",
    "ownerScope": "<verified-owner-id>",
    "requestId": "<uuid>",
    "packetId": "<id>",
    "packetSha256": "<sha256>",
    "matchId": "<host-owned-id>",
    "selectorSha256": "<sha256>",
    "coordinateKind": "utf8-byte",
    "sourceId": "<id>",
    "sourceSha256": "<sha256>",
    "startByte": 0,
    "endByte": 1024,
    "expectedSliceSha256": "<sha256>",
    "maxBytes": 32768,
    "expiresAt": "<iso-date-time>",
    "jti": "<one-time-id>",
    "grantSha256": "<sha256>"
  }
}
```

원격 Storyyard와 로컬 HQ 사이 transport도 P0 계약에 포함한다. 현재
Storyyard는 Cloudflare 기반 Sites + D1이고 R2가 없으며, 로컬에는
`cloudflared`가 설치돼 있다. raw slice를 D1·R2·packet에 복제하지 않고 다음
pull-through 경로를 쓴다.

1. Browser는 same-origin Storyyard admin-only route에 `packetId`, packet SHA,
   `matchId`만 POST한다. 사용자나 model이 path·range·SHA를 보내지 않는다.
   route는 Review Packet v2의 host-owned typed selector를 읽어 현재 사용자와
   exact source ID/range/SHA를 확인하고 60초짜리 one-time signed grant를
   발급한다. grant 발급과 proxy 응답은 모두 `no-store`다.
   grant에는 issuer, audience, actor ID, 현재 `admin` role, 검증된 owner scope,
   packet/request ID, exact source 좌표와 SHA, `exp`, `jti`, signing key ID만
   담는다. HQ에는 검증용 public key만 둔다.
2. Storyyard server route는 grant를 `Authorization: Bearer`에 넣어 고정
   allowlist의 named TLS tunnel 뒤 HQ review gateway로 POST하고 응답 body를
   browser에 stream proxy한다. browser에는 same-origin만 보이며 quick tunnel,
   URL/query grant, wildcard CORS를 쓰지 않는다.
3. HQ gateway는 서명·audience·admin role·owner scope·만료·Storyyard service
   origin을 검증한다. verified grant claims의 request, packet, match, selector, source,
   coordinate kind, full source SHA, start/end, expected slice SHA, max bytes는
   host가 읽은 packet selector와 field-by-field로 같아야 한다. WorkOrder는
   browser HTTP body를 복사하지 않고
   verified claims와 host packet readback으로 조립한다. 모든 검증이 끝나면
   resolver 호출 전에 jti SHA 파일을 `open(..., "wx")`로 원자 생성해
   reserve/consume하고, 호출이 실패해도 되돌리지 않는다. 그 뒤 Reference
   Lab tool을 한 번 호출한다.
4. resolver는 private source registry에서 sourceId를 해석한다. registry
   receipt의 repo/commit/path/receipt SHA와 declared private registry SHA를
   검증하고 실제 ignored registry byte SHA를 대조한다. access receipt에는
   tracked receipt SHA와 actual registry SHA를 모두 남긴다. 그 뒤 registry
   path를 realpath해 `readScopes` 내부 일반 파일인지 확인하고 symlink를
   거절한 뒤 전체 source byte SHA, typed UTF-8 byte 범위, 32 KiB 상한,
   expected slice SHA를 검증한다. raw는 전용 fd3 pipe로만 stream하고
   stdout/stderr에는 metadata JSON만 쓴다.
5. gateway와 Storyyard proxy는 `Cache-Control: private, no-store, max-age=0`,
   `Pragma: no-cache`와 slice SHA를 유지한다. Storyyard는 raw를 React memory에만
   최대 10분 표시하고 닫기·timeout·navigation에서 지운다. D1, packet, log,
   localStorage, IndexedDB, service-worker cache에는 쓰지 않는다.

HQ host는 응답 raw byte가 tracked packet, access receipt, captured model
request/output, HQ·Storyyard log에 들어가지 않았는지 byte 검사한다. Mac mini,
gateway 또는 tunnel이 꺼져 있으면 UI는 `source-unavailable`로 멈추며 raw를
tracked artifact에 넣는 fallback을 만들지 않는다. review model은 이 transport를
호출할 수 없고 사람 browser session만 사용할 수 있다.

manifest의 `approval=human`은 현재 Dispatcher에서 실행 승인 자체가 아니라
pending receipt 상태만 만든다. source access 권위는 Storyyard 인증과 signed
grant 검증이며, adapter는 verified grant SHA를 access receipt에 기록한다.
일반 CLI 호출이나 `approvalMode=human` 문자열만으로 resolver를 열지 않는다.

## Soul 승격 의존성

이 절은 Soul 자산과 최종 승격에 필요한 전체 요구사항 목록이다. runtime
기반의 실제 구현 순서와 commit 경계는
[InkOS v1.8 선택 이식·Production Kernel 구현안](./2026-08-28-inkos-v18-selective-production-kernel-plan.md)을
따른다. 두 문서를 한 번에 빅뱅 구현하지 않는다. 아래 번호는 구현 순서가
아니라 기존 요구사항 ID다. 상태 열이 현재 권위다.

| 요구사항 | 소유 트랙 | 현재 상태 |
| --- | --- | --- |
| 1, 3, 4, 5와 6의 기존 profile 중립화 | InkOS runtime baseline | 완료·재구현 금지, 새 경로 회귀 검증만 수행 |
| 2, 6의 신규 3 profile, 8 | Soul asset·Hermes | shell·장르별 3개 manager selection·survey 완료; deep-read 미완료 |
| 7, 9 | Production Kernel·HQ v2 | HQ `write-next` 완료; session-less path canary·`agent-operate`·Hermes E2E 미완료 |
| 10 | BookSoulBinding | 완료·회귀 green |
| 11 | reference runtime | spine 동일-source만 현행, supporting reference는 미착수 |
| 12 | Review Packet·private resolver·Storyyard | 코드·transport canary 완료; named TLS 배포·실제 HIL 미완료 |
| 13 | promotion eligibility·owner adoption | Reference Lab eligibility와 HQ adoption schema·registry validator 완료; eligible source 9개, dispatch gate·owner promotion 0 |

### 상세 acceptance inventory

1. **완료·보존.** production routing 문구를 실제 raw private input 정책으로
   정렬했다. 새 runtime이 이 계약을 되돌리지 않는지만 검증한다.
2. **부분 완료.** Reference Lab의 inventory, private
   sourceId→repo-relative path→full SHA registry, tracked receipt, strict
   study/promotion validator와 read-only resolver는 구현됐다. 장르별 상업·장르 폭·
   표면 앵커 3개씩을 manager selection으로 결속하고, 미선별·장르 오배정·선택
   receipt 변조를 fail-closed한다. UTF-8·chapter marker·정확한 회차 수·순차성
   무결성 gate를 거친 9개 모두에 분산 survey artifact와 Hermes config/usage/trace
   receipt, 전체 available corpus zero-match scanner receipt가 생겼다. 잔여는
   전작 deep-read artifact, 실제 strict coverage와 manager QA다. 전수 독해는
   Reference Lab 안의 명시적 관리자 세션으로 수행한다. raw를 읽은 모든 tracked
   projection에는 full active corpus exact/long-common leak scanner,
   private quarantine, zero-match promotion receipt를 강제한다.
   후보 문서의 무정의 `윤리 감리`는 원문 인과·후속 비용의 비점수 관찰로
   좁히고 Gold 차단이나 장르 공통 도덕 규칙으로 사용하지 않는다.
3. **완료·재구현 금지.** 아래는 현재 BookRules acceptance contract다.
   BookRules와 Architect 출력은 provenance와 강도를 보존한다. 각 규칙은
   rule ID, kind, host-owned source artifact/selector와 text SHA,
   `source=user-explicit|premise-explicit|book-canon|genre|model-suggested`,
   `strength=hard|soft|diagnostic`, owner adoption decision/receipt를 보존한다.
   모델은 source나 strength를 자기신고하지 않는다. exact user/premise
   selector가 있거나 owner adoption receipt가 있는 hard rule만 Writer 의무,
   creative critical, 자동 수정의 근거가 된다. Architect가 제안한 행동 금지,
   도덕 기준, 대가, 성장·속죄는 사람 채택 전
   `model-suggested/diagnostic`이며 Book 정본으로 승격하지 않는다. 기존 세
   Book의 규칙도 provenance 없이 사용자 규칙으로 간주하지 않고 사람
   재분류 대상으로 둔다. 이는 Book별 owner data migration이며 Core 재구현이
   아니다. Architect의 story frame과 role template에서도
   마지막 대가, 내적 변화, 속죄는 선택값으로 바꾸고 `none`을 합법으로
   허용한다. BookRules 밖에 같은 의무를 우회 생성하는지도 semantic lint로
   검사한다. host는 실제 BookRules file SHA에 결속된 전체 rule entry 수와
   provenance entry 수, hard·soft·diagnostic 합계의 완전 일치를 fail-closed로
   검증한다. hard rule 전부가 권한 receipt를 가졌는지도 별도로 확인한다.
4. **완료·재구현 금지.** `fiction-content-neutral-ko/v1` versioned control
   context와 아래 acceptance contract는 현재 runtime 기준선이다.
   Architect, Planner, Writer, Auditor, Reviser, Polisher,
   commercial/HIL reviewer, blind reviewer가 받은 실제 byte SHA를 실행
   trace에서 검증한다. 수위 지시는 기본
   `preserve` 또는 receipt에 결속된 사용자·HIL 원문만 허용하고 모델이
   임의로 상향·하향을 선택하지 못하게 한다. Auditor의 creative
   critical reason code는 캐논 직접 모순, 인물·시간·정보 인과 붕괴,
   명시적 Book hard rule 위반, 약속한 핵심 장면·지급 누락으로 닫는다.
   미등록 사유와 도덕성·불쾌감 판단은 사람 검토만 허용하고 자동 수정에
   넣지 않는다. provider refusal은 그대로 기록하고 대체 원고를 성공으로
   만들지 않는다. Continuity dimension 14는 조연의 확정된 욕망·정보·능력
   인과 검사로 좁히고 성별·대표성·플롯 기능 자체를 severity 근거로 쓰지
   않는다.
5. **완료·재구현 금지.** InkOS의 민감 표현 분석과 private creative review는
   분리됐다. 선택한
   출고처가 있을 때만 `publicationCompatibility` advisory를 만들고,
   sensitive finding은 creative pass, 상업성 점수, 캐논, Reviser 입력에
   영향을 주지 않아야 한다. 현행 정치 `block`과 성·폭력 완화 권고가
   creative path를 실패시키지 않는 회귀 테스트를 유지한다.
6. **shell 완료.** 기존 재벌·urban·litrpg profile 중립화와 Dimension 14 경계,
   한국어 현대판타지·판타지·무협 전용 genre profile, alias·fallback,
   Book.genre와 실제 loaded profile SHA 테스트가 구현됐다.
   성별·도덕성 기본 금지를 넣지 않고 장면 인과와 상업 기능만 규정한다.
   재벌 profile의 전화 해결은 불법성 자체가 아니라 사전 구축된 권력·뇌물·
   협박·연줄 없이 절차가 사라지는 무상 해결만 막는다. 사용자가 Book
   rule로 지정한 금기와 수위는 그대로 존중한다. 기존 `urban.md`와
   `litrpg.md` 정렬은 회귀 기준선으로 유지한다.
7. **부분 완료.** 선택 이식 구현안 Phase 3~5에서 HQ manifest와
   Dispatcher의 `write-next`/`inkos-write-next/v2`, RunReceipt v2 validator를
   구현했다. InkOS `interact --context-file`도 `/write` intent와 context를
   분리 전달한다. 다만 HQ manifest·Dispatcher에는 아직
   `agent-operate`/`inkos-agent-operate/v2`가 없다. 현 `write-next`의
   `sessionId`는 production correlation일 뿐 persisted Agent session은 아니지만,
   이 문서가 정의한 literal-null session-less direct-write canary와도 다르다.
   따라서 아직 Phase 7 path canary나 Hermes/Agent promotion E2E로 세지 않는다.
   현 RunReceipt는 이를 `hermesE2E=false`, `orchestrator.invoked=false`,
   `evidence=work-order-declaration`으로 명시한다. agent-operate 구현 전에는
   WorkOrder의 Hermes 요청값을 실제 Hermes readback으로 해석하지 않는다.
8. **shell 완료.** 새 Hermes 프로필 세 개를 격리 생성하고 `SOUL.md`,
   model, reasoning을 readback한다. 기존 v3 author Soul은 clone하지 않았다.
9. **부분 완료.** WorkOrder/RunReceipt v2는 InkOS가 실제 호출한 agent의
   model·reasoning·count와 receipt를 readback한다. 별도 Hermes profile
   validator도 설치된 candidate의 config·Soul·`sol/high`를 검증한다. 그러나
   direct `write-next`는 Hermes를 호출하지 않으므로 WorkOrder의
   `runtime.hermesProfile/model/reasoning`은 요청 선언일 뿐 실효 readback이 아니다.
   실제 Hermes run/session·control-context receipt 검증은 agent-operate adapter와
   함께 구현해야 한다.
10. **runtime 완료.** Book의 append-only `soul-bindings/vNNNN.json` history,
   mutable `soul_binding.json` active pointer, persisted session↔Book↔binding 검사를
   구현한다. Soul version 변경은 사람 rebind와 새 session을 요구하고 교차
   Book·Soul version 재사용을 거절하는 회귀 테스트를 추가한다.
11. **reference runtime 잔여.** 현행 v1은
   `styleBinding.sourceId == spineReference.sourceId`를 validator로 강제한다.
   독립 style source는 별도 schema·store·retrieval·receipt·테스트가
   생긴 뒤에만 푼다. supporting reference는 `planned`만 허용하고 `active`
   입력을 거절한다.
12. **부분 완료.** Commercial Evaluation/Review Packet v2, Storyyard 비교 UI,
   v1 하위 호환, read-only Reference Lab resolver와 전용 HQ transport gateway가
   구현됐다. packet에는 source 좌표·SHA만 있고 raw slice는 signed
   admin/owner-scope grant, atomic JTI consume, registry·realpath·source SHA
   검증, fd3 sensitive channel과 no-store proxy를 거친다. 일반 Dispatcher는
   이 capability를 직접 실행하지 않는다. story/style provenance typed selector
   converter와 실데이터 canary도 완료했다. 잔여는 deep-read 기반 production
   surface index 생성, named TLS tunnel 배포와 실제 사람 HIL이다.
13. **owner authority shell 완료·dispatch gate 잔여.** Reference Lab의
    promotion eligibility와 HQ의 사람 promotion decision·active adoption registry를
    분리했다. HQ는 strict `genre_soul_promotion/v1`과
    `genre-soul-adoption-registry/v1`을 검증하며, promoted Hermes profile과 active
    registry가 서로 빠지거나 decision byte SHA·Soul identity·profile config가
    어긋나면 거절한다. 현재 active registry는 비어 있고 세 profile은 모두
    candidate/disabled다. 향후 `agent-operate` production은 이 validator의 실제
    `promote` decision/registry SHA readback을 WorkOrder gate로 결속해야 한다.

### Soul 자산 제작과 카나리

1. 398개 재고를 인덱싱하고 중복·불완전·여성향 제외를 확정한다.
2. 세 장르 후보 전부를 분산 독해하고 근거 범위를 남긴다.
3. 장르별 앵커를 격리 전수 독해하고 strict coverage·manager QA를 통과한
   뒤 genre profile 후보를 합성한다.
4. Book별 spine과 현행 동일-source style을 결속한다. supporting reference는
   planned routing만 기록하고 retrieval·provenance 구현 뒤 활성화한다.
5. 전수 독해 1편 뒤 격리 Book에서 `write-next` `path-canary`를 실행해 Writer
   context와 receipt 경로만 검증한다. 이 결과는 Soul 승격에 쓰지 않는다.
6. 전수 독해 3편 이상과 Review Packet v2 뒤 `promotion-canary`에서
   독립 생성 pair 세 개를 만든다. 각 pair의 baseline/Soul Book은 같은
   pre-generation snapshot, brief, rules, Arc, source pool, model, reasoning,
   token budget를 쓴다. 이 실험의 estimand는 Hermes 파일 하나의 추가 효과가
   아니라 `genre Soul production bundle` 전체와 현재 neutral production
   baseline의 상업성 차이다. treatment bundle은 Hermes profile/config,
   Soul, Reference Lab analysis genre profile, InkOS writer genre profile,
   reference routing/binding, control context, Book binding history의 ID/SHA를
   모두 포함한다. neutral lane은 `bindingKind=neutral-baseline`, Soul·analysis
   profile `null`, 현재 baseline writer/routing과 별도 neutral `sol/high`
   Hermes profile을 사용한다. host가 양 bundle과 공통 입력을 paired receipt에
   남긴다. component별 인과효과가 필요하면 승격 뒤 별도 ablation으로 다루며
   이 결과를 Hermes-only 효과라고 부르지 않는다.
7. 세 pair 각각에서 `agent-operate` E2E로 `기획서 -> Arc -> 1화`를 만들고,
   생성자 자기점수와 Soul/baseline 라벨을 제거해 독립 blind review 한 번씩
   실행한다. 각 round는 별도 session/run ID와 무공유 transcript를 가진다.
8. 독립 genre identity review가 세 Soul 후보 각각의 세계 제약, 주인공 반복
   동사, 압박·적대 형태, 보상·지위 통화, 다음 화 기대 행동을 실제 본문
   근거로 검증한다.
9. content-neutral 적대적 fixture를 별도 실행한다. 범죄로 당장 이익을 얻는
   주인공, 구축된 권력·뇌물·협박으로 절차를 우회하는 인물, 편견과 착취가
   있는 세계, 사과·갱생 없는 배신, Book 수위의 폭력, 악인이 이기고 정의가
   회복되지 않는 회차, 반대로 Book이 명시한 도덕적 각성을 포함한다. 무단
   삭제·완곡화·수위 변경·훈계·면책·강제 처벌·사과·갱생 추가가 0건이고,
   허구의 불법을 hard contradiction으로 판정한 건이 0이어야 한다. 회차
   끝까지 반성·내적 성장·대가가 없는 주인공도 Architect가 유효한 story
   frame과 role로 통과시켜야 한다. dimension 14는 확정된 조연 욕망·정보·
   능력 인과를 깨뜨린 fixture만 critical이고, 플롯 기능·성별·대표성만 다른
   fixture는 통과해야 한다. genre profile semantic lint는 성별·도덕 적합성
   금지와 불법 자체를 금지하는 문구를 0건으로 확인한다.
10. Storyyard에 상업성 비교, 주입 영수증, 표면 비교, 사람 결정을 투영한다.

### P2. 운영 최적화

- 승인·거절 이유를 다음 Soul 버전에 반영하되 미승인 원고로 자기학습하지
  않게 한다.
- 실제 병목이 확인되면 부분 재실행과 병렬 분기만 그래프화한다.
- 여성향은 별도 조사와 Soul 설계 승인 후 추가한다.

## 카나리 승인 기준

세 장르 모두 같은 평가 계약을 쓴다.

- `path-canary` 결과는 아래 승격 계산에서 제외
- 동일 시작 상태 paired receipt가 있는 독립 생성 pair 3개
- Soul 적용 후보가 각 pair의 독립 blind review에서 3건 중 2건 이상 승리
- `dopamine70-reference30-v1` overall 3회 평균 85 이상
- 승리한 2회에서 baseline 대비 overall 최소 `+2.0`
- 오프닝 압력, 주인공 선택, 유능한 저항, 가시적 지급, 화말 추진력 각
  80 이상이며 baseline 대비 어느 핵심 축도 5점 넘게 하락하지 않음
- 장르 정체성 3/3 통과: 세 Soul 후보 모두 `세계 제약 | 반복 동사 | 적대
  형태 | 보상·지위 통화 | 다음 화 기대 행동` 5개 필드에 본문 근거가 있음
- 현재 Book hard contradiction 0
- BookRules file SHA에 결속된 전체 rule entry 수, provenance entry 수,
  hard·soft·diagnostic 합계가 같고 authorized hard rule 수가 hard rule 수와
  같으며 coverage PASS, unauthorized hard rule 0. 미승인
  `model-suggested/diagnostic`이 Writer 의무·creative critical·자동 수정으로
  승격된 건 0
- 모든 실제 창작·감리 agent의 `fiction-content-neutral-ko/v1` 수신 SHA 100%
- 사용자·HIL 수위 지시와 수신 SHA 100%, 모델이 만든 무근거 상향·하향 0
- 실행 trace의 창작·감리·수정·판정 참여 호출 집합과 contract receipt
  invocation 집합이 정확히 같음
- 실제 Soul lane 후보 3개 모두 `contentNeutrality.passed=true`이고
  `unauthorized-softening|unauthorized-escalation|moral-lecture|disclaimer|forced-punishment|forced-apology|forced-redemption|forced-cost|forced-moral-growth|forced-balance`
  violation 0
- 각 content-neutral review receipt의 candidate body, paired generation,
  BookRules, 수위 지시 SHA가 현재 실제 후보 바이트와 일치
- content-neutral fixture에서 무단 순화·자극, 훈계·면책, 강제 응보·사과·
  갱생, 허구의 불법만을 근거로 한 creative critical 각각 0
- Architect가 미요청 대가·반성·성장·속죄를 story frame, role, BookRules에
  의무화한 건 0
- dimension 14의 성별·대표성·플롯 기능 기반 critical 0, 확정된 조연 인과
  붕괴 fixture만 판정하는 회귀 테스트 PASS
- 활성 genre profile semantic lint에서 성별·도덕 적합성 기본 금지와 불법
  자체 금지 0
- Reference Lab promotion evidence의 도덕 적합성·`윤리 감리` Gold 차단
  gate 0
- publication compatibility finding이 creative pass, 상업성 점수, 캐논,
  manual Reviser 입력, 자동 수정에 미친 영향 0
- provider refusal 발생 시 대체 후보 생성 0, 캐논 변경 0, typed refusal
  receipt 완비
- 사용자가 정한 수위와 Book의 명시적 도덕 서사 양방향 fixture PASS
- 모든 surface match의 사람 classification receipt 100%,
  `canon-leak`으로 판정된 결속되지 않은 원천 고유명·설정 유입 0
- 실제 주입 source ID·범위·SHA 영수증 100%
- 전수 독해 strict coverage validator와 관리자 QA PASS
- Soul 전체 surface comparison report 생성 100%
- similarity penalty, automatic rewrite, automatic reject 0
- Hermes와 실행 trace에서 실제 호출된 InkOS agent 전부의 model·reasoning
  readback 100%, 모두 `gpt-5.6-sol / high`
- blind review 3회가 서로 다른 run/session ID와 무공유 transcript를 가짐
- Reference Lab promotion eligibility PASS와 HQ Soul promotion decision
  `promote`, 사람 decision ID, active adoption registry, 입력 SHA 완비
- 사람 결정 전 Book 원고 교체 0

## 비범위

- 모델 가중치 파인튜닝
- 원문을 Git tracked 파일에 저장
- 원문 독해 전 익명화·요약·패러프레이징
- 여러 작가 문체를 하나의 장르 평균 문체로 합성
- 독창성 거리·어휘 거리·사건 순서 차이를 품질 점수로 사용
- 장르 전체 코퍼스를 매 집필 prompt에 통째로 주입
- Soul이 InkOS Book·Arc·Rail·Chapter를 직접 수정
- `style import` 여러 번으로 장르 코퍼스 학습을 대체
- Hermes SOUL을 켜면 InkOS Writer도 자동으로 따른다고 가정
- Soul 하나의 session ID를 여러 Book에서 공유
- 학습 단계에서 Book이나 원고 생성
- 사람 승인 없는 Soul production 승격 또는 후보 적용
- v1에서 여성향 Soul, 상시 gateway, cron, 그래프 런타임 도입

## 최초 계획 문서화의 완료선

2026-08-27 최초 변경의 완료선은 계획과 프롬프트, production routing 문구
정렬이었다. 이후 Hermes 프로필, 검증 원문, Reference Lab 실행 기반, InkOS
신규 장르 profile과 WorkOrder v2가 구현됐고 2026-08-28 분산 survey까지
완료됐다. 남은 Soul 자산은 위 dependency 상태와 새 선택 이식 구현안의
Phase 순서에 따라 별도 검증·커밋한다.
