# 피치·기획서 정책과 현재 연결 상태

2026-09-09 코드 및 실제 기획서 대조. 날짜가 붙은 과거 보고서의 제안·검증 결과는 당시 기록이며, 현재 실행 가능 여부는 아래 구분을 따른다. 이 문서는 기존 정본 권한이나 채택 조건을 변경하지 않는다.

| 구분 | 현재 상태 |
| --- | --- |
| 일일 기획 생성 | HQ `daily-planning.py`와 `planning-input.py`가 자료 선정·입력 조립·모델 호출·형식 검사를 수행한다. 단순 예약 라우터만 있는 구현은 아니다. |
| 결과 소유·저장 | 독립 엣지 `v3_ff_foundry/20_model_runs/multi_provider`. HQ의 얇은 관리 역할과 생성 구현 위치가 어긋난 부분은 남아 있다. 이번 정리는 코드 이전을 포함하지 않는다. |
| 문서 양식 | `webnovel-project-plan/v1` 9절. 기존 Astra 기획서 한 건의 본문을 InkOS `VariationProjectPlanSchema`로 검사해 통과했다. 모든 결과의 내용·전체 피치 호환성을 보증한 것은 아니다. |
| 일일 결과 패킷 | `firefly-planning-canary/v1`. Storyyard의 별도 기획서 검토 경로로 들어간다. InkOS가 생성한 피치로 출처를 바꾸지 않는다. |
| InkOS 피치 입력 | 구조화된 후보·출처·심사·선택 기록이 별도로 필요하다. 일일 기획 패킷을 해당 입력으로 변환하는 연결은 현재 없다. |
| InkOS 일반 피치 승격 | 기존 `pitch promote`는 검토된 slate 및 해시가 일치하는 선택 기록으로 planning Book을 만든다. 원고 집필 승인은 별도다. |
| InkOS 원작 기반 피치 승격 | `source-first`는 출처 binding과 A/B handoff 미구현으로 Book 승격을 명시적으로 거부한다. 승인 조건이 오래됐다는 추정으로 이 차단을 제거하지 않는다. |
| Storyyard 채택 | 검토 의사 기록이다. 일일 기획의 select는 InkOS Book 생성·원고 허가·정본 반영과 같지 않다. |
| n8n | 기존 기록 재현 파일럿. 실제 일일 예약·신규 생성의 실행 주체가 아니다. |

실행 경로·모델은 `config/daily-planning.json`과 `config/planning-provider-policy.json`, 운영 방법은 [일일 기획 운영](daily-planning-operations.md)을 따른다. 무료 6경로 제외는 유지되며 Grok CLI의 재시험 필요 상태는 이미 해제됐다. 9월 6일 문서의 재시험 권고를 현재의 실행 금지로 해석하지 않는다.

## 상태를 읽는 기준

- 프로세스 종료, 본문 회수, 형식 통과, Storyyard 저장, 내용 감리, 사람 채택, InkOS 반입, Book 승격, 원고 집필을 각각 구분한다.
- `cycle-receipt.status=finished`는 공정 종료다. 여섯 기획서의 완성·재미·채택을 뜻하지 않는다. 경로별 counts와 예외를 함께 읽는다.
- `complete`는 본문 회수·형식 통과 의미다. 의미론적 감리는 인물의 욕망→선택→사건→보상→다음 목적, 정보 격차와 공개 순서, 작품 내부 모순, 참고 범위의 정직성을 본문 근거로 별도 판단한다.
- 누락된 제작 정보를 자동으로 발명해 연결 성공으로 만들지 않는다. 필요한 보완과 단순 데이터 변환을 구분한다.

## 확인한 코드

- `scripts/daily-planning.py`: prepare / collect / publish.
- `edge_repos/inkos/packages/core/src/planning/webnovel-plan-format.ts`: 문서 스키마.
- `edge_repos/inkos/packages/cli/src/commands/pitch.ts`: collectPitchCandidateIssues / promote.
- `edge_repos/storyyard/app/api/firefly/canary-decisions/route.ts`: pending 판정 저장.

이번 실행 범위는 2026-09-09 일일 배치 1회다. 9월 8일 사용자 중지 기록과 미회수 배치는 보존하며, 매일 LaunchAgent 재활성은 포함하지 않는다.
