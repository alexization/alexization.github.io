---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/LcsQMUX.png"

title: "[Git Ranker #8] GitHub README 배지가 늦게 갱신되던 이유: Camo 프록시와 Cache-Control 설계"
excerpt: "배지 API는 최신 SVG를 반환하는데 GitHub README는 이전 점수에 머물렀다. 원인은 SVG 렌더링이 아니라 GitHub 프록시 앞에서 비어 있던 캐시 계약이었고, Git Ranker는 `Cache-Control: max-age=3600, must-revalidate`로 지연과 부하의 경계를 다시 설계했다."

categories:
  - Git Ranker

tags:
  - GitHub Camo
  - HTTP Cache
  - Cache-Control

toc_label: "배지 캐싱 해결기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-badge-caching/
redirect_from:
  - /git ranker/git-ranker-badge-caching/
date: 2025-12-20
last_modified_at: 2026-03-30
---

![Git Ranker Master 티어](https://i.imgur.com/LcsQMUX.png)

Git Ranker는 사용자의 **티어, 점수, 순위 요약**을 SVG 배지로 만들어 GitHub 프로필 `README.md`에 붙일 수 있게 합니다. 사용자는 배지 URL을 한 번만 넣어두고, 이후에는 점수가 바뀌면 배지도 자연스럽게 최신 상태로 따라오길 기대합니다.

문제는 실제 운영에서 이 기대가 자주 깨졌다는 점이었습니다. **매일 자정 배치**나 **수동 갱신 API**로 점수가 바뀐 뒤에도 GitHub README에 보이는 배지는 한동안 예전 점수에 머물렀습니다. 반면 같은 URL을 브라우저에서 직접 열면 최신 SVG가 정상적으로 내려왔습니다.

즉, 이 문제는 **SVG 생성 로직의 버그**가 아니라 **원본 서버와 GitHub 프록시 사이의 캐시 계약이 비어 있던 문제**였습니다. 이번 글에서는 현재 `git-ranker` 저장소 기준으로 이 현상을 어떻게 해석했고, 왜 `PURGE`나 쿼리스트링 꼼수 대신 `Cache-Control` 헤더를 선택했는지 정리합니다.

<aside>
<strong>이 글에서 집중하는 내용</strong><br>
이 글은 "배지가 안 바뀐다"는 현상을 증상 수준에서 끝내지 않습니다. <strong>GitHub README가 외부 이미지를 어떤 경로로 가져오는지</strong>, <strong>동적 SVG 응답에 왜 캐시 정책이 필요했는지</strong>, <strong>Git Ranker가 왜 <code>no-cache</code> 대신 <code>max-age=3600, must-revalidate</code>를 택했는지</strong>까지 설명합니다.
</aside>

# 1. 원본 서버는 최신 SVG를 만들고 있었는데 README만 과거 값을 보여줬다

처음에는 배지 생성 로직을 의심했습니다. 하지만 현재 저장소의 `BadgeService.generateBadge(nodeId)`는 `nodeId`로 사용자를 찾고, 가장 최근 활동 로그를 붙여 즉시 SVG를 렌더링하는 구조입니다.

```java
@Transactional(readOnly = true)
public String generateBadge(String nodeId) {
    User user = userRepository.findByNodeId(nodeId)
            .orElseThrow(() -> new BusinessException(ErrorType.USER_NOT_FOUND));

    ActivityLog activityLog = Optional.ofNullable(
            activityLogRepository.getTopByUserOrderByActivityDateDesc(user)
    ).orElseGet(() -> ActivityLog.empty(user, LocalDate.now()));

    return svgBadgeRenderer.render(user, user.getTier(), activityLog);
}
```

실제로 관찰된 결과도 일관됐습니다.

- 배지 API를 직접 호출하면 **최신 점수와 티어**가 반영됐습니다.
- GitHub README에 붙은 같은 배지는 **이전 값**을 계속 보여줬습니다.

질문은 결국 하나로 모였습니다.

> **"내 서버는 맞게 응답하고 있는데, 사용자는 왜 다른 이미지를 보고 있지?"**

답은 GitHub README가 외부 이미지를 **원본 URL 그대로 보여주지 않는다**는 데 있었습니다. GitHub는 외부 이미지를 프록시하고, 사용자가 보는 최종 결과는 그 프록시 계층을 한 번 거친 응답입니다.

이 지점에서 `nodeId` 기반 URL 설계도 함께 의미를 가집니다. Git Ranker 배지는 `/api/v1/badges/{nodeId}` 형태인데, 이는 GitHub 사용자명이 바뀌어도 배지 URL이 흔들리지 않게 하려는 선택입니다. **URL을 안정적으로 유지한다는 장점**은 분명하지만, 반대로 말하면 **같은 URL에 대해 캐시 정책을 제대로 설계하지 않으면 오래된 결과도 계속 같은 URL로 남는다**는 뜻이기도 했습니다.

# 2. 문제는 Camo 그 자체보다 응답 헤더에 있었다

GitHub는 이미지 URL을 익명화하고 프록시하는 경로를 사용합니다. GitHub 공식 문서와 블로그는 GitHub가 이미지 프록시 계층에 **Camo**를 사용해 왔다고 설명합니다. 중요한 것은 "GitHub가 프록시한다"는 사실 자체보다, **그 프록시가 원본 서버의 캐시 지시를 보고 재사용 여부를 판단한다**는 점입니다.

초기 `BadgeController`는 사실상 아래와 같은 응답만 반환하고 있었습니다.

```java
@GetMapping(value = "/{nodeId}", produces = "image/svg+xml")
public ResponseEntity<String> getBadge(@PathVariable String nodeId) {
    String svgContent = badgeService.generateBadge(nodeId);

    return ResponseEntity.ok()
            .contentType(MediaType.valueOf("image/svg+xml"))
            .body(svgContent);
}
```

겉으로 보면 문제 없어 보입니다. `Content-Type`은 맞고, 본문도 정상 SVG입니다. 하지만 이 응답에는 **캐시 정책이 전혀 없습니다.**

여기서 핵심 이론이 두 가지 있습니다.

- **`Cache-Control`이 없다고 해서 자동으로 "캐시 금지"가 되는 것은 아닙니다.**
- **`no-cache`는 "저장 금지"가 아니라 "재사용 전에 원본과 다시 맞춰라"는 뜻입니다.**

MDN도 이 부분을 명확히 설명합니다. 동적으로 생성되거나 자주 바뀌는 콘텐츠라면, 캐시를 허용하든 금지하든 서버가 `Cache-Control`로 의도를 명시해야 합니다. 그렇지 않으면 캐시가 **휴리스틱하게 보관**해 버릴 수 있습니다.

> **`Cache-Control`을 생략하는 것은 "캐시하지 말라"는 선언이 아니라, 캐시 계층에게 판단을 넘겨버리는 것에 가깝다.**

GitHub 문서도 이미지가 바뀌었는데 반영되지 않는다면 원본 응답의 `Cache-Control`을 확인하라고 안내합니다. 저는 이 문서를 보고 문제를 역으로 이해했습니다. **GitHub Camo의 내부 TTL을 완전히 아는 것보다, 내 서버가 캐시 계층에 어떤 계약을 주고 있었는지가 더 중요했습니다.**

<aside>
<strong>오해하기 쉬운 표현 정리</strong><br>
<code>no-cache</code>는 "캐시에 저장하지 마라"가 아닙니다. 저장은 가능하지만, <strong>재사용 전마다 원본 서버에 다시 확인</strong>하라는 뜻입니다. 반대로 <code>Cache-Control</code>을 아예 보내지 않으면, 캐시가 자체 정책으로 응답을 보관할 여지가 생깁니다.
</aside>

<aside>
<strong>이 글에서 단정하지 않는 것</strong><br>
GitHub Camo의 내부 캐시 TTL이나 세부 구현을 공개 자료만으로 단정할 수는 없습니다. 이 글이 저장소와 재현 결과를 바탕으로 확실히 말하는 지점은 하나입니다. <strong>배지 응답에 캐시 지시가 없었고, 그 상태에서는 GitHub README에서 최신 SVG 반영을 기대대로 보장할 수 없었다</strong>는 점입니다.
</aside>

# 3. 해결책은 캐시를 지우는 것이 아니라 캐시를 설계하는 일이었다

원인을 파악한 뒤 가능한 대응은 크게 세 가지였습니다.

| 접근 | 장점 | 채택하지 않은 이유 |
|:--|:--|:--|
| `PURGE` 요청으로 강제 무효화 | 눈앞의 오래된 캐시를 비울 수 있음 | 사용자별 프록시 URL 추적과 운영 자동화가 복잡해짐 |
| 쿼리 파라미터로 Cache Busting | 구현이 단순함 | 배지 URL을 계속 바꿔야 해서 "한 번 붙여두면 끝"이라는 제품 경험과 충돌 |
| 원본 응답에 `Cache-Control` 명시 | HTTP 표준에 맞고 URL을 안정적으로 유지 가능 | 허용 가능한 지연과 원본 부하 사이의 정책 결정을 직접 해야 함 |

`PURGE`는 본질적으로 **캐시 청소 작업**입니다. 문제를 해결한다기보다, 이미 쌓인 결과를 강제로 지우는 운영 도구에 가깝습니다. Git Ranker처럼 사용자 수가 늘고 배지 URL이 많아질수록 유지 비용이 커집니다.

쿼리스트링도 마찬가지였습니다.

```markdown
[![Git Ranker](https://www.git-ranker.com/api/v1/badges/{nodeId}?v=20251220)](https://www.git-ranker.com)
```

이 방식은 새 URL을 만들면 새 이미지를 읽는다는 점에서 단순합니다. 하지만 Git Ranker의 배지는 **사용자가 한 번 붙여두면 이후에는 손대지 않아도 되는 URL**이어야 합니다. 게다가 배지 경로가 `username`이 아니라 **불변 식별자인 `nodeId`** 를 쓰는 이유도 URL 안정성에 있습니다. 이런 설계 위에서 쿼리스트링 버저닝을 계속 붙이는 방식은 제품 의도와 맞지 않았습니다.

결국 가장 자연스러운 해결 위치는 **원본 서버의 응답 헤더**였습니다. URL은 그대로 유지하고, 프록시 계층에는 **"이 응답을 얼마나 오래 믿고 재사용해도 되는지"** 를 표준 방식으로 알려주는 편이 맞았습니다.

# 4. `max-age=3600, must-revalidate` 선택

현재 저장소의 `BadgeController`는 사용자별 배지 경로에서 아래 정책을 내려줍니다.

```java
@GetMapping(value = "/{nodeId}", produces = "image/svg+xml")
public ResponseEntity<String> getBadge(@PathVariable String nodeId) {
    String svgContent = badgeService.generateBadge(nodeId);

    CacheControl cacheControl = CacheControl.maxAge(1, TimeUnit.HOURS)
            .mustRevalidate();

    return ResponseEntity.ok()
            .contentType(MediaType.valueOf("image/svg+xml"))
            .cacheControl(cacheControl)
            .header("Pragma", "no-cache")
            .header("Expires", "0")
            .body(svgContent);
}
```

실제 중심 계약은 이 한 줄입니다.

```http
Cache-Control: max-age=3600, must-revalidate
```

이 정책의 의미는 분명합니다.

- `max-age=3600`: 캐시는 **최대 1시간 동안** 이 응답을 fresh 상태로 재사용할 수 있습니다.
- `must-revalidate`: 1시간이 지나 stale 상태가 되면, **원본 서버와 다시 확인한 뒤에만** 재사용해야 합니다.

즉, Git Ranker 배지는 "무조건 실시간인 이미지"가 아니라 **신선도 상한이 1시간으로 정의된 동적 리소스**가 됐습니다.

> **동적 리소스라고 해서 무조건 0초 지연이어야 하는 것은 아니다. 중요한 것은 서비스가 허용 가능한 낡음의 상한을 먼저 결정하는 일이다.**

여기서 `Pragma`와 `Expires`도 함께 내려가지만, 현재 설계에서 **실질적인 캐시 정책의 중심은 `Cache-Control`** 입니다. Git Ranker가 GitHub 프록시에 전달하고 싶은 핵심 메시지는 결국 이 한 줄에 담겨 있습니다.

# 5. 왜 `no-cache`가 아니라 1시간 캐시였을까

GitHub 문서가 권하는 안전한 기본값은 `Cache-Control: no-cache`입니다. 최신성이 가장 중요할 때 매우 좋은 선택입니다. 저장은 허용하더라도 재사용 전마다 원본 서버와 다시 맞춰 보게 만들 수 있기 때문입니다.

하지만 Git Ranker는 여기서 한 번 더 제품 관점의 판단이 필요했습니다. 현재 저장소 기준으로 점수 갱신 경로는 두 가지입니다.

- `BatchScheduler`: `0 0 0 * * *` 크론으로 **매일 자정**, `app.timezone` 기준으로 전체 점수를 다시 계산합니다. 현재 설정값은 `Asia/Seoul`입니다.
- `POST /api/v1/users/{username}/refresh`: 로그인한 사용자가 **본인 프로필만 수동 갱신**할 수 있습니다. `User.canTriggerFullScan()` 기준으로 **5분 쿨다운**도 걸려 있습니다.

즉, 배지는 분명 동적이지만 **초 단위로 계속 바뀌는 실시간 지표**는 아닙니다. Git Ranker에서 README 배지는 결제 금액이나 재고 수량 같은 트랜잭션성 데이터가 아니라, **공개 프로필용 요약 표현**에 더 가깝습니다. 진실의 원본은 사용자 프로필 API와 상세 페이지이고, 배지는 그 결과를 외부 플랫폼에 노출하는 뷰입니다.

이 기준에서 두 정책을 비교해 보면 차이가 더 분명해집니다.

| 정책 | 의미 | 장점 | 단점 |
|:--|:--|:--|:--|
| `no-cache` | 저장은 가능하지만 재사용 전마다 원본 재검증 | 최신 상태에 가장 가깝게 유지 가능 | README 조회가 많을수록 원본 서버 확인 요청이 계속 늘어남 |
| `max-age=3600, must-revalidate` | 1시간 동안 재사용 가능, 이후에는 원본 재검증 | 원본 서버 부하를 줄이면서 갱신 지연 상한을 명확히 설정 가능 | 수동 갱신 직후 README에는 최대 1시간 이전 값이 남을 수 있음 |

Git Ranker에서 더 중요했던 것은 두 번째였습니다.

- 새벽 배치 결과가 README에 **최대 1시간 늦게 보이는 것**은 허용 가능했습니다.
- 수동 갱신도 "즉시 거래 반영"이 아니라 **프로필 점수 보정**에 가까웠습니다.
- 대신 공개 프로필 README 조회가 많아졌을 때, 모든 요청이 원본 서버까지 도달하지 않도록 막고 싶었습니다.

<aside>
<strong>제품 기준으로 다시 해석하면</strong><br>
Git Ranker가 풀어야 했던 문제는 "항상 0초 최신성을 보장할 것인가"가 아니었습니다. 더 정확한 질문은 <strong>"README 배지가 얼마나 오래 낡아 있어도 괜찮은가"</strong> 였습니다. 여기서 나온 답이 1시간이었습니다.
</aside>

# 6. 구현은 동적 배지와 미리보기 배지를 다르게 취급했다

이 변화가 의미 있었던 이유는 단순히 헤더 한 줄이 추가됐기 때문이 아닙니다. **어떤 경로가 동적이고, 어떤 경로가 미리보기 템플릿인지 구분한 뒤, 동적 경로에만 계약을 붙였기 때문**입니다.

현재 `BadgeController`에는 두 개의 경로가 있습니다.

- `/{nodeId}`: 실제 사용자 상태를 반영하는 **동적 배지**
- `/{tier}/badge`: 티어 샘플을 보여주는 **고정 미리보기 배지**

현재 구현은 `/{nodeId}` 경로에만 `Cache-Control`을 추가합니다. 반면 `/{tier}/badge`는 단순 템플릿 SVG를 반환합니다. 즉, 이 설계는 **자주 바뀌는 응답**과 **거의 바뀌지 않는 응답**을 같은 방식으로 다루지 않습니다.

여기서 중요한 것은 "둘 다 SVG니까 같은 캐시 정책을 주면 되지 않을까?"라는 유혹을 피했다는 점입니다. Git Ranker에서 사용자 배지는 **사용자 상태가 반영되는 읽기 전용 API 응답**이고, 티어 미리보기 배지는 **샘플 자산에 가까운 응답**입니다. 둘의 변화 빈도와 사용 맥락이 다른데도 같은 캐시 계약을 주면, 오히려 리소스의 의미를 흐리게 만들 수 있습니다.

또 하나 눈에 띄는 부분은 `Cache-Control` 외에 `Pragma`, `Expires`도 함께 내려준다는 점입니다. 오늘날 캐시 의미를 결정하는 중심 헤더는 분명 `Cache-Control`이지만, 보조 헤더까지 함께 넣어두면 **중간 프록시나 오래된 캐시 구현체에 대해서도 의도를 더 명시적으로 전달**할 수 있습니다. Git Ranker는 이 경로를 단순 문자열 응답이 아니라, 외부 플랫폼 위에 노출되는 **공개 인터페이스**로 취급한 셈입니다.

> **바뀐 것은 SVG 문자열 자체보다, 그 SVG를 전달하는 HTTP 인터페이스 전체였다.**

# 7. 이 문제를 지나며 배운 점

이번 문제는 "이미지가 안 바뀐다"는 사소한 UI 이슈처럼 보였지만, 실제로는 **사용자가 응답을 받아보는 전체 경로를 설계하는 문제**였습니다.

저는 처음에 서버가 최신 SVG를 잘 만든다는 사실만으로 충분하다고 생각했습니다. 하지만 사용자가 실제로 보는 것은 원본 서버의 즉시 응답이 아니라, GitHub README 렌더링과 프록시 캐시를 거친 최종 결과였습니다. 이 차이를 인정하고 나서야 배지 기능을 **이미지 생성 기능**이 아니라 **외부 플랫폼 위에서 안정적으로 갱신되는 HTTP 리소스 설계 문제**로 다시 볼 수 있었습니다.

이 경험을 지나며 가장 크게 정리된 문장은 이것입니다.

> **동적 SVG 배지는 이미지처럼 보이지만, 운영 관점에서는 캐시 정책을 가진 HTTP API 응답이다.**

`Cache-Control`은 부가적인 헤더가 아니었습니다. GitHub 같은 외부 플랫폼 위에서 기능이 끝까지 의도대로 동작하게 만드는 **계약의 일부**였습니다. 서버 안에서만 맞는 기능과, 사용자 화면까지 맞는 기능 사이에는 생각보다 큰 간격이 있었습니다.

남은 한계도 분명합니다. 현재 정책에서는 사용자가 수동 갱신을 눌러도 GitHub README에는 최대 1시간 전 값이 보일 수 있습니다. 하지만 그 지연은 의도적으로 허용한 지연입니다. 만약 앞으로 "수동 갱신 직후에는 거의 즉시 반영돼야 한다"는 요구가 더 중요해진다면, 그때는 `PURGE` 스크립트를 덧대기보다 **`no-cache`나 검증자 기반 재검증 전략**을 다시 검토하는 편이 더 일관된 방향일 것입니다.

# 참고

- [GitHub Blog, Proxying User Images](https://github.blog/news-insights/product-news/proxying-user-images/)
- [GitHub Docs, About anonymized URLs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls)
- [MDN, Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
