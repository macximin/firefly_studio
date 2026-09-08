# 최신 p01 초반 변주 실행 결과

2026-09-06

**새 변주 두 안 생성, 원문을 넣은 별도 세션 심사, 로컬 Storyyard 패킷 생성과 검증을 완료했다.** 감독 추천은 금융형 v01이다. 별도 모델 심사는 사업형 v02를 추천했으며, 이 차이와 검토에서 발견한 출처 오류를 숨기지 않고 [사람이 읽을 비교 문서](../edge_repos/inkos/.inkos/source-first-canaries/chaebol-hil-surface-20260906-v1/hil-comparison.md)에 함께 적었다.

## 결과와 판단

| 항목 | 결과 |
| --- | --- |
| 출발점 | `chaebol-protagonist-context-20260906-v3` p01, 강도현 |
| 새 실행 | `chaebol-hil-surface-20260906-v1` |
| 범위 | 초반 1~4화와 첫 회수 뒤 다음 자기 목적 |
| v01 | 파운드를 팔아 영국 회사를 샀다 — 거래자 선택·파운드 회수·제조사 지분 60% |
| v02 | 재벌 3세는 버린 연구소부터 사들인다 — 연구소 인수·상품 매각·조직 유지·다음 개발 |
| 별도 심사 | 둘 다 ready, v02 추천 |
| 감독 판단 | v01 우선. v02는 사건 변화가 크지만 반복 검수로 회귀 재벌물의 우위가 옅어짐 |
| 사람 판단 | 기존 p01 HOLD 유지, 새 변주 선택은 아직 없음 |
| Storyyard | v5 패킷 로컬 생성·양쪽 계약 검증 완료. 새 패킷 원격 게시·사이트 재배포 없음 |

금융형은 첫 인재 선택의 차이와 상대 반응을 키울 필요가 있다. 사업형은 2화의 대표 실증, 3화의 구매자 태도 변화, 4화의 회수 뒤 다음 사업 착수로 비중을 정리할 여지가 있다. 금액·수익 배수를 일률적인 합격선으로 추가하지 않았다.

v01에는 최신 기준안에 없는 **1995년 조기 졸업·입사 계획을 기준안의 사실로 돌린 설명**이 있다. 별도 심사는 이 대목을 반복하면서도 sourceAccuracy를 통과시켰다. 해당 문장과 심사를 수동으로 덮어쓰지 않고 [별도 발견 기록](../edge_repos/inkos/.inkos/source-first-canaries/chaebol-hil-surface-20260906-v1/supervisor-source-finding.json)에 남겼다. 따라서 실행 증거 검증의 통과와 내용 무결점 판정을 혼동하면 안 된다.

이번 실행은 실제 사건 변주가 가능함을 보여 준다. 동시에 생성과 별도 심사가 같은 출처 단정을 공유할 수 있고, 심사가 표면 차이를 높게 평가하면서 원래 장르의 재미가 약해진 것을 충분히 반영하지 않을 수 있음을 확인했다. 후속 기획 확장에는 사람의 방향 선택과 이 구체 수정 사항을 함께 전달해야 한다.

## 실행과 사용량

모델 설정은 변경하지 않았다. 실제 호출은 모두 `gpt-6-astra / codex-cli / high`, 도구 없는 새 세션이다. 세 작품의 지정 사건 6개를 원문 파일 해시·행 구간·발췌 해시와 대조했고, 생성은 방향별 4개 사건, 비교 심사는 6개 사건과 두 후보를 받았다. 전편 심사로 보고하지 않는다.

| 호출 | 입력 | 출력 | 합계 |
| --- | ---: | ---: | ---: |
| 금융형 생성 | 66,650 | 7,463 | 74,113 |
| 사업형 생성 | 52,707 | 7,333 | 60,040 |
| 별도 비교 심사 | 97,341 | 3,087 | 100,428 |
| 합계 | 216,698 | 17,883 | **234,581** |

캐시 입력 6,528과 추론 출력 3,577은 각각 입력·출력의 부분집합이다. 중복 가산하지 않았다. 이 표는 InkOS의 세 호출만 집계하며 현재 감독 대화·보조 검토의 사용량이나 청구 금액은 아니다. [원본 호출·사용량 검증](../edge_repos/inkos/.inkos/source-first-canaries/chaebol-hil-surface-20260906-v1/verification.json)

## 실행 중 수정한 공정

v01 실제 응답의 JSON 문자열 안에 잘못 표기된 줄바꿈 5개가 있어 최초 저장이 실패했다. 후보를 다시 생성하지 않고 기존 응답을 복구하는 좁은 경로를 InkOS `pitch-variation`에 추가했다.

- 문자열 내부의 그대로 들어간 제어문자만 JSON escape로 표현한다. 다른 문법 오류·문장·숫자·필드 내용은 수정하지 않는다.
- `recover-saved-call`은 prepared 입력과 원문, 프롬프트, 실제 응답·세션·실패 기록을 재검증하고 새 후보 산출물을 저장한다. 기존 산출물과 원 실패 기록을 덮어쓰지 않는다.
- 원 응답 해시, 변환 위치·문자값, 변환 후 해시, 복구 근거를 영수증에 남긴다. 정상 생성·기존 후보 로드·심사 로드도 같은 규칙으로 재현한다.
- v02의 줄바꿈 8개는 새 경로에서 바로 처리되어 별도 실패나 재호출이 없었다. 심사는 정상 JSON이었다.

두 후보는 Python의 별도 파서로도 최초 응답과 저장된 전체 객체가 정확히 같음을 확인했다. 내용 복구나 추가 모델 호출은 없었다. [독립 대조](../edge_repos/inkos/.inkos/source-first-canaries/chaebol-hil-surface-20260906-v1/format-normalization-verification.json)

변경한 InkOS 파일은 `packages/cli/src/commands/pitch-variation.ts`와 `packages/cli/src/__tests__/pitch-variation-recovery.test.ts`다. 관련 검사 16개, CLI 빌드, diff 검사를 통과했다. 제어문자와 기존 escape 보존, 나머지 문법 오류 거부, 입력·응답·실패·원문 변조 거부, 덮어쓰기 거부, 복구 후 재호출 없는 재개를 확인했다.

## 검증과 인계

- 실행 verifier 통과: 누락·실패 없음. 실제 생성 2세션과 심사 1세션, 요청·원문·응답·후보·심사·패킷 연결을 재현했다. 최초 parse 실패 1건과 복구 사실은 결과에 표시했다.
- 실행 전 지정 보호 파일 12개와 HQ/InkOS Git HEAD 2개가 유지됐다. 전체 가족 저장소의 무변경 검사를 의미하지 않는다.
- 최신 p01·기존 HIL 보류 기록·기존 Storyyard 패킷은 그대로다. 새 인간 선택, Book·A/B레일·원고 생성은 없다.
- 새 패킷 ID는 `frp-be196001f1ab38c438922883`이다. [Storyyard 계약 검사](../edge_repos/inkos/.inkos/source-first-canaries/chaebol-hil-surface-20260906-v1/storyyard-contract-verification.json), [로컬 패킷](../edge_repos/inkos/.inkos/source-first-canaries/chaebol-hil-surface-20260906-v1/prepared/storyyard-packet.json).

재검증: InkOS 루트에서 `node .inkos/source-first-canaries/chaebol-hil-surface-20260906-v1/verify-run.mjs`.
