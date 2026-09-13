# 웹소설 인간 작가 연구 자료

사람 웹소설 작가의 판단과 문장을 배우기 위한 2026-09-11 조사와 2026-09-12 설계·구현 자료다. 자료의 존재, 본문 열람, 코드 적용과 독자 품질 검증을 구분한다. 조사 전체를 제작 규칙으로 자동 채택한 것은 아니다.

**현재 단계:** 시간 제한 해제 후 남은 실행 경로의 구현과 전체 검증을 마쳤다. 작품 의도·장면 선택·정보 공개와 보상·초고 발견·퇴고 경험·기획 전달을 기존 InkOS 호출과 저장에 연결했다. Core 2,929개와 CLI 355개를 포함한 14단계가 통과했다. [현재 완료 기록](2026-09-12-human-webnovelist-continuation.md)과 [현재 18작업 대조표](evidence/2026-09-12-human-webnovelist-continuation-coverage.json)를 먼저 읽는다. 새 사람 검토나 반복 장면 생성은 필요하지 않았고, 독자 품질 향상은 별도로 검증하지 않았다.

| 문서 | 다룬 질문 |
|---|---|
| [실제 구현과 사용법](2026-09-12-human-webnovelist-implementation.md) | 무엇이 코드에서 달라졌고, 열 개 설계 영역 중 어디까지 연결했는가 |
| [작법 사례·중후반 장면 팩](../edge_repos/firefly_reference_lab/craft_packs/korean-author-craft/README.md) | 작법 15사례와 실제 6구간을 어떤 문제에 참고하며 한계는 무엇인가 |
| [자료·원문 연결 검증](evidence/2026-09-12-author-craft-assets-v2.json) | v2 출처 8개·사례 15개·단계별 입력 36개·원문 6구간의 재현 가능한 대조 |
| [문제 표현별 자료 선택](evidence/2026-09-12-author-craft-retrieval-probes-v2.json) | 작법 용어를 바꿔 말했을 때의 누락과 무관한 문장 오탐을 보강한 개발용 32문제 |
| [현재 설계 18작업과 실제 코드 대조](evidence/2026-09-12-human-webnovelist-continuation-coverage.json) | 시간 제한 해제 후 구현·제한·전체 검증. 원래 조사 채택 표시는 보존 |
| [첫 단계의 18작업 대조](evidence/2026-09-12-human-webnovelist-implementation-coverage.json) | 입력 연결 중심의 첫 완료 시점 이력 |
| [2시간 자동 구현 기록](2026-09-12-human-webnovelist-two-hour-run.md) | 사람 HIL 대기 없이 실제 입력 경로·자료·한국어 검색·피드백 본문 연결과 자동 검증 |
| [인간 작가 전체 구현 설계](2026-09-12-human-webnovelist-full-design.md) | 조사한 능력 열 개 영역, 기존 시스템 재사용, 데이터 흐름, 작업 18개와 비교 실험 |
| [자료별 구현 연결표](evidence/2026-09-12-human-webnovelist-research-implementation-map.json) | 자료별로 연결할 기능·사용 범위·보류 이유. 목록의 중복과 미열람 범위 보존 |
| [전체 설계 검증 기록](evidence/2026-09-12-human-webnovelist-full-design-validation.json) | 기존 자료 보존, 연결 누락·경로·Git 상태 확인 |
| [초기 구현 계획](2026-09-12-human-webnovelist-implementation-plan.md) | 작은 작법 입력과 비교를 중심으로 한 첫 착수안. 전체 설계로 보강되기 전 기록 |
| [구현 계획 기준 기록](evidence/2026-09-12-human-webnovelist-plan-baseline.json) | 계획 작성 시점의 로컬 커밋, 확인한 코드와 연구 자료의 해시, 실행 범위 |
| [사람처럼 생각하는 저장소](2026-09-11-humanlike-thinking-repo-research.md) | 기억·성찰·인물 시뮬레이션이 작가의 선택을 얼마나 보조하는가 |
| [작가 원고와 품질 연구](2026-09-11-human-writer-quality-study.md) | 내부 실제 원고에서 무엇을 배울 수 있는가 |
| [조건상·서오·강동호 상세 분석](../edge_repos/firefly_reference_lab/comparisons/2026-09-11-author-thinking-and-prose.md) | 5작품의 22개 회차 단위에서 관찰한 사고·서술·보상. Reference Lab 소유 |
| [이미 만들어진 집필 시스템](2026-09-11-ready-made-writing-systems-research.md) | 별도의 RLHF 없이 사용할 기존 시스템과 구현의 한계 |
| [작가를 위한 에셋](2026-09-11-human-webnovelist-assets-research.md) | 작법 스킬, 사람의 작성·선택 기록, 독자 취향, 생활 자료 |
| [웹소설 작법론 채널 조사](2026-09-11-webnovel-craft-channels-research.md) | GitHub·한국 작가·플랫폼 교육·책·강의·영상·팟캐스트·학술·커뮤니티를 비교해 적용할 판단 |
| [작법론 자료 목록 JSON](evidence/2026-09-11-webnovel-craft-channels.json) | 자료별 URL, 읽은 범위, 한계, 우선순위, 새 저장소 커밋과 파일 |
| [정룡필 블로그·디씨 작법 보강](2026-09-11-jeongryongpil-dc-craft-research.md) | 정룡필의 기획 과정, 노쓰우드 재게시, 웹연갤 정보격차·대화·조연 유지, 장르소설 연재 갤러리 |
| [블로그·디씨 추가 자료 목록](evidence/2026-09-11-jeongryongpil-dc-craft.json) | 개별 글의 원출처·작성자·열람 범위·적용 질문과 재게시 관계 |
| [한국 웹소설 작가 마인드 보강](2026-09-11-korean-webnovelist-mind-supplement.md) | 기존 조사의 충분성, 한국 창작자 인터뷰 7건, 서로 다른 기획·퇴고·독자 대응 판단 |
| [작가 판단 카드](korean-webnovelist-decision-cards.md) | 막힌 장면에 골라 쓸 10개 질문과 반례, 선택·수정 기록 예시 |
| [조건상·서오·강동호 중·후반 비교](../edge_repos/firefly_reference_lab/comparisons/2026-09-11-author-craft-mid-late.md) | 중·후반 6회차와 연결 확인 1회차·부분 구간. Reference Lab 소유 |
| [한국 작가 마인드 추가 자료 목록](evidence/2026-09-11-korean-webnovelist-mind.json) | 출처별 실제 열람 범위, 이해관계, 충분성 판단과 남은 질문 |

바로 읽을 공개 자료는 탄마 자료실, 정무늬·달새울 인터뷰, 카쿠요무 작품 강평, 番茄의 작가 강의다. 구체적인 선택 이유와 원문 링크는 최신 채널 조사에 있다. 책·유료 강의·비공개 커뮤니티·접근되지 않은 영상은 본문을 읽은 자료와 구분했다.

2026-09-11 추가 조사에서 중·후반 표본과 한국어 대사 수정 사례를 보강했다. 다만 연속 아크 전체의 회수, 사람 편집자의 장면 전체 수정 이력, 적용 원고에 대한 사람 평가가 남아 있다. 자료 수집은 후보 선정에 충분하며, 실제 품질 향상은 아직 검증하지 않았다. 기존 보고서는 덮어쓰지 않고 별도 기록으로 보존했다.
