---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/iUZlf1A.png"

title: "[Git Ranker #5] 멱등성을 지키는 Spring Batch 일일 점수 갱신 설계"
excerpt: "매일 자정 배치를 설계하면서 '어제 데이터만 더하는 방식'을 버리고, 현재는 기준선 + 올해 데이터 재조회 + GraphQL 비용 제어로 진화한 Git Ranker의 Spring Batch 구조를 정리한다."

categories:
  - Git Ranker

tags:
  - Spring Batch
  - GitHub API
  - GraphQL
  - System Design

toc_label: "Spring Batch 도입기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-spring-batch/
redirect_from:
  - /git ranker/git-ranker-spring-batch/
date: 2025-12-08
last_modified_at: 2026-03-29
---

![mainImage](https://i.imgur.com/iUZlf1A.png)

Git Ranker는 GitHub 활동 데이터를 바탕으로 개발자의 점수, 순위, 티어를 계산하는 서비스입니다. 문제는 이 값들이 한 번 계산하고 끝나는 데이터가 아니라는 점이었습니다. 사용자가 새로운 PR을 열 수도 있고, 기존 PR을 닫거나 삭제할 수도 있고, 사용자명 자체가 바뀔 수도 있습니다. 그래서 점수 계산은 "한 번 맞게 계산하는 것"보다 **매일 다시 계산해도 결과가 흔들리지 않는 구조**가 더 중요했습니다.

이 글에서는 Git Ranker의 일일 배치를 어떤 문제의식으로 설계했는지, 그리고 그 판단이 현재 코드에서 어떻게 **Spring Batch + GraphQL + Activity Log** 구조로 구현되어 있는지 정리합니다.

<aside>
<strong>이 글에서 집중하는 내용</strong><br>
초기 아이디어는 "매일 전체 기간을 다시 읽어 점수를 덮어쓴다"는 방식이었습니다. 현재 구현은 그 아이디어를 발전시켜, <strong>신규 등록/수동 갱신은 전체 스캔</strong>, <strong>일일 배치는 기준선(baseline)과 올해 데이터 재조회</strong>를 조합하는 하이브리드 구조로 동작합니다.
</aside>

# 1. 배치에서 먼저 해결해야 했던 문제는 정확성이었다

## 1.1 "어제 데이터만 더하는 방식"은 보기보다 위험했다

배치를 처음 설계할 때 가장 쉽게 떠오르는 방식은 누적 갱신입니다.

- 가입 시점: 전체 활동을 읽어 총점을 계산한다.
- 매일 자정: 전날 활동만 읽어 기존 점수에 더한다.

처음에는 이 방식이 더 가벼워 보였습니다. 조회 범위가 짧고, 매일 처리해야 할 데이터 양도 줄어들기 때문입니다. 하지만 Git Ranker처럼 **외부 API의 현재 상태를 점수에 반영해야 하는 서비스**에서는 이 방식이 금방 한계를 드러냈습니다.

예를 들어 사용자가 월요일에 PR을 열고, 화요일에 그 PR을 삭제했다고 가정해보겠습니다. 수요일 배치가 "화요일에 새로 생성된 활동"만 더하는 구조라면, 이미 점수에 반영된 월요일 PR은 그대로 남고 삭제 사실은 반영되지 않습니다. 결국 GitHub의 실제 상태와 DB의 점수가 어긋나기 시작합니다.

> 배치에서 더 중요한 것은 "하루치 데이터를 빠르게 더하는 것"이 아니라, "같은 작업을 다시 돌려도 현재 상태와 같은 결과가 나오게 만드는 것"이었다.

## 1.2 멱등성이 먼저였다

이 문제를 정리하면 결국 **멱등성**으로 귀결됐습니다. 네트워크 오류나 GitHub API 장애로 배치가 중간에 실패하더라도, 같은 Job을 다시 실행했을 때 결과가 달라지면 안 됩니다.

그래서 초기 설계는 아래처럼 잡았습니다.

```text
매일 자정 배치에서 사용자 활동을 다시 수집한다
→ 점수를 다시 계산한다
→ 기존 점수에 더하지 않고 덮어쓴다
```

이 접근은 배치를 여러 번 다시 돌려도 결과가 누적되지 않습니다. 삭제된 PR이나 변경된 사용자 정보도 다음 실행에서 자연스럽게 반영할 수 있습니다. Git Ranker의 배치는 여기서 출발했습니다.

# 2. 현재 배치의 큰 흐름

현재 Git Ranker의 일일 배치는 `@Scheduled`가 트리거를 맡고, 실제 처리 흐름은 Spring Batch `Job`이 담당합니다.

```java
@Scheduled(cron = "0 0 0 * * *", zone = "${app.timezone}")
public void runDailyScoreRecalculationJob() {
    JobParameters jobParameters = new JobParametersBuilder()
            .addLocalDateTime("runTime", LocalDateTime.now())
            .toJobParameters();

    jobLauncher.run(dailyScoreRecalculationJob, jobParameters);
}
```

스케줄러는 "언제 돌릴지"만 결정합니다. 그 뒤의 흐름은 `dailyScoreRecalculationJob`이 두 단계로 나눠 실행합니다.

```java
@Bean
public Job dailyScoreRecalculationJob() {
    return new JobBuilder("dailyScoreRecalculationJob", jobRepository)
            .listener(gitHubCostListener)
            .start(scoreRecalculationStep())
            .next(rankingRecalculationStep())
            .build();
}
```

- `scoreRecalculationStep`: 사용자별 점수를 다시 계산한다.
- `rankingRecalculationStep`: 계산된 점수를 기준으로 전체 순위와 티어를 다시 매긴다.

여기서 중요한 점은 **점수 계산과 랭킹 계산의 성격이 다르다**는 사실입니다. 사용자별 GitHub API 호출은 반복 처리에 가깝고, 순위 계산은 전체 집합을 한 번에 정렬하는 작업에 가깝습니다. 그래서 두 단계에 같은 패턴을 억지로 적용하지 않았습니다.

# 3. 점수 재계산 Step은 "전체 스캔"에서 "기준선 + 올해 재조회"로 진화했다

## 3.1 신규 등록과 수동 갱신은 여전히 전체 스캔을 쓴다

Git Ranker는 신규 사용자를 등록하거나, 사용자가 직접 수동 갱신을 요청할 때는 지금도 **전체 활동을 다시 읽는 경로**를 사용합니다.

`UserRegistrationService`와 `UserRefreshService`는 공통으로 `fetchRawAllActivities()`를 호출해 GitHub 가입일부터 현재까지의 활동 데이터를 가져옵니다. 여기서 계산된 총 통계는 사용자 점수로 저장되고, 동시에 이후 일일 배치에서 사용할 **기준선 로그**도 함께 생성됩니다.

이 기준선은 "작년 12월 31일까지의 누적 통계"입니다. 과거 데이터는 자주 바뀌지 않기 때문에, 매일 모든 연도를 다시 조회하지 않고도 현재 점수를 복원할 수 있는 기준점 역할을 합니다.

## 3.2 일일 배치는 기준선 유무에 따라 전략을 고른다

배치의 핵심은 `ScoreRecalculationProcessor`에 있습니다. 이 프로세서는 사용자를 하나씩 처리하면서, 기준선 로그가 있는지 확인한 뒤 실행 전략을 선택합니다.

```java
ActivityUpdateStrategy strategy = selectStrategy(baselineLog);
ActivityUpdateContext context = createContext(baselineLog, currentYear);

ActivityStatistics stats = strategy.update(user, context);
```

선택 규칙은 단순합니다.

- 기준선 로그가 없으면 `FullActivityUpdateStrategy`
- 기준선 로그가 있으면 `IncrementalActivityUpdateStrategy`

즉, 현재 구현은 "무조건 전체 재계산"이 아니라, **처음에는 전체 스캔하고 이후에는 기준선 위에 올해 데이터만 다시 얹는 구조**입니다.

<aside>
<strong>왜 올해 데이터만 다시 읽을까</strong><br>
GitHub 활동은 시간이 지날수록 "과거보다 현재 연도"에서 더 자주 바뀝니다. 그래서 Git Ranker는 변동 가능성이 큰 구간만 매일 다시 조회하고, 과거 연도는 기준선 로그로 고정해 API 비용과 배치 시간을 줄였습니다.
</aside>

## 3.3 전체 스캔 전략은 GitHub 가입일부터 현재까지 병렬 조회한다

전체 스캔 전략은 `FullActivityUpdateStrategy`가 담당합니다. 내부적으로는 `GitHubGraphQLClient#getAllActivities()`를 호출해 GitHub 가입 연도부터 현재 연도까지의 활동을 읽어옵니다.

이때 구현은 연도별 쿼리를 병렬로 실행합니다.

```java
Flux<String> queries = Flux.concat(
        Flux.just(queryBuilder.buildMergedPRBlock(username)),
        Flux.fromStream(IntStream.rangeClosed(joinYear, currentYear).boxed())
                .map(year -> queryBuilder.buildYearlyContributionQuery(username, year, githubJoinDate))
);
```

이 구조를 택한 이유는 두 가지였습니다.

- GitHub `contributionsCollection`은 연도 단위로 나눠 읽는 편이 안정적이다.
- 전체 스캔이 필요하더라도 연도별 요청을 병렬화하면 초기 등록과 수동 갱신 시간을 줄일 수 있다.

## 3.4 일일 배치 전략은 올해 데이터만 다시 읽고, 과거는 기준선과 합친다

기준선이 있는 사용자는 `IncrementalActivityUpdateStrategy`로 처리합니다. 이 전략은 현재 연도 데이터만 다시 조회한 뒤, 이전 연도 누적 통계와 합칩니다.

```java
return ActivityStatistics.of(
        baseline.getCommitCount() + currentYear.commitCount(),
        baseline.getIssueCount() + currentYear.issueCount(),
        baseline.getPrCount() + currentYear.prOpenedCount(),
        currentYear.prMergedCount(),
        baseline.getReviewCount() + currentYear.reviewCount()
);
```

여기서 `merged PR`만 별도로 다루는 이유도 현재 구현에 드러납니다. 커밋, 이슈, PR 생성, 리뷰는 연도별 contribution 집계와 기준선을 합쳐 계산하지만, `merged PR`은 GraphQL 검색 결과를 통해 전체 개수를 다시 반영합니다. 즉, Git Ranker의 증분 배치는 단순한 "올해만 더하기"가 아니라, **활동 종류별로 수집 방식이 다른 데이터를 한 번 더 정규화하는 과정**이기도 합니다.

## 3.5 배치는 점수만 갱신하지 않고 일일 스냅샷도 남긴다

점수를 다시 계산한 뒤에는 `ActivityLog`도 함께 저장합니다. 이 로그는 단순 감사 로그가 아니라, 프로필과 배지에서 보여주는 **전일 대비 변화량**의 기준 데이터입니다.

프로세서는 이전 로그를 읽어 diff를 계산한 뒤, 오늘 날짜의 스냅샷을 남깁니다.

```java
ActivityStatistics previousStats = findPreviousStats(user);
ActivityStatistics diffStats = updateStats.calculateDiff(previousStats);

activityLogService.saveActivityLog(user, updateStats, diffStats, LocalDate.now());
```

이 덕분에 Git Ranker는 "현재 점수"뿐 아니라 "어제보다 얼마나 늘었는가"까지 함께 보여줄 수 있습니다. 배치가 단순 유지보수 작업이 아니라 **사용자 경험에 직접 연결된 데이터 생산 과정**이 된 셈입니다.

# 4. 랭킹 계산은 Tasklet과 SQL에 맡겼다

점수 계산이 끝나면 두 번째 Step은 전체 랭킹과 티어를 다시 계산합니다. 이 단계는 사용자 한 명씩 자바 코드로 반복할 이유가 없었습니다. 순위는 결국 **전체 사용자를 점수순으로 다시 정렬하는 집합 연산**이기 때문입니다.

그래서 `rankingRecalculationStep`은 `Tasklet`으로 구성하고, 실제 계산은 `bulkUpdateRanking()` 네이티브 쿼리로 한 번에 처리합니다.

```java
@Query(value = """
    UPDATE users u
        JOIN(
            SELECT
                id,
                RANK() OVER (ORDER BY total_score DESC) as new_rank,
                CUME_DIST() OVER (ORDER BY total_score DESC) as new_percentile
            FROM users
        ) r ON u.id = r.id
    SET
        u.ranking = r.new_rank,
        u.percentile = r.new_percentile * 100,
        u.tier = CASE
            WHEN r.new_percentile <= 0.01 AND u.total_score >= 2000 THEN 'CHALLENGER'
            WHEN r.new_percentile <= 0.05 AND u.total_score >= 2000 THEN 'MASTER'
            ...
        END
    """, nativeQuery = true)
void bulkUpdateRanking();
```

이 선택의 장점은 분명했습니다.

- 사용자별 API 호출과 랭킹 계산을 같은 Step에 섞지 않는다.
- DB가 잘하는 정렬, 순위, 백분위 계산은 DB에 맡긴다.
- 애플리케이션 서버는 외부 API 통신과 사용자별 점수 계산에 집중한다.

즉, Git Ranker는 Spring Batch를 쓴다고 해서 모든 작업을 `Chunk`로 밀어붙이지 않았습니다. **반복 처리에는 Chunk, 집합 연산에는 Tasklet + SQL**이라는 식으로 도구를 나눴습니다.

# 5. 배치를 운영 코드로 만들기 위해 붙인 장치들

Git Ranker의 배치는 "매일 돌긴 한다"에서 끝나지 않습니다. 외부 API를 호출하는 작업은 실패를 전제로 설계해야 했고, 실패했을 때도 어디서 얼마나 문제가 났는지 보여야 했습니다.

## 5.1 재시도와 스킵을 선언적으로 붙였다

점수 재계산 Step에는 `faultTolerant()` 설정을 붙였습니다.

```java
.<User, User>chunk(chunkSize, transactionManager)
.reader(userItemReader.createReader(chunkSize))
.processor(scoreRecalculationProcessor)
.writer(userItemWriter)
.faultTolerant()
.retry(GitHubApiRetryableException.class)
.retryLimit(3)
.skip(GitHubApiNonRetryableException.class)
.skip(GitHubApiRetryableException.class)
.skipLimit(100)
```

이 설정 덕분에 GitHub API 타임아웃 같은 일시적 오류는 최대 3번까지 재시도하고, 복구가 어려운 사용자는 건너뛴 뒤 다음 사용자로 넘어갈 수 있습니다. 배치 전체를 한 번의 거대한 트랜잭션으로 묶지 않고 `chunk-size=100` 단위로 자르는 이유도 여기에 있습니다.

## 5.2 사용자명 변경까지 배치가 흡수한다

GitHub 기반 서비스에서 의외로 자주 부딪히는 문제 중 하나가 **username 변경**입니다. Git Ranker는 이 경우도 배치 안에서 복구합니다.

`ScoreRecalculationProcessor`는 `GITHUB_USER_NOT_FOUND`가 발생하면 실패로 바로 끝내지 않고, 저장해 둔 `nodeId`로 현재 사용자 정보를 다시 조회한 뒤 프로필을 갱신하고 재계산을 시도합니다. 즉, 배치는 단순 계산기라기보다 **외부 식별자 변화까지 흡수하는 동기화 계층**에 가깝습니다.

## 5.3 GraphQL 비용과 토큰 잔량도 함께 관리한다

초기 초안 시점에는 Search API 기반 설계가 보였고, 사용자 한 명당 여러 번의 REST 요청이 필요했습니다. 이 구조는 배치를 붙이는 순간 병목이 더 선명해졌습니다. 사용자 수가 늘수록 "매일 자정 배치"가 아니라 "하루 종일 API를 두드리는 작업"이 될 가능성이 컸기 때문입니다.

현재 저장소는 이 문제를 `GitHubGraphQLClient`와 `GitHubTokenPool`로 풀고 있습니다.

- 활동 수집을 GraphQL 기반으로 바꿨다.
- 토큰을 풀로 관리하며 남은 포인트가 임계값 아래로 내려간 토큰은 제외한다.
- 배치 Job 리스너로 처리 건수, 실패 건수, 실행 시간, 진행률을 남긴다.

즉, Spring Batch 도입은 단순히 "자정에 자동 실행"을 위한 선택이 아니었습니다. 오히려 배치를 붙이고 나니 **외부 API 비용, 실패 정책, 관측 가능성** 같은 운영 문제를 코드 안에서 더 분명하게 다루게 됐습니다.

# 6. 마치며

Git Ranker의 일일 배치는 처음부터 거창한 ETL 시스템을 만들려는 의도로 시작한 것은 아닙니다. 출발점은 오히려 단순했습니다. **삭제나 변경이 일어나는 GitHub 활동 데이터를 매일 다시 계산해도 결과가 흔들리지 않게 만들고 싶었다**는 것이었습니다.

그 문제를 따라가다 보니 설계는 자연스럽게 지금의 형태가 됐습니다.

- 스케줄링은 `@Scheduled`가 맡는다.
- 일일 처리 흐름은 Spring Batch `Job`과 `Step`으로 나눈다.
- 사용자별 점수 계산은 `Chunk`로 처리한다.
- 랭킹과 티어 계산은 `Tasklet`과 SQL로 한 번에 끝낸다.
- 신규 등록과 수동 갱신은 전체 스캔, 일일 배치는 기준선 + 올해 재조회로 최적화한다.
- 실패, 진행률, 비용, 스킵 사유는 로그와 메트릭으로 남긴다.

결국 이 글에서 말하고 싶은 핵심은 하나입니다.

> Git Ranker에서 Spring Batch는 단순한 스케줄링 도구가 아니라, "정확한 재계산"과 "운영 가능한 배치"를 코드로 표현하기 위한 실행 모델이었다.
