# 실제 수정 전후와 선택 결과 보존 — W11/W13

`edge_repos/inkos/packages/core/src/planning/revision-experience.ts`는 Reviser가 반환한 실제 원문/수정문과 기존 review cycle의 선택 결과를 별도로 보존한다. 추가 모델 호출, 반복 퇴고, 사람 검토 요청을 만들지 않는다. **수정 후보가 생긴 일, 자동 심사에서 그 후보를 선택한 일, 사람이 그 수정을 좋아한 일은 서로 다른 상태다.** 이 모듈은 앞의 두 가지를 기록하며 사람의 취향 승인을 만들어내지 않는다.

독립 모듈과 공용 Reviser·review cycle의 호출부 연결을 구현했다. Reviser는 기존 모델 호출 전에 관련 경험을 조회하고, 파싱과 원고 보존 검사를 거친 반환 결과를 기록한다. review cycle은 기존 선택 절차가 끝난 뒤 실제 선택 본문과 심사 snapshot을 연결한다. 다음 Reviser 호출은 조건을 만족한 사례를 남은 문맥 예산 안에서 참고한다.

## 중복 저장을 줄이는 구조

기존 `state/chapter-workspace.ts`의 `archiveChapterVersion`/`readChapterVersion`을 유지한다. 기존 archive version ID를 알고 있으면 새 경험 기록에서 그 버전을 그대로 참조하며 정확한 내용도 다시 확인한다. 아직 archive가 없는 수정 후보는 `story/runtime/revision-experiences/texts/<SHA-256>.txt`에 내용당 한 번 저장한다. 여러 요청에서 같은 본문이 나와도 blob을 중복 생성하지 않는다.

경험 기록은 `<chapter>-<experienceId>.json`, 결과 기록은 `outcomes/<experienceId>-<outcomeId>.json`이다. 모두 배타적 생성하며 같은 입력은 재사용하고, 같은 이름에 다른 내용이 있으면 실패한다. 기존 archive나 실제 원고 파일은 수정하지 않는다. 정본 보존/복구를 책임지는 기존 chapter persistence transaction도 대체하지 않는다.

## 기록 API

`recordRevisionExperience(bookDir, input)`의 필수 입력은 `bookId`, `chapterNumber`, `beforeContent`, 실제 `ReviseOutput`의 본문·고친 항목·applied/parseFailed/failureReason, 당시 `issues`다. 선택 입력은 직접 수정 요청, 수정 mode, 예상 before/after hash, 기존 archive version ID, 보존해야 할 정확 인용이다.

```ts
const stored = await recordRevisionExperience(bookDir, {
  bookId, chapterNumber,
  beforeContent: originalContent,
  output: reviseOutput,
  issues: requestedIssues,
  revisionInstruction,
  mode,
  expectedBeforeSha256: sourceHashCapturedBeforeCall,
  // beforeVersionId: existingArchive.id, // 이미 archive가 있다면 재사용
  // preserveQuotes: [{quote: exactCausalEvidence, reason: "선택의 이유"}],
});
```

상태는 다음과 같이 결정한다.

| 상태 | 관측한 사실 |
|---|---|
| `candidate` | 유효한 반환 본문이 원문과 다름. 아직 선택/적용/품질 승인 의미 없음. |
| `no-op` | 본문 변화 없음. |
| `parse-failed` | Reviser가 parseFailed로 반환했고 원문을 보존함. |
| `preserved` | applied=false 및 보존 사유가 있고 원문을 보존함. |

parseFailed/applied=false인데 본문이 다르면 모순된 결과로 거부한다. 모델의 `fixedIssues`는 “고쳤다고 보고한 항목”으로만 보존한다. 실제 고침의 증거로 승격하지 않는다.

diff는 공통 접두/접미 부분을 제외한 **정확한 한 개 대체 구간**이다. 여러 곳이 바뀌었다면 그 사이의 그대로인 부분도 포함하는 최소 포괄 구간이며, 최소 편집 횟수를 구한 LCS diff라고 부르지 않는다. UTF-16 좌표와 실제 제거/추가 문자열을 저장하고, 이를 적용하면 after 본문이 정확히 복원된다. CRLF나 emoji를 정규화하지 않고 surrogate pair 중간도 자르지 않는다. before/after 전문은 hash에 연결된 archive/blob에 남는다.

## 실제 선택 결과를 별도로 기록

`recordRevisionOutcome`에는 경험 ID, 같은 Book/회차, cycle ID, **기존 cycle이 실제로 선택한 본문**, 그 cycle에서 사용한 snapshot들을 넣는다. snapshot은 본문과 `auditResult.passed/parseFailed/overallScore`, `lengthInRange`다. 모델 원시 심사 결과 대신 deterministic 검사까지 합친 실제 `ReviewSnapshot.auditResult`를 전달해야 한다.

```ts
await recordRevisionOutcome(bookDir, {
  bookId, chapterNumber,
  experienceId: stored.record.experienceId,
  cycleId,
  selectedContent: bestSnapshot.content,
  snapshots: actualReviewSnapshots.map(snapshot => ({
    content: snapshot.content,
    auditResult: snapshot.auditResult,
    lengthInRange: snapshot.lengthInRange,
  })),
});
```

결과는 `automatic-selected`, `not-selected`, `tie`, `invalid-assessment`다. 양쪽이 hard gate를 통과했지만 점수 차이가 기존 3점 선택 기준 미만이면 tie다. hard gate를 통과하지 못한 기존 원문 대신 통과한 후보를 골랐다면 점수가 낮아도 automatic-selected로 기록할 수 있다. 원문/후보의 심사 누락, 같은 hash의 모순된 심사, 파싱 실패, snapshot에 없는 최종 본문은 invalid-assessment다.

이 함수는 선택 알고리즘을 다시 실행하거나 바꾸지 않는다. 기존 선택을 정확한 본문 hash에 연결한다. `selectionAuthority=automatic-review-cycle`, `humanPreferenceEstablished=false`를 고정한다.

기존 review cycle은 재심사 전에 `normalizePostWriteSurface`로 CRLF·메모 줄·문장부호 등을 정리할 수 있다. 그 결과가 원래 Reviser 본문과 다르면 `recordNormalizedRevisionExperience(bookDir, {bookId, chapterNumber, experienceId, effectiveContent, language})`로 별도 경험을 기록한다. 이 함수는 원래 경험을 읽어 본문을 검증하고 **실제 기존 표면 정리 함수를 적용한 결과와 effectiveContent가 정확히 같은지** 확인한다. 같은 본문이면 원래 기록을 반환하고 파일을 추가하지 않는다. 임의로 다시 쓴 본문이나 파생 기록의 재파생은 거부한다.

파생 기록은 기존 before 참조·수정 요청·문제 설명·모델의 수정 보고를 유지하고 실제 정리된 after의 hash·diff·보존 인용 상태를 새로 계산한다. `sourceAttribution=host-recorded-post-write-surface-normalization` 및 `derivedFrom={experienceId, afterSha256, reason: "post-write-surface-normalization", language}`로 원래 모델 응답과 구분한다. raw 기록과 raw 본문은 덮어쓰지 않는다. 조회할 때도 원래 경험의 무결성, 동일한 요청, 실제 정규화 관계를 다시 확인하므로 원래 본문이 변조되거나 사라지면 파생 사례도 제외된다. 자동 선택 결과는 재심사에서 사용한 파생 본문에 연결하고, 다음 문맥에도 raw 경험 ID와 hash를 표시한다.

## 다음 수정에서 참고하는 조건

`loadRevisionExperienceContext(bookDir, {bookId, chapterNumber, issues, query, preferredExperienceIds?, maxCharacters?, maxCases?, language?})`가 문맥과 제외 사유를 반환한다.

- 같은 Book의 현재/이전 회차만 읽는다. 과거 사례의 본문과 diff hash, outcome hash를 조회 때 다시 확인한다.
- 당시 오류 원인과 현재 요청이 연결되어야 한다. ruleId가 서로 다르면 제외한다. dimension/category가 같다는 이유만으로 선택하지 않고 구체 설명의 의미 있는 단어와 편집 원인 표식도 요구한다. 자유 요청은 적어도 세 개의 의미 있는 공통 단어와 같은 원인 표식이 있어야 한다.
- 인물 이름·계약금 같은 소재 단어만 공유하면 제외한다. 이 검색은 보수적인 한국어/영어 단어 및 원인 표식 검색이며 일반적인 의미 추론 모델이 아니다. 모르는 원인이나 다른 표현은 놓칠 수 있다.
- 기본적으로 실제 automatic-selected 결과가 있는 candidate만 참고한다. 결과가 없거나 tie/invalid/not-selected이면 넣지 않는다. 같은 후보에 모순된 자동 결과가 여러 개 있으면 임의로 최신/첫 파일을 고르지 않는다.
- 호출자가 명시적으로 `preferredExperienceIds`를 넘긴 후보는 별도로 참고할 수 있다. 이 경우에도 오류 원인 연결과 본문 검증을 통과해야 하고, 기존 자동 결과를 숨기지 않는다. 이 옵션을 모델이 스스로 선호를 선언하는 통로로 쓰지 않는다.
- 보존 인용이 주어졌는데 수정문에서 사라졌다면 자동 선택됐거나 명시적으로 선호됐어도 재사용하지 않는다. 보존 인용을 주지 않은 사례에 인과 보존을 입증했다고 표시하지 않는다. 인용이 남았다는 것만으로 전체 의미가 유지됐다고 단정하지도 않는다.
- before/after 변경 구간과 주변 문맥을 한 쌍으로 넣는다. 기본 예산 6,000자·2사례에서 한쪽만 자르거나 보존 근거를 생략해 억지로 넣지 않는다. 전문은 기존 증거에 남아 있다.

요청이나 문제 설명이 없는 평범한 집필에서는 조회 문맥이 비어 있다. Reviser의 기존 no-work 반환은 새 조회·기록보다 먼저 실행되므로 모델 호출이나 경험 파일이 추가되지 않는다. `ctx.bookId`와 `book.json`이 없는 기존 독립 호출도 계속 동작한다. 실제 Book이 있으면 그 ID와 원문을 검증하며, 선택적인 경험 저장 실패가 기존 수정 결과를 바꾸지는 않는다.

## 검증

```sh
cd edge_repos/inkos
pnpm --filter @actalk/inkos-core exec vitest run \
  src/__tests__/revision-experience.test.ts \
  src/__tests__/revision-experience-integration.test.ts \
  src/__tests__/chapter-review-cycle.test.ts \
  src/__tests__/chapter-workspace.test.ts \
  src/__tests__/reviser.test.ts
pnpm --filter @actalk/inkos-core typecheck
```

2026-09-12 21:48 KST에 독립 모듈 16개, 실제 호출부 통합 6개, 기존 review cycle 17개·chapter workspace 6개·Reviser 19개, 총 **64개** 테스트가 통과했다. 같은 SHA에 다른 본문 연결, 원본/수정문 복원, archive 재사용, 후보/동률/심사 실패 분리, 잘못된 화자 원인을 반복 설명 사례로 검색하지 않기, 명시된 인과 근거 삭제 제외, 양쪽 문맥 예산, 원문·outcome 변조를 확인했다.

실제 호출부 통합 테스트는 임시 Book 한 개에서 `ReviserAgent`의 chat 응답만 고정하고 실제 parser·기록·`runChapterReviewCycle`·다음 Reviser 문맥 조회를 실행한다. 첫 cycle의 수정 호출 1회와 심사 2회, 다음 수정 호출 1회로 기존 호출 수를 유지했다. 선택 사례의 ID, before/after SHA와 변경 문장 양쪽이 다음 프롬프트에 들어가며, 사람이 선호한 수정으로 표시되지 않는 것을 확인했다. 네트워크 fetch를 막은 상태에서 실모델 호출은 0회다. Book 파일, 실제 원고 파일, 현재 상태 파일은 그대로 남았다.

나머지 통합 검증은 재심사 파싱 실패 사례 제외, 동률 사례 제외, 문맥 예산 부족 시 쌍 전체 제외, 다른 오류 원인 제외, no-work 호출 시 모델/파일 추가 없음이다. 실제 Reviser가 CRLF·메모 줄·em dash를 포함한 후보를 반환한 뒤 실제 review cycle이 표면을 정리하고 채택하는 경우도 실행했다. 서로 다른 raw/파생 기록 두 개를 보존하며 파생 본문의 자동 선택 결과가 다음 Reviser 문맥에 들어가고, 메모 줄은 재사용되지 않는 것을 확인했다. 이 경로도 수정 1회·심사 2회·다음 수정 1회로 끝난다.

동률은 실제 Reviser가 만든 후보에 고정 심사 snapshot을 전달해 결과 경계를 검사했다. 현재 review cycle은 첫 통과 수정에서 멈추므로 자연스럽게 두 개의 통과 snapshot이 동률인 cycle을 만들었다고 주장하지 않는다. 기존 Reviser 회귀 테스트도 함께 실행해 Book ID를 주지 않은 호출과 원고 보존 검사를 확인했다. core TypeScript 검사와 `git diff --check`도 통과했다.

자동 점수가 사람의 독서 경험을 대신한다거나 이 기록만으로 수정 품질이 올랐다고 주장하지 않는다.
