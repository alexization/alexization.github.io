---
header:
  teaser: /assets/images/logo.png
  og_image: "https://imgur.com/sr3qYNf.png"

title: "[Git Ranker #6] GitHub Search API에서 GraphQL로 전환"
excerpt: "REST Search API의 Rate Limit 병목과 데이터 정밀도 문제를 해결하기 위해 GraphQL로 전환한 과정과 '1년 조회 제한' 문제를 Alias와 동적 쿼리 매핑으로 극복한 트러블 슈팅"
categories:
  - Git Ranker
tags:
  - GitHub API
  - GraphQL

toc_label: "GraphQL 도입기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-graphql/
date: 2025-12-09
last_modified_at: 2025-12-09
---
# 1. Search API의 한계와 GraphQL 도입 배경

## 1.1 REST Search API 방식의 구조적 한계

앞서 구현한 GitHub Search API 기반의 수집 방식은 Events API가 가진 ‘최근 30일 데이터 조회 제한’을 극복하고 사용자의 전체 활동 이력을 수집할 수 있다는 점에서 큰 성과였습니다.

하지만, 서비스 운영을 고려했을 때 치명적인 문제들이 있었습니다.

### 문제 1: 5번의 API 호출로 인한 Rate Limit 병목

사용자 한 명의 점수를 산출하기 위해서는 활동 타입별로 총 5번의 API 호출이 필요했습니다.

```java
public GitHubActivitySummary collectAllActivities(String username) {
    // 사용자 1명 분석에 5회의 독립적인 API 호출 발생
    int commitCount = collectCommitCount(username);      // 1. 커밋
    int prOpenCount = collectPrOpenCount(username);      // 2. PR 생성
    int prMergedCount = collectPrMergedCount(username);  // 3. PR 병합
    int issueCount = collectIssueCount(username);        // 4. 이슈
    int reviewCount = collectReviewCount(username);      // 5. 리뷰

    return new GitHubActivitySummary(...);
}
```

[GitHub Search API는 인증된 사용자도 분당 30회의 요청만 허용합니다.](https://docs.github.com/ko/rest/search/search?apiVersion=2022-11-28#rate-limit) 사용자 1명당 5번의 호출이 필요하므로, 이론상 **분당 최대 6명**의 사용자만 처리할 수 있습니다.

이는 추후 대규모 사용자의 점수를 갱신하는 배치 작업에서 심각한 병목이 될 것이 명확했습니다. 100명의 사용자를 처리하는 데만 최소 17분이 소요되며, 사용자가 증가할수록 배치 처리 시간은 선형으로 증가합니다.

### 문제 2: Code Review 기여도의 정밀도 부족

REST Search API의 `reviewed-by` 쿼리는 사용자가 **리뷰를 남긴 PR의 개수**만 반환합니다.

- PR 1개에 리뷰를 1번 제출 = Code Review `+1`
- PR 1개에 리뷰를 5번 제출 (추가 리뷰) = Code Review `+1`

⇒ **실제 리뷰 기여도가 저평가** 되는 문제 발생

단순히 **“어떤 PR에 리뷰를 남겼는가”만 알 수 있을 뿐, “몇 번의 리뷰를 제출했는가”** 는 파악할 수 없었습니다. 이는 활발하게 코드 리뷰에 참여하는 개발자의 기여도를 정확히 측정하기 어렵다고 판단했습니다.

## 1.2 GraphQL의 발견

이러한 한계를 인식하고 GitHub API 공식 문서를 더 뒤져본 결과, [**GitHub GraphQL API**](https://docs.github.com/ko/graphql/guides/introduction-to-graphql) 를 발견했습니다.

GraphQL은 클라이언트가 필요한 데이터 구조를 명시하여 요청할 수 있으며, **단일 요청으로 여러 리소스를 한 번에 조회**할 수 있어 “5번의 API 호출” 문제를 근본적으로 해결할 수 있었습니다.

---

# 2. GraphQL 이란 무엇인가 ?

GraphQL은 Facebook이 2015년 공개한 데이터 쿼리 및 조작 언어입니다. REST API의 한계를 극복하기 위해 설계되었으며, 클라이언트가 필요한 데이터의 구조를 정확히 명시할 수 있다는 점이 핵심입니다.

[GraphQL 공식 문서](https://graphql.org/)

## 2.1 GitHub GraphQL API의 데이터 구조

### `ContributionsCollection` 이란 ?

[GitHub GraphQL API는 사용자의 기여 활동을 집계하여 보여주는 `ContributionsCollection` 객체를 제공합니다.](https://docs.github.com/ko/graphql/reference/objects#contributionscollection)

> **ContributionsCollection**: A contributions collection aggregates contributions such as opened issues and commits created by a user.
>

이 객체는 특정 기간 동안의 사용자 기여 활동을 집계한 데이터를 제공합니다.

```graphql
{
    user(login: "username") {
        contributionsCollection(from: "...", to: "...") {
            totalCommitContributions              # 커밋 개수
            totalIssueContributions               # 이슈 개수
            totalPullRequestContributions         # 생성한 PR 개수
            totalPullRequestReviewContributions   # 리뷰 제출 횟수
        }
    }
}
```

- `totalCommitContributions` : 사용자가 작성한 커밋 총 개수
- `totalIssueContributions` : 사용자가 생성한 이슈 총 개수
- `totalPullRequestContributions` : 사용자가 생성한 PR 총 개수
- `totalPullRequestReviewContributions` : 사용자가 리뷰를 제출한 총 횟수

### **`totalPullRequestReviewContributions`**

이 필드는 사용자가 PR 리뷰를 제출한 횟수를 카운트합니다.

**GitHub의 리뷰 시스템에서**

- 여러 개의 리뷰 댓글을 작성한 후 “Submit Review” 버튼을 클릭하면 1개의 리뷰로 제출됨
- PR 1개에 10개의 댓글을 달고 1번 제출 = Code Review `+1`
- PR 1개에 `n`번 리뷰 제출 (추가 리뷰) = Code Review `+n`

**참고 : [Profile contributions reference](https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference), [About pull request reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews)**

## 2.2 GraphQL 이 문제들을 모두 해결할 수 있을까 ?

[**문제 1: Rate Limit (해결 가능)**](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

- REST Search API : 분당 30회
- GraphQL API : 시간당 5,000 포인트

> “GraphQL은 요청 횟수가 아닌 **‘쿼리 복잡도(Node 비용)’** 기반으로 Rate Limit을 차감합니다. 이번에 작성한 GraphQL 쿼리는 한 번에 많은 데이터를 가져오지만, Search API를 5번 호출하는 것보다 훨씬 적은 비용이 듭니다.”
>

**문제 2: Code Review 데이터 정밀도 (해결 가능)**

`ContributionsCollection` 의 `totalPullRequestReviewContributions` 활용

- REST Search API : 리뷰한 PR 개수만 반환
- GraphQL : 리뷰 제출 횟수를 정확하게 집계

---

# 3. GraphQL 도입 과정과 트러블 슈팅

## 3.1 기본 구조 설계

1차 목표는 5번의 REST API 호출을 1번의 GraphQL 쿼리로 통합하여 Rate Limit 부담을 최소화하는 것이었습니다.

초기에는 아래와 같이 `contributionsCollection` 을 단순히 호출하면 전체 데이터를 줄 것이라 기대했습니다.

```graphql
{
  user(login: "username") {
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
    }
  }
}
```

하지만 쿼리를 테스트해본 결과, 데이터는 정상적으로 반환되었지만 최근 1년 치 데이터만 조회되는 것을 알게되었습니다.

### `ContributionsCollection` 의 1년 제한

`ContributionsCollection` 은 `from` 과 `to` 파라미터로 기간을 지정할 수 있지만, 최대 1년 범위만 조회 가능합니다. 

_(기간을 지정하지 않으면 최근 1년 데이터만 반환합니다.)_

**GitHub 가입일부터 현재까지 전체 데이터를 조회하기 위해 긴 기간을 설정해봤습니다.**

```graphql
{
  user(login: "alexization") {
    contributionsCollection(from: "2021-04-05T01:10:48Z", to: "2025-12-09T10:51:59Z") {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
    }
  }
}
```

```json
{
  "data": {
    "mergedPRs": {
      "issueCount": 148
    }
  },
  "errors": [
    {
      "type": "VALIDATION",
      "path": ["contributionsCollection"],
      "locations": [{"line": 3, "column": 3}],
      "message": "The total time spanned by 'from' and 'to' must not exceed 1 year"
    }
  ]
}
```

> **"message":** "The total time spanned by 'from' and 'to' must not exceed 1 year"
>

**실패 :** `from` 과 `to` 의 차이가 1년을 초과하면 위와 같이 에러가 발생하는 것을 볼 수 있었습니다.

사용자의 가입 시점부터 현재까지의 데이터를 가져오기 위해서는 기간을 1년 단위로 쪼개야 했습니다. 그렇다고 **루프를 돌며 API를 5번 호출한다면 REST API를 쓸 때와 다를 바가 없었습니다.**

### GraphQL Alias를 활용한 연도별 분할 쿼리

[Alias를 사용하면 동일한 필드를 서로 다른 파라미터로 여러 번 요청할 수 있다는 것을 발견했습니다.](https://graphql.org/learn/queries/#aliases)

```graphql
{
  year2025: user(login: "username") {
    contributionsCollection(from: "2025-01-01...", to: "2025-12-09...") { ... }
  }
  year2024: user(login: "username") {
    contributionsCollection(from: "2024-01-01...", to: "2024-12-31...") { ... }
  }
  # ... 가입 연도까지 반복
}
```

Alias를 사용하면 **단 하나의 HTTP 요청(Request Body) 안에 여러 개의 쿼리 블록을 담아 보낼 수 있습니다.** 물리적으로는 1번의 요청이지만, 논리적으로는 연도별로 쪼개서 데이터를 요청하는 방식입니다.

## 3.2 동적 쿼리 생성

사용자마다 GitHub 가입 시점이 다르므로, 쿼리 문자열을 동적으로 생성해야 합니다. GitHub 가입 연도부터 현재까지 반복문을 돌며 쿼리 블록을 조립하는 빌더를 구현했습니다.

### 사용자 가입 연도 기반 동적 쿼리 생성

이를 해결하기 위해 사용자의 GitHub 가입 연도부터 현재까지만 쿼리를 동적으로 생성하는 유틸리티 클래스를 구현했습니다.

```java
public class GraphQLQueryBuilder {
    public static String buildAllActivitiesQuery(String username, LocalDateTime githubJoinDate) {
        int joinYear = githubJoinDate.getYear();
        int currentYear = LocalDate.now().getYear();
        
        StringBuilder query = new StringBuilder();
        query.append("{\n");

        // 가입 연도부터 현재까지 1년 단위로 쿼리 블록 생성
        for (int year = joinYear; year <= currentYear; year++) {
             // ... 날짜 포맷팅 로직 (생략)
            query.append(String.format("""
                year%d: user(login: "%s") {
                  contributionsCollection(from: "%s", to: "%s") {
                    totalCommitContributions
                    totalIssueContributions
                    totalPullRequestContributions
                    totalPullRequestReviewContributions
                  }
                }
                """, year, username, fromDate, toDate));
        }
        
        // Merged PR은 ContributionsCollection에 없으므로 별도 Search 쿼리 병합
        query.append(buildMergedPRBlock(username));
        query.append("}\n");
        
        return query.toString();
    }
}
```

*(`ContributionsCollection` 은 PR의 Open/Merge 상태를 구분해주지 않기 때문에, Merged PR 개수는 동일한 쿼리 내에서 `search` 노드를 이용해 별도로 조회했습니다.)*

## 3.3 동적 필드 매핑 문제

쿼리는 완성했지만 응답을 Java 객체로 매핑하는 과정에서 난관에 부딪혔습니다. 응답 필드명(`year2025`, `year2024`, … ) 이 사용자 가입 기간에 따라 **동적으로 변하기 때문**입니다.

정적 타입 언어인 Java에서 이를 일일이 필드로 선언하는 것은 불가능했습니다.

```json
{
  "data": {
    "year2025": {
      "contributionsCollection": {
        "totalCommitContributions": 150
      }
    },
    "year2024": {
      "contributionsCollection": {
        "totalCommitContributions": 320
      }
    }
  }
}
```

```java
public record GitHubAllActivitiesResponse(
    @JsonProperty("year2025") YearData year2025,
    @JsonProperty("year2024") YearData year2024,
    @JsonProperty("year2023") YearData year2023,
    // ... 2008년까지 필드 생성
) {}
```

그렇다고 위와 같이 개별 필드 선언을 미리 해놓으면 코드 중복이 심해지고, 사용자별로 필요한 연도가 다른데 모든 필드를 선언해야 하며 해가 지날때마다 추가해줘야 합니다.

### Jackson `@JsonAnySetter` 활용

[Jackson의 `@JsonAnySetter`](https://www.baeldung.com/jackson-annotations#bd-3-jsonanysetter) 어노테이션을 사용하면, 알려지지 않은 JSON 필드를 Map으로 수집할 수 있습니다.

> “Jackson 라이브러리는 JSON 데이터를 Java 객체로 역직렬화 할 때, **클래스에 미리 정의되지 않은 프로퍼티**를 만나면 이를 무시하거나 에러를 뱉습니다.
>
>
> 하지만 `@JsonAnySetter` 가 선언되어 있다면, 이 ‘모르는 필드들’을 포착하여 Map에 담아줍니다.”
>

```java
public record GitHubAllActivitiesResponse(
        @JsonProperty("data") Data data
) {
    public static class Data {
        // 동적 필드를 담을 Map
        @Getter
        private final Map<String, YearData> yearDataMap = new HashMap<>();

        // JSON 파싱 중 정의되지 않은 필드(yearXXXX)를 만나면 이 메서드가 호출됨
        @JsonAnySetter
        public void setYearData(String key, YearData value) {
            if (key.startsWith("year")) {
                yearDataMap.put(key, value);
            }
        }
    }
    
    // ... YearData, ContributionsCollection 레코드 정의
}
```

1. Jackson이 JSON 응답을 파싱할 때 `year2025`, `year2024` 등의 필드를 발견
2. 이 필드들이 클래스에 선언되지 않았으므로 `@JsonAnySetter` 가 붙은 메서드 호출
3. `setYearData("year2025", yearData)` 형태로 호출
4. Map에 동적으로 저장

이제 `yearDataMap` 에 연도별 데이터가 모두 담기게 되며, 이를 Stream으로 순회하며 합산하면 사용자의 전체 활동 점수를 계산할 수 있습니다.

```java
public int getCommitCount() {
    return data.getYearDataMap().values().stream()
            .mapToInt(yearData -> yearData.contributionsCollection().totalCommitContributions())
            .sum();
}
```

## 3.5 최종 GraphQL 쿼리 구조

최종적으로 쿼리 빌드부터 DB 저장까지의 전체 데이터 처리 흐름은 아래와 같습니다. 클라이언트가 동적 쿼리를 생성하면, GitHub 서버는 이를 파싱하여 데이터를 수집하고, 다시 클라이언트는 이를 Jackson을 통해 유연하게 받아냅니다.

![GraphQL.png](https://imgur.com/sr3qYNf.png)

![End-to-End.png](https://imgur.com/GY6uXWh.png)

---

# 4. 앞으로 처리해야 될 일들

REST API의 한계를 느끼고 시작된 GraphQL 전환 작업은 ‘1년 조회 제한’ 이라는 벽에 부딪혔었지만, Alias와 동적 쿼리 빌더를 통해 성공적으로 마무리되었습니다.

GraphQL의 전환으로 **5번의 API 호출을 1번으로 통합**했고, 노드 기반의 비용 차감 방식으로 전환하여, **대규모 배치 처리 시 발생할 수 있는 Rate Limit 병목을 사전에 차단**했습니다.

하지만 기능 구현에 집중하느라 놓친 부분들이 많다는 것을 인지하고 있습니다. 이제는 단순히 **‘돌아가는 서비스’** 를 넘어, **‘안전하고 견고한 서비스’** 를 만들기 위해 아래와 같은 과제들을 하나씩 해결해 나갈 예정입니다.

- **외부 의존성 제어와 안정성 강화**
    - GitHub API 장애나 지연에 저의 서버가 전파되지 않도록 **Timeout, Retry, Circuit Breaker 패턴**을 도입하여 백엔드의 핵심 역량인 안정성을 확보할 것입니다.
- **유의미한 모니터링/로깅 포인트 찾기**
    - 단순한 `info()` 로그를 넘어, 배치 실패 시 Slack 알림 연동이나 `stepExecutionId` 추적 등 실질적인 로깅 전략 수립
    - 데이터 증가에 따른 배치 소요 시간 변화, 커밋 수 증가 추이 등 비즈니스 지표 모니터링 체계 구축
- **데이터 무결성과 최신성 유지**
    - 배치 실패 시 자동으로 재시도하는 복구 로직 구현
    - 사용자의 `username` 이나 프로필 이미지가 변경되었을 때, 이를 감지하고 동기화하는 로직 구현
- **동시성 이슈 해결**
    - 배치 실행 중 신규 가입이 발생하거나, 1시간마다 순위 재계산이 도는 동안 조회 요청이 들어올 때 발생할 수 있는 동시성 문제 해결

앞으로도 끊임없는 리팩토링과 개선을 통해 수많은 개발자가 자신의 성장을 즐겁게 확인할 수 있는 안정적인 플랫폼으로 발전시켜 나가겠습니다.