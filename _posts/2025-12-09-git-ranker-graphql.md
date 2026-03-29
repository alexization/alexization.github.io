---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/rtnuC2m.png"

title: "[Git Ranker #6] GitHub Search API에서 GraphQL로 전환"
excerpt: "Search API의 호출 수와 리뷰 데이터 한계를 넘기 위해 Git Ranker가 GraphQL 기반 연도별 병렬 조회 구조로 바뀐 과정과, 현재 구현이 1년 제약·동적 응답·비용 관리를 어떻게 다루는지 정리한다."
categories:
  - Git Ranker
tags:
  - GitHub API
  - GraphQL
  - Architecture

toc_label: "GraphQL 도입기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-graphql/
redirect_from:
  - /git ranker/git-ranker-graphql/
date: 2025-12-09
last_modified_at: 2026-03-30
---

![mainImage](https://i.imgur.com/rtnuC2m.png)

Git Ranker에서 GitHub 활동 수집은 점수, 순위, 티어 계산의 출발점입니다. 사용자의 현재 GitHub 상태를 최대한 안정적으로 읽어와야 하고, 그 결과는 신규 가입 시 전체 스캔에도 쓰이고 매일 자정 배치에도 다시 쓰입니다. 그래서 이 수집기는 단순한 API 클라이언트가 아니라, 서비스의 핵심 도메인 로직과 운영 비용이 만나는 지점이었습니다.

[이전 글](/git-ranker/git-ranker-search-api/)에서 정리했듯, `Search API`는 `Events API`보다 훨씬 나은 선택이었습니다. 활동을 이벤트 원문이 아니라 **활동별 count**로 다시 정의할 수 있었기 때문입니다. 다만 다른 문제가 발견되었습니다. 사용자 한 명을 계산할 때 호출 수가 많았고, 리뷰 기여도를 세밀하게 표현하기도 어려웠습니다.

이번 글에서는 Git Ranker가 왜 Search API에서 GraphQL로 넘어갔는지, 그리고 현재 저장소가 그 전환을 어떤 구조로 구현하고 있는지 정리합니다. 초기에 기대했던 모습은 "다섯 번의 REST 요청을 한 번의 GraphQL 요청으로 바꾸는 것"이었지만, 실제 구현은 그보다 더 운영 친화적인 방향으로 진화했습니다.

<aside>
<strong>이 글에서 집중하는 내용</strong><br>
현재 Git Ranker의 GraphQL 수집기는 <strong>연도별 쿼리 병렬 실행</strong>, <strong>동적 JSON 매핑</strong>, <strong>비용과 토큰 상태 추적</strong>을 함께 묶은 구조입니다. 즉, 단순히 API를 교체한 것이 아니라 운영 가능한 수집 파이프라인으로 바뀐 과정을 다룹니다.
</aside>

# 1. Search API는 맞는 방향이었지만 오래 버티기 어려웠다

Search API로 옮겨온 덕분에 Git Ranker는 "최근 이벤트 타임라인"이 아니라 "활동별 누적 count"를 기준으로 점수를 계산할 수 있게 됐습니다. 문제는 그 다음이었습니다. 점수 계산 모델에 맞는 질의는 가능해졌지만, 운영 단계에서는 **호출 수**와 **데이터 정밀도**가 새 병목으로 드러났습니다.

## 1.1 사용자 1명을 계산할 때 호출이 여러 번 필요했다

초기 Search API 방식은 활동 종류별로 질의를 나눠야 했습니다.

- Commit
- PR Open
- PR Merged
- Issue
- Review

즉, 사용자 한 명의 점수를 계산하려면 같은 사용자를 기준으로 서로 다른 검색 쿼리를 여러 번 날려야 했습니다. [GitHub Docs의 현재 REST rate limit 문서](https://docs.github.com/en/rest/rate-limit/rate-limit)에서는 search 리소스가 별도 예산으로 분리되어 있고, 예시 응답에서도 `search` limit이 `30`으로 나타납니다. Git Ranker처럼 같은 작업을 사용자 수만큼 반복해야 하는 서비스에서는 이 구조가 금방 부담이 됩니다.

사용자 수가 적을 때는 버틸 수 있습니다. 하지만 신규 가입, 수동 갱신, 새벽 배치가 겹치기 시작하면 이야기가 달라집니다. 점수 계산은 "가끔 한 번" 하는 작업이 아니라, 계속 반복되는 작업이기 때문입니다.

## 1.2 리뷰 기여도도 충분히 정확하지 않았다

더 아쉬웠던 부분은 리뷰 데이터였습니다. Search API의 `reviewed-by:username type:pr`는 **리뷰를 남긴 PR 수**를 세는 데는 유용했지만, 실제로 사용자가 **몇 번의 리뷰를 제출했는지**까지는 잘 드러나지 않았습니다.

예를 들어 한 PR에 대해 한 번만 승인한 사람과, 여러 차례 수정 요청과 재리뷰를 남긴 사람을 같은 count로 보게 될 수 있습니다. Git Ranker가 리뷰를 중요한 협업 지표로 본다는 점을 생각하면, 이 차이는 꽤 크게 느껴졌습니다.

> Search API는 문제를 올바르게 다시 정의하게 해준 첫 번째 해법이었다. 하지만 운영 단계에서는 "집계가 가능하다"보다 "적은 비용으로, 더 정확하게 집계할 수 있는가"가 더 중요해졌다.

# 2. GraphQL이 준 것은 단순한 API 교체가 아니라 데이터 모델이었다

GraphQL로 넘어오면서 가장 먼저 달라진 점은 "질의 개수"보다 **질의의 표현 방식**이었습니다. Search API가 활동 종류마다 서로 다른 검색 문자열을 만들어 count를 읽어오는 방식이었다면, GraphQL은 사용자의 contribution 모델 안에서 필요한 필드를 직접 선택할 수 있게 해줬습니다.

## 2.1 `ContributionsCollection`이 핵심 집계 구조가 됐다

[GitHub GraphQL 문서의 `ContributionsCollection`](https://docs.github.com/en/graphql/reference/objects#contributionscollection)에는 Git Ranker가 필요로 하는 핵심 필드들이 이미 들어 있습니다.

```graphql
{
  user(login: "username") {
    contributionsCollection(from: "...", to: "...") {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
    }
  }
}
```

Git Ranker 관점에서 이 필드들은 아래처럼 바로 연결됩니다.

- `totalCommitContributions`: 커밋 수
- `totalIssueContributions`: 이슈 수
- `totalPullRequestContributions`: 연 PR 수
- `totalPullRequestReviewContributions`: 남긴 리뷰 수

특히 `totalPullRequestReviewContributions`는 Search API에서 아쉬웠던 리뷰 지표를 더 자연스럽게 다룰 수 있게 해줬습니다. 더 이상 "이 사용자가 리뷰에 참여한 PR 수"라는 우회 지표에만 기대지 않아도 됩니다.

다만 여기서 중요한 예외가 하나 있습니다. `ContributionsCollection`은 **열린 PR 수**는 주지만, **머지된 PR 수**를 그대로 주지는 않습니다. 그래서 Git Ranker는 이 필드만으로 모든 점수 항목을 끝내지 않고, `merged PR`은 별도 검색 블록으로 보완합니다.

## 2.2 비용 모델도 Git Ranker의 운영 방식과 더 잘 맞았다

GraphQL 전환의 또 다른 장점은 rate limit을 더 명시적으로 다룰 수 있다는 점이었습니다. [GitHub Docs의 현재 GraphQL rate limit 문서](https://docs.github.com/en/graphql/overview/resource-limitations)와 REST rate limit 응답 예시를 함께 보면, 사용자 토큰 기준 GraphQL primary rate limit은 **시간당 5,000 points**이고 Search API는 별도 search 예산으로 계산됩니다. REST Search API처럼 단순히 "몇 번 호출했는가"보다, **이번 질의가 얼마의 cost를 썼는가**를 함께 볼 수 있습니다.

현재 Git Ranker 쿼리는 매 요청마다 `rateLimit` 필드를 함께 요청합니다.

```graphql
{
  rateLimit {
    limit
    remaining
    resetAt
    cost
  }
  year2026: user(login: "username") {
    contributionsCollection(from: "...", to: "...") {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
    }
  }
}
```

[같은 문서](https://docs.github.com/en/graphql/overview/resource-limitations)는 가능하면 응답 헤더를 활용하는 방법도 안내하지만, Git Ranker는 비용과 잔량을 **응답 DTO 안에 같이 실어** 병합하고 기록하는 쪽을 택했습니다. 이 선택 덕분에 단순 조회를 넘어서 다음과 같은 운영 처리가 가능해졌습니다.

- 이번 사용자의 전체 수집 비용 합산
- 남은 요청 예산 기록
- 토큰 풀 상태 갱신
- 로깅과 메트릭 수집

즉, GraphQL은 Git Ranker에 "호출 수를 줄이는 API"라기보다, **비용을 관찰하면서 운영할 수 있는 API**에 가까웠습니다.

# 3. 하지만 현재 구현의 답은 "거대한 한 번의 쿼리"가 아니었다

GraphQL을 처음 보면 자연스럽게 이런 생각을 하게 됩니다.

- "필요한 필드를 한 번에 다 적으면 되지 않을까?"
- "가입일부터 지금까지 전부 한 요청으로 가져오면 끝나지 않을까?"

초기 아이디어도 크게 다르지 않았습니다. 하지만 실제 구현은 더 현실적인 쪽으로 갔습니다.

## 3.1 `ContributionsCollection`은 긴 기간을 한 번에 읽기 어렵다

현재 저장소의 `GraphQLQueryBuilder`를 보면, Git Ranker는 `ContributionsCollection`을 **연도 단위 조회 블록**으로 생성합니다.

```java
private String buildYearContributionBlock(
        int year, String username, String fromDate, String toDate
) {
    return String.format("""
            year%d: user(login: "%s") {
              contributionsCollection(from: "%s", to: "%s") {
                totalCommitContributions
                totalIssueContributions
                totalPullRequestContributions
                totalPullRequestReviewContributions
              }
            }
            """, year, username, fromDate, toDate);
}
```

이렇게 쪼갠 이유는 단순합니다. 실사용 과정에서 `ContributionsCollection`은 **긴 기간을 한 번에 질의하는 방식보다, 1년 안쪽의 안전한 구간으로 나눠 읽는 방식**이 훨씬 안정적이었기 때문입니다. 현재 코드가 `fromDate`와 `toDate`를 연도별로 계산하는 것도 바로 이 제약을 반영한 결과입니다.

첫 해는 사용자의 실제 GitHub 가입 시점부터 시작하고, 중간 연도는 `1월 1일 ~ 12월 31일`, 현재 연도는 `1월 1일 ~ 지금`으로 잡습니다. 즉, Git Ranker가 택한 기준 단위는 "한 사용자 전체 기간"이 아니라 **한 연도 contribution window**입니다.

## 3.2 전체 스캔은 연도별 쿼리를 병렬 실행해 합친다

그래서 현재 저장소의 전체 스캔 경로는 "GraphQL 한 방"이 아닙니다. `GitHubGraphQLClient#getAllActivities()`는 아래처럼 동작합니다.

```java
Flux<String> queries = Flux.concat(
        Flux.just(queryBuilder.buildMergedPRBlock(username)),
        Flux.fromStream(IntStream.rangeClosed(joinYear, currentYear).boxed())
                .map(year -> queryBuilder.buildYearlyContributionQuery(username, year, githubJoinDate))
);

GitHubAllActivitiesResponse aggregatedResponse = queries
        .parallel(CONCURRENCY_LIMIT)
        .runOn(Schedulers.boundedElastic())
        .flatMap(query -> executeQueryReactive(accessToken, query, GitHubAllActivitiesResponse.class))
        .sequential()
        .reduce(GitHubAllActivitiesResponse.empty(), (acc, current) -> {
            acc.merge(current);
            return acc;
        })
        .block();
```

핵심은 세 가지입니다.

- `merged PR` 검색 블록을 따로 만든다.
- 가입 연도부터 현재 연도까지 **연도별 GraphQL 쿼리**를 생성한다.
- 이 쿼리들을 **병렬 실행한 뒤 하나의 응답 객체로 병합**한다.

즉, 현재 Git Ranker는 "모든 연도를 Alias로 한 번에 묶는 설계"보다 **연도별 병렬 실행 + 응답 병합**을 선택했습니다. 이 방식은 네트워크 호출 수를 완전히 1로 줄여주지는 않지만, 각 요청의 경계를 명확하게 만들고 장애 대응과 비용 추적을 더 쉽게 해줍니다.

<aside>
<strong>왜 merged PR은 별도 블록으로 조회할까</strong><br>
`ContributionsCollection`은 사용자가 연 PR 수는 바로 집계해주지만, 그 PR이 실제로 merge됐는지는 구분하지 않습니다. 그래서 Git Ranker는 `author:%s type:pr is:merged` 검색을 GraphQL 쿼리 안의 별도 `search` 블록으로 유지합니다.
</aside>

## 3.3 배치 경로는 같은 아이디어를 더 가볍게 쓴다

이 구조는 일일 배치와도 자연스럽게 연결됩니다. 신규 가입이나 수동 갱신에서는 전체 스캔이 필요하므로 가입 연도부터 현재까지를 모두 읽습니다. 반면 매일 자정 배치에서는 변동 가능성이 큰 **현재 연도만 다시 조회**하고, 이전 연도 데이터는 기준선 로그와 합칩니다.

이때 배치용 쿼리는 `buildBatchQuery()`가 담당합니다. 여기서는 `merged PR` 검색과 해당 연도의 `contributionsCollection`을 같은 요청 안에 묶어 더 가볍게 처리합니다.

즉, Git Ranker의 GraphQL 전환은 단순히 "Search API를 GraphQL로 바꿨다"가 아니라,

- 전체 스캔 경로
- 일일 배치 경로
- 기준선 로그 전략

까지 포함한 **수집 전략의 재설계**였습니다.

# 4. 동적 응답 매핑도 중요한 설계 포인트였다

![mapping](https://i.imgur.com/sr3qYNf.png)

연도별 쿼리로 나누면 응답 필드가 `year2023`, `year2024`, `year2025`처럼 동적으로 바뀝니다. 정적 타입 언어인 Java에서는 이 부분을 어떻게 받을지가 꽤 중요합니다.

저는 이 문제를 `@JsonAnySetter`로 풀었습니다.

```java
public static class Data {
    @Getter
    private final Map<String, YearData> yearDataMap = new HashMap<>();

    @JsonProperty("rateLimit")
    RateLimit rateLimit;

    @JsonProperty("mergedPRs")
    private Search mergedPRs;

    @JsonAnySetter
    public void setYearData(String key, YearData value) {
        if (key.startsWith("year")) {
            yearDataMap.put(key, value);
        }
    }
}
```

이 구조의 장점은 분명합니다.

- 미리 `year2021`, `year2022`, `year2023` 필드를 전부 선언할 필요가 없습니다.
- 사용자의 가입 연도에 따라 응답 구조가 달라도 DTO는 그대로 유지됩니다.
- 병렬 요청으로 받은 여러 연도 응답을 `Map`에 합쳐 한 번에 합산할 수 있습니다.

실제로 `GitHubAllActivitiesResponse`는 이 `yearDataMap`을 순회하며 커밋, 이슈, PR, 리뷰 수를 모두 합산합니다. 그리고 `merge()` 메서드에서는 연도별 데이터뿐 아니라 `mergedPRs`와 `rateLimit.cost`까지 같이 병합합니다.

이 설계가 좋은 이유는 DTO가 단순한 "응답 그릇"을 넘어, **분할 조회 결과를 다시 하나의 도메인 값으로 복원하는 계층** 역할까지 맡기 때문입니다.

> GraphQL 전환에서 까다로웠던 부분은 쿼리 문법이 아니라, "쪼개서 받은 응답을 어떻게 다시 하나의 사용자 활동으로 복원할 것인가"였다.

# 5. GraphQL 전환은 곧 운영 코드의 시작이었다

현재 저장소를 읽어보면 GraphQL 수집기는 단순한 API 호출 코드가 아닙니다. 비용, 잔량, 실패, 토큰 회전까지 같이 다룹니다. 즉, 이 단계부터는 "개발 편의"보다 **운영 안정성**이 더 중요한 문제로 올라옵니다.

## 5.1 비용과 토큰 상태를 함께 추적한다

`GitHubGraphQLClient`는 응답에 포함된 `rateLimit` 정보를 읽어 `GitHubApiMetrics`와 `GitHubTokenPool`에 기록합니다.

```java
private void recordRateLimitInfo(String accessToken, GitHubRateLimitInfo rateLimit) {
    apiMetrics.recordRateLimit(rateLimit.cost(), rateLimit.remaining(), rateLimit.resetAt());
    tokenPool.updateTokenState(accessToken, rateLimit.remaining(), rateLimit.resetAt());
}
```

토큰 풀은 여러 토큰 중 아직 여유가 있는 토큰을 고르고, 남은 잔량이 임계치 아래로 떨어지면 다음 토큰으로 회전합니다. 테스트 코드에서도 이 회전 동작과 "모든 토큰 소진 시 예외"가 검증되어 있습니다.

즉, Git Ranker는 GraphQL 전환 이후부터 "한 토큰으로 계속 호출한다"가 아니라, **남은 예산을 보며 토큰 상태를 관리하는 구조**를 갖게 됐습니다.

## 5.2 안전선 아래로 내려가면 바로 멈춘다

이 구현에서 단순히 `remaining`을 기록만 하지 않습니다. 현재 코드는 `SAFE_REMAINING_THRESHOLD = 50` 아래로 내려가면 경고 로그를 남기고 `GitHubRateLimitException`을 던집니다.

```java
private void checkRateLimitSafety(int remaining, LocalDateTime resetAt) {
    if (remaining < SAFE_REMAINING_THRESHOLD) {
        apiMetrics.recordRateLimitExceeded();
        throw new GitHubRateLimitException(resetAt);
    }
}
```

이 선택은 "마지막 한도까지 끝까지 쓰자"보다 "안전하게 멈추고 다음 기회를 기다리자"에 가깝습니다. 배치나 수동 갱신처럼 사용자 수가 많은 경로에서는 이런 보수적인 판단이 오히려 전체 시스템 안정성에 유리합니다.

## 5.3 실패도 그냥 던지지 않고 의미를 나눈다

에러 처리 계층도 함께 들어왔습니다.

- `403`, `429`는 rate limit 초과로 해석
- GraphQL 에러 중 `Could not resolve to a User`는 사용자 없음으로 분리
- `TimeoutException`, `ReadTimeoutException`, `IOException`은 재시도 가능한 실패로 분리

이렇게 실패 유형을 나눠두면 배치에서는 재시도/스킵 정책을 더 명확하게 붙일 수 있고, 운영 로그에서도 "무엇이 얼마나 실패했는가"를 더 잘 읽을 수 있습니다.

결국 GraphQL 전환은 단순히 더 예쁜 쿼리를 쓰는 문제가 아니었습니다. **GitHub API를 외부 의존성으로 취급하고, 그 비용과 실패를 시스템적으로 다루기 시작한 시점**에 더 가까웠습니다.

# 6. 그래서 무엇이 좋아졌고, 무엇이 더 복잡해졌을까

현재 구현을 기준으로 보면, GraphQL 전환의 장점과 비용은 꽤 분명합니다.

- **좋아진 점 1**: 커밋, 이슈, PR 생성, 리뷰 제출을 contribution 모델 안에서 더 직접적으로 읽을 수 있게 됐습니다.
- **좋아진 점 2**: Search API 시절보다 비용 모델을 더 명시적으로 관찰할 수 있게 됐고, 토큰 풀과 메트릭으로 운영 제어가 가능해졌습니다.
- **좋아진 점 3**: 전체 스캔과 일일 배치가 같은 GraphQL 수집 기반 위에서 자연스럽게 연결됐습니다.
- **복잡해진 점 1**: 긴 기간을 한 번에 읽지 못하므로 연도별 분할과 응답 병합이 필요해졌습니다.
- **복잡해진 점 2**: 동적 필드 매핑, rate limit 추적, 토큰 회전, 예외 분류 같은 운영 코드가 함께 따라왔습니다.
- **복잡해진 점 3**: `merged PR`처럼 contribution 모델에 바로 없는 값은 여전히 별도 검색 블록으로 보완해야 합니다.

즉, GraphQL은 만능 해법이 아니었습니다. 다만 Git Ranker에는 훨씬 더 적합한 해법이었습니다. Search API가 "활동별 count 집계"라는 문제 정의를 만들어줬다면, GraphQL은 그 문제를 **운영 가능한 구조로 확장**하게 해줬습니다.

# 7. 정리

이번 전환에서 가장 크게 배운 점은, 좋은 수집 구조는 단순히 "데이터를 가져오는 코드"가 아니라는 사실이었습니다.

- Search API는 Git Ranker가 필요한 질문을 다시 정의하게 해준 첫 단계였습니다.
- GraphQL은 그 질문을 더 정확하고 더 운영 가능한 방식으로 풀 수 있게 해줬습니다.
- 하지만 최종 구현은 "한 번의 거대한 쿼리"보다, **연도별 병렬 조회 + 동적 매핑 + 비용 제어**라는 더 현실적인 구조에 가까웠습니다.

지금 돌아보면 이 전환의 핵심은 "REST에서 GraphQL로 바꿨다"가 아닙니다. **GitHub 활동 수집을 서비스 운영의 관점에서 다시 설계했다**는 데 더 가깝습니다.
