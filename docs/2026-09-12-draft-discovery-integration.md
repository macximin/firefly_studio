# 초고의 발견을 미래 계획에 연결하기 — W15/M08

`edge_repos/inkos/packages/core/src/planning/draft-discovery.ts`는 실제 초고에서 발견한 새 욕망·관계 반응·해법을 **미래 B-Rail 방향의 변경 후보**로 보존한다. 새 LLM 호출이나 새 HIL 대기는 추가하지 않는다. 지금 쓰는 Observer/Settler 호출이 필요할 때만 작은 선택 산출물을 덧붙이고, 다음 Planner/Architect는 검증된 제안을 참고한다.

모듈은 구현되었고 기존 reflow store와 임시 Book에서 연결 실행했다. Writer·Planner의 공용 호출부에 연결하는 작업은 별도 통합자가 맡는다. 이 문서만으로 그 호출부가 연결되었다고 주장하지 않는다.

## 입력과 변경 범위

한 발견은 `kind`, `evidence`, `observation`, `implication`, `futureRevisions`다. kind는 새 욕망, 관계 반응, 발견한 해법, 새 비용, 새 독자 기대, 기존 계획과의 불일치 중 하나다. `evidence`는 본문에 정확히 한 번 존재하는 인용이어야 하며 정규화·요약으로 대체하지 않는다. 저장 시 본문 SHA-256과 UTF-16 시작/끝 위치를 붙인다.

미래 B에는 `narrativeFunction`, `payoffAxis`, `carriedReaderDebt`, `contrastRequirement` 네 필드만 제안할 수 있다. 모든 A, active/closed/retired B, 이미 알려진 Chapter에 연결된 B, 완료 Arc에 연결된 B는 수정 대상이 될 수 없다. 순번, 목표 A, 상태, Arc 연결, 회차 좌표를 모델이 바꾸는 필드는 없다. 전후 값이 같은 제안과 같은 B에 대한 중복 제안도 거부한다.

전체 계획의 정규 JSON hash와 `updatedAt`을 함께 묶는다. 날짜를 유지한 채 계획 내용을 바꿔도 기존 후보는 제외된다. 현재 Chapter·Arc inventory도 묶으므로 작성 범위가 늘거나 Arc 내용이 바뀌면 다시 추출해야 한다. 승인/게시 같은 Chapter 상태 표식만 바뀌는 경우에는 기존 근거를 유지한다. 모델은 인용의 의미를 잘못 판단할 수 있으므로 `authority=advisory-future-plan`, `canonApplied=false`를 유지한다.

## 기존 호출에 붙이는 순서

1. 호출 전에 현재 Rail 계획과 전체 Chapter index, `ArcStore.list()`를 읽는다. 하나라도 같은 Book의 자료가 아니거나 Rail의 Arc 연결이 inventory에서 빠지면 후보 생성을 건너뛰고 진단을 남긴다. Rail이 없는 기존 Book은 지금 경로를 그대로 쓴다.
2. `hashDraftDiscoveryPlan(plan)`과 본문 hash를 **호출 전**에 기록한다. `renderDraftDiscoveryWritableTargets(context)`가 반환한 가까운 미래 방향과 `draftDiscoveryExtractionGuidance(language)`를 기존 호출 입력에 선택적으로 붙인다. 기본 대상 예산은 B 3개·4,000자이며 대상 하나를 중간에 자르지 않는다.
3. 기존 모델 반환 문자열을 `parseDraftDiscoverySuggestions(content)`에 넣는다. `absent` 또는 빈 배열이면 파일을 만들지 않는다. 잘못된 optional JSON은 진단하고 제외한다. 재시도나 새 모델 호출을 이 기능 때문에 만들지 않는다.
4. settlement 이후 본문과 live 계획/inventory를 다시 읽는다. 호출 전 hash와 `createDraftDiscoveryPacket({...liveContext, sourceChapter, chapterText, expectedChapterTextSha256, expectedPlanSha256, suggestions})`를 대조한다. 호출 도중 원문·계획이 달라졌다면 저장하지 않는다.
5. 유효 packet만 `recordDraftDiscoveryPacket(bookDir, packet)`에 넘긴다. `story/runtime/draft-discoveries/<chapter>-<packetId>.json`에 배타적 생성하며 같은 결과는 재사용한다. 기존 파일과 내용이 다르면 덮어쓰지 않는다.
6. 다음 Planner/Architect에서 `loadDraftDiscoveryContext(bookDir, liveContext, {readChapterText, language, maxCharacters: 6000, maxPackets: 2})`를 호출한다. `readChapterText(number)`는 해당 Book의 기존 원고 읽기 경로를 전달한다. loader는 과거 source 본문을 직접 다시 읽어 hash와 인용을 확인한다. 반환된 `rendered`만 참고 문맥에 넣고 `diagnostics`는 실행 기록에 남긴다.

```ts
const parsed = parseDraftDiscoverySuggestions(existingSettlementOutput);
if (parsed.status === "valid" && parsed.suggestions.length > 0) {
  const packet = createDraftDiscoveryPacket({
    ...liveContext,
    sourceChapter: chapterNumber,
    chapterText: currentManuscript,
    expectedChapterTextSha256: manuscriptHashBeforeCall,
    expectedPlanSha256: planHashBeforeCall,
    suggestions: parsed.suggestions,
  });
  await recordDraftDiscoveryPacket(bookDir, packet);
}

const discoveryContext = await loadDraftDiscoveryContext(bookDir, liveContext, {
  readChapterText: readExistingBookChapter,
  language: "ko",
  maxCharacters: remainingPromptCharacters,
});
// Append discoveryContext.rendered to planning input, not objective truth files.
```

`loadDraftDiscoveryContext`는 본문 변경, 계획 변경, inventory 변경, 변조, 읽을 수 없는 파일, 예산 초과를 별도 진단으로 남긴다. packet을 중간에 잘라 반례·변경 근거를 잃게 하지 않는다. 기본 출력은 한 packet 안의 관찰, 인용, 미래 제안, 필드별 전후 변화다. 이전 원고 문장을 사건 요약으로 승격하지 않는다.

## 기존 reflow에 연결하는 방법

`projectDraftDiscoveryReflowDecisions(packet, liveContext, sourceChapterText)`는 계획과 인용을 다시 검증하고 기존 `StoryRailReflowDecision[]`를 반환한다. 제안된 미래 B는 `revise`, 나머지 살아 있는 미래 B는 `keep`다. 계획 적용이나 완료 처리 없이 데이터만 반환한다.

`buildDraftDiscoveryReflowInput`은 이 배열을 기존 pending reflow, 호출자가 제공한 closeout, 다음 active/provisional B 선택과 묶는다. pending이 같은 Book/계획이어야 하고 해당 source chapter의 본문 hash가 기존 approved-chapter evidence에도 있어야 한다. 초고 후보만으로 승인을 만들어 주지 않는다. 기존 `StoryRailReflowStore.apply`가 수행하던 원고·상태·Arc 검증과 원자적 적용을 그대로 사용한다.

이 기능을 얻기 위해 reflow 완료를 기다릴 필요는 없다. 다음 Planner에서 후보를 참고하는 경로는 독립적으로 실행된다. 실제 reflow 적용은 기존 명시적 단계에 남는다. 완료 시 계획 수용량이 모자라는 등의 기존 reflow 조건도 우회하지 않는다. 새 B를 임의로 만들어 용량을 맞추는 기능은 넣지 않았다. 호출자가 별도 신규 B/retire 결정을 함께 다뤄야 한다면 decision projection을 기존 reflow 입력에 명시적으로 병합하고 원래 검증을 통과시켜야 한다.

## 검증

```sh
cd edge_repos/inkos
pnpm --filter @actalk/inkos-core exec vitest run \
  src/__tests__/draft-discovery.test.ts \
  src/__tests__/story-rail-reflow.test.ts
```

새 16개 테스트와 기존 reflow 15개가 통과했다. 임시 Book에 기존 `StoryRailStore`, `ArcStore`, truth receipt를 만들고 실제 prepare→입력 projection→apply를 실행했다. 미래 B의 방향 변경, A 불변, 이미 쓴 원고 불변, 기존 완료 처리 유지가 확인됐다. 실모델 호출은 없으며 원고는 독립 fixture다. 좋은 발견을 모델이 알아차릴 확률이나 독자 만족도 개선을 검증한 것은 아니다.

관련 파일:

- `packages/core/src/planning/draft-discovery.ts`
- `packages/core/src/__tests__/draft-discovery.test.ts`
- `packages/core/src/__tests__/fixtures/draft-discovery-fixture.ts`

독립 모듈 검증 이후 공용 Writer·Planner·runner·Rail 조회 연결을 아래와 같이 추가했다. 필수 runtime-state delta의 계약은 유지하며 발견 응답은 별도 optional 섹션이다.

## 실제 소비 연결

기존 Writer Settler 호출에 수정 가능한 미래 B를 제한된 예산으로 전달하고, 선택적 발견 응답을 받은 본문 SHA·당시 계획 SHA와 함께 반환한다. runner는 원고·index·snapshot을 포함한 기존 transaction 성공 뒤, Book 잠금을 유지한 채 실제 파일을 다시 읽어 같은 본문일 때만 불변 제안으로 보존한다. `writeDraft`, `writeNextChapter`, 상태 복구, 재동기화, 기존 관찰을 가진 반입 결과의 5개 저장 경로가 같은 함수를 사용한다. 실제 반입 Analyzer에는 발견을 위한 새 호출을 추가하지 않았다.

저장 중 실패하면 발견 후보를 만들지 않는다. Book/회차가 다른 observation은 본문이 같아도 제외한다. 메모리의 body SHA를 검증한 후 제목을 포함한 저장 파일 전체 SHA에 결속하므로 기존 reflow truth receipt와 맞는다. 이후 Planner의 기존 호출과 `get_story_rails`가 현재 제안을 읽는다. Planner는 계획할 회차의 이전까지로 제한하여 미래 회차의 발견이 과거 재계획에 섞이지 않게 한다. 미래 제안을 자동 적용하거나 추가 모델 호출을 만드는 경로는 없다.

`draft-discovery-runtime.test.ts`는 실제 Settler 두 호출→저장된 원고 검사→제안 저장→다음 Planner 호출→Rail 조회→기존 reflow 입력 생성, 수정 전 원고 배제와 예산 소진을 확인한다.

`runner-draft-discovery.test.ts`의 8개 fixture는 실제 runner 메서드의 원고/인덱스 저장→다음 기획 조회, 본문 정규화 불일치 제외, 늦은 snapshot 실패 복구, repair/resync/import/write-next 경로, 잘못된 회차의 observation 제외를 확인한다. 합성 모델 출력만 사용한다.
