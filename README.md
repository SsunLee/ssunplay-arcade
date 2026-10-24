# 쑨플레이 (SSUNPLAY)

설치·로그인 없이 플레이하는 한국어 브라우저 아케이드. Canvas 2D로 그린 입체 장면과 시간 기반 물리 엔진을 사용합니다. 외부 런타임 의존성·API 키가 없습니다.

- 플레이: https://ssunplay-arcade.vercel.app/
- GitHub: https://github.com/SsunLee/ssunplay-arcade
- 의자 컬링: https://ssunplay-arcade.vercel.app/game/curling/
- 드라이브: https://ssunplay-arcade.vercel.app/game/drive/

## 게임

**퇴근길 의자 컬링**: 의자를 위로 스와이프해 동료를 앉히세요. 방향·세기를 계산하며 동료는 4m부터 2m씩 멀어집니다. 첫 라운드 이후 15초 제한. 실패하면 종료, 20명 착석하면 클리어합니다.

**아슬아슬 드라이브**: 차를 아래로 당겼다 놓아 출발하고, 화면을 다시 누르면 브레이크를 밟습니다. 남은 거리와 제동거리로 결과를 계산합니다. 해안·협곡·야간 부두의 3개 스테이지는 거리와 마찰계수가 다릅니다.

마우스·Pointer Events 터치 입력, 스페이스 충전/발사, 화살표 조준, P 일시정지, 버튼/슬라이더 대체 조작을 제공합니다. 모바일 화면 배치는 확인했으며 실제 iOS Safari 기기에서의 터치·오디오·전체화면 실기기 검증은 별도 필요합니다.

## 실행 및 검증

Node.js 22 이상:

```sh
npm run dev
# http://localhost:4173
npm test
npm run check
npm run build
```

빌드 결과는 `dist/`입니다. `/game/curling/`, `/game/drive/`는 별도 정적 index 파일도 생성하므로 직접 접속·새로고침이 가능합니다. Vercel은 `npm run build`, Output Directory `dist`, Framework `Other`를 사용합니다.

## 구성

| 파일 | 역할 |
| --- | --- |
| engine.js | 순수 물리·판정·상태 전이·백업 스키마 |
| scene.js | 직접 작성한 Canvas 장면·캐릭터·오브젝트 |
| app.js | 라우팅·게임 입력·기록·모달·공유 |
| style.css | 데스크톱·모바일 반응형 스타일 |
| engine.test.mjs | 물리·실패 경계·일시정지·최종 클리어 등 15개 테스트 |
| reverse-engineering.md | 원본 조사 근거 및 기능 대응표 |
| verification.md | 실제 검증 결과와 미검증 항목 |

## 기록과 개인정보

localStorage에 최대 500회 기록을 저장하며 개인 최고기록을 보여줍니다. JSON 내보내기/파일 또는 텍스트 가져오기가 가능합니다. 가져오기는 형식·범위를 검증하고 중복을 제거해 기존 데이터와 합칩니다. 저장소 사용이 막히면 현재 탭 메모리에서 동작합니다. 전 세계 랭킹·서버 계정 동기화는 구현 범위에 포함되지 않습니다. 별도 추적기·광고·쿠키 분석 코드는 없습니다.

## 레퍼런스와 분석 범위

https://hedorobomb.com/ko/ 의 목록 구조와 두 게임의 조작 규칙에서 영감을 받았습니다. 원본의 코드·그래픽·서버 API를 사용하지 않은 별도 구현이며 원본과 제휴한 서비스가 아닙니다. 원본의 정확한 수치와 서버 내부 동작을 복원했다고 주장하지 않습니다.

https://github.com/morluto/rea 의 브라우저 관측 문서를 검토했습니다. REA 패키지는 현 환경에서 실행하지 못했으므로 결과를 REA 실행 산출물로 표시하지 않습니다. 실제 분석은 공개 DOM/인라인 스크립트와 브라우저 동작 관측으로 수행했습니다. 자세한 제한은 조사 문서를 확인해주세요.
