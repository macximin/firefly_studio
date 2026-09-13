# 추가 학습 없이 사용할 수 있는 집필 시스템 조사

조사일: 2026-09-11 KST. 요청은 앞선 두 조사를 바탕으로, RLHF를 직접 하거나 새 집필 시스템을 설계하기에 앞서 누군가 이미 만들어 둔 구현을 찾는 것이다. [인간 같은 사고를 다룬 저장소 조사](2026-09-11-humanlike-thinking-repo-research.md)와 [실제 작가 원고 비교](2026-09-11-human-writer-quality-study.md)를 기준으로 후보를 좁혔다.

**있다. 완성된 앱 형태에서는 NovelWriter, 쓰면서 계획을 바꾸는 엔진으로는 WriteHERE가 이번 목적에 가장 가깝다.** 인물별 대사 검토와 퇴고는 AuthorAgent, 장면마다 다음 행동을 정하며 전개하는 방식은 StoryDaemon에 구현되어 있다. 범용 인물 인지 모듈로는 Cognitiv가 있다.

여기서 ‘추가 학습 없음’은 사용자가 별도의 RLHF·파인튜닝 작업 없이 기존 모델 API 또는 로컬 모델을 연결해 사용하는 방식이라는 뜻이다. 연결 모델의 원래 학습 이력이 RLHF와 무관하다는 주장은 아니다. 아래의 판단·기억·퇴고는 실행 중 프롬프트와 파일을 다루는 동작이며 모델 가중치 학습과 구분한다.

7개 후보의 조회 커밋을 고정하고 README·파일 구조·선택한 구현을 확인했다. 보조 후보 3개는 공식 README 수준에서 비교했다. 설치, API 호출을 통한 집필, 한국어 품질 평가, 출시·배포 검증은 하지 않았다. 따라서 ‘앱 형태로 구현됨’과 ‘현재 이 Mac에서 설치부터 집필까지 검증됨’을 구분한다.

## 먼저 볼 후보

| 후보 | 이미 구현된 내용 | 앞선 원고 조사와의 연결 | 사용 형태 |
|---|---|---|---|
| **[NovelWriter](https://github.com/tuxiangxianzhe/NovelWriter_public)** | 참고 텍스트의 문체·서사 패턴 분석, 분석 결과를 기획·회차 설계·본문에 전달, 작가 참고자료 검색, 장면별 생성, 회차별 즉흥 집필 | 장면 구성·대화·전개 속도를 참고 원고에서 분석해 집필 입력으로 옮기는 기능이 가장 직접적 | Vue/FastAPI 웹 앱. Python 3.12, 기본 회차 생성에는 모델·임베딩 설정 필요. 로컬 실행·Docker 경로 제공 |
| **[WriteHERE](https://github.com/principia-ai/WriteHERE)** | 이미 쓴 본문과 설계 결과를 읽어 현재 작업 목표를 갱신하고, 추가 설계가 필요하면 작업을 나눈 뒤 집필 | 쓰면서 드러난 내용에 따라 다음 선택을 고치는 절차. 작가의 계획 변경에 가까운 후보 | Python 엔진 및 웹 화면. 스토리 실행 진입점 제공. 영어 기본 설정 |
| **[AuthorAgent](https://github.com/Ckokoski/AuthorAgent)** | 기획·집필·수정 UI, 인물별 말투·지식 범위·동기 검토, 전문 수정 단계, 평가→진단→수정 서비스 | 인물마다 다른 목적과 정보가 대사에 유지되는지 검토. 기존 본문의 구체 약점을 고치는 도구 | Node 22 이상 기반 앱. 설정에서 모델 연결. 개별 검토 기능도 제공한다고 문서화 |
| **[StoryDaemon](https://github.com/EdwardAThomson/StoryDaemon)** | 장면 의도 결정→관련 맥락 회수→세부 계획→시점 인물 중심 집필, 인물·기억·목표 갱신, 다음 장면 반복 | 확정된 전체 대강을 계속 풀어 쓰는 것 외에 장면 진행에 따라 다음 일을 정하는 경로 | Python CLI. 장면 1개를 생성하는 `novel tick`, 이어서 실행·재개하는 명령 제공 |
| **[Cognitiv](https://github.com/swamprabbitlabs-dot/Cognitiv)** | 목표·규범·태도에 따른 감정 평가, 기분 변화, 연상 기억과 불완전한 회상, LLM용 기억 블록 | 같은 사건을 사람마다 다르게 받아들이고 현재 감정이 기억 선택에 영향을 주는 인물 부품 | Python 라이브러리. 완성 소설 앱은 아니며 입력 사건·모델 연결을 호출자가 구성 |

이 순위는 확인한 기능과 Firefly의 목적을 대조한 판단이다. 한국어 원고를 생성해 얻은 품질 순위가 아니다.

## 1. NovelWriter: 참고작을 집필 입력으로 바꾸는 기능이 가장 직접적

`analyze_narrative_dna()`는 참고 텍스트를 모델에 보내 분석하고, 결과에서 기획용·회차 설계용·본문용 지침을 따로 추출해 저장한다. `get_narrative_instructions()`가 이를 되읽고 생성 단계에 전달한다. 본문 생성에는 별도의 작가 참고자료 검색 경로도 있다. 이름만 있는 기능이 아니라 입력·저장·호출 코드가 연결되어 있다. [분석·저장 구현](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/web_server.py#L2879), [본문 입력 구현](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/novel_generator/chapter.py#L404).

즉흥 집필 모드는 회차 의도에서 한 회차의 설계와 원고를 만들고 미해결 이야기 요소를 갱신한다. 전체 줄거리를 먼저 끝내야만 시작할 수 있는 구조는 아니다. API에도 해당 경로가 있다. [즉흥 집필 모듈](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/novel_generator/improv.py#L86), [생성 API](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/api/routers/generate.py#L700).

적용을 판단할 때 중요한 한계도 코드에서 확인했다. **서사 분석 입력은 앞 5,000자로 잘린다.** 합본 전체를 넣어도 이 함수가 전 작품의 사고방식을 분석하는 것은 아니다. 참고자료 검색은 별도 경로이며 전권 독해를 대신하지 않는다. 또한 중국어 중심 프롬프트에는 장면 수와 심리 서술량 같은 고정 권고가 있다. 한국 웹소설에 그대로 맞는지 확인되지 않았다. [입력 제한](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/web_server.py#L2894), [기본 프롬프트](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/prompt_definitions.py#L1683).

**판정:** 별도 앱을 먼저 사용해 볼 후보 1순위. 이전 원고 조사에서 얻은 장면 구성과 반응 배치를 전달할 자리가 이미 있다. 다만 ‘조건상·서오·강동호를 분석하면 곧바로 그 수준으로 쓴다’는 증거는 없다. README의 Hermes/LangGraph 관련 항목은 향후 연결을 위한 도구 정의 준비라고 명시하므로 현재 Firefly 연결 완료로 해석하지 않는다.

## 2. WriteHERE: 작가의 작업 진행을 구현한 엔진

스토리 모드에는 설계와 집필 작업을 구분하는 설정이 있고, 이미 쓴 본문·전체 계획·설계 결과를 바탕으로 현재 목표를 갱신한다. 반환된 목표가 실제 작업 노드에 반영된다. 추가 설계가 필요하면 더 작은 작업을 만들고, 그렇지 않으면 집필로 진행한다. [스토리 설정](https://github.com/principia-ai/WriteHERE/blob/817b489008e4b5dd50d5008803992dcf81c4fa50/recursive/engine.py#L185), [목표 갱신 실행](https://github.com/principia-ai/WriteHERE/blob/817b489008e4b5dd50d5008803992dcf81c4fa50/recursive/agent/agents/regular.py#L172), [갱신 판단 프롬프트](https://github.com/principia-ai/WriteHERE/blob/817b489008e4b5dd50d5008803992dcf81c4fa50/recursive/agent/prompts/story_writing_wo_search_nl_version_english/write_combine_atom_and_update.py#L9).

따라서 앞선 조사에서 말한 ‘집필 중 발견한 것을 다음 설계에 반영’하는 동작을 처음부터 구현할 필요는 없다. 이 엔진을 독립적으로 실행할 수 있다. 다만 스토리 설정은 영어이고 단어 수 기준도 영어 중심이다. 특정 인물의 오해나 독자가 기다리는 반응을 자동으로 잘 선택한다는 별도 보장은 없다.

EMNLP 2025 논문과 소설 생성 평가가 있다. 그러나 소설 결과는 주로 LLM 비교 평가이고, 논문의 별도 사람 평가는 긴 보고서 과제다. 이를 사람 소설가를 이겼다는 증거로 읽지 않는다. 재귀 작업은 호출량도 늘린다. [논문과 평가 범위](https://arxiv.org/html/2503.08275v3#S6), [한계](https://arxiv.org/html/2503.08275v3#S7).

**판정:** ‘사람 작가처럼 작업을 진행하는 엔진’을 찾는 목적의 1순위. 새 프레임워크를 작성하기보다 공개 스토리 모드가 유효한지 먼저 볼 가치가 있다. 현재 조회 트리에는 독립 LICENSE 파일이 없고 README는 MIT를 표방한다. 코드 편입 시에는 그 상태를 확인해야 한다.

## 3. AuthorAgent: 인물 검토와 퇴고가 이미 묶여 있다

인물 서비스는 장의 대사를 인물별로 보고 말투 이탈, 알 수 없는 정보, 동기와 맞지 않는 발화를 검토하도록 구현되어 있다. 지식 범위의 근거에는 인물의 등장 회차와 관찰 기록을 사용한다. 이것은 초안을 쓰기 전 인물들이 스스로 상호작용하는 시뮬레이션과는 다른, 집필 후 검토 기능이다. [인물 검토 코드](https://github.com/Ckokoski/AuthorAgent/blob/47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c/gateway/src/services/character-agent.ts#L63).

`prose-evolver`는 원문 평가, 약점 진단, 수정, 재평가를 수행하고 점수가 더 높은 후보를 보존한다. 목소리와 작품 맥락을 입력에 유지하는 경로도 있다. 이는 텍스트 후보를 바꾸는 서비스이므로 사용자가 RLHF를 수행할 필요는 없다. 다만 모델 점수가 높은 후보를 골랐다는 사실이 실제 독자에게 더 재미있다는 뜻은 아니다. [수정 루프](https://github.com/Ckokoski/AuthorAgent/blob/47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c/gateway/src/services/prose-evolver.ts#L185).

**판정:** 인물별 대사 검토와 구체적인 퇴고를 이미 만든 앱에서 쓰고 싶을 때 유용한 후보. 제품 README의 ‘원고가 기기를 떠나지 않는다’는 문구는 클라우드 모델 API 호출까지 없다는 뜻으로 받아들이면 안 된다. 설정한 API로 본문을 보내는 경로가 있다. 한국어 대사 귀속·말투 분석 정확성은 이번에 검증하지 않았다.

## 4. StoryDaemon: 장면 하나씩 이어 가는 작동 구조

다단계 계획기는 장면 의도, 관련 맥락, 구체 계획을 순서대로 만들고 writer가 장면을 쓴다. writer context에는 시점 인물, 목표, 장소, 최근 본문과 요약이 들어간다. 전체 플롯을 먼저 고정하지 않고 진행하는 경로와 플롯 사건에서 출발하는 경로가 모두 있다. [계획기](https://github.com/EdwardAThomson/StoryDaemon/blob/aaba7d3af46f2aa7e449e5091803edb3b1ba73aa/novel_agent/agent/multi_stage_planner.py#L70), [집필 맥락](https://github.com/EdwardAThomson/StoryDaemon/blob/aaba7d3af46f2aa7e449e5091803edb3b1ba73aa/novel_agent/agent/writer_context.py#L26).

README의 ‘Scene Skeletons’는 고전 소설에서 측정한 단락 구조를 이용하는 실험 기능이며 기본 꺼짐으로 안내된다. 이것이 세 한국 작가의 방식이나 상업성을 구현했다는 근거는 아니다. 긴장 점수와 긴장 목표도 그 프로젝트가 택한 운용 방식이다. [기능·실행 안내](https://github.com/EdwardAThomson/StoryDaemon).

**판정:** 장면 단위 진행을 직접 살펴볼 후보. 원고의 판단 변화와 새로운 계획이 실제로 생기는지는 출력 독해가 필요하다. 공개 트리에 설치용 `setup.py`와 CLI가 있지만 이번에는 실행하지 않았다. README는 MIT를 표방하지만 연결된 독립 LICENSE 파일은 조회 트리에 없다.

## 범용 인물 부품: Cognitiv

`CognitiveBrain.perceive()`가 사건을 받아 목표·규범·태도와 대조하고 감정과 기억 상태를 갱신한다. `get_memory_prompt_block()`은 회상 결과를 LLM 입력으로 만든다. 기본 감정 평가는 태그·키워드 등을 쓰고 선택적으로 LLM callback을 연결한다. 이 코드 자체가 장면이나 원고를 쓰지는 않는다. [인지 상태 API](https://github.com/swamprabbitlabs-dot/Cognitiv/blob/f3aad875a77a3c7c522781e03acbb1944c3ab25c/cognitiv/brain.py#L203), [감정 평가 방식](https://github.com/swamprabbitlabs-dot/Cognitiv/blob/f3aad875a77a3c7c522781e03acbb1944c3ab25c/cognitiv/emotion.py#L410).

**판정:** 웹소설과 무관한 ‘사람처럼 반응하고 기억하는 코드’도 이미 있다. 다만 호출할 사건과 인물별 목표를 마련해야 하는 라이브러리여서, 완성 집필 앱을 찾는 현재 목적에서는 앞의 후보들 다음이다. 기본 키워드 처리의 한국어 적합성도 확인되지 않았다.

## 찾아봤지만 앞 순서에 놓지 않은 후보

| 후보 | 확인 결과와 우선순위를 낮춘 이유 |
|---|---|
| [NousResearch/autonovel](https://github.com/NousResearch/autonovel) | 설정·초안·독자 역할 평가·수정 지시·내보내기 스크립트가 있는 별도 소설 생산 시스템. `run_pipeline.py`에는 자동 전체 stage/commit과 hard reset 경로가 있다. 기존 레포 안에서 바로 실행할 후보로 잡지 않는다. ‘by Hermes Agent’라는 소개만으로 Firefly의 Hermes에 설치하는 플러그인이라고 보지 않는다. |
| [CogWriter](https://github.com/KaiyangWan/CogWriter) | 논문은 명시적으로 training-free다. 그러나 공개 PlanningAgent의 분기는 `Week`, `Floor`, `Menu Week`, `Block` 등 LongGenBench 과제에 맞춰져 있다. 완성 소설 앱으로 바로 쓰려면 추가 작업이 필요하다. |
| [StoryCraftr](https://github.com/raestrada/storycraftr) | 공식 README에 설치 가능한 CLI, 세계·개요·장 생성, OpenAI/OpenRouter/Ollama 연결이 있다. 범용 집필 도구 후보지만 이번에 찾는 참고작 서사 분석이나 유동적인 계획 선택의 직접 근거는 앞선 후보보다 약하다. README 수준 비교. |
| [AI_NovelGenerator](https://github.com/YILING0013/AI_NovelGenerator) | GUI·상태 추적·참고자료·장 생성 기능이 있는 기반 프로젝트. 이번 요구와 연결되는 추가 기능을 갖춘 파생판 NovelWriter를 먼저 검토했다. README의 리팩터링 예고를 기능 완료로 세지 않았다. README 수준 비교. |
| [Dramatron](https://github.com/google-deepmind/dramatron) | 극작가와의 연구 및 계층적 대본 생성 코드가 있으나 공개 Colab은 모델 연결이 빠진 상태로 제공되며 사용자가 `__init__`·`sample`을 구현해야 한다고 안내한다. 완성 도구를 바로 쓰려는 이번 요청에서는 후순위. README 수준 비교. |

autonovel의 자동 Git 동작은 [실제 코드](https://github.com/NousResearch/autonovel/blob/d165f267a0ffd34f3b0a70a8a72ac38cb8e4a542/run_pipeline.py#L158)에서 확인했다. 가상 독자 평가의 입력도 전체 본문을 항상 직접 읽는다고 일반화할 수 없으며 `reader_panel.py`는 Arc 요약을 입력받는다. [독자 패널](https://github.com/NousResearch/autonovel/blob/d165f267a0ffd34f3b0a70a8a72ac38cb8e4a542/reader_panel.py#L113).

CogWriter의 범위 판정은 [실제 task 분기](https://github.com/KaiyangWan/CogWriter/blob/dc3bf084e8733c951172cddd89fa4d7337121fdd/CogWriter_model/Agents/PlanningAgent.py#L8)와 [원 논문](https://arxiv.org/abs/2502.12568v3)을 함께 근거로 삼았다. 긴 제약 글쓰기의 성과를 소설의 재미로 해석하지 않는다.

## 이번 조사로 바꿀 선택

이제는 새 기억 시스템이나 피드백 학습을 먼저 설계할 이유가 약하다. **하나의 앱을 먼저 사용해 보려면 NovelWriter**, **글을 쓰는 도중 설계를 바꾸는 엔진이 목적이면 WriteHERE**, **초안의 인물 대사와 퇴고가 문제이면 AuthorAgent**로 좁힐 수 있다.

앞선 원고 조사에서 강동호의 보상 후 체감과 주변 반응, 서오의 상반된 속셈, 조건상의 판단 수정이 중요했다. 이 중 특정 기법을 자동으로 선택해서 세 작가 수준으로 구현한다고 검증된 제품은 이번 조사에서 확인하지 못했다. 그러나 그 선택을 입력·분석·수정하고 장면을 생성할 구현은 이미 존재한다. 새로운 RLHF 프로젝트는 이 후보들을 사용하는 데 필요한 선행 작업이 아니다.

이번 작업은 공개 코드와 문서의 추가 조사 및 기록이다. 기존 제작 설정·원고·승인 상태를 갱신하거나 설치·집필·자동 실행을 시작하지 않았다. 외부 원문 사본은 HQ의 Git 제외 조사 캐시에 보존했다. 정식 제작 연결은 기존 child 역할과 handoff 계약에 따라 판단해야 한다.

## 조회 커밋과 라이선스 상태

날짜는 확인한 기본 브랜치 HEAD의 UTC 커밋 날짜다. 전체 프로젝트의 최근 활동이나 품질 점수가 아니다. `null`은 GitHub가 라이선스를 식별하지 못했다는 뜻이므로 README와 파일 트리를 함께 확인했다.

| 저장소 | 조회 HEAD | 날짜 UTC | 확인한 라이선스 상태 |
|---|---|---|---|
| principia-ai/WriteHERE | `817b489008e4b5dd50d5008803992dcf81c4fa50` | 2026-09-03 | README는 MIT 표방, 독립 LICENSE 파일 없음 |
| tuxiangxianzhe/NovelWriter_public | `9e7fe179c29341f3d84785df118894c29abb1308` | 2026-05-26 | AGPL-3.0 |
| Ckokoski/AuthorAgent | `47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c` | 2026-07-11 | MIT |
| EdwardAThomson/StoryDaemon | `aaba7d3af46f2aa7e449e5091803edb3b1ba73aa` | 2026-07-29 | README는 MIT 표방, 독립 LICENSE 파일 없음 |
| swamprabbitlabs-dot/Cognitiv | `f3aad875a77a3c7c522781e03acbb1944c3ab25c` | 2026-04-16 | MIT |
| NousResearch/autonovel | `d165f267a0ffd34f3b0a70a8a72ac38cb8e4a542` | 2026-03-20 | 조회 범위에서 명시적 라이선스 확인 못 함 |
| KaiyangWan/CogWriter | `dc3bf084e8733c951172cddd89fa4d7337121fdd` | 2025-05-26 | MIT |

상세 메타데이터·README·선택한 소스는 `.firefly/research/ready-made-writing-20260911/`에 있다. 다운로드와 선택 구간 검토 기록은 그 안의 `research-receipt.json`에 보존한다. 파일 다운로드 수를 전체 코드 검토 범위로 계산하지 않는다.
