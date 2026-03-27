---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/94i25FG.png"

title: "[Git Ranker #9] GitHub OAuth를 붙였더니 점수가 흔들렸다"
excerpt: "사용자 소유권 확인을 위해 OAuth를 도입했지만, 가입/수동 갱신과 배치가 서로 다른 토큰으로 GitHub를 조회하면서 점수 일관성이 깨졌다. 세션 기반 사용자 토큰 설계에서 Token Pool과 쿠키 구조를 정리해간 회고"

categories:
  - Git Ranker

tags:
  - GitHub OAuth
  - Spring Security
  - JWT
  - Token Pool
  - Cookie
  - Rate Limit

toc_label: "OAuth 회고"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-github-oauth/
redirect_from:
  - /git ranker/git-ranker-github-oauth/
date: 2026-01-23
last_modified_at: 2026-03-27
---
Git Ranker를 처음 기획할 때는 로그인 기능을 넣을 생각이 없었습니다.

회원가입 장벽을 없애고 싶었고, GitHub 사용자명만 입력하면 바로 점수를 보여주는 편이 더 가볍다고 생각했기 때문입니다.

그런데 첫 배포 직후 들어온 피드백은 전혀 다른 문제를 가리키고 있었습니다.

# 1. 인증이 필요해진 이유

*"**삭제 기능**은 없나요?"*

*"이거 **개인정보 보호에 위반**되는 거 아닌가요?"*

![피드백1](https://i.imgur.com/94i25FG.png)

*"**다른 사람 정보도 그냥 이름만 넣으면 조회**가 되네요?"*

![피드백3](https://i.imgur.com/6LYsf7v.png)

![피드백2](https://i.imgur.com/7sBnx03.png)

피드백의 핵심은 "로그인이 없어서 불편하다"가 아니었습니다. **본인 확인 없이 타인의 GitHub 활동을 등록하고, 삭제 요청이 와도 진짜 본인인지 검증할 방법이 없었다**는 점이 문제였습니다.

Git Ranker는 공개 활동을 기반으로 점수를 계산하지만, "누가 내 데이터를 등록할 수 있는가"는 별개의 문제였습니다. 이 시점부터 인증의 목적은 회원가입 편의가 아니라 **소유권 확인**으로 바뀌었습니다.

그래서 방향을 이렇게 정했습니다.

1. 본인만 자신의 GitHub 계정을 등록할 수 있어야 한다.
2. 본인만 자신의 데이터를 수동 갱신하거나 삭제할 수 있어야 한다.
3. 서비스는 GitHub 저장소를 수정할 필요가 없으니, 필요한 권한만 최소로 요청해야 한다.

<aside>
<strong>이 글에서 인증이 해결하려던 문제</strong><br>
로그인 편의가 아니라, "이 GitHub 계정을 실제로 소유한 사람이 등록했다"는 근거를 만드는 것이었습니다.
</aside>

# 2. GitHub App 대신 OAuth App을 선택한 이유

공식 문서를 읽고 가장 먼저 고민한 건 GitHub App과 OAuth App 중 무엇을 쓸지였습니다. [GitHub App은 더 세밀한 권한, 저장소 단위 제어, 짧은 수명의 토큰을 제공](https://docs.github.com/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)합니다. 그래서 처음에는 오히려 *"그럼 GitHub App이 더 좋은 것 아닌가?"* 라는 생각부터 들었습니다.

하지만 Git Ranker가 풀어야 했던 문제는 저장소 자동화가 아니라 **GitHub 계정 소유권 확인**이었습니다.

당시 후보는 크게 세 가지였습니다.

- **자체 회원가입/이메일 인증**: 서비스 안에서 계정은 만들 수 있지만, 사용자가 입력한 GitHub username이 진짜 본인 것인지 증명하지 못합니다.
- **GitHub App**: 세밀한 권한과 Webhook이 강점이지만, 설치 단위와 권한 설계를 함께 가져와야 해서 Git Ranker에는 과했습니다.
- **OAuth App**: 사용자가 GitHub에서 직접 동의한 뒤 그 사용자의 자격으로 필요한 정보만 읽을 수 있어서, "이 사람이 이 GitHub 계정의 주인인가?"라는 질문에 가장 직접적으로 답할 수 있었습니다.

> *이 서비스에 필요했던 것은 "사용자를 대신해 저장소를 조작하는 앱"이 아니라, "GitHub 계정 소유권을 증명하고 필요한 정보만 읽는 최소한의 인증"이었습니다.*

OAuth App을 택한 뒤에도 권한은 최대한 줄였습니다. [`scope`는 OAuth token이 접근할 수 있는 범위를 제한하는 장치](https://docs.github.com/en/developers/apps/scopes-for-oauth-apps)이기 때문에, Git Ranker에서는 아래 두 가지만 요청했습니다.

```yaml
scope:
  - read:user   # GitHub 프로필과 사용자 정보를 읽기 위한 범위
  - user:email  # 사용자의 이메일 정보를 읽기 위한 범위
```

여기서 `scope`는 "이 앱이 어디까지 볼 수 있는가"를 정하는 허용 범위입니다. `repo`까지 요청하면 저장소 내용까지 건드릴 수 있는 더 강한 권한이 생기는데, Git Ranker는 저장소를 수정할 일이 없었습니다. *문제 해결에 필요하지 않은 권한은 처음부터 요청하지 않는 쪽이 맞다고 판단했습니다.*

# 3. 첫 번째 설계: GitHub 토큰은 세션에, 서비스 인증은 별도로

OAuth를 붙이면서 가장 먼저 정리해야 했던 것은 **이름은 비슷하지만 서로 다른 세 종류의 토큰**이었습니다.

<aside>
<strong>용어를 먼저 정리하면</strong><br>
GitHub Access Token은 GitHub API를 읽기 위한 열쇠이고, 서비스 Access Token과 Refresh Token은 Git Ranker 안에서 로그인 상태를 유지하기 위한 열쇠입니다. 같은 "토큰"이라는 이름을 쓰지만 해결하는 문제가 다릅니다.
</aside>

초기 구조에서는 GitHub이 로그인 직후 돌려준 토큰을 DB에 저장하지 않고 서버 세션에만 두었습니다. 코드로 보면 아래와 같습니다.

```java
String githubAccessToken = extractGitHubAccessToken(authentication);
// GitHub가 로그인 직후 돌려준 "사용자용 API 열쇠"

request.getSession().setAttribute("GITHUB_ACCESS_TOKEN", githubAccessToken);
// DB가 아니라 서버 세션에만 잠깐 보관

userRegistrationService.register(attributes, githubAccessToken);
// 최초 가입 시 이 토큰으로 사용자의 GitHub 활동을 수집
```

여기서 중요한 건 변수명이 아니라 구조였습니다. *"GitHub이 준 사용자용 토큰을 오래 저장하지 말고, 필요한 순간에만 잠깐 쓰자"*는 쪽에 무게를 둔 것입니다.

이렇게 한 이유는 세 가지였습니다.

1. GitHub 토큰을 DB에 저장하면 유출 시 파급 범위가 너무 커진다.
2. 최초 가입과 수동 전체 갱신처럼 "지금 로그인한 본인"의 동의가 필요한 순간에만 잠깐 쓰고 싶었다.
3. GitHub API 호출 문제와 우리 서비스 로그인 문제를 섞고 싶지 않았다.

[OAuth token은 사용자가 철회하기 전까지 유지될 수 있습니다](https://docs.github.com/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps). 그래서 더더욱 DB에 장기 보관하는 방식은 부담스러웠습니다.

한편 서비스 내부 로그인 상태는 별도로 관리했습니다. 최종적으로는 아래처럼 우리 서비스용 Access Token과 Refresh Token을 따로 발급했습니다.

```java
String accessToken = jwtProvider.createAccessToken(userResponse.username(), userResponse.role());
// Git Ranker API 요청에서 "이미 로그인한 사용자"인지 확인하는 JWT

String refreshTokenValue = refreshTokenService.issueRefreshToken(user);
// access token이 만료되었을 때 새로 발급하기 위한 서버 관리용 토큰
```

<aside>
<strong>왜 굳이 둘로 나눴나</strong><br>
GitHub 토큰은 외부 API를 읽기 위한 자격 증명이고, 서비스 토큰은 Git Ranker 안에서 로그인 상태를 유지하기 위한 세션 장치였습니다. 목적이 다르니 저장 위치와 수명 전략도 달라져야 했습니다.
</aside>

이 분리를 해두니 이후의 판단이 훨씬 쉬워졌습니다. *외부 API 자격 증명과 서비스 로그인 상태는 같은 문제처럼 보여도, 실제로는 완전히 다른 층위의 설계 문제였습니다.*

# 4. 인증은 붙였는데, 점수는 오히려 흔들리기 시작했다

인증 도입의 1차 목표는 달성했습니다. 본인만 가입하고 관리할 수 있게 되었으니까요.

문제는 그 다음이었습니다. 운영 중 다시 데이터를 보니, 같은 사용자의 점수가 하루 사이에 크게 달라지는 경우가 생겼습니다.

```text
회원가입 직후 점수: 1,500점
다음 날 배치 후 점수: 800점
```

처음에는 점수 계산식이 잘못된 줄 알았습니다. 하지만 원인은 수식이 아니라 **데이터를 가져오는 관점이 달랐던 것**이었습니다.

- **사용자 토큰**: 로그인한 사용자의 권한으로 GitHub를 조회하는 방식
- **시스템 토큰**: 서비스가 공용으로 사용하는 권한으로 GitHub를 조회하는 방식

초기 구조에서는 회원가입과 수동 전체 갱신은 **로그인한 본인 권한으로 GitHub를 조회하는 방식**으로 동작했고, 매일 새벽 배치는 **서비스가 가진 공용 권한으로 GitHub를 조회하는 방식**으로 동작했습니다.

이걸 GitHub 화면으로 비유하면 이해가 쉽습니다. **내가 내 계정을 볼 때**와 **다른 사람이 내 계정을 볼 때** 보이는 정보 범위가 완전히 같지 않을 수 있습니다. 내 권한으로 보면 private contribution까지 집계될 수 있지만, 제3자 권한으로 보면 public contribution만 보입니다.

즉, Git Ranker는 겉으로는 "같은 사용자의 점수를 다시 계산"하고 있었지만, 실제로는 서로 다른 렌즈로 본 데이터를 번갈아 넣고 있었습니다.

- 가입 직후 점수: 로그인한 본인 시점의 데이터
- 다음 날 배치 점수: 제3자 시점의 데이터

같은 계산식에 서로 다른 입력을 넣으니 결과가 흔들린 것입니다.

이 문제는 버그라기보다 설계 결함에 가까웠습니다. "인증을 붙이면 더 정확해질 것"이라고 생각했지만, 실제로는 **어떤 시점의 데이터를 점수 기준으로 삼을지 정하지 않은 채 인증만 먼저 도입**했던 셈입니다.

# 5. 어떤 대안을 버렸고, 왜 Token Pool을 선택했나

문제를 확인한 뒤에는 "앞으로는 누구 시점의 데이터를 점수 기준으로 삼을 것인가"를 먼저 정해야 했습니다. 저는 최종적으로 **모든 점수를 public 활동 기준으로 통일**하기로 했습니다. 이 기준을 놓고 보면 검토할 수 있는 대안은 세 가지였습니다.

## 5.1 사용자 토큰을 DB에 저장하는 방법

가장 단순한 해법은 사용자별 GitHub 토큰을 저장하고, 가입 이후에도 계속 그 토큰으로 조회하는 것입니다. 이 경우 회원가입, 수동 갱신, 배치 모두 같은 관점으로 데이터를 가져올 수 있습니다.

하지만 저는 이 방법을 택하지 않았습니다.

- DB 유출 시 GitHub 토큰까지 함께 노출된다.
- 암호화 저장, 만료 대응, 폐기 전략까지 직접 관리해야 한다.
- "점수 일관성" 문제를 해결하려고 "비밀 관리" 문제를 새로 끌어오는 셈이었다.

## 5.2 GraphQL 응답에서 public만 골라 합산하는 방법

당시 구조상 떠올릴 수 있었던 또 다른 대안은, 사용자 토큰으로 조회하더라도 응답에서 private 저장소를 제외하고 public contribution만 합산하는 방식이었습니다.

예를 들어 저장소별 contribution을 받아 `repository.isPrivate == false` 인 경우만 계산하는 식입니다.

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

다만 이 접근은 저장소 수가 많은 사용자에게 불리합니다. [`commitContributionsByRepository`는 "포함할 저장소 수"를 정하는 `maxRepositories` 인수를 받는 필드](https://docs.github.com/ko/graphql/reference/objects#contributionscollection)이고, 반환 타입도 cursor 기반 `Connection`이 아니라 저장소별 묶음의 리스트입니다. 반면 [cursor 기반 페이지네이션은 `first`/`last`와 `pageInfo`를 가진 `Connection`에서 동작](https://docs.github.com/ko/graphql/guides/using-pagination-in-the-graphql-api)합니다.

즉, 이 필드는 "저장소 목록을 여러 페이지로 끝까지 순회한다"기보다, 내가 지정한 개수만큼의 저장소 묶음을 한 번에 받아오는 쪽에 가깝습니다. 그래서 당시 쿼리에서 `maxRepositories: 100`으로 넉넉히 잡더라도, 활동이 100개가 넘는 저장소에 퍼져 있는 사용자는 일부 저장소 기여가 응답에서 빠질 수 있다고 봤습니다. 점수 체계의 기준을 세우는 순간에 이런 누락 가능성을 안고 가고 싶지 않았습니다.

## 5.3 시스템 토큰 하나로 모든 요청을 통일하는 방법

세 번째는 가입, 수동 갱신, 배치까지 전부 시스템 토큰 하나로 통일하는 방식입니다. 이 경우 public 기준 일관성은 확보됩니다.

하지만 [OAuth app이나 사용자 토큰 기준 GraphQL primary rate limit은 시간당 5,000 points](https://docs.github.com/en/graphql/overview/resource-limitations)입니다. 즉, 실시간 가입, 수동 전체 갱신, 새벽 배치가 모두 하나의 공용 토큰을 공유하면, 가장 바쁜 시간대에 같은 예산을 동시에 써버리게 됩니다.

<aside>
<strong>왜 이게 병목이 되었나</strong><br>
이 문제는 "토큰 하나가 약하다"보다, 서로 성격이 다른 요청들이 같은 시간당 예산을 함께 깎아 먹는 구조라는 점이 더 컸습니다.
</aside>

즉, 이 방법은 일관성은 얻을 수 있지만, 트래픽이 조금만 늘어도 운영 여유가 빠르게 사라지는 구조였습니다.

## 5.4 최종 선택: Token Pool

결국 선택한 방법은 **여러 개의 시스템 토큰을 하나의 풀로 관리하면서, 모든 GitHub 조회를 public 기준으로 통일하는 것**이었습니다.

핵심은 두 가지였습니다.

1. 점수 산정 기준은 언제나 public contribution으로 고정한다.
2. 단일 토큰 병목은 토큰 풀로 분산한다.

실제로 이 전환 이후에는 가입, 수동 갱신, 배치처럼 GitHub를 조회하는 모든 경로가 공용 토큰 풀을 거치도록 바뀌었습니다.

# 6. Token Pool은 어떻게 동작하게 만들었나

> *Token Pool의 핵심 규칙은 단순했습니다. "남은 한도가 안전 구간보다 큰 토큰만 사용하고, 위험 구간에 들어가면 다음 토큰으로 넘긴다."*

설정은 아래처럼 단순합니다.

```yaml
github:
  api:
    tokens: ${GITHUB_API_TOKENS}  # 공용으로 돌려 쓸 GitHub 토큰들
    threshold: 100                # 이 값 이하로 떨어지면 다음 토큰 후보 탐색
```

여기서 `threshold`는 "이 수치 아래로 떨어진 토큰은 더 쓰지 말자"는 안전선입니다. 예를 들어 `threshold: 100`이면, 어떤 토큰의 남은 포인트가 100 이하가 되는 순간부터는 다음 토큰을 찾기 시작합니다.

변수 이름보다 읽는 포인트가 중요하지만, 이 정도는 실제 코드를 함께 보는 편이 이해에 도움이 됩니다. `getToken()`의 핵심만 추리면 아래와 같습니다.

```java
for (int i = 0; i < size; i++) {
    int idx = (startIndex + i) % size;
    TokenState token = tokens.get(idx);

    if (token.isAvailable(threshold)) {
        currentIndex = idx;
        return token.getValue();
    }
}

throw new GitHubRateLimitExhaustedException(findEarliestResetAt());
```

이 코드를 읽을 때 중요한 변수는 세 개뿐입니다.

- `startIndex`: 이번 탐색을 어디서부터 시작할지 가리키는 위치입니다. 이전에 사용하던 토큰 근처부터 다시 확인해서 불필요한 순회를 줄입니다.
- `threshold`: 이 값보다 남은 포인트가 적으면 "지금은 더 쓰면 위험하다"고 판단하는 안전선입니다.
- `findEarliestResetAt()`: 모든 토큰이 위험 구간일 때, 그중 **가장 먼저 복구되는 시각**을 계산해서 예외에 담아 줍니다.

즉, 이 코드는 단순히 *"아무 토큰 하나를 골라 쓰는 로직"* 이 아니라, **현재 가장 덜 위험한 토큰을 선택하고, 전부 위험하면 언제 다시 시도해야 하는지까지 계산하는 로직**입니다.

왜 단순 round-robin이 아니라 이 방식을 택했냐면, 목적이 "공평하게 분배"가 아니라 **가능한 한 오래 안전하게 버티는 것**이었기 때문입니다.

round-robin은 토큰 여유가 남아 있어도 무조건 다음 토큰을 건드리므로, 여러 토큰이 동시에 바닥날 가능성이 큽니다. 반면 threshold 기반 전환은 현재 토큰을 최대한 쓰되, 위험 구간에 들어가면 다음 토큰으로 넘겨서 여유를 남깁니다.

또 하나 중요한 건, 풀의 상태가 고정돼 있지 않았다는 점입니다. GitHub GraphQL 응답에는 매 요청마다 `remaining`과 `resetAt`이 함께 오는데, 이 값을 다시 Token Pool에 기록해서 "방금 사용한 토큰의 남은 체력"을 계속 갱신했습니다.

<aside>
<strong>핵심은 순환이 아니라 추적이었다</strong><br>
Token Pool은 단순히 토큰을 돌아가며 뿌리는 장치가 아니라, 각 토큰의 남은 예산과 복구 시점을 추적하는 관리자에 가까웠습니다.
</aside>

모든 토큰이 임계치 아래로 내려가면 `GitHubRateLimitExhaustedException`을 던지고, 가장 빠른 `resetAt`을 기준으로 재시도 가능 시점을 계산합니다. 즉, 단순히 "실패"로 끝내지 않고 **언제 다시 복구되는지까지 시스템이 알고 있도록** 만든 셈입니다.

테스트도 이 가정을 중심으로 붙어 있습니다.

- 단일 토큰이면 그대로 반환되는지
- 현재 토큰의 remaining이 threshold 이하일 때 다음 토큰으로 회전하는지
- 모든 토큰이 소진되면 예외를 던지는지
- 한 번 회전한 뒤에는 마지막 사용 토큰부터 다시 탐색하는지

초기 버전은 `AtomicInteger`로 현재 인덱스를 관리했지만, 현재 구현은 `ReentrantLock`으로 바뀌어 있습니다. 배치 작업과 사용자 요청이 동시에 GitHub 조회를 일으킬 수 있다는 점을 감안하면, 이 변경은 단순한 리팩터링이라기보다 운영 안전성 보강에 가깝습니다.

# 7. 후속 개선: 쿠키 SameSite와 HttpOnly 전환

인증을 붙인 뒤에도 구현은 한 번에 끝나지 않았습니다. 오히려 토큰 전달 방식은 몇 차례 더 바뀌었습니다.

서비스 Access Token을 URL query parameter로 프론트에 넘기던 구조를 쿠키 기반으로 옮기려 하면서, 브라우저 정책이라는 또 다른 벽을 만났습니다. [`SameSite`는 쿠키가 cross-site 요청에서도 함께 전송될 수 있는지를 조절하는 속성](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)입니다.

<aside>
<strong>SameSite를 아주 짧게 요약하면</strong><br>
`Strict`는 가장 보수적이고, `Lax`는 일반적인 상단 이동(top-level navigation) 흐름을 더 잘 허용합니다. OAuth 로그인처럼 외부 사이트를 거쳐 다시 돌아오는 리다이렉트에서는 이 차이가 그대로 드러납니다.
</aside>

처음에는 "가장 안전해 보이는 값"이라는 이유로 `SameSite=Strict`를 택했습니다.

```java
.sameSite("Strict")  // 너무 보수적으로 잡았던 초기 설정
```

문제는 OAuth 로그인 흐름이 GitHub에서 우리 서비스로 돌아오는 **cross-site redirect** 라는 점이었습니다.

![OAuth 로그인 흐름](https://i.imgur.com/ENKOTnz.png)

결과적으로 브라우저는 이 흐름에서 쿠키를 기대한 대로 보내지 않았고, 로그인 직후 상태 유지가 깨졌습니다. 결국 `Lax`로 조정했습니다.

```java
.sameSite("Lax")
```

여기서 끝난 것도 아니었습니다. 프론트엔드가 한동안 URL의 access token을 읽어 로그인 상태를 판단하고 있어서, 바로 쿠키 기반으로 완전히 전환하지 못하고 잠시 query parameter 방식으로 롤백하기도 했습니다.

이후에야 Access Token을 HttpOnly 쿠키로 옮기고, Refresh Token rotation을 적용하고, 프론트가 로그인 상태를 확인할 수 있도록 `/api/v1/auth/me` 응답을 추가하면서 구조가 정리됐습니다.

> *인증은 백엔드 코드 한 덩어리가 아니라, 브라우저 정책, 프론트 상태 판단 방식, 쿠키 전략이 함께 맞물리는 경계 설계였습니다.*

# 8. 정리

이번 작업에서 가장 크게 수정된 건 로그인 기능 자체보다도, **점수의 기준을 정하는 방식**이었습니다.

처음에는 "GitHub로 로그인만 붙이면 되겠지"라고 생각했습니다. 하지만 실제로는 아래 세 가지를 동시에 풀어야 했습니다.

1. 누가 자신의 데이터를 등록할 수 있는가
2. GitHub 토큰과 서비스 인증 토큰을 어떻게 분리할 것인가
3. 어떤 관점의 데이터를 점수의 기준으로 삼을 것인가

<aside>
<strong>돌아보면 핵심 교훈은 하나였습니다</strong><br>
인증을 붙이는 순간, 시스템은 "누가 요청했는가"에 따라 같은 데이터를 다르게 보게 됩니다. 그래서 인증 설계와 데이터 수집 기준은 반드시 함께 설계되어야 합니다.
</aside>

결국 Git Ranker에서는 **소유권 확인은 OAuth로, 서비스 인증은 JWT/Refresh Token으로, 점수 일관성은 Token Pool 기반 public 데이터 수집으로** 역할을 나누는 쪽이 가장 현실적이었습니다.

OAuth 자체를 붙이는 일은 어렵지 않았습니다. 어려웠던 건 **그 이후에도 시스템이 같은 기준으로 동작하도록 만드는 일**이었습니다.
