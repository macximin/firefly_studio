# 웹소설 작품 기획서 v1 · InkOS 적용 기록

2026-09-05 · 로컬 반영 완료

[최종 기획서](templates/webnovel-project-plan-v1.md)의 육하원칙, 장기·Arc·회차 목적과 독자 지급을 실제 InkOS 생성 입력에 연결했다. **서식을 중복 저장하는 새 정본이나 새 자동 탈락 조건은 만들지 않았다.** 다음 로컬 생성부터 적용되며, 기존 후보·기획·원고를 자동 재작성하지 않는다.

## 반영한 내용

- WHY는 인물 자신의 욕망과 자기 이득, WHAT은 확인 가능한 목적, HOW는 우위의 실제 사용으로 구분한다.
- WHO에는 경험·처지·태도와 상대의 목적을, WHERE에는 현장의 작동 조건을, WHEN에는 시대·인생의 시점·선행 사건·현재 기회를 담는다.
- 작품 수준의 답을 Arc와 회차가 이어받고 현재 구간의 변화만 구체화한다. 실제 행동과 결과가 장기 목적에 어떻게 이어지는지 읽히게 한다.
- 돈·소유·권한도 목적·수단·보상이 될 수 있다. 단어 자체를 제거하지 않는다. 혼자 쓰거나 즐기는 지급, 후일담과 깨끗한 결산을 허용한다.
- 목적을 만들려고 가짜 시한·위기·실패·도덕적 성장을 추가하지 않는다. 일반 피치 심사에서도 목격자·가족 장면 부재를 탈락 사유로 삼지 않는다.
- 참고 기능을 선택한 인물·목적·무대에 맞추고, 조합할 때 지식·자원·관계·시점의 선행 조건을 확인한다. 실제 제공되지 않은 원문을 사용했다고 기록하지 않는다.

## 실제 연결 위치

아래 경로는 `edge_repos/inkos/` 기준이다. 공통 실행 지침은 `packages/core/src/planning/webnovel-plan-format.ts`에 둔다. HQ 문서의 절대 경로를 실행 코드가 읽는 방식은 아니다.

| 경로 | 적용 방식 |
| --- | --- |
| `packages/cli/src/commands/pitch.ts` | 새 피치와 독립심사 프롬프트에 지침 전달. 검토 Markdown과 승인 후 Architect에 전달할 brief에 기존 필드로 육하원칙 표시 |
| `packages/cli/src/commands/human-premise.ts` | 선택된 premise의 상업 확장 단계에 적용. 초기 사람 욕망 선별 단계에는 전체 기획을 강요하지 않음 |
| `packages/core/src/agents/architect.ts` | 기존 `story_frame / volume_map / roles / book_rules / pending_hooks` 다섯 SECTION으로 분배. 일반 설계의 인물 수와 권별 결과 세 개 할당 제거 |
| `packages/core/src/forecast/prompts.ts` | Arc 후보의 premise와 beat에 상위 목적·현장·시점·동기·실행·결과를 연결. 첫 실행 구간과 먼 결말 구분 |
| `packages/core/src/agent/story-rail-tools.ts` | Rail 도구 입력 설명에 인물·현장·시점·동기·성취 사용과 상위 목적 연결을 명시 |
| `packages/core/src/agents/planner-prompts.ts` | 기존 회차 메모의 현재 작업과 지급 항목에 WHY/HOW와 필요한 WHO/WHERE/WHEN을 연결. 후일담 역할 허용 |
| `packages/core/src/agents/writer-prompts.ts` | 설계·Arc·메모의 목적을 실제 장면으로 구현. 기획표와 지침의 본문 출력 금지, 의도적인 문장 호흡과 반복 보존 |
| `packages/core/skills/inkos-commercial-webnovel-pitch/`, `inkos-commercial-pitch-review/` | 기존 내장 생성·심사 스킬과 루브릭에서 시한·목격자·관계 장면을 일반 의무로 삼던 기준 조정 |

한국어 Architect·Forecast·Planner·Writer에 적용하며 기존 중국어·영어 생성 프롬프트는 유지한다. 피치 경로는 기존 한국 웹소설 전용 경로다. Rail 도구의 영어 입력 설명은 언어 공통이며 저장 스키마는 유지했다.

## 저장 계약

새 `who/what/how/where/when/why` JSON을 중복 추가하지 않았다. 기존 필드에 다음 내용을 담는다.

| 질문 | 기존 저장 위치 |
| --- | --- |
| WHO | `protagonist.startingIdentity`, 상황 속 상대, 이후 `roles` |
| WHY | `entryContract.humanDrive.personalDesire / selfInterest` |
| WHAT | `entryContract.purpose.seriesWhat / arcWhat / chapterWant` |
| HOW | `entryContract.commercialPromise.howAdvantage`, 사건의 실제 행동 |
| WHERE / WHEN | `currentSituation`, `purpose.whyNow` |
| 사람의 결과·독자 보상 | `firstPayoff / payoffWitness / nextPaymentQuestion`, 사건의 `visiblePayoff` |

`payoffWitness`는 실제 목격자의 행동뿐 아니라 혼자 누리는 지급도 표현할 수 있다. `nextPaymentQuestion`에는 다음 기대 또는 온전한 결산을 쓸 수 있다. 값의 의미를 넓혔으며 필드명·타입·승인 해시 계산은 바꾸지 않았다. 기존 값에 없던 시대·인물 정보를 출력기가 지어내지 않는다.

## 검증

- Core 관련 10개 파일, **111개 테스트 통과**: 새 형식 전달, 기존 승인·해시, 한국어 경로, Planner/Writer 프롬프트, Forecast, 저장된 회차 기획, Arc/Rail, Human Premise, Architect 다섯 SECTION.
- Rail 도구 회귀 검사 **9개 통과**.
- CLI 피치 생성·심사·승격과 Human Premise 확장 검사 **13개 통과**. 총 **133개**이며 반복 실행은 중복 합산하지 않았다.
- `pnpm --filter @actalk/inkos build` 성공. Core와 CLI TypeScript 컴파일 완료.
- 빌드된 `dist`에서 형식 버전과 회차·Arc 지침, CLI 확장 함수를 직접 import하여 확인했다. HQ manifest의 실행 진입점은 `packages/cli/dist/index.js`다.
- HQ와 InkOS `git diff --check` 통과.
- 기존 HIL 및 불변 검토 파일 18개 해시 동일. Reference Lab, Market Radar, Storyyard의 Git 상태 동일.

모델 호출은 테스트 대역으로 검증했다. 실제 유료 생성이나 원고 품질 비교 실험은 이번 적용 검증에 포함하지 않았다. 자동으로 재미가 개선됐다는 결론은 내리지 않는다.

## 이번 반영의 범위

현재 `chaebol-human-premise-20260904-v3`의 선택 대기 상태와 원문 골격 결속 조건은 유지했다. 특정 카나리에서 이미 정한 물질·감정 지급은 일반 양식의 목격자 선택 규칙으로 지우지 않는다. 모델·Soul을 교체하지 않았다.

기존 피치의 초반 4화·여섯 Arc 출력 구조, StoryRail의 6~12개 Anchor 제한, 1~3화 ArcPacket 저장 단위는 이번 서식 적용에서 변경하지 않았다. 이것들은 기존 실행 계약의 제약이며 최종 기획서의 보편적인 장면·보상 개수 기준이 아니다. 피치의 기존 물질/관계 축 `railA/railB`와 실행 StoryRail의 장기 목적지/Arc 경로도 구별한다.

다중 참고작 원문 로더 확장, 자동 Rail fallback의 상업 편향, 별도 모델 비교는 앞선 감사의 후속 과제로 남아 있다. 이번 변경은 형식과 생성·심사 입력 연결이다.

소스·빌드·보존 검증의 해시는 [증거 기록](evidence/2026-09-05-planning-format-v1-implementation.json)에 남긴다. 기존 작업과 이번 변경 모두 로컬에 있으며 커밋·푸시는 수행하지 않았다.
