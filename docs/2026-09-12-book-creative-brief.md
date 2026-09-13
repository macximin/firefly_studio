# 작품별 창작 의도 투영 — W06

2026-09-12. 현재 Book의 명시적인 창작 방향을 짧은 모델 입력으로 읽는 기능이다. 읽기 투영은 새 모델 호출·사람 검토 요청·Book 파일 쓰기를 하지 않는다. 기존 agent에 전달한 입력은 별도 기록 함수로 advisory sidecar에 남길 수 있다. 인용에 근거가 있다는 것과 사람이 승인했다는 것은 구별한다.

구현은 [creative-brief.ts](../edge_repos/inkos/packages/core/src/planning/creative-brief.ts), 자료 형식은 [models/creative-brief.ts](../edge_repos/inkos/packages/core/src/models/creative-brief.ts), 검증은 [fixture 테스트](../edge_repos/inkos/packages/core/src/__tests__/creative-brief.test.ts)에 있다.

## 읽는 자료와 권한

기본으로 `story/author_intent.md`, `story/current_focus.md`, `story/brief.md`를 읽는다. 독자 약속, 주인공의 사적 욕망, 선호, 피할 것, 보존할 것, 목소리, 현재 집중점, 일반 창작 방향을 명시적인 제목·라벨로 구분한다. 한국어·영어·중국어의 지정 라벨을 지원한다.

Book ID는 기존 `isSafeBookId` 계약을 그대로 사용하므로 한글 등 기존의 안전한 ID를 지원한다. 잘못된 Book ID로 optional 읽기를 호출하면 파일을 읽지 않고 빈 투영과 진단을 돌려준다. source ID의 제한은 그대로 유지한다.

예를 들어 `## 독자 약속` 아래의 문장이나 `보존할 것: 손해를 감수하는 이유를 생각하는 내면.`은 해당 항목으로 읽는다. 작가 의도 문서의 일반 문장은 일반 방향, 현재 집중점 문서의 일반 문장은 현재 집중점으로만 남긴다. 일반 브리프의 줄거리에서 숨은 욕망이나 취향을 추론하지 않는다.

빈 양식·기입 안내·코드 예제·주석·인용문·명시적인 참고작 분석 구역은 방향으로 수집하지 않는다. 상반된 명시 문장은 둘 다 보존하며 어느 쪽이 맞는지 자동 결정하지 않는다.

모든 항목은 `advisory`다. `avoid`라는 항목 이름이 있어도 자동 금지 규칙이 되지 않는다. `book_rules.md` 원문을 이 투영으로 우회 수입하지 않는다. 강제 규칙은 기존 `readEffectiveBookRules`와 검증된 `ruleRefs` 경로를 계속 사용한다. 문서 파일 이름만으로 실제 작성자가 사람이라는 사실도 주장하지 않는다.

## 선호 의견과 그때 읽은 본문

이미 출처를 연결한 자료를 추가하려면 선택적인 Book 내부 입력 `story/creative_brief.sources.json`을 사용할 수 있다. 이 기능이 해당 파일을 만들거나 기존 검토 서비스를 호출하지는 않는다.

`book-creative-brief-sources/v1`에는 다음을 명시한다.

- `bookId`: 이 Book의 ID.
- `sources`: Book 기준 상대 경로, 파일 바이트 SHA-256, 출처 종류, 정확한 인용 구간.
- `kind`: `preference-evidence` 또는 `reference-analysis`. 참고작 분석은 사용자 취향으로 바뀌지 않는다.
- `selections`: 항목 종류와 `start`, `end`, `quoteSha256`. 좌표는 원래 UTF-8 바이트 기준이며 시작 포함·끝 제외다.
- `reviewedText`: 선호 의견이 읽고 반응한 본문의 경로·파일 SHA·정확한 구간·구간 SHA. **선호 의견에는 이 결합이 필수다.** 본문 없는 좋아요/싫어요만으로 취향을 채우지 않는다.
- 선택적인 `scope`: 적용할 `fromChapter`·`throughChapter`.

선호 의견과 검토 당시 본문을 각각 검증한다. 파일이 바뀌었거나 구간이 맞지 않으면 해당 의견을 투영하지 않는다. 모델 입력에도 선택된 의견과 연결 본문을 한 묶음으로 넣으며 예산이 부족하면 묶음 전체를 뺀다. 참고작 분석만 있는 항목은 Book의 미확인 취향을 확인된 것으로 채우지 않는다.

자료 경로는 Book 안에 있어야 한다. 상위 경로 이동, 절대 경로, Book 밖으로 나가는 심볼릭 링크는 허용하지 않는다. 외부 저장소의 원문을 찾아 자동 복사하지 않는다. 파일은 최대 512 KiB, 한 인용은 최대 12 KiB이며 UTF-8 바이트 경계를 검증한다.

이 결합은 어떤 의견과 본문을 함께 읽는지 증명하는 입력 계약이다. 사람 신원·승인·채택 영수증을 대신하지 않는다. 그런 권한을 요구하는 기존 작업은 기존 계약으로 검증한다.

## 오래된 집중점과 변경 감지

같은 sources 입력의 `documentScopes`에서 기본 3문서의 경로·파일 SHA·회차 범위를 묶을 수 있다. 범위 밖 문서는 `out-of-scope`, 회차를 주지 않은 범위 문서는 `scope-unresolved`, 파일이 바뀐 고정 문서는 `stale`로 남기고 이 투영에 본문을 넣지 않는다. 범위가 없는 기존 문서에는 과거 회차에도 맞는다는 보장을 붙이지 않는다.

이 범위는 추가한 창작 의도 투영에만 적용된다. 기존 Planner의 목표 계산·기본 브리프, Composer의 작가 의도·현재 집중점 입력은 원래 문서를 계속 읽는다. 따라서 `documentScopes`는 원문 지시를 전체 모델 입력에서 차단하는 설정이 아니다. 오래된 방향을 작품 전체에서 철회하려면 기존 방향 문서도 실제 현재 의도에 맞게 관리해야 한다.

sources 파일이 잘못됐거나 다른 Book에 묶여 있으면 문서 범위를 알 수 없으므로 이 투영은 비운다. 원래 Book 파일은 그대로 유지한다. 문서가 없으면 `missing`, 읽을 수 없으면 `unreadable` 등으로 기록한다. 누락된 항목을 모델에게 발명하게 하지 않는다.

`previousReceipt`를 주면 원래 경로·상태·해시와 현재 자료를 비교해 `unchanged`, `added`, `changed`를 기록한다. 기본 문서의 변경은 새 인용으로 재계산하며, 고정된 선호 자료나 회차 범위의 해시 불일치는 새 지시로 묵인하지 않는다. 모델 입력을 캐시해 재사용할 때는 `verifyBookCreativeBriefSources`로 파일 변경·삭제·새로 생긴 문서를 확인할 수 있다.

## 모델 입력에 연결하는 방법

```ts
import {
  readBookCreativeBrief,
  renderBookCreativeBrief,
  resolveBookCreativeBrief,
  verifyBookCreativeBriefSources,
} from "../planning/creative-brief.js";

const brief = await resolveBookCreativeBrief({
  bookDir,
  bookId,
  chapterNumber,
  language: "ko",
  maxCharacters: 6500,
  maxInputTokens: remainingInputTokens,
});

if (brief.rendered) userPrompt += "\n\n" + brief.rendered;
// brief.receipt에는 선택·누락 ID와 출처 해시만 있고 인용 본문은 없다.
// 기존 실행 영수증에 저장할 때 이 receipt를 사용한다.
```

기본 입력과 출력 예약량을 먼저 계산한 후 남은 토큰 예산을 넘긴다. 예산을 초과하는 인용을 중간에서 자르지 않는다. 항목별로 순환해서 고르므로 긴 일반 방향이 명시적인 독자 약속이나 현재 집중점을 전부 밀어내지 않는다. 이런 분량 배분은 규칙의 권한 순위가 아니다.

이미 자료를 읽었다면 `readBookCreativeBrief`의 투영을 보관했다가 최종 프롬프트 조립 단계에서 `renderBookCreativeBrief`로 실제 남은 예산에 맞춰 렌더링할 수 있다. `resolveBookCreativeBrief`는 이 둘을 한 번에 호출하는 함수다.

이 투영은 기존의 줄거리·캐릭터·현재 상태 입력을 대신하지 않는다. `mustAvoid`, hard rule, 자동 수정 조건으로 변환하지 않고 출처가 표시된 참고 섹션에 연결한다. 실제 Planner·Writer·Reviser 연결은 아래의 기존 호출 통합에 포함된다.

`recordBookCreativeBrief`는 실제 전달한 문맥과 영수증을 `story/runtime/creative-brief/`에 저장한다. mkdir·write 전에 공통 `assertBookAdvisoryWritePaths`로 Book 밖으로 향하는 parent·leaf 심볼릭 링크와 끊어진 링크를 거부한다. 기존 방향 문서나 원고는 수정하지 않는다.

## 검증과 한계

임시 Book fixture에서 원래 BOM·CRLF·UTF-8 좌표, 항목 분류, 양식 제외, 출처와 읽은 본문 결합, 잘못된 selector, 오래된 범위, 누락·변경, 경로 이탈, 예산, 무쓰기와 기존 hard-rule 경계가 검증된다. 실제 Book이나 원고를 수정하지 않았다.

이것은 명시된 창작 방향의 읽기·출처 확인·분량 조절 구현이다. 모호한 취향을 새로운 장면으로 해석하거나, 여러 작품의 선호가 다음 작품에도 통하는지 판단하거나, 독자가 더 재미있다고 느끼는지 검증하는 기능은 포함하지 않는다. 확인된 방향이 없는 항목은 `unknownCategories`에 남는다.

## 기존 호출 통합

Planner·Writer·Reviser가 실제 기존 호출의 잔여 토큰 예산으로 이 투영을 읽는다. 뒤에 들어가는 작법 참고·초고 발견·서사 근거도 앞선 입력 비용을 차감한다. 정확한 rendered 문자열과 출처·선택 기록을 `story/runtime/creative-brief/<chapter>-<stage>-<hash>.json`에 불변 저장한다. 실제 호출 3경로·예산 소진·기록 충돌·한글 Book ID·각 호출의 기록 실패를 포함한 9개 통합 fixture가 통과했다. optional 기록이 실패하면 경고하고 기존 모델 호출을 계속한다. 기존 방향 문서와 verified hard rules의 권한은 별도 경로를 유지한다.
