---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/uAdk7rY.png"

title: "[Home Lab #4] 홈서버 도메인 정규화: Nginx, Certbot, DNS로 www/non-www 불일치 해결하기"
excerpt: "HTTPS를 붙인 뒤에도 `www` 유무에 따라 404와 인증서 범위 문제가 남았고, DNS, 인증서, Nginx 정책을 맞춰 대표 도메인으로 정규화한 과정"

categories:
  - Home Lab

tags:
  - Nginx
  - Certbot
  - DNS
  - DDNS
  - HTTPS

toc_label: "도메인 정규화"
toc: true
toc_sticky: true

permalink: /home-lab/home-lab-www-non-www/
redirect_from:
  - /home lab/home-lab-www-non-www/
date: 2025-12-23
last_modified_at: 2026-03-30
---

![mainImage](https://i.imgur.com/uAdk7rY.png)

[지난 글](/home-lab/home-lab-dns-ddns-nginx/)에서 Nginx와 Certbot으로 `https://www.git-ranker.com`까지 붙였을 때만 해도, 외부 진입점 정리는 거의 끝났다고 생각했습니다. 브라우저 경고도 사라졌고, 주소도 그럴듯해 보였기 때문입니다.

그런데 운영을 시작하자마자 빈틈이 보였습니다. `http://www.git-ranker.com`은 정상적으로 HTTPS로 넘어가는데, `http://git-ranker.com`은 **404**로 끝났습니다. 같은 서비스를 가리켜야 하는 주소가 `www` 유무에 따라 전혀 다른 동작을 하고 있었습니다.

이 글에서는 **왜 HTTPS 적용만으로는 URL 정책이 완성되지 않았는지**, **왜 `https://git-ranker.com` 정규화에는 인증서와 DNS까지 함께 맞아야 했는지**, **최종적으로 DNS, 인증서, Nginx 역할을 어떻게 분리해 정리했는지**를 한 번에 설명합니다.

<aside>
<strong>이 글에서 정리하는 것</strong>
<ul>
  <li>문제: <code>www</code> 유무에 따라 404와 리다이렉트가 섞이던 상태</li>
  <li>핵심 원인: DNS, 인증서 범위, Nginx <code>server_name</code> 정책 불일치</li>
  <li>목표: 모든 진입점을 <code>https://www.git-ranker.com</code>으로 정규화하기</li>
</ul>
</aside>

> **HTTPS 적용과 도메인 정규화는 같은 작업이 아니었다.**
> 인증서는 브라우저 신뢰를 만들고, DNS는 도달 가능성을 만들고, Nginx는 어떤 주소를 대표 주소로 볼지 결정한다.

# 1. 접속 성공보다 더 중요했던 정책 일관성

처음에는 "`https://www.git-ranker.com`이 열리니 됐다"라고 생각했습니다. 하지만 운영 관점에서는 한 주소만 열리는 것으로 충분하지 않았습니다. 사용자는 `www`를 붙여 들어올 수도 있고, 루트 도메인만 입력할 수도 있고, 브라우저 자동완성이나 기존 북마크로 다른 주소를 타고 들어올 수도 있기 때문입니다.

당시 상태를 정리하면 아래와 같았습니다.

| URL | 해결 전 동작 |
| --- | --- |
| `http://git-ranker.com` | `404` |
| `http://www.git-ranker.com` | `308` -> `https://www.git-ranker.com` |
| `https://git-ranker.com` | 신뢰 가능한 동작이 보장되지 않음 |
| `https://www.git-ranker.com` | 정상 접속 |

이 상태에서 필요한 것은 단순한 "접속 가능"이 아니라 **도메인 정규화(canonicalization)**였습니다. 대표 주소를 하나 정하고, 나머지 주소는 모두 그 주소로 **예측 가능하게 수렴**해야 했습니다.

대표 주소가 둘 이상으로 남으면 아래 문제가 바로 생깁니다.

- 사용자는 같은 서비스를 두 개의 다른 주소로 인식합니다.
- 리다이렉트와 인증서 정책이 호스트마다 달라집니다.
- 운영자는 "어느 주소가 공식 주소인가"를 매번 설명해야 합니다.

즉, 이번 장애의 본질은 "HTTPS가 안 된다"가 아니라 **대표 주소 정책이 끝까지 정리되지 않았다**는 데 있었습니다.

# 2. 첫 번째 원인: Nginx의 `Host`와 `server_name` 매칭

원인을 확인하려고 설정 파일을 다시 봤더니, HTTPS 적용 당시 Certbot이 만든 HTTP 리다이렉트 블록이 아래와 비슷한 형태였습니다.

```nginx
server {
    if ($host = www.git-ranker.com) {
        return 308 https://$host$request_uri;
    }

    listen 80;
    server_name www.git-ranker.com;
    return 404;
}
```

문제는 `server_name`이 `www.git-ranker.com`으로만 잡혀 있었다는 점입니다. Nginx는 [요청의 `Host` 헤더와 `server_name` 조합](https://nginx.org/en/docs/http/request_processing.html)으로 어떤 `server` 블록이 요청을 받을지 결정합니다.

따라서 `http://git-ranker.com` 요청은 처음부터 `www` 전용 정책에 포함되지 않았습니다. `if ($host = www.git-ranker.com)` 조건도 통과하지 못했고, 결국 마지막의 `return 404`로 끝났습니다.

여기서 중요했던 점은 이 문제가 **애플리케이션 장애가 아니라 진입점 정책 문제**였다는 사실입니다.

- Spring Boot 애플리케이션이 죽은 것이 아니었습니다.
- 리버스 프록시 뒤의 내부 포트가 틀린 것도 아니었습니다.
- **Nginx가 루트 도메인 요청을 받을 준비가 되어 있지 않았습니다.**

> 같은 서버에서 같은 애플리케이션을 돌리더라도, Nginx가 어떤 호스트 이름을 받기로 선언했는지가 먼저 맞아야 한다.

# 3. 두 번째 원인: HTTPS 리다이렉트보다 먼저 오는 인증서 검증

HTTP만 생각하면 해결은 단순해 보입니다. `git-ranker.com`으로 들어온 요청도 Nginx에서 받아서 `https://www.git-ranker.com`으로 보내면 됩니다.

하지만 HTTPS는 한 단계가 더 있습니다. 브라우저는 먼저 **TLS 핸드셰이크**를 수행하고, 그 시점에 제시된 인증서가 지금 접속한 호스트 이름과 일치하는지 검사합니다. 즉, `https://git-ranker.com` 요청은 **HTTP 308 리다이렉트를 보기 전에** 이미 `git-ranker.com` 이름으로 인증서 검증을 먼저 통과해야 합니다.

> `https://git-ranker.com`을 `https://www.git-ranker.com`으로 보내고 싶어도, 먼저 `git-ranker.com` 이름으로 TLS 검증이 성공해야 한다.

이 말은 곧 인증서에 `www.git-ranker.com`만 들어 있어서는 부족하다는 뜻입니다. **Subject Alternative Name(SAN)** 범위에 `git-ranker.com`과 `www.git-ranker.com`이 모두 포함돼야, 루트 도메인 HTTPS 요청도 신뢰 경고 없이 받아서 리다이렉트할 수 있습니다.

그래서 루트 도메인까지 인증서 범위를 넓히려고 Certbot을 다시 실행했는데, 이번에는 다른 에러가 나왔습니다.

```text
Certbot failed to authenticate some domains ...

Detail: no valid A records found for git-ranker.com; no valid AAAA records found for git-ranker.com
```

이 메시지는 Nginx 내부 문제가 아니라, Let's Encrypt 검증 단계에서 **루트 도메인 DNS가 아직 유효하지 않다**는 뜻이었습니다.

핵심은 여기였습니다.

- Let's Encrypt는 인증서에 넣을 도메인을 **각각 개별적으로 검증**합니다.
- `www.git-ranker.com`이 살아 있다고 해서 `git-ranker.com`까지 자동으로 검증되는 것은 아닙니다.
- 루트 도메인을 인증서에 넣으려면, 루트 도메인도 먼저 DNS에서 서버를 정확히 가리켜야 합니다.

당시에는 `www.git-ranker.com`만 DDNS 호스트를 따라가도록 `CNAME`으로 연결해 둔 상태였고, `git-ranker.com`은 아직 `A` 레코드가 없었습니다. 그래서 `www`는 살아 있어도, 루트 도메인 검증은 즉시 실패했습니다.

# 4. 해결에 앞서 정한 설계 기준

문제를 바로 고치기보다, 먼저 어떤 방향으로 정리할지부터 정했습니다. 여기서 기준이 흐리면 DNS, 인증서, 리다이렉트 규칙이 다시 뒤섞일 수 있기 때문입니다.

## 4.1 대표 주소: `www.git-ranker.com`

가장 먼저 정한 것은 **대표 도메인(canonical domain)**이었습니다. 이번에는 `git-ranker.com`이 아니라 **`www.git-ranker.com`을 공식 주소로 유지**하기로 했습니다.

이 선택의 이유는 단순했습니다.

- 이미 `www` 기준 HTTPS 경로가 정상 동작하고 있었습니다.
- 기존 링크와 브라우저 사용 흐름을 크게 바꾸지 않아도 됐습니다.
- 변경 범위를 최소화해 빠르게 안정화할 수 있었습니다.

루트 도메인으로 통일하는 것도 가능했지만, 이번 작업의 목적은 주소 체계를 새로 설계하는 것이 아니라 **기존 홈서버 구조를 빠르게 안정화하는 것**이었습니다.

## 4.2 범위 통제: 외부 플랫폼 이전 보류

Cloudflare 같은 외부 플랫폼으로 옮기면 DNS 운영과 보안 옵션 측면에서 얻는 장점이 분명합니다. 다만 이번 문제는 "현재 구조에서 대표 주소 정책이 어긋난 상태"였고, 플랫폼 이전까지 한 번에 섞으면 변수가 너무 많아집니다.

그래서 이번에는 **DNS 사업자 변경이나 프록시 플랫폼 이전 없이**, 지금 운영 중인 홈서버 구조 안에서 문제를 닫는 데 집중했습니다.

## 4.3 루트 도메인 `A` 레코드와 운영 부담

루트 도메인을 인증서에 포함하려면 `git-ranker.com`도 실제 서버 IP를 가리켜야 했습니다. 그래서 결국 `@`에 공인 IPv4를 직접 넣는 `A` 레코드를 추가했습니다.

물론 이 선택에는 운영상 부담이 있습니다. 홈서버는 유동 IP 환경이기 때문에, 공유기 재부팅이나 WAN 재연결이 일어나면 루트 도메인 `A` 레코드가 낡을 수 있습니다.

<aside>
<strong>이번 구성의 한계</strong><br>
<code>www</code>는 DDNS를 따라가지만, 루트 도메인 <code>@</code>는 직접 넣은 <code>A</code> 레코드에 의존합니다. IP가 바뀌면 루트 도메인 경로는 다시 깨질 수 있으므로, 장기적으로는 DNS API 자동화나 루트 도메인 flattening을 지원하는 구조를 검토할 여지가 있습니다.
</aside>

그럼에도 이번에는 **구조 변경보다 빠른 복구와 정책 일관성 확보가 더 중요하다**고 판단했습니다.

# 5. DNS, 인증서, Nginx의 책임 분리

이번 문제를 정리하면서 가장 크게 얻은 것은 "각 계층이 무엇을 책임지는가"를 분명하게 본 것입니다.

| 계층 | 해결해야 하는 문제 | 이번에 맞춘 설정 |
| --- | --- | --- |
| DNS | 두 호스트가 모두 홈서버까지 도달해야 함 | `@`는 `A`, `www`는 DDNS를 가리키는 `CNAME` |
| 인증서 | 두 호스트 모두 TLS 이름 검증을 통과해야 함 | `git-ranker.com`, `www.git-ranker.com`을 모두 SAN에 포함 |
| Nginx | 비대표 주소를 대표 주소로 일관되게 보내야 함 | `http://*`, `https://git-ranker.com`을 `https://www.git-ranker.com`으로 `308` |

## 5.1 DNS: 도달 가능성 보장

![record](https://i.imgur.com/r7NHaAV.png)

최종 DNS는 아래처럼 정리했습니다.

- `@` A -> `118.xxx.xxx.xx`
- `www` CNAME -> `hyoserver.iptime.org`

이 구성이 의미하는 것은 명확합니다.

- `git-ranker.com`은 루트 도메인 자체로 홈서버 공인 IP에 도달합니다.
- `www.git-ranker.com`은 DDNS 호스트를 따라가며 유동 IP 변화를 흡수합니다.

즉, **사용자가 어떤 호스트 이름으로 들어오더라도 일단 서버까지는 도달할 수 있게** 만든 뒤, 그 다음 단계의 정규화는 Nginx에서 처리하도록 역할을 나눴습니다.

## 5.2 Nginx: 대표 주소로 수렴

아래 설정은 실제 운영 설정에서 리다이렉트 의도만 남긴 단순화 예시입니다. 인증서 경로와 프록시 헤더 등은 글의 핵심에서 벗어나므로 생략했습니다.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name git-ranker.com www.git-ranker.com;

    return 308 https://www.git-ranker.com$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name git-ranker.com;

    return 308 https://www.git-ranker.com$request_uri;
}
```

그리고 기존의 `www.git-ranker.com`용 HTTPS 서버 블록은 그대로 애플리케이션으로 프록시하도록 유지했습니다. 정리하면 역할은 이렇게 나뉩니다.

1. `http://git-ranker.com` 또는 `http://www.git-ranker.com`으로 들어오면, 80 포트 블록이 먼저 `https://www.git-ranker.com`으로 보냅니다.
2. `https://git-ranker.com`으로 들어오면, 루트 도메인을 포함한 인증서로 TLS 검증을 통과한 뒤 443 리다이렉트 블록이 다시 `https://www.git-ranker.com`으로 보냅니다.
3. 최종적으로 `https://www.git-ranker.com`에서만 실제 애플리케이션이 응답합니다.

이렇게 하면 애플리케이션은 더 이상 `www`/non-`www` 분기를 직접 고민하지 않아도 됩니다. **비대표 주소 정리는 Nginx에서 끝내고, 앱은 대표 주소만 상대하게** 만들 수 있습니다.

# 6. 검증 기준: 네 주소의 정책 수렴

설정을 바꾼 뒤에는 "한 주소가 열리는가"가 아니라, **네 개의 진입점이 같은 정책으로 수렴하는가**를 기준으로 확인했습니다.

## 6.1 DNS 응답 확인

먼저 루트 도메인과 `www`가 각각 기대한 방식으로 해석되는지 확인했습니다.

```bash
dig +short A git-ranker.com
dig +short CNAME www.git-ranker.com
```

예상한 응답은 아래와 같았습니다.

```text
118.xxx.xxx.xx
hyoserver.iptime.org.
```

이 단계에서 루트 도메인 `A`가 비어 있으면, 그 뒤의 Certbot 재발급도 실패합니다.

## 6.2 Certbot 재발급 확인

DNS가 맞는 것을 확인한 뒤, 루트 도메인까지 포함해 인증서를 다시 발급했습니다.

```bash
sudo certbot --nginx -d git-ranker.com -d www.git-ranker.com
```

정상이라면 아래와 같은 메시지를 볼 수 있습니다.

```text
Successfully received certificate.
Successfully deployed certificate for git-ranker.com
Successfully deployed certificate for www.git-ranker.com
```

여기서 확인하고 싶었던 것은 단순히 "발급 성공"이 아니라, **루트 도메인도 이제 TLS 이름 검증 대상에 포함됐는가**였습니다.

## 6.3 최종 리다이렉트 확인

마지막으로 네 주소를 모두 직접 확인했습니다.

```bash
curl -I http://git-ranker.com
curl -I http://www.git-ranker.com
curl -I https://git-ranker.com
curl -I https://www.git-ranker.com
```

제가 기대한 최종 상태는 아래와 같았습니다.

![redirects](https://i.imgur.com/ONBqxne.png)

| URL | 기대 결과 |
| --- | --- |
| `http://git-ranker.com` | `308` -> `https://www.git-ranker.com...` |
| `http://www.git-ranker.com` | `308` -> `https://www.git-ranker.com...` |
| `https://git-ranker.com` | `308` -> `https://www.git-ranker.com...` |
| `https://www.git-ranker.com` | 애플리케이션 정상 응답 |

애플리케이션이 자체 로그인 리다이렉트를 가진다면 마지막 줄은 `200`이 아니라 `302`일 수도 있습니다. 중요한 것은 **비대표 주소들이 더 이상 404나 인증서 경고로 끝나지 않고, 하나의 대표 주소로 모인다는 점**이었습니다.

# 7. 마무리

이번 작업으로 다시 확인한 것은, **HTTPS를 붙였다고 해서 URL 정책까지 자동으로 완성되지는 않는다**는 점입니다.

- DNS는 각 호스트가 실제 서버에 도달할 수 있게 해야 합니다.
- 인증서는 각 호스트 이름에 대해 브라우저 신뢰를 만들어야 합니다.
- Nginx는 그 위에서 어떤 주소를 대표 주소로 볼지 일관되게 결정해야 합니다.

이 셋 중 하나라도 비어 있으면 `www`/`non-www` 문제는 다시 어딘가에서 튀어나옵니다. 이번에는 `http://git-ranker.com`의 404로 시작했지만, 조금만 조건이 달랐다면 **TLS 경고**, **예상 밖의 리다이렉트 루프**, **검색 유입 분산** 같은 다른 형태로 나타날 수도 있었습니다.

홈서버를 운영하면서 배운 점은, 진입점 문제를 애플리케이션 코드로만 바라보면 늦는다는 것입니다. **대표 주소 정책은 DNS, 인증서, 리버스 프록시가 함께 맞아야 비로소 끝납니다.** 이번 정리는 그 세 계층의 책임을 처음으로 분리해서 본 작업이기도 했습니다.
