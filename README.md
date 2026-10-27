# 쑨플레이 3D

의자 컬링 · 치킨 드라이브 · 맥주 잘 따르기. Three.js 기반 브라우저 게임 3종입니다.

https://ssunplay-arcade.vercel.app/

## 실행 및 검사

Node.js 24에서 npm install, npm run build, npm run dev. 개발 서버는 http://localhost:4173 입니다.

npm test: 엔진 검사 23개와 원본 자동차 수치 50개 차등 검사를 실행합니다. npm run check: 문법 검사. npx playwright install chromium 후 서버를 켜고 npm run test:browser: 데스크톱·모바일 조작 검사를 실행합니다. npm run build 후 npm run test:overflow는 자체 로컬 서버와 headless 브라우저로 맥주 넘침·조작부·감점을 검사합니다. BASE_URL을 지정하면 해당 배포를 검사합니다.

## 게임과 조작

- /game/curling/ : 비틀거리는 동료에게 의자를 스와이프해서 보내세요. 대기 중에도 무작위로 무릎이 꺾이고 넘어집니다. Space를 누른 시간으로 발사, ←/→로 위치 조절.
- /game/drive/ : 화면을 아래로 당겼다 놓아 출발합니다. 힘 퍼센트·막대는 표시하지 않습니다. 출발 후 브레이크가 없습니다. 차종·노면·구배가 다른 스테이지 5개입니다.
- /game/beer/ : 누르는 동안 따르고 놓으면 멈춥니다. 좌우로 잔을 기울여 거품을 조절합니다. 세 손님의 주문을 완성하세요. Space 따르기, ←/→ 기울기, Enter 제출.

맥주 넘침 감점은 5mL당 1점으로 계속 누적됩니다. 감점 상한은 없고 최종 점수는 최소 0점입니다. 잔에 붙어 흐르는 거품과 맥주, 떨어지는 방울, 젖은 자국과 파문을 표시합니다.

## 코드

engine.js는 독립적인 물리·게임 상태, models.js는 3D 메시, stage.js는 사무실·도로·카메라, beer.js는 맥주·거품·바 장면, app.js는 입력·화면·개인 기록, build.mjs는 dist 빌드를 담당합니다.

[2.2.0 디자인·검증](verification-v22.md) · [2.1.0 변경·검증](verification-v21.md) · [원본 분석](reverse-engineering.md) · [실제 REA 실행 메타데이터](rea-evidence.json)

원본 게임 구조 분석 참고: https://hedorobomb.com/ko/ . 모델과 화면은 새로 제작했고 원본 번들을 배포물에 포함하지 않습니다. 맥주 게임은 별도로 창작했습니다. 원본 제작자와 제휴한 사이트가 아닙니다.

기록·이름·소리 설정은 이 브라우저에 저장됩니다. 내보내기/가져오기로 옮길 수 있습니다. 기존 2.0.0 기록과 파일을 계속 지원합니다. 글로벌 랭킹·로그인·원본 서버 동기화는 미구현입니다.
