## 1. 선언 인덱스 빌더

- [x] 1.1 *이름 추출형* 선언 패턴 — 키워드 직후 이름이 오는 선언(function / class·interface·object·enum·trait·struct / type·enum / const·let·var·val / fun·def·fn·func)을 capture-group regex로 추출. 워커는 격리 컨텍스트라 스캔 폴백용 per-name `definitionMatchers`와 코드를 공유하지 않고 패턴을 따로 둔다. 메서드(`void foo(...)`처럼 반환타입 선행·무키워드)는 추출 신뢰도가 낮아 인덱스에서 제외 → 스캔 폴백이 담당.
- [x] 1.2 전 임베드 소스 파일 1회 스캔 → `Map<name, [{path, lineIndex, column}]>` 빌드(현재 파일 우선 조회는 `findSymbolDefinition`에서 처리)
- [x] 1.3 로드 직후 `setTimeout(…, 0)`로 부트스트랩 → **Web Worker(Blob, `Function.toString`)** 에서 빌드 — 메인 스레드 인덱싱 0, 완료 시 `symbolIndex` 세팅. 워커 미지원 시 null 유지(폴백)

## 2. 조회 & 네비게이션

- [x] 2.1 `findSymbolDefinition`을 인덱스 우선(현재 파일 우선) + 인덱스 미스/미완성 시 기존 전수 스캔 폴백으로 변경
- [x] 2.2 `Cmd/Ctrl+B` keydown 추가 → 소스 뷰에서 `goToSymbolUnderCursor`(기존 `Cmd/Ctrl+Down` 유지)
- [x] 2.3 입력 포커스(`input`/`textarea`/`select`) 시 억제 — 기존 캐럿 키 가드와 일관
- [x] 2.4 diff 뷰 `Cmd/Ctrl+B`: diff 캐럿(`diffCursor`)의 단어 추출(`wordAtDiffCaret`) → `findSymbolDefinition` → `openSourceAt`(소스 뷰로 전환). 기존 diff `Cmd/Ctrl+Down`(`openDiffFileAtCaret`)은 유지

## 3. 검증

- [x] 3.1 `npm run build` + 임베드 `<script>` `node --check`(String.raw 백틱 0 확인 — 워커 코드 포함) + 워커 소스 standalone `node --check`
- [x] 3.2 jsdom(`symbol-nav.js`, 11 PASS): 스캔 경로로 함수 선언 조회 + `Cmd+B`/`Cmd+Down` 선언 줄 이동 + diff→소스 전환 + 입력 포커스 억제. 워커 패턴 추출은 Node에서 별도 검증(TS/Kotlin/Python/Rust 12개 선언). 인덱스-hit 경로는 jsdom에서 Worker 미실행이라 `mo` 스모크로 확인.
- [ ] 3.3 `mo` 스모크: 파일 많은 repo(예: `zoobox`)에서 즉각 점프 + 로드 시 블록 없음 (수동)
