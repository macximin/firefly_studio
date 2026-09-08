# Firefly Astra 전환과 공정 컨텍스트 효율 점검

작성일: 2026-09-05. 범위는 사용자 지정인 **이번 Firefly 공정 전체: 헤르메스 + InkOS 작성·심사**다.

## 판단

현재 공정의 기본 모델을 `gpt-6-astra / high`로 통일한다. 기존 학습 내용을 다시 작성하거나 원문을 재학습시키는 일은 모델 교체의 선행 조건이 아니다. 다만 같은 학습 자료를 읽어도 판단과 글쓰기 결과는 달라질 수 있으므로, 연결 검증과 작품 품질 검증을 구분한다.

효율 개선은 **형식 오류로 인한 전체 재생성 방지 → 사실 수정 범위 축소 → 역할별 지침과 캐시 측정** 순서가 타당하다. 직전 카나리의 기록된 토큰 중 51.6%가 수정 호출에 쓰였다. 원문을 짧게 요약하거나 인물의 이익·욕망·사건을 추상화하는 방식보다 재작업을 줄이는 것이 먼저다.

OpenAI는 Astra가 여러 평가에서 더 적은 출력 토큰으로 좋은 결과를 낸다고 설명한다. 이는 이번 작품 공정에서 측정한 결과가 아니다. 현재 비교 표본은 Sol 실행뿐이므로 Astra의 절감률이나 작품 우위를 확정하지 않는다. [OpenAI 모델 가이드](https://developers.openai.com/api/docs/guides/latest-model)

## 변경 범위

| 대상 | 변경 |
| --- | --- |
| Hermes 장르 프로필 3개 | 현대판타지·판타지·무협의 기본 모델 Astra/high |
| Hermes 중립 프로필 | Astra/high |
| Hermes 독립 심사 프로필 | Astra/high, 새 config/SOUL 해시 결속 |
| InkOS 프로젝트 기본값 | Astra/high |
| InkOS 역할별 설정 | planner, composer, writer, length-normalizer, auditor, reviser, state-validator 모두 Astra |
| 실행·심사 계약 | 현행 Astra 실행과 과거 Sol 결과 읽기를 구분하고 요청 모델과 실제 기록 모델을 대조 |
| Storyyard 수신 | 기존 패킷 해시 검증을 유지하면서 Sol·Astra 결과를 수신 |

프로필 SOUL의 창작·학습 본문은 유지했다. 현행 5개 SOUL 안의 실행 모델 표기 한 줄만 바꾸고 새 해시를 등록했다. 따라서 파일 전체가 이전과 같은 해시라고 주장하지 않는다. 원본 config와 SOUL은 `.firefly/model-migrations/astra-20260905T133438Z/`에 백업했다.

과거 카나리, 학습·manager QA·synthesis 증거의 Sol 표기는 당시 실행 사실이다. 이를 Astra로 덮어쓰지 않는다. Reference Lab의 기존 장르 재학습 도구는 별도 학습 계약에 따른 Sol 경로가 남아 있으며, 이번 교체는 현행 제작·독립심사 경로에 적용한다. 다른 HQ의 Hermes와 예전 V3 `firefly-studio` 프로필은 이 공정의 등록 프로필이 아니다.

장르 candidate의 `productionEnabled=false`, 중립 baseline 상태, 빈 장르 adoption 목록을 유지했다. 모델 변경은 사람의 채택 결정이나 제작 승인으로 취급하지 않는다.

## 호스트 실행 검증

검증 상세와 최종 상태는 [실행 증거](./evidence/2026-09-05-astra-migration-context-efficiency.json)에 기록한다.

- Hermes 기본값 호출에서 `gpt-6-astra`, reasoning `high`, 응답 `ASTRA_DEFAULT_OK`를 실제 세션 export로 확인했다. 이는 작품 작성·심사 품질 시험이 아니다.
- 5개 Hermes 프로필을 네이티브 read-only config loader로 읽어 모델·reasoning·config/SOUL 해시를 대조했다.
- PATH의 Codex CLI 0.145.0은 새 모델 metadata를 읽지 못했다. 현재 InkOS 프로젝트의 `llm.extra.codexBin`에 앱에 포함된 Codex 0.153.1 경로를 명시했다. 다른 공정의 전역 CLI를 함께 교체하지 않았다.
- 새 catalog에서 Astra의 `tool_mode=code_mode_only`가 확인되어, 기존의 도구 없는 InkOS completion 어댑터와 충돌했다. 공식 `model_catalog_json` 설정을 사용해 실제 모델 catalog의 해당 값만 `direct`로 지정했다. 모델명·한도·reasoning 등 나머지 metadata는 동일하다. 파일 SHA와 모델 entry를 검사하고 검증한 bytes를 임시 실행 폴더에 복사한다. native 도구 차단은 유지했다. [Codex config schema](https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/config.schema.json), [모델별 tool mode 변경](https://github.com/openai/codex/pull/25031)
- 실제 저장 설정을 읽는 `loadProjectConfig → createLLMClient → chatCompletion` 호출이 `ASTRA_PROVIDER_OK`로 완료됐다. runtime은 Astra/high, context 272,000, 출력 한도 32,768이었다. 이 호출에는 테스트용 executable override를 넣지 않았다. 앞선 직접 transport probe의 `ASTRA_INKOS_OK.` 응답은 연결에는 성공했으나 마침표 때문에 정확한 sentinel 일치에는 실패했으며, 그 기록도 보존했다.
- Hermes CLI의 일반 chat 시작이 두 probe 프로필에 bundled skill을 자동 생성했다. 생성 시각을 대조한 뒤 해당 probe 생성물만 백업으로 이동해 등록된 `skillsPolicy=none` 상태를 복구했다.
- 독립심사 프로필에도 기존 bundled skills가 있어 HQ 검증을 막았다. 내용 전체를 별도 백업으로 옮겨 기존 `skillsPolicy=none` 계약에 맞췄다. 학습 SOUL을 삭제한 것은 아니다.

현재 설정은 이 Mac의 실제 실행 경로와 로컬 catalog에 결속되어 있다. 다른 PC에서는 해당 PC의 Codex 바이너리와 catalog를 검증해 경로·SHA를 다시 구성해야 한다. 이번 결과를 다른 PC 적용이나 배포 완료로 간주하지 않는다.

실제 독립심사 경로를 점검하면서 기존 Hermes 설치 호환 문제 세 가지도 수선했다. `web/node_modules/.bin`의 정상 내부 CLI 링크는 링크 문자열·내부 실제 대상·대상 해시를 함께 검증하고, 외부·끊김·디렉터리·변경 링크는 계속 거절한다. macOS에서 같은 물리 경로인 `venv/lib`와 `venv/Lib`는 한 번만 계산하여 기존 fingerprint 용량 한도를 유지한다. Hermes 0.21의 `auth_codex` 모듈 분리도 명시적으로 지원하며, 지정된 격리 환경과 중앙 인증 저장소 결속을 그대로 검사한다. 실제 설치 Python 통합 테스트와 독립 코드 검토를 거쳤다. 이 검증에는 합성 인증 fixture를 사용했으며 실제 비밀값이나 작품을 전송하지 않았다.

이번 Codex catalog의 Astra 기본 context window는 **272,000**, 최대 지원 표기는 872,000이다. 실제 활성 설정은 272,000으로 둔다. API 모델 페이지의 1,050,000 한도를 이 구독 CLI 실행값으로 옮겨 쓰지 않는다. [Astra API 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-astra)

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| HQ manifest·5개 Hermes 프로필·adoption 검사 | 통과, 활성 adoption 0 |
| HQ 전체 테스트 | 163/163 통과 |
| InkOS 관련 테스트 | Core 79 + CLI 27 = 106개 통과 |
| InkOS 빌드 | Core·CLI 통과 |
| Storyyard 전체 테스트 | 58/58 통과 |
| Reference Lab 모델·harness·projection·인증 관련 4개 suite | 43/43 통과 |
| Reference Lab 공용 실행기를 쓰는 기존 학습 도구 5개 suite | 161/161 통과 |
| 실제 Hermes 설치 preflight | current Astra tuple·context 272,000·runtime attestation 통과 |
| 실제 연결 | Hermes 기본 호출 + InkOS 저장 설정 provider 호출 통과 |
| 독립 Git root별 diff 검사 | HQ 및 자식 4개 모두 통과 |

테스트에는 mock/fake process가 포함된다. 이를 모두 실제 모델 실행 횟수로 세지 않는다. 실제 모델 연결 증거는 별도의 세션·provider probe다. 과거 실제 Sol 패킷 6개를 current InkOS parser로 읽었고 5개가 통과했다. 최초의 불완전한 v1 한 건은 원문 범위 필드 6개가 누락되어 계속 거절됐다. 모델 변경으로 인한 거절은 아니며 6개 원본 해시는 모두 유지됐다.

## 직전 카나리의 토큰 사용

대상: `edge_repos/inkos/.inkos/source-first-canaries/chaebol-source-first-20260905-v1`의 6개 세션, 완료된 응답 8개. 전부 `gpt-5.6-sol / codex-cli`다.

| 단계 | 호출 | 입력 토큰 | 출력 토큰 | 합계 | 비중 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 최초 생성 | 2 | 156,104 | 31,825 | 187,929 | 22.7% |
| 형식·계약 수정 | 2 | 182,207 | 28,063 | 210,270 | 25.4% |
| 사실 수정 | 2 | 200,679 | 16,657 | 217,336 | 26.2% |
| 독립 심사 | 2 | 203,730 | 9,787 | 213,517 | 25.8% |
| 합계 | 8 | 742,720 | 86,332 | 829,052 | 100% |

수정 4회 합계는 **427,606토큰, 51.58%**다. 기록된 cache read는 22,016토큰으로 입력의 2.96%다. 캐시 토큰은 입력에 포함되므로 합계에 다시 더하지 않는다. adapter가 기록한 비용 0은 실제 비용 0의 증거가 아니며, reasoning 토큰은 별도 보존되지 않아 분리 계산할 수 없다. 상위 Codex 작업과 서브에이전트의 사용량은 이 표에 포함하지 않는다.

세 원문 입력 묶음은 총 199,421바이트다. 같은 해시가 8개 호출에 결속되어 있다. 반복 입력량은 계약·코드로 추적할 수 있지만 전체 wire prompt가 보존된 것은 아니므로 원문만의 정확한 토큰 비중으로 환산하지 않는다. 상세 계산은 해당 카나리의 `context-usage-audit.json`에 있다.

## 후속 개선 우선순위

### 1. 형식 오류 때문에 후보 전체를 다시 만들지 않기

현재 pitch 생성은 JSON 계약을 못 맞추면 같은 대화에 전체 후보 JSON을 다시 요구한다. 818·886바이트짜리 수정 지시에도 이전 약 47KB 답변과 원문이 다시 들어가 입력이 각각 13,064·13,039토큰 증가했다.

도메인 스키마·예시를 정확히 제공하고, 실패할 경우 오류가 난 필드만 수정하게 하는 것이 첫 작업이다. 수정은 허용 경로와 변경 전 값에 결속한 patch로 받고 전체 계약을 다시 검증한다. 근거 없는 source anchor나 의미값을 프로그램이 채워 넣는 방식은 피한다. 직전 구현에서 잘못된 `hookProgression` 예시는 이미 수정했으므로 다음 실행에서 형식 재시도 감소 여부를 확인할 수 있다.

이 표본에서 형식 수정 두 번이 없어졌다면 210,270토큰을 쓰지 않았을 것이다. 이는 표본의 사후 계산이며 일반적인 25% 절감 보장은 아니다.

### 2. 사실 수정은 해당 사실과 모든 연관 필드를 함께 보내기

실제 사실 수정은 두 후보 전체와 동일 원문을 다시 받았다. `projectPlan`, 목적·진입 계약, Arc/Rail, spine 설명에 같은 사실이 반복되어 한 군데만 고치면 불일치가 남는다.

원문 사실을 각 출현 필드·문단에 연결하는 인덱스를 만들고, 수정에는 그 사실의 정확한 원문 구간과 **모든 연관 표현**을 보낸다. 무엇을 바꾸라는 것인지 판단할 맥락도 함께 둔다. 원작 사실과 새 작품에서 의도한 변주를 구별한다. 새 상위 스토리 계층이나 새 HIL 단계를 만들 필요는 없다.

최종 독립 심사는 수정된 두 후보 전체, Markdown 기획서, 동일한 원문 묶음을 다시 본다. 작성자의 수정 과정·자기평가는 심사 근거와 분리한다. 원문을 임의 길이로 잘라 넣거나 도덕적 요약으로 바꾸지 않는다.

### 3. 역할에 필요한 지침만 로드하고 캐시는 실측하기

실제 Astra 연결 probe는 소설 입력 없이도 입력 11,291토큰·출력 32토큰·캐시 0을 기록했다. 같은 InkOS 요청을 코드로 재구성한 결과는 922 UTF-8바이트였다. 한편 현재 Astra catalog의 기본 지침 template은 21,269바이트·3,282단어이며 코딩·권한 확인·PR·skills 안내를 포함한다. 짧은 요청에서는 CLI 기본 지침이 큰 고정 비용일 가능성이 높다. 정확한 wire prompt 분해나 지침별 토큰 수를 확보한 것은 아니므로 11,291토큰 전부를 그 template 비용이라고 계산하지 않는다.

지원되는 `debug prompt-input`의 로컬 렌더에도 skills·권한·협업 문맥이 관찰됐다. 그러나 debug에는 실제 exec의 `--ignore-user-config` 등 동일 옵션을 모두 적용할 수 없어 이 결과를 실제 probe와 동일한 입력으로 취급하지 않는다. 창작과 무관한 코딩 지침이 들어가는 것은 확인했지만, 그것이 작품의 권한·접근권 편향을 일으킨 원인인지는 별도 비교가 필요하다.

후속 실험으로 공식 `model_instructions_file` 설정을 이용해 기본 지침을 짧은 InkOS completion 지침으로 교체할 수 있다. 모델명·추론 수준·원문 입력·도구 차단·결과 계약을 유지하고 토큰과 품질을 비교한다. `developer_instructions` 추가는 기본 지침을 없애지 않으므로 대체 수단이 아니다. 이번 전환에서는 기본 지침을 변경하지 않았다. [Codex 공식 설정 schema](https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/config.schema.json)

`bookId=null`인 현재 기획 세션은 Book용 자동 context 압축을 사용하지 않는다. 매 호출마다 system prompt, 배경 원문, 대화 이력을 직렬화한다. 독립 pitch review가 일반 chat 지침으로 돌아가는 부분에는 실제 tool 0인 역할에 불필요한 행동 지침도 포함된다. 전용의 짧은 심사 지침을 쓰는 개선은 가능하다.

고정 역할 지침·계약·동일 원문을 안정된 순서로 배치하고 가변 후보·수정사항을 뒤에 배치하되, 그 자체로 캐시 적중을 보장하지 않는다. 최신 문서는 공유 prefix만으로 재사용이 항상 성립하지 않는 경우와 명시적 cache breakpoint를 설명한다. 현재 Codex CLI 어댑터는 Responses API의 breakpoint 설정을 직접 노출하지 않는다. `--ephemeral`도 캐시가 없다는 증거가 아니다. [OpenAI Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching)

측정 항목은 최초 성공률, 형식·사실 재시도 횟수, 입력·출력·cached input, 소요시간, 최종 독립심사 결함이다. 모델 객체의 5분 보관을 모델 입력 토큰 캐시로 계산하지 않는다. 캐시가 비용·지연을 줄이는 것과 context 안에 들어가는 원문 양을 줄이는 것도 구분한다.

## 다음 비교의 판정 기준

같은 해시의 원문, 같은 기획서 양식, 같은 판단 기준으로 Sol 기록과 Astra 결과를 비교한다. 주인공 자신의 이익·목표 우선, 원작 상업 엔진 보존, 단기·장기 목적의 연결, 구체적 사람·행동으로 드러나는 표면을 품질 기준으로 삼는다. 총 토큰이 줄어도 이 기준이 약해지면 개선으로 채택하지 않는다.

이번 작업의 연결 probe와 계약 회귀는 모델 교체가 실행 가능한지 확인하는 범위다. 전체 작품 카나리를 다시 돌린 결과나 Astra의 문학적 우위를 뜻하지 않는다. 효율 개선 세 항목은 조사·설계 결과이며 별도 구현을 완료했다고 기록하지 않는다.
