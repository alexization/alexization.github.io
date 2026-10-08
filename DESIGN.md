---
name: 효석의 기술 블로그
description: 흰 종이 위 715px 한 줄 읽기 칸, 숲 녹색 하나로 길을 표시하는 기술 기록 블로그
colors:
  green: "#2F5D50"
  green-dark: "#244A40"
  green-mist: "#EDF3EF"
  green-leaf: "#C8D9CE"
  green-soft: "#83A799"
  text-heading: "#191F28"
  text-body: "#333D4B"
  text-sub: "#4E5968"
  text-lineno: "#8B95A1"
  line: "#E5E8EB"
  line-table: "#D1D6DB"
  surface-gray: "#F2F4F6"
  bg: "#FFFFFF"
typography:
  headline:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Noto Sans KR, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "normal"
  headline-mobile:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "normal"
  title-lg:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "25.6px"
    fontWeight: 700
    lineHeight: 1.35
  title-md:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "20.8px"
    fontWeight: 700
    lineHeight: 1.35
  title-sm:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Noto Sans KR, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  body-mobile:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.6
  meta:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  code:
    fontFamily: "Source Code Pro, Pretendard Variable, Pretendard, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "19.5px"
  code-label:
    fontFamily: "Source Code Pro, Pretendard Variable, Pretendard, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.5px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
  circle: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  gutter: "20px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  column: "715px"
components:
  link-prose:
    textColor: "{colors.green}"
  link-prose-hover:
    textColor: "{colors.green-dark}"
  nav-link:
    textColor: "{colors.text-sub}"
    typography: "{typography.label}"
    padding: "10px 8px"
  nav-link-hover:
    textColor: "{colors.text-heading}"
  chip:
    backgroundColor: "{colors.green-mist}"
    textColor: "{colors.green}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    height: "28px"
  chip-hover:
    textColor: "{colors.green-dark}"
  inline-code:
    backgroundColor: "{colors.surface-gray}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.xs}"
    padding: "0.2em 0.45em"
  code-block:
    backgroundColor: "{colors.bg}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
    width: "95%"
  code-window-head:
    backgroundColor: "{colors.surface-gray}"
    textColor: "{colors.text-sub}"
    typography: "{typography.code-label}"
    height: "34px"
  blockquote:
    backgroundColor: "{colors.green-mist}"
    textColor: "{colors.text-body}"
    padding: "16px"
  aside-callout:
    backgroundColor: "{colors.green-mist}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  series-box:
    backgroundColor: "{colors.surface-gray}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.md}"
    padding: "16px"
  toc-link:
    textColor: "{colors.text-sub}"
    rounded: "{rounded.xs}"
    padding: "8px 12px"
    width: "250px"
  toc-link-active:
    backgroundColor: "{colors.green-mist}"
    textColor: "{colors.green}"
  post-nav-card:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-heading}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  post-card-thumb:
    rounded: "{rounded.md}"
  search-dialog:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.lg}"
    width: "560px"
  search-input:
    textColor: "{colors.text-heading}"
    typography: "{typography.body}"
    height: "56px"
    padding: "0 12px 0 20px"
  search-result-hover:
    backgroundColor: "{colors.surface-gray}"
---

# Design System: 효석의 기술 블로그

## Overview

**Creative North Star: "숲 녹색 책갈피를 꽂은 흰 공책"**

흰 종이 한 장에 715px 한 줄 읽기 칸이 가운데 놓입니다. 헤더, 본문, 글 끝, 푸터가 모두 이 칸을 같이 씁니다. 글자는 회색 세 단계로만 위계를 만들고, 색은 숲 녹색 하나만 씁니다. 녹색은 "여기를 누르면 이동한다, 지금 여기다"를 알리는 책갈피 역할입니다. 장식으로 쓰지 않습니다.

면은 두 가지뿐입니다. 녹색 정보(인용, 강조 상자, 칩, TOC 현재 위치)는 안개 녹색 면, 구조 정보(코드 창 머리, 인라인 코드, 시리즈 상자)는 회색 면입니다. 선은 1px 연회색 한 종류로 제목 구분, 테두리, 소목차 선을 다 맡습니다. 그림자는 "떠 있는 물건" 두 개(코드 창, 검색 창)에만 있습니다.

글이 곧 포트폴리오라서 이 시스템은 읽기를 위해서만 움직입니다. 제목 줄간격은 1.35 아래로 좁히지 않고, 한글은 단어 중간에서 끊지 않습니다. 움직임은 TOC 소목차가 0.25초 높이로 펼쳐지는 것과 hover 색 바뀜 정도입니다. 다크모드는 없습니다.

**Key Characteristics:**
- 715px 가운데 한 칸. 1401px 이상에서만 칸 밖 오른쪽에 250px TOC가 붙고, 본문 위치는 안 바뀜
- 포인트 색은 숲 녹색 하나. 제목, 본문, 굵은 글씨, 코드, 헤더 메뉴에는 녹색 없음
- 자간은 어디서나 `normal`
- 흰 바탕 코드 창: 회색 머리 띠 + 점 3개 + 언어 이름 + 복사, 줄 번호 칸, 은은한 그림자
- 평평한 면 + 1px 선. 그림자는 떠 있는 것 두 개에만

## Colors

흰 바탕 위에 차가운 회색 글자 세 단계와 숲 녹색 한 가지, 그리고 그 녹색을 아주 옅게 푼 면 하나로 된 팔레트입니다.

### Primary
- **숲 녹색** (green): 본문 링크 글자와 밑줄, TOC 현재 위치 글자와 왼쪽 3px 선, 인용문 왼쪽 선, 칩 글자, 검색 일치 부분 글자, 포커스 테두리(2px, 바깥 2px), 검색 입력 커서.
- **짙은 숲 녹색** (green-dark): 녹색 링크와 칩의 hover 글자.
- **안개 녹색** (green-mist): 녹색 계열 면 하나. 인용문, 강조 상자, 칩, TOC 현재 위치, 검색 일치 부분 바탕.
- **연한 잎 녹색** (green-leaf): 칩 테두리와 글자 선택(::selection) 바탕. 장식 전용, 글자색으로 안 씀.
- **부드러운 잎 녹색** (green-soft): 썸네일 없는 카드의 그라데이션 밝은 끝(녹색 → 잎 녹색, 135deg). 장식 전용.

### Neutral
- **먹색 제목** (text-heading): 글 제목, 본문 h2~h4, 섹션 제목, 표 머리글, 굵은 시리즈 현재 편, 모든 hover 도착 색.
- **본문 회색** (text-body): 본문, 목록, 굵은 글씨, 인용문 글자, 인라인 코드 글자. 흰 바탕 대비 약 11:1.
- **보조 회색** (text-sub): 날짜, 메뉴, TOC 링크, 캡션, 각주, 코드 언어 이름, 작성자 소개, 카드 날짜. 보조 글자색은 이것 하나뿐(대비 약 7.1:1).
- **눈금 회색** (text-lineno): 코드 줄 번호만. 대비 약 3:1이라 다른 글자에는 쓰지 않습니다.
- **연선** (line): 1px 선 전부. h2·h3 아래 구분선, 코드 창 테두리와 머리 띠 아래 선, 줄 번호 구분선, 인라인 코드 테두리, TOC 소목차 선, 이전/다음 카드 테두리, 푸터 위 선, 검색 바 아래 선.
- **표 선** (line-table): 표 칸 테두리. 이전/다음 카드 hover 테두리와 얇은 스크롤바 색에도 쓰입니다.
- **회색 면** (surface-gray): 코드 창 머리 띠, 인라인 코드 바탕, 시리즈 상자, 검색 결과 hover, 아바타 자리.
- **종이 흰색** (bg): 페이지와 코드 창, 검색 창 바탕. 단색, 그림 없음.

### Named Rules
**The One Bookmark Rule.** 녹색은 "누를 수 있음, 지금 여기, 포커스"에만 씁니다. 제목, 본문, 굵은 글씨, 코드 하이라이트, 헤더 메뉴와 아이콘은 녹색이 아닙니다.

**The Underlined Link Rule.** 본문 링크는 늘 밑줄(1px, 아래 3px 띄움)이 있습니다. 녹색과 본문 회색 대비가 1.5:1뿐이라 색만으로는 구분이 안 됩니다. 메뉴, TOC, 카드 제목은 각자 규칙(hover 색 또는 hover 밑줄)을 따릅니다.

**The Two Surfaces Rule.** 면은 안개 녹색(녹색 정보)과 회색(구조 정보) 두 가지뿐입니다. 왼쪽 3px 녹색 선이 있으면 인용, 면만 있으면 강조 상자입니다.

## Typography

**Body Font:** Pretendard Variable (jsDelivr 동적 서브셋, 실패하면 시스템 산세리프와 Apple SD Gothic Neo)
**Label/Mono Font:** Source Code Pro 400 (Google Fonts, 한글은 Pretendard로 넘김)

**Character:** 한 가족 산세리프가 제목부터 캡션까지 다 맡고, 굵기(700/600/500/400)와 회색 단계로만 위계를 만듭니다. 코드만 Source Code Pro로 바뀝니다.

### Hierarchy
- **Headline** (700, 32px / 모바일 24px, 1.35): 글 제목 h1과 본문 h2. 크기가 같고, h2는 아래 1px 선으로 구분합니다.
- **Title Large** (700, 25.6px / 모바일 22.4px, 1.35): 본문 h3. 아래 1px 선 있음.
- **Title Medium** (700, 20.8px / 모바일 18.2px, 1.35): 본문 h4. 선 없음.
- **Title Small** (700, 20px, 1.35): 로고 글자, 시리즈 이름, 글 끝 섹션 제목("댓글", "관련 글").
- **Body** (400, 16px, 1.75 / 모바일 1.8): 본문, 표(16px). 모바일에서도 16px. 문단 위아래 16px.
- **Label** (500, 15px): 헤더 메뉴, 날짜(400), 시리즈 목록(400). 이전/다음 카드 제목은 15px/600.
- **Small** (400, 14px): TOC 링크, 작성자 소개와 링크, 푸터, 각주, 검색 발췌.
- **Meta** (500, 13px, 1.5): 칩, 이전/다음 라벨, 카드 날짜, 수정일.
- **Caption** (400, 12px): figcaption, 코드 복사 버튼, 줄 번호(mono).
- **Code** (Source Code Pro 13px, 줄높이 19.5px): 코드 블록. 인라인 코드는 0.85em.
- **Code Label** (Source Code Pro 11px, 대문자, 자간 0.5px): 코드 창의 언어 이름과 검색 창 ESC 버튼.

### Named Rules
**The Normal Tracking Rule.** 자간은 본문, 제목 모두 `normal`. 음수 자간은 쓰지 않습니다.

**The Two-Line Title Rule.** 제목 줄간격은 1.35. 두 줄 제목이 흔해서 이보다 좁히지 않습니다.

**The Keep-All Rule.** `word-break: keep-all`은 본문 글자(본문, 제목, TOC, 카드 제목)에만 겁니다. 인라인 코드와 본문 링크는 `overflow-wrap: anywhere`로 넘칠 때 끊습니다. `*` 전체에 걸지 않습니다.

## Layout

모든 화면 요소가 한 칸을 같이 씁니다. 폭은 `min(715px, 100% - 40px)`, 화면 가운데. 모바일 좌우 여백은 20px입니다.

- **세로 리듬:** 4 / 8 / 16 / 24 / 32 / 48 / 64px 단계. 헤더 위 32px(모바일 24px) → 글 제목 위 64px(모바일 40px) → 날짜 8px → 시리즈 상자 24px → 본문 40px(모바일 32px). 본문 제목 위 48px, 아래 16px, 선과 글자 사이 12px. 글 끝은 64px 띄우고, 작성자 카드와 이전/다음은 40px, 댓글 64px, 관련 글 80px, 푸터 96px.
- **코드 창:** 본문 칸의 95% 폭, 가운데, 위아래 32px. 480px 이하에서 폭 100%, 둥글기 0.
- **TOC:** 1401px 이상에서만. 본문 칸 오른쪽 밖 20px, 폭 250px, 본문 첫 줄 높이에서 시작해 위 32px에 sticky. 최대 높이 80vh, 넘치면 안쪽 스크롤. 1400px 이하에는 TOC가 없습니다.
- **글 끝 그리드:** 이전/다음은 2열(간격 16px), 관련 글 카드는 2열(세로 32px, 가로 24px). 768px 이하에서 둘 다 1열.
- **헤더:** 데스크톱은 로고 왼쪽, 메뉴 4개 + 돋보기 오른쪽 한 줄. 768px 이하에서는 로고 한 줄 + 메뉴·돋보기 한 줄. 햄버거 없음. 메뉴 첫 글자와 돋보기 그림은 음수 여백으로 칸 끝에 맞춥니다.
- **화면 구분:** 모바일 768px 이하, 코드 480px 이하, TOC 1401px 이상.

## Elevation & Depth

기본은 평평합니다. 깊이는 1px 연선과 두 가지 면으로 나눕니다. 그림자는 한 종류뿐이고, 본문 흐름 위에 "떠 있는 물건"에만 씁니다.

### Shadow Vocabulary
- **떠 있는 창** (`box-shadow: 0 5px 20px rgba(0, 0, 0, .12)`): 코드 창과 검색 창. 다른 곳에는 안 씁니다.
- **검색 뒤 흐림** (`background: rgba(25, 31, 40, .28)` + `backdrop-filter: blur(6px)`): 검색 창이 열릴 때 뒤 화면에만.

### Named Rules
**The Only Floaters Rule.** 그림자는 코드 창과 검색 창 두 개만. 카드, 칩, 시리즈 상자, 헤더는 평평합니다. 카드 hover는 그림자가 아니라 테두리 색이나 제목 밑줄로 알립니다.

## Shapes

부드럽지만 작은 둥글기입니다. 크기가 클수록 조금 더 둥급니다.

- **4px:** 인라인 코드, TOC 링크, 복사 버튼, 건너뛰기 링크. TOC 현재 위치는 왼쪽 선이 붙어서 `0 4px 4px 0`.
- **6px:** 인용문 오른쪽 모서리(`0 6px 6px 0`), 검색 ESC 버튼.
- **8px:** 코드 창, 강조 상자, 시리즈 상자, 본문 이미지, 카드 썸네일, 헤더 돋보기 버튼.
- **12px:** 이전/다음 카드, 검색 창.
- **알약(999px):** 칩. **원(50%):** 작성자 아바타.
- **선:** 모든 테두리는 1px. 굵은 선은 인용문과 TOC 현재 위치의 왼쪽 3px 녹색 선 둘뿐입니다.

## Components

### 링크
- **본문 링크:** 숲 녹색 글자 + 1px 밑줄(3px 띄움). hover는 짙은 숲 녹색.
- **조용한 링크:** 메뉴, TOC, 푸터, 작성자 링크는 보조 회색이고 hover에 먹색으로 바뀝니다. 녹색이 아닙니다.
- **포커스:** 어디서나 2px 숲 녹색 outline, 2px 띄움. 안쪽이 잘리는 곳(복사 버튼 -3px, 검색 결과 -2px)은 안으로 당깁니다.

### 칩 (태그·카테고리)
- **Style:** 알약, 안개 녹색 바탕, 숲 녹색 글자 13px/500, 1px 연한 잎 녹색 테두리, 최소 높이 28px, 안쪽 2px 10px.
- **State:** hover에 테두리가 숲 녹색, 글자가 짙은 숲 녹색으로 바뀝니다(테두리 색 0.2초 ease-out). 칩은 늘 링크입니다.

### 코드 창 (시그니처)
흰 본문 사이에 흰 창이 살짝 떠 있는 모양입니다.
- **몸통:** 흰 바탕, 1px 연선, 8px 둥글기, 떠 있는 창 그림자. pre 안쪽 16px 20px, 긴 줄은 가로 스크롤(줄바꿈 안 함).
- **머리 띠:** 34px 회색 면 + 아래 1px 연선. 왼쪽에 점 3개(#ff5f57, #febc2e, #28c840, 지름 11px, 18px 간격), 그 옆 언어 이름(Code Label), 오른쪽 복사 버튼(12px/500 보조 회색, hover 먹색). 띠와 점은 CSS로 먼저 그려서 JS가 늦어도 화면이 안 밀립니다.
- **줄 번호:** 왼쪽 48px 칸, 12px 눈금 회색, 오른쪽 1px 연선. JS가 있을 때만 생기고 복사에 안 딸려 옵니다.
- **하이라이트:** Rouge `github` 밝은 테마. 녹색 포인트를 넣지 않습니다.

### 인라인 코드
- 회색 면, 본문 회색 글자, 1px 연선, 4px 둥글기, 안쪽 0.2em 0.45em, 0.85em. 줄 끝에서 잘려도 양쪽 모양이 유지됩니다(box-decoration-break: clone).

### 인용문과 강조 상자
- **인용문:** 안개 녹색 면 + 왼쪽 3px 숲 녹색 선, 안쪽 16px, 둥글기 0 6px 6px 0. 글자는 본문과 같음.
- **강조 상자(`<aside>`):** 안개 녹색 면만, 8px 둥글기, 안쪽 16px 20px. 왼쪽 선 없음.

### 시리즈 상자
- 제목 바로 아래. 회색 면, 8px 둥글기, 안쪽 16px. 시리즈 이름 20px/700 + 점 목록 15px. 현재 편은 먹색 굵게, 다른 편은 본문 회색이고 hover에 먹색 + 밑줄.

### 목차 (TOC)
- **링크:** 14px/400 보조 회색, 안쪽 8px 12px, 4px 둥글기, 왼쪽 3px 투명 선. 테두리 카드와 "목차" 제목 없음.
- **현재 위치:** 안개 녹색 면 + 숲 녹색 글자 600 + 왼쪽 3px 숲 녹색 선. 한 항목에만 붙습니다.
- **소목차:** 왼쪽 12px 들여서 1px 연선. 접혀 있다가 그 h2 섹션에 들어가면 펼쳐집니다(grid 행 높이 0.25초, `cubic-bezier(.22, 1, .36, 1)`). 화살표(32×37px, 펼치면 90도 회전)로 직접 열 수도 있습니다. OS 동작 줄이기면 애니메이션 없음. JS가 없으면 다 펼친 채로 보입니다.

### 내비게이션
- **헤더:** 흰 바탕, 715px 칸 안, 고정 안 함, 아래 선 없음. 로고는 20px/700 먹색 글자. 메뉴는 15px/500 보조 회색, 안쪽 10px 8px, hover 먹색. 돋보기는 44×44px 버튼 안 20px SVG(선 1.75).
- **푸터:** 위 1px 연선, 안쪽 32px 0 48px, 가운데 정렬 14px 보조 회색. GitHub·피드 링크(500) + 저작권 줄.

### 카드
- **이전/다음 카드:** 흰 바탕, 1px 연선, 12px 둥글기, 안쪽 16px 20px. "이전 글/다음 글" 13px 보조 회색 + 제목 15px/600 먹색 두 줄까지. hover에 테두리가 표 선 색으로 짙어지고 제목에 밑줄. 다음 글은 오른쪽 열, 오른쪽 정렬(모바일은 왼쪽).
- **글 카드 (관련 글, 홈에서 다시 씀):** 테두리 없음. 16:9 썸네일(8px 둥글기, 없으면 숲 녹색 → 부드러운 잎 녹색 135deg 그라데이션, 안에 글자 없음) + 제목 16px/600 먹색 두 줄 + 날짜 13px 보조 회색. hover에 제목 밑줄.
- **작성자 카드:** 테두리 없음. 72px 원형 아바타 + 이름 16px/700 + 소개 14px + 링크 14px/500.

### 검색 창
- **창:** `<dialog>`, 폭 min(560px, 100% - 32px), 위 12vh(모바일 16px), 흰 바탕, 12px 둥글기, 떠 있는 창 그림자. 뒤는 흐림.
- **입력 줄:** 높이 56px, 아래 1px 연선. 돋보기 SVG + 16px 입력(먹색, placeholder 보조 회색, 커서 숲 녹색, outline 없음) + ESC 버튼(1px 연선, 6px 둥글기, Code Label).
- **결과:** 안쪽 12px 20px, 제목 16px/700 + 발췌 14px 한 줄 말줄임. hover와 포커스에 회색 면. 일치 부분은 안개 녹색 면 + 숲 녹색 글자(2px 둥글기). 썸네일 없음.

## Do's and Don'ts

### Do:
- **Do** 헤더, 본문, 글 끝, 푸터를 모두 같은 715px 칸(`min(715px, 100% - 40px)`)에 넣으세요.
- **Do** 본문 링크에 늘 1px 밑줄(3px 띄움)을 두세요.
- **Do** 녹색 정보는 안개 녹색 면, 구조 정보는 회색 면으로 나누세요.
- **Do** 보조 글자는 보조 회색(#4E5968) 하나로 쓰세요. 눈금 회색은 코드 줄 번호만.
- **Do** 제목은 700, 줄간격 1.35, 자간 normal로 두세요.
- **Do** 새 화면(홈, 카테고리, 태그, 404)도 이 셸과 글 카드, 칩을 그대로 다시 쓰세요.
- **Do** 움직임은 0.2~0.25초로 짧게 두고, 동작 줄이기 설정을 따르세요.

### Don't:
- **Don't** 제목, 본문, 굵은 글씨, 코드 하이라이트, 헤더 메뉴와 아이콘에 녹색을 쓰지 마세요.
- **Don't** 흰 본문 사이에 어두운 코드 블록을 넣지 마세요.
- **Don't** 본문과 TOC를 한 덩어리로 묶어 본문을 왼쪽으로 밀지 마세요.
- **Don't** 음수 자간, 파란 포인트 색, 다크모드를 넣지 마세요.
- **Don't** 헤더에 반투명 판, 전체 폭 띠, 아래 선, 소셜·RSS 아이콘, 햄버거 메뉴를 넣지 마세요.
- **Don't** 흰 바탕 대비 4.5:1이 안 되는 회색 글자를 쓰지 마세요(코드 줄 번호만 예외).
- **Don't** 코드 창과 검색 창 말고 다른 곳에 그림자를 주지 마세요.
- **Don't** TOC에 테두리 카드, 제목, 항목 구분선을 넣거나 글자색만으로 현재 위치를 표시하지 마세요.
