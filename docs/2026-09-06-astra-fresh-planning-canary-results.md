# Astra 신규 기획 카나리 결과

2026-09-06 KST 완료 · 실행 식별자는 시작일인 20260905 유지

**신규 두 기획과 새 세션 비교 심사, 로컬 Storyyard 패킷 검증을 완료했다. 감독 추천은 p01이다.** 두 후보 모두 자기 이익·목적·원작의 투자/인재/소유 엔진은 유지했다. 다만 p02의 최초 타입 오류를 한 필드만 복구했고, 본문에 자기점수가 노출되는 심사 결함도 확인했다. 자동 공정의 무수정 통과 또는 완전한 블라인드 평가로 보고하지 않는다.

먼저 읽을 문서: [두 안 비교와 추천](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/comparison.md) · [p01 전체 기획서](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/p01-plan.md) · [p02 전체 기획서](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/p02-plan.md)

## 실행과 결과

| 항목 | 확인 결과 |
| --- | --- |
| 작성·심사 | gpt-6-astra / high, 실제 CLI 3회, 요청 도구 0개 |
| 출발 자료 | 같은 원문 발췌·복원 문서·reference pack 3개, 총 199,421바이트 |
| 새 생성 | p01·p02 각 새 세션. 과거 후보/심사 입력 없음. p02에는 이번 p01의 제목·한 줄 약속만 전달 |
| 원문 범위 | 제공 원문 1~10화·52~53화. 장기는 이전 751화/131 NarrativeArc 분석 요약 |
| 기획서 | 9절과 육하원칙·단기/장기 목적, 도입 4화·장기 묶음 8개씩 |
| 최초 native 생성 | p01 규격 통과, p02 관계 필드 타입 오류. 명령 exit 1, v1 slate 미저장 |
| 복구 | p02 관계 필드 한 곳만 기존 문자열로 객체화. 별도 v2 저장, 모델 호출 0회, 두 기획서 본문 불변 |
| 새 세션 심사 | p01 SURVIVE 92, p02 HOLD 92. 사람 선택 pending |
| 감독 판단 | p01 추천. p02는 투자 지시 순서 수정 및 재원 요약 명료화 대상. 재기획·전체 재생성 불필요 |
| Storyyard | HIL v3/spineRetention v2 양쪽 계약 통과. 로컬 export만 수행 |

복구는 `/spineRetention/relationshipConversion`의 문자열을 `transformedExpression`에 그대로 옮기고, 이미 작성된 `sourceReconstruction.priorityRule`을 `sourceFunction`으로 복사했다. 다른 필드는 변경하지 않았다. p02의 원문 순서 문제를 이 형식 복구에서 몰래 수정하지 않았다. [원안 대조](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/generation-readback.json) · [복구 영수증](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/format-recovery-receipt.json)

## 내용 판단

p01은 서도윤이 자기 자금으로 공격적인 투자를 선택하고 가온인베스트에 수익·인재를 쌓으며, 사장 직함에 더해 실제 지분을 요구한다. p02의 유진혁/로웰투자도 같은 중심을 지키되 호텔 면담과 제안 순서를 국소 변주했다. 원작의 실제 가족·그룹 보호 동기를 지우거나, 새 우정·인정 욕망을 발명하지 않았다. 영입의 성취도 직원 행정 불편 해소가 아니라 주인공의 경영자·수익 확보로 읽힌다.

p02의 `hookProgression[2].transformedHook`에는 초기 25명 확보 뒤 하락 투자를 지시하는 순서가 들어갔다. 원문7화 L1447의 조건부 지시는 L1543~1563 채용보다 앞서고, L1578~1579에 실제 실행이 보고된다. 이 연결 문장은 국소 수정 대상이다. 25명 뒤 실제 거래 실행은 맞으므로 감점하지 않았다.

native 심사는 별도로 `rewards[2].targetReward`의 ‘양방향 수익…그 돈으로 초기 인력과 추가 핵심 인재’를 보류 이유로 들었다. 이는 두 재원과 두 채용 단계를 묶어 생긴 독해 위험이다. 같은 객체의 sourceReward와 다른 필드에는 올바른 순서가 있으므로 원작을 이해하지 못했다는 확정 증거로 보지는 않는다. 감독은 문장 명료화 권고와 확인된 지시 순서 오류를 분리했다. [p01 독립 원문 검수](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/p01-independent-audit.md) · [p02 독립 원문 검수](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/p02-independent-audit.md)

기획 본문에는 운영·검수·승격 설명이 과다하게 반복된다. 작품의 행동과 이익을 읽다가 내부 운영 용어로 돌아오게 되는 문제이며, 9절 구성 자체의 실패와는 다르다. 양쪽 기획서 문장을 보존해 현재 품질을 직접 판단할 수 있게 했다.

## 공정 발견 사항과 후속 우선순위

1. **생성 지시와 타입 규격 일치.** p02 실제 user 지시에는 `sourceFunction`/`transformedExpression`가 없고 관계 필드 null 예시만 있다. 다른 위치의 같은 이름은 문자열/null을 사용한다. 기존 객체/null 규격을 명시하는 작은 수정이 필요하다. 불완전한 타입 안내는 이번 오류의 원인 후보이며 유일한 원인으로 단정하지 않는다. [근거](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/format-guidance-audit.json)
2. **자기평가를 기획 본문에서 분리하고 심사 입력 검증.** 최상위 commercialScore/decision만 제거해도 기획서의 92점·93점이 실제 심사 메시지에 남았다. 심사 모델은 무시했다고 설명했으나 블라인드 보장을 대신할 수 없다. 원본 심사 Markdown의 고정 ‘입력 제외’ 문구도 실제 노출 여부와 연동해야 한다. 작품·원작 근거·9절을 통째로 줄이는 대신 작성자 메타데이터만 분리하고 보존 범위를 증명하는 수정이 적절하다. [코드 재현](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/review-blindness-audit.md) · [실제 요청 대조](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/review-input-readback.md)
3. **기획 본문 편집.** 인물·목적·행동·이득을 본문 중심에 두고, 반복 운영 설명은 근거/상태 메모에 모은다. 실현/예상·약정/완료처럼 사건 이해에 필요한 구분과 출처는 남긴다.
4. **선택안의 국소 정리.** p02를 택하면 위 지시 순서와 재원 문장을 정리하고, ‘다른 시계 외장’의 관찰 가능한 특징을 정한다. p01의 제품 브랜드명 변경은 사용자 외장 변주 의도 안에서 수용 가능한 것으로 감독이 판단했다. 기존 복원 문서 L65의 회사 설립 압축도 향후 Reference Lab 소유 문서에서 명료화할 수 있다.
5. **사람 선택 이후 작품 연결.** 실제 작품 설정·A/B레일 연결과 도입 원고 검증은 다음 작업이다. 기존 Storyyard 계약이나 용어를 새로 바꾸는 작업은 필요하지 않다.

위 사항 중 이번에 실행한 복구는 p02 타입 한 필드뿐이다. 일반 생성/심사 코드 수정이나 새 기획서 편집, 사실 수정 재심사는 실행하지 않았다.

## 실제 호출 사용량

| 호출 | 입력 | 출력 | 총 토큰 | 입력 중 캐시 | 경과 |
| --- | ---: | ---: | ---: | ---: | --- |
| p01 생성 | 74,183 | 19,389 | 93,572 | 0 | 15분 43초 |
| p02 생성 | 74,242 | 20,011 | 94,253 | 0 | 16분 05초 |
| 새 세션 심사 | 109,217 | 6,404 | 115,621 | 109,056 | 5분 16초 |
| 합계 | 257,642 | 45,804 | **303,446** | 109,056 | 호출 합산 약 37분 05초 |

첫 생성 시작 2026-09-05 23:53:36 KST부터 심사 완료 2026-09-06 00:33:34 KST까지 약 40분이다. 캐시 입력과 추론 출력 3,272는 각각 입력/출력의 부분집합이며 총량에 다시 더하지 않았다. raw invocation journal만 합산했고 기존 세션 Usage와 더하지 않았다. 형식 복구·원문 대조·로컬 export의 추가 모델 호출은 0회다. 이 수치는 이 세 호출의 관측치이며 금액 청구서나 Sol 대비 절감률은 아니다.

## 보존과 검증

두 기획서 본문은 최초 응답→로컬 Markdown→복구 v2→실제 심사 입력→Storyyard 패킷까지 바이트가 같다. p01 23,604바이트, p02 24,367바이트다. Core와 Storyyard 계약, 해시 결속, 9절 전체, 사람 선택 대기, 실제 작품/실행 레일 비생성을 확인했다. [패킷 검증](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/packet-verification.json)

이전 카나리·원문·현재 InkOS 설정 등 보호 파일 66개와 실행 코드/스킬 10개의 SHA가 유지됐다. 5개 Git root HEAD는 그대로다. 기존 dirty 작업을 reset/stash/commit하지 않았다. 최종 상태 검증은 아래 영수증에 기록한다. [최종 실행 검증](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1/run-verification-final.json)

로컬 산출물은 `/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-astra-fresh-20260905-v1`에 있다. 실제 Storyyard 배포나 인덱스 import, 원고 생성, 커밋·푸시는 수행하지 않았다. 선택 기록은 pending이다. 이 결과로 Astra 자체의 일반적 품질 우위를 입증하지는 못한다. 원작 입력과 생성 지시를 함께 정리한 현재 설정에서 목표한 중심이 나왔다는 관측이다.

