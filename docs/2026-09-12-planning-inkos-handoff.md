# 일일 기획·원작 기반 피치의 InkOS 전달

2026-09-12 구현. 새 모델 호출이나 사람 응답을 기다리지 않고, 이미 있는 기획·명시 매핑·승인 증거를 검사하고 소비하는 경로를 추가했다. 실제 작업물의 Book·정사·원고는 변경하지 않았다. 아래 Book 생성 검증은 모두 임시 디렉터리의 합성 fixture다.

## 실제로 연결한 경로

```text
기존 일일 canary + 그 본문에 결속된 명시 candidate 매핑
  → pitch import-plan [--check]
  → 원본 출처를 보존한 native source-first slate, reviewStatus=pending
  → 기존 InkOS 심사·선택 기록
  → 명시 source/A·B/Arc/foundation 매핑 + 이미 발급된 planning-only 승인 증거
  → pitch promote --handoff ... --check
  → pitch promote --handoff ...
  → outlining Book + 기존 ReferencePackStore/StoryRailStore/ArcStore
  → 기존 WriterReferenceContext·planning admission reader에서 재독해
```

`import-plan`과 source-first `promote --handoff`는 모델을 호출하지 않는다. 기존 `pitch review`는 기존대로 별도 심사 경로다. 이번 테스트에서는 그 응답을 명시적으로 만든 합성 fixture로 주입했으며 실제 모델 심사나 사람 품질 판정을 했다고 표시하지 않았다.

일일 `complete`, Storyyard `select`, InkOS `select`, Book 승격, 원고 집필은 여전히 다른 상태다. 새 코드는 이 상태들을 자동으로 동일시하지 않는다. `--handoff` 없는 source-first 승격은 계속 거부한다.

## 왜 문자열 목록을 바로 A/B로 바꾸지 않았나

기존 피치의 `railA`는 성과 누적 목록이고 `railB`는 관계 변화 목록이다. InkOS 실행 계약의 A-Rail은 6~12개 목적지, B-Rail은 그 목적지에 이르는 Arc 경로다. 둘은 이름이 비슷해도 같은 구조가 아니다.

그래서 문장의 위치나 목록 길이로 A/B를 추측하지 않는다. 이미 작성한 `StoryRailPlan`, 첫 `ArcPacket`, `ReferenceTransformation`을 그대로 받으며, 각 대상과 기획 본문의 대응 위치·조정 이유를 요구한다. 200화의 먼 사건을 전부 채우지 않아도 기존 `capacityReservations`로 아직 구체화하지 않은 Arc 용량을 표현할 수 있다.

## 일일 기획 반입

InkOS 프로젝트 루트에서 실행한다.

```bash
inkos pitch import-plan \
  --id daily-import-example \
  --canary path/to/original-canary.json \
  --mapping path/to/candidate-mapping.json \
  --source-pack path/to/reference-pack.json \
  --reference path/to/already-selected-source.txt \
  --check --json
```

`--check`를 빼면 `.inkos/pitch-slates/<id>/`에 새로운 비정본 slate를 만든다. 기존 디렉터리는 덮어쓰지 않는다. 생성되는 원본 증거:

- `source-canary.json`: canary 파일 원본 바이트.
- `candidate-mapping.json`: 명시 매핑 파일 원본 바이트.
- `slate.json`: 후보와 원본 출처. `sourceOrigin.system=v3_ff_foundry`, 기존 canary ID·배치·모델/경로·생성 시각·입출력 해시를 보존한다.
- `review.md`: 기존 피치 검토용 표현.

필수 매핑 모양:

```json
{
  "schemaVersion": "firefly_daily_planning_candidate_mapping/v1",
  "canaryId": "fcp-원본의24자리ID",
  "canarySha256": "원본 canary JSON 파일의 SHA-256",
  "outputSha256": "원본 기획 Markdown의 SHA-256",
  "candidate": { "candidateId": "p01", "...": "기존 source-first 후보의 모든 필드" }
}
```

위는 필드 설명용이며 실행 가능한 승인을 포함하지 않는다. `candidate`는 기존 `collectPitchCandidateIssues` 검증을 통과해야 한다. `projectPlan.markdown`은 canary 본문과 정확히 같아야 한다. 누락한 Entry Contract, 주인공 정보, source spine, 지급·Arc 근거 등을 본문에서 모델로 발명하지 않는다. 어떤 필드가 부족한지 기존 검증 오류를 반환한다.

입력은 현재 `complete`인 canary만 허용한다. 이 확인은 본문·출처·양식 상태를 뜻한다. 의미론적 작품 심사나 채택을 뜻하지 않는다. 반입은 새로운 `reviewStatus=pending` native 입력이며, 기존 Storyyard canary 선택을 새 InkOS 선택·승인으로 복사하지 않는다. 이후 native 심사·선택·내보내기에서 복사한 원본 바이트와 후보 매핑을 다시 검사한다.

## source-first 승격 전 검사와 실제 소비

```bash
inkos pitch promote \
  --id existing-source-first-slate \
  --book new-book-id \
  --handoff path/to/handoff.json \
  --check --json
```

조건을 갖춘 입력만 `validated-planning-promotion`을 반환한다. `bookCreated=false`, `modelCalls=0`, `manuscriptAuthorized=false`다. `--check`를 빼면 같은 계약을 재검사한 뒤 모델 없이 새 planning Book을 만든다. 기본 일반 피치의 기존 생성 방식은 바꾸지 않았다.

`handoff.json`은 두 파일의 위치와 정확한 파일 해시만 가진다.

```json
{
  "schemaVersion": "firefly_source_first_handoff/v1",
  "mapping": { "path": "path/to/mapping.json", "sha256": "정확한 파일 해시" },
  "authorization": { "path": "path/to/authorization.json", "sha256": "정확한 파일 해시" }
}
```

매핑 파일 `firefly_source_first_handoff_mapping/v1`의 필수 묶음:

| 필드 | 담는 내용과 검사 |
| --- | --- |
| `bookId`, `source` | 대상 Book, native slate·후보 ID, 후보 canonical JSON 해시, slate·심사·선택 파일의 바이트 해시. 현재 native 파일까지 다시 읽는다. |
| `sourceBinding` | 기존 `FireflyPitchSourceBindingSchema`. 주축 pack/원문, 선택 story sequence·Arc·본문 구간·prose 해시, style 예제, project-bible/chapter-map/arc-atlas 각 1개. |
| `files` | pack·전체 원문·source receipt의 위치와 해시. pack·receipt·binding의 해시를 서로 대조한다. |
| `foundationFiles` | 아래 기초 파일 6개를 해시와 함께 명시한다. 빈 파일·중복 대상·누락은 거부한다. |
| `railPlan` | 기존 `StoryRailPlanSchema`. ready A/B, 목적지·경로 순서·용량·활성 B·가까운 compound/먼 sparse를 기존 규칙으로 검증한다. |
| `activeArc` | 기존 `ArcPacketSchema`. ready 상태, 1~3화, 첫 화에서 시작, 활성 B의 Arc ID와 일치. |
| `transformation` | 기존 `ReferenceTransformationSchema`. 선택 출처 sequence/Arc와 실제 목적지/Arc에 결속. 중복 segment·모호한 Arc 매핑·출처 밖 sequence를 거부한다. |
| `evidence` | Entry Contract 각 필드, foundation 6개, 각 A/B, 첫 Arc, transformation segment마다 기획 본문 구간과 이유를 명시한다. 누락·중복·가짜 구간 해시를 거부한다. |

기초 파일은 `story_bible.md`, `volume_outline.md`, `character_matrix.md`, `book_rules.md`, `current_state.md`, `pending_hooks.md`다. 일일 9절을 이 파일들로 자동 재작성하지 않는다. 이미 작성·승인된 파일을 원문 그대로 복사하여 새 설정을 생성하는 우회를 막는다. 기존 초기화가 내부 Architect 생성·심사를 호출하는 점을 확인하여 이 handoff에 모델 없는 별도 초기화를 사용했다.

`evidence.target`은 `entryContract/<section>/<field>`, `foundation/<filename>`, `anchor/<id>`, `route/<bId>`, `arc/<id>`, `transformation/<segmentId>`다. `planSpan`은 기획 Markdown 원본 문자열의 **UTF-16 인덱스, start 포함·end 제외**, 그 구간의 UTF-8 SHA-256이다. 실제 구간 존재와 결속을 확인하며, 이유가 문학적으로 맞다는 자동 판정은 하지 않는다. `semanticMappingReviewPerformed=false`를 반환한다.

승인 파일 `firefly_source_first_handoff_authorization/v1`은 `mappingSha256`, 기존 `FireflyPlanningAdmissionSchema` 형식의 `admission`, `authorizedBy`, `canonEffect=planning-seed-only`, `manuscriptAuthorized=false`를 가진다. `admission`의 Book·Entry Contract·slate·심사·선택 해시가 모두 같아야 한다. 이 파일을 자동 발급하거나 사람 이름·선택·승인 상태를 만들어 주는 명령은 구현하지 않았다. **canary 선택이나 source-first planning-selection-only만으로는 이 승인을 충족하지 않는다.** 이번 사용한 승인 파일은 전부 임시 fixture이며 실 사용자 승인 증거가 아니다.

## 저장 결과와 읽기 경로

새 Book 준비는 숨김 임시 디렉터리에서 수행하고 완성된 뒤 최종 Book 디렉터리로 옮긴다. 기존 Book이나 기존 기획 상태를 덮어쓰지 않는다. 실패하면 이번에 만든 임시 Book만 정리한다. 원본 레퍼런스가 설치된 해시 기반 object는 정본과 별개인 불변 캐시로 남을 수 있다.

- `ReferencePackStore.bind`가 pack·story/style index·원문을 해시 기반 불변 object로 설치하고 `story/reference_binding.json`을 만든다.
- 기존 `StoryRailStore`와 `ArcStore`에 명시 Rail/Arc를 저장하고 활성 Arc를 연결한다.
- `story/reference_transformation.json`을 기존 Writer 참고 문맥 reader가 소비한다. 설치 후 첫 Arc의 `buildWriterContext`를 실제 호출해 읽기까지 확인한다.
- `story/project-plan.md`에 전체 기획 본문을 보존한다.
- `story/entry-contract.json`은 받은 기존 planning admission이다.
- `story/planning-handoff*.json`에 매핑·승인·정확한 provenance와 결과 영수증을 보존한다.
- `chapters/index.json=[]`, 초기 상태 snapshot 0, `book.status=outlining`, 기존 `reviewMode=manual`을 유지한다.

입력 파일은 프로젝트 내부의 정규 UTF-8 파일이어야 한다. `../` 경로, 프로젝트 밖을 가리키는 symlink, 파일 변조·크기 초과를 거부한다. 큰 원문은 최대 100 MiB다. 전체 원문 바이트 해시와 선택된 장의 실제 prose 구간을 확인했으며, 원작 전체를 문학적으로 정독했다는 뜻은 아니다.

## 검증과 남은 조건

- Core handoff 테스트: 21개. 읽기 전용 검사, 실제 Book 발견·admission·Writer 문맥 readback, 명시 foundation 복사, source/slate/review/decision 변조, approval 범위 불일치, native invalidation, 누락 A/B/foundation/근거, 경로 탈출, 반복 적용 거부, canary 본문 보존을 검사한다.
- 기존 CLI pitch-command 전체: 26개. 일반 피치의 기존 승격, source-first 기본 차단, 새 `--check`, canary→native pending slate→합성 심사/선택→승인된 handoff→실제 planning Book 전체 흐름이 포함된다.
- 새 반입과 source-first 소비 단계에서 추가 모델 호출이 없는 것을 검사한다. 테스트 중 기존 심사 API는 합성 응답을 주입했으며 실제 API 호출은 하지 않았다.
- 실제 저장된 기획들이 이 모든 제작 입력을 이미 갖췄다고 주장하지 않는다. 부족한 입력은 해당 필드/파일/해시 오류로 반환한다. 이 작업은 기존 Book·원고를 실제 승격하지 않았고, scheduler·Storyyard 원격 상태도 변경하지 않았다.

코드:

- [core handoff](../edge_repos/inkos/packages/core/src/planning/source-first-handoff.ts)
- [InkOS pitch CLI](../edge_repos/inkos/packages/cli/src/commands/pitch.ts)
- [core fixture 검증](../edge_repos/inkos/packages/core/src/__tests__/source-first-handoff.test.ts)
- [CLI 소비 검증](../edge_repos/inkos/packages/cli/src/__tests__/pitch-command.test.ts)

이 문서의 테스트 수는 해당 파일의 최종 재검증 결과를 따른다. 전체 아젠다의 통합 검증과 운영 상태는 [구현 현황](2026-09-12-human-webnovelist-implementation.md)에서 함께 읽는다.
