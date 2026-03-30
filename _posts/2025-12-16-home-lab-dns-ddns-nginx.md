---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/YkXdCAd.png"

title: "[Home Lab #3] DNS, DDNS, Nginx로 홈서버에 도메인과 HTTPS 붙이기"
excerpt: "공인 IP와 포트 번호를 직접 노출하던 홈서버에 DNS, DDNS, Nginx, Let's Encrypt를 조합해 사람이 읽을 수 있는 도메인과 HTTPS 진입점을 만든 과정"
categories:
  - Home Lab
tags:
  - DNS
  - DDNS
  - Nginx
  - Reverse Proxy
  - HTTPS
  - Certbot

toc_label: "도메인과 HTTPS"
toc: true
toc_sticky: true

permalink: /home-lab/home-lab-dns-ddns-nginx/
redirect_from:
  - /home lab/home-lab-dns-ddns-nginx/
date: 2025-12-16
last_modified_at: 2026-03-30
---

![mainImage](https://i.imgur.com/YkXdCAd.png)

미니 PC에 **Git Ranker**를 올린 뒤 가장 먼저 부딪힌 문제는 성능이 아니라 **주소**였습니다. 서비스를 보여주려면 `http://175.xxx.xxx.xxx:8080` 같은 형태를 그대로 전달해야 했고, 주소만 봐도 "개인 서버를 임시로 열어 둔 것 같은 느낌"이 강했습니다.

숫자 IP와 포트 번호는 기억하기 어렵고, 브라우저는 `http` 접속에 경고를 띄웁니다. 게다가 외부에 **공인 IP와 내부 서비스 포트 구조를 그대로 드러내는 상태**로 운영하는 것도 마음에 걸렸습니다.

이 글에서는 그 상태를 **사람이 읽을 수 있는 도메인**, **유동 IP를 따라가는 DNS 경로**, **Nginx 리버스 프록시**, **HTTPS**로 바꾼 과정을 정리합니다.

<aside>
<strong>이 글의 범위</strong>
<ul>
  <li>환경: Ubuntu 홈서버 + ipTIME DDNS + Nginx</li>
  <li>목표: <code>http://공인IP:포트</code> 대신 <code>https://도메인</code>으로 서비스 노출</li>
  <li>전제: 공유기 포트포워딩으로 80/443 요청이 서버까지 도달하는 상태</li>
</ul>
</aside>

# 1. 왜 `http://공인IP:포트`로는 운영 경험이 나빠지는가

처음에는 "접속만 되면 된 것 아닌가"라고 생각했습니다. 하지만 실제로 다른 사람에게 주소를 전달하는 순간, 문제는 바로 드러났습니다.

- **주소가 불친절합니다.** 사용자는 숫자 IP와 포트 번호를 기억하지 않습니다.
- **브라우저 신뢰가 떨어집니다.** `http` 접속은 곧바로 "안전하지 않음" 경고로 이어집니다.
- **인프라 구조가 그대로 노출됩니다.** 외부에 `8080`, `3000` 같은 내부 서비스 포트를 직접 드러내고 싶지 않았습니다.

> **사용자에게 전달해야 하는 것은 서버의 좌표가 아니라 서비스의 주소였다.**

여기서 필요한 건 단순히 "예쁜 URL"이 아니었습니다. **이름을 붙이고, 바뀌는 IP를 따라가고, 표준 포트 80/443 하나로 진입점을 정리하는 작업**이 함께 필요했습니다.

# 2. DNS와 DDNS는 서로 다른 문제를 해결한다

이번 작업에서 핵심은 **DNS**, **DDNS**, **리버스 프록시**를 한꺼번에 묶어 이해하는 것이었습니다. 세 도구는 비슷해 보이지만, 실제로는 각자 다른 계층의 문제를 풀어 줍니다.

- **DNS**는 사람이 읽는 이름을 네트워크 주소에 연결합니다.
- **DDNS**는 바뀌는 공인 IP를 계속 추적해 DNS 이름이 깨지지 않게 유지합니다.
- **Nginx**는 그 이름으로 들어온 요청을 내부 서비스로 전달합니다.

> **DNS가 이름을 만들고, DDNS가 그 이름의 유효성을 유지하며, Nginx가 실제 애플리케이션까지 연결한다.**

## 2.1 A 레코드와 CNAME 레코드는 어떻게 다를까

도메인을 서버에 연결할 때 가장 먼저 마주친 것이 DNS 레코드였습니다.

- **A 레코드**는 도메인 이름을 **특정 IPv4 주소**에 직접 연결합니다.
- **CNAME 레코드**는 도메인 이름을 **다른 도메인 이름의 별칭**으로 연결합니다.

예를 들면 아래와 같습니다.

- `A`: `example.com -> 203.0.113.10`
- `CNAME`: `www.example.com -> myserver.iptime.org`

이번 구성에서는 이미 ipTIME DDNS로 `hyoserver.iptime.org`를 사용하고 있었기 때문에, **서비스 진입점으로 쓸 서브도메인**을 이 DDNS 호스트에 연결하는 편이 가장 자연스러웠습니다.

![record](https://i.imgur.com/r7NHaAV.png)

<aside>
<strong>구성하면서 헷갈렸던 지점</strong><br>
루트 도메인(<code>git-ranker.com</code>)은 일반적으로 <code>CNAME</code>으로 두기 어렵습니다. 존 루트에는 이미 <code>NS</code>, <code>SOA</code> 같은 필수 레코드가 함께 존재하기 때문입니다. 그래서 DDNS와 연결할 때는 보통 <code>www</code>나 <code>app</code> 같은 <strong>서브도메인</strong>을 <code>CNAME</code>으로 두는 구성이 더 안전합니다.
</aside>

당시 저는 먼저 `www.git-ranker.com` 같은 **서브도메인 진입점**을 안정화하는 방향을 택했습니다.

## 2.2 DDNS가 필요한 이유

가정용 인터넷은 대부분 **유동 IP** 환경입니다. 공유기를 재부팅하거나, WAN 세션이 다시 잡히거나, ISP 정책에 따라 공인 IP가 바뀌면 기존 A 레코드는 곧바로 낡은 정보가 됩니다.

**DDNS(Dynamic DNS)**는 이 문제를 해결합니다. 공유기나 클라이언트가 현재 공인 IP를 주기적으로 DDNS 서버에 알려 주고, DDNS 호스트 이름은 항상 최신 IP를 가리키도록 유지됩니다.

제가 이해한 흐름은 아래와 같았습니다.

1. 사용자가 `www.git-ranker.com`으로 접속합니다.
2. DNS는 이 이름이 `hyoserver.iptime.org`를 바라보는 `CNAME`임을 알려 줍니다.
3. DDNS 호스트는 현재 시점의 공인 IP를 반환합니다.
4. 요청이 공유기와 포트포워딩을 거쳐 홈서버까지 도달합니다.

즉, **DNS만으로는 "이름"을 만들 수는 있어도, 유동 IP 환경에서 그 이름을 계속 살아 있게 만들 수는 없습니다.** 홈서버처럼 공인 IP가 바뀔 수 있는 환경에서는 DDNS가 사실상 필수에 가까웠습니다.

# 3. 외부 진입점으로 왜 Nginx를 두었는가

도메인이 서버를 가리키게 만든 뒤에는, 외부 요청을 어떤 프로세스가 가장 먼저 받을지 정해야 했습니다. 그 역할로 선택한 것이 **Nginx**였습니다.

여기서 한 번 정리할 점이 있습니다. **Cloudflare와 Nginx는 완전히 같은 층위의 도구는 아닙니다.** Cloudflare는 DNS, CDN, 외부 리버스 프록시를 제공하는 플랫폼이고, Nginx는 내 서버 안에서 직접 구동하는 웹 서버이자 리버스 프록시입니다.

그럼에도 이번 글의 맥락에서는 "외부 진입점을 어디에 둘 것인가"라는 관점에서 비교할 수 있었습니다. 저는 이번 단계에서 Cloudflare 같은 외부 플랫폼으로 옮기기보다, **집 안 네트워크에서 트래픽을 직접 받고 제어하는 구조**를 먼저 이해하고 싶었습니다.

Apache도 충분히 훌륭한 선택지입니다. 다만 이번 목적은 대규모 웹서버 비교가 아니라, **가벼운 홈서버에서 reverse proxy를 명확하게 운영하는 것**이었습니다. 그래서 설정이 단순하고, 이벤트 기반으로 동작하며, 여러 서비스를 한 진입점 아래에서 다루기 쉬운 Nginx가 더 잘 맞았습니다.

정리하면 Nginx를 둔 이유는 네 가지였습니다.

- **표준 포트 80/443만 외부에 열고 싶었습니다.**
- **내부 애플리케이션 포트(`8080`, `3000`)를 외부에 직접 노출하고 싶지 않았습니다.**
- **도메인이나 경로 기준으로 여러 서비스를 분기하고 싶었습니다.**
- **TLS 종료와 프록시 정책을 한 곳에서 관리하고 싶었습니다.**

# 4. 프록시와 리버스 프록시는 무엇이 다른가

Nginx를 이해하려면 먼저 **프록시**와 **리버스 프록시**를 구분해야 했습니다.

## 4.1 포워드 프록시

일반적으로 "프록시 서버"라고 하면 포워드 프록시를 말하는 경우가 많습니다. 포워드 프록시는 **클라이언트 앞단**에 서서, 사용자를 대신해 외부 서버에 요청을 보냅니다.

- 클라이언트 IP를 숨기고 싶을 때
- 조직 내에서 특정 사이트 접근을 통제할 때
- 자주 쓰는 응답을 캐시해 속도를 높이고 싶을 때

처럼 **사용자 측 대리인** 역할을 합니다.

## 4.2 리버스 프록시

반대로 리버스 프록시는 **서버 앞단**에 있습니다. 클라이언트는 실제 애플리케이션을 직접 보지 못하고, 먼저 리버스 프록시에 요청을 보냅니다. 그리고 리버스 프록시가 적절한 내부 서비스로 전달합니다.

![image.png](https://i.imgur.com/KbdgQ7u.png)

홈서버 운영에서 제가 원했던 것은 바로 이 구조였습니다.

- 사용자는 `https://www.git-ranker.com`으로만 접속합니다.
- Nginx는 이 요청을 받아 내부의 `127.0.0.1:8080`으로 전달합니다.
- 필요하다면 `grafana.git-ranker.com`은 `127.0.0.1:3000`으로 보낼 수도 있습니다.

즉, 리버스 프록시를 두면 **외부 주소는 단순해지고, 내부 구조는 유연해집니다.**

> **리버스 프록시를 두는 순간, 사용자는 서비스만 보고 포트 구조는 더 이상 보지 않게 된다.**

# 5. Nginx를 실제로 적용한 과정

## 5.1 설치와 서비스 활성화

먼저 Ubuntu 서버에 Nginx를 설치하고 부팅 시 자동으로 올라오도록 설정했습니다.

```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable --now nginx
```

## 5.2 설정 파일은 `conf.d` 아래로 분리

Nginx 기본 설정은 보통 `/etc/nginx/nginx.conf`에서 `/etc/nginx/conf.d/*.conf` 또는 `/etc/nginx/sites-enabled/*`를 include 하는 구조입니다.

이 방식의 장점은 분명했습니다. **애플리케이션마다 서버 블록을 파일 단위로 분리할 수 있어 관리가 쉬워집니다.**

```bash
sudoedit /etc/nginx/conf.d/git-ranker.conf
```

초기 HTTP 기준 설정은 아래처럼 두었습니다.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name www.git-ranker.com;

    access_log /var/log/nginx/git-ranker.access.log;
    error_log /var/log/nginx/git-ranker.error.log;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

이 설정에서 중요했던 부분은 세 군데였습니다.

- **`server_name`**: 외부에서 어떤 호스트 이름으로 들어온 요청을 받을지 정의합니다.
- **`proxy_pass`**: 실제 애플리케이션이 열려 있는 내부 주소를 가리킵니다.
- **`X-Forwarded-*` 헤더**: 애플리케이션이 원래 요청의 호스트, 클라이언트 IP, 스킴(HTTP/HTTPS)을 알 수 있게 넘깁니다.

<aside>
<strong>왜 프록시 헤더가 필요한가</strong><br>
애플리케이션 입장에서는 요청이 Nginx를 거쳐 들어오기 때문에, 원본 스킴과 클라이언트 정보를 잃기 쉽습니다. 이 헤더가 있어야 애플리케이션 로그, 절대 URL 생성, 리다이렉트 처리, 보안 정책이 더 정확하게 동작합니다.
</aside>

설정을 저장한 뒤에는 항상 문법 검사를 먼저 했습니다.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

# 6. Let's Encrypt와 Certbot으로 HTTPS 붙이기

도메인과 리버스 프록시만으로는 아직 반쯤밖에 끝나지 않았습니다. 사용자가 브라우저 경고 없이 접속하려면 **유효한 TLS 인증서**가 필요합니다.

## 6.1 인증서 발급 전에 먼저 확인한 것

Certbot을 실행하기 전에 두 가지를 먼저 확인했습니다.

1. **도메인이 이미 서버를 가리키고 있는가**
2. **외부에서 80 포트로 HTTP 검증 요청이 들어올 수 있는가**

Let's Encrypt의 HTTP-01 검증은 인증서를 발급하기 전에, 해당 도메인이 정말 이 서버에 도달하는지 확인합니다. 즉 **DNS가 아직 틀렸거나 포트포워딩이 안 되어 있으면 Certbot부터 막히는 구조**였습니다.

필요하다면 먼저 DNS 응답을 확인할 수 있습니다.

```bash
dig +short CNAME www.git-ranker.com
dig +short A hyoserver.iptime.org
```

## 6.2 Certbot 설치와 자동 설정

준비가 끝난 뒤에는 Certbot의 Nginx 플러그인으로 인증서를 발급했습니다.

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d www.git-ranker.com
```

이 명령은 인증서를 발급할 뿐 아니라, 기존 Nginx 설정에 SSL 관련 블록과 HTTP -> HTTPS 리다이렉트도 함께 추가해 줍니다.

## 6.3 301 대신 308을 쓴 이유

Certbot이 자동 생성한 리다이렉트는 기본적으로 **301**을 쓰는 경우가 많습니다. 일반적인 웹 페이지에서는 충분히 잘 동작하지만, 저는 **API 요청까지 같은 진입점을 탈 수 있다는 점**을 고려해 `308 Permanent Redirect`가 더 의도에 맞다고 판단했습니다.

- **301 Moved Permanently**: 영구 이동을 의미합니다. 다만 일부 클라이언트나 중간 계층은 비GET 요청에서 메서드를 기대와 다르게 바꿔 처리할 수 있습니다.
- **308 Permanent Redirect**: 영구 이동이면서도 **원래 HTTP 메서드와 요청 바디를 그대로 유지**하도록 의도가 더 분명한 상태 코드입니다.

그래서 HTTP 블록의 리다이렉트는 아래처럼 정리했습니다.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name www.git-ranker.com;

    return 308 https://$host$request_uri;
}
```

> **브라우저 주소창만 옮기는 것이 목적이라면 301도 충분할 수 있다. 하지만 애플리케이션 진입점 전체를 통일하는 관점에서는 308이 더 안전한 선택이었다.**

# 7. 적용 후에는 무엇을 확인했는가

설정을 마친 뒤에는 "열렸다"가 아니라 **어디까지 정상인지**를 확인했습니다.

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I http://www.git-ranker.com
curl -I https://www.git-ranker.com
sudo certbot renew --dry-run
```

정상이라면 아래 흐름이 보여야 합니다.

- `http://www.git-ranker.com` 접속 시 `308`로 HTTPS로 이동
- `https://www.git-ranker.com` 접속 시 유효한 인증서와 함께 응답
- `certbot renew --dry-run`이 통과해 자동 갱신 경로도 문제 없음

Before / After를 비교하면 변화는 더 분명했습니다.

- **Before**: `http://공인IP:8080`
- **After**: `https://www.git-ranker.com`

겉으로 보면 주소가 깔끔해진 것뿐이지만, 실제로는 아래 세 가지가 동시에 바뀐 셈입니다.

- **이름이 생겼습니다.**
- **공인 IP가 바뀌어도 따라갈 경로가 생겼습니다.**
- **애플리케이션 포트 구조를 외부에서 감추게 됐습니다.**

# 8. 마무리

이번 작업으로 얻은 가장 큰 변화는 "브라우저 자물쇠 아이콘" 하나가 아니었습니다. **홈서버에 외부 진입점을 설계하는 감각**이 조금 생겼다는 점이 더 컸습니다.

이전에는 애플리케이션 프로세스가 곧바로 인터넷에 노출된 상태였다면, 이제는 역할이 조금 더 분리됐습니다.

- 사용자는 **도메인**으로 접속합니다.
- **DDNS**는 바뀌는 공인 IP를 따라갑니다.
- **Nginx**는 80/443 진입점을 받아 내부 서비스로 전달합니다.
- **Let's Encrypt**는 그 경로에 HTTPS 신뢰를 더합니다.

홈서버를 운영하다 보면 "서비스를 띄우는 것"과 "운영 가능한 형태로 노출하는 것"이 다르다는 사실을 자주 체감하게 됩니다. 이번 글은 그 둘의 차이를 처음으로 분명하게 느낀 작업이었습니다.

# 참고 자료

- [홈 서버 구축기 - 웹서버 추가와 DNS 설정](https://hyeon9mak.github.io/home-server-web-server-and-dns/)
- [[개발환경 설정] Ubuntu 서버에 Nginx 설치 및 설정 (+ SSL 인증)](https://lightningtech.tistory.com/100)
- [Let's Encrypt 인증서로 NGINX SSL 설정하기](https://nginxstore.com/blog/nginx/lets-encrypt-%EC%9D%B8%EC%A6%9D%EC%84%9C%EB%A1%9C-nginx-ssl-%EC%84%A4%EC%A0%95%ED%95%98%EA%B8%B0/)
