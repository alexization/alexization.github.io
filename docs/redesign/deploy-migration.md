# 배포 방식 전환: GitHub Pages legacy → GitHub Actions + Jekyll 4

2026-10-08 진행. 개편 작업을 최신 엔진(Jekyll 4, Dart Sass) 위에서 하려고 디자인을 건드리기 전에 배포 방식부터 바꿈. 디자인과 글은 그대로 두고 빌드·배포 설정만 바꿈.

## 요약

- 배포가 GitHub Pages legacy 빌드(Jekyll 3.10, Ruby Sass)에서 GitHub Actions(Jekyll 4.4.1, Dart Sass)로 바뀜.
- 전환 전 실제 사이트와 비교한 결과, 엔진 때문에 화면이나 CSS 규칙이 실제로 달라진 곳은 없음.
- 첫 Actions 배포 성공: https://github.com/alexization/alexization.github.io/actions/runs/37727918492
- 배포된 파일 67개 중 66개가 로컬 Jekyll 4 production 빌드와 바이트까지 같음. 나머지 1개(`feed.xml`)는 생성 시각만 다름.

## 바뀐 파일 (main)

| 파일 | 내용 |
|---|---|
| `.ruby-version` | `3.3.12` (redesign에 있던 것과 같음) |
| `Gemfile.lock` | 새로 만들어서 커밋 대상에 넣음. 로컬과 Actions가 같은 gem 버전으로 빌드하게 하려고 |
| `.gitignore` | `Gemfile.lock` 줄 삭제 |
| `_config.yml` | `sass:`에 `sourcemap: never` 추가. 예전 배포에도 `main.css.map`이 없었음 |
| `.github/workflows/jekyll.yml` | GitHub 공식 Jekyll Pages starter 기준 workflow |

redesign 브랜치에서는 main을 합친 뒤 `Gemfile`의 `gem "github-pages"` 줄을 뺌. 이제 `Gemfile`과 `Gemfile.lock`이 main과 똑같음.

## 버전

| 항목 | 버전 |
|---|---|
| Ruby | 3.3.12 (로컬 rbenv, Actions 둘 다) |
| Bundler | 2.5.22 |
| jekyll | 4.4.1 |
| jekyll-sass-converter | 3.1.0 |
| sass-embedded (Dart Sass) | 1.105.1 |
| Rouge | 3 → 4 |

workflow의 action (작성 시점 최신 major):

| action | 버전 |
|---|---|
| `actions/checkout` | v7 |
| `ruby/setup-ruby` | v1 (`.ruby-version`을 읽음, `bundler-cache: true`) |
| `actions/configure-pages` | v6 |
| `actions/upload-pages-artifact` | v5 (v4부터 dotfile을 빼지만, 이 사이트엔 dotfile이 없음) |
| `actions/deploy-pages` | v5 |

workflow는 main push와 수동 실행(`workflow_dispatch`)에서 돌아감. 빌드 단계에 `JEKYLL_ENV: production`이 꼭 있어야 함. 빠지면 Google Analytics(`_includes/analytics.html`)와 댓글(`_layouts/single.html`)이 에러 없이 조용히 사라짐.

## 진행 중 생긴 문제와 처리

### 로컬 `bundle exec`의 json 충돌
- 증상: `You have already activated json 3.0.2, but your Gemfile requires json 2.21.2.`
- 원인:
  - `minimal-mistakes-jekyll.gemspec` 첫 줄의 `require "json"` 때문에 bundler가 버전을 맞추기 전에 json이 먼저 올라옴.
  - 이때 컴퓨터 전체에 깔려 있던 json 3.0.2가 잡힘 (github-pages 설치 때 같이 깔린 것).
  - 그런데 Jekyll 4.4.1은 json 2.x만 받아서 lock에는 2.21.2가 적혀 있음.
- 처리: 로컬도 Actions처럼 프로젝트 폴더에 gem을 설치하게 바꿈.
  - `bundle config set --local path vendor/bundle`
  - 설정은 `.bundle/config`에 저장되고, git이 무시하는 파일이라 커밋 안 됨.
  - `vendor/bundle`은 git과 Jekyll 둘 다 무시함.
- Actions는 원래 프로젝트 폴더에만 설치하니까 이 문제가 없음.

### lock의 플랫폼
- Bundler 2.5.22가 lock을 처음 만들 때부터 `x86_64-linux-gnu`, `arm64-darwin` 등 여러 플랫폼을 넣어줌.
- `bundle lock --add-platform x86_64-linux`로 `x86_64-linux`를 하나 더 넣음.
- `sass-embedded`, `google-protobuf`, `ffi`의 리눅스용 gem이 lock에 들어 있음.

## 비교 검증 (전환 전 실제 사이트 vs 로컬 Jekyll 4 production 빌드)

### URL
- 실제 사이트 68개, Jekyll 4 빌드 67개.
- 없어진 파일은 `assets/css/style.css` 하나. legacy 빌드가 기본 테마(primer)에서 덤으로 만들던 파일이고, 어디서도 안 씀.
- 새로 생긴 파일은 없음.
- 공백이 들어간 옛 주소(`git ranker/…`, `home lab/…`) 리다이렉트 페이지도 그대로 있음.

### HTML
- 46개 중 41개가 바이트까지 같음. GA, giscus 코드도 그대로 들어 있음.
- 다른 5개는 전부 Rouge 3→4 코드 하이라이트 class 차이고, 코드 글자는 같음.
  - `architecture/ddd-driven-multi-module-transition/`
  - `git-ranker/git-ranker-graphql/`
  - `git-ranker/git-ranker-spring-batch/`
  - `home-lab/home-lab-dns-ddns-nginx/`
  - `home-lab/home-lab-fail2ban/`
- `sitemap.xml`은 같음.
- `feed.xml`은 생성 시각, generator 버전(3.10.0 → 4.4.1), 본문 안의 Rouge 차이만 다름.
- 이미지, JS 등 나머지 정적 파일은 전부 바이트까지 같음.

### CSS (`assets/css/main.css`)
- 실제로 다른 규칙은 0개.
- 선택자 1052개로 양쪽 개수가 같고, 등장 순서도 같음.
- 801개는 완전히 같고, 251개는 표기만 다름.

표기 차이 종류:

| 종류 | 예시 | 건수 |
|---|---|---|
| 숫자 앞 0 생략 | `0.5em` → `.5em` | 231 |
| 같은 색, 다른 표기 | `transparent` → `rgba(0,0,0,0)`, `#FFFFFF` → `#fff` | 111 |
| 따옴표·공백 | `content:''` → `content:""` | 15 |
| 1/255 색 반올림 | `#aaaeb0` → `rgb(66.53%,67.94%,69%)` | 12 |
| `clamp()` 안 `calc()` 생략 | `clamp(a, calc(b + c), d)` → `clamp(a,b + c,d)` | 5 |
| 문자열 이스케이프 | `"\2014"` → `"—"` | 3 |

- 이것 말고도 Dart Sass는 몇 가지를 다르게 출력함:
  - 파일 맨 앞에 BOM을 붙임 (`@charset` 대신).
  - 속성 선택자 따옴표를 뺌 (`[type="button"]` → `[type=button]`).
  - 14개 선택자는 `X{a} X::after{…} X{b}`처럼 규칙을 둘로 나눠 씀 (clearfix mixin 뒤의 선언). `::after`는 다른 요소라 적용 결과는 같음.
- 비교 스크립트가 너무 관대하지 않은지도 확인함. 일부러 값 3개를 바꾼 CSS로 돌려서 3개를 모두 잡아내는 걸 봄.

### 화면
- 대상: 홈과 `home-lab/home-lab-www-non-www/` (코드·표·imgur 이미지 있는 글), 데스크톱 1440px · 모바일 390px.
- 결과:
  - 데스크톱: 홈은 전환 전과 픽셀까지 같음. 글은 오른쪽 끝 3px 폭 줄에서 21픽셀만 다름 (가장자리 안티앨리어싱).
  - 모바일: 홈과 글 둘 다 전환 전과 픽셀까지 같음. 글 맨 아래 giscus 댓글 창도 정상으로 그려짐.
- 로컬 Jekyll 4 서버로 찍은 홈 데스크톱에서는 태그 칩·썸네일 모서리 92픽셀이 달랐음. 로컬끼리 두 번 찍어도 같은 자리가 흔들려서 렌더링 잡음으로 봄.

## 배포 후 확인

- Actions run 성공: build 36초, deploy 11초.
  - Actions 쪽도 Ruby 3.3.12, jekyll 4.4.1, gem 51개로 로컬과 같음.
  - 경고는 아래 Sass `@import` 2개뿐.
- 실제 사이트에서 `assets/css/style.css`, `assets/css/main.css.map`은 404 (예상대로).
- 페이지 소스 확인:
  - 홈과 글 모두 GA(`googletagmanager.com/gtag/js?id=G-10V81WVWWM`)가 있음.
  - 글 페이지에 giscus(`giscus.app/client.js`)가 있음. 홈에는 원래 없음.
- Actions annotation: `ubuntu-latest`가 2026-10-19부터 Ubuntu 26으로 바뀐다는 안내가 있음. 지금은 할 일 없음.

## Sass deprecation 경고 (아직 안 고침)

평소 빌드에서는 `assets/css/main.scss` 25·26번 줄의 `@import` 경고 2개만 보임. `_config.yml`의 `quiet_deps: true`가 `_sass` 안 파일의 경고를 숨기기 때문. 숨김을 풀고 빌드하면 248건이 나옴 (출력 CSS는 똑같음).

| 종류 | 건수 | 주로 나오는 곳 |
|---|---|---|
| `global-builtin` | 165 | `_sass/minimal-mistakes/vendor/susy`, `vendor/breakpoint` |
| `import` | 54 | `_sass/minimal-mistakes.scss`, vendor, `assets/css/main.scss` |
| `if-function` | 20 | `vendor/susy`, `_mixins.scss` |
| `slash-div` | 6 | `vendor/susy`, `vendor/magnific-popup`, `vendor/breakpoint`, `_forms.scss`, `_mixins.scss` |
| `color-functions` | 3 | `_mixins.scss`의 `red()`, `green()`, `blue()` |

빌드 중에 `faraday-retry` gem 설치 안내도 한 줄 나옴 (jekyll-gist가 쓰는 octokit 쪽). 빌드에는 영향 없음.

## 앞으로 로컬에서 작업하는 법

```sh
bundle install                    # gem은 vendor/bundle에 설치됨 (.bundle/config)
bundle exec jekyll serve          # http://localhost:4000
JEKYLL_ENV=production bundle exec jekyll build   # 배포와 같은 조건으로 빌드
```

- 브라우저는 `127.0.0.1` 말고 `localhost:4000`으로 열기. imgur가 `127.0.0.1`에서 온 이미지 요청을 403으로 막음.
- 개발 모드(`jekyll serve`)에서는 GA와 giscus가 안 들어감 (정상).
- 모바일 스크린샷 팁: headless Chrome은 창 폭이 최소 500px이라 `--window-size=390,…`로 찍으면 500px 화면이 잘려서 나옴. 390px로 찍으려면 DevTools 프로토콜의 `Emulation.setDeviceMetricsOverride`(`mobile: true`)를 써야 함.

## 되돌리는 방법

1. GitHub 레포 → Settings → Pages → Source를 "Deploy from a branch"(main, `/`)로 다시 바꿈.
2. 그러면 legacy 빌드가 다시 main을 빌드함. 이번에 추가한 파일들(`.github/workflows`, `Gemfile.lock` 등)은 legacy 빌드가 쓰지 않음.

확인한 것:
- github-pages gem(Jekyll 3.10)으로 지금 설정 그대로 production 빌드를 따로 돌려봄.
- 에러 없이 끝났고, `main.css`가 전환 전 실제 사이트와 바이트까지 같았음.
- 그래서 `sourcemap: never`가 추가돼 있어도 되돌리는 데 문제없음.
