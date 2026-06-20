## 1. 코멘트 컴포저 포커스 & 드래그 잔상

- [x] 1.1 컴포저 삽입 직후 `requestAnimationFrame`에서 `.mc-composer .mc-input` focus + 커서를 끝으로(diff `contenteditable`의 포커스 가로채기 방지) — 동기 focus + rAF 재focus 이중 적용
- [x] 1.2 드래그 선택 유지: 선택 줄을 `.mc-sel-line`로 강조 유지(`applyCommentSelectionHighlight`), 코멘트를 선택의 **마지막 줄**에 앵커해 박스가 선택 아래에 뜨게 함; 네이티브 선택은 `removeAllRanges`로 해제해 컴포저/카드로 번지지 않게

## 2. diff 기본 포커스(오른쪽) & Shift+Tab 좌우

- [x] 2.1 diff가 열릴 때 캐럿/포커스를 오른쪽(new) 패널로 설정 — `ensureDiffCursor`가 `side='new'`로 설정(side-diff-cursor-nav에서 이미 구현, 검증 완료)
- [x] 2.2 diff 뷰 포커스 시 `Shift+Tab`을 `diffCursor.side` 토글(오른쪽↔왼쪽)로 바인딩 — diff 한정, `Tab`은 사이드바↔본문 유지
- [x] 2.3 `side-diff-cursor-nav`와의 `Shift+Tab` 의미 reconcile — 이 change가 좌우 토글을 소유; 일반 화살표는 패널 안, `Cmd/Ctrl+화살표`도 명시적 건넘으로 공존(충돌 없음)

## 3. Viewed 마킹 정리 & 단축키

- [x] 3.1 viewed 토글 요소를 `caret-color: transparent` + `user-select: none`으로 두어 캐럿/텍스트 선택 발생 제거
- [x] 3.2 사이드바 상태 뱃지와 viewed 표시 겹침 — 현재 viewed는 `.status::after`의 `✓` 접미사이고 새 코멘트 뱃지는 별도 그리드 열이라 겹치지 않음(확인 완료)
- [x] 3.3 `Shift+<`(`<`) keydown 추가 → 현재 파일(소스 openPath, 없으면 활성 diff 파일) viewed 토글, 입력 포커스 시 억제

## 4. Cmd+1 트리 포커스 = 현재 파일

- [x] 4.1 `Cmd+1`/`Cmd+0` 핸들러에서 `focusOpenFileInTree()` — 현재 열린 파일(소스 openPath 또는 활성 diff 파일)의 `treeRows()` 인덱스로 `focusTree(idx)`; 못 찾으면 0 폴백

## 5. 사이드바 파일별 코멘트 뱃지

- [x] 5.1 전역 상단 뱃지(`#mc-badges` host + 이모지 `renderCommentBadges`) 제거
- [x] 5.2 Changes(`.change-row`, diffstat 앞)와 Files 트리(`.source-link`, 파일명 뒤) **양쪽**에 파일별 질문/수정요청 개수를 색 알약 뱃지(이모지 없이, `.mc-fb-q`/`.mc-fb-c` 서로 다른 색 + 숫자)로 주입
- [x] 5.3 코멘트 추가/삭제 시 파일별 뱃지 갱신 — `refreshComments`가 매번 재주입(기존 뱃지 제거 후)

## 6. 합본 텍스트 뷰 확인

- [x] 6.1 `Cmd+Shift+?`(=`Cmd+Shift+/`) → 질문 합본 / `Cmd+Shift+>`(=`Cmd+Shift+.`) → 수정요청 합본 — **물리 키 `event.code`(Slash/Period)** 로 잡아 macOS에서도 포커스 무관하게 확실히 발동; `buildMergedText`가 종류별 전체를 모달에 모아 "Copy all"/Cmd+A·C로 전체 복사. app-main에 표준 Edit 메뉴 role 복원해 Cmd+C/A 활성화

## 7. 검증

- [x] 7.1 `npm run build` 후 임베드 `<script>` 추출 → `node --check`(SYNTAX_OK)
- [x] 7.2 jsdom 하네스 확장: 컴포저 포커스; 드래그 후 선택 해제; Shift+Tab 좌우; `Cmd+1` 현재 파일 행 포커스; 파일별 뱃지(이모지 없음); 합본 뷰 분리 — review-ux.js 13/13 + comment 회귀 21/21 + diff-caret 16 + 기타 무회귀
- [ ] 7.3 `mo` 시각 스모크: viewed 캐럿/겹침 해소 + `Shift+<`, 사이드바 뱃지 모양, 드래그 잔상 없음, 기존 이동/선택/코멘트 무회귀 (실제 Electron 앱 필요 — 미수행)
