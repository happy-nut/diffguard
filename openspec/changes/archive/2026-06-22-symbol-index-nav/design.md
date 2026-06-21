## Context

기존 경로: `goToSymbolUnderCursor` → `wordAtCursor`(커서 단어) + `findSymbolDefinition(name)`(매번 `definitionMatchers(name)`로 per-name regex를 만들어 전 파일 line 스캔) + `openSourceAt`. 소스는 렌더러 메모리의 `sourceByPath` / `sourceFiles`에 이미 전부 있다(main의 `collectSourceFiles`가 수집해 HTML로 주입). `definitionMatchers`는 JS/TS·Kotlin·Python·Rust 등 다언어 선언 패턴(function/class/interface/const/fun/def …)을 커버한다.

## Goals / Non-Goals

**Goals**: 큰 repo에서도 즉각·블록 없는 go-to-definition; `Cmd/Ctrl+B`; 기존 정확도 무회귀(폴백).

**Non-Goals**: 정밀 파서/LSP/tree-sitter, cross-file 타입 해석, find-references, 다중 정의 disambiguation UI.

## Decisions

1. **"백그라운드 프로세스" → 렌더러 Web Worker(Blob).** 인덱스를 별도 스레드(Web Worker)에서 빌드한다 — 메인 스레드에서 인덱싱을 일절 하지 않으므로 어떤 경우에도 UI가 블록되지 않는다(사용자 요구: "UI는 그 어떤 경우에도 block 되면 안돼"). `Function.prototype.toString()`으로 워커 소스를 만들어(regex 리터럴+단순 문자열, 백틱 0 → diffScript의 String.raw 함정 회피) `Blob`+`URL.createObjectURL`로 기동. 로드 직후 `setTimeout(…, 0)`로 부트스트랩을 미뤄 초기 렌더를 막지 않고, 임베드 소스의 `{path, content}`만 `postMessage`로 넘긴다. **렌더러 idle(요청 폐기됨) 대비 이점**: (a) 청크 사이에도 메인 스레드 작업이 없어 진짜로 안 막힘, (b) Electron 앱과 browser-serve **두 transport 모두**에서 동작(main 프로세스 IPC였다면 browser-serve를 놓침), (c) CSP 부재로 Blob 워커 게이트 없음. 워커 미지원(jsdom 등) 시 `symbolIndex`는 null로 남아 스캔 폴백이 그대로 동작.
2. **인덱스 = `Map<name, [{path, lineIndex, column}]>`.** 전 임베드 파일 1회 스캔, 각 줄에 *이름 추출형* 선언 패턴 적용(기존 `definitionMatchers`를 baked-name 대신 capture-group으로 일반화 — 한 곳에서 두 형태를 만들어 일관 유지).
3. **조회**: name → 후보 배열. 현재 파일 우선 정렬 후 첫 번째. 인덱스 미스/미완성이면 **기존 `findSymbolDefinition` 전수 스캔으로 폴백**.
4. **`Cmd/Ctrl+B` = 보편 go-to-definition(소스 + diff, 범위 내).** 소스 뷰: `goToSymbolUnderCursor`. diff 뷰: diff 캐럿(`diffCursor`)의 단어를 추출 → `findSymbolDefinition` → `openSourceAt`(소스 뷰로 전환해 선언 표시). 기존 `Cmd/Ctrl+Down`은 각 뷰의 현재 동작 유지(소스=go-to-def, diff=`openDiffFileAtCaret` 파일 열기)로 무회귀. 입력 포커스 시 억제.
5. **신선도**: watch로 소스가 바뀌면 페이지가 리로드되며 인덱스도 새로 빌드(자동). 증분 갱신 불필요.

## Risks / Trade-offs

- 휴리스틱이라 거짓양성/음성 가능(기존과 동일 수준) — 폴백이 완화.
- 이름 추출형 패턴이 per-name보다 느슨해 인덱스에 잡음이 낄 수 있음 → 현재 파일 우선 + 폴백으로 완화.
- 매우 큰 repo는 idle 빌드 완료 전 조회가 발생 → 그 사이엔 폴백 스캔으로 동작(정확하지만 느릴 수 있음).

## Migration Plan

추가형. 기존 `Cmd/Ctrl+Down`·`findSymbolDefinition`은 유지(폴백). 데이터/포맷 마이그레이션 없음.

## Open Questions

(사용자 피드백으로 확정)
- **diff 뷰 `Cmd/Ctrl+B` 지원: 예** — Decision 4에 반영(diff 캐럿 단어 → 선언, 소스 뷰로 전환).
- **worker 승격: 채택** — 사용자 지시("워커 승격해")에 따라 렌더러 Web Worker로 구현(Decision 1). '절대 블록 없음'은 별도 스레드가 가장 견고히 충족하고, Electron+browser 두 transport를 모두 커버한다.
- **이름 추출형 + per-name 패턴을 한 소스에서 일괄 생성: 예** — Task 1.1.
