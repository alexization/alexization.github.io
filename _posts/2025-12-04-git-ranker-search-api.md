---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/ZmpV4bv.png"

title: "[Git Ranker #3] GitHub 활동 수집에서 Events API 대신 Search API를 선택한 이유"
excerpt: "최근 활동 타임라인을 주는 GitHub Events API가 랭킹 서비스에 맞지 않았던 이유와, Search API 기반 count 집계 방식으로 설계를 바꾼 과정"
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
last_modified_at: 2026-03-29
---

![mainImage](https://i.imgur.com/ZmpV4bv.png)

Git Ranker를 만들면서 가장 먼저 부딪힌 문제는 "사용자의 GitHub 활동을 어디서, 어떻게 읽어올 것인가"였습니다. 점수와 티어를 계산하려면 사용자 한 명의 최근 상태가 아니라, 그 사람이 GitHub에서 어떤 기여를 얼마나 했는지를 비교적 안정적으로 집계할 수 있어야 했습니다.

처음에는 `Events API`가 가장 자연스러운 선택처럼 보였습니다. 이름 그대로 활동 이벤트를 보여주기 때문입니다. 하지만 실제로 서비스 요구사항에 대입해보니, 이 API는 랭킹 서비스의 기준 데이터로 쓰기에 맞지 않았습니다. 그래서 최종적으로는 `Search API` 중심의 집계 방식으로 방향을 바꾸게 됐습니다.

<aside>
<strong>이 글에서 집중하는 내용</strong><br>
이번 글은 "왜 Events API를 버리고 Search API를 택했는가"에 집중합니다. 이후 서비스는 GraphQL 기반 구조로 발전했지만, 그 이야기는 다음 글에서 따로 다룹니다.
</aside>

# 1. 먼저 용어부터 정리하자

GitHub API를 처음 보면 이름은 익숙해도 각 API가 어떤 역할을 하는지는 바로 감이 오지 않습니다. 이번 글에서 다루는 두 API의 차이는 아래처럼 이해하면 됩니다.

## 1.1 GitHub Events API는 최근 활동 타임라인이다

`GitHub Events API`는 특정 사용자의 **최근 공개 활동을 시간순으로 보여주는 타임라인 API**입니다.

예를 들어 아래 같은 질문에 잘 맞습니다.

- 이 사용자가 방금 무엇을 했는가
- 최근에 PR을 열었는가
- 최근에 저장소에 push를 했는가

즉, Events API는 **"최근 활동 피드"** 에 가깝습니다.

## 1.2 GitHub Search API는 조건에 맞는 결과를 찾는 검색 API다

반면 `GitHub Search API`는 활동 로그를 시간순으로 흘려보내는 API가 아닙니다. 대신 **조건에 맞는 commit, issue, pull request를 검색**하고, 그 결과 개수를 집계할 수 있습니다.

예를 들어 아래 같은 질문에 더 잘 맞습니다.

- 이 사용자가 지금까지 만든 PR은 몇 개인가
- 이 사용자가 병합한 PR은 몇 개인가
- 이 사용자가 작성한 issue는 몇 개인가

즉, Search API는 **"최근 무엇을 했는가"보다 "조건에 맞는 활동이 전체적으로 몇 개인가"** 를 묻는 데 적합합니다.

<aside>
<strong>이 글에서 말하는 GitHub 활동 용어</strong><br>
Commit은 코드 변경 기록이고, Pull Request(PR)는 코드 변경을 저장소에 반영해 달라고 요청하는 단위입니다. Issue는 버그나 작업, 논의를 등록하는 항목이고, Review는 PR에 남기는 검토 의견입니다.
</aside>

# 2. Git Ranker에 필요했던 것은 이벤트 원문이 아니었다

Git Ranker는 사용자의 GitHub 활동을 아래 다섯 가지로 나눠 점수를 계산합니다.

| 활동 | 의미 |
| --- | --- |
| Commit | 사용자가 작성한 코드 변경 수 |
| PR Open | 사용자가 연 Pull Request 수 |
| PR Merged | 실제로 병합된 Pull Request 수 |
| Issue | 사용자가 생성한 Issue 수 |
| Review | 사용자가 참여한 코드 리뷰 수 |

여기서 중요한 점은, Git Ranker가 필요한 것은 **이벤트 하나하나의 원문 로그**가 아니라 **활동 종류별 누적 개수**였다는 점입니다.

예를 들어 우리에게 필요한 질문은 이런 것이었습니다.

- 최근 이벤트 20개가 무엇이냐
- `PushEvent`가 어떤 순서로 발생했냐

가 아니라,

- 이 사용자의 전체 커밋 수는 몇 개인가
- 이 사용자가 병합한 PR은 몇 개인가
- 이 사용자가 리뷰에 얼마나 참여했는가

였습니다.

이 차이를 분명히 하고 나니, 어떤 API가 더 적합한지도 자연스럽게 보이기 시작했습니다.

> 우리에게 정말 필요했던 것은 "최근 활동 타임라인"이 아니라, "점수 계산에 쓸 수 있는 활동별 누적 count"였다.

# 3. Events API가 맞지 않았던 이유

## 3.1 최근 30일, 최대 300개라는 한계가 있었다

[GitHub Events API 문서](https://docs.github.com/ko/rest/activity/events)에 따르면 사용자 이벤트 타임라인은 **최대 300개 이벤트만 포함**하고, **최근 30일 이내 데이터만 제공**합니다.

이 제약은 랭킹 서비스와 잘 맞지 않았습니다.

- 활동량이 많은 사용자는 300개를 금방 넘깁니다.
- 활동량이 적은 사용자도 30일이 지나면 예전 활동이 타임라인에서 사라집니다.
- 결국 가입 시점부터의 누적 기여도를 계산하는 기준 데이터로 쓰기 어렵습니다.

처음 기획에서는 최근 1년 정도의 활동을 반영하려 했는데, Events API는 그보다 훨씬 짧은 구간만 보여줬습니다. 즉, 이 API는 **최근 활동을 보여주는 데는 좋지만, 장기 누적 점수를 계산하는 데는 적합하지 않았습니다.**

## 3.2 커밋 수를 안정적으로 세기에도 불리했다

또 다른 문제는 `PushEvent` 안에 들어 있는 세부 정보에 의존해야 한다는 점이었습니다.

기존에는 이벤트 응답의 세부 데이터인 `payload` 안에서 `size`나 `commits` 같은 필드를 보고, 한 번의 push에 몇 개 커밋이 포함됐는지 짐작할 수 있었습니다.

```json
{
  "type": "PushEvent",
  "payload": {
    "size": 3,
    "commits": [{ "...": "..." }]
  }
}
```

하지만 GitHub는 [2025년 10월 7일부터 Events API payload를 축소](https://github.blog/changelog/2025-08-08-upcoming-changes-to-github-events-api-payloads/)했고, 이전처럼 상세 필드를 기대하기 어려워졌습니다.

```json
{
  "type": "PushEvent",
  "payload": {
    "push_id": 123456789,
    "ref": "refs/heads/main",
    "head": "abc123..."
  }
}
```

이렇게 되면 커밋 수를 제대로 세기 위해 이벤트마다 추가 조회가 필요해집니다. 즉, 활동 수집이 단순한 타임라인 조회가 아니라 **이벤트 하나를 읽을 때마다 추가 API 요청이 붙는 구조**로 바뀝니다. 랭킹 계산처럼 많은 사용자를 반복적으로 처리해야 하는 서비스에서는 부담이 커질 수밖에 없습니다.

# 4. 그래서 Search API로 문제를 다시 정의했다

Events API의 한계를 확인한 뒤, 질문 자체를 바꿨습니다.

- "최근 활동 이벤트를 어떻게 해석할까?"

가 아니라,

- "필요한 활동 수치를 가장 직접적으로 어떻게 집계할까?"

로 바꾼 것입니다.

이 관점에서는 [GitHub Search API](https://docs.github.com/ko/rest/search/search?apiVersion=2022-11-28)가 훨씬 더 잘 맞았습니다.

## 4.1 활동별로 바로 질의할 수 있었다

Search API에서는 활동 종류에 맞는 검색 조건을 직접 만들 수 있었습니다.

| 집계 대상 | Search 쿼리 |
| --- | --- |
| Commit | `author:username` |
| PR Open | `author:username type:pr` |
| PR Merged | `author:username type:pr is:merged` |
| Issue | `author:username type:issue` |
| Review | `reviewed-by:username type:pr` |

이 방식의 장점은 분명했습니다.

- 이벤트 타입을 하나씩 파싱하지 않아도 됩니다.
- 점수 계산에 필요한 기준이 쿼리 문자열에 직접 드러납니다.
- "열린 PR"과 "병합된 PR"처럼 비즈니스 규칙을 명확히 나눌 수 있습니다.

즉, 수집 로직이 "이벤트 해석"에서 "조건 기반 집계"로 바뀌었습니다.

## 4.2 `total_count`만 읽으면 충분했다

Search API 응답에는 `total_count`라는 필드가 있습니다.

```json
{
  "total_count": 1543,
  "incomplete_results": false,
  "items": [{ "...": "..." }]
}
```

Git Ranker는 목록 전체가 아니라 **개수**만 필요했기 때문에, `page=1`, `per_page=1`로 최소 데이터만 받아도 충분했습니다.

이 선택 덕분에 얻은 이점은 두 가지였습니다.

- 불필요한 아이템 목록을 크게 내려받지 않아도 됩니다.
- "전체 count를 집계한다"는 목적이 응답 구조와 정확히 맞아떨어집니다.

<aside>
<strong>Search API 전환의 핵심</strong><br>
이 전환은 단순히 다른 API를 고른 것이 아니라, 문제를 "이벤트 해석"에서 "활동별 count 집계"로 다시 정의한 설계 변경이었습니다.
</aside>

# 5. 구현은 어떻게 단순해졌나

초기 Search API 구현은 사용자 한 명에 대해 활동 종류별 count를 각각 조회한 뒤, 이를 하나의 요약 객체로 묶는 구조였습니다.

핵심 흐름만 남기면 이런 형태였습니다.

```java
public GitHubActivitySummary collectAllActivities(String username) {
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
```

예를 들어 병합된 PR 수는 아래처럼 직접 조회할 수 있었습니다.

```java
private int collectPrMergedCount(String username) {
    String query = String.format("author:%s type:pr is:merged", username);

    return gitHubApiClient.searchIssues(query, 1, 1).totalCount();
}
```

이 구조가 좋았던 이유는 명확했습니다.

- 각 활동이 어떤 기준으로 집계되는지 코드만 봐도 이해할 수 있습니다.
- 이벤트를 재생하거나 가공하는 복잡한 로직이 사라집니다.
- 수집과 점수 계산의 책임을 분리하기 쉬워집니다.

즉, 구현도 더 단순해졌고, 나중에 점수 가중치를 바꾸거나 수집 방식을 확장할 때도 구조를 유지하기 쉬워졌습니다.

# 6. Search API도 완전한 해답은 아니었다

Search API는 Events API보다 훨씬 나은 선택이었지만, 운영 단계에서 한계도 분명했습니다.

## 6.1 사용자 1명당 여러 번 호출해야 했다

[GitHub REST Search API의 별도 Rate Limit](https://docs.github.com/en/rest/rate-limit/rate-limit)에 따르면 일반 search 리소스는 인증 요청 기준으로 **30회 제한**을 가집니다.

Git Ranker처럼 사용자 한 명을 분석할 때 활동 종류별로 여러 번 호출하면, 사용자 수가 늘어날수록 배치 처리 비용도 빠르게 커집니다. 초기에는 감당 가능했지만, 장기적으로는 더 효율적인 구조가 필요하다는 신호였습니다.

## 6.2 리뷰 데이터의 정밀도도 아쉬웠다

`reviewed-by:username type:pr`는 리뷰에 참여한 PR 수를 세는 데는 유용했지만, 리뷰의 **세부 밀도**까지 표현하기에는 한계가 있었습니다.

예를 들어 한 PR에서 리뷰를 여러 번 남겼더라도, 우리가 정말 알고 싶은 수준으로 기여도를 세밀하게 표현하기는 어려웠습니다. Git Ranker가 리뷰 활동을 중요한 협업 지표로 보고 있었기 때문에 이 점은 꽤 아쉬웠습니다.

## 6.3 이 한계가 다음 단계로 이어졌다

결국 Search API는 "문제를 올바르게 다시 정의하게 해준 첫 번째 해법"이었습니다.

- Events API에서 벗어나 활동별 집계 중심으로 사고를 바꿨고
- 수집과 점수 계산을 분리할 수 있게 되었고
- 이후 GraphQL과 증분 갱신 구조로 발전할 토대를 만들었습니다

그래서 지금 돌아보면 Search API는 최종 목적지가 아니라, **올바른 방향으로 설계를 틀어준 전환점**에 가까웠습니다.

# 7. 정리

이번 전환에서 배운 점은 분명했습니다.

- `Events API`는 최근 활동을 보여주는 타임라인 API로는 적합했지만, 누적 점수를 계산하는 기준 데이터로 쓰기에는 한계가 컸습니다.
- `Search API`는 활동별 count를 직접 질의할 수 있어서 Git Ranker의 점수 계산 모델과 더 잘 맞았습니다.
- 이 전환 덕분에 수집 로직은 단순해졌고, 이후 구조를 더 발전시킬 수 있는 기반도 생겼습니다.
