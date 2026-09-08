# 작품별 주인공 배경·목적 연결 실제 카나리 결과

2026-09-06 · 완료

InkOS가 같은 원문으로 새 기획을 생성하고, 사실 표현 세 곳을 native 부분 교정한 뒤 최종 독립심사를 통과했다. 《회귀한 재벌 3세는 제 몫부터 챙긴다》는 **SURVIVE, 92/100**, 배경 사실·목적과 수단·기획 본문 연결 검사 모두 통과다. 이 점수는 이번 모델의 독립 평가이며 시장 성과 측정치가 아니다.

[Storyyard의 새 기획서](https://storyyard-wjjo.macximin11123.chatgpt.site/review/frp-cc93f2bb015349cd5413aa0e/p01) · 배포 버전 **69**

## 무엇을 확인했나

사람이 이 작품의 배경 정답을 새로 써서 주입하지 않았다. 같은 원문 발췌·복원 자료·reference pack을 주고 새로 반영한 `protagonist-context/v1` 기준으로 생성과 독립심사를 실행했다.

새 기획은 원래 사랑받던 재벌가 독자, 대학 졸업 후 입사한 해의 그룹 몰락, 배신과 이용·빈곤의 전생, 17세로 돌아온 현재의 재산과 조부 후견을 구분한다. 이 배경이 직접 고른 실행자에게 자기 돈을 맡기고 자기 회사·인재·기업 지분을 확보하는 선택으로 이어진다. 기존 가족 보호 동기를 보존하고 새 애정 결핍을 만들지 않는다. 소비 경험·학업과 외국어·미래 사건 기억·인재 판독 능력의 쓰임도 구별된다.

| 최종 검사 | 결과 |
| --- | --- |
| 원작의 배경·경험·현재 상황 | 통과 |
| 개인 목적 → 선택 → 실제 수단 | 통과 |
| 기획서 본문과 도입 사건의 연결 | 통과 |
| 자기이익 및 원작 유지 조건 | 통과 |
| 진입 조건 / 최종 독립 판정 | 통과 / SURVIVE |

## 실제 생성과 수리

- 최초 v1은 배경 3개 검사 통과, 92점이었으나 `신규 21명과 에릭`의 포함 관계가 총 25명과 충돌해 HOLD였다. `돌아온 첫날`도 원문보다 좁은 시간 단정으로 지적되었다.
- 첫 부분 교정은 원합본 anchor 2개와 선언된 출현부 7개를 읽었다. `신규 21명(에릭 포함)`, `돌아온 뒤`로 두 곳만 교정하고 5곳을 보존했다. v2 전체 독립심사를 새 세션으로 실행했다.
- v2는 목적/수단·본문 연결은 통과했지만 원작 복원의 `높은 학업 성적으로 대학을 졸업`을 새로 지적해 HOLD였다. 원문은 대학 입학 성적과 졸업 사실을 각각 확인하므로 졸업 성적을 단정할 수 없다. 최초 별도 감사도 이 수식어를 놓쳤음을 기록했다.
- 두 번째 부분 교정은 정확한 원문 26행과 선언된 출현부 2개로 수식어만 제거했다. **최종 v3 전체 독립심사에서 모든 필수 검사와 SURVIVE를 통과했다.**

두 부분 교정은 InkOS의 `pitch-fact-repair prepare/run/apply`를 사용했다. 작성자나 운영자가 후보 본문·심사 점수를 직접 고치지 않았다. 모델 응답의 지정 바이트 변경을 다시 적용한 전체 후보가 새 slate와 일치하고, v1·v2 및 과거 심사는 SHA 그대로 보존되었음을 검증했다.

최종 심사의 편집 권고는 장기 회차의 잠정 경계를 제6절에서도 더 잘 보이게 표시하는 것이다. 제8절에는 이미 가설임이 명시되어 있어 도입 제작을 막는 실패로 판정하지 않았다. 이 권고를 처리하려고 통과한 기획을 다시 생성하지 않았다.

## 입력과 범위

입력은 이전 카나리와 같은 3개 자료, **199,421바이트**다. 실제 읽은 원문은 **1~10화·52~53화**이며 장기 전개는 기존 파생 분석의 범위를 구분했다. 원합본 전체의 SHA는 사실 교정의 불변 좌표 기준으로 확인했으며, 원작 751화 전체를 이번에 재심사했다고 주장하지 않는다.

발주는 이전 p01의 가까운 변주 범위를 유지하고 두 후보/p02 지시만 제거했다. 기존 p01 출력과 이번 별도 감사의 정답을 새 생성 입력에 추가하지 않았다. 작성·교정·심사 모두 기존 **gpt-6-astra / high, codex-cli** 설정을 사용했다. 모델 설정 변경은 없다.

원래 기획과 설정·참고 자료 **7개**, 실행 코드·빌드 **18개**의 보존을 최종 검증했다.

## 시간과 토큰

| native 모델 단계 | 실행 시간 |
| --- | ---: |
| 새 기획 생성 | 813.0초 |
| 최초 독립심사 | 248.1초 |
| 인원·시점 부분 교정 | 44.5초 |
| 두 번째 독립심사 | 261.1초 |
| 학업 이력 부분 교정 | 17.8초 |
| 최종 독립심사 | 229.2초 |

실제 InkOS 모델 호출 6회의 기록상 합계는 **입력 396,212 / 출력 43,998 / 총 440,210토큰**이다. 기록된 cacheRead는 0다. 이 수치는 이 대화 및 별도 감사 에이전트 사용량을 포함하지 않고, 과금액이나 계정 잔여 한도를 뜻하지 않는다.

부분 교정의 입력 prompt는 각각 43,760바이트와 12,852바이트였다. 같은 전체 reference bundle을 매번 다시 읽는 독립심사가 현재 비용의 큰 부분이다. 이번 결과는 처음 한 번의 심사가 모든 사실 과장을 찾아낸다는 보장을 주지 않는다. 반복되는 사실 서술을 줄이고 최초 진단에서 오류를 더 잘 모으는 개선 여지는 남는다.

## Storyyard와 보존

새 native 검토 패킷을 기존 Storyyard 형식에 그대로 전달했다. 기획서 Markdown과 출발 인물 설명이 원래 InkOS 후보와 정확히 같고, 입력 패킷과 immutable 파일은 바이트 단위로 일치한다. 기존 검토 패킷 15개를 그대로 보존한 16개 index다. 새 UI·계약이나 새 작품 정사를 만들지 않았다.

기존 dirty Storyyard checkout의 다른 파일 26개는 보존했다. 새 자료와 index, 오래된 테스트 기대 문구만 반영했다. 사용자 코멘트와 결정 데이터에 변경 요청을 보내지 않았다. 기존 전체 사이트 공개 범위와 관리자 전용 검토 경로를 유지했다.

- 관련 Storyyard 테스트 **37/37**, skip 0, 최종 빌드 통과.
- 선행 구현 검증 **153/153** 및 Core/CLI 빌드 통과. 이번 실제 실행에서도 해당 코드·빌드 해시 보존을 확인했다.
- Sites source **`3dfaca84c68325019fa7ac3e97295d4cee5bbe63`**를 push한 뒤 같은 소스를 패키징해 저장·배포했다.
- Site **69번 버전**, 배포 성공 및 현재 사이트 버전 재조회 완료.
- live root HTTP 200, 비로그인 새 검토 URL은 로그인 경로로 HTTP 307.
- 브라우저 열기 요청은 기존 작업 탭에 queued 상태로 전달했다. 인증된 화면의 DOM·시각 QA를 새로 수행했다고 주장하지 않는다.
- HQ 및 원본 child GitHub 커밋·push는 수행하지 않았다. 별도 Site 작업 디렉터리의 배포용 커밋만 Sites source에 반영했다.

## 남은 사람 판단

현재 상태는 **기획 HIL 대기**다. 기존 p01을 대체하거나 사람 선택을 기록하지 않았고 Book·A/B레일 정사·원고로 승격하지 않았다. 이번 결과는 배경과 목적 연결이 실제 생성에서 작동하는지 확인하는 카나리다. 원작과 충분히 다른 사건·아이템으로 변주됐다는 최종 판정은 별도의 HIL 대상이다.

다른 장르나 실패·회귀가 없는 주인공에서도 같은 수준으로 작동하는지는 이번 한 작품으로 실증하지 않았다. 장기 잠정 경계 표기와 반복되는 검수 설명의 편집 권고도 후속 검토에 남긴다.

## 재개와 증거

실행 폴더: `/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-protagonist-context-20260906-v1`

최종 slate는 `.inkos/pitch-slates/chaebol-protagonist-context-20260906-v3/slate.json`, 사람용 원문은 `p01-plan-final.md`, 내보낸 자료는 `storyyard-packet.json`이다. 완료된 단계의 독점 생성 영수증을 지우거나 재실행하지 않는다. v1·v2는 수정 이력으로 보존한다.

- [최종 검사·원문/코드 해시·교정 계보·모델 사용량](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-protagonist-context-20260906-v1/verification-final.json)
- [최종 독립심사](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-protagonist-context-20260906-v1/.inkos/pitch-slates/chaebol-protagonist-context-20260906-v3/survival-review/review.json)
- [읽기 전용 별도 원문 감사](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-protagonist-context-20260906-v1/source-audit.md)
- [최종 기획서 Markdown](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/.inkos/source-first-canaries/chaebol-protagonist-context-20260906-v1/p01-plan-final.md)
- [배포와 보존 영수증](/Users/a2501/Desktop/firefly_studio/edge_repos/storyyard/outputs/protagonist-context-20260906/deployment-receipt.json)
- [선행 구현 검증](/Users/a2501/Desktop/firefly_studio/docs/evidence/protagonist-context-20260906/verification.json)

최종 검증 스크립트는 `verify-final.mjs`, 생성·교정·심사 호출 영수증은 실행 폴더, Sites 빌드·테스트·저장·배포 기록은 `site-release/`에 있다. 배포를 다시 할 때는 현재 Site version·source HEAD·deployment 상태를 먼저 읽는다.
