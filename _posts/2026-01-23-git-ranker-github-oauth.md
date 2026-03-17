---
header:
  teaser: /assets/images/logo.png
  og_image: "https://imgur.com/94i25FG.png"

title: "[Git Ranker #9] GitHub OAuth 인증 시스템 구축기"
excerpt: "사용자 피드백으로 급히 도입한 인증 시스템에서 SameSite 쿠키 삽질, Private/Public 데이터 불일치 문제를 Token Pool로 해결한 과정"

categories:
  - Git Ranker

tags:
  - GitHub OAuth
  - JWT
  - Spring Security
  - Cookie
  - Rate Limit

toc_label: "OAuth 인증 구축기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-github-oauth/
date: 2026-01-23
last_modified_at: 2026-01-23
---
Git Ranker를 처음 기획할 때 **로그인 기능은 전혀 생각하지 않았습니다.**

많은 사용자들과 트래픽을 원했던 저는 서비스를 이용하기 위해 회원가입을 요청하면, 사용자들이 선뜻 이용하지 않을 것이라는 이유뿐이었습니다.

하지만 이 얕은 생각은 첫 배포 이후 **사용자들의 피드백**을 받고 생각이 바뀌었습니다.

# 인증 기능 도입 배경

첫 배포 후 몇 가지 피드백이 들어왔습니다.

*"**삭제 기능**은 없나요?"*

*"이거 **개인정보 보호에 위반**되는 거 아닌가요?"*

![피드백1](https://imgur.com/94i25FG.png)

*"**다른 사람 정보도 그냥 이름만 넣으면 조회**가 되네요?"*

![피드백3](https://imgur.com/6LYsf7v.png)

![피드백2](https://imgur.com/7sBnx03.png)

피드백을 받고 보니 확실히 문제가 있었습니다. 누군가가 나의 GitHub 사용자명을 입력하면, **내 동의 없이 활동 데이터가 수집되고 랭킹에 표시**됩니다. 게다가 "삭제해주세요"라는 요청이 와도 **본인인지 확인할 방법이 없었습니다.**

그래서 **본인만 자기 정보를 등록하고 관리**할 수 있도록 인증 기능을 붙이기로 했습니다.

*(피드백 주신 모든 분들 감사합니다!)*

---

# GitHub App vs OAuth App 선택

GitHub 인증을 붙이려고 [공식 문서](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)를 열었는데, 선택지가 두 개였습니다.

- GitHub App
- OAuth App

처음엔 뭔 차이인지 몰라 일단 공식 문서를 정독했습니다.

## GitHub App의 특징

문서를 읽어보니 GitHub App은 기능이 상당히 많았습니다. 세분화된 권한, Webhook, 저장소별 설치 등 다양한 기능을 제공하고 있었는데, 읽으면서 드는 생각은 하나였습니다.

> "나한테 이게 필요한가?"

Git Ranker가 하는 일을 다시 생각해봤습니다.

1. 사용자가 GitHub 으로 로그인한다.
2. 본인 확인이 되면 Public 활동 데이터를 가져온다.
3. 점수를 계산해서 랭킹에 보여준다.

끝입니다. 저장소를 수정하거나, 코드를 푸시하거나, 이슈를 자동으로 만드는 기능은 아무것도 없습니다. 

그저 **"너 누구야?" 확인하고 "너의 공개 활동이 이만큼이야" 라고 보여주는 게 전부**입니다.

GitHub App은 주로 CI/CD 도구나 봇처럼 사용자를 대신해서 뭔가를 **"해주는"** 앱을 만들 때 쓰는 것이라고 느꼈습니다. 하지만 저는 그냥 **로그인만 되면** 됩니다.

## OAuth App 선택 이유

OAuth App은 단순합니다. 사용자가 "이 앱에 내 정보 접근을 허용할게" 라고 동의하면 `Access Token`을 받아서 API를 호출하면 끝입니다.

구현도 훨씬 간단하고, **Spring Security에 OAuth2 Client를 붙이면** 거의 자동으로 처리됩니다.

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          github:
            scope:
              - read:user
              - user:email
```

`repo` 를 요청하면 사용자 저장소에 읽기/쓰기 권한까지 생기는데 그럴 필요가 전혀 없으니, scope는 최소한인 `read:user`와 `user:email`만 요청했습니다.

---

# Session vs JWT 인증 방식 비교

인증을 구현하려면 또 하나 결정해야 할 것이 있습니다. **로그인 상태를 어떻게 관리**할 것인지에 대한 문제입니다.

## Session의 장단점

**Session은 서버에서 상태를 관리**합니다. 로그아웃하면 서버에서 세션을 지워버리면 끝이라 깔끔하지만, 단점이 존재합니다.

- 요청마다 Redis나 DB에서 세션을 조회해야 합니다.
- 서버가 여러 대면 세션 공유에 문제가 생깁니다.

지금은 서버 한 대지만, 나중에 확장할 가능성이 존재할 수 있으니... 고민이 됐습니다.

## JWT의 장단점

JWT는 토큰 자체에 정보가 들어있어서 **서버에서 DB 조회 없이 서명만 확인**하면 끝입니다. 하지만 이 방식에도 문제가 존재합니다.

> 한번 발급한 JWT는 무효화가 안 된다.

**만약 `Access Token`이 탈취당하면 어떻게 될까요?** 만료될 때까지 속수무책입니다. 서버에서 "이 토큰은 더 이상 유효하지 않아"라고 선언할 방법이 없습니다.

*(물론 **블랙리스트 방식**으로 할 수 있긴 하지만, 그러면 결국 DB를 조회해야 하니 JWT를 쓰는 의미가 없어집니다.)*

## 하이브리드 방식 채택

고민 끝에 하이브리드 방식을 선택했습니다.

- **Access Token**: JWT로 발급하고 수명은 짧게 (30분)
- **Refresh Token**: 랜덤 문자열로 발급하고 DB에 저장하며 수명은 길게 (1일)

`Access Token`이 탈취돼도 30분이면 만료됩니다. `Refresh Token`이 탈취되면 DB에서 지워버리면 됩니다.

```java
// Access Token은 JWT
public String createAccessToken(String username, Role role) {
    return Jwts.builder()
            .subject(username)
            .claim("role", role.getKey())
            .expiration(new Date(System.currentTimeMillis() + 30 * 60 * 1000))
            .signWith(key, Jwts.SIG.HS512)
            .compact();
}

// Refresh Token은 랜덤 문자열
public String createRefreshToken() {
    byte[] randomBytes = new byte[32];
    new SecureRandom().nextBytes(randomBytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
}
```

`Refresh Token` 수명을 1일로 한 이유가 있습니다. 

GitHub OAuth `Access Token`은 만료가 없어서 사용자가 해지하기 전까지 영원히 유효합니다. 그래서 `Refresh Token`의 만료 시점을 재로그인 시점으로 관리하기 위해 1일로 설정했습니다.

---

# Cookie SameSite 설정 문제

`Refresh Token`을 쿠키에 저장하기로 했습니다. `HttpOnly`를 설정하면 JavaScript에서 접근하지 못하니 XSS 공격에 안전합니다.

```java
ResponseCookie.from("refresh_token", tokenValue)
        .httpOnly(true)
        .secure(true)
        .sameSite("Strict")  // 여기가 문제였습니다
        .build();
```

처음엔 `SameSite=Strict`로 설정했습니다. 가장 안전하다고 하니까요.

## OAuth 리다이렉트 후 쿠키 미전송 현상

그런데 이상한 일이 벌어졌습니다. GitHub에서 로그인하고 돌아오면 로그인이 안 돼있습니다.

분명 GitHub 인증은 성공했고 서버에서 토큰도 발급했는데, 클라이언트에서 확인하면 쿠키가 없습니다.

> *"뭐지? 분명 Set-Cookie 헤더 보냈는데?"*

브라우저 개발자 도구를 열어서 Network 탭을 확인했습니다. Set-Cookie 헤더가 있지만 Application 탭에서 쿠키를 확인하면 없었습니다.

삽질하다가 [PortSwigger 문서](https://portswigger.net/web-security/csrf/bypassing-samesite-restrictions)를 발견했습니다.

## SameSite=Strict의 함정

`SameSite=Strict`로 설정된 쿠키는 **cross-site navigation에서 전송되지 않습니다**.

OAuth 로그인 흐름을 다시 생각해보겠습니다.

![OAuth 로그인 흐름](https://imgur.com/ENKOTnz.png)

1. 사용자가 우리 사이트에서 "GitHub 로그인" 클릭
2. GitHub 로그인 페이지로 이동
3. GitHub에서 로그인 완료
4. GitHub이 우리 사이트 callback URL로 리다이렉트 ← **여기!**

4번에서 GitHub(외부 사이트)에서 우리 사이트로 리다이렉트됩니다. 브라우저 입장에서 이건 **cross-site navigation** 이기 때문에 `SameSite=Strict` 쿠키는 이 요청에 포함되지 않습니다.

### SameSite=Lax로 해결

```java
.sameSite("Lax")
```

`SameSite=Lax`는 **top-level navigation (주소창에서 직접 이동하는 것)** 에서는 쿠키를 보냅니다. OAuth 리다이렉트도 top-level navigation이라 괜찮습니다.

*POST 요청 같은 건 여전히 막아서 CSRF 공격은 방어됩니다.*

---

# GitHub Access Token, DB에 저장할까?

OAuth 로그인을 하면 GitHub `Access Token`을 받게됩니다.

> 사용자 개인마다 `Access Token`을 DB에 저장해서 나중에 API 호출할 때 써야하나?

고민하다가 DB에는 저장하지 않기로 했습니다. 이유는 간단합니다.

1. **보안**: DB가 털리면 사용자들의 GitHub 토큰이 전부 털립니다.
2. **관리 비용**: 암호화해서 저장하고 주기적으로 갱신하는 등 관리가 번거롭습니다.

대신 **서버 메모리(세션)에 담아두고** 사용하기로 했습니다.

회원가입 시 최초 데이터 조회나 사용자가 수동으로 전체 기간의 데이터를 갱신할 때 이 토큰을 사용하고, 세션이 만료되면 자연스럽게 사라지는 구조로 설계했습니다.

정리하면,
- **회원가입 / 수동 갱신 :** 사용자 본인의 `Access Token` 사용
- **배치 작업 :** 시스템 토큰 사용

**시스템 토큰을 배치에서만 사용하기 위한 합리적인 설계**라고 생각했는데, 여기서 예상치 못한 문제가 발생했습니다.

---

# 점수가 왜 자꾸 바뀌지?

여기서 진짜 큰 문제가 터졌습니다.

로그인 기능을 붙이고 다시 재배포하여 운영을 하다보니 이상한 현상을 발견했습니다.

```
사용자 A가 회원가입했을 때 점수: 1,500점
다음 날 배치 돌고 나서 점수: 800점
```

> ???

**같은 사람인데 하루만에 점수가 거의 반토막이 났습니다.** 버그인가 싶어서 코드를 샅샅이 뒤졌습니다. 점수 계산 로직은 문제가 없고, 데이터 저장도 문제가 없었습니다.

한참을 찾다가 원인을 알아냈습니다.

## 원인 분석: API 요청자에 따른 데이터 차이

GitHub API는 **누가 요청하느냐에 따라 다른 데이터를 줍니다**.

회원가입할 때는 사용자 본인의 `Access Token`으로 API를 호출했습니다. 이때는 본인의 **Private 저장소 활동까지 포함**된 데이터가 옵니다.

그런데 매일 새벽에 돌아가는 배치는 어떨까요? 제가 만든 시스템 토큰으로 API를 호출합니다. 이때는 제3자 관점이라 **Public 활동만** 옵니다.

그 결과,
- **회원가입 / 수동 갱신 :** Private + Public = 1,500점
- **배치 작업 :** Public만 = 800점

점수가 들쑥날쑥한 건 버그가 아니라 **설계 결함**이었습니다.

## 해결 방안 검토

### 방법 1: 사용자 토큰을 DB에 저장

항상 사용자 토큰으로 API를 호출하면 일관된 데이터가 나옵니다. 하지만 이 방법은 **앞에서 설명했던 이유로 기각했습니다.**

### 방법 2: 저장소별로 Public만 필터링

```graphql
query {
  user(login: "username") {
    contributionsCollection {
      commitContributionsByRepository(maxRepositories: 100) {
        repository {
          isPrivate
        }
        contributions {
          totalCount
        }
      }
    }
  }
}
```

데이터 요청을 보낼 때 `isPrivate: false`인 것만 골라서 합산하는 방법도 있습니다. 하지만 `maxRepositories: 100`이라는 제한이 있어서, **저장소가 100개가 넘는 사용자**에게는 정확한 집계가 되지 않습니다.

### 방법 3: 모든 요청에 시스템 토큰 사용

배치든 회원가입이든 **무조건 시스템 토큰을 호출**한다면, 항상 제3자 관점이라 Public 데이터만 일관되게 가져올 수 있을겁니다.

하지만, GitHub API **Rate Limit이 시간당 5,000 포인트**입니다. 아직은 사용자가 많지 않아 문제가 없지만, 사용자가 많아진다면 배치에만 써도 빠듯할겁니다.

(*평균적으로 신규 사용자 등록시 10 포인트를 사용합니다.*)

---

# 최종 선택: Token Pool

고민 끝에 시스템 토큰을 **여러 개** 두기로 했습니다.

```
토큰 1: 5,000 포인트
토큰 2: 5,000 포인트
토큰 3: 5,000 포인트
─────────────────────
총 시간당 15,000 포인트
```

하나가 한도에 가까워지면 다음 토큰으로 전환합니다.

## Token Pool 구현

### 토큰 선택 전략

처음엔 단순하게 **요청마다 순서대로 토큰을 돌려가며 쓰는 `Round-Robin` 방식**으로 하려고 했습니다.

하지만 이러면 토큰에 여유가 있어도 **불필요하게 전환**이 일어나고, **모든 토큰이 균등하게 소모**되어 한꺼번에 Rate Limit에 걸릴 위험이 있습니다.

그래서 **Threshold 기반**으로 했습니다. 현재 토큰의 남은 횟수가 임계치 이하가 될 때만 다음 토큰으로 전환하는 방식입니다.

```java
public String getToken() {
    tokenLock.lock();
    try {
        for (int i = 0; i < tokens.size(); i++) {
            int idx = (currentIndex + i) % tokens.size();
            TokenState token = tokens.get(idx);

            if (token.getRemaining() > threshold) {
                if (idx != currentIndex) {
                    currentIndex = idx;
                }
                return token.getValue();
            }
        }

        // 모든 토큰 소진
        throw new GitHubRateLimitExhaustedException(findEarliestResetAt());
    } finally {
        tokenLock.unlock();
    }
}
```

## 동시성 처리

배치 작업과 사용자 요청이 동시에 들어올 수 있습니다. 그래서 `ReentrantLock`으로 동시성을 제어했습니다.

처음엔 `synchronized`를 썼는데, 나중에 타임아웃 같은 기능을 넣으려면 `ReentrantLock`이 더 낫다고 판단해서 변경했습니다.

```java
private final ReentrantLock tokenLock = new ReentrantLock();
```


## Rate Limit 초과 시 에러 처리

모든 토큰이 Rate Limit에 걸리면 어쩔 수 없습니다. 이 경우에는 사용자한테 솔직하게 알려주기로 했습니다.

```json
{
  "code": "GITHUB_RATE_LIMIT_EXHAUSTED",
  "message": "GitHub API 호출 한도에 도달했습니다. 14:30 이후에 다시 시도해주세요."
}
```

*언제 리셋되는지 알려주는 게 중요합니다. 그래야 사용자가 언제 다시 시도할지 알 수 있으니까요.*

---

# 마무리

OAuth를 붙이는 건 별거 아니라고 생각했는데, 생각보다 고려할 게 많았습니다.

특히 SameSite 쿠키 설정과 Private/Public 데이터 문제는 직접 겪어보지 않았으면 몰랐을 것 같습니다. 문서에는 "SameSite=Strict가 가장 안전합니다" 라고만 나와있지, OAuth 리다이렉트에서 문제가 생긴다는 건 알려주지 않습니다.

그리고 GitHub API가 요청자에 따라 다른 데이터를 준다는 것도 몰랐습니다. 같은 사용자 데이터를 조회하는데 누가 요청하느냐에 따라 결과가 달라진다니, 직접 겪어보지 않았으면 알 수 없었을 것입니다.