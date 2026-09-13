# 사람처럼 생각하는 에이전트: GitHub 보강 조사

조사일: 2026-09-11 KST. 상태: 분석·실험 제안. 오늘의 주제는 사람 웹소설 작가처럼 생각하고 쓰는 품질을 높이는 방법이다. 웹소설 밖의 프로젝트까지 살펴보고, 12개 저장소의 README와 기본 브랜치 메타데이터, 주요 후보의 관련 구현, 연결된 원 논문을 확인했다. 저장소 설치·실행·성능 재현은 하지 않았다. 아래 적용 가능성은 Firefly에 대한 가설이며 채택 결정이 아니다.

후속으로 내부의 조건상·서오·강동호 원고 5개 작품, 22개 회차를 읽고 장면의 판단·반응·서술 방식을 비교했다. 전체 문서와 다음 비교안은 [사람 작가 품질 연구 기록](2026-09-11-human-writer-quality-study.md)에서 연결한다.

가장 먼저 검토할 조합은 **Reflexion의 피드백 기억, Concordia의 인물별 상황 해석, Self-Refine의 구체적인 퇴고 절차**다. 현재 Firefly에 이미 있는 기억·계획·리뷰를 활용하면서, 어느 연결이 실제 읽는 경험을 개선하는지 따로 시험할 수 있다.

이번에 확인한 근거는 행동의 그럴듯함, 특정 과제의 성공률, 응답의 일관성, 기억과 피드백 처리에 관한 것이다. 한국어 웹소설의 장기적인 재미나 사람 작가 수준의 집필을 입증한 자료는 확인하지 못했다. 인물이 자연스럽게 행동하는 것과 작가가 재미있는 장면을 골라 쓰는 것은 각각 평가해야 한다.

| 후보 | 구현·연구에서 확인한 것 | Firefly에 참고할 부분과 한계 |
|---|---|---|
| [Reflexion](https://github.com/noahshinn/reflexion) | 시도 결과를 짧은 반성·다음 전략으로 바꾸고 기억에 넣어 후속 시도에 사용한다. 가중치 학습 없이 텍스트 피드백으로 적응한다. | 작가가 편집 피드백을 다음 선택에 반영하는 절차. 실제 평가 본문을 연결하고, 작품별 지적을 전체 작품의 금지 규칙으로 확대하지 않아야 한다. |
| [Concordia](https://github.com/google-deepmind/concordia) | 기억·상황 인식·자기 인식을 조합해 행동을 선택한다. Game Master가 환경과 행동 결과를 처리하는 사회 시뮬레이션이다. | 인물이 아는 사실과 원하는 것을 기준으로 반응을 고르는 장면 연습. 일상의 그럴듯한 행동만으로 독자에게 보여 줄 장면이나 분량이 정해지지는 않는다. |
| [Generative Agents](https://github.com/joonspk-research/generative_agents) | 경험을 저장하고 최근성·중요도·관련성으로 회상한다. 회상한 경험에서 성찰을 만들며 그 근거 노드를 보존한다. | 인물이 지금 누구의 어떤 행동을 기억하는지 연결하는 모델. 25명 마을 실험의 행동 평가를 소설 품질 증거로 옮길 수는 없다. |
| [StanfordHCI/genagents](https://github.com/StanfordHCI/genagents) | 인터뷰·자기보고 등에 근거한 인물 응답 시뮬레이션. 기억, 성찰, 선택형·수치형 응답, 대화 인터페이스가 있다. | 성격 형용사에 더해 과거 경험과 실제 선택을 인물 자료로 삼는 발상. 가상 독자의 의견을 실제 독자 반응으로 취급할 근거는 아니다. |
| [Self-Refine](https://github.com/madaan/self-refine) | 동일 모델이 초안·피드백·수정 역할을 반복한다. 논문은 대화 등 7개 과제를 평가했다. | 원고의 특정 약점을 짚고 수정 전후를 비교하는 절차. 자체 점수 상승이나 반복 횟수로 개선을 판정하지 않는다. |
| [Letta Code](https://github.com/letta-ai/letta-code) | 세션을 넘어 유지되는 기억과 정체성을 지원하는 에이전트 실행 환경. README는 기억·스킬·프롬프트 수정과 Git 기반 MemFS를 설명한다. | 지속적인 작가 경험을 관리하는 기반으로 참고할 수 있다. 기억 서비스와 집필 능력은 별도이며 기존 InkOS 실행 환경 교체 필요성은 입증되지 않았다. |
| [Tree of Thoughts](https://github.com/princeton-nlp/tree-of-thought-llm) | 여러 후보를 생성·평가·선택하며 탐색한다. 글쓰기 실험도 있으나 구현된 과제는 지정 문장으로 끝나는 4개 짧은 문단의 일관성이다. | 주요 갈림길에서 다른 선택과 후속 결과를 소수 비교하는 발상. 장편의 재미·문체·연재 지속력을 검증한 실험은 아니다. |
| [GEPA](https://github.com/gepa-ai/gepa) | 실행 기록과 피드백을 읽어 프롬프트 수정안을 만들고 평가하며 후보를 보존한다. 코드의 adapter는 사례별 점수와 성찰용 자료를 요구한다. | 독자·편집자의 평가 자료가 충분해진 뒤 프롬프트 가설을 비교할 후보. 평가가 양식 충족만 보상하면 그 방향으로 최적화될 수 있어 우선순위는 뒤다. |
| [DAYDREAMER](https://github.com/eriktmueller/daydreamer) | 감정에 따른 관심사 전환, 개인 목표, 일화 기억, 유추 계획, 합리화 등을 다룬 Common Lisp 기반 목표 지향 모델. | 감정이 무엇에 주목하고 어떤 행동을 미루거나 택하는지 바꾸게 하는 설계 참고. 규칙과 언어 생성 템플릿을 작성하는 고전 시스템이며 현대 LLM용 즉시 연결 부품은 아니다. |
| [Thinking-Claude](https://github.com/richards199999/Thinking-Claude) | 사고를 유도하는 프롬프트 모음과 표시용 브라우저 확장. 현재 README 첫머리에 프로젝트 종료가 명시되어 있다. | 역사적 프롬프트 사례로는 유용하다. 장문의 사고 서술 자체를 능력 향상의 증거로 삼거나 이번 우선 도입 대상으로 잡기는 어렵다. |
| [Sequential Thinking MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking) | 모델이 보낸 단계·수정·분기를 메모리에 저장하고 진행 상태를 반환하는 도구. 확인한 처리 코드에는 별도 추론 모델이나 품질 평가기가 없다. | 검토 경로를 기록하는 인터페이스다. 연결만으로 사람 같은 사고가 생긴다고 판단할 근거는 없다. |
| [Letta 이전 진입점](https://github.com/letta-ai/letta) | 현재 README가 활성 소스를 `letta-ai/letta-code`로 안내한다. 이전 V1 서버는 `archive` 브랜치의 역사 자료로 설명한다. | MemGPT/Letta를 조사할 때 예전 API 서버와 현재 실행 환경을 구분해야 한다. 별도의 품질 향상 후보로 중복 계산하지 않는다. |

**구현과 논문을 대조하며 확인한 세부 사항**

- Reflexion의 ALFWorld 예제는 실패한 환경의 실행 기록과 이전 반성에서 새 전략을 만들고 기억에 추가한다. 이 예제는 최근 반성 최대 3개를 입력에 사용한다. Firefly에서는 부정 평가뿐 아니라 채택된 선택도 비교 자료로 보존하는 확장을 제안한다. [구현](https://github.com/noahshinn/reflexion/blob/218cf0ef1df84b05ce379dd4a8e47f17766733a0/alfworld_runs/generate_reflections.py#L12), [논문](https://arxiv.org/abs/2303.11366v4).
- Concordia의 현재 기본 인물은 목표가 있으면 상황 인식과 자기 인식에도 그 목표를 전달하고, 이를 조합해 행동을 선택한다. 단순히 성격 소개만 추가하는 것보다 목표와 지각의 연결을 시험할 근거가 된다. [기본 인물 구현](https://github.com/google-deepmind/concordia/blob/e071b30446af36598dcfb279ab500a2b4119435e/concordia/prefabs/entity/basic.py#L116), [논문](https://arxiv.org/abs/2312.03664v2).
- 원래 Generative Agents는 회상 점수의 가중치를 코드로 계산하며, 성찰을 생성할 때 관련 기억 노드 ID도 저장한다. 성찰을 사실과 같은 것으로 취급하지 않고 근거를 되찾을 수 있다는 점이 참고할 만하다. [회상](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/retrieve.py#L220), [성찰](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/reflect.py#L38), [논문](https://arxiv.org/abs/2304.03442v2).
- Stanford 후속 연구의 최신판은 2026-06-28 v3이다. 1,052명 자료로 만든 에이전트의 미사용 GSS 문항 정확도는 참가자 자신의 2주 재검사 일관성을 기준으로 인터뷰 83%, 설문 82%, 결합 86%였다. 이는 사람의 모든 생각을 그 비율로 재현한다는 뜻이 아니다. 초기판의 85%를 현재 수치로 인용하지 않는다. 공개 저장소의 인구통계 기반 에이전트와 연구의 전체 인터뷰 기반 표본도 동일하지 않다. [최신 논문](https://arxiv.org/abs/2411.10109v3), [공개 코드·자료 설명](https://github.com/StanfordHCI/genagents).
- Self-Refine의 초안·피드백·수정 반복은 코드에서도 확인된다. 기존 모델과 특정 과제의 결과이므로 현재 Firefly 원고에서도 개선되는지는 따로 비교해야 한다. [반복 구현](https://github.com/madaan/self-refine/blob/9a206d41e5d2d0c241bb441f41eeadb945afaa55/src/acronym/run.py#L19), [논문](https://arxiv.org/abs/2303.17651v2).
- ToT의 글쓰기 과제는 문단 끝 문장 제약과 일관성 중심이다. GEPA는 수치 평가와 성찰 자료를 외부 adapter에 의존한다. 두 경우 모두 Firefly에서 무엇을 좋은 결과로 평가할지 먼저 정해야 한다. [ToT 글쓰기 프롬프트](https://github.com/princeton-nlp/tree-of-thought-llm/blob/8050e67d0e3a0fddc424d7fa5801538722a4c4cc/src/tot/prompts/text.py), [GEPA 평가 계약](https://github.com/gepa-ai/gepa/blob/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407/src/gepa/core/adapter.py#L96), [GEPA 논문](https://arxiv.org/abs/2507.19457v2).
- Thinking-Claude의 종료는 README 선언이다. GitHub의 archived 플래그와는 구분한다. Sequential Thinking은 단계 내용을 받아 저장·표시하고 단계 수와 분기 목록을 반환한다. [종료 안내](https://github.com/richards199999/Thinking-Claude/blob/7322bbf982790dec7f0356bf330b79586110bac0/README.md), [단계 처리 코드](https://github.com/modelcontextprotocol/servers/blob/d73f99efbfd40c3aa1b61e88728b3d49fb52608f/src/sequentialthinking/lib.ts#L52).

**현재 Firefly와 연결되는 개선 가설**

현재 `scripts/planning-input.py`의 사람 검토 입력은 후보별 의견과 출처를 보존하면서 `reviewed-text-not-loaded`를 명시한다. 잘못된 일반화를 막는 경계는 이미 있다. 다음 후보를 만들 때 과거의 평가 대상 본문도 함께 볼 수 있다면, 무엇이 문제였는지 더 구체적으로 적용할 수 있다는 가설이다. 댓글을 더 많이 넣는 것만으로 같은 효과가 나는지는 알 수 없다. [현재 입력 코드](../scripts/planning-input.py#L123).

Foundry에는 이미 Scene Forge와 계획을 보지 않는 BR0 리뷰 규칙이 있다. 외부 이름을 붙인 새 루프를 더하기 전에, 짧은 장면을 써서 발견한 점이 다음 선택과 계획에 반영되는지 시험하는 편이 적절하다. 이 규칙이 존재한다는 사실은 현재 일일 기획 파이프라인에서 실행된다는 증거가 아니다. [Foundry 규칙](../edge_repos/v3_ff_foundry/00_charter/anchored_story_loop.md#L87).

인물의 기억은 **작품에서 일어난 사실, 인물이 직접 아는 정보, 인물의 해석**을 구분해서 다룰 수 있다. 같은 사건이라도 누가 무엇을 먼저 알아보고 어떤 말을 하지 않는지가 달라지는지 확인한다. DAYDREAMER에서 얻는 참고점도 감정 표현의 양보다 감정이 주의와 선택에 미치는 영향이다. 모든 인물에게 결함·상처·비합리성을 추가할 필요는 없다.

작가의 선택에는 별도 판단이 필요하다. 인물 행동이 자연스러워도 그 행동을 자세히 읽는 즐거움이 없을 수 있다. 어떤 반응을 기다리게 할지, 어떤 순간을 펼치고 어떤 절차를 압축할지, 보상이 다음 기대를 어떻게 만드는지를 함께 검토한다. 위 저장소들은 이 판단을 시험할 부품을 제공하지만 대신 결정해 주지는 않는다.

**실행 전 비교안**

| 실험 | 고정할 조건 | 하나만 바꿀 것 | 사람이 볼 결과 |
|---|---|---|---|
| 1. 피드백을 다음 선택에 적용 | 같은 참고 자료·모델·기획 과제·출력 길이·실행 예산. 서로 다른 사례 3개로 탐색 | 기존 입력과, 검토 당시 본문 발췌·그 평가·이번에 시험할 수정 한 가지를 연결한 입력 | 예전 지적을 실제로 고쳤는지, 새 소재에 억지로 적용했는지, 어느 쪽 장면이 더 보고 싶은지 |
| 2. 인물 관점이 행동을 바꾸는가 | 같은 사건의 시작·끝·인물·이미 확정된 사실·원고 길이·모델 | 일반 인물 설명과, 해당 장면에서 아는 사실·회상하는 경험·바라는 결과를 연결한 짧은 입력 | 반응이 그 인물답게 느껴지는지, 설명 없이 목적이 읽히는지, 장면이 늘어지지 않는지 |
| 3. 지적한 부분을 고친 퇴고 | 같은 초안·모델·수정 횟수·출력 한도 | 일반적인 개선 요청과, 독자가 멈춘 구간에 대한 구체적 수정 요청 | 수정 전후 어느 쪽을 읽고 싶은지, 좋은 대사·속도·보상까지 지워졌는지 |

실험 1부터 진행하고 결과를 보고 다음 실험의 필요성을 판단한다. 여러 방법을 한꺼번에 바꾸지 않는다. 입력 토큰·호출 수·시간·출력 길이도 함께 기록하고, 추가 비용으로 얻은 효과인지 구분한다. 결과의 순서와 생성 방법을 가리고 비교하며 무승부와 선호 이유도 남긴다. 세 사례는 다음 실험을 고르는 탐색용이며 일반적인 우월성을 증명하지 않는다. 유망한 방법만 피드백 작성에 쓰지 않은 다른 사례에서 다시 확인한다.

사람 검토 원문과 결정은 Storyyard의 출처를 유지한다. 참고작 분석은 Reference Lab, 계획·장면 실험은 Foundry, 제작 적용과 정본 변경은 InkOS의 기존 경계를 따른다. HQ 문서는 조사와 연결 제안만 소유한다. 이번 조사로 승인 상태, 제작 프롬프트, 예약 실행은 변경하지 않았다.

**조회 기록**

README와 선택한 소스는 당시 기본 브랜치의 커밋에 고정해 읽었다. 로컬 조사 사본은 `.firefly/research/humanlike-thinking-20260911/`에 있다. 아래 날짜는 기본 브랜치 HEAD 커밋의 UTC 날짜이며, 프로젝트 전체의 마지막 활동일이나 품질 점수가 아니다. 라이선스는 조회 메타데이터 기준이고, MCP는 실제 LICENSE의 전환 안내를 별도로 확인했다.

| 저장소 | 브랜치 | 조회한 HEAD | 커밋 날짜 UTC | 라이선스 |
|---|---|---|---|---|
| StanfordHCI/genagents | main | [96854071ef4c](https://github.com/StanfordHCI/genagents/commit/96854071ef4c2d79c93144c973c7820722d52bab) | 2024-11-18 | MIT |
| eriktmueller/daydreamer | master | [8acb2f37ef4d](https://github.com/eriktmueller/daydreamer/commit/8acb2f37ef4deae1da83b8cc7fb17375ea53a576) | 2022-01-05 | GPL-2.0 |
| gepa-ai/gepa | main | [0632cdb5dcc0](https://github.com/gepa-ai/gepa/commit/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407) | 2026-09-01 | MIT |
| google-deepmind/concordia | main | [e071b30446af](https://github.com/google-deepmind/concordia/commit/e071b30446af36598dcfb279ab500a2b4119435e) | 2026-09-10 | Apache-2.0 |
| joonspk-research/generative_agents | main | [fe05a71d3e4e](https://github.com/joonspk-research/generative_agents/commit/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4) | 2023-08-11 | Apache-2.0 |
| letta-ai/letta | main | [5bcdd177d70f](https://github.com/letta-ai/letta/commit/5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a) | 2026-09-10 | Apache-2.0 |
| letta-ai/letta-code | main | [2d99c28a632d](https://github.com/letta-ai/letta-code/commit/2d99c28a632d25370e5910905fec9865103aee0a) | 2026-09-10 | Apache-2.0 |
| madaan/self-refine | main | [9a206d41e5d2](https://github.com/madaan/self-refine/commit/9a206d41e5d2d0c241bb441f41eeadb945afaa55) | 2024-10-04 | Apache-2.0 |
| modelcontextprotocol/servers | main | [d73f99efbfd4](https://github.com/modelcontextprotocol/servers/commit/d73f99efbfd40c3aa1b61e88728b3d49fb52608f) | 2026-09-03 | MIT → Apache-2.0 전환 중; 문서 CC-BY-4.0 |
| noahshinn/reflexion | main | [218cf0ef1df8](https://github.com/noahshinn/reflexion/commit/218cf0ef1df84b05ce379dd4a8e47f17766733a0) | 2025-01-14 | MIT |
| princeton-nlp/tree-of-thought-llm | master | [8050e67d0e3a](https://github.com/princeton-nlp/tree-of-thought-llm/commit/8050e67d0e3a0fddc424d7fa5801538722a4c4cc) | 2025-01-16 | MIT |
| richards199999/Thinking-Claude | main | [7322bbf98279](https://github.com/richards199999/Thinking-Claude/commit/7322bbf982790dec7f0356bf330b79586110bac0) | 2026-04-07 | MIT |

MCP 라이선스 전환의 세부 적용은 해당 [LICENSE](https://github.com/modelcontextprotocol/servers/blob/d73f99efbfd40c3aa1b61e88728b3d49fb52608f/LICENSE)를 따른다. 이번 조사는 코드를 편입하지 않았다.
