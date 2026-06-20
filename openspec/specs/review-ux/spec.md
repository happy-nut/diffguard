# review-ux Specification

## Purpose
TBD - created by archiving change review-ux-fixes. Update Purpose after archive.
## Requirements
### Requirement: 코멘트 컴포저 자동 포커스
단축키로 코멘트 컴포저를 열면 컴포저 안의 텍스트 입력란에 즉시 포커스가 가야 한다(SHALL).

#### Scenario: 컴포저를 열면 입력란에 포커스
- **WHEN** 사용자가 `?` 또는 `>`로 코멘트 컴포저를 열 때
- **THEN** 컴포저의 textarea에 즉시 포커스가 가서 바로 타이핑할 수 있다

### Requirement: diff 기본 포커스는 수정본(오른쪽) 패널
diff 뷰가 열리면 커서 포커스는 오른쪽(new, 수정본) 패널로 가야 한다(SHALL). `Shift+Tab`은 왼쪽/오른쪽 diff 패널 사이로 커서를 이동해야 한다(SHALL).

#### Scenario: diff 열림 시 오른쪽 포커스
- **WHEN** diff 뷰가 열릴 때
- **THEN** 커서 포커스가 오른쪽(수정본) 패널에 놓인다

#### Scenario: Shift+Tab으로 좌우 패널 이동
- **WHEN** diff 뷰에서 사용자가 `Shift+Tab`을 누를 때
- **THEN** 커서가 현재 패널에서 반대쪽 diff 패널(오른쪽↔왼쪽)로 이동한다

### Requirement: Viewed 마킹 UI 정리와 단축키
Viewed 토글은 클릭 지점에 텍스트 캐럿을 만들어서는 안 되며(MUST NOT), 좌측 패널의 viewed 체크박스는 상태 뱃지(예: MODIFIED)와 겹쳐 그려져서는 안 된다(MUST NOT). 사용자는 `Shift+<` 단축키로 현재 파일의 viewed 상태를 토글할 수 있어야 한다(SHALL).

#### Scenario: 토글 시 캐럿이 생기지 않음
- **WHEN** 사용자가 viewed 체크를 토글할 때
- **THEN** 그 위치에 텍스트 캐럿이 나타나지 않는다

#### Scenario: 체크박스가 상태 뱃지와 겹치지 않음
- **WHEN** 좌측 패널에서 한 파일의 상태 뱃지(예: MODIFIED)와 viewed 체크박스가 함께 표시될 때
- **THEN** 둘이 겹치지 않고 구분되어 그려진다

#### Scenario: Shift+< 로 viewed 토글
- **WHEN** 파일이 열린 상태에서 사용자가 `Shift+<`를 누를 때
- **THEN** 현재 파일의 viewed 상태가 토글된다

### Requirement: Cmd+1 트리 포커스는 현재 열린 파일
`Cmd+1`로 디렉토리 트리 뷰로 전환하면 포커스는 현재 열려 있는 파일의 행으로 가야 한다(SHALL) — 트리 맨 위 행이 아니라.

#### Scenario: 현재 파일 행에 포커스
- **WHEN** 어떤 파일이 열린 상태에서 사용자가 `Cmd+1`을 누를 때
- **THEN** 트리 포커스가 그 열린 파일의 행에 놓인다(맨 위 행이 아님)

### Requirement: 드래그 선택 유지 + 코멘트 박스는 선택 아래
드래그(텍스트 선택) 후 코멘트를 열면, 선택한 줄은 계속 강조되어 보여야 하고(SHALL) 코멘트 박스는 선택의 마지막 줄 아래에 떠야 한다(SHALL). 선택 하이라이트가 컴포저나 코멘트 카드로 번져서는 안 된다(MUST NOT).

#### Scenario: 드래그한 줄이 강조된 채로 박스가 아래에 뜬다
- **WHEN** 사용자가 diff(또는 소스)에서 여러 줄을 드래그 선택한 뒤 `?` 또는 `>`로 코멘트를 열 때
- **THEN** 드래그한 줄들이 강조 표시로 유지되고, 코멘트 박스는 그 선택의 마지막 줄 바로 아래에 나타나며, 선택한 코드는 코멘트에 캡처된다

#### Scenario: 선택 하이라이트가 박스로 번지지 않는다
- **WHEN** 코멘트 박스가 선택 아래에 표시될 때
- **THEN** 네이티브 선택은 해제되어 컴포저/카드 영역에는 선택 하이라이트가 번지지 않는다

### Requirement: 사이드바 파일별 코멘트 뱃지
좌측 사이드바의 각 파일 행은 그 파일의 질문/수정요청 개수를 파일별 뱃지로 표시해야 한다(SHALL). 뱃지는 작게, 이모지 없이 표시해야 한다(MUST).

#### Scenario: 파일별 개수 뱃지
- **WHEN** 한 파일에 질문 또는 수정요청 코멘트가 있을 때
- **THEN** 사이드바의 그 파일 행에 종류별 개수가 작은 뱃지로(이모지 없이) 표시된다

#### Scenario: 코멘트 없는 파일엔 뱃지 없음
- **WHEN** 한 파일에 코멘트가 하나도 없을 때
- **THEN** 그 파일 행에는 코멘트 뱃지가 표시되지 않는다

### Requirement: 질문/수정요청 합본 텍스트 뷰
`Cmd+Shift+?`는 모든 질문 코멘트를, `Cmd+Shift+>`는 모든 수정요청 코멘트를 하나의 텍스트 뷰에 모아 전체 복사할 수 있게 표시해야 한다(SHALL). 질문과 수정요청은 분리되어 따로 제공되어야 한다(SHALL).

#### Scenario: 질문 합본
- **WHEN** 사용자가 `Cmd+Shift+?`를 누를 때
- **THEN** 모든 질문 코멘트가 (수정요청은 제외하고) 한 텍스트 뷰에 모여 전체 선택·복사할 수 있다

#### Scenario: 수정요청 합본
- **WHEN** 사용자가 `Cmd+Shift+>`를 누를 때
- **THEN** 모든 수정요청 코멘트가 (질문은 제외하고) 한 텍스트 뷰에 모여 전체 선택·복사할 수 있다

