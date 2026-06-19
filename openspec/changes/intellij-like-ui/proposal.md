## Why

monacori의 diff 리뷰는 동작하지만, IntelliJ diff 뷰어가 주는 리뷰 동작들이 빠져 있다 — 공백 무시, 미변경 영역 접기, 단어 단위 강조, side-by-side ↔ unified 전환, 명확한 차이 단위 이동. monacori는 지금 모든 파일의 전체 컨텍스트를 그대로 렌더하고 이런 옵션이 없다. 이 동작들을 monacori의 키보드 우선 UX에 맞춰 **단축키**로 더하면 리뷰가 빠르고 친숙해지며, 미변경 접기는 렌더 행 수를 줄여 "가볍고 빠르게" 원칙에도 부합한다.

## What Changes

- **공백 무시**: 공백을 무시하고 diff를 다시 계산해, 포맷만 바뀐 줄은 리뷰에서 빠지게 한다.
- **미변경 영역 접기**: 긴 미변경 구간을 펼침 가능한 "… N unchanged lines …" 형태로 접는다.
- **단어 단위 강조 토글**: 줄 안(intra-line) 변경 강조를 켜고 끈다.
- **뷰어 모드 전환**: side-by-side ↔ unified.
- **차이 단위 이동 개선**: 기존 `F7` / `[` / `]` 위에 "현재 / 전체" 차이 카운터 + 현재 차이 강조.
- 각 옵션은 **키보드 단축키로 토글**한다(별도 툴바 위젯 없음). 현재 상태는 기존 상태 표시줄에 간결히 보이고, repo별로 **영속화**(localStorage)한다.

## Capabilities

### New Capabilities
- `intellij-like-diff-ui`: IntelliJ식 diff 리뷰 동작 — 공백 무시, 미변경 접기, 단어 강조, 뷰어 모드 전환, 차이 단위 이동. 키보드로 토글하고 선택값을 영속화한다(별도 툴바 없음).

### Modified Capabilities
<!-- 없음 — openspec/specs/에 요구사항이 바뀌는 기존 capability가 없음. -->

## Impact

- `src/cli.ts` — 임베드 뷰어(`diffScript()` + `diffCss()`): 옵션 토글 단축키(keydown), CSS 클래스 기반 표현 전환(단어 강조·unified), 미변경 접기 DOM 폴딩, 차이 카운터, 상태 표시줄 인디케이터 + localStorage 영속.
- 공백 무시는 diff 재생성이 필요하므로(`git diff -w`) 빌드 경로(`buildDiffReview`)와, Electron 앱의 재생성+리로드 IPC(`app-main.ts`의 watch/refresh 재사용), 정적 `diff`용 CLI 플래그에 영향.
- 새 의존성 없음. 읽기 전용 리뷰 동작은 그대로. `side-diff-cursor-nav`와 독립적이라 조합 가능.
