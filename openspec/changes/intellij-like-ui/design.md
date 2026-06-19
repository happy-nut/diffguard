## Context

diff는 **서버 사이드**에서 생성된다: `buildDiffReview`가 `git diff`(`--context 12`)를 실행하고 diff2html이 side-by-side HTML로 렌더한 뒤 구문 강조를 후처리해 **자기완결** 페이지로 임베드한다. `mo`/`app`은 그 페이지를 `loadFile`(file://)로 띄우고, `diff` 명령은 같은 페이지를 디스크에 쓴다. monacori는 **키보드 우선** UX다 — `F7`/`[`/`]`, `?`/`>`, `Tab`, `Cmd+E`, `Cmd+F`, `Cmd+1`/`0` 등으로 동작하며 별도 툴바 위젯이 없다. 재사용할 기존 요소: hunk 이동(`setActive`, `next`, `diff-active-row` 강조, hunk 카운터), `location.pathname` 키 localStorage 설정(sidebar 너비, http-env), watch 시 재생성 + `reloadIgnoringCache()` + `ipcMain`을 갖춘 `app-main.ts`, 그리고 상단 상태 표시줄(파일/hunk 개수).

## Goals / Non-Goals

**Goals:**
- IntelliJ식 diff 리뷰 동작(공백 무시, 미변경 접기, 단어 강조, 뷰어 모드, 차이 이동)을 **키보드 단축키**로 제공.
- 현재 옵션 상태를 기존 상태 표시줄에 간결히 표시하고 repo별로 영속화.
- 미변경 접기로 렌더 행 수 절감(가벼움 원칙).
- 기존 이동/선택/코멘트 동작 보존; 새 의존성 없음.

**Non-Goals:**
- **별도 diff 툴바 위젯** — 컨트롤은 단축키 + 상태 표시줄 인디케이터로 노출(사용자 요청으로 툴바 개념 제외).
- 변경 포함/제외 체크박스(부분 staging).
- 3-way 머지 / 충돌 해결.
- diff 편집(읽기 전용 유지).

## Decisions

**1. 컨트롤은 툴바가 아니라 키보드 단축키로 노출.**
monacori의 키보드 우선 UX에 맞춰 각 옵션을 단축키 토글로 둔다. 현재 상태는 기존 상단 상태 표시줄에 간결한 인디케이터로 보이고, 토글 시 짧은 피드백을 준다. 별도 툴바 위젯은 만들지 않는다(추가 chrome과 로드 무게 회피). *대안:* 전용 diff 툴바 — 사용자 요청으로 제외.

**2. 비용 기준으로 컨트롤 분리: 클라이언트 토글 vs 재diff 토글.**
- *클라이언트 전용*(즉시, 재diff 없음): 단어 강조, 미변경 접기, 기본 unified 표현 — 이미 렌더된 diff2html 출력 위에 CSS 클래스 + DOM 폴딩, localStorage 영속.
- *재diff 필요*: 공백 무시(및 고fidelity unified)는 `git`/diff2html 출력 자체가 바뀌므로 서버에서 재생성.
근거: 흔한 토글은 즉시 동작시키고, 여러 diff 변형을 임베드해 페이로드가 커지는 것을 피한다(가벼움 원칙).

**3. 공백 무시는 두 벌 임베드가 아니라 재생성으로.**
`buildDiffReview`에 `ignoreWhitespace`를 추가(`git diff`에 `--ignore-all-space`/`-w`). Electron 앱에서는 단축키 토글이 IPC 메시지(예: `monacori:set-options`)를 보내 빌드를 다시 돌리고 `reloadIgnoringCache()` — `app-main.ts`의 watch/refresh 경로 재사용. 정적 `diff` 명령(file://)에서는 라이브 토글 대신 생성 시점 CLI 플래그로 제공. *대안:* 두 diff를 모두 임베드 — 페이로드 비대로 기각.

**4. 미변경 접기는 클라이언트 DOM 폴딩이자 perf 이득.**
컨텍스트 임계값을 넘는 미변경 줄을 숨기고 펼침 가능한 "… N unchanged lines …" 행을 삽입. 변경 줄과 주변 컨텍스트는 항상 보인다. 렌더 행 수를 줄여(`content-visibility`와 시너지) IntelliJ 폴딩과 일치. `F7` 이동이 숨겨진 차이를 가리키면 해당 영역 자동 펼침.

**5. 차이 이동은 기존 hunk 메커니즘 재사용 + 카운터.**
"현재 / 전체" 차이 카운터를 상태 표시줄에 노출하고 `diff-active-row` 강조를 유지하며 `setActive`/`next`에 연결. 새 이동 모델 없음.

**6. 영속화 + 상태 표시.**
`location.pathname` 키 단일 localStorage 객체에 옵션 선택값을 저장/복원(sidebar 너비·http-env 패턴). 현재 상태는 상태 표시줄 인디케이터로 보인다.

## Risks / Trade-offs

- **재diff 토글이 Electron IPC 의존** → 공백 무시/고fidelity unified는 앱에서만 라이브; 정적 `diff`는 생성 시점 CLI 플래그. 클라이언트 토글은 어디서나 제공.
- **단축키 키 충돌** → 기존 키(`F7`/`[`/`]`/`?`/`>`/`Tab`/`Cmd-*`)와 겹치지 않게 배정(Open Questions에서 확정).
- **툴바가 없어 상태 가시성이 낮을 수 있음** → 상태 표시줄 인디케이터 + 토글 시 짧은 피드백으로 보완.
- **접기가 캐럿/코멘트 앵커링과 상호작용** → 접힌 행도 DOM에 남아 `querySelector` 앵커링은 해석됨; 숨겨진 줄로 이동 시 먼저 펼침.
- **unified 표현 fidelity** → CSS-only는 싸지만 불완전; 서버 `line-by-line` 재렌더는 정확하나 재생성 경로 필요. 싼 쪽부터.

## Migration Plan

추가형 뷰어 변경. 클라이언트 토글(단어 강조, 접기, 기본 unified)은 `diffScript()`/`diffCss()`에 들어가고, 공백 무시(및 정확한 unified)는 Electron IPC 재생성 경로 + 정적 `diff` CLI 플래그 폴백. 롤백 = 해당 코드 되돌리면 diff는 지금과 동일하게 렌더.

## Open Questions

- 단축키 키 배정: 기존 키와 겹치지 않는 키 집합은?(공백 무시 / 접기 / 단어 강조 / 뷰어 모드 토글)
- 옵션 상태 표시: 상태 표시줄 인디케이터 vs 토글 시 토스트?
- unified 뷰: CSS-only 표현 vs 서버 `line-by-line` 재렌더?
- 공백 무시를 비-Electron 용으로 `monacori diff`/`check` CLI 플래그로도 제공할지?
