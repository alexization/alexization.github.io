---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/BwOufrv.png"

title: "[Git Ranker #4] 순위 및 티어 계산 기능 구현"
excerpt: "가입 직후에는 COUNT 쿼리로 즉시 순위를 계산하고, 전체 분포는 MySQL Window Function과 Spring Batch Tasklet으로 다시 맞췄다. 서비스 초기의 '1등인데도 낮은 티어' 문제를 하이브리드 티어 규칙으로 정리한 구현 기록"

categories:
  - Git Ranker

tags:
  - MySQL
  - Spring Batch
  - Ranking
  - Architecture

toc_label: "순위 및 티어 로직 구현"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-ranking-calculator/
redirect_from:
  - /git ranker/git-ranker-ranking-calculator/
date: 2025-12-05
last_modified_at: 2026-03-29
---

![mainImage](https://i.imgur.com/BwOufrv.png)

[앞선 글](/git-ranker/git-ranker-search-api/)에서 GitHub 활동을 집계해 총점을 만들었다면, 그 다음 단계는 이 점수가 전체 사용자 안에서 어떤 위치를 가지는지 계산하는 일입니다. Git Ranker에서는 이 문제를 한 번에 풀지 않고, **가입 직후 보여줄 즉시 계산**과 **전체 분포를 다시 맞추는 일괄 재산정**으로 나눠 접근했습니다.

처음에는 순위와 티어를 모두 백분위로 정하면 간단할 것 같았습니다. 하지만 서비스 초기에 사용자가 적을 때는 바로 모순이 생겼습니다. **1등인데도 상위 100%가 되어 낮은 티어를 받는 상황**이 나왔기 때문입니다. 그래서 현재 구현은 **순위는 상대 비교로 계산하고**, **티어는 절대 점수와 백분위를 함께 보는 하이브리드 방식**으로 정리되어 있습니다.

<aside>
<strong>이 글에서 집중하는 내용</strong><br>
이번 글은 점수 계산식 자체보다, 계산된 점수를 어떻게 순위와 티어로 바꾸고 그 결과를 일관되게 유지했는지에 집중합니다. 점수 수집 로직은 앞선 글에서 다뤘고, 배치 파이프라인 전체는 다음 글에서 이어서 설명합니다.
</aside>

# 1. 가입 직후 순위는 전체 정렬 없이 계산했다

사용자가 가입하거나 수동 갱신을 눌렀을 때, 전체 사용자를 매번 정렬해서 순위를 구하고 싶지는 않았습니다. 필요한 것은 "전체 정렬 결과"가 아니라 **"내 앞에 몇 명이 있는가"** 였기 때문입니다.

Git Ranker의 즉시 계산 경로는 `UserPersistenceService`에서 시작합니다. 새 점수를 계산한 뒤, 나보다 점수가 높은 사용자 수만 `COUNT`로 조회하고 전체 사용자 수와 함께 `RankInfo`에 넘깁니다.

```java
@Transactional
public User saveNewUser(User newUser, ActivityStatistics totalStats, ActivityStatistics baselineStats) {
    int newScore = totalStats.calculateScore().getValue();
    long higherScoreCount = userRepository.countByScoreValueGreaterThan(newScore);
    long totalUserCount = userRepository.count() + 1;

    newUser.updateActivityStatistics(totalStats, higherScoreCount, totalUserCount);
    userRepository.save(newUser);

    rankingRecalculationService.recalculateIfNeeded();

    return newUser;
}
```

`RankInfo.calculate()`는 여기서 순위와 백분위를 계산합니다.

```java
public static RankInfo calculate(long higherScoreCount, long totalUserCount, int totalScore) {
    if (totalUserCount == 0) {
        return initial();
    }

    int ranking = (int) higherScoreCount + 1;
    double percentile = (double) ranking / totalUserCount * 100.0;

    return of(ranking, percentile, totalScore);
}
```

핵심 아이디어는 단순합니다.

- **순위**: 나보다 높은 점수의 사용자 수 + 1
- **백분위**: 현재 순위 / 전체 사용자 수 x 100

이 방식의 장점은 분명합니다.

- 전체 사용자 목록을 애플리케이션 메모리로 가져오지 않아도 됩니다.
- `users.total_score` 인덱스를 활용한 범위 조회로 즉시 순위를 계산할 수 있습니다.
- 동점자는 자연스럽게 같은 순위권으로 묶입니다.

> 순위 계산에서 정말 필요했던 것은 "전체를 다시 정렬한 결과"가 아니라, "나보다 앞선 사람이 몇 명인가"였다.

# 2. 티어를 백분위에만 맡기면 서비스 초기에 바로 깨진다

순위만 보면 위 공식을 그대로 써도 됩니다. 문제는 티어였습니다.

만약 티어까지 순수 백분위로만 결정하면, 사용자가 한 명뿐인 상황에서는 아래 같은 결과가 나옵니다.

```text
higherScoreCount = 0
totalUserCount = 1

ranking = 1
percentile = 1 / 1 * 100 = 100
```

즉, **1등이면서도 상위 100%가 됩니다.** 수식만 보면 맞지만, 사용자 경험은 전혀 직관적이지 않습니다.

이 모순은 테스트에도 그대로 남아 있습니다. `RankInfoTest`에는 "유일한 사용자는 1등이지만 백분위 100%라 상대 티어를 받지 못한다"는 케이스가 들어 있습니다. 이 테스트는 단순히 예외 상황을 검증하는 것을 넘어, **서비스 초기에는 모수가 너무 작아 상대 평가만으로 티어를 정의하기 어렵다**는 사실을 드러냅니다.

<aside>
<strong>문제의 핵심</strong><br>
순위는 상대 비교만으로도 계산할 수 있지만, 티어는 "몇 명 중 몇 등인가"만으로 끝나지 않습니다. 특히 사용자 풀이 작은 초기 서비스에서는 절대 점수 기준이 함께 있어야 결과가 덜 왜곡됩니다.
</aside>

# 3. 그래서 티어는 하이브리드 규칙으로 나눴다

현재 Git Ranker는 **하위 티어는 절대 점수**, **상위 티어는 절대 점수와 백분위**를 함께 사용합니다. 이 규칙은 Java 도메인 코드와 MySQL 벌크 업데이트 SQL 양쪽에 동일하게 들어 있습니다.

먼저 Java 쪽 기준은 `RankInfo.calculateTier()`에 있습니다.

```java
private static Tier calculateTier(double percentile, int totalScore) {
    if (totalScore >= 2000) {
        if (percentile <= 1.0) return Tier.CHALLENGER;
        if (percentile <= 5.0) return Tier.MASTER;
        if (percentile <= 12.0) return Tier.DIAMOND;
        if (percentile <= 25.0) return Tier.EMERALD;
        if (percentile <= 45.0) return Tier.PLATINUM;
    }

    if (totalScore >= 1500) return Tier.GOLD;
    if (totalScore >= 1000) return Tier.SILVER;
    if (totalScore >= 500) return Tier.BRONZE;

    return Tier.IRON;
}
```

정리하면 기준은 아래와 같습니다.

| 티어 | 기준 |
| --- | --- |
| `CHALLENGER` | 2,000점 이상 + 상위 1% |
| `MASTER` | 2,000점 이상 + 상위 5% |
| `DIAMOND` | 2,000점 이상 + 상위 12% |
| `EMERALD` | 2,000점 이상 + 상위 25% |
| `PLATINUM` | 2,000점 이상 + 상위 45% |
| `GOLD` | 1,500점 이상 |
| `SILVER` | 1,000점 이상 |
| `BRONZE` | 500점 이상 |
| `IRON` | 500점 미만 |

이 구조로 바꾸자 두 가지가 동시에 해결됐습니다.

- 사용자 수가 적을 때도 **낮은 티어가 지나치게 왜곡되지 않습니다.**
- 상위 티어는 여전히 **"분포 안에서 충분히 높은 위치"**라는 의미를 유지합니다.

예를 들어 총점이 2,500점인 사용자가 혼자라면, 순위는 1위지만 백분위는 100입니다. 이 경우 상대 티어 조건을 만족하지 못하므로 `CHALLENGER`가 아니라 `GOLD`가 됩니다. "1등인데 왜 최하위인가"라는 모순은 사라지고, 동시에 상위 티어를 너무 쉽게 주지도 않게 됩니다.

# 4. 전체 랭킹 재산정은 DB에 맡겼다

가입 직후에는 `COUNT` 기반 즉시 계산으로 충분합니다. 하지만 전체 사용자의 순위와 백분위는 다른 사용자의 가입, 갱신, 점수 변화에 따라 계속 달라집니다. 결국 어느 시점에는 전체를 다시 맞춰야 합니다.

여기서 Git Ranker는 `Chunk`보다 `Tasklet`을 택했습니다. 이유는 간단했습니다. 이 문제는 사용자별 복잡한 자바 비즈니스 로직을 돌리는 작업이 아니라, **전체 집합을 정렬하고 같은 규칙으로 한 번에 갱신하는 작업**에 더 가까웠기 때문입니다.

현재 재산정 SQL은 `UserRepository.bulkUpdateRanking()`에 들어 있습니다.

```sql
UPDATE users u
JOIN (
    SELECT
        id,
        RANK() OVER (ORDER BY total_score DESC) AS new_rank,
        CUME_DIST() OVER (ORDER BY total_score DESC) AS new_percentile
    FROM users
) r ON u.id = r.id
SET
    u.ranking = r.new_rank,
    u.percentile = r.new_percentile * 100,
    u.tier = CASE
        WHEN r.new_percentile <= 0.01 AND u.total_score >= 2000 THEN 'CHALLENGER'
        WHEN r.new_percentile <= 0.05 AND u.total_score >= 2000 THEN 'MASTER'
        WHEN r.new_percentile <= 0.12 AND u.total_score >= 2000 THEN 'DIAMOND'
        WHEN r.new_percentile <= 0.25 AND u.total_score >= 2000 THEN 'EMERALD'
        WHEN r.new_percentile <= 0.45 AND u.total_score >= 2000 THEN 'PLATINUM'
        WHEN u.total_score >= 1500 THEN 'GOLD'
        WHEN u.total_score >= 1000 THEN 'SILVER'
        WHEN u.total_score >= 500 THEN 'BRONZE'
        ELSE 'IRON'
    END,
    u.updated_at = NOW();
```

여기서 중요한 포인트는 세 가지입니다.

- `RANK()`로 동점자에게 같은 순위를 줍니다.
- `CUME_DIST()`로 누적 백분위를 계산합니다.
- `CASE` 문에 Java와 같은 티어 규칙을 넣어 실시간 경로와 배치 경로의 결과를 맞춥니다.

여기서 백분위 함수로 `PERCENT_RANK()`가 아니라 `CUME_DIST()`를 쓴 이유도 있습니다. `PERCENT_RANK()`는 1등에게 `0`을 반환하므로 "상위 0%"라는 표현이 됩니다. 반면 `CUME_DIST()`는 100명 중 1등에게 `1 / 100 = 0.01`을 주기 때문에, Git Ranker가 보여주려는 "상위 1%"라는 표현과 더 자연스럽게 맞습니다.

`Tasklet` 쪽 구현은 매우 얇습니다. 실제 계산은 자바가 아니라 DB가 하도록 두고, 배치는 그 SQL을 호출하는 역할만 맡깁니다.

```java
@Override
public RepeatStatus execute(StepContribution contribution, ChunkContext chunkContext) {
    userRepository.bulkUpdateRanking();
    return RepeatStatus.FINISHED;
}
```

이 선택 덕분에 사용자 수만큼 `UPDATE`를 반복하지 않고, **한 번의 집합 연산으로 순위, 백분위, 티어를 함께 갱신**할 수 있었습니다.

# 5. 즉시 계산과 배치 계산이 서로 다른 답을 내지 않게 맞췄다

실무에서는 계산 공식만 맞아도 끝나지 않습니다. **어떤 경로로 계산하든 같은 결과가 나와야 합니다.**

Git Ranker에서는 이 문제를 두 가지로 맞췄습니다.

첫째, 가입과 수동 갱신 직후에는 `RankingRecalculationService`가 `bulkUpdateRanking()`을 다시 호출합니다. 다만 요청이 몰릴 수 있으므로 5분 디바운스를 둬서 연속 호출을 건너뜁니다.

```java
private static final Duration DEBOUNCE_DURATION = Duration.ofMinutes(5);

@Transactional
public synchronized boolean recalculateIfNeeded() {
    LocalDateTime now = LocalDateTime.now();

    if (shouldSkipRecalculation(now)) {
        return false;
    }

    userRepository.bulkUpdateRanking();
    rankingService.evictRankingCache();
    lastRecalculationTime = now;
    return true;
}
```

둘째, 매일 자정에는 `BatchScheduler`가 `dailyScoreRecalculationJob`을 실행합니다. 스케줄은 `0 0 0 * * *`이고, 타임존은 `Asia/Seoul`입니다. 이 잡은 먼저 점수를 다시 계산하는 `chunk` step을 수행한 뒤, 이어서 `rankingRecalculationStep`에서 같은 벌크 업데이트 SQL을 실행합니다.

이렇게 하면 가입 직후, 수동 갱신, 일일 배치라는 서로 다른 세 경로가 **같은 랭킹 재산정 규칙** 위에 올라갑니다. 추가로 `RankingService.evictRankingCache()`를 호출해 랭킹 목록 캐시도 비워 두었기 때문에, 조회 API가 오래된 순위를 계속 보여주는 문제도 줄일 수 있었습니다.

실제로 `RankInfoTest`는 자바 경로의 티어 임계값을 검증하고, `UserRepositoryIT`는 `RANK()`, `CUME_DIST()`, SQL `CASE`가 같은 결과를 내는지 확인합니다. 순위와 티어 규칙이 두 군데에 들어 있는 만큼, **테스트로 두 경로를 계속 묶어 두는 것**도 구현의 일부였습니다.

<aside>
<strong>현재 코드 기준으로 정리하면</strong><br>
랭킹 재산정은 "1시간 주기 별도 스케줄러"가 아니라, 가입/갱신 직후의 디바운스 재계산과 매일 자정 배치의 두 경로로 관리됩니다.
</aside>

# 6. 이번 구현에서 배운 것

이번 기능을 구현하면서 가장 크게 배운 점은 **순위와 티어는 같은 숫자에서 출발해도, 해결해야 하는 문제가 서로 다르다**는 사실이었습니다.

- 순위는 비교적 단순합니다. 나보다 높은 사람이 몇 명인지 알면 됩니다.
- 티어는 더 어렵습니다. 사용자 풀이 작을 때도 납득할 수 있어야 하고, 사용자가 많아진 뒤에도 상위권의 희소성을 유지해야 합니다.
- 실시간 계산과 배치 계산이 공존한다면, 자바와 SQL에 들어 있는 규칙이 어긋나지 않도록 계속 검증해야 합니다.

그래서 Git Ranker의 현재 구현은 "순위 계산 공식" 하나보다, 아래 세 가지를 함께 만족시키는 방향으로 정리됐습니다.

1. 가입 직후에는 빠르게 결과를 보여줍니다.
2. 전체 분포는 DB 집합 연산으로 다시 맞춥니다.
3. 티어는 서비스 초기와 성장 이후를 모두 견딜 수 있게 하이브리드로 설계합니다.
