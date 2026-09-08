# 기획 비교 경로의 높은 추론 설정

2026-09-06. 사용자 지시: 웹은 가용한 가장 높은 추론으로 선택하고, Grok·Gemini CLI의 높은 추론 모델 지정 가능 여부를 확인한다. 기획 카나리는 계속 금지한다.

## 웹에서 선택·확인한 설정

| 경로 | 선택 | 확인 범위 |
| --- | --- | --- |
| ChatGPT | 최신 계열의 `6 Pro` | 추론 수준 슬라이더 5단계 중 5번째. 새로고침 후 `6 Pro` 유지. 내부 API 모델 ID로 해석하지 않음 |
| Grok | 전문가 · Grok 4.6 | 새로고침 후 전문가 유지. 헤비 선택은 구독 업그레이드 화면으로 이어져 현재 구독에서 사용할 수 있는 전문가를 선택 |
| Gemini | 3.1 Pro + 확장된 사고 (`Pro Extended`) | UI에서 선택 가능. 새로고침 후 Pro는 유지되지만 Extended는 해제됨. 재선택하여 확인 |

브라우저 작업은 ego lite의 task space 5에서 수행했다. 새 프롬프트 전송이나 기획 생성은 하지 않았다. 현재 작업 공간에서 선택과 새로고침을 확인한 결과이며, 다른 브라우저·기기·향후 독립 작업 공간까지 설정이 전파됐다고 주장하지 않는다.

**실행 규칙:** 기획 입력을 보내기 직전에 해당 계정에서 사용 가능한 가장 높은 추론을 선택하고 화면에서 다시 확인한다. Gemini는 `Pro Extended`를 매번 확인·재선택한다. 웹에 새 모드가 추가되거나 구독·한도가 달라지면 관측 결과를 기록한다. 다른 모드로 조용히 대체하지 않는다. 구독 업그레이드는 하지 않았다.

## CLI 모델·추론 지정 확인

| 경로 | 검증한 호출 옵션 | 결과 |
| --- | --- | --- |
| Grok CLI | `--model grok-4.6 --reasoning-effort high` | 종료 코드 0, `HIGH_REASONING_PING_OK`, reasoning token 사용량 기록 |
| Antigravity CLI의 Gemini | `--model gemini-3.1-pro-high --effort high` | 종료 코드 0, JSON `SUCCESS`, `HIGH_REASONING_PING_OK`, thinking token 사용량 기록 |

두 시험은 프로젝트 밖 빈 임시 디렉터리에서 짧은 핑만 실행했다. 기존 Hermes → CLI 호출 경로는 앞선 시험에서 검증했고, 이번에는 해당 CLI에 명시적인 모델·추론 옵션을 전달하는 부분을 시험했다. 같은 옵션으로 Hermes 전체 경로를 다시 호출한 것은 아니다.

Grok은 6.0초에 응답했다. 요청 모델은 `grok-4.6`이지만 응답 `modelUsage` 키는 `grok-4.6-build`였다. 원문 영수증에는 둘 다 보존하며 웹 Grok과 동일한 실행 환경으로 취급하지 않는다. high 옵션 수락과 추론 사용량을 확인했으며 가능한 모든 추론 문자열 중 절대 최고임을 검증한 것은 아니다.

Gemini Pro high는 11.5초에 응답했다. agy 도움말의 effort 값은 `low|medium|high`다. 모델 목록에는 `gemini-3.8-flash-high`도 있지만 이번에는 기존 Flash low보다 추론 중심의 Pro high를 시험했다. 짧은 핑 결과는 Pro와 Flash 간 기획 품질 비교가 아니다.

이후 기획용 CLI 호출에는 위 옵션을 명시하는 것을 기준으로 한다. Grok·agy의 사용자 전역 기본값, 기존 InkOS 생산·심사 프로필, Firefly 관리 프로필은 변경하지 않았다. 생산용 실행 래퍼는 아직 별도 구현 전이다.

## 근거

- `.firefly/provider-ping-20260906/web-high-reasoning-settings.json`
- `.firefly/provider-ping-20260906/grok-cli-high-ping.json`
- `.firefly/provider-ping-20260906/agy-gemini-pro-high-ping.json`
- 실제 웹 설정 화면: [ChatGPT](https://chatgpt.com/), [Grok](https://grok.com/), [Gemini](https://gemini.google.com/app?hl=ko)

공개 가격 비교나 구독 구매를 진행하지 않았다. 기획서·원문 업로드, 후보 생성, HIL 게시, 커밋·푸시는 하지 않았다.
