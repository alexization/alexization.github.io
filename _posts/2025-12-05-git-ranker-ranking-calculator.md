---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/qPY6Ii7.png"

title: "[Git Ranker #4] 순위 및 티어 계산 기능 구현"
excerpt: "대규모 정렬 없이 순위를 구하는 효율적인 알고리즘과, 초기 사용자 부족으로 인한 티어 산정의 모순을 해결하기 위해 Tasklet과 Window Function을 활용한 배치 최적화 과정"

categories:
  - Git Ranker

tags:
   - MySQL
   - Spring Batch

toc_label: "순위 및 티어 로직 구현"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-ranking-calculator/
redirect_from:
  - /git ranker/git-ranker-ranking-calculator/
date: 2025-12-05
last_modified_at: 2025-12-05
---
# 1. 점수 기반 순위 및 티어 계산 로직

[앞선 포스팅](https://alexization.github.io/git%20ranker/git-ranker-search-api/)에서 Search API를 통해 수집한 데이터를 바탕으로 사용자의 총점을 계산했습니다. 이번에는 이 점수를 기반으로 **순위와 티어**를 부여하는 핵심 비즈니스 로직을 구현했습니다.

## 1.1 순위 계산 알고리즘 : 정렬하지 않고 순위 구하기

가장 먼저 고민한 것은 **“사용자 등록 시점에 어떻게 효율적으로 순위를 매길 것인가?”** 였습니다. 단순하게 생각하면 전체 사용자를 리스트로 가져와 정렬하거나 DB의 `RANK()` 함수를 사용할 수 있습니다.

하지만, **"신규 가입자 한 명"** 의 순위를 알기 위해 전체 데이터를 매번 정렬하는 것은 비효율적입니다. 사용자 수가 늘어날수록 정렬의 시간 복잡도는 **`O(N log N)`** 으로 증가하며, 실시간 트랜잭션 내에서 처리하기에는 애플리케이션 메모리와 DB에 큰 부담을 줄 것입니다.

따라서 **“나보다 점수가 높은 사람의 수 +1”** 이 곧 나의 순위라는 점을 이용해, `COUNT` 쿼리 하나로 가볍게 해결했습니다.

```java
@Transactional(readOnly = true)
public RankingInfo calculateRankingForNewUser(int userScore) {
    // 자신보다 높은 점수를 가진 사용자 수 조회 (DB Index 활용)
    long higherScoreCount = userRepository.countByTotalScoreGreaterThan(userScore);

    // 순위 = 자신보다 높은 점수의 사용자 수 + 1
    int ranking = (int) higherScoreCount + 1;

    return new RankingInfo(ranking, ...);
}
```

**Jpa Repository 쿼리 메서드**

```java
public interface UserRepository extends JpaRepository<User, Long> {
    // SELECT COUNT(*) FROM users WHERE total_score > ?
    long countByTotalScoreGreaterThan(int totalScoreIsGreaterThan);
}
```

이 방식은 `total_score` 컬럼에 인덱스만 걸려있다면 수백만 건의 데이터에서도 매우 빠르게(`O(log N)`) 동작하며, **동점자 처리** 까지 자연스럽게 해결됩니다.

*(예: A, B, C가 모두 100점이면 모두 1등, 그 다음 90점인 D는 4등)*

## 1.2 백분위(Percentile) 와 티어 산정

순위는 상대적입니다. 사용자가 10명일 때의 5등과, 10,000명일 때의 5등은 가치가 다릅니다.

따라서 **상위 몇 %** 에 위치하는지를 나타내는 백분위를 계산하여 티어를 산정합니다.

```java
// 전체 사용자 수 조회
long totalUserCount = userRepository.count();

// 백분위 계산
double percentile = (double) ranking / totalUserCount * 100.0;
```
---
# 2. 직면한 문제 : “1등인데 왜 `IRON` 인가요?”

로직 구현 후 테스트를 진행하던 중, “서비스 초기 단계” 에서 발생할 수 있는 문제를 발견했습니다.

## 2.1 1등이 `IRON` 을 받는 상황

서비스 오픈 직후 사용자가 적을 때, 가입 순서에 따라 티어가 왜곡되는 현상이 발생했습니다.

**상황1 : 서비스 최초 가입자 A**

```
사용자 A 가입 (총점 150점)
→ 전체 사용자: 1명
→ 자신보다 높은 점수: 0명
→ 순위: 1위
→ 백분위: 1/1 * 100 = 100% (상위 100%)
→ 티어: IRON
```

첫 번째 사용자는 무조건 1위지만, 전체 중 100% 이므로 `IRON` 티어를 받게 됩니다.

**상황2 : 고득점자 B 가입**

```
사용자 B 가입 (총점 200점)
→ 전체 사용자: 2명
→ 자신보다 높은 점수: 0명
→ 순위: 1위
→ 백분위: 1/2 * 100 = 50% (상위 50%)
→ 티어: BRONZE
```

**문제점**

1. **사용자 A 의 박탈감 :** 아무리 점수를 많이 얻어도, 혼자 있으면 백분위상 꼴찌(100%)가 되어 최하위 티어를 받습니다.
2. **데이터 정합성 불일치 :** B가 가입하여 A의 순위가 2위로 밀려났지만, A의 DB 정보는 여전히 ‘1위’로 남아있습니다.

기획 단계에서는 “매일 새벽 배치”로 이를 바로잡으려 했으나, 초기 사용자 입장에서 가입 직후 24시간 동안 잘못된 티어를 보는 것은 사용자 경험에 치명적이라 판단했습니다.

---
# 3. 해결 방안 : 배치 주기 단축과 조건부 실행

이 문제를 해결하기 위해 **순위 재조정 배치(Job)의 주기를 단축**하고, 대량의 데이터를 효율적으로 처리하기 위해 **Tasklet 방식**을 도입했습니다.

## 3.1 1시간 간격 재산정 Job

사용자가 가입했을 때마다 실시간으로 전체 사용자의 순위를 재계산하는 것은 DB에 과도한 락(Lock)을 유발할 수 있습니다.

따라서 타협점으로 **1시간 간격**으로 순위를 재조정하도록 기획을 변경했습니다.

- **변경 전 :** 사용자 가입 시 계산(1회) → 24시간 대기 → 새벽 배치
- **변경 후 :** 사용자 가입 시 계산(1회) → **매 1시간마다 순위 재산정** → 새벽 배치

이렇게 하면 티어 정보의 불일치가 최대 1시간 이내로 해소됩니다.

## 3.2 조건부 실행을 통한 리소스 최적화

또한, 1시간마다 무조건 배치를 실행하면 신규 사용자가 없는 상황임에도 동작하는 리소스 낭비가 발생합니다. 따라서 **“지난 1시간 동안 신규 가입자가 있는 경우”** 에만 배치가 동작하도록 가드 로직을 추가했습니다.

```java
@Scheduled(cron = "0 0 * * * *")
public void runHourlyRankingRecalculation() {
    // 지난 1시간 이내 신규 가입자 확인
    LocalDateTime oneHourAgo = LocalDateTime.now().minusHours(1);
    long newUserCount = userRepository.countByCreatedAtAfter(oneHourAgo);

    // 신규 유입이 없는 경우 스킵
    if (newUserCount == 0) {
        return;
    }

    /* 재조정 Job 실행... */
}
```

## 3.3 Chunk vs Tasklet

배치를 구현하는 방식에는 크게 두 가지가 있습니다. 저는 여기서 일반적인 `Chunk` 방식 대신 **`Tasklet` 을 활용한 Bulk Update 방식**을 선택했습니다.

### 왜 Chunk 대신 Tasklet 인가 ?
![Tasklet vs chunk](https://i.imgur.com/qPY6Ii7.png)

일반적인 Spring Batch 패턴인 `ItemReader` → `ItemProcessor` → `ItemWriter` 로 구성하는 Chunk 방식은 데이터를 DB에서 애플리케이션 메모리로 꺼내와서(`SELECT`) 처리한 뒤 다시 DB로 넣는(`UPDATE`) 구조입니다.
대량의 데이터를 메모리에 올리고 내리는 과정에서 불필요한 네트워크/메모리 오버헤드가 발생합니다.

반면, 순위 및 티어 재산정 로직은 복잡한 비즈니스 연산보다는 **전체 데이터의 정렬과 업데이트**가 핵심입니다. 이는 애플리케이션보다 DB 엔진 내부에서 처리하는 것이 훨씬 효율적이라고 판단했습니다.

따라서, JPA가 아닌 **Native Query**를 사용하여 DB 내부에서 단 한 번의 연산으로 모든 업데이트를 처리하는 **Tasklet 방식**을 채택했습니다.

### Window Function (`CUME_DIST`)

순위와 백분위를 동시에 구하기 위해 MySQL 8.0 이상에서 지원하는 윈도우 함수를 활용했습니다.

특히 백분위 계산을 위해 `PERCENT_RANK()` 대신 `CUME_DIST()` 를 선택했습니다.

**왜 `PERCENT_RANK()` 가 아닌 `CUME_DIST()` 를 선택했는가 ?**

저희가 흔히 말하는 **“상위 N%”** 의 개념은 누적 분포에 해당합니다.

- `PERCENT_RANK()` : 0 부터 1 사이의 상대적 순위를 반환합니다. 1등의 경우 항상 `0` 을 반환합니다.
    - 만약, 100명 중 1등이라면, `(1 - 1) / (100 - 1) = 0.0` , 상위 0%는 의미가 모호합니다.
- `CUME_DIST()` : 나보다 점수가 높거나 같은 사람들의 비율을 반환합니다.
    - 만약, 100명 중 1등이라면, `1 / 100 = 0.01` , 상위 1%라는 직관적인 결과를 얻을 수 있습니다.

```sql
UPDATE users u
JOIN (
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
        WHEN r.new_percentile <= 0.01 THEN 'DIAMOND'
        WHEN r.new_percentile <= 0.05 THEN 'PLATINUM'
        ...
        ELSE 'IRON'
    END,
    u.updated_at = NOW();
```
이 방식을 통해 기존에 사용자 수(N)만큼 `UPDATE` 쿼리를 날리던 비효율을 제거하고, **단 한 번의 쿼리**로 전체 순위를 재산정할 수 있게 되었습니다.

---
# 4. 향후 개선 과제 : 티어 분포 최적화

기능적인 구현과 성능 최적화는 완료되었지만, **티어 분포**에 대한 고민은 여전히 남아있습니다.

| **티어** | **기준 (상위 %)** |
| --- | --- |
| **DIAMOND** | 0% ~ 1% |
| **PLATINUM** | 1% ~ 5% |
| **GOLD** | 5% ~ 10% |
| **SILVER** | 10% ~ 25% |
| **BRONZE** | 25% ~ 50% |
| **IRON** | 50% ~ 100% |

현재 로직은 상위 50% 미만을 모두 `IRON` 으로 분류합니다. 이는 전체 사용자의 절반이 최하위 티어에 머물게 됨을 의미합니다.

게임 랭킹 시스템의 심리학적 측면에서, 너무 많은 사용자가 최하위 티어에 정체되면 **성취감 저하와 서비스 이탈**로 이어질 수 있습니다.

## 4.1 개선 방향

1. **다른 서비스 벤치마킹**
    - `Valorant` 나 `LOL` 과 같은 실제 게임 및 서비스 분석

      **Valorant (2024 티어 분포 기준)**

      | **티어** | **기준 (상위 %)** |
              | --- | --- |
      | **RADIANT** | 0% ~ 0.02% |
      | **IMMORTAL** | 0.02% ~ 0.5% |
      | **ASCENDANT** | 0.5% ~ 5% |
      | **DIAMOND** | 5% ~ 15% |
      | **PLATINUM** | 15% ~ 30% |
      | **GOLD** | 30% ~ 55% |
      | **SILVER** | 55% ~ 75% |
      | **BRONZE** | 75% ~ 90% |
      | **IRON** | 90% ~ 100% |
    - GitHub 기반 랭킹 서비스 (GitStar Ranking, GitHub Ranking 등) 분석
2. 초기 절대평가 도입
    - 모수가 적은 서비스 초기에는 백분위(상대평가) 대신, **절대 점수 기준**을 병행하여 “1등이 아이언이 되는” 문제를 근본적으로 방지할 계획입니다.

      (*예: 100점 넘으면 `BRONZE`, 500점 넘으면 `SILVER`*)


이러한 티어 밸런싱은 데이터가 쌓이는 추이를 보며 지속적으로 튜닝해 나갈 예정입니다.
