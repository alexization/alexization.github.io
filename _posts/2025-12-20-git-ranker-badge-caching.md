---
header:
  teaser: /assets/images/logo.png

title: "[Git Ranker #8] GitHub SVG 배지 캐싱 문제 해결기"
excerpt: "배지가 갱신이 안 된다? 서버 문제가 아니라 GitHub Camo 프록시의 캐싱 때문이었다. Cache-Control 헤더 한 줄로 해결한 과정"

categories:
  - Git Ranker

tags:
  - GitHub Camo
  - HTTP Cache
  - Cache-Control

toc_label: "배지 캐싱 해결기"
toc: true
toc_sticky: true

date: 2025-12-20
last_modified_at: 2025-12-20
---

![GitRanker Master 티어](https://imgur.com/LcsQMUX.png)

Git Ranker에는 사용자의 티어와 점수를 SVG 이미지로 보여주는 **배지 기능**이 있습니다.

사용자가 자신의 GitHub README에 배지 URL을 한 번 삽입해두면, 방문자가 프로필을 볼 때마다 최신 점수와 티어가 자동으로 표시되는 구조입니다.

![Solved.ac 티어와 비교](https://imgur.com/LSgOu0q.png)

> Git Ranker의 배지 시스템은 백준 티어를 나타내주는 배지를 모티브했으며, 백준 배지와 잘 어울리도록 크기와 디자인을 고려하여 개발했습니다.

배지를 처음 배포하고 테스트했을 때는 잘 동작했습니다. 하지만 랭킹 재산정 배치가 돌고 점수가 갱신된 이후에도, GitHub README에 표시되는 배지는 **과거의 점수와 티어를 그대로 보여주고 있었습니다.**

서버에 문제가 있다고 생각하고 디버깅을 시작했는데, 원인은 전혀 다른 곳에 있었습니다.

---

# 문제 상황

배치 작업이 돌아서 사용자의 점수가 갱신된 것을 DB에서 확인한 상태였습니다.

그런데 GitHub 프로필의 README에 삽입된 배지 이미지에는 **이전 점수와 티어**가 그대로 남아있었습니다. 며칠이 지나도 바뀌지 않았습니다.

## 서버는 정상이다

처음에는 배지 생성 로직에 버그가 있다고 의심했습니다. 하지만 브라우저에서 배지 API URL(`/api/v1/badges/{nodeId}`)을 직접 호출하면 **최신 점수가 정상적으로 반영된 SVG 이미지**가 반환되고 있었습니다.

> "서버는 분명히 최신 데이터를 주고 있는데, GitHub에서는 왜 안 바뀌지?"

## 핵심 단서: 다른 URL

그래서 GitHub README에서 배지 이미지의 **실제 요청 URL**을 확인해봤습니다.

![camo url](https://imgur.com/iYrnlYp.png)

제가 삽입한 URL은 `https://www.git-ranker.com/api/v1/badges/...` 였는데, GitHub에서 실제로 로드하는 이미지 URL은 **`https://camo.githubusercontent.com/...`** 으로 변환되어 있었습니다.

내 서버에 직접 요청하는 것이 아니라, GitHub 중간에 있는 **다른 서버를 거쳐서** 이미지를 가져오고 있었습니다.

---

# 원인 분석: GitHub Camo

`camo.githubusercontent.com`이 뭔지 찾아봤습니다.

## GitHub Camo란?

GitHub는 사용자가 README나 이슈에 삽입한 외부 이미지를 직접 로드하지 않습니다. 대신 [**Camo**](https://github.com/atmos/camo)라는 이미지 프록시 서버를 통해 이미지를 중계합니다. GitHub 공식 문서에서는 이를 **Anonymized URL**이라고 부릅니다.

Camo가 존재하는 이유는 크게 두 가지입니다.

**1) Mixed Content 방지**

GitHub 페이지는 HTTPS로 서빙됩니다. 사용자가 HTTP로 호스팅되는 외부 이미지를 삽입하면 브라우저에서 Mixed Content 경고가 발생하거나 이미지가 차단될 수 있습니다. Camo는 외부 이미지를 자신의 HTTPS 도메인을 통해 전달하여 이 문제를 방지합니다.

**2) 사용자 IP 보호**

외부 이미지를 직접 로드하면, 이미지를 호스팅하는 서버에 방문자의 IP 주소가 노출됩니다. Camo가 중간에서 이미지를 프록시하면 방문자의 브라우저 정보와 IP가 외부 서버에 전달되지 않습니다.

## Camo의 캐싱 동작

여기서 중요한 건 **캐싱 동작**입니다.

Camo는 HTTP 표준 캐시 헤더를 존중하도록 설계되어 있습니다. GitHub 공식 문서에서도 이미지가 갱신되지 않는 경우 원본 서버의 `Cache-Control` 헤더를 확인하라고 안내하고 있습니다.

> If you own the server that's hosting the image, modify it so that it returns a `Cache-Control` of `no-cache` for images
> 
> [- GitHub Docs, About anonymized URLs](https://docs.github.com/ko/authentication/keeping-your-account-and-data-secure/about-anonymized-urls)

즉, 원본 서버가 응답에 `Cache-Control` 헤더를 포함하면 Camo는 해당 지시를 따릅니다. 반대로 **`Cache-Control` 헤더가 없으면**, Camo는 한 번 가져온 이미지를 언제 갱신해야 할지 판단할 근거가 없으므로 **캐시된 이미지를 계속 반환합니다.**

제 서버의 BadgeController 코드를 다시 확인해봤습니다.

```java
// 수정 전: 캐시 헤더 없음
@GetMapping(value = "/{nodeId}", produces = "image/svg+xml")
public ResponseEntity<String> getBadge(@PathVariable String nodeId) {
    String svgContent = badgeService.generateBadge(nodeId);

    return ResponseEntity.ok()
            .contentType(MediaType.valueOf("image/svg+xml"))
            .body(svgContent);
}
```

**어떠한 캐시 관련 헤더도 설정하고 있지 않았습니다.**

Camo 입장에서는 이 응답을 받았을 때 "이 이미지를 얼마나 오래 캐시해도 되는지" 알 방법이 없습니다. 그래서 기본 캐싱 정책에 따라 이미지를 장기간 보관하고, 원본 서버에 다시 요청하지 않았던 것입니다.

---

# 해결 방법 탐색

원인을 파악한 후, 해결 방법을 찾기 위해 몇 가지 접근 방식을 검토했습니다.

## 시도 1: curl -X PURGE (수동 캐시 초기화)

GitHub 공식 문서에서는 Camo의 캐시를 강제로 초기화하는 방법을 제공합니다.

```bash
curl -X PURGE https://camo.githubusercontent.com/{캐시된_이미지_해시}
```

이 명령어를 실행하면 Camo에 캐시된 해당 이미지가 삭제되고, 다음 요청 시 원본 서버에서 새로 가져옵니다.

직접 테스트해 보니 실제로 동작했습니다. 하지만 이 방법에는 한계가 있었습니다.

- 사용자마다 고유한 배지 URL이 있고, 해당 URL에 대응하는 Camo 캐시 URL도 각각 다릅니다.
- 배치가 돌 때마다 모든 사용자의 Camo 캐시를 PURGE하려면 별도의 자동화 로직이 필요합니다.
- GitHub 공식 문서에서도 PURGE는 **다른 방법이 동작하지 않을 때만 매우 제한적으로 사용**하라고 안내하고 있습니다.

근본적인 해결책이라기보다는 임시 대응에 가깝다고 판단했습니다.

## 시도 2: URL 쿼리 파라미터 (Cache Busting)

이미지 URL 뒤에 타임스탬프나 버전 파라미터를 붙이면, Camo는 이를 **완전히 다른 URL**로 인식합니다.

```markdown
![badge](https://gitranker.com/api/v1/badges/abc123?v=20251220)
```

URL 자체가 달라지니 캐시를 우회할 수 있습니다. 하지만 이 방법도 현실적이지 않았습니다.

Git Ranker의 배지는 **사용자가 README에 한 번 삽입하면 자동으로 최신 상태가 유지되는 것**이 핵심 기능입니다. 배지가 갱신될 때마다 사용자가 README 파일의 URL을 수정해야 한다면, "자동 갱신 배지"라는 서비스의 존재 의미가 사라집니다.

## 시도 3: Cache-Control 헤더 제어

두 가지 방법이 모두 근본적이지 않다는 결론에 이르렀습니다.

결국 GitHub 공식 문서에서 안내하는 방법, 즉 **원본 서버의 응답 헤더에 `Cache-Control`을 명시**하는 것이 정답이었습니다.

서버가 Camo에게 "이 이미지의 캐시 유효기간은 이만큼이다"라고 명확히 알려주면, Camo는 그 지시를 따릅니다. 별도의 자동화나 사용자 개입 없이, HTTP 표준만으로 문제를 해결할 수 있습니다.

---

# `no-cache` vs `max-age`, 어떤 정책을 쓸까?

`Cache-Control` 헤더를 적용하기로 결정한 후, 어떤 캐싱 정책을 사용할지 고민이 필요했습니다.

## no-cache

```
Cache-Control: no-cache
```

흔히 "캐시를 아예 하지 마라"로 오해하기 쉬운데, 정확한 의미는 **"캐시에 저장은 하되, 사용하기 전에 반드시 원본 서버에 유효한지 확인하라"** 입니다.

- **장점:** 매 요청마다 원본 서버에 확인하므로 항상 최신 데이터를 보장합니다.
- **단점:** GitHub README가 조회될 때마다 Camo가 Git Ranker 서버에 요청을 보냅니다. 인기 있는 사용자의 프로필이 하루에 수천 번 조회된다면, 그만큼의 요청이 서버에 그대로 전달됩니다.

## max-age=3600, must-revalidate

```
Cache-Control: max-age=3600, must-revalidate
```

`max-age=3600`은 "이 응답을 3600초(1시간) 동안 캐시해서 사용해도 된다"는 의미이고, `must-revalidate`는 "지정된 시간이 만료되면 반드시 원본 서버에 재검증하라"는 의미입니다.

이 방식을 선택한 이유는 두 가지였습니다.

**이유 1: 비즈니스 로직과의 정합성**

Git Ranker의 점수 갱신 배치는 매일 새벽에, ~~랭킹 재산정 배치는 **1시간 주기**로 실행됩니다.~~ 즉, 사용자의 점수와 티어는 최소 1시간 동안은 변하지 않습니다.

_(현재는 기획의 변경으로 1시간 주기의 랭킹 재산정 배치는 사라졌습니다.)_

데이터가 1시간 동안 동일한데 매 요청마다 서버에 확인할 필요가 없습니다. 캐시 유효기간을 배치 주기와 일치시키면, **데이터의 실제 갱신 주기와 캐시 만료 주기가 자연스럽게 동기화**됩니다.

**이유 2: 서버 부하 방어**

`no-cache`를 사용하면 사용자 프로필이 조회될 때마다 Git Ranker 서버에 요청이 들어옵니다. `max-age=3600`을 사용하면 1시간 동안은 Camo가 캐시된 이미지를 반환하고, 1시간이 지난 후 **딱 한 번만** 서버에 요청을 보내 최신 이미지를 가져갑니다.

홈랩 환경에서 운영 중인 서버의 부하를 효율적으로 관리할 수 있습니다.

---

# 코드 구현

Spring Framework의 `CacheControl` 빌더를 사용하여 응답 헤더를 설정했습니다.

```java
@GetMapping(value = "/{nodeId}", produces = "image/svg+xml")
public ResponseEntity<String> getBadge(@PathVariable String nodeId) {
    String svgContent = badgeService.generateBadge(nodeId);

    // GitHub Camo에게 캐싱 정책을 알려주는 헤더
    CacheControl cacheControl = CacheControl.maxAge(1, TimeUnit.HOURS)
            .mustRevalidate();

    return ResponseEntity.ok()
            .contentType(MediaType.valueOf("image/svg+xml"))
            .cacheControl(cacheControl)
            .body(svgContent);
}
```

이 코드가 생성하는 HTTP 응답 헤더는 다음과 같습니다.

```
HTTP/1.1 200 OK
Content-Type: image/svg+xml
Cache-Control: max-age=3600, must-revalidate
```

각 지시자의 역할을 정리하면,

| 지시자               | 의미                                  |
|-------------------|-------------------------------------|
| `max-age=3600`    | 응답을 3600초(1시간) 동안 캐시해서 사용해도 됨       |
| `must-revalidate` | max-age가 만료된 후에는 반드시 원본 서버에 재검증해야 함 |

`must-revalidate`를 추가한 이유가 있습니다.

`max-age`만 단독으로 사용하면 일부 캐시 구현체가 만료 후에도 네트워크 상태에 따라 오래된 캐시를 반환할 수 있습니다. `must-revalidate`를 함께 지정하면 만료 후에는 **어떤 상황에서든** 원본 서버에 확인하도록 강제합니다.

---

# 결과

- **적용 전:** 배치가 돌아 점수가 갱신되어도 GitHub README의 배지에는 며칠 전 점수가 표시되었습니다.
- **적용 후:** 배치가 실행되고 최대 1시간 이내에 GitHub README의 배지가 최신 상태로 자동 동기화됩니다. 사용자가 README를 수정하거나 별도의 조치를 취할 필요가 없습니다.

---

# 마무리

이번 문제는 단순한 버그가 아니라 **"내 서버 밖에서 일어나는 일"**에 대한 이해 부족에서 비롯된 것이었습니다.

서버에서 이미지를 정상적으로 반환하고 있으니 문제가 없다고 생각했지만, 실제로 사용자에게 이미지가 전달되기까지는 GitHub Camo라는 프록시 계층이 존재했습니다. 그리고 Camo가 내 서버의 응답을 어떻게 처리할지는, **내가 응답 헤더에 무엇을 담아 보내느냐**에 달려 있었습니다.

HTTP 캐시 제어 헤더는 알고는 있었지만, "실제로 내 서비스에서 이걸 왜 써야 하는지"를 체감한 것은 이번이 처음이었습니다. `Cache-Control` 헤더 한 줄이 서비스의 핵심 기능이 정상 동작하는지 여부를 결정한다는 점에서, HTTP 표준을 이해하는 건 이론 공부가 아니라 실전에서 바로 필요한 역량이라는 것을 느꼈습니다.
