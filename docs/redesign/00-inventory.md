# 개편 전 현황 정리

2026-10-08 작성. `redesign` 브랜치 6039dab 기준. 원본은 Minimal Mistakes(이하 MM) 4.27.3.

- 화면 크기: 데스크톱 1440, 태블릿 820, 모바일 390
- ID 규칙: 커스텀은 C01…, 오류는 E01…. 다음 단계에서 이 ID로 가리킴.

## 요약

- **베이스: B안으로 결정**(Jekyll 유지 + 레이아웃·스타일 새로 작성). 기능 코드는 옮겨 씀(4절).
- **커스텀 19개(C01~C19), 오류 19개(E01~E19).** 심각도 높음은 E04(태블릿 TOC), E11(giscus 설정).
- **결정은 3절 "결정" 칸과 맨 끝 "결정해야 할 항목"에 있음.** "3단계 후 결정"이던 5개는 3단계(`01-references.md` 1-10)에서 정함.

## 1. 커스텀 목록

### 1-1. 원본과 다른 파일

| 파일 | 상태 | 커스텀 |
|---|---|---|
| `_config.yml` | 수정 | C01, C10, C11, C12, C13, C19 |
| `index.html` | 수정 | C06, C11 |
| `minimal-mistakes-jekyll.gemspec` | 수정 (`jekyll-redirect-from` 의존성 추가) | C12 |
| `_data/navigation.yml` | 수정 | C03 |
| `_data/ui-text.yml` | 수정 (zh-TW 문구만) | C18 |
| `_includes/archive-single.html` | 수정 | C06, C11 |
| `_includes/author-profile.html` | 수정 | C07, C08, C11 |
| `_includes/category-list.html`, `_includes/tag-list.html` | 수정 (class 추가) | C09 |
| `_includes/head/custom.html` | 수정 | C02, C05 |
| `_includes/paginator-v1.html`, `_includes/paginator-v2.html` | 수정 | C13 |
| `_includes/scripts.html` | 수정 | C14 |
| `_includes/seo.html` | 수정 | C11 |
| `_includes/toc` | 수정 | C09 |
| `_includes/structured-data.html` | 추가 | C11 |
| `_layouts/archive.html` | 수정 (`show_page_title` 조건) | C06 |
| `_layouts/single.html` | 수정 | C09, C10, C11 |
| `_layouts/redirect.html` | 추가 | C12 |
| `_sass/minimal-mistakes/_base.scss`, `_footer.scss`, `_navigation.scss`, `_reset.scss`, `_sidebar.scss`, `_variables.scss` | 수정 | C08, C15, C16 |
| `assets/css/main.scss` | 수정 (9줄 → 1,496줄) | C05, C06, C07, C08, C09, C13, C16, C17 |
| `assets/images/author.png`, `assets/images/logo.png` | 추가 | C01 |
| `_pages/about.md`, `_pages/category_archive.md`, `_pages/tag_archive.md` | 추가 | C04 |
| 루트 파비콘·아이콘 6개(`favicon.ico`, `favicon.svg`, `favicon-96x96.png`, `apple-touch-icon.png`, `web-app-manifest-192x192.png`, `web-app-manifest-512x512.png`), `site.webmanifest` | 추가 | C02 |
| `google167226cfabb37bdd.html`, `robots.txt` | 추가 | C11 |
| `.github/workflows/jekyll.yml`, `.ruby-version`, `Gemfile.lock` | 추가 | C19 |
| `.codex/skills/` | 추가 | 사이트와 무관(글쓰기 도구). 점(.)으로 시작하는 폴더라 Jekyll이 빌드에서 뺌 |

원본과 같은 것:
- `assets/js/` 전체: `_main.js`, `main.min.js`, 플러그인
- 위 표에 없는 나머지 `_includes`, `_layouts`, `_sass` 파일
- `Rakefile`, `package.json`, `staticman.yml`, `Gemfile`

### 1-2. 커스텀 항목

현재 상태 칸: 동작 = 의도대로 됨 / 덮임 = 다른 코드에 덮여 효과 없음 / 죽은 코드 = 아무 데서도 안 씀

| ID | 이름 | 종류 | 파일 | 내용 | 현재 상태 |
|---|---|---|---|---|---|
| C01 | 사이트 기본 설정 | 설정 | `_config.yml`, `assets/images/` | 한국어(`ko-KR`), 제목·부제·작성자, `Asia/Seoul`, 한 페이지 10개, 검색 켬, 코드 복사 버튼 켬, `parse_block_html: true`, GitHub·Email 링크, 기본 og 이미지·teaser·logo | 동작. 날짜 형식은 설정 안 함(E10) |
| C02 | 파비콘·웹앱 매니페스트 | 설정 | `head/custom.html`, 루트 아이콘 파일, `site.webmanifest` | 파비콘 4종, apple-touch-icon, manifest, 앱 이름 | 동작 |
| C03 | 상단 메뉴 | 설정 | `_data/navigation.yml` | Posts / Categories / Tags / About | 동작. 모바일 햄버거 메뉴도 정상 |
| C04 | 카테고리·태그·About 페이지 | 레이아웃 | `_pages/*.md` | 한글 제목, 카테고리·태그 페이지는 noindex·sitemap 제외, About은 wide | 동작 |
| C05 | Toss 스타일 디자인 (`main.scss` 덧씌우기) | 스타일 | `assets/css/main.scss`, `head/custom.html` | Toss Product Sans 서체(`static.toss.im`에서 CSS 2개 로드), `--toss-*` 색 토큰, 헤더·본문 글자·인용문·인라인 코드·hr·이미지·카드·사이드바 모양 전부, media query 7개 | 동작. 중복 규칙·하드코딩 색이 많음 |
| C06 | 홈 글 목록 카드 | 레이아웃 | `archive-single.html`, `index.html`, `_layouts/archive.html`, `main.scss` | 썸네일 순서 og_image → image → overlay_image → teaser(logo는 건너뜀), 오른쪽 썸네일, 썸네일 없으면 그라데이션 대체 카드(카테고리+제목), 카테고리 칩, 발췌 2줄, 홈 제목 숨김(`show_page_title: false`) | 동작. 썸네일 10개 모두 로드됨. 검색 결과엔 이 썸네일 규칙이 안 들어감(E08) |
| C07 | 홈 사이드바 프로필 카드 | 레이아웃 | `author-profile.html`, `_sidebar.scss`, `main.scss` | Follow 버튼 없앰(링크 항상 보임), 큰 아바타, `jobTitle` 지원, 사이드바 스크롤바 숨김, 프로필 링크 `rel`에서 `nofollow` 뺌 | 동작. `_main.js:10-12`의 Follow 버튼 코드는 이제 죽은 코드 |
| C08 | 사이드바 카테고리 목록 | 기능 | `author-profile.html`, `_sidebar.scss`, `_navigation.scss`, `main.scss` | 전체 글 수 + 카테고리별 글 수, 이름순, `/categories/#slug`로 이동. 카테고리·태그 페이지에선 숨김 | 1024px 이상에서만 동작(E05). 스타일이 3곳(`_sidebar`, `_navigation`, `main.scss`)에 흩어짐 |
| C09 | 글 페이지 레이아웃 + 오른쪽 TOC | 레이아웃 | `_layouts/single.html`, `_includes/toc`, `category-list.html`, `tag-list.html`, `main.scss` | 글에서는 왼쪽 사이드바 없앰(`page--solo`, 본문 46rem). TOC를 본문 밖 오른쪽 칸으로 옮김. TOC 깊이 옵션 `toc_max`(기본 3), TOC 아이콘 뺌 | 데스크톱 동작(따라오기·현재 위치 강조·클릭 이동). 태블릿 깨짐(E04), 모바일 TOC 없음(E09). `_includes/toc` 수정은 쓰는 글이 없어서 죽은 코드. 글 defaults의 `author_profile: true`도 글에선 효과 없음 |
| C10 | giscus 댓글 | 기능 | `_config.yml`, `_layouts/single.html` | giscus 사용, 댓글 위치를 글 래퍼 안으로 옮김, 개발 모드 안내 문구에 class 추가 | 설정 키 이름이 틀려서 repo·category 값이 빈 채로 나감(E11) |
| C11 | SEO 개편 | SEO | `seo.html`, `structured-data.html`(새 파일), `single.html`, `archive-single.html`, `author-profile.html`, `_config.yml`, `index.html`, `_pages/*`, `robots.txt`, `google…html` | 2페이지 이후·카테고리·태그 noindex, twitter 태그 항상 출력, `og:image:alt`, `article:section`·`article:tag`, JSON-LD `@graph`(WebSite·Person·BlogPosting·BreadcrumbList), 글 microdata를 BlogPosting으로, robots.txt + sitemap | 대부분 동작. JSON-LD는 전 페이지 파싱 OK. verification 값 오류(E13), sitemap에 noindex 페이지 포함(E14). 원본 `schema.html`은 이제 안 씀 |
| C12 | 옛 URL 리다이렉트 | 기능 | `_layouts/redirect.html`, gemspec, `_config.yml`, 글 front matter의 `permalink`·`redirect_from` | 띄어쓰기가 들어간 옛 카테고리 주소(`/git ranker/…`, `/home lab/…`)를 새 주소로 보냄. 리다이렉트 페이지는 noindex + canonical + 한국어 안내 | 동작. 리다이렉트 페이지 14개 생성 확인, `/git%20ranker/git-ranker-i18n/` → 새 주소로 이동 |
| C13 | 홈 페이지네이션 | 스타일 | `paginator-v1.html`, `paginator-v2.html`, `main.scss` | 동그란 화살표·숫자 버튼, 한글 `aria-label`, `aria-current` | 동작. 스타일은 `.layout--home` 안에서만 걸리는데, 페이지네이션 쓰는 곳이 홈뿐이라 문제 없음. `paginator-v2` 수정분은 안 쓰는 코드(v1 사용 중) |
| C14 | 외부 링크 새 탭 | 기능 | `_includes/scripts.html:30-42` | 다른 도메인 링크에 `target="_blank"`, `rel="noopener noreferrer"` | 동작. 대신 원래 있던 `rel`을 지움(E12) |
| C15 | 초기에 테마 Sass 직접 수정 | 스타일 | `_base.scss`, `_reset.scss`, `_footer.scss`, `_variables.scss`, `_navigation.scss`, `_sidebar.scss` | 인용문 모양, 링크 밑줄 제거, hr 색 `#dddddd`, 루트 글자 18px, 푸터 배경 `#FFFFFF`, `$code-background-color: #dddddd`, `$x-large`·`$max-width` 1400px, 사이드바 정렬·패딩 | 대부분 덮임. 효과가 남은 건 푸터 배경 `#FFFFFF`와 `$max-width` 1400(E07의 원인) |
| C16 | 한글 줄바꿈 `keep-all` | 스타일 | `main.scss:26`(`* {}`), `_base.scss`, `_navigation.scss` | 모든 요소에 `word-break: keep-all`(한글 단어 중간에서 안 끊기게) | 동작. 4곳에 중복. 긴 인라인 코드도 안 끊겨서 모바일에서 넘침(E06) |
| C17 | 표 스타일 | 스타일 | `main.scss` (약 596~682줄) | 테두리 있는 표, 넓으면 가로 스크롤 | 동작. 모바일에서 표 3개 모두 칸 안에서 가로 스크롤. 같은 규칙이 `.page__content >`, `.page__content-body >` 두 벌 |
| C18 | `ui-text.yml` zh-TW 문구 | (무관) | `_data/ui-text.yml` | 대만 중국어 문구만 원본과 다름 | 사이트(ko-KR)에 영향 없음 |
| C19 | 배포 설정 (1단계) | 설정 | `.github/workflows/jekyll.yml`, `.ruby-version`, `Gemfile.lock`, `_config.yml`의 `sass`·`exclude` | GitHub Actions + Jekyll 4 배포, `quiet_deps: true`, `sourcemap: never`, 개편 문서 배포 제외 | 동작. 자세한 건 `deploy-migration.md` |

## 2. 오류 목록

심각도:
- 높음: 기능이 안 되거나 화면이 크게 깨짐
- 중간: 눈에 띄지만 쓸 수는 있음
- 낮음: 품질·정리 문제

### 2-1. 빌드 경고·에러

빌드 에러 0건(개발·production 모두).

| ID | 증상 | 재현 방법 | 추정 원인 | 관련 커스텀 | 심각도 |
|---|---|---|---|---|---|
| E01 | Sass `@import` deprecation 경고 2건 | `bundle exec jekyll build` | `assets/css/main.scss:25-26`의 `@import`. Dart Sass 3.0에서 `@import`가 없어지면 빌드가 실패함 | C05 | 중간 → 완료 (8.5단계. `main.scss`와 테마 Sass를 지워서 0건) |
| E02 | 숨겨진 Sass deprecation 경고 246건 (보이는 2건 포함 248건) | `sass: { quiet_deps: false }`만 적은 파일을 만들어 `bundle exec jekyll build --config _config.yml,<그 파일>` → 23건 출력 + "225 repetitive deprecation warnings omitted" | 대부분 테마에 딸린 susy·breakpoint(`_sass/minimal-mistakes/vendor`)와 `_mixins.scss`. 종류별 건수는 `deploy-migration.md` 표와 같음. f4e40c8의 `quiet_deps: true`로 가려 둔 상태 | 원본 테마 | 중간 → 완료 (8.5단계. 테마 Sass를 지워서 같은 재현 방법(`quiet_deps: false`)으로도 0건) |
| E03 | `To use retry middleware with Faraday v2.0+, install faraday-retry gem` 안내 | 아무 빌드나 | jekyll-gist가 쓰는 octokit이 띄우는 안내. 빌드 결과엔 영향 없음 | — | 낮음 |

### 2-2. 브라우저 콘솔

번호를 붙일 콘솔 오류는 없음(로컬 11개 페이지 × 화면 3개 모두 0건).

- 실제 사이트 글에서 나오는 `[giscus] Discussion not found…` 경고는 댓글이 아직 없어서 나오는 정상 안내. 오류 아님.

### 2-3. 레이아웃 (데스크톱·태블릿·모바일)

| ID | 증상 | 재현 방법 | 추정 원인 | 관련 커스텀 | 심각도 |
|---|---|---|---|---|---|
| E04 | 태블릿에서 TOC가 깨짐: 본문이 다 끝난 뒤 오른쪽 반쪽 칸에 나오고 왼쪽은 빈칸. TOC 높이 2,394px 중 1,063px만 보이고 나머지는 잘림(스크롤도 안 됨) | 820px로 `/algorithm/java-coding-test/`(목차 72개)를 열고 본문 끝까지 스크롤 | `single.html`이 TOC를 본문 밖으로 옮겼는데, 본문+TOC 두 칸 배치는 64em(1024px) 이상에만 있음(`main.scss:1333`). 게다가 `.toc.sidebar-card { overflow: hidden }`(`main.scss:1051`)이 걸려 있고, 목차 안쪽 스크롤은 1024px 이상에서만 켜짐 | C09 | 높음 → 완료 (7단계. 1400px 이하는 TOC를 숨김. 9단계에서 820·1024·1400px은 TOC 숨김·본문 가운데·가로 넘침 없음, 1401·1440px은 현재 위치 강조·펼침·안쪽 스크롤 정상 확인) |
| E05 | 홈 사이드바 카테고리 목록: 태블릿에선 "카테고리" 제목만 있고 목록이 비어 있음. 모바일에선 섹션 자체가 없음 | 820px·390px로 홈 | 테마의 `.nav__list .nav__items`가 1024px 미만에서 `max-height: 0`으로 접힘(`_navigation.scss:453`). 펼치려면 체크박스+라벨이 있어야 하는데 C08 마크업엔 없음. 768px 이하는 `main.scss:1480`이 `display: none` | C08 | 중간 |
| E06 | 모바일에서 글 2개가 가로로 넘침(페이지 전체가 옆으로 밀림) | 390px로 `/git-ranker/git-ranker-i18n/`(폭 449px), `/backend/redis-stream-first-come-first-served-event-system-2/`(폭 399px). 나머지 29페이지와 태블릿은 문제 없음 | 긴 인라인 코드(`BusinessException(ErrorType.INVALID_REQUEST)` 등)가 줄바꿈이 안 됨. 전체에 `word-break: keep-all`이 걸려 있고 인라인 코드엔 `overflow-wrap` 처리가 없음 | C16 | 중간 → 완료 (7단계. `keep-all`은 본문 글자에만, 인라인 코드는 `overflow-wrap: anywhere`. 9단계에서 390px로 글 25개와 홈·About·카테고리·태그·404 모두 폭 390 확인) |
| E07 | 데스크톱에서 푸터가 본문과 정렬이 안 맞음. 푸터 글자가 화면 왼쪽 끝에 붙음 | 1440px로 아무 페이지 맨 아래. 헤더·본문은 x=153~1273(폭 1120px), 푸터는 x=13~1413 | 푸터 폭은 `$max-width`(C15에서 1400px로 바꿈)를 따름. 헤더·본문만 `main.scss:62,72`에서 1120px로 따로 줄였음 | C05, C15 | 중간 → 완료 (7단계. 푸터를 본문과 같은 715px 칸에 가운데 정렬. 9단계에서 1440px로 푸터·본문 모두 x=363~1078, 푸터 글자 가운데 x=720 확인) |
| E08 | 검색 결과마다 로고(`#`) 이미지가 680px 폭으로 크게 나옴. 결과 영역도 화면 왼쪽에 붙음 | 1440px에서 돋보기 → "nginx" 입력 | 검색 결과를 만드는 `assets/js/lunr/lunr-en.js`는 `lunr-store.js`의 `header.teaser`를 썸네일로 씀. 글 25개 전부 `teaser: /assets/images/logo.png`. 홈 카드(C06)는 logo를 건너뛰게 고쳤지만 검색은 안 고침. 왼쪽 쏠림은 E07처럼 `$max-width` 기준 폭을 따라서인 걸로 추정 | C06, C15 | 중간 → 완료 (7단계. 검색을 가운데 모달로 바꾸고 결과에 썸네일을 안 넣음. 9단계에서 1440px "nginx" → 결과 2개, 이미지 0개, 모달 가운데 확인. 검색어별 결과 수도 전과 같음) |
| E09 | 모바일(768px 이하)에서 TOC가 아예 없음 | 390px로 아무 글 | `main.scss:1447`이 TOC를 `display: none`. 의도한 걸로 보이지만 긴 글(목차 72개)에서 섹션 이동 수단이 없음 | C09 | 낮음 |
| E10 | 날짜만 영어로 나옴(`December 23, 2025`). 나머지 화면 글자는 한국어 | 아무 글 제목 아래나 홈 카드 | `_config.yml`에 `date_format`이 없어서 테마 기본값 `%B %-d, %Y`를 씀 | C01 | 낮음 → 완료 (7단계. `date_format: "%Y.%m.%d"`. 9단계에서 빌드 HTML 45개의 영어 날짜 0건, `<time>` 240개 모두 `2025.12.23` 형식 확인) |

### 2-4. 동작하지 않는 기능

| ID | 증상 | 재현 방법 | 추정 원인 | 관련 커스텀 | 심각도 |
|---|---|---|---|---|---|
| E11 | giscus 설정값이 안 들어감. 위젯은 뜨지만 영어로 나오고, 입력창은 위쪽에 있음. 댓글을 새로 달 수 없을 것으로 추정 | 실제 사이트 글 페이지 소스에서 `data-repo-id` 검색 → `''`. giscus iframe 주소에서도 `repoId=`, `category=`, `categoryId=`가 비어 있고 `lang`은 en, `inputPosition`은 top | `_config.yml:39-51`은 giscus.app 스크립트 속성 이름(`data-repo-id`, `data-category-id`…)을 키로 씀. 테마의 `comments-providers/giscus.html:15-24`는 `repo_id`, `category_name`, `category_id`, `input_position`, `lang`을 읽음. 적힌 값(repo id, `Announcements` category id)은 GitHub API로 확인한 맞는 값이라 키 이름만 고치면 됨. GitHub API로 보면 레포 Discussions가 0개라 지금까지 달린 댓글은 없음. 첫 댓글을 달려면 discussion을 새로 만들어야 하는데 category가 비어 있어서 실패할 것으로 추정(실제로 댓글을 써 보진 않음) | C10 | 높음 → 완료 (7단계. 키 이름을 `repo_id`·`category_name`·`category_id`·`input_position`·`lang`으로 고침. 9단계에서 production 빌드의 giscus iframe 주소에 `repoId`·`category`·`categoryId` 값, `/ko/widget`, `inputPosition=bottom` 확인. 실제 댓글 쓰기는 11단계 배포 때 확인) |
| E12 | 외부 링크 스크립트가 원래 있던 `rel`을 지움 | 홈 사이드바 GitHub 링크: HTML은 `rel="noopener noreferrer me"`인데 페이지가 뜬 뒤엔 `rel="noopener noreferrer"`. 푸터 GitHub 링크의 `nofollow`도 사라짐 | `_includes/scripts.html:37-38`이 `setAttribute('rel', …)`로 통째로 바꿈. 본인 프로필 표시인 `me`가 없어짐 | C14 | 낮음 → 완료 (7단계. `rel`을 `relList.add`로 덧붙임. 9단계에서 프로필·작성자 카드의 `me`, 푸터의 `nofollow`가 남고 `noopener noreferrer`만 붙는 것 확인) |
| E13 | `google-site-verification` 메타 값이 파일 이름 | 홈 소스: `content="google167226cfabb37bdd.html"` | `_config.yml:87`에 인증 토큰 대신 파일 이름을 넣음. 인증 파일(`/google167226cfabb37bdd.html`)은 200으로 살아 있어서 파일 방식 인증은 됨. 메타 태그만 쓸모없음 | C11 | 낮음 → 완료 (9단계. 값을 비워서 메타 태그가 안 나옴. 파일 방식 인증은 그대로) |
| E14 | sitemap에 noindex 페이지가 들어감 | `sitemap.xml`에 `/page2/`, `/page3/`가 있음. 두 페이지 소스엔 `<meta name="robots" content="noindex,…">` | `_config.yml` defaults의 `path: "page*"` 규칙(sitemap 제외)이 jekyll-paginate가 만든 페이지엔 안 먹음. 페이지네이션 페이지는 `index.html`을 복제해서 만들기 때문으로 추정 | C11 | 낮음 → 완료 (8단계에서 페이지 나누기를 없애서 사라짐. 9단계에서 sitemap 27개 중 noindex 페이지 0개 확인) |
| E15 | 같은 글의 읽는 시간이 화면마다 다름 | "OpenAI의 Harness Engineering…" 글: 홈 카드는 12분, 다른 글 아래 "참고" 카드는 13분 | 둘 다 `page__meta.html`이 글 단어 수로 계산함. 홈을 만들 때와 글 페이지를 만들 때 넘겨받는 내용이 다른 걸로 추정(마크다운 원문 vs 변환된 HTML) | 원본 테마 | 낮음 → 완료 (8단계. 계산을 `blog/read-time.html` 한 곳으로. 9단계에서 글 25개 모두 홈·카테고리·태그 값이 같음 확인. Harness Engineering 글은 세 곳 다 12분) |
| E16 | "참고"(관련 글)에 관련 없는 최신 글이 나옴 | 아무 글 하단 "참고" 4개가 사이트 최신 글 4개와 같음 | Jekyll의 `related_posts`는 `--lsi` 없이 돌리면 그냥 최신 글을 줌. 원본 테마 동작 그대로 | 원본 테마 | 낮음 → 완료 (7단계. 같은 카테고리·다른 시리즈 글 중 최신 4개, 없으면 숨김. 9단계에서 글 25개 모두 이 규칙과 일치 확인) |
| E17 | 404 페이지가 블로그 화면이 아님 | 실제 사이트 `/no-such-page/` → "Page not found · GitHub Pages" 기본 화면, 블로그 헤더·메뉴 없음 | `404.html`이 없음 | — | 낮음 |
| E18 | 글 하나에 h1이 5~10개 | 아무 글에서 `document.querySelectorAll('h1').length`. 글 25개 전부 5~10개 | 글 본문 섹션 제목을 `#`(h1)로 씀. 페이지 제목 h1과 같은 단계. TOC도 h1부터 잡음(`single.html`의 `h_min=1`) | 글 본문 | 낮음 |
| E19 | 안 쓰는 파일이 배포됨 | 빌드 결과에 `staticman.yml`, `assets/js/main.min.js.map`이 있음 | 원본 테마 파일인데 `exclude`에 없음 | 원본 테마 | 낮음 → 완료 (8.5단계. 두 파일을 지워서 빌드 결과에 없음) |

### 확인했는데 정상인 것

- **모바일 햄버거 메뉴:** 열고 닫기 정상. 메뉴 4개 다 나옴.
- **검색:** 영어·한글 다 결과가 나옴. 깨진 건 결과 화면(E08)뿐.
  - 검색어별 결과 수: spring 13, nginx 2, 홈서버 5, 도메인 4, 배치 5
- **코드 복사 버튼:** 누르면 그 코드 블록 내용을 정확히 복사함.
- **데스크톱 TOC:** 화면 따라오기, 클릭하면 이동, 스크롤하면 현재 위치 강조, 긴 목차는 안쪽 스크롤 모두 정상.
- **표:** 모바일에서 칸 안에서 가로 스크롤됨.
- **링크:** production 빌드 HTML 46개에서 깨진 내부 링크·이미지·`#앵커` 0건. 중복 id도 0건.
- **JSON-LD:** 전 페이지 파싱 정상. HTML 엔티티 섞임 없음.
- **이동:** 옛 URL 리다이렉트, 사이드바 카테고리 링크(`/categories/#home-lab`) 모두 정상.
- **외부 이미지:** 글 이미지는 imgur·imgchest에 있음. 홈 썸네일 10개 전부 로드됨.
- **GA:** 실제 사이트에 gtag 스크립트가 있음.

## 3. 커스텀별 추천

결정 칸은 2026-10-08에 채움. "3단계 후 결정"이던 항목은 레퍼런스 분석(3단계)에서 채움.

| ID | 이름 | 추천 | 이유 | 관련 오류 | 결정 |
|---|---|---|---|---|---|
| C01 | 사이트 기본 설정 | 유지 | 사이트 정보·플러그인 설정이라 디자인과 무관. `parse_block_html: true`는 글 속 `<aside>` 45개가 기대고 있어서 꼭 유지. 한국어 `date_format` 추가 | E10 | 추천대로. 날짜 형식은 `2025.12.23`(`%Y.%m.%d`) 한 가지 (3단계에서 정함) |
| C02 | 파비콘·매니페스트 | 유지 | 문제 없음. 새 디자인에 맞춰 아이콘만 바꿀 수 있음 | — | 추천대로 |
| C03 | 상단 메뉴 | 유지 | 메뉴 항목·주소는 그대로, 모양만 새 디자인에서 | — | 추천대로 |
| C04 | 카테고리·태그·About 페이지 | 유지 | `/categories/`, `/tags/`, `/about/` 주소와 noindex는 그대로, 화면만 새로 | — | 추천대로 |
| C05 | Toss 스타일 (`main.scss` 덧씌우기) | 삭제 | 새 디자인으로 통째로 바뀜. 테마 위에 1,460줄을 덮어쓰는 구조라 중복·충돌이 많음. Toss Product Sans는 토스 전용 서체로 만들어졌고([토스피드](https://toss.im/tossfeed/article/beginning-of-tps)), 외부 웹사이트에서 써도 된다는 근거를 못 찾음 → 3단계에서 무료 대체 서체 고르기 | E01, E07 | 추천대로. 대체 서체는 3단계에서 |
| C06 | 홈 글 목록 카드 | 고침 | 기능(썸네일 순서, 썸네일 없을 때 대체 카드, 카테고리 칩)은 살리고 모양은 새로. 같은 썸네일 규칙을 검색 결과에도 적용 | E08 | 추천대로 |
| C07 | 홈 사이드바 프로필 카드 | 결정 필요 | 동작엔 문제 없음. 홈에 프로필 사이드바를 둘지는 디자인 결정 | E12 | 삭제(3단계에서 정함). 프로필은 홈 맨 위 가운데에 짧게(아바타, 이름, 한 줄 소개, GitHub·Email) + 글 끝 작성자 카드. 프로필 링크 `rel="me"` 살림 |
| C08 | 사이드바 카테고리 목록 | 삭제 (또는 고침) | 1024px 이상에서만 보이고, 상단 Categories 메뉴·카테고리 페이지와 내용이 겹침. 살린다면 모든 화면에서 보이게 새로 만들어야 함 | E05 | 삭제(3단계에서 정함). 사이드바가 없어짐. 카테고리는 메뉴 Categories 페이지와 글 목록 카드 칩으로 |
| C09 | 글 레이아웃 + 오른쪽 TOC | 고침 | 데스크톱 TOC는 잘 동작함. 태블릿·모바일 배치만 새로 설계. `toc_max`(목차 깊이) 옵션은 유지 | E04, E09 | 고침. 1400px 이하는 TOC 숨김(3단계에서 1024px 미만 → 1400px 이하로 바꿈, kciter와 같음. `01-references.md` 1-6). 이유: 작은 화면은 단순하게, 본문에만 집중(E09는 안 고침) |
| C10 | giscus 댓글 | 고침 | 키 이름만 맞추면 됨(`repo_id`, `category_name`, `category_id`, `input_position`, `lang`…). 댓글은 `pathname`으로 찾으니까 URL만 그대로면 개편해도 안 끊김 | E11 | 고침. `ko`·`bottom`, 개편 배포 때 같이. 이유: 작업을 개편 배포 한 번에 묶고, main은 그 전까지 안 건드림 |
| C11 | SEO 개편 | 유지 + 고침 | noindex 규칙, JSON-LD, og 태그 다 정상. `seo.html`과 `structured-data.html`은 새 레이아웃에 거의 그대로 옮겨 쓸 수 있음. verification 값과 sitemap 제외만 고침 | E13, E14 | 추천대로 |
| C12 | 옛 URL 리다이렉트 | 유지 | 띄어쓰기가 들어간 옛 주소 14개를 살려 두는 장치. 지우면 바깥에 걸린 옛 링크가 깨짐 | — | 추천대로 |
| C13 | 홈 페이지네이션 | 유지 (모양은 새로) | 10개씩 나누기와 `aria-label`은 정상. 안 쓰는 `paginator-v2` 수정분은 버림 | — | 삭제(3단계에서 바꿈, `01-references.md` 1-8). 글 목록은 한 페이지에 다 보여 주고 썸네일은 lazy. `/page2/`·`/page3/`은 리다이렉트 없이 없앰(404) |
| C14 | 외부 링크 새 탭 | 고침 | 새 탭은 유지하되, 원래 `rel`에 덧붙이도록. 새 탭 자체를 없앨지는 결정 사항 | E12 | 추천대로. 새 탭 유지, 원래 `rel`에 덧붙이게 |
| C15 | 초기 테마 Sass 직접 수정 | 삭제 | 대부분 덮여서 지금 효과 없음(계산값으로 확인). 남은 효과는 `$max-width` 1400 하나인데 그게 E07의 원인 | E07, E08 | 추천대로 |
| C16 | 한글 줄바꿈 `keep-all` | 고침 | 한글 단어가 중간에서 안 끊기는 건 살릴 가치가 있음. 다만 `*` 전체가 아니라 본문 글자에만 걸고, 코드·URL은 줄바꿈 허용(`overflow-wrap: anywhere` 등) | E06 | 추천대로 |
| C17 | 표 스타일 | 유지 (새 디자인에서 다시 구현) | 넓은 표가 모바일에서 가로 스크롤되는 동작은 정상. 두 벌인 규칙은 새로 쓸 때 하나로 | — | 추천대로 |
| C18 | `ui-text.yml` zh-TW 문구 | 신경 안 써도 됨 | 사이트(ko-KR)에 영향 없음. B안이면 테마 파일과 같이 정리됨 | — | 추천대로 |
| C19 | 배포 설정 | 유지 | 1단계 결과. `JEKYLL_ENV=production`은 꼭 유지 | — | 추천대로 |

### 켜 두고 쓰는 원본 기능

커스텀은 아니지만, 새로 만들 때 챙길지 정해야 하는 것들.

| 기능 | 지금 상태 | 추천 | 이유 | 결정 |
|---|---|---|---|---|
| 검색 (lunr) | 동작, 결과 화면만 깨짐 | 고침 | 한글 검색도 됨. 결과 썸네일과 배치만 고치면 됨(E08) | 추천대로 |
| 코드 복사 버튼 | 정상 | 유지 | 기술 블로그에 필요 | 추천대로 |
| 공유 버튼 (X, Facebook, LinkedIn, Bluesky) | 정상 | 결정 필요 | 쓸지는 취향 | 삭제(3단계에서 정함). kciter도 없고, 색 버튼 4개가 글 끝을 시끄럽게 함 |
| 관련 글 ("참고") | 최신 글 4개를 보여 줌 | 결정 필요 | 같은 카테고리·태그 글로 고치거나 없애거나(E16) | 고침(3단계에서 정함). 같은 카테고리 글 최대 4개, 같은 시리즈 글은 빼고, 남는 게 없으면 숨김. 댓글 아래 |
| 읽는 시간 | 동작, 화면마다 1분 차이 | 유지 + 고침 | E15 | 추천대로 |
| 이전/다음 글 | 정상 ("이전/다음" 글자만 있고 글 제목 없음) | 유지 | 새 디자인에서 글 제목도 같이 보여 주면 좋음 | 추천대로 |
| RSS (`feed.xml`) | 정상 | 유지 | — | 추천대로 |
| Google Analytics | 정상 (production에서만) | 유지 | — | 추천대로 |

## 4. 베이스 결정

**결정: B안**(Jekyll은 유지하고 레이아웃·스타일을 새로 작성).

- **새로 만들 것:** 글 목록(페이지 나누기 없음, C13), 글 페이지·TOC, 카테고리·태그 페이지, 검색 화면
- **옮겨 쓸 것 (버리지 말기):**
  - `seo.html`, `structured-data.html`, `_layouts/redirect.html`
  - `comments-providers/giscus.html` (키 이름 고쳐서), GA include
  - lunr 검색 데이터(`lunr-store.js`)
  - 코드 복사 로직(`_main.js` 147줄 근처)
- **그대로 가는 것:** URL(`permalink`, `redirect_from`), 글 front matter(예외: 시리즈용 `series:` 한 줄 추가, `01-references.md` 1-9), 플러그인 5개(sitemap, feed, redirect-from, gist, include-cache. paginate는 3단계에서 뺌, C13), giscus `pathname` 매핑
- **JS:** jQuery 묶음(`main.min.js` 121KB) 대신 필요한 기능만 작은 JS로: TOC 강조, 코드 복사, 검색 (모바일 햄버거 메뉴는 3단계에서 없앰, `01-references.md` 1-7)
- **Gemfile:** 테마 gemspec 없이 `Gemfile`에 플러그인을 직접 적음. 1단계의 json 충돌도 gemspec 첫 줄 `require "json"`에서 생긴 것
- **Sass:** 테마 Sass(susy·breakpoint)와 지금 `main.scss`를 빼면 deprecation 경고 248건(E01, E02)도 같이 사라짐

주의할 점:
- **테마 파일은 마지막에 한꺼번에 지우기:** 새 레이아웃이 다 대체한 뒤에. 그 전까지는 새 레이아웃과 옛 레이아웃이 같이 있어도 됨.
- **URL은 한 글자도 바꾸지 않기:** giscus가 `pathname`으로 댓글을 찾음. 예외는 `/page2/`·`/page3/` 하나뿐(C13, 일부러 없앰).
- **위험은 URL·SEO 메타·댓글 매핑이 바뀌는 것:** 11단계의 URL 비교, GA·giscus 확인으로 잡음.

## 결정해야 할 항목

- [x] **베이스:** A안(MM 위에서 수정) / B안(Jekyll 유지 + 새로 작성). 추천 B.
  - 결정: B안
- [x] **giscus 고치는 시점:** 지금 main에 바로(`_config.yml` 키 이름만 고치면 됨) / 개편 배포 때 같이. 추천은 지금 바로. 지금 사이트에서 첫 댓글을 못 다는 상태로 추정돼서(E11).
  - 결정: 개편 배포 때 같이(추천과 다름). 이유: 작업을 개편 배포 한 번에 묶고, main은 그 전까지 안 건드림
- [x] **giscus 언어·입력창 위치:** 설정에 적어 둔 의도대로 한국어(`ko`)·아래(`bottom`)로 갈지.
  - 결정: 한국어(`ko`)·아래(`bottom`)
- [x] **C07 홈 프로필 사이드바:** 유지 / 삭제.
  - 결정: 삭제. 프로필은 홈 맨 위 가운데에 짧게 + 글 끝 작성자 카드(3단계에서 정함)
- [x] **C08 사이드바 카테고리 목록:** 삭제(추천) / 모든 화면에서 보이게 고침.
  - 결정: 삭제. C07과 같이 사이드바가 없어짐(3단계에서 정함)
- [x] **C09 태블릿·모바일 TOC:** 접었다 펴는 식으로 넣기 / 지금처럼 숨김.
  - 결정: 숨김(1400px 이하). 처음엔 1024px 미만이었는데 3단계에서 kciter처럼 1401px 이상만 보이게 바꿈. E09는 안 고침
- [x] **C14 외부 링크 새 탭:** `rel`을 지우지 않게 고침(추천) / 새 탭 기능 삭제.
  - 결정: `rel`을 지우지 않게 고침
- [x] **C05 서체:** Toss Product Sans 빼기(추천). 대체 서체는 3단계 레퍼런스 분석에서.
  - 결정: Toss Product Sans 빼기
- [x] **공유 버튼:** 유지 / 삭제.
  - 결정: 삭제(3단계에서 정함)
- [x] **관련 글("참고"):** 같은 카테고리·태그 글로 고침 / 삭제.
  - 결정: 고침. 같은 카테고리 글 최대 4개, 같은 시리즈 글은 빼고, 남는 게 없으면 숨김(3단계에서 정함)
- [x] **날짜 표기:** 한국어로 바꿀지, 바꾼다면 형식(예: `2025년 12월 23일`, `2025.12.23`).
  - 결정: `2025.12.23`(`%Y.%m.%d`) 한 가지로 모든 화면(3단계에서 정함)
- [x] **404 페이지:** 블로그 화면으로 만들기 / 그대로.
  - 결정: 블로그 화면으로 만들기
- [x] **글 본문 h1(E18):** 7단계에 "글 내용은 그대로" 원칙이 있어서 셋 중 하나.
  1. 글은 두고 레이아웃에서 제목 단계를 맞추기
  2. 글 25개의 `#`을 `##`로 고치기(글 수정)
  3. 그대로 두기
  - 결정: 2(글 25개의 `#`을 `##`로). 7단계 "글 내용은 그대로" 원칙에서 이 항목은 예외(3단계에서 시리즈 `series:` 추가도 예외로 정함). 코드 블록 안의 `# ` 주석(`git-ranker-i18n` 글에 4줄)은 건드리지 않기
- [x] **3절 표의 "결정" 칸 채우기:** 추천대로 갈 항목은 "추천대로"라고만 적어도 됨.
  - 결정: 채움. 따로 묻지 않은 항목은 추천대로
