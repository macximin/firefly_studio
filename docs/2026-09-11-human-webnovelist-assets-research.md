# ‘웹소설 인간 작가’ 아젠다: 재사용 에셋 보강 조사

2026-09-11 KST · 상태: 조사·로컬 기록 완료, 적용 후보. 설치·집필 실험·품질 향상 검증은 수행하지 않았다.

앞선 [사고 구조 조사](2026-09-11-humanlike-thinking-repo-research.md), [원고 분석과 품질 연구](2026-09-11-human-writer-quality-study.md), [완성 집필 시스템 조사](2026-09-11-ready-made-writing-systems-research.md)를 보강한다. 이번에는 **이미 작성된 작법 파일, 작가의 선택 과정, 독자 취향 기록, 생활 소재**를 찾았다. 자체 RLHF나 새 집필 엔진 개발을 전제하지 않는다.

## 1. 먼저 볼 에셋

현재 우선순위는 아래와 같다. 이는 파일을 읽고 기존 원고 관찰에 대조한 판단이며, 생성 성능 순위가 아니다.

| 순서 | 에셋 | 가져올 수 있는 것 | 이번 아젠다에서의 쓰임 |
|---|---|---|---|
| 1 | [wgwtest/novel-writing](https://github.com/wgwtest/novel-writing) | 인물 인식·판단·발화, 장면 인과, 문체 보존 가이드 | 인물이 왜 그렇게 생각하고 말하는지 점검하는 가장 작은 출발점 |
| 2 | [haowjy/creative-writing-skills](https://github.com/haowjy/creative-writing-skills) | 독자 보상 관점, 문체 분석, 독자 시뮬레이션 스킬 | 작가가 어디에 지면을 쓰고 무엇을 독자에게 맡길지 판단 |
| 3 | [miserylee/webnovel-handbook](https://github.com/miserylee/webnovel-handbook) | 독백·Show/Tell 선택·일상·정보 재등장·독자 반응별 작법 문서 | 장면 종류에 맞는 참고 자료를 필요할 때 선택 |
| 4 | [MJbae/awesome-novel-studio](https://github.com/MJbae/awesome-novel-studio) | 한국어 캐릭터 대화 DNA, 관계·내면 검토표 | 같은 소식을 듣고도 서로 다른 계산과 대답을 하는 인물 |
| 5 | [Writing Excuses](https://writingexcuses.com/12-40-structuring-a-novel/) | 작가들의 구조·휴지·독자 감정에 대한 대화와 연습 과제 | 에셋의 작법 주장을 실제 작가의 작업 설명과 대조 |
| 6 | [Wordcraft Writers Workshop](https://wordcraft-writers-workshop.appspot.com/learn), [CoAuthor](https://coauthor.stanford.edu/) | 전문 작가 사용 경험 / 제안 선택·삭제·편집 이벤트 | 결과 문장뿐 아니라 무엇을 취하고 버렸는지 연구 |
| 7 | [LiteraryTaste](https://github.com/mj-storytelling/LiteraryTaste) | 개인별 선언 취향과 실제 문장 쌍 선택 | ‘좋아한다고 말한 조건’과 ‘실제로 선택한 글’을 구분 |
| 8 | [스토리테마파크](https://story.ugyo.net/front/sub01/sub0101.do), [One Stop for Writers](https://onestopforwriters.com/getting-started) | 기록에서 추출한 생활 사건 / 인물·감정·장면 참고 자료 | 인물의 체면·버릇·소유물·관계가 얽힌 구체적인 생활 재료 |

**가장 먼저 검토할 조합은 wgwtest의 인식·문체 보존 가이드 + haowjy의 짧은 문체 참고 파일 방식 + 한국어 대화 DNA다.** Handbook은 문제가 생긴 장면에 맞춰 찾아보는 사전으로 두는 편이 낫다. 여러 패키지의 규칙을 모두 넣으면 서로 충돌하고 실제 원고의 장점까지 지울 수 있다.

## 2. 작법 파일을 실제로 읽고 얻은 판단

### A. wgwtest: ‘안다’에서 멈추지 않고 판단과 발화까지

- [cognition-layers-and-language.md](https://github.com/wgwtest/novel-writing/blob/b6382cf7ff29caa83830646432d8010ca96120f5/novel-writing/references/cognition-layers-and-language.md#L11): 지식의 공유 범위와 출처, 관찰·전언·추론·의도·오해를 나눈다. 인물이 얻은 정보가 선택지를 어떻게 바꾸고, 상대에게 어디까지 드러나는지 확인한다. 매 장면 표를 작성하라는 방식도 아니다.
- [scene-causality-and-agency.md](https://github.com/wgwtest/novel-writing/blob/b6382cf7ff29caa83830646432d8010ca96120f5/novel-writing/references/scene-causality-and-agency.md#L22): 관찰과 해석이 다음 행동을 일으키는지, 앞뒤 장면의 상태가 연결되는지 진단한다. 충동·불복종도 가능하되 왜 이 사람이 지금 행동했는지가 읽혀야 한다.
- [style-fidelity.md](https://github.com/wgwtest/novel-writing/blob/b6382cf7ff29caa83830646432d8010ca96120f5/novel-writing/references/style-fidelity.md#L5): 독백·곁생각·반복·조금 흐트러진 문장이 목소리를 담당할 수 있으므로, 압축을 개선과 동일시하지 않는다.

**적합성 판단:** 조건상 표본에서 관찰한 판단 수정, 서오 표본의 서로 다른 속셈을 다루기에 좋다. ‘전문가라서 정확하다’, ‘작가가 아는 사실을 모두 안다’ 같은 평면화를 찾을 수 있다. 다만 인과가 자연스럽다고 그 장면이 재미있다는 결론은 나오지 않는다.

README가 Codex용 스킬로 안내하며 설치 단위는 `novel-writing/` 폴더다. MIT LICENSE를 확인했다. Markdown 참고 파일은 읽어서 활용할 수 있지만, 실제 설치 호환성과 한국어 집필 결과는 시험하지 않았다.

### B. haowjy: 작가의 주의 배분과 참고 문체를 에셋화

[writing-principles](https://github.com/haowjy/creative-writing-skills/blob/fd7a3ad9cd7697a0645ff6ff4bd5e809cf7673a3/skills/writing-principles/SKILL.md#L49)는 몰입·문장 즐거움·인물 이해·읽는 흐름·궁금증을 구분한다. 이 분류는 장면의 보상이 돈이나 승리 하나로 축소되는 것을 막는 검토 관점으로 쓸 만하다. [failure-modes](https://github.com/haowjy/creative-writing-skills/blob/fd7a3ad9cd7697a0645ff6ff4bd5e809cf7673a3/skills/writing-principles/resources/failure-modes.md)는 성급한 화해, 인물 목소리의 평준화, 상투적 몸짓을 구체적으로 짚는다.

특히 [style-analysis.md](https://github.com/haowjy/creative-writing-skills/blob/fd7a3ad9cd7697a0645ff6ff4bd5e809cf7673a3/skills/creative-writing-craft/resources/style-analysis.md#L14)가 유용하다. 미리 정한 문체 분류를 강요하지 않고 작품에서 실제로 달라지는 축을 찾는다. 참고 파일을 짧은 원리·대표 근거·회차 위치로 구성하고, 인물과 장면 종류에 따라 필요한 파일만 고르게 한다. **‘조건상체’처럼 하나의 평균값으로 뭉개지 않고, 대화·오판·휴식 등 기능별로 참고할 수 있다는 점**이 좋다.

[reader-sim](https://github.com/haowjy/creative-writing-skills/blob/fd7a3ad9cd7697a0645ff6ff4bd5e809cf7673a3/skills/reader-sim/SKILL.md#L11)은 지정된 취향과 지식 범위로 첫 독자의 반응을 읽고, 흥미·이탈 지점을 본문에 연결한다. **합성 반응**이므로 인간 독자의 연독·구매 의향을 대신하지는 못한다.

Apache-2.0 LICENSE 확인. 전체 패키지는 Meridian·Claude Code/Cowork 등의 실행 방식과 다른 스킬 의존성을 갖는다. 일부 문서만 복사하면 완성 시스템이 된다고 볼 수 없다. 특히 README의 `llm-writing` 설명과 달리 이번 고정 커밋의 `cw/skills/llm-writing/SKILL.md`에는 일반 설명문용 ‘답을 먼저’ 규칙도 있다. 소설에 통째 적용할 대상으로 추천하지 않는다. ‘학습이 이런 실패를 유발한다’는 문구도 저장소의 해석이며 이번 조사에서 인과를 검증한 사실이 아니다.

### C. webnovel-handbook: 지금 부족한 작법 항목이 이미 문서로 있다

MIT LICENSE 확인. 저장소 안의 다음 파일을 우선 읽을 자료로 추렸다. 아래 번호는 그 저장소의 문서 번호다.

| 문서 | 확인한 내용 | 현재 원고 연구와의 연결 |
|---|---|---|
| [89 독백·인지 필터](https://github.com/miserylee/webnovel-handbook/blob/700b2a718c9d3c79f946b35abc7b037088532bac/docs/advanced-craft/89-internal-monologue-cognition-emotion-filtering.md) | 압력 아래서 무엇을 보고 오해하고 선택하는지, 독백이 필요한 상황 | 내면을 삭제하기보다 판단을 경험하게 하는 부분 보존 |
| [93 장면·요약·설명·생략 선택](https://github.com/miserylee/webnovel-handbook/blob/700b2a718c9d3c79f946b35abc7b037088532bac/docs/advanced-craft/93-scene-summary-exposition-show-tell-selection.md) | 독자가 직접 겪어야 하는 것과 알아두면 되는 것 구분 | 중요한 대가·반응에 지면을 쓰고 반복 절차는 압축 |
| [62 일상·휴식·여파](https://github.com/miserylee/webnovel-handbook/blob/700b2a718c9d3c79f946b35abc7b037088532bac/docs/storycraft/62-everyday-transition-low-intensity-anti-padding.md) | 낮은 강도의 장면도 관계·생활감·앞선 사건의 여파를 담당 | 강동호 표본의 성과 이후 생활·대우 변화 검토 |
| [97 옛 정보 재등장](https://github.com/miserylee/webnovel-handbook/blob/700b2a718c9d3c79f946b35abc7b037088532bac/docs/advanced-craft/97-recap-reentry-old-information-reactivation.md) | 이전 정보가 현재 선택·위험·관계에 다시 작용하게 함 | 시스템 기억뿐 아니라 며칠 쉬고 돌아온 독자의 기억 고려 |
| [95 독자 반응 진단](https://github.com/miserylee/webnovel-handbook/blob/700b2a718c9d3c79f946b35abc7b037088532bac/docs/advanced-craft/95-reader-feedback-symptom-diagnosis-routing.md) | 독자의 체감, 원인 추측, 수정 처방을 구분 | ‘지루하다’는 체감은 보존하면서 엉뚱한 문장만 고치는 일을 줄임 |

이 저장소는 여러 작법 자료를 중국어 웹소설용으로 정리한 **작성자의 편집물**이다. `상태: 확인됨` 같은 내부 표기를 외부 검증으로 읽으면 안 된다. 회차 수·비율·남녀 독자 구분·플랫폼 전제는 한국어 작품에 그대로 옮길 기준이 아니다. 이번에는 선택한 문서의 관련 구간을 읽었으며 307개 파일 전체를 검토하지 않았다.

### D. Awesome Novel Studio: 한국어 ‘대화 DNA’는 유망, 전체 규칙은 선별 필요

[character-dialogue-dna.md](https://github.com/MJbae/awesome-novel-studio/blob/bb720652a3ef0aadebe731309a4bc8d21a686aa4/skills/rewrite/references/character-dialogue-dna.md#L25)는 사고 방식·정보 처리·설득되는 방식·감정이 새는 순간을 인물별로 정리한다. 좋은 소식, 위기, 갈등에서 대사 구조가 달라지는 참고표도 있다. 말끝만 바꾸는 캐릭터 구분보다 이번 아젠다에 가깝다.

[character-embodiment-rubric.md](https://github.com/MJbae/awesome-novel-studio/blob/bb720652a3ef0aadebe731309a4bc8d21a686aa4/skills/rewrite/references/character-embodiment-rubric.md#L29)의 내면·관계 항목은 행동과 선택에 동기가 반영되는지, 관계가 대우·호칭에 드러나는지 확인하는 질문으로 활용할 수 있다. 평균점수와 PASS 문턱은 인간 품질 기준으로 검증되지 않았다.

같은 패키지의 [creation-principles.md](https://github.com/MJbae/awesome-novel-studio/blob/bb720652a3ef0aadebe731309a4bc8d21a686aa4/skills/create/references/creation-principles.md#L12)에는 직접 설명 금지, 2~4장면, 고긴장 3연속 금지, 대화 뒤 행동 삽입 같은 강한 규칙이 있다. [대화 DNA](https://github.com/MJbae/awesome-novel-studio/blob/bb720652a3ef0aadebe731309a4bc8d21a686aa4/skills/rewrite/references/character-dialogue-dna.md#L78)에도 같은 사고 경로를 화당 두 번까지만 허용하는 제한이 있다. **앞서 읽은 사람 원고의 독백·직접 설명·의도적 반복까지 손상할 수 있으므로 전체 집필 규칙의 일괄 채택은 추천하지 않는다.**

Apache-2.0 LICENSE 확인. Claude Code 플러그인이다. README의 출판 계약·조회수 주장은 제작자의 자기 보고이며 작품·계약·성과 원인을 독립 검증하지 않았다. 한국어로 작성되었다는 사실과 한국 웹소설 품질이 입증되었다는 주장은 다르다.

## 3. 사람의 실제 선택을 볼 수 있는 자료

### Wordcraft Writers Workshop — 전문 작가의 사용 경험

[공식 워크숍 설명](https://wordcraft-writers-workshop.appspot.com/learn)은 영어권 전문 작가 13명이 8주 동안 자유롭게 도구를 사용한 경험을 다룬다. 결과를 바로 채택하기보다 각자 용도를 찾았고, 아이디어 탐색과 국소적인 도움, 일관된 방향·취향을 유지하는 어려움 등이 기록돼 있다. 작가별 사용 요구도 같지 않았다.

**활용 판단:** 어떤 제안을 ‘잘 썼다’고 평가하는지 외에, 자기 작품에 왜 맞지 않는지와 어디까지 도움을 받는지를 연구하는 자료다. 2022년 LaMDA 기반 경험을 현재 모델의 한계로 단정할 수 없다. 공개 설명·작품 모음은 확인했지만 전체 인터뷰 원자료나 모든 수정 이력이 공개되어 있다고 확인한 것은 아니다. 워크숍 글을 공개 학습 코퍼스로 재배포할 권리도 별도다.

### CoAuthor — 채택·삭제·편집 이벤트가 실제로 남아 있다

[공식 자료](https://coauthor.stanford.edu/)는 63명, 영어 글쓰기 1,445세션을 제공한다. 그중 창작은 830세션이고 나머지는 논증문이다. 참여자는 자격 심사를 거친 크라우드 작업자이며 전문 소설가 집단이 아니다.

이번에는 [세션 8911f](https://coauthor.stanford.edu/replay/?session_id=8911f32aab914a1f903bb76300b13949)의 JSONL을 직접 열었다. 이벤트 1,649개, `suggestion-get` 19개, `suggestion-select` 18개, `text-delete` 83개가 있었다. 시각, 문서 상태, 편집 변화, 후보와 선택 인덱스가 기록된다. 삭제 이벤트 수는 문장 수나 ‘나쁜 문장’ 수가 아니다.

**활용 판단:** 완성 원고로는 보이지 않는 선택·수정 순서를 살펴보는 과정 에셋이다. 이벤트만으로 사람의 속마음이나 거절 이유까지 알 수는 없다. [인터페이스 코드](https://github.com/minalee-research/coauthor-interface)는 MIT이지만, 그 라이선스를 데이터에 자동 적용하지 않았다. 데이터의 별도 재사용 조건은 확인이 남았다.

### LiteraryTaste — 말한 취향과 실제 고른 글을 구분

[공식 저장소](https://github.com/mj-storytelling/LiteraryTaste/tree/5b4d67683c3c83be9346b105e163620881f77b19)에서 CSV 두 개를 실제 확인했다. 비교 과제 2,000개, 응답 6,300행 중 쌍 비교 6,000행·설문 300행, 참여자 60명이며 각자 100쌍을 평가했다. A/B 외에 확신 없음과 자유 응답 항목이 있다. 인간 원문과 LLM 관련 출처가 섞여 있으므로 모든 글을 인간 작가의 정답으로 볼 수 없다.

[논문](https://arxiv.org/abs/2511.09310)은 선언 취향만으로 실제 선택을 설명하는 데 한계가 있음을 보고한다. **활용 판단:** 모델 학습보다 사람 검토 기록의 설계 참고로 우선 가치가 있다. ‘산업 운영은 싫다’ 같은 문장만 저장하는 것보다, 당시 읽은 본문·선택·이유·적용 범위를 함께 남기는 쪽이다. 저장소에 LICENSE가 없어 원문 데이터의 재배포·제품 편입은 보류 대상으로 기록했다. 이번에는 로컬 연구 캐시에만 보관했다.

## 4. 작가의 연습과 생활 재료

### Writing Excuses — 읽어서 적용할 수 있는 작가의 질문

아래는 실제 작가들이 참여한 공식 대화와 과제다. 영어권 출판 소설의 경험이므로 한국 연재의 보편 법칙으로 사용하지 않는다.

- [10.14 시작부의 약속](https://writingexcuses.com/writing-excuses-10-14-how-much-of-the-beginning-needs-to-come-first/): 시작이 독자에게 무엇을 기대하게 하는지 다룬다. 같은 시작의 약속을 달리해 보는 연습 자료다.
- [12.40 장편의 구조](https://writingexcuses.com/12-40-structuring-a-novel/): 사건의 결과와 진행 방향, 인물·독자가 반응할 공간, 집필 중 필요한 분량을 발견하는 작업을 설명한다. 휴지의 길이가 반드시 한 장면이나 한 회차로 고정되지도 않는다.
- [17.34 대사의 이면](https://writingexcuses.com/17-34-developing-subtext/): 말한 내용과 전달하려는 것, 감정 상태와 상황을 함께 다룬다. 침묵·몸짓을 일정 간격마다 삽입하는 처방과 구분해서 읽을 자료다.

전문 전재용 라이선스는 확인하지 않았으며 링크와 짧은 재서술로 기록한다.

### 스토리테마파크 — ‘실제로 살던 사람’의 사소한 선택

한국국학진흥원의 [테마스토리](https://story.ugyo.net/front/sub01/sub0101.do)는 가족 갈등·거래·노동·질병·과거·여행 등으로 생활 기록을 찾아보게 한다. 목록의 제목만 보지 않고 [‘망건을 기워 쓰며 비웃음을 감내하다’](https://story.ugyo.net/front/sub01/sub0104.do?chkId=S_KYH_E190) 항목의 이야기와 원문 번역·출전도 읽었다. 김주현의 『정강일기』 1942년 12월 20일 기록이다.

이 사례에서는 선물 받은 물건의 수선, 남의 시선, 자기 방식의 응수가 함께 나온다. **활용 판단:** ‘자존심이 세다’는 성격표보다, 어떤 물건을 버리지 못하고 남의 조롱을 어떻게 받아넘기는지 탐색하는 재료가 된다. 사이트의 재구성 설명과 원문 번역은 구분해야 한다. 사건을 현재 재벌물에 그대로 옮기는 대신 생활의 선택 구조를 참고할 수 있다. 공개 열람은 확인했지만 사이트 전체의 일괄 수집·재배포 허가는 확인하지 않았다.

### One Stop for Writers — 감정·직업·관계·장면 참고 라이브러리

[공식 안내](https://onestopforwriters.com/getting-started)에서 감정과 인물 특성·동기·직업·설정 관련 참고 자료, Character Builder, Scene Maps, worksheets를 확인했다. [Character Builder](https://onestopforwriters.com/about-character-builder)는 목표·욕구·비밀·배경을 연결해 인물을 개발하는 도구로 설명되어 있다.

**활용 판단:** 인물별로 다르게 반응할 구체적인 행동·환경 후보를 찾는 작가용 참고 서가다. 감정마다 몸짓 하나를 고정하면 다시 상투화되므로 장면의 이해관계와 선택을 먼저 둔다. 구독형 서비스이며 공개 안내·샘플 범위만 조사했다. 유료 내부 DB를 읽거나 구입하지 않았고, 오픈소스·다운로드 가능 코퍼스로 분류하지 않는다. 인간 심리를 정확히 시뮬레이션한다는 성능 증거도 아니다.

## 5. 발견했지만 우선순위를 낮춘 후보

| 후보 | 확인한 장점 | 보류하거나 좁혀 쓸 이유 |
|---|---|---|
| [qingyabailu-git/webfiction-write](https://github.com/qingyabailu-git/webfiction-write) | [fiction-learn](https://github.com/qingyabailu-git/webfiction-write/blob/2c0128db58a608c27177b63d012ae4011f230967/skills/fiction-learn/SKILL.md)은 사용자가 인정한 패턴을 JSON에 추가. 문체 프로필은 출처 회차와 원문 앵커를 요구 | 가중치 학습 없는 기록 재사용. 이미 있는 공정을 중복할 수 있다. 전체 사용에는 Python scripts와 자기 프로젝트 구조가 필요. 프로필의 긴 원문 조각은 현재 공개 HQ 문서에 복사할 대상이 아님 |
| [lingfengQAQ/webnovel-writer](https://github.com/lingfengQAQ/webnovel-writer) | [webnovel-learn](https://github.com/lingfengQAQ/webnovel-writer/blob/878ce26e1d544f5c9c7c210b710adf3587ab90d9/webnovel-writer/skills/webnovel-learn/SKILL.md)에도 같은 종류의 패턴 저장 절차 | 앞 후보가 명시적으로 참고한 계열이라 독립적인 효과 증거 두 개로 세면 안 됨. GPL-3.0. 이번에는 작성·학습 스킬 문서를 확인했고 실행은 하지 않음 |
| [tance-mang/chinese-webnovel-skills](https://github.com/tance-mang/chinese-webnovel-skills) | `references/`에 사람 냄새·감정·후킹·기억 자료가 분리됨. MIT | [human-texture](https://github.com/tance-mang/chinese-webnovel-skills/blob/ecf552f6930e769d8bbf17818ad3d5a864a7a70b/references/human-texture.md)는 비합리성과 통제 상실을 지나치게 일반화. [ai-detector](https://github.com/tance-mang/chinese-webnovel-skills/blob/ecf552f6930e769d8bbf17818ad3d5a864a7a70b/references/ai-detector.md)의 추정 비율·점수는 인간성 측정이 아님 |
| [mane23-ai/claude-novel-skill](https://github.com/mane23-ai/claude-novel-skill) | [한국어 독자 지식표](https://github.com/mane23-ai/claude-novel-skill/blob/8367d39081405c174647751710ebdd559a1ed9d4/guides/reader-experience.md)가 앎·의심·모름·오해를 구분 | 몇 회차 안에 반드시 해소 같은 고정 규칙, README의 다른 계정 clone 주소. README는 MIT라고 하지만 LICENSE 파일·API 라이선스 확인은 안 됨 |
| [im-not-ai](https://github.com/epoko77-ai/im-not-ai) | 한국어 번역투와 표현 진단에 초점. 현재 README에 Codex 경로 안내도 있음 | 기존 조사와 겹치는 윤문 계층. 무엇을 쓰고 독자에게 무엇을 기다리게 할지는 해결하지 않음 |
| [에듀코카 웹소설 IP 클래스 공지](https://edu.kocca.or.kr/edu/progrm/master/list.do?menuNo=500216&prgCl=12&prgSe=01) | 한국 장르 창작자 교육의 공식 조사 출발점 | 확인한 과정은 2025년 모집 마감. 현재 즉시 읽을 강의 본문·실습 에셋을 확보하지 못해 추천 묶음에서 제외 |

## 6. ‘인간 작가’ 아젠다에서 더 조사할 빈틈

이번 발견으로 채워진 부분과 여전히 없는 부분을 구분해야 한다. 아래는 후속 조사 우선순위이며 아직 실행한 작업이 아니다.

| 우선 | 남은 질문 | 다음에 볼 자료와 방법 | 얻어야 할 에셋 |
|---|---|---|---|
| 1 | 같은 작가도 언제 독백을 길게 쓰고 언제 끊는가? | 기존 5작품·22회차 관찰을 기능별로 재분류하고, 허가된 원고에서 중후반·패배·휴식·회수 장면을 더 읽기 | 작가 이름 하나의 문체표 대신 장면 기능별 원리와 근거 위치 |
| 2 | 작가는 처음 떠오른 전개를 왜 버리는가? | CoAuthor의 선택 전후와 전문 작가의 편집 회고 대조. 우리 작업에서는 승인된 초안·수정안·당시 이유를 연결 | 유지한 것·버린 것·이유가 붙은 수정 사례. 속마음을 임의 추정하지 않기 |
| 3 | 한국어 관계가 대사에서 어떻게 드러나는가? | 같은 인물의 공적/사적 자리, 친한 상대/처음 보는 상대, 성공 전/후 대화 대조 | 호칭·말끝·생략·거절·완곡함이 관계와 함께 바뀌는 사례 |
| 4 | 성공 뒤 무엇을 더 보고 싶게 만드는가? | 큰 보상 직후 몇 회차의 주변 반응·생활 변화·새 욕심 추적 | ‘성과→남의 대우→주인공의 체감→다음 선택’의 실제 연결 사례 |
| 5 | 장기 연재에서 독자가 무엇을 잊고 지루해하는가? | 공개된 합법적 독자 반응과 실제 읽은 본문을 함께 대조. 표본·플랫폼·노출 차이를 기록 | 재등장 인물·옛 정보·반복 보상·이탈 위치에 대한 범위가 붙은 메모 |
| 6 | 자료를 추가하면 정말 좋아지는가? | 앞선 보고서의 동일 입력·조건 비교를 적용하되 우선 에셋 한 종류만 바꾸기 | 사람의 선택·무승부·근거 위치. AI 점수 상승만으로 채택하지 않기 |

기존 독해는 도입·초기 진행에 치우쳐 있다. 특히 긴 연재의 반복 피로, 오래 미뤄 둔 보상 회수, 실패한 선택을 수습하는 능력을 아직 충분히 보지 못했다. 외부 패키지의 ‘장편 지원’ 문구로 이 빈틈을 채웠다고 할 수 없다.

또한 사람다운 인물은 늘 비합리적이거나 장황할 필요가 없다. 능숙하게 계산하면서 자기에게 유리하게 해석할 수도 있고, 조용한 일상 장면이 가장 큰 만족을 줄 수도 있다. 세 작가의 관찰을 하나의 도덕관·문장 길이·보상 주기로 통합하지 않는다.

## 7. 기존 도구와 어떻게 연결해서 검토할 것인가

| 앞선 시스템 후보 | 이번 에셋의 용도 | 연결 시 확인할 것 |
|---|---|---|
| NovelWriter | 원문 분석에서 얻은 문체 자료를 haowjy 방식의 기능별 참고로 비교 | 현재 분석 입력의 앞부분 제한이 장면 다양성을 놓치는지. 스타일 요약만으로 장기 작법을 안다고 하지 않기 |
| WriteHERE | 재계획할 때 wgwtest의 인물 판단, Writing Excuses의 독자 기대 관점을 참고 | 실제로 선택한 장면이 달라지는지. 계획 설명만 길어지는 것은 개선으로 세지 않기 |
| AuthorAgent | 문체 보존·관계별 대사 자료로 수정 제안 검토 | 목소리를 살린 수정인지, 특징 있는 독백을 평준화했는지. 자체 점수와 사람 선택 분리 |
| InkOS/Foundry 현행 작업 | 짧은 작법 참고와 그때 읽은 본문·사람 피드백을 묶는 후보 | 기존 계약과 제작 소유권 안에서 별도 비교 후 판단. 외부 스킬의 자동 commit·정본 갱신 지시는 가져오지 않기 |

이는 연결 가능성에 대한 제안이다. 어댑터·플러그인 설치나 제작 입력 연결을 완료했다는 뜻이 아니다. HQ는 외부 에셋 목록과 라우팅, Reference Lab은 실제 원고의 파생 분석, Foundry는 소유자 지시 기획 실험, Storyyard는 사람 결정 기록, InkOS는 제작 실행과 정본을 소유한다.

## 8. 조회 고정점과 저장 범위

GitHub 검색의 오래된 설명과 live README가 다른 사례가 있었다. 아래는 2026-09-11에 API로 확인한 커밋이다. 파일 수는 전체 검토량이 아니라 원격 tree의 blob 수다.

| 저장소 | 고정 커밋 | 최근 커밋 날짜 UTC | 라이선스 파일 확인 |
|---|---|---|---|
| wgwtest/novel-writing | `b6382cf7ff29caa83830646432d8010ca96120f5` | 2026-08-24 | MIT |
| haowjy/creative-writing-skills | `fd7a3ad9cd7697a0645ff6ff4bd5e809cf7673a3` | 2026-08-08 | Apache-2.0 |
| miserylee/webnovel-handbook | `700b2a718c9d3c79f946b35abc7b037088532bac` | 2026-06-14 | MIT |
| MJbae/awesome-novel-studio | `bb720652a3ef0aadebe731309a4bc8d21a686aa4` | 2026-04-14 | Apache-2.0 |
| qingyabailu-git/webfiction-write | `2c0128db58a608c27177b63d012ae4011f230967` | 2026-07-31 | MIT |
| lingfengQAQ/webnovel-writer | `878ce26e1d544f5c9c7c210b710adf3587ab90d9` | 2026-08-31 | GPL-3.0 |
| tance-mang/chinese-webnovel-skills | `ecf552f6930e769d8bbf17818ad3d5a864a7a70b` | 2026-06-13 | MIT |
| mane23-ai/claude-novel-skill | `8367d39081405c174647751710ebdd559a1ed9d4` | 2026-04-07 | README 표기만 MIT |
| mj-storytelling/LiteraryTaste | `5b4d67683c3c83be9346b105e163620881f77b19` | 2025-11-12 | 없음 |
| minalee-research/coauthor-interface | `6a0e859e59593078048f5d0c0c1d208fa2112e57` | 2024-05-24 | 코드 MIT, 데이터에 대한 판단 아님 |

10개 저장소의 메타데이터·tree·README 및 존재하는 LICENSE를 보관했다. 작법·스킬 참고 파일 41개를 선별 수집하고 위 논점에 해당하는 구간을 읽었다. 그 외 LiteraryTaste CSV 2개는 구조·행 수를, CoAuthor 1세션은 이벤트 구조·수를 확인했다. 모든 패키지를 전수 독해하거나 실행한 조사가 아니다.

- 후속 작업용 [에셋 목록 JSON](evidence/2026-09-11-human-webnovelist-assets.json): 사용 목적·근거 URL·권리 상태·확인 수준.
- 원격 파일·웹 열람 캐시와 검사 기록: `.firefly/research/human-webnovelist-assets-20260911/` (Git 제외).
- 이번 보고서에는 외부 소설 본문, 내부 원고, 참가자별 응답 원문을 싣지 않았다. 기존 보고서의 해시와 독해 증거를 보존하기 위해 이전 문서는 수정하지 않았다.

조사 시점의 라이선스 표기 확인과 제품에 편입할 수 있다는 판단은 구분한다. 상용 서비스·번역문·제3자 발췌에는 저장소 코드와 다른 조건이 적용될 수 있다. 이번 완료 범위는 **재사용 후보의 식별, 실제 파일 확인, 기존 원고 관찰과의 연결, 후속 질문의 구체화**다.
