---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/iyjUKX7.png"

title: "[Git Ranker #3] 사용자 데이터 수집 : Events API의 실패와 Search API로의 전환"
excerpt: "GitHub Events API의 데이터 유실 및 정책 변경 이슈를 분석하고, Search API 도입을 통해 전체 활동 데이터 기반의 정확한 점수 시스템을 구현한 기술적 의사결정 과정"
categories:
  - Git Ranker
tags:
   - Architecture
   - GitHub API
  
toc_label: "데이터 수집 로직 개선"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-search-api/
redirect_from:
  - /git ranker/git-ranker-search-api/
date: 2025-12-04
last_modified_at: 2025-12-04
---
# 1. 기획 단계에서 설계한 데이터 수집 로직의 문제

## 1.1 기존 기획 : GitHub Events API 활용

프로젝트 기획 초기 단계에서는 사용자의 GitHub 활동 데이터를 수집하기 위해 [**GitHub Events API**](https://docs.github.com/ko/rest/activity/events)(`GET /users/{username}/events`) 를 사용할 계획이었습니다.

이 API는 사용자의 활동 로그를 시간순으로 제공하므로, `PushEvent`, `PullRequestEvent`, `IssuesEvent` 등을 파싱해서 점수를 산정하는 것이 가장 직관적인 방법이라 판단했습니다.

## 1.2 구현에서 직면한 문제들

하지만 실제 구현 단계에서 API를 테스트하던 중, **GitHub 공식 문서와 변경 사항을 검토**한 결과 저희의 서비스에서는 이 API를 사용할 수 없다는 한계를 발견했습니다.

### 문제1 : 300개 이벤트와 30일의 한계

가장 큰 문제는 **데이터 보존 기간**이 기획을 충족시키지 못한다는 점이었습니다. 기획에서는 사용자의 **“최근 1년간의 활동”** 을 모두 수집하여 점수에 반영하는 것이었습니다.

하지만, GitHub Events API는 구조적으로 이를 지원하지 않았습니다.

- [Events API는 최대 300개의 이벤트 혹은 최근 30일 이내의 활동 데이터만 반환합니다.](https://docs.github.com/ko/rest/activity/events)
- [Events API 데이터 보존 기간이 90일에서 30일로 변경되었습니다.](https://github.blog/changelog/2024-11-08-upcoming-changes-to-data-retention-for-events-api-atom-feed-timeline-and-dashboard-feed-features/)

### 문제2 : 2025년 10월 Payload 정책 변경

Events API 사용을 포기하게 만든 결정적인 원인은 **[2025년 10월 7일부터 적용된 GitHub API의 정책 변경](https://github.blog/changelog/2025-08-08-upcoming-changes-to-github-events-api-payloads/)** 이었습니다.

기존에는 `PushEvent` 의 `payload` 객체 내 `size` 필드를 통해 해당 푸시에 포함된 커밋 개수를 알 수 있었습니다.

하지만 GitHub 측에서 성능 최적화를 이유로 **해당 상세 필드들을 응답에서 전면 제거**했습니다.

- 변경 전 : `payload.size` 로 커밋 개수 파악 가능

    ```json
    {
      "type": "PushEvent",
      "payload": {
        "commits": [...],
        "size": 3
      }
    }
    ```

- 변경 후 : 필드가 삭제되었고, 단순히 푸시 식별자(`push_id`) 만 확인 가능

    ```json
    {
      "type": "PushEvent",
      "payload": {
        "push_id": 123456789,
        "ref": "refs/heads/main",
        "head": "abc123...",
        "before": "def456..."
      }
    }
    ```


이제 정확한 커밋 개수를 알기 위해서는 이벤트마다 상세 정보를 조회하는 API를 별도로 호출해야 했습니다.

이는 사용자 한 명을 분석하는 데 수백 번의 추가 호출(N+1 문제)을 발생시켜, 시스템 성능 저하와 Rate Limit 고갈을 초래하게 될 것이라 판단했습니다.

# 2. 해결 방안 : GitHub Search API 도입

Events API의 한계를 깨닫고 GitHub 공식 문서를 더 탐색한 결과, [**GitHub Search API**](https://docs.github.com/ko/rest/search/search?apiVersion=2022-11-28)를 발견했습니다.

## 2.1 Search API를 선택한 이유

### 장점 1 : 기간 제한 없는 전체 데이터 접근

Search API는 날짜나 개수 제한 없이 **사용자의 가입 시점부터 현재까지의 모든 활동**을 조회할 수 있습니다.

이를 통해 Events API의 ‘과거 데이터 유실’ 문제를 해결하고, 사용자의 누적 기여도를 정확하게 계산할 수 있게 되었습니다.

### 장점 2 : `total_count` 를 활용한 네트워크 최적화

서비스에서 필요한 것은 활동의 상세 내용이 아닌 **“총 개수(Count)”** 입니다. Search API의 응답 구조는 최상단에 `total_count` 를 제공합니다.

```json
{
  "total_count": 1543,
  "incomplete_results": false,
  "items": [...]
}
```

이를 활용해 `per_page = 1` 로 파라미터를 설정하면, 불필요한 리스트 데이터를 제외하고 카운트 정보만 가볍게 받아올 수 있어 **네트워크 비용을 획기적으로 절감**할 수 있습니다.

### 장점 3 : 정교한 쿼리 필터링

Search API는 단순 이벤트 타입 체크보다 훨씬 정교한 필터링이 가능합니다.

- `author:username type:pr` : 사용자가 작성한 PR
- `author:username type:pr is:merged` : 단순 PR 생성이 아닌, 병합된 PR만 카운트
- `author:username type:issue` : 이슈에 대해서만
- `reviewed-by:username type:pr` : 사용자가 리뷰어로 참여한 활동 추적

## 2.2 전체 이력 기반의 카운트 집계 방식으로 기획 변경

Search API의 도입으로 기존의 불안전했던 데이터 수집 기획을 전면 수정했습니다.

가장 큰 변화는 “최근 1년간의 활동 분석”에서 “전체 이력 분석”으로의 전환입니다.

이러한 기획 변경을 통해, 사용자가 5년 전에 작성한 커밋 하나까지도 놓치지 않고 점수에 반영할 수 있는 정확하고 공정한 점수 시스템의 기반을 마련했습니다.

# 3. 전체 데이터 기반 점수 계산 로직
![Search API 기반 점수 산정 로직](https://i.imgur.com/iyjUKX7.png)
변경된 기획에 따라 사용자 가입 시 Search API를 활용해 데이터를 수집하는 로직을 구현했습니다.

## 3.1 데이터 수집 코드 (`GitHubActivityService`)
[자세한 코드는 Git Ranker Repository 에서 확인해주세요 !](https://github.com/alexization/git-ranker)

사용자의 활동 내역을 5가지 카테고리로 분류하여, 각각 최적화된 Search Query를 전송합니다.

```java
public GitHubActivitySummary collectAllActivities(String username) {
    // 5번의 Search API 호출로 전체 데이터 수집
    int commitCount = collectCommitCount(username);
    int prOpenCount = collectPrOpenCount(username);
    int prMergedCount = collectPrMergedCount(username);
    int issueCount = collectIssueCount(username);
    int reviewCount = collectReviewCount(username);

    return new GitHubActivitySummary(
        commitCount,
        prOpenCount,
        prMergedCount,
        issueCount,
        reviewCount
    );
}

// 예시 : 커밋 개수 수집
private int collectCommitCount(String username) {
    String query = String.format("author:%s", username);
    
    GitHubSearchResponse<GitHubCommitSearchItem> response =
        gitHubApiClient.searchCommits(query, 1, 1);
    
    return response.totalCount();
}
```

모든 요청에서 `page = 1`, `per_page = 1` 파라미터를 사용하여 **최소한의 데이터만 요청**합니다. 정작 필요한 것은 `total_count` 값뿐이므로, 실제 아이템 배열은 1개만 받아도 충분합니다.

## 3.2 가중치 기반 점수 산정

수집된 `total_count` 에 기획된 가중치를 반영하여 총점을 계산합니다.

단순 활동량뿐만 아니라, PR 병합(`Merge`) 과 같이 실제 프로젝트에 기여한 활동에 더 높은 가중치를 부여했습니다.

```java
public record GitHubActivitySummary(
    int totalCommitCount,
    int totalPrOpenedCount,
    int totalPrMergedCount,
    int totalIssueCount,
    int totalReviewCount
) {
    public int calculateTotalScore() {
        return (totalCommitCount * 1)      // 커밋: 1점
             + (totalIssueCount * 2)       // 이슈: 2점
             + (totalReviewCount * 3)      // 리뷰: 3점
             + (totalPrOpenedCount * 5)    // PR 생성: 5점
             + (totalPrMergedCount * 10);  // PR 병합: 10점
    }
}
```

# 4. GitHub Search API의 한계와 과제

Search API 도입으로 ‘전체 데이터 수집’ 문제는 해결했지만, 운영 과정에서 새로운 기술적 문제들을 마주하게 되었습니다.

## 한계 1 : 극도로 낮은 Rate Limit

GitHub Search API는 일반 API보다 훨씬 엄격한 호출 제한을 가집니다. [공식 문서에 따르면 인증된 사용자(`Authenticated User`) 라도 분당 30회의 요청만 허용됩니다.](https://docs.github.com/ko/enterprise-server@3.15/rest/search/search?apiVersion=2022-11-28#rate-limit)

사용자 1명의 점수를 계산하는 데 5번의 API 호출이 필요하므로, 이론상 **분당 최대 6명**의 사용자만 처리할 수 있습니다. 이는 추후 대규모 사용자의 순위를 갱신하는 배치 작업에서 심각한 병목 지점이 될 것입니다.

## 한계 2 : 코드 리뷰 데이터의 정밀도 부족

`reviewed-by` 쿼리는 사용자가 **리뷰를 남긴 PR의 개수**만 반환합니다.

한 개의 PR에 10개의 정성스러운 코드 리뷰 커멘트를 남겨도 카운트는 오직 단 1로 집계됩니다. 이는 열정적인 리뷰어의 기여도가 실제보다 저평가될 수 있음을 의미합니다.

현재의 REST(Search) API 방식으로는 이러한 한계를 넘기 어렵습니다. 따라서 추후 성능 최적화와 데이터 정밀도를 높이기 위해 **GraphQL API** 도입을 고려하거나, 배치 처리 전략을 고도화하는 과정이 필요함을 인지하고 있습니다.
