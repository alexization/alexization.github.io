---
header:
  teaser: /assets/images/logo.png

title: "[Home Lab #3] DNS, DDNS, Nginx로 나만의 도메인으로 서비스 배포하기"
excerpt: "공인 IP와 포트 번호가 노출되는 환경에서 벗어나, DNS와 DDNS를 결합하고 Nginx 리버스 프록시를 통해 깔끔한 도메인과 HTTPS 보안을 적용 과정"
categories:
  - Home Lab
tags:
  - DNS
  - DDNS
  - Nginx
  - Reverse Proxy
  - HTTPS
  
toc_label: ""
toc: true
toc_sticky: true

date: 2025-12-16
last_modified_at: 2025-12-16
---
# 1. `http://{공인IP}:8080` 을 넘어서

미니 PC에 **Git Ranker** 서비스를 배포한 후 지인들에게 공유하려다 보니, 몇 가지 큰 장벽에 부딪혔습니다.

- 지인들에게 [`http://175.xxx.xxx.xxx:8080`](http://175.xxx.xxx.xxx:8080) 이라는 주소를 주는 것은 굉장히 불친절해 보였습니다. 외우기 힘들 뿐더러, 저의 실제 공인 IP와 서비스 포트 번호가 그대로 노출된다는 점이 찝찝했습니다.
- 또한, 브라우저에서 `https` 가 아닌 `http` 로 접속하면 ‘주의 요함’ 또는 ‘이 사이트는 안전하지 않습니다’ 라는 경고가 뜨기 때문에 서비스에 대한 불안감을 심어줄 것이라 느꼈습니다.

이 문제를 해결하기 위해 **이름을 붙이고, 변하는 IP에 대응하며 보안(HTTPS)을 입히는 인프라 고도화 작업**을 수행했습니다.

---

# 2. 도메인 이름 사용을 위한 DNS 적용

저희가 IP 주소를 일일이 외우지 않는 이유는 **DNS(Domain Name System)** 덕분입니다. DNS는 복잡한 숫자 주소를 사람이 기억하기 쉬운 **‘이름’**으로 변환해 주는 인터넷의 전화번호부 역할을 합니다.

## 2.1 도메인 구매와 레코드 설정 (A vs CNAME)

저는 [가비아](https://www.gabia.com/)와 같은 등록 대행자를 통해 [`git-ranker.com`](http://git-ranker.com) 도메인을 구매했고 서버와 연결하기 위해 **레코드(Record)**를 설정해줬습니다.

- **A 레코드 (Address Record) :** 도메인 이름을 **특정 IP 주소**에 직접 연결합니다. 고정 IP를 가진 서버에 주로 사용합니다.

  (예: [`example.com`](http://example.com) → `172.xxx.xxx.xxx`)

- **CNAME 레코드 (Canonical Name Record) :** 도메인을 **다른 도메인 이름(별칭)**에 연결합니다.

  (예: [`example.com`](http://example.com) → `myserver.iptime.org`)


![record](https://imgur.com/r7NHaAV.png)

*(A 레코드 관련 설정은 다음 포스팅에서 다룰 예정입니다.)*

> 저의 경우 iptime 공유기의 DDNS 서비스(`hyoserver.iptime.org`)를 이미 이용 중이었기에, 가비아 도메인을 **CNAME**으로 설정하여 iptime 주소를 바라보게 했습니다. 이렇게 하면 실제 IP가 바뀌더라도 공유기가 DDNS 정보를 갱신하는 것만으로 도메인 연결이 자동으로 유지됩니다.

---

# 3. 유동 IP의 한계와 DDNS(Dynamic DNS)

가정용 인터넷은 ISP(인터넷 서비스 제공자) 정책에 따라 **유동 IP**를 사용합니다. 즉, 공유기를 재부팅하거나 일정 시간이 지나면 서버의 공인 IP가 수시로 바뀔 수 있습니다.

**DDNS**는 공유기의 IP가 바뀔 때마다 그 정보를 DDNS 서버에 즉각 업데이트하여, **IP 변화와 상관없이 항상 고정된 도메인 이름으로 내 서버를 찾아올 수 있게 해주는 기술**입니다.

---

# 4. 웹 서버 선택

웹 서버는 클라이언트의 요청을 가장 먼저 받아 처리하는 ‘문지기’ 입니다.

## 4.1 왜 Nginx 인가? (vs Cloudflare, Apache)

웹 서버를 선택할 때 대표적인 후보군인 Apache, Cloudflare와 Nginx 중 저는 Nginx를 선택했습니다.

1. **Cloudflare 이슈 :** 최근 Cloudflare 같은 거대 서비스의 장애가 발생하면 전 세계 인터넷의 상당 부분이 마비되는 현상을 보며, **인프라 자립**의 가치를 느꼈습니다. 또한, 내부 로컬 환경 설정을 직접 제어하는 능력을 키우고 싶었습니다.
2. **Apache vs Nginx :** Apache는 요청마다 프로세스를 생성하는 방식인 반면, Nginx는 **이벤트 기반(Event-driven) 구조**로 설계되어 적은 자원으로도 훨씬 많은 동시 접속을 처리할 수 있어 미니 PC 환경에 최적이라 판단했습니다.

---

# 5. 프록시와 리버스 프록시

Nginx를 사용하는 가장 큰 이유 중 하나는 **리버스 프록시** 설정입니다.

## 5.1 프록시 (Forward Proxy)

일반적으로 ‘프록시’라고 하면 포워드 프록시를 의미합니다. 클라이언트와 인터넷 사이에 위치하여 클라이언트를 대신해 서버에 요청을 보냅니다.

- 사용자가 웹사이트에 접속하려 할 때, 요청이 서버로 바로 가지 않고 프록시 서버를 거쳐 전달됩니다.
- **클라이언트의 신원(IP)을 숨기는 익명성 보장, 특정 사이트 접근 차단 우회, 그리고 자주 찾는 데이터를 미리 저장해두는 캐싱**을 통해 속도를 높이는 데 사용됩니다.

## 5.2 리버스 프록시 (Reverse Proxy)

반면 리버스 프록시는 인터넷과 서버 사이에 위치하여 서버를 대신해 클라이언트의 요청을 받습니다.

- 클라이언트는 서버의 존재를 직접 알지 못하고 리버스 프록시(Nginx) 주소로 요청을 보냅니다. Nginx는 이 요청을 받아 내부 네트워크에서 실제 동작 중인 적절한 서비스로 전달합니다.
- 실제 서버 정보를 외부에 숨겨 보안을 강화하고, **여러 포트에서 돌아가는 서비스들을 하나의 도메인 아래로 묶어주는 단일 진입점** 역할을 합니다.

![image.png](https://imgur.com/KbdgQ7u.png)

제가 리버스 프록시를 설정하면서 느낀 가장 큰 장점은 **포트 추상화를 통한 유연성**입니다.

1. 외부에서는 표준 포트인 `80(HTTP)`이나 `443(HTTPS)`으로만 접속하면 됩니다. 뒤에서 실제 서비스가 `8080` 으로 돌든 `3000` 으로 돌든 사용자는 알 필요가 없으며, URL 뒤에 지저분한 포트 번호를 붙이지 않아도 됩니다.
2. 또한, **단일 진입점 관리**가 가능한데,
    - [`git-ranker.com`](http://git-ranker.com) → 내부 8080 포트 연결
    - [`grafana.git-ranker.com`](http://grafana.git-ranker.com) → 내부 3000 포트 연결

   ⇒ 위와 같이 여러 서비스를 Nginx 가 분기 처리를 가능하도록 해줍니다.


---

# 6. Nginx 적용 과정

## 6.1 Nginx 설치 및 기본 설정

```bash
# Nginx 설치
sudo apt update
sudo apt install nginx -y

# 서비스 활성화
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 6.2 `nginx.conf` 설정

`nginx.conf`
```bash
include /etc/nginx/conf.d/*.conf;
include /etc/nginx/sites-enabled/*;
```

유지보수성을 높이기 위해 Nginx는 `/etc/nginx/conf.d/` 디렉토리의 파일들을 include 하여 관리하는 방식을 권장합니다.

따라서, `conf.d` 하위 경로에 애플리케이션 별로 원하는 nginx 설정 conf 파일을 작성해주면 됩니다.
```bash
sudo vim /etc/nginx/conf.d/{애플리케이션 이름}.conf
```

생성한 애플리케이션 설정 스크립트를 작성합니다. 초기에는 HTTP(80 포트) 기반으로 설정합니다.

```
server {
    listen 80;
    listen [::]:80; 
		
    server_name app.domain.com; # 본인의 도메인
		
    access_log /var/log/nginx/app.access.log;
    error_log /var/log/nginx/app.error.log;
		
    location / {
        proxy_pass http://127.0.0.1:8080; # 내부 애플리케이션 엔드포인트
				
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

# 7. HTTPS 보안: Let’s Encrypt와 Certbot

**Let’s Encrypt**는 누구나 무료로 SSL 인증서를 발급받을 수 있게 해주는 비영리 인증 기관입니다. 이 발급 과정을 자동화해주는 도구가 바로 **Certbot** 입니다.

## 7.1 Certbot 설치 및 인증서 발급

```bash
sudo apt install certbot python3-certbot-nginx -y

# 인증서 발급 및 Nginx 설정 자동 반영
sudo certbot --nginx -d app.domain.com
```

인증서 발급이 완료되면 Certbot이 기존에 작성했던 `{애플리케이션 이름}.conf` 파일을 자동으로 수정하여 SSL 설정과 리다이렉트 로직을 추가해줍니다.

## 7.2 HTTP 301 vs 308

Certbot이 자동으로 생성해준 리다이렉트 설정은 기본적으로 **HTTP 301**을 사용합니다. 하지만 저는 이를 **HTTP 308**로 변경해주었습니다.

### 왜 308 리다이렉트를 사용하는가 ?

- **301 Moved Permanently :** 요청을 새 주소로 영구 이동시킵니다. 하지만 과거 브라우저 표준에 따라 **POST 요청을 GET 요청으로 변경해버리는 고질적인 문제**가 있습니다. API 요청 시 데이터 손실이 발생할 수 있습니다.
- **308 Permanent Redirect :** 301과 동일하게 영구 이동을 의미하지만, **HTTP 메서드(GET/POST 등)를 절대 변경하지 않습니다.** 즉, POST로 보낸 데이터가 리다이렉트 후에도 그대로 POST로 유지됩니다.

따라서, Certbot이 생성한 코드 부분을 찾아 아래와 같이 수정했습니다.

```
if ($host = app.domain.com) {
    return 308 https://$host$request_uri; # 301에서 308로 변경
}
```

---

# 8. Before & After

모든 설정을 마쳤다면 설정을 테스트하고 Nginx를 재시작해줍니다.

```bash
sudo nginx -t
sudo systemctl reload nginx

# HTTPS 접속 헤더 확인
curl -I https://app.domain.com
```

- **Before :** `http://공인IP:8080` → 공인IP와 포트번호 모두 노출
- **After :** `https://app.domain.com` → HTTPS 자물쇠 마크, 포트 번호 제거, 유동 IP 대응

---

# 9. 마무리

이번 작업을 통해 단순히 서비스를 배포하는 것을 넘어, 실제 웹 서비스가 어떻게 사용자에게 전달되는지 인프라의 과정을 일부 이해할 수 있었고 이제 지인들에게 제 서비스 도메인을 안전하고 깔끔하게 전달할 수 있게 되었습니다.

---

# 참고 자료

[홈 서버 구축기 - 웹서버 추가와 DNS 설정](https://hyeon9mak.github.io/home-server-web-server-and-dns/)

[[개발환경 설정]  Ubuntu 서버에 Nginx 설치 및 설정 (+ SSL 인증)](https://lightningtech.tistory.com/100)

[Let’s Encrypt 인증서로 NGINX SSL 설정하기](https://nginxstore.com/blog/nginx/lets-encrypt-%EC%9D%B8%EC%A6%9D%EC%84%9C%EB%A1%9C-nginx-ssl-%EC%84%A4%EC%A0%95%ED%95%98%EA%B8%B0/)