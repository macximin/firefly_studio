# Hermes → Grok / Google CLI 연결 후속 확인

2026-09-06. 요청 범위는 두 미완료 연결의 해결 가능성 확인이다. 기획 카나리, 원문 업로드, 기획서 생성은 계속 보류한다. 기존 InkOS/Hermes 생산 설정은 변경하지 않는다.

## Grok: 기존 CLI를 호출하는 경로는 핑 통과

실제 `Hermes(openai-codex / gpt-6-astra, low) → terminal → Grok CLI`를 실행했다. Hermes 세션 `20260906_223353_383b34`의 도구 호출과 도구 결과를 직접 읽어 확인했다. Grok 실행 종료 코드 0, 응답에 `GROK_BRIDGE_PING_OK_20260906`이 있었다. Hermes 전체 실행은 19.1초였다.

기존 Grok CLI의 grok.com 로그인을 사용하므로 별도 Hermes `xai-oauth` 인증이 없어도 이 경로는 작동한다. 앞선 OAuth 실패는 Hermes 자체의 모델 제공자를 xAI OAuth로 바꾸는 시험이었으며, 외부 CLI 호출 실패가 아니었다.

이번 시험에서 Hermes의 지휘 모델은 Astra이고 응답 작성자는 Grok이다. Hermes의 두뇌 자체를 Grok으로 바꾼 것은 아니다. 실제 기획 때에도 관리자와 작성자를 별도로 기록해야 한다. 단순 실행마다 관리자 모델을 여러 번 호출하는 비용을 줄이려면 고정된 실행·결과 수집 래퍼를 쓰는 것이 적합하다. 아직 그 생산용 래퍼는 구현하지 않았다.

Grok의 전역 플러그인·훅 호환 경고가 도구 출력에 섞였다. 핑과 종료 코드는 확인했지만, 경고 없는 운영이나 출력 원문 보존까지 검증한 것은 아니다. 생산 연결에서는 stdout/stderr를 별도 파일로 받아야 한다. 현재 사용자 설정을 수리하거나 제거하지 않았다.

근거: `.firefly/provider-ping-20260906/hermes-to-grok-cli.json`, `hermes-to-grok-cli-transcript.json`, `hermes-to-grok-cli-usage.json`.

## Google: 단순 실행기 설치 전에 제품 경로를 정해야 함

확인한 로컬 PATH와 설치 위치, 전역 npm 목록에는 `gemini` / `@google/gemini-cli`가 없었다. 다만 `/Users/a2501/.gemini/bin/agy`는 이미 설치돼 있었고, `agy --help`와 서버에서 가져온 `agy models` 목록이 정상 반환됐다. 목록에는 Gemini 3.8 Flash와 Gemini 3.1 Pro 등이 있었다. 모델 목록 성공만으로 모든 모델의 생성 가능 여부나 잔여 한도를 확정하지 않는다.

Google의 2026-05-19 공식 전환 공지는 개인 무료·Google AI Pro·Ultra의 기존 Gemini CLI 요청을 2026-06-18부터 중단하고 Antigravity CLI로 옮긴다고 명시한다. Standard/Enterprise 및 유료 API 키 경로는 별도로 유지한다. 따라서 개인 구독을 활용하려는 목적이면 `gemini`를 새로 설치하는 것만으로 해결된다고 안내하면 안 된다.

- 권장 대안: `Hermes → Antigravity CLI(agy) → Gemini`. 설치된 실행기를 활용한다. 기존 Gemini CLI와 제품·하네스가 다르므로 작성 경로에 Antigravity를 명시한다.
- 기존 Gemini CLI가 반드시 필요하다면: 공식 `@google/gemini-cli` 설치와 해당 계정의 Standard/Enterprise 또는 유료 API 경로를 확인한다. 이번에는 설치·결제·API 키 설정을 하지 않았다.
- Hermes의 Gemini native API adapter는 API 키 기반 별도 경로다. CLI 구독 연결로 대신 표시하지 않는다.

Hermes 소스의 `external_process` 지원도 확인했다. 현재 확인한 기본 구현은 Copilot ACP이며, 임의의 `gemini`나 `grok` 명령을 제공자 이름만 바꿔 바로 쓰는 범용 연결은 아니다. 이번 범위에는 Hermes 코어 수정보다 이미 작동하는 터미널 호출 경로가 적합하다.

공식 근거(ego lite에서 직접 확인):

- [Google의 Gemini CLI → Antigravity CLI 전환 공지](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
- [Gemini CLI 설치](https://geminicli.com/docs/get-started/installation/)
- [Gemini CLI 인증](https://geminicli.com/docs/get-started/authentication/)
- [Antigravity CLI 이관 문서](https://antigravity.google/docs/cli/gcli-migration)

인증 안내 본문에는 과거 개인 계정 안내도 남아 있으므로, 현재 개인 구독 경로 판단에는 명시적인 전환 공지를 우선했다. 사용자 계정의 구독 종류 자체를 추정하지 않는다.

## Google 대안 경로 실제 핑 결과

`Hermes(Astra low) → terminal → agy --model gemini-3.8-flash-low`를 프로젝트 밖의 빈 임시 디렉터리에서 실행했다. Hermes 도구 결과의 종료 코드 0, agy JSON의 `status=SUCCESS`, 응답 `GOOGLE_CLI_BRIDGE_PING_OK_20260906`, `num_turns=1`을 확인했다. Hermes 전체 호출 24.8초, agy 응답의 duration은 약 1.72초다. agy 응답에는 입력 13,557토큰·출력 18토큰이 기록됐다. 단문 핑이라도 CLI의 기본 컨텍스트 비용이 있으므로, 본 생산의 비용을 핑 문장 길이만으로 계산하지 않는다.

`--disable-slash-commands`를 쓰면 `--mode plan`이 적용되지 않는다는 경고도 확인했다. 이를 도구 차단이 적용된 시험으로 설명하지 않는다. 제출한 프롬프트는 도구·파일·웹·에이전트 작업 없이 비콘텐츠 응답만 요청했다. 향후 운영 래퍼는 CLI별 옵션 차이를 반영해야 한다.

새 패키지 설치, 새 로그인, 자격 증명 복사, 생산 프로필 변경은 없었다. Google의 기존 Gemini CLI 자체는 여전히 미시험이고, Antigravity CLI를 통한 Gemini 호출만 이번에 검증했다. 기획서 작성과 입력 묶음 전달은 검증하지 않았다.

근거: `.firefly/provider-ping-20260906/hermes-to-agy-cli.json`, `hermes-to-agy-cli-transcript.json`, `hermes-to-agy-cli-usage.json`.
