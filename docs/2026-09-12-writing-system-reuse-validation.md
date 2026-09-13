# 기존 집필 시스템 재사용 검증 — 2026-09-12

W04의 결론은 **세 앱의 전체 런타임 편입은 보류하고, 확인한 동작과 실패 조건을 기존 InkOS 경계에 반영한다**이다. 세 앱에 없는 것을 추정해서 새로 만드는 단계에서는 벗어났다. 고정 소스의 실제 함수를 실행했고, 한국어 입력·반환 형식·호출 횟수에서 어디가 맞고 어디가 맞지 않는지 재현했다.

실모델 호출과 사람 검토 요청은 0회다. 모델 경계에 미리 작성한 반환값을 넣었으므로 **배선과 상태 변화의 검증이며, 모델의 작문·판단 능력 검증은 아니다.** 전체 앱의 설치·서버 구동·장면 생성·품질 비교도 하지 않았다. 실행 결과는 [최종 검증 기록](evidence/2026-09-12-writing-system-reuse-validation-final.json)에 저장했다. 앞선 20개 확인 기록도 그대로 보존했다.

## 무엇을 실제 실행했나

| 시스템 | 실제 실행 범위 | 확인한 결과 | 현재 사용 결정 |
|---|---|---|---|
| NovelWriter | 원본 `analyze_narrative_dna`, `get_narrative_instructions`, 첫 화 `build_chapter_prompt` | 5,000자까지만 모델 입력에 포함. 분석의 세 종류 지침이 저장·복원되고 본문용 지침이 첫 화 prompt에 전달됨. 마커가 없는 모델 반환값은 에러 없이 빈 지침 세 개로 저장됨. | 단계별 참고 전달 원리를 재사용. 기존 author-craft pack의 출처·단계·예산 검증을 유지. 전체 앱 편입 보류. |
| WriteHERE | 원본 목표 갱신 prompt, `get_llm_output`, `UpdateAtomPlanningAgent.forward` | 이미 쓴 본문이 요청에 포함되고 반환된 새 목표가 작업 노드를 실제로 바꿈. 잘못된 atomic 판정을 10회 재시도한 뒤 planning 분기에 진입. | 본문에 따른 미래 목표 갱신 원리를 재사용. 고정 A-Rail/이미 쓴 회차와 비교하는 InkOS 후보 경계를 우선. 재귀 엔진 편입 보류. |
| AuthorAgent | 원본 대사 parser·인물 서비스·`ProseEvolverService` 모듈 | 한국어 대사 3줄은 검토 0명, 대응 영어 대사는 1명·3줄. 원문에 없는 인용도 검토 flag로 수용. 두 수정 회전에서는 원문 보존, 낮은 점수 후보 탈락, 보고 호출 수 7회를 재현. | 외부 검토 출력의 좁은 데이터 어댑터를 구현. 영어 화자 추정·등장 회차 기반 지식·점수 반복 수정은 기본 경로에 편입하지 않음. |

NovelWriter는 파일·모델 어댑터 경계를 fixture로 대체했다. 원본 함수 본문과 기본 prompt 문자열을 고정 소스의 AST에서 읽었으며 앱 import와 등록 decorator를 실행하지 않았다. 첫 화 외 분기, 임베딩 검색, 실제 분석의 타당성은 검증 범위 밖이다. [분석 함수](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/web_server.py#L2879), [첫 화 입력](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/novel_generator/chapter.py#L276)

WriteHERE에는 요리사가 돈보다 딸과 보낼 저녁을 원한다고 밝힌 독립 예시 본문을 넣었다. 반환값은 모델 호출을 대신해 fixture에 미리 지정한 “퇴근 시간을 계약서에 적는다”였고, 원본 `forward`가 이것을 실제 `goal`에 반영했다. **WriteHERE 모델이 좋은 변경을 생각해 냈다는 주장은 아니다.** 유효하지 않은 판정 10회 뒤에는 fixture가 planning 호출 경계에서 중단했다. 실제 재귀 계획 전체 비용이나 무한 실행을 관측했다는 뜻도 아니다. [원본 분기](https://github.com/principia-ai/WriteHERE/blob/817b489008e4b5dd50d5008803992dcf81c4fa50/recursive/agent/agents/regular.py#L134)

AuthorAgent에서는 TypeScript의 타입만 제거하고 전체 서비스 코드를 임시 폴더에서 실행했다. 대사 귀속은 라틴 이름과 영어 발화 동사를 기대한다. 한국어 예시가 검토 대상에서 빠지는 것은 모델 판단 이전의 코드 경로다. 인물 brief는 같은 화에 등장했다는 이유로 별도 장면의 비밀번호 변경도 알려진 사건에 포함했고, 미래 회차를 입력하면 미래 내용도 포함했다. 화자가 직접 본 사실·들은 소문·독자만 아는 사건을 구분하는 경계로 바로 쓰기 어렵다. [대사 parser](https://github.com/Ckokoski/AuthorAgent/blob/47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c/gateway/src/services/dialogue-parser.ts), [인물 서비스](https://github.com/Ckokoski/AuthorAgent/blob/47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c/gateway/src/services/character-agent.ts)

또한 잘못된 모델 JSON은 “검토했지만 지적 없음”과 같은 결과가 된다. ProseEvolver가 점수 높은 수정 후보를 보존하는 동작은 재현했지만, 그 점수는 fixture가 정한 70→80→75였다. 재미·한국어 문체·독자 만족도의 증거로 세지 않는다. 실제 기본 3회전은 최대 10회, 상한 5회전은 최대 16회 모델 호출을 예상하는 코드이므로 이번에 원한 빠른 자동 개선 경로에는 맞지 않는다. [수정 서비스](https://github.com/Ckokoski/AuthorAgent/blob/47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c/gateway/src/services/prose-evolver.ts)

## 만든 재사용물

[`scripts/writing-system-candidates.mjs`](../scripts/writing-system-candidates.mjs)는 AuthorAgent 형식의 검토 결과를 **원문에 연결된 수정 후보 데이터**로 바꾸는 독립 모듈이다. 외부 구현이나 prompt를 복사하지 않고 직접 작성했다. 현재 자동 집필 경로에 호출을 추가하지 않았으며, 모델 결과를 가져올 때 사용할 수 있는 함수와 stdin CLI를 제공한다.

입력에는 다음을 함께 넣는다.

- 원문, 회차 ID, 원문 SHA-256.
- 외부 시스템 저장소·고정 commit·fixture/외부 모델 구분.
- 외부 `CharacterCritiqueReport`.
- 화자·정확한 대사·UTF-16 시작/끝 위치·귀속 근거. 어댑터가 화자를 추정하지 않는다.

어댑터는 회차·원문 hash·보고서 합계가 맞는지 먼저 확인한다. 원문에 없는 인용, 다른 화자의 인용, 중복 등장으로 위치가 모호한 대사, 바뀌지 않은 수정안, 알 수 없는 지적 종류를 제외한다. 동일 후보는 중복 제거한다. 통과한 후보에는 원문 hash, 정확한 위치, 진단, 수정 제안, 화자 귀속 근거가 남는다.

**이 통과는 인용/위치/제공된 화자 연결의 확인이다.** 진단의 옳음이나 제공된 화자 귀속 자체의 진실성을 자동 입증하지 않는다. `qualityVerdict=not-assessed`, `canonApplied=false`를 반환하며 원고를 수정하지 않는다. 저장소와 commit 역시 호출자 제공 표식이므로 `attestation=caller-provided-not-independently-verified`로 표시한다. 검토 0명과 지적 0개도 구분하며, 후자는 upstream 파싱 실패일 가능성을 보존한다.

```sh
node --test tests/writing-system-candidates.test.mjs
node scripts/writing-system-candidates.mjs < external-review-input.json > revision-candidates.json
```

7개 자동 테스트에서 독립 한국어 예시와 emoji 앞의 UTF-16 위치, 원문/회차 변경, 존재하지 않는 대사, 다른 화자, 겹친 구간, 중복 인용, 합계 불일치, 잘못된 producer, 지적 없음 처리 등을 검증했다. 원본 AuthorAgent 서비스가 실제 반환한 두 보고서도 이 어댑터에 전달해, 가공의 인용은 제외하고 원문에 연결된 인용은 후보로 보존하는 연결 실행을 확인했다. 이는 Reviser에 외부 후보를 전달하기 전 사용할 수 있는 입력 검증기다. 지금 작업에서 새 외부 모델 호출이나 자동 후보 적용을 활성화했다는 뜻은 아니다.

## 고정점과 라이선스

| 저장소 | 고정 commit | 확인 범위와 편입 상태 |
|---|---|---|
| NovelWriter_public | `9e7fe179c29341f3d84785df118894c29abb1308` | 고정 LICENSE의 AGPL-3.0 본문 확인. 원본은 Git 제외 캐시에서만 읽고 제품에 복사 편입하지 않음. |
| WriteHERE | `817b489008e4b5dd50d5008803992dcf81c4fa50` | 고정 tree에서 독립 LICENSE 없음, 기존 README에 MIT 표기. 명시적 배포 조건을 임의로 보완하지 않고 코드 편입 보류. |
| AuthorAgent | `47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c` | 고정 LICENSE의 MIT 및 Writing Secrets(Beach Blogger LLC) 저작권 고지 확인. 원본 서비스는 fixture 임시 폴더에서만 실행하고 제품에 vendoring하지 않음. |

기존 `.firefly/research/ready-made-writing-20260911/`를 변경하지 않았다. 빠져 있던 AuthorAgent parser/라이선스와 NovelWriter 라이선스만 **별도** `.firefly/research/writing-system-reuse-20260912/`에 내려받았다. 기존 고정 tree의 Git blob SHA-1과 받은 파일의 SHA-256을 확인했다. [AuthorAgent 고정 LICENSE](https://github.com/Ckokoski/AuthorAgent/blob/47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c/LICENSE), [NovelWriter 고정 LICENSE](https://github.com/tuxiangxianzhe/NovelWriter_public/blob/9e7fe179c29341f3d84785df118894c29abb1308/LICENSE)

재실행은 다음 명령이다. 출력 파일은 새 이름을 사용하며 기존 검증 기록을 덮어쓰지 않는다. 원본 캐시가 없는 다른 checkout에서는 먼저 같은 commit의 선택 파일을 확보해야 한다. 소스 전체 자동 다운로드나 앱 설치를 이 명령에 숨기지 않았다.

```sh
python3 scripts/writing-system-reuse-fixture.py \
  --output .firefly/research/writing-system-reuse-20260912/recheck.json
```

원본 함수와 후보 어댑터 연결의 22개 동작 확인이 통과했다. 각 테스트의 대체 경계와 실행하지 않은 단계는 JSON 기록에 있다. 기능 차이를 확인하는 데 필요한 실행은 마쳤고, 실제 한국어 품질 우열은 확인하지 않은 상태로 남긴다.
