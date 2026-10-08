# 블로그 개편 단계별 프롬프트

## 사용법

- 단계마다 새 세션(`/clear`)에서 복붙해서 시작
- 이전 단계 결과는 `docs/redesign/` 안의 파일로 넘겨받음
- `{ }` 부분만 채워서 사용
- 단계 끝날 때마다 커밋

---

## 0. 준비

```
블로그 전면 개편을 시작하려고 해. 디자인이나 기능 코드는 건드리지 말고, 작업 환경만 준비해줘.

1. main에서 `redesign` 브랜치를 새로 만들어.
2. `bundle exec jekyll serve`로 로컬에서 사이트를 띄울 수 있게 Ruby/Jekyll 환경을 맞춰줘.
   - 지금 맥에는 시스템 Ruby만 있고 jekyll은 없어.
   - 뭘 설치할지 먼저 알려주고, 내가 확인한 다음에 설치해.
3. `_config.yml`의 `exclude`에 `PRODUCT.md`, `DESIGN.md`, `docs/redesign`을 추가해. 배포 사이트에 노출되면 안 돼.
4. `docs/redesign/` 폴더를 만들어.

완료 기준: http://localhost:4000 에서 홈과 글 페이지 하나가 정상으로 보일 것. 빌드할 때 나온 경고와 에러도 목록으로 보고해줘.
```

## 1. 배포 방식 전환 (GitHub Actions + Jekyll 4)

```
블로그 배포를 GitHub Pages legacy 빌드(Jekyll 3.10, Ruby Sass)에서 GitHub Actions + Jekyll 4(Dart Sass)로 바꾸려고 해. 개편 작업을 최신 엔진 위에서 하려고 디자인보다 먼저 하는 거야. 디자인과 글은 건드리지 말고 빌드·배포 설정만 바꿔.

현재 상태:
- Pages 설정: Deploy from a branch (main, `/`). 레포에 `.github/workflows/`는 없음.
- main: `Gemfile`은 `source`와 `gemspec`만 있음. `.ruby-version` 없음. `Gemfile.lock`은 `.gitignore`에 들어 있음.
- `redesign` 브랜치: `.ruby-version`(3.3.12)이 있고, 로컬을 legacy 빌드에 맞추려고 `Gemfile`에 `gem "github-pages", group: :jekyll_plugins`를 넣어둠.
- Ruby는 rbenv로 3.3.12가 깔려 있음. 전역 버전은 시스템 Ruby 2.6이라서, `.ruby-version`이 없는 곳에서는 2.6이 잡혀.

main에서 `deploy-actions` 브랜치를 따서 작업해.

1. `.ruby-version`부터 추가해. `redesign`에 있는 것과 같은 3.3.12로.
2. 작업 폴더에 남아 있는 `Gemfile.lock`(github-pages용)은 지우고 `bundle install`로 새로 만들어. 그대로 두면 bundler가 Jekyll 3.10을 계속 붙잡고 있을 수 있어. → `bundle exec jekyll -v`가 4.4.x인지 확인해.
3. `Gemfile.lock`을 `.gitignore`에서 빼서 커밋 대상에 넣어. 그래야 로컬과 Actions가 같은 gem 버전으로 빌드해.
   - `bundle lock --add-platform x86_64-linux`로 리눅스 플랫폼도 추가해. Actions 서버는 리눅스라서, 이게 없으면 Sass 엔진(`sass-embedded`) 같은 OS별 gem 설치가 실패할 수 있어.
4. `_config.yml`에서 Sass sourcemap을 꺼. 지금 배포에는 `main.css.map`이 없어.
5. `.github/workflows/`에 GitHub 공식 Jekyll Pages workflow를 기준으로 작성해.
   - 실행 조건: main push + 수동 실행(workflow_dispatch)
   - Ruby 버전은 `.ruby-version`을 따르고, bundler 캐시를 써.
   - 빌드할 때 `JEKYLL_ENV=production` 필수. 빠지면 Google Analytics와 댓글이 에러 없이 조용히 사라져 (`_includes/analytics.html`, `_layouts/single.html`이 production일 때만 넣음).
   - action 버전은 작성 시점의 최신 major로 써. 쓰기 전에 확인해.
6. 비교 검증: 로컬에서 `JEKYLL_ENV=production`으로 빌드한 결과를, 지금 실제 사이트(https://alexization.github.io)에서 받은 파일과 비교해. 디자인이 아직 그대로라서, 차이가 있으면 전부 엔진 때문이야.
   - URL: 없어지거나 새로 생긴 파일. legacy 빌드가 덤으로 만들던 `assets/css/style.css`는 어디서도 안 쓰니까 사라져도 돼.
   - HTML: 바이트까지 같은 파일 수, 그리고 다른 파일은 뭐가 다른지. 코드 하이라이트 class 차이는 Rouge 버전(3→4) 차이라 예상된 거야.
   - CSS: `transparent`↔`rgba(0, 0, 0, 0)`, `white`↔`#fff`, 1/255 색 반올림 같은 표기 차이는 빼고, 실제로 다른 규칙만 보고해.
   - 화면: 로컬 Jekyll 4 서버와 실제 사이트에서 홈과 글 페이지 하나를 데스크톱·모바일 스크린샷으로 나란히 비교해. 로컬은 `127.0.0.1` 말고 `localhost:4000`으로 열어. imgur가 `127.0.0.1`에서 온 이미지 요청을 403으로 막아.
   - Sass deprecation 경고는 목록만 보고하고, 이번 단계에서 고치지 마.
7. 결과를 대화로 보고하고, Pages 설정을 바꾸기 직전에 멈춰.

내가 "Pages 설정 바꿨어"라고 하면 이어서:
8. main에 합치고 push해. push 전에 내 확인을 받아.
9. Actions 실행이 성공하는지 `gh`로 확인하고, 실제 사이트에서 홈과 글 페이지를 데스크톱·모바일로 확인해. 페이지 소스에 GA 스크립트와 giscus가 살아 있는지도 확인해.
10. `redesign` 브랜치에 main을 합쳐.
    - 합친 뒤 `Gemfile`에서 `github-pages` 줄을 빼고 `bundle install`을 다시 해.
    - 추적 안 되는 `Gemfile.lock` 때문에 merge가 막히면, 그 파일을 지우고 다시 합쳐.
    - `bundle exec jekyll serve`로 띄워서 홈과 글 페이지가 정상인지 확인해.
11. 결과를 `docs/redesign/deploy-migration.md`에 정리해서 `redesign` 브랜치에 커밋해.

문제가 생기면 고치려 들지 말고 멈춰서 알려줘. 되돌리는 방법은 Pages Source를 "Deploy from a branch"(main, `/`)로 다시 바꾸는 거야.
```

> 네 할 일: 7번에서 멈추면 결과 확인 → GitHub 레포 Settings → Pages → Source를 "GitHub Actions"로 변경 → "Pages 설정 바꿨어"라고 말하기. workflow를 main에 올리기 전에 Source부터 바꿔야 첫 배포가 꼬이지 않아.

> 디자인보다 먼저 하는 이유: 디자인이 그대로일 때 바꿔야 실제 사이트와 바이트 단위로 비교해서 엔진 때문에 생긴 차이만 골라낼 수 있음. 이후 단계는 전부 최신 엔진(Dart Sass) 위에서 작업하게 됨.

## 2. 현황 정리

```
이 블로그는 Jekyll + Minimal Mistakes 테마(레포에 직접 포함)로 만들었어. 예전에 커스텀을 많이 했는데 오류가 많고 디자인도 마음에 안 들어서 전면 개편하려고 해. 개편 전에 현황부터 정리해줘. 코드는 수정하지 마.

1. 커스텀 목록: 원본 Minimal Mistakes 4.27.3과 비교해서 내가 추가하거나 수정한 기능, 스타일, 레이아웃을 찾아줘. git log도 참고해.
2. 오류 목록: 사이트를 실제로 띄워서 확인해줘.
   - 빌드 경고/에러, 브라우저 콘솔 에러
   - 데스크톱·모바일에서 깨지는 레이아웃
   - 동작하지 않는 기능
   각 오류마다 재현 방법과 추정 원인을 같이 적어.
3. 커스텀 기능마다 유지 / 고침 / 삭제 중 뭘 추천하는지와 그 이유.
4. 베이스 결정: "Minimal Mistakes 위에서 계속 수정"과 "Jekyll은 유지하고 레이아웃·스타일을 새로 작성", 두 안의 장단점을 이 레포 상황에 맞춰 비교하고 하나를 추천해줘.

결과는 `docs/redesign/00-inventory.md`에 표로 정리하고, 맨 끝에 내가 결정해야 할 항목만 따로 모아줘.
```

> 네 할 일: 결과를 보고 기능마다 유지/고침/삭제를 정하고, 베이스도 정하기. 정한 내용은 파일에 직접 적거나 AI한테 반영해 달라고 하기.

## 3. 레퍼런스 분석

```
내가 지향하는 테크 블로그들을 분석해서 디자인 기준을 잡고 싶어. Chrome으로 각 사이트를 직접 열어서 분석해줘. 코드는 수정하지 마.

레퍼런스:
- {URL 1}: 좋은 점 {예: 코드블록이 읽기 편함}
- {URL 2}: 좋은 점 {...}
- {URL 3}: 좋은 점 {...}

지금 내 블로그에서 싫은 점: {예: 글자가 작고 답답함, 색이 촌스러움}

각 사이트의 글 상세 페이지와 글 목록 페이지를 보고:
1. 데스크톱(1440px)·모바일(390px) 스크린샷을 `docs/redesign/references/`에 저장해.
2. 실제 CSS 값을 getComputedStyle로 뽑아줘.
   - 본문: 폰트, 크기, 줄간격, 자간, 최대 폭
   - 제목: 단계별 크기와 굵기
   - 색: 본문, 배경, 링크, 강조
   - 코드블록: 폰트, 배경, 하이라이트 테마 / 인라인 코드
   - 표, 인용문, 이미지 캡션
3. 구조와 기능도 정리해줘.
   - 목차(위치, 스크롤 따라오는지), 헤더/네비게이션, 다크모드
   - 이전/다음 글이나 시리즈, 태그/카테고리, 검색, 댓글, 읽기 시간

`docs/redesign/01-references.md`에 이렇게 정리해:
- 항목별 비교표 (행 = 항목, 열 = 각 사이트 + 지금 내 블로그)
- 공통 패턴 / 사이트별 강점 / 피해야 할 점
- 항목마다 "결정: 고정 / 참고 / 버림" 빈 열 (내가 채울 거야)
- 기업 전용 폰트처럼 라이선스 때문에 그대로 못 쓰는 건 표시하고, 무료 대안을 제시
```

> 네 할 일: 표의 결정 열 채우기.

## 4. 디자인 기준 확정

```
`docs/redesign/01-references.md`의 결정 열을 다 채웠어. 이걸 바탕으로 `docs/redesign/02-brief.md`를 만들어줘.

- 고정: 측정할 수 있는 규칙으로 적어. (예: "본문 17px, 줄간격 1.8, 최대 폭 720px")
- 참고: 원리나 느낌으로 적어. (예: "본문 색은 순검정 대신 따뜻한 진회색")
- 버림: 피할 것 목록으로 적어.
- `00-inventory.md`에서 유지/고침으로 정한 기능 목록과 베이스 결정도 같이 넣어.

"고정"이 아닌 항목에서는 레퍼런스 사이트의 고유한 값(색 코드 등)을 그대로 가져오지 마. 내 결정끼리 충돌하거나 애매한 부분이 있으면 먼저 질문해.
```

## 5. 블로그 정보 정리 (init)

```
/impeccable init

참고 문서:
- `docs/redesign/00-inventory.md`: 현황, 유지할 기능, 베이스 결정
- `docs/redesign/02-brief.md`: 레퍼런스 분석으로 내가 확정한 디자인 기준

`02-brief.md`의 "고정"과 "버림" 항목은 내가 명시적으로 확정한 기준이니까 PRODUCT.md의 Brand Commitments에 기록해줘. "참고" 항목은 확정된 게 아니니까 PRODUCT.md에 넣지 마. 디자인 단계에서 쓸 거야.
```

## 6. (선택) 개편 전 진단

```
/impeccable critique 글 상세 페이지 ({코드·표·이미지가 많은 대표 글의 로컬 URL})
```

> 개편 후에 같은 명령을 한 번 더 돌리면 전후 비교 가능.

## 7. 글 상세 페이지 개편

```
/impeccable 블로그 글 상세 페이지를 리디자인해줘. 기존 디자인을 다듬는 게 아니라 통째로 교체하는 전면 개편이야.

기준 문서:
- `docs/redesign/02-brief.md`: "고정"은 반드시 지킬 조건, "참고"는 방향 힌트, "버림"은 피할 것
- `docs/redesign/00-inventory.md`: 베이스 결정, 그리고 글 페이지에서 유지하기로 한 기능

지킬 것:
- 글 내용, front matter, URL 구조, SEO 메타 태그는 그대로 둬.
- 유지하기로 한 기능(댓글, 코드 복사 버튼 등)은 새 디자인에 맞춰 다시 붙여.
- 디자인 방향 후보를 고를 때, 모든 후보에 "고정" 항목이 들어가 있어야 해.

확인 방법:
- `bundle exec jekyll serve`로 띄워서 데스크톱·모바일 스크린샷으로 확인해.
- 확인용 글은 두 개: 코드·표·이미지가 많은 글 {파일 경로}, 짧은 글 {파일 경로}
```

> 방향 선택 화면에서 레퍼런스에 가깝게 가고 싶으면 "canon"(업계 표준) 카드 선택. 기준으로 삼을 블로그를 물어보면 레퍼런스 블로그 이름을 대기. 이 단계가 끝나면 `DESIGN.md`(디자인 가이드)가 생김.

## 8. 나머지 페이지 (페이지마다 반복)

```
/impeccable {홈(글 목록) / 카테고리·태그 아카이브 / about} 페이지를 개편해줘.

- 디자인은 DESIGN.md를 그대로 따라. 새 색, 폰트, 컴포넌트가 필요하면 만들기 전에 먼저 물어봐.
- `docs/redesign/02-brief.md`의 "고정" 항목은 지켜.
- `docs/redesign/00-inventory.md`에서 이 페이지에 해당하는 유지/고침 기능({기능명})은 새 디자인 위에 다시 구현해.
- 데스크톱·모바일 스크린샷으로 확인해.
```

## 9. 남은 기능 버그

```
`docs/redesign/00-inventory.md`의 "고침" 항목 중 아직 남은 기능 버그를 고쳐줘.

- 한 번에 하나씩: 재현 → 원인 확인 → 수정 → 다시 재현해서 고쳐졌는지 확인
- 화면이 바뀌는 수정은 DESIGN.md 범위 안에서만 해.
- 다 고친 항목은 inventory 파일에 완료 표시를 해줘.
```

## 10. 마무리 (하나씩 따로 실행)

```
/impeccable harden 블로그 전체. 긴 제목, 가로로 긴 코드 줄, 넓은 표, 큰 이미지, 썸네일 없는 글, 태그가 많은 글, 한글·영문이 섞인 긴 단어의 줄바꿈을 점검해줘.
```

```
/impeccable audit 블로그 전체. 접근성(색 대비, 키보드 조작, 스크린리더), 반응형, 다크모드(있다면)를 점검해줘.
```

```
/impeccable optimize 블로그 전체. 특히 한글 웹폰트 용량(서브셋, 나눠서 로딩), 이미지, 첫 화면 로딩 속도를 봐줘.
```

```
/impeccable polish 블로그 전체. 배포 전 마지막 점검이야. DESIGN.md와 어긋난 곳을 정리해줘.
```

## 11. 개편 배포

```
`redesign` 브랜치의 개편 결과를 main에 합쳐서 배포하려고 해. 배포는 1단계에서 바꾼 GitHub Actions(Jekyll 4)로 돼.

1. 배포 전 점검
   - `JEKYLL_ENV=production bundle exec jekyll build`가 에러 없이 끝나는지 확인해. 경고는 목록으로 보고해.
   - `_site`에 `PRODUCT.md`, `DESIGN.md`, `docs/redesign` 결과물이 없는지 확인해.
   - production 빌드에 Google Analytics 스크립트와 giscus 댓글이 들어 있는지 확인해.
   - main 빌드와 비교해서 기존 URL 중 없어진 게 없는지 확인해. URL이 바뀌면 댓글(giscus, pathname 매핑)이 글에서 떨어져 나가.
2. `redesign`을 main에 합쳐. push하기 전에 합친 결과(커밋 목록, 바뀐 파일 수)를 보여주고 내 확인을 받아.
3. push 후 Actions 배포 실행이 성공하는지 `gh`로 확인해.
4. 실제 사이트(https://alexization.github.io)에서 홈과 글 페이지 2개({코드·표·이미지가 많은 글 URL}, {댓글이 달린 글 URL})를 데스크톱·모바일 스크린샷으로 확인해. 기존 댓글이 그대로 붙어 있는지도 봐.

문제가 생기면 고치려 들지 말고 멈춰서 알려줘. 되돌리는 방법(merge 커밋 revert)도 같이 제안해줘.
```
