---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/r7NHaAV.png"

title: "[Home Lab #4] 홈서버 도메인 정규화: Nginx, Certbot, DNS로 www/non-www 불일치 해결하기"
excerpt: "HTTPS를 적용했는데도 www 유무에 따라 접속이 갈리던 문제를 DNS와 Nginx 정책 정렬로 해결한 경험"

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
last_modified_at: 2025-12-23
---
[지난 편에서 Nginx와 Certbot으로 HTTPS를 붙였을 때](https://alexization.github.io/home%20lab/home-lab-dns-ddns-nginx/)는 작업이 거의 끝났다고 생각했습니다.
`https://www.git-ranker.com` 접속이 정상이고, 브라우저 경고도 사라졌기 때문입니다.

그런데 운영을 하던 중, 하나의 큰 문제가 발견되었습니다.

- `http://www.git-ranker.com`은 정상 리다이렉트
- `http://git-ranker.com`은 **404**

같은 서비스를 가리키는 URL인데 `www` 유무에 따라 동작이 갈리는 상태였습니다.

---

# www/non-www 접속 불일치가 만든 첫 장애 신호

이번에 문제로 본 지점은 단순히 "HTTPS가 된다"가 아니었습니다.
실제 운영에서는 아래 경로가 **일관된 정책**으로 동작해야 합니다.

- `http://git-ranker.com`
- `http://www.git-ranker.com`
- `https://git-ranker.com`
- `https://www.git-ranker.com`

이 중 일부가 실패하면 사용자 입장에서는 서비스가 불안정하게 보입니다.
검색 유입, 공유 링크, 브라우저 자동완성이 섞이는 환경에서는 이런 불일치가 바로 이탈로 이어집니다.

---

# 요청이 갈린 원인 추적: Host 매칭과 리다이렉트 조건

## Certbot이 생성한 Nginx 로직의 허점

원인을 파악하기 위해 설정 파일을 확인했더니, HTTPS 적용 당시 Certbot이 만든 리다이렉트 블록이 아래처럼 들어가 있었습니다.

```nginx
server {
    # Certbot이 생성한 방어적 리다이렉트 로직
    if ($host = www.git-ranker.com) {
        return 308 https://$host$request_uri;
    }

    listen 80;
    server_name www.git-ranker.com;
    return 404;
}
```

문제는 `if ($host = www.git-ranker.com)` 조건이었습니다.
`www` 없이 들어온 요청은 조건을 통과하지 못하고 `return 404`로 종료됩니다.

> [Nginx는 요청의 `Host` 헤더와 `server_name`으로 서버 블록을 선택합니다.](https://nginx.org/en/docs/http/request_processing.html)

즉, `http://git-ranker.com`이 실패한 건 애플리케이션 문제가 아니라 **Host 매칭 범위가 `www`로 고정**되어 있었기 때문이었습니다.

## 왜 Certbot은 이런 방어적 코드를 만들었을까

당시 초기 인증서 발급 대상이 `www.git-ranker.com`만 포함되어 있었기 때문에,
자동 생성된 리다이렉트도 그 호스트만 안전하게 HTTPS로 넘기도록 제한된 상태였습니다.

이 상태에서 모든 호스트를 무조건 HTTPS로 넘기면, 인증서 범위에 없는 도메인에서 TLS 이름 검증 오류가 날 수 있습니다.
그래서 Certbot이 보수적으로 `www`만 리다이렉트하고 나머지는 404로 정리한 흐름으로 해석할 수 있었습니다.

## 루트 도메인까지 HTTPS로 확장하려다 확인한 DNS 이슈

저는 여기서 멈추지 않고 `git-ranker.com`도 같은 정책으로 HTTPS에 포함하기로 했습니다.
그래서 Nginx `server_name`에 루트 도메인을 추가하고, Certbot으로 `git-ranker.com`을 포함한 인증서 발급을 시도했습니다.

바로 그때 `Detail: no valid A records found for git-ranker.com` 에러가 발생했습니다.

```text
Certbot failed to authenticate some domains ...

Detail: no valid A records found for git-ranker.com; no valid AAAA records found for git-ranker.com
```

이 에러는 Nginx 내부 에러가 아니라 Let's Encrypt 검증 단계에서 루트 도메인의 A/AAAA 조회가 유효하지 않다는 뜻입니다.

핵심은, Let's Encrypt가 인증서에 포함된 도메인을 **각각 DNS로 검증**한다는 점이었습니다.
이번에는 `git-ranker.com`을 인증서 대상에 추가했기 때문에 루트 도메인의 A/AAAA 조회가 먼저 맞아야 했습니다.

당시에는 `www.git-ranker.com`만 CNAME으로 DDNS를 따라가도록 두고 ,
`git-ranker.com`에는 A 레코드를 아직 매핑하지 않은 상태였습니다.

그래서 `www` 경로는 살아 있어도 루트 도메인 검증은 바로 실패했고,
이번 `no valid A records`가 그 상태를 보여준 에러였습니다.

# 해결 전에 정리한 세 가지 선택지

## 첫 번째 고민, 대표 도메인(canonical) 방향

가장 먼저 정한 건 "어떤 주소를 공식 주소로 볼 것인가"였습니다.
`www.git-ranker.com`을 대표 주소로 유지하면 현재 인증서, 리버스 프록시, 앱 설정과의 충돌이 거의 없고 변경 범위도 작아서 장애 리스크를 낮출 수 있습니다. 반면 URL이 길어진다는 단점이 있습니다.

반대로 `git-ranker.com`(루트 도메인)으로 통일하면 URL은 더 직관적이지만, 기존 리다이렉트 규칙, 인증서 SAN 범위, 내부 링크 정책까지 함께 점검해야 해서 검증 포인트가 확 늘어납니다. 이번 작업 목표가 **구조 개편이 아니라 빠른 안정화**였기 때문에, 저는 `www` 대표 주소를 유지하는 방향을 선택했습니다.

## 두 번째 고민, Cloudflare 이전을 지금 할 것인가

Cloudflare 이전은 분명 매력적인 선택지였습니다. DNS 운영 기능, 보안 옵션, 관리 편의성 측면에서 얻는 이점이 분명했기 때문입니다.

다만 최근들어 Cloudflare 장애 공지가 연속적으로 올라오는 시기이기도 했습니다. [2025-07-14 1.1.1.1 장애](https://blog.cloudflare.com/cloudflare-1-1-1-1-incident-on-july-14-2025/), [2025-11-18 장애](https://blog.cloudflare.com/18-november-2025-outage/), [2025-12-05 장애](https://blog.cloudflare.com/5-december-2025-outage/) 같은 이슈를 보면서 "지금 이 타이밍에 외부 플랫폼 전환까지 한 번에 가져가는 게 맞나"를 다시 생각하게 됐습니다.

그리고 저는 홈서버를 개인 PC로 구축한 이유가 핵심 인프라를 내가 직접 통제하고 운영 경험을 쌓고 싶어서였습니다. 그래서 플랫폼 이전을 섞지 않고, **현재 환경에서 문제를 해결하는 것**에 집중하기로 했습니다.

## 세 번째 고민, 유동 IP 환경에서 루트 도메인 A 레코드 운영

Cloudflare 이전을 보류한 뒤에는, 현재 홈서버 환경에서 루트 도메인을 어떻게 안정적으로 운영할지가 핵심 과제가 됐습니다.
`git-ranker.com`까지 HTTPS 인증서를 발급하려면, 먼저 루트 도메인이 DNS에서 서버를 정확히 가리켜야 했고, 그래서 `A` 레코드에 공인 IPv4를 직접 매핑해야 했습니다.

문제는 이 공인 IPv4가 고정값이 아니라는 점이었습니다.
운영 환경이 `미니PC + 가정용 ISP + 포트포워딩`이라 공유기 재부팅, WAN 재연결, DHCP 임대 갱신이 발생하면 IP가 바뀔 수 있습니다. 이때 DNS가 이전 IP를 계속 가리키면 서비스 프로세스가 살아 있어도 외부 접속은 실패합니다.
루트 도메인 `@`를 A 레코드로 운영하는 이상, IP 변경 시 A 값을 직접 갱신해야 하고 TTL 전파가 끝날 때까지 일부 구간은 접속이 불안정할 수 있습니다.

그럼에도 이번에는 `A` 레코드에 당시 공인 IP를 직접 넣는 방식을 선택했습니다.
실제 IP 변경 빈도가 높지 않았고, 이번 작업의 목표가 구조 변경보다 루트 도메인 HTTPS를 빠르게 안정화하는 데 있었기 때문입니다.

---

# 역할 분리로 정리한 DNS와 Nginx 정책

## DNS 레코드를 먼저 고정하기

![record](https://i.imgur.com/r7NHaAV.png)

현재 레코드는 아래처럼 유지했습니다.

- `@` A -> `118.xxx.xxx.xx`
- `www` CNAME -> `hyoserver.iptime.org`

이 단계에서 먼저 해결하고 싶었던 건 단 하나였습니다.
사용자가 어떤 URL로 들어오더라도 **요청이 홈서버까지 도달할 수 있게 DNS 경로를 안정화**하는 것이었습니다.

즉 `git-ranker.com`은 `@` A 레코드로 서버 IP를 직접 가리키고,
`www.git-ranker.com`은 DDNS 호스트를 CNAME으로 따라가게 해 도달 경로를 먼저 고정했습니다.

## Nginx 리다이렉트 정책을 코드로 고정하기

최종 설정에서는 `git-ranker.com`과 `www.git-ranker.com` 요청을 모두
`https://www.git-ranker.com`으로 **308** 리다이렉트되도록 통일했습니다.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name www.git-ranker.com git-ranker.com;

    return 308 https://www.git-ranker.com$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name git-ranker.com;

    return 308 https://www.git-ranker.com$request_uri;
}
```

![요청 흐름](https://i.imgur.com/ONBqxne.png)

### 실제 요청 흐름

예를 들어 사용자가 `http://git-ranker.com`으로 접속하면, 요청은 아래 순서로 진행됩니다.

1. 클라이언트가 먼저 `nginx 80`으로 요청합니다.
2. `nginx 80`은 `308 Location: https://www.git-ranker.com...`을 응답합니다.
3. 브라우저(클라이언트)는 이 응답을 보고 `https://www.git-ranker.com`으로 **새 요청**을 보냅니다.
4. 그 다음부터는 `nginx 443 www domain -> reverse proxy -> application` 경로로 처리됩니다.

즉, 비대표 URL(`http://git-ranker.com`, `https://git-ranker.com`)로 들어온 요청은
리다이렉트 응답을 한 번 거친 뒤, 최종적으로 대표 URL 경로에서 애플리케이션으로 전달됩니다.

### A 레코드 반영 후 DNS 확인

Nginx 설정만 고쳐서는 끝나지 않았기 때문에, 루트 도메인 A 레코드가 실제로 반영됐는지도 함께 확인했습니다.

```bash
dig +short A git-ranker.com
> 118.xxx.xxx.xx

dig +short CNAME www.git-ranker.com
> hyoserver.iptime.org.
```

### Certbot 재발급 성공 확인

DNS와 Nginx를 맞춘 뒤, 루트 도메인을 포함해 Certbot을 다시 실행했고 아래와 같은 성공 메시지를 확인했습니다.

```bash
sudo certbot --nginx -d git-ranker.com -d www.git-ranker.com
```

```text
Successfully received certificate.
Successfully deployed certificate for git-ranker.com
Successfully deployed certificate for www.git-ranker.com
```
