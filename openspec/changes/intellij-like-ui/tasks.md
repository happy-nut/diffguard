<!-- 적용 현황 (2026-06-20): 사용자가 "공백 무시"만 선택 → 섹션 3만 구현. 카운터(4)는 이미 구현돼 있어 체크,
     접기(2)·단어강조(5)·옵션 골격(1)은 ROI/우선순위상 보류. 자세한 근거는 openspec/project.md. -->

## 1. 옵션 상태 · 단축키 · 영속화 골격 (보류)

- [ ] 1.1 리뷰 옵션 상태 객체(공백 무시 / 접기 / 단어 강조) + `location.pathname` 키 localStorage 로드·저장
- [ ] 1.2 기존 상태 표시줄에 현재 옵션 인디케이터 표시(툴바 없음); 토글 시 짧은 피드백
- [ ] 1.3 옵션 토글용 단축키 핸들러 골격(기존 키와 충돌 없게) + document keydown 라우팅 연결, 입력 포커스 시 억제

## 2. 미변경 영역 접기 🔑 (보류 — -U12라 git이 이미 먼 컨텍스트 생략, ROI 대비 구현 복잡)

- [ ] 2.1 렌더된 diff에서 임계값보다 긴 미변경 행 구간을 감지해 접고, 펼침 가능한 "… N unchanged lines …" 행 삽입
- [ ] 2.2 변경된 줄 + 주변 컨텍스트는 항상 보이게 유지
- [ ] 2.3 클릭 시 펼침; 이동(`F7`/`[`/`]`)이 접힌 영역 안의 줄을 가리키면 자동 펼침
- [ ] 2.4 접기 토글 단축키를 localStorage 옵션에 연결

## 3. 공백 무시 (재diff) 💪 — 구현 완료

- [x] 3.1 `buildDiffReview`/`readUnifiedDiff`에 `ignoreWhitespace` 추가 → `git diff`에 `--ignore-all-space` 전달
- [x] 3.2 Electron: **Review 메뉴 체크박스 "Ignore whitespace"**(main 프로세스에서 직접 `writeReviewFile` 재생성 + `reloadIgnoringCache`) — IPC/preload 대신 메뉴 방식으로 더 가볍게. 상태 표시줄에 "ws ignored" 인디케이터 서버 렌더
- [x] 3.3 단축키 `Cmd/Ctrl+Shift+W`(메뉴 가속기 — macOS Help 가로채기 없는 안전한 경로)
- [x] 3.4 비-Electron 폴백: 정적 `monacori diff --ignore-whitespace` 플래그(`renderDiffReview`→`createDiffReview`/`serveDiffWatch`)

## 4. 차이 단위 이동 & 카운터 (이미 구현됨)

- [x] 4.1 상태 표시줄 "현재 / 전체" 차이 카운터 — `#hunk-counter`가 `setActive`에서 갱신(기존 코드)
- [x] 4.2 현재 차이 강조(`diff-active-row`) + `F7`/`[`/`]`에서 카운터 갱신(기존 코드)

## 5. 단어 단위 강조 토글 (보류 — intra-line 강조는 이미 렌더 중, 토글은 취향)

- [ ] 5.1 diff 컨테이너에 줄 안 `<ins>`/`<del>`/`d2h-change` 강조를 토글하는 CSS 클래스 추가
- [ ] 5.2 단어 강조 단축키 연결 + 영속화

## 6. 검증

- [x] 6.1 `npm run build`(BUILD_EXIT=0) — 공백무시는 diffScript(String.raw) 비접촉이라 백틱 위험 없음, 임베드 `<script>` `node --check` SYNTAX_OK
- [ ] 6.2 jsdom 하네스 확장: 옵션 단축키 토글 · 상태 인디케이터 · localStorage 영속; 접기/단어강조/카운터 (보류 항목 — N/A)
- [x] 6.3 공백 무시 end-to-end(헤드리스): 공백만 바뀐 줄이 사라짐(d2h-del 34→32, beta가 context화) + "ws ignored" 인디케이터 조건부 렌더 확인; comment 23·diff-caret 16·merged-ipc 4 무회귀
- [ ] 6.4 `mo` 시각 스모크: `Cmd+Shift+W`로 공백무시 토글 + 인디케이터 (실제 Electron — app-main 변경이라 Cmd+Q 재시작 필요)
