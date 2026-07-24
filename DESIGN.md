# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-24
- Primary product surfaces: 평가 대상자, 평가 가이드, 내 평가 결과, 평가 관리, 관리자 대시보드
- Evidence reviewed: `index.html`, 운영 화면 캡처, 화이트 테마 토큰과 등급 배지 렌더링

## Brand
- Personality: 신뢰할 수 있고 명확한 기업용 인사평가 도구
- Trust signals: 일관된 상태 표현, 높은 가독성, 절제된 애니메이션
- Avoid: 넓은 네온 블러, 밝은 배경 위 파스텔 글자, 기능 상태와 혼동되는 장식

## Product goals
- Goals: 평가 진행과 결과를 빠르게 식별하고 실수 없이 운영
- Non-goals: 장식 효과를 위해 정보 가독성을 희생하지 않음
- Success signals: 작은 표 배지에서도 등급과 상태를 즉시 판독

## Personas and jobs
- Primary personas: 일반 평가자, 피평가자, 관리자, 임원
- User jobs: 평가 수행, 결과 확인, 진행 관리, 점수 조정 및 공개
- Key contexts of use: 사무용 데스크톱 브라우저와 모바일 브라우저

## Information architecture
- Primary navigation: 평가 대상자 목록, 평가 가이드, 내 평가 결과, 평가 관리, 관리자 대시보드
- Core routes/screens: 단일 페이지 내 역할별 탭
- Content hierarchy: 현재 상태와 핵심 행동을 장식보다 우선

## Design principles
- 가독성 우선: 본문과 배지는 화이트 배경에서 충분한 명도 대비를 유지
- 의미 있는 색상: 색은 등급과 상태를 식별하는 데 사용
- 절제된 강조: 애니메이션은 아이콘에 한정하고 텍스트 판독을 방해하지 않음
- Tradeoffs: 화려한 발광 효과보다 운영 화면의 스캔 속도를 우선

## Visual language
- Color: 흰 배경, `#F5F7FA` 표면, 진한 본문색, 틸 브랜드 포인트
- Typography: 기본 본문 15~16px, 보조 정보 최소 13px를 사용하고 사용자 선택형 100%·115%·130% 가독성 모드를 제공
- Spacing/layout rhythm: 일반 화면은 기존 Tailwind 간격 체계를 유지하고 대량 매칭 작업대는 48px 내외 소형 카드와 2~3열 고밀도 격자를 사용
- Shape/radius/elevation: 둥근 카드와 얕은 그림자
- Motion: 회전이나 바운스는 아이콘에만 제한하며 reduced-motion 지원, 박스 선택은 짧은 테두리·배경 피드백만 사용
- Imagery/iconography: Font Awesome과 의미가 명확한 이모지

## Components
- Existing components to reuse: glass-card, 관계별 그룹, 표, 필터, 등급 배지
- New/changed components: 화이트 테마용 EX/S/A 등급 표면, 단색 등급 라벨, 조정 수정·취소 의미형 버튼, 평가자 폴더 기반 드래그앤드롭 매칭 작업대, RTS형 박스 다중 선택과 전체화면 작업 모드
- Variants and states: EX, S, A, B, C, D, 미평가, 조정됨, 배정 가능, 배정 완료, 배정 예정, 해제 예정, 다중 선택
- Token/component ownership: `index.html`의 화이트 테마 CSS와 `data-font-scale` 기반 가독성 토큰

## Accessibility
- Target standard: WCAG 2.1 AA 수준의 본문 대비를 지향
- Keyboard/focus behavior: 기존 `:focus-visible` 유지, 드래그 작업에는 동일 기능의 이동 버튼을 항상 제공
- Contrast/readability: 투명 그라데이션 글자를 정보성 배지에 사용하지 않음
- Screen-reader semantics: 등급 텍스트를 시각 아이콘과 함께 항상 제공
- Reduced motion and sensory considerations: `prefers-reduced-motion` 유지, 대형 광원 애니메이션 금지

## Responsive behavior
- Supported breakpoints/devices: 데스크톱 우선, 640px 이하 모바일
- Layout adaptations: 기존 고정 하단 탐색과 반응형 표/카드를 유지하며 글자 확대 시 카드 최소 폭을 넓히고 열 수를 자동 축소
- Touch/hover differences: 데스크톱은 드래그앤드롭, 모바일·키보드는 배정·해제 버튼을 제공하며 핵심 동작은 hover에 의존하지 않음

## Interaction states
- Loading: 텍스트와 진행 아이콘 병행
- Empty: 명시적인 빈 상태 문구
- Error: 원인과 재시도 행동 제공
- Success: 색상과 텍스트를 함께 사용
- Destructive actions: 취소·삭제 계열은 옅은 로즈 배경, 진한 로즈 글자와 명확한 테두리를 사용
- Pending changes: 서버 반영 전 배정 예정·해제 예정 상태와 변경 건수를 표시하고 명시적 저장·취소를 제공
- Disabled: 낮은 강조와 비활성 의미를 명확히 구분
- Offline/slow network, if applicable: 서버 오류와 로딩 상태를 구분

## Content voice
- Tone: 명확하고 업무 중심적인 존댓말
- Terminology: 평가, 피평가자, 조정, 공개 용어를 화면 간 일관되게 사용
- Microcopy rules: 아이콘만으로 상태를 전달하지 않음

## Implementation constraints
- Framework/styling system: 단일 `index.html`, Tailwind CDN 유틸리티와 인라인 CSS
- Design-token constraints: `:root` 화이트 테마 토큰을 우선 사용
- Performance constraints: 넓은 blur와 반복 box-shadow 애니메이션을 피함
- Compatibility constraints: 최신 Chromium 계열 및 인쇄/PDF 스타일
- Test/screenshot expectations: 관리자 표와 내 평가 결과에서 EX/S/A/B 대비를 육안 검증

## Open questions
- [ ] 향후 등급 배지 마크업을 공통 렌더러로 통합할지 결정 / 개발 / 화면 간 일관성
