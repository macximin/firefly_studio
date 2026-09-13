# 독자 공개·인물 인지·보상 경과의 지속 문맥 — W09/W14

2026-09-12. 이미 진행하는 Settler 응답에서 선택적으로 얻은 본문 관찰을 출처와 함께 저장하고, 다음 Planner·Writer 입력에서 다시 읽는 기능이다. 새 모델 호출이나 사람 검토 대기를 만들지 않는다.

구현은 [state/narrative-evidence.ts](../edge_repos/inkos/packages/core/src/state/narrative-evidence.ts), 자료 형식은 [models/narrative-evidence.ts](../edge_repos/inkos/packages/core/src/models/narrative-evidence.ts), 검증은 [fixture 테스트](../edge_repos/inkos/packages/core/src/__tests__/narrative-evidence.test.ts)에 있다. 공용 Writer·Planner·저장 연결은 상위 통합 작업에서 처리한다.

## 구별하는 세 종류

| 종류 | 저장하는 것 | 자동으로 확정하지 않는 것 |
|---|---|---|
| `reader-disclosure` | 독자에게 보인 정보의 `informationId`와 정확한 본문 인용 | 등장인물 모두가 그 정보를 안다는 주장 |
| `character-awareness` | 이름이 인용에 있는 인물, 정보 ID, 명시적 인지·무지·믿음 | 믿음의 진위, 다른 시점 인물의 지식, 장면에 있었다는 이유만으로 아는 사실 |
| `reward` | 같은 명시적 `threadId`·인물의 약속, 획득, 체감, 다음 욕망 | 비슷한 단어의 다른 보상 묶기, 비어 있는 단계 채우기, 금액 증가를 체감 만족으로 간주하기 |

이 기록은 인용에 붙인 자동 분류다. 정확한 문장이 존재하는지와 인물 이름·파일·회차는 코드로 검증한다. 문장의 모든 의미가 맞게 분류됐다는 독립적인 품질 판정은 하지 않는다. 정사 사실, 강제 규칙, 자동 수정 명령으로 사용하지 않는다.

## 기존 응답에서 받기

기존 Settler 응답 끝에 별도의 선택적 섹션을 둔다. 필수 `RUNTIME_STATE_DELTA` 안으로 섞지 않는다.

```text
=== NARRATIVE_EVIDENCE ===
[
  {
    "kind": "reader-disclosure",
    "informationId": "safe-code",
    "evidence": "금고의 비밀번호는 4812였다."
  },
  {
    "kind": "character-awareness",
    "informationId": "safe-code",
    "character": "윤서",
    "awareness": "unaware",
    "evidence": "윤서는 비밀번호를 몰랐다."
  }
]
```

위 문장은 형식 설명을 위해 만든 예시다. 실제 수집에서는 해당 화에 존재하는 연속된 본문 인용만 허용한다. 인물 인지와 보상은 인물 이름이 인용 안에 있어야 한다. 같은 문장이 반복되면 0부터 시작하는 `occurrence`로 위치를 특정한다. 위치가 모호하면 임의의 첫 구간을 고르지 않는다.

`buildNarrativeEvidenceExtractionRules(language)`가 이 선택적 지침을 제공한다. `parseNarrativeEvidenceOutput`은 마커 누락·JSON 오류·중복 마커를 별도 상태로 돌려준다. `validateNarrativeEvidence`는 항목별로 전체 스키마와 정확한 인용을 검사한다. 잘못된 optional 항목만 제외하고 유효한 항목은 유지한다. 오류 때문에 필수 Settler 결과를 다시 생성하지 않는다.

한 화 최대 64항목, 인용 1,600자, 인물 이름 120자다. 배열 자체가 잘못됐거나 한도를 넘으면 optional 입력을 비운다. `allowedThreadIds`를 전달하면 기존에 허용한 ID 밖의 보상 기록도 제외한다. ID 유사도나 문장 유사도를 이용해 thread를 새로 합치는 동작은 없다.

## 실제 원고 저장과 결합

```ts
const parsed = parseNarrativeEvidenceOutput(settlerResponse);
const artifact = buildNarrativeEvidenceArtifact({
  bookId,
  chapterNumber,
  chapterText: finalChapterBody,
  chapterPath: relativeChapterPath,
  chapterFileContent: serializedChapterWithTitle,
  entries: parsed.entries,
});

// 기존 saveChapter의 같은 atomic file set에 추가한다.
await validateNarrativeEvidenceArtifactPaths(bookDir, artifact.writes);
writes.push(...artifact.writes);
```

builder는 파일을 쓰지 않는다. 저장할 원고 전체 문자열에서 body가 정확히 한 번 나타나는지 확인하고, 파일 SHA-256·본문 SHA-256·원래 UTF-8 바이트 좌표를 묶는다. 각 인용의 좌표는 `relativeTo: chapter-body`이며 제목을 제외한 본문 기준이다. 파일 기준 위치는 `chapterBodyStart`에 더하면 된다. 윤문으로 body가 달라졌다면 최종 body로 다시 검증하므로 사라진 인용은 제외된다.

공용 저장 트랜잭션에 합치기 전 `validateNarrativeEvidenceArtifactPaths`를 호출한다. 이 읽기 전용 검사는 archive·current 두 경로와 내용의 일치, record self-hash, 기존 immutable 충돌을 확인한다. parent·leaf 경로와 끊어진 링크 검사는 공통 `assertBookAdvisoryWritePaths`를 사용한다. 실제 쓰기를 수행하는 호출자는 기존 Book 잠금을 유지한다.

두 sidecar만 만든다.

- `story/runtime/narrative-evidence/records/<recordSha256>.json`: 내용으로 식별하는 기록.
- `story/runtime/narrative-evidence/chapters/<6자리 회차>.json`: 해당 회차의 현재 관찰 전체.

현재 관찰을 갱신할 때 이전 기록은 archive에 남으며, 빠진 항목을 옛 관찰과 합치지 않는다. `[]`도 해당 회차에 선택된 관찰이 없다는 완전한 결과로 저장할 수 있다. 기존 정사 state·원고·인물카드는 이 모듈이 수정하지 않는다.

이미 원고를 저장한 뒤 따로 처리할 때는 `saveNarrativeEvidence({bookDir, ...})`가 실제 파일을 읽고 확인한 뒤 동일한 sidecar를 atomic file set으로 저장한다. 이 함수의 호출자는 기존 Book 쓰기 잠금을 보유해야 한다. 동일 내용은 재사용하고, 다른 내용으로 바뀐 immutable archive는 덮어쓰지 않는다. Book 밖으로 나가는 원고 경로·심볼릭 링크는 거부한다.

## 다음 화에서 읽기

```ts
const context = await readNarrativeEvidenceContext(bookDir, {
  bookId,
  throughChapter: chapterNumber - 1,
  povCharacter,
  language: "ko",
  query: currentSceneGoal,
  maxCharacters: 7000,
  maxInputTokens: remainingInputTokens,
});

if (context.rendered) userPrompt += "\n\n" + context.rendered;
// context.receipt에는 선택·제외 ID와 해시·상태만 있다.
```

파일명과 저장된 회차가 맞는지, Book ID가 같은지, 현재 원고 파일·본문·인용이 여전히 같은지 다시 확인한다. 원고 변경·삭제·위조된 인용·잘못된 JSON은 해당 기록을 제외한다. 더 늦은 회차는 이전 회차 입력으로 읽지 않는다.

Book ID는 기존 `isSafeBookId` 계약을 사용해 한글 등 안전한 기존 ID와 호환한다. 잘못된 Book ID의 optional 읽기는 파일을 읽지 않고 빈 문맥과 진단을 반환한다. 정보·thread ID의 ASCII 제한은 별도로 유지한다.

시점 인물을 지정하면 다른 인물의 인지·무지·믿음·보상 관점 기록을 렌더링하지 않는다. 독자 공개 기록은 별도 제목으로 유지해 “독자는 알지만 이 시점 인물은 모른다”는 경계를 보존한다. 인물 이름이 같다는 것만으로 별칭이나 동일인을 확정하지 않는다.

같은 thread ID와 인물의 경과를 실제 회차·인용 위치순으로 나열한다. 다른 thread를 합치지 않고 없는 단계를 만들지 않는다. 기본으로 최근 200개 회차 기록까지 살핀다. 긴 경과는 8·4·2·1개 인용 창 중 실제 남은 예산에 맞는 창을 선택하며, 가능한 창에서는 최초 약속도 함께 남긴다. 줄인 경과에는 생략된 사건 수와 불완전한 경과라는 표시를 붙인다. 개별 인용을 중간에서 자르지 않는다. 생략은 그 단계가 원고에 없었다는 판정이 아니다.

입력 전체의 토큰 예산은 호출자가 기존 본문·출력 예약량을 먼저 계산해 전달한다. 이 모듈은 자기 섹션만 제한한다. 낮은 예산·자료 누락·위조 기록이 있어도 대체 장면이나 추가 모델 호출을 만들지 않는다.

## 확인된 범위

임시 Book fixture에서 optional 파싱, 항목별 거부, 반복 인용 위치, thread 제한, BOM·CRLF 바이트, sidecar 재사용·갱신, 원고·정사 보존, 독자와 인물 지식 분리, 다른 시점 제외, 4단계 경과와 독립 thread, 과거 cutoff, 원고 변경·삭제, 위조 인용, 예산과 긴 경과의 불완전한 창, 없는 저장소와 경로 이탈을 검증한다.

추출 라벨이 문장의 의미를 제대로 설명하는지와 실제 독자의 보상 체감은 별도 품질 문제다. 이번 구현은 그 문제를 검토할 때 과거의 정확한 본문과 현재 입력 사이의 연결을 유지하는 범위다. 실원고 생성·재작성이나 사람 독자 비교는 수행하지 않는다.

## 기존 호출·저장 통합

작법 팩이 켜진 Book의 기존 Settler에 남은 예산으로 선택적 지침을 넣고, 실제 반환 본문의 SHA에 관찰을 묶는다. Planner·Writer는 이전 회차까지만 읽으며 Writer는 명시된 시점 인물을 전달한다. `saveChapter`는 저장되는 최종 본문과 관찰을 얻은 본문의 SHA가 같을 때만 분류를 사용한다. 수정 후 본문이 바뀌면 옛 인용이 우연히 남아 있어도 옛 분류를 재사용하지 않는다.

기존 원고와 같은 atomic file set으로 기록하며, 뒤 단계가 실패하면 chapter persistence journal이 현재 관찰 포인터와 원고를 함께 복구한다. 불변 이력은 남을 수 있지만 다음 조회는 복구된 현재 포인터만 소비한다. optional 출력의 충돌·경로 이탈은 경고하고 제외하며 기존 원고 저장을 막지 않는다.

`narrative-evidence-integration.test.ts`의 6개 fixture는 실제 Settler→저장→다음 Planner, Writer의 시점·본문 변경, 수정 뒤 관찰 초기화, transaction 실패 복구, 불변 기록 충돌, 외부 심볼릭 링크에 대한 원고 보존을 확인한다. 합성 응답을 기존 호출에 넣었으며 호출 수를 늘리지 않았다.
