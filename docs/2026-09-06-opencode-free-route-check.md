# OpenCode 무료 경로 확인

2026-09-06. OpenCode 설치 및 무료 모델의 실제 가용성만 확인했다. 기획 카나리·원문 업로드·Hermes 생산 설정 변경은 하지 않았다.

- 설치: `/opt/homebrew/bin/opencode`, 버전 `1.18.20`.
- `opencode auth list`: 저장된 자격 증명 0개.
- `opencode models opencode`: 무료 모델 7개 표시. 공식 가격표와 함께 확인된 현행 목록은 아래 6개다. 로컬 목록에만 추가로 표시된 Muse Spark 1.2 Contributor Free는 이번 공식 현행 목록에 포함시키지 않았다.

| 공식 무료 모델 | 검증 상태 |
| --- | --- |
| MiMo-V2.5 Free | 실제 핑 PASS |
| Big Pickle | 로컬 목록·공식 무료 가격표 확인 |
| Ling 3.0 Flash Fin Free | 로컬 목록·공식 무료 가격표 확인 |
| Nemotron 3 Ultra Free | 로컬 목록·공식 무료 가격표 확인 |
| Nemotron 3.5 Lightning Free | 로컬 목록·공식 무료 가격표 확인 |
| Muse Spark 1.3 Contributor Free | 로컬 목록·공식 무료 가격표 확인 |

`opencode run --pure --model opencode/mimo-v2.5-free --agent plan --format json`을 프로젝트 밖 빈 임시 디렉터리에서 짧은 핑으로 실행했다. 종료 코드 0, `OPENCODE_FREE_PING_OK`, step-finish cost 0, 실행 6.7초를 확인했다. 모델 변경·추가 설치·인증·결제 설정 없이 성공했다. 실제 무료 가격표와 해당 핑의 비용 기록을 함께 확인한 것이며 무제한·영구 무료를 의미하지 않는다.

Hermes → OpenCode 호출 자체는 아직 시험하지 않았다. 기존 현대판타지 6개 비교의 분량이나 경로를 변경한 것은 아니며 추가 비교 후보로만 기록한다. 기획 품질과 높은 추론 옵션도 미검증이다.

무료 모델은 기간 한정 제공이고 데이터 조건이 모델별로 다르다. 공식 문서는 MiMo·Big Pickle 등의 무료 기간 입력이 모델 개선에 사용될 수 있다고 명시하며, Muse Contributor에는 학습 허용 조건, NVIDIA 무료 엔드포인트에는 평가판·데이터 기록 조건이 있다. 원문 코퍼스를 넣는 문제는 이 조건과 분리해서 결정해야 한다. 이번에는 비콘텐츠 핑만 보냈다.

근거: [OpenCode Zen 공식 문서](https://opencode.ai/docs/zen/), `.firefly/provider-ping-20260906/opencode-mimo-free-ping.json`.
