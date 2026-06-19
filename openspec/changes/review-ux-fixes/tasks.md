## 1. 코멘트 컴포저 포커스 & 드래그 잔상

- [ ] 1.1 컴포저 삽입 직후 `requestAnimationFrame`에서 `.mc-composer .mc-input` focus + 커서를 끝으로(diff `contenteditable`의 포커스 가로채기 방지)
- [ ] 1.2 `openComposer`에서 선택 코드 캡처 후 `window.getSelection().removeAllRanges()`로 페이지 선택 해제(컴포저/카드 선택 잔상 제거)

## 2. diff 기본 포커스(오른쪽) & Shift+Tab 좌우

- [ ] 2.1 diff가 열릴 때 캐럿/포커스를 오른쪽(new) 패널로 설정(`side-diff-cursor-nav`의 `diffCursor`와 통합, 기본 `side='new'`)
- [ ] 2.2 diff 뷰 포커스 시 `Shift+Tab`을 `diffCursor.side` 토글(오른쪽↔왼쪽)로 바인딩 — 기존 `Shift+Tab`(사이드바↔본문)을 diff 한정으로 대체, `Tab`은 유지
- [ ] 2.3 `side-diff-cursor-nav`와의 `Shift+Tab` 의미 reconcile(중복 정의 제거)

## 3. Viewed 마킹 정리 & 단축키

- [ ] 3.1 viewed 토글 요소를 `contenteditable=false` + `caret-color: transparent` + `user-select:none`으로 두어 캐럿/텍스트 선택 발생 제거
- [ ] 3.2 사이드바 `.change-row`에서 상태 뱃지(MODIFIED 등)와 viewed 체크박스가 겹치지 않게 레이아웃(flex/grid) 수정
- [ ] 3.3 `Shift+<`(`<`) keydown 추가 → 현재 파일 viewed 토글(`refreshSourceViewedToggle` 연계), 입력 포커스 시 억제

## 4. Cmd+1 트리 포커스 = 현재 파일

- [ ] 4.1 `Cmd+1` 핸들러에서 `focusTree(0)` 대신 현재 열린 파일(`#source-viewer` `dataset.openPath`/활성 파일)의 `treeRows()` 인덱스를 찾아 `focusTree(idx)`; 못 찾으면 0 폴백

## 5. 사이드바 파일별 코멘트 뱃지

- [ ] 5.1 전역 상단 뱃지(`renderCommentBadges`, 이모지) 제거
- [ ] 5.2 각 파일 행(`.change-row` 등)에 그 파일의 질문/수정요청 개수를 작은 뱃지로(이모지 없이) 주입
- [ ] 5.3 코멘트 추가/삭제 시 파일별 뱃지 갱신

## 6. 합본 텍스트 뷰 확인

- [ ] 6.1 `Cmd+Shift+?` → 질문만 / `Cmd+Shift+>` → 수정요청만 한 텍스트 뷰에 모아 전체 복사되는지 `openMergedView` 동작 검증(필요 시 키 매칭 보강)

## 7. 검증

- [ ] 7.1 `npm run build` 후 임베드 `<script>` 추출 → `node --check`
- [ ] 7.2 jsdom 하네스 확장: 컴포저 포커스; 드래그 후 선택 해제; diff 오른쪽 기본 포커스 + `Shift+Tab` 좌우; `Cmd+1`이 현재 파일 행 포커스; 파일별 뱃지(이모지 없음); 합본 뷰 질문/수정요청 분리
- [ ] 7.3 `mo` 시각 스모크: viewed 캐럿/겹침 해소 + `Shift+<`, 사이드바 뱃지 모양, 드래그 잔상 없음, 기존 이동/선택/코멘트 무회귀
