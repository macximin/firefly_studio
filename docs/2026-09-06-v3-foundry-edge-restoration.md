# V3 웹소설 Foundry edge 복원

사용자가 웹소설 쪽 V3/V4를 확인하고 현재 Firefly의 edge로 가져오도록 요청했다.

웹소설 작업 저장소는 **`v3_ff_foundry`**다. `v4_shortform_script_foundry`는 `shortform_hq` 아래의 숏드라마 대본 저장소다. V3 Foundry에도 별도 영상 대본 레인이 있으나 웹소설 기획·A/B레일·원고는 `40_works/`에 있다.

## 복원 결과

- 경로: `/Users/a2501/Desktop/firefly_studio/edge_repos/v3_ff_foundry`
- 원격: `https://github.com/macximin/v3_ff_foundry.git`
- 브랜치: `main`
- 복원 HEAD: `29051fb376cc708784ba8e43c09b0d22140994bf`
- Git 추적 파일 779개. 과거 Git 이력을 유지한 새 독립 clone이며 원본 파일의 복사본을 HQ에 편입한 것이 아니다.
- 복원된 작품 상태 입구: `afterlife_restaurant`, `cheongma_restaurant`, `isekai_restaurant`, `knights_restaurant`, `romance_fantasy_restaurant`, `tyrant_restaurant`.

`config/edge-repos.json`에 다섯 번째 child로 등록했다. `execution.kind`는 `library`, 실행 capability는 없다. 사람의 지시에 따른 기획 작업 공간이며 자동 생산 worker로 등록하지 않았다. 기본 생산 엔진은 InkOS다.

옛 V3 HQ는 2026-08-17 보관된 별도 저장소다. 이번 복원은 그 HQ 전체의 재활성화나 현재 Firefly와의 Git 이력 병합이 아니다. V3 Command Center와 Sources, V4 Shortform은 현재 HQ의 제외 범위에 남긴다.

## 먼저 볼 파일

- [기존 운영 계약](../edge_repos/v3_ff_foundry/AGENTS.md)
- [Anchored Story Loop](../edge_repos/v3_ff_foundry/00_charter/anchored_story_loop.md)
- [작품 양식 입구](../edge_repos/v3_ff_foundry/40_works/_template/README.md)
- [기획서](../edge_repos/v3_ff_foundry/40_works/_template/01_pitch/pitch.md)
- [작품 척추](../edge_repos/v3_ff_foundry/40_works/_template/02_story/living_spine.md)
- [A레일](../edge_repos/v3_ff_foundry/40_works/_template/02_story/anchor_rail.md)
- [B레일](../edge_repos/v3_ff_foundry/40_works/_template/02_story/arc_route_rail.md)
- [현재 집필 구간](../edge_repos/v3_ff_foundry/40_works/_template/02_story/rolling_corridor.md)

## 현재 Firefly에서의 경계

V3의 기존 작품·헌장·모델 레인은 해당 저장소의 역사와 작업 규칙으로 보존했다. 기존 문서의 `sole active foundry`와 과거 기본 모델 표기를 현재 Firefly 전체의 엔진·모델 변경으로 해석하지 않는다. 복원 자체로 Web GPT Pro, Hermes, 옛 자동화나 새 원고 생성을 실행하지 않았다.

이번에 복원한 기획·A/B레일을 InkOS에 넘기는 자동 연결은 아직 없다. 실제 연결에서는 사용자가 합의한 현재 9절 기획서와 V3의 A/B레일 의미를 읽고 InkOS 입력에 대응시켜야 한다. 특히 V3의 B레일 회차 상한을 InkOS의 큰 아크 또는 1~3화 실행 입력과 이름만 보고 등치하지 않는다. 현재 InkOS 기획서·후보·사람 판정은 수정하지 않았다.

## 경로와 복원 한계

Git 추적 텍스트에서 옛 Mac 경로, Windows V3 경로, 상대 Sources 의존을 검색해 129개 행을 찾았다. 정확한 목록은 `.firefly/v3-foundry-edge-20260906/path-audit.json`에 있다. 기존 실행 기록과 승인 자료의 바이트를 보존하기 위해 일괄 경로 치환은 하지 않았다. 현재 경로에서 옛 relay 전체를 실행 가능하다고 주장하지 않는다.

Git에 들어 있지 않은 원문 캐시·첨부물은 이번 clone에 포함되지 않는다. 실제 기획 시 필요한 원문은 현재 Reference Lab 또는 원래 출처와 다시 연결한다.

검증: HQ manifest/기존 프로필 검증, manifest 테스트, bootstrap 경로 확인, 다섯 child 상태 조회. 원래 네 child의 HEAD와 작업 상태 및 hq_control의 보관 레지스트리 보존은 `.firefly/v3-foundry-edge-20260906/verification.json`에 기록한다. 이번 작업에서 커밋·푸시는 하지 않았다.
