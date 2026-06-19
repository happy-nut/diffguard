## Context

이 항목들은 monacori 임베드 뷰어(`src/cli.ts`의 `diffScript()` / `diffCss()`)의 기존 동작을 고치거나 다듬는다. 관련 기존 코드: 코멘트 기능(`openComposer`, `currentCommentTarget`, `refreshComments`, `renderCommentBadges`, `openMergedView`), diff의 `contenteditable` 컨테이너 + `setupDiffCaret`, hunk/포커스(`treeFocusIndex`, `focusTree`, `setTab`, `Cmd+1` 핸들러), viewed 토글(`source-viewed-toggle`, `refreshSourceViewedToggle`), 사이드바 파일 행(`.change-row` / source tree row). `side-diff-cursor-nav` change가 도입하려는 `diffCursor`(side 포함)와 직접 맞물린다.

## Goals / Non-Goals

**Goals:**
- 리뷰 중 거슬리는 포커스/마킹/선택 문제를 고치고, 빠진 단축키(`Shift+<`, `Shift+Tab` 좌우)를 채운다.
- 사이드바 코멘트 뱃지를 전역→파일별, 작게, 이모지 없이.
- 기존 동작(hunk 이동, 코멘트 저장, 검색) 무회귀; 새 의존성 없음.

**Non-Goals:**
- 코멘트/캐럿 기능의 신규 도입(이미 구현됨 — 여기선 수정·정교화).
- diff 편집(읽기 전용 유지).

## Decisions

**1. 컴포저 포커스 신뢰성.** `refreshComments`가 이미 `.mc-composer .mc-input`을 focus하지만, diff `contenteditable`이 포커스를 가져갈 수 있어 타이밍 이슈가 의심된다. 삽입 직후 `requestAnimationFrame`에서 focus + 커서를 끝으로 두어 확실히 포커스한다.

**2. 드래그 선택 잔상.** `currentCommentTarget`이 선택 텍스트(코드)를 캡처한 뒤, `openComposer`에서 `window.getSelection().removeAllRanges()`로 페이지 선택을 해제한다. 그래야 컴포저/카드 영역에 파란 선택 하이라이트가 남지 않는다(코드는 이미 캡처됨).

**3. diff 기본 포커스 = 오른쪽 + `Shift+Tab` 좌우.** `side-diff-cursor-nav`의 `diffCursor`와 통합한다: diff가 열리면 `side='new'`(오른쪽)로 캐럿/포커스를 둔다. diff 뷰에 포커스가 있을 때 `Shift+Tab`은 `diffCursor.side`를 토글(오른쪽↔왼쪽)한다 — 이는 기존 `Shift+Tab`(사이드바↔본문)을 diff 뷰 한정으로 **대체**한다. (`Tab`은 사이드바↔본문 유지.) *주의:* 적용 시 `side-diff-cursor-nav`와 합치거나 이 change가 `Shift+Tab` 의미를 소유하도록 정리.

**4. Viewed 마킹 버그.** 캐럿 발생은 토글 요소가 `contenteditable` 컨텍스트 안/포커스 가능이기 때문 → 토글을 `contenteditable=false` + `caret-color: transparent`로 두고 클릭이 텍스트 선택을 만들지 않게 한다(버튼/`user-select:none`). 사이드바 겹침은 `.change-row`에서 상태 뱃지와 viewed 체크박스가 같은 위치(absolute/overlap)라서 → flex/grid 레이아웃으로 분리. `Shift+<`(즉 `<`, Shift+`,`) keydown을 추가해 현재 파일 viewed를 토글(`refreshSourceViewedToggle` 연계).

**5. `Cmd+1` 트리 포커스.** 현재 `focusTree(0)`로 맨 위 고정. 현재 열린 파일(`#source-viewer` `dataset.openPath` 또는 활성 파일)의 행을 `treeRows()`에서 찾아 그 인덱스로 `focusTree(idx)`. 못 찾으면 0으로 폴백.

**6. 사이드바 파일별 뱃지.** 전역 상단 뱃지(`renderCommentBadges`, 이모지 사용)를 제거하고, 각 파일 행(`.change-row` 등)에 그 파일의 질문/수정요청 개수를 작은 뱃지로(이모지 없이) 주입한다. 코멘트 추가/삭제 시 갱신. 전역 합본 진입은 단축키(`Cmd+Shift+?`/`>`)로 유지.

**7. 합본 뷰 확인.** `openMergedView`는 이미 `Cmd+?`/`Cmd+>`(= `Cmd+Shift+/` / `Cmd+Shift+.`)로 동작한다. 질문/수정요청 분리 + 전체 복사가 실제로 동작하는지 검증하고, 필요 시 키 매칭만 보강.

## Risks / Trade-offs

- **`Shift+Tab` 의미 변경이 `side-diff-cursor-nav`와 충돌** → 두 change를 적용 시 반드시 reconcile(이 change가 좌우 이동을 소유).
- **`<` 단축키 충돌** → 기존 키와 겹치지 않는지 확인(`[`/`]`/`?`/`>`와 별개).
- **사이드바 뱃지 레이아웃 회귀** → 상태 뱃지/diffstat/파일명 정렬을 깨지 않게 작은 뱃지를 배치.
- **선택 해제가 정상 텍스트 선택 UX를 해치지 않게** → 코멘트 열 때만 해제.

## Migration Plan

추가·수정형 뷰어 변경(`src/cli.ts`). 데이터/포맷 마이그레이션 없음. 각 항목은 독립적이라 부분 적용·롤백 가능.

## Open Questions

- diff 밖에서의 `Shift+Tab`은 사이드바↔본문으로 유지할지(현 계획: 유지, diff 안에서만 좌우)?
- 사이드바 파일별 뱃지의 정확한 표기(예: `Q2 C1` 같은 텍스트 vs 색 점 + 숫자)?
- `Shift+<`가 일부 키보드 레이아웃에서 안정적으로 `<`를 내는지(아니면 다른 키)?
