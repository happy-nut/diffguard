## Why

monacori 리뷰 UI를 실제로 쓰며 발견한, 리뷰 흐름을 끊는 거슬림과 빠진 동작들을 한 번에 정리한다. 코멘트 단축키를 눌러도 입력란에 포커스가 안 가고, diff를 열면 수정본(오른쪽)이 아닌 곳에 포커스가 가며, viewed 체크 UI가 깨지고(캐럿 생김·뱃지와 겹침), `Cmd+1` 트리 전환 시 현재 파일이 아니라 맨 위로 점프하고, 드래그 후 코멘트를 열면 선택 하이라이트가 컴포저까지 남는다. 또 사이드바 코멘트 뱃지는 파일별이 아니라 전역이고 이모지가 들어가 있다.

## What Changes

- **코멘트**: 단축키로 컴포저를 열면 입력란에 즉시 포커스; 드래그 후 코멘트를 열 때 컴포저/카드에 남는 선택 하이라이트 제거; 좌측 사이드바에 **파일별** 질문/수정요청 뱃지(작게, 이모지 없이); `Cmd+Shift+?` / `Cmd+Shift+>`로 질문/수정요청을 각각 한 텍스트 뷰에 모아 전체 복사.
- **커서 포커스**: diff를 열면 오른쪽(수정본) 패널로 포커스; `Shift+Tab`으로 왼쪽/오른쪽 diff 패널 간 커서 이동.
- **Viewed 마킹**: 체크 지점에 캐럿이 생기는 문제와 좌측 패널에서 체크박스가 MODIFIED 뱃지와 겹치는 문제 수정; `Shift+<` 단축키 추가.
- **트리**: `Cmd+1`로 트리 뷰 전환 시 현재 열린 파일 행에 포커스.

## Capabilities

### New Capabilities
- `review-ux`: monacori 리뷰 화면의 코멘트·커서 포커스·viewed 마킹·트리 포커스 관련 UX 수정 및 개선 묶음.

### Modified Capabilities
<!-- 없음 — 해당 동작들은 OpenSpec 메인 spec으로 정의된 적이 없어 ADDED로 작성한다(일부는 코드에 이미 구현되어 있어 이 change가 그 수정·정교화를 다룬다). -->

## Impact

- `src/cli.ts` — 임베드 뷰어(`diffScript()` / `diffCss()`): 컴포저 포커스·선택 클리어, 사이드바 파일별 뱃지(전역 `renderCommentBadges` 재설계), diff 기본 포커스·`Shift+Tab` 좌우 이동, `Cmd+1` 트리 포커스(`focusTree`), viewed 토글(`source-viewed-toggle`)의 캐럿·겹침 CSS 수정 + `Shift+<` 단축키, 합본 뷰(`openMergedView`) 동작 확인.
- 새 의존성 없음. Electron 뷰어에 한정.
- **겹침/관계**: "diff 우측 포커스 + `Shift+Tab` 좌우" 항목은 기존 `side-diff-cursor-nav` change의 `Shift+Tab`(사이드바↔본문) 결정을 **대체**한다 — 적용 시 둘을 합치거나 이 change가 소유하도록 정리해야 한다. 코멘트 관련 항목들은 이미 구현된 코멘트 기능의 수정·정교화다.
