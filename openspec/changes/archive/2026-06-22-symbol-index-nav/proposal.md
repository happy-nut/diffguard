## Why

리뷰 중 코드를 이해하려면 심볼(함수·클래스·변수)의 **선언부로 빠르게 점프**해야 한다 — 테제 필터 "리뷰를 더 빠르게"를 정통으로 통과한다(`openspec/project.md`). 지금도 `Cmd+Down`(`goToSymbolUnderCursor`)이 있지만, `findSymbolDefinition`이 **매 조회마다 모든 소스 파일을 전수 스캔**한다(인덱스 없음, O(files × lines)) → 파일 많은 repo에서 느리고 렌더러를 블록할 수 있다. 또 에디터 관습인 `Cmd+B` 바인딩이 없다.

## What Changes

- **선언 인덱스를 미리 빌드**: 임베드 소스 파일을 1회 스캔해 `심볼 이름 → [{path, line}]` 인덱스를 만든다. 이후 조회는 O(1) → 전수 스캔 제거.
- **`Cmd/Ctrl+B`** 추가(+ 기존 `Cmd/Ctrl+Down` 유지) → 커서 위치 단어의 선언부로 점프.
- 인덱스에 없거나 빌드 전이면 **기존 전수 스캔으로 폴백**(정확도·동작 무회귀).
- 인덱스 빌드는 **메인 스레드를 블록하지 않게**(idle/비동기) — 사용자가 말한 "백그라운드".

## Capabilities

### New Capabilities
- `symbol-index-navigation`: 선언 인덱스 기반으로 커서 위치 심볼의 선언부로 점프(`Cmd/Ctrl+B` / `Cmd/Ctrl+Down`). 인덱스는 UI 블록 없이 빌드되고, 미스 시 전수 스캔으로 폴백한다.

### Modified Capabilities
<!-- 없음 — 기존 go-to-symbol 동작은 openspec/specs에 정의된 적 없음(코드에만 존재). 이 change가 인덱스로 강화. -->

## Impact

- `src/cli.ts`: 일회성 인덱스 빌더(기존 `definitionMatchers` 휴리스틱을 *이름 추출형* capture-group 버전으로 일반화), `findSymbolDefinition`을 인덱스 우선 + 폴백으로, `Cmd/Ctrl+B` keydown 추가.
- 인덱싱 위치는 `design.md` 참고 — 소스가 이미 렌더러 메모리(`sourceByPath`)에 있어 **렌더러 idle 빌드 권장**(별도 프로세스/IPC 불필요). 새 의존성 없음.
