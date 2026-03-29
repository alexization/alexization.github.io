---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/Czp68Om.png"

title: "[Git Ranker #2] 작은 서비스에 Spring Batch를 붙여본 이유"
excerpt: "사용자 수가 많지 않은 GitHub 랭킹 서비스에서, 단순 @Scheduled 대신 Spring Batch를 선택한 이유와 현재 배치 구조를 코드 기준으로 정리한다."
categories:
  - Git Ranker
  - Spring Batch
tags:
  - Spring Batch
  - System Design
  - GitHub API
  - MySQL

toc_label: "Spring Batch 도입기"
toc: true
toc_sticky: true

permalink: /git-ranker/spring-batch/git-ranker-spring-batch/
redirect_from:
  - /git ranker/spring batch/git-ranker-spring-batch/
date: 2025-12-03
last_modified_at: 2026-03-29
---

![mainImage](https://i.imgur.com/Czp68Om.png)

Git Ranker는 GitHub 활동 데이터를 바탕으로 개발자의 점수와 순위를 계산하는 서비스입니다. 사용자 한 명을 등록할 때는 가입일부터 현재까지의 활동을 한 번에 읽고, 그 이후에는 매일 자정에 전체 사용자의 점수를 다시 계산합니다.

이 흐름만 보면 굳이 `Spring Batch`까지 꺼낼 이유가 없어 보일 수 있습니다. 실제로 현재 규모만 놓고 보면 `@Scheduled` 안에서 `userRepository.findAll()`을 읽고 반복문으로 처리해도 충분히 굴러갈 가능성이 큽니다. 데이터 처리도 거대한 ETL 수준은 아니고, 사용자 수도 아직 폭발적으로 많지 않기 때문입니다.

그런데도 저는 Git Ranker에 Spring Batch를 붙였습니다. 이 글에서는 그 선택이 왜 나왔는지, 그리고 현재 코드에서 배치가 어떤 구조로 동작하는지를 함께 정리해보려 합니다.

# 1. 솔직히 말하면 `@Scheduled`만으로도 시작할 수 있었다

먼저 인정할 부분이 있습니다. Git Ranker의 배치 요구사항은 처음부터 아주 거창하지 않았습니다.

- 매일 한 번 전체 사용자의 점수를 갱신한다.
- GitHub API를 호출해 활동 통계를 다시 가져온다.
- 계산이 끝나면 전체 랭킹과 티어를 다시 매긴다.

이 정도만 놓고 보면 가장 단순한 설계는 아래와 비슷했을 겁니다.

```java
@Scheduled(cron = "0 0 0 * * *")
public void refreshAllUsers() {
    List<User> users = userRepository.findAll();

    for (User user : users) {
        // GitHub API 호출
        // 점수 재계산
        // 저장
    }

    // 랭킹 재계산
}
```

작은 서비스의 초기 버전이라면 이 접근이 틀렸다고 보기는 어렵습니다. 오히려 구현 속도만 보면 더 현실적이었을 수도 있습니다.

그래서 이 글의 핵심은 "Git Ranker에는 반드시 Spring Batch가 필요했다"가 아닙니다. 더 정확히 말하면, **지금 규모만 보면 다소 무거운 선택일 수 있지만, 이 프로젝트가 배우고 싶은 주제와 잘 맞았기 때문에 Spring Batch를 택했다**에 가깝습니다.

# 2. 그래도 Spring Batch를 붙인 이유

## 2.1 이 프로젝트의 목적이 기능 구현만은 아니었다

Git Ranker는 단순히 점수 계산 기능 하나를 빨리 만드는 프로젝트가 아니었습니다. 홈랩 환경에서 다음 같은 질문을 직접 다뤄보고 싶었습니다.

- 외부 API 호출이 섞인 대량 작업을 어떻게 나눌 것인가
- 실패한 사용자 하나 때문에 전체 작업을 중단할 것인가
- 배치 진행 상황과 실패 건수를 어떻게 남길 것인가
- 점수 갱신과 랭킹 재계산처럼 성격이 다른 작업을 어떻게 분리할 것인가

즉, 이 프로젝트는 "작은 서비스를 만든다"와 동시에 "배치 시스템을 직접 느껴본다"는 목적도 갖고 있었습니다. 그래서 단순히 돌아가기만 하는 코드보다, **배치 실행 단위를 명확히 표현하는 구조**를 일부러 선택했습니다.

지금 사용자 수와 데이터 복잡도만 보면 다소 오버엔지니어링일 수 있습니다. 하지만 Git Ranker 자체가 운영과 배치 처리를 학습하기 위한 실험장이기도 했기 때문에, 이 정도의 무게는 의도된 선택이었습니다.

## 2.2 `@Scheduled`는 트리거이고, Spring Batch는 실행 모델이다

현재 구현도 스케줄 자체는 `@Scheduled`를 사용합니다. 다만 스케줄러는 "언제 실행할지"만 담당하고, 실제 처리 단위는 Spring Batch `Job`으로 넘깁니다.

```java
@Scheduled(cron = "0 0 0 * * *", zone = "${app.timezone}")
public void runDailyScoreRecalculationJob() {
    JobParameters jobParameters = new JobParametersBuilder()
            .addLocalDateTime("runTime", LocalDateTime.now())
            .toJobParameters();

    jobLauncher.run(dailyScoreRecalculationJob, jobParameters);
}
```

이렇게 두 역할을 분리하면 적어도 설계가 선명해집니다.

- `@Scheduled`: 실행 시점을 정한다.
- `Job`: 배치 전체 흐름을 정의한다.
- `Step`: 작업 단계를 나눈다.
- `Reader` / `Processor` / `Writer`: 사용자 단위 처리 규칙을 분리한다.

작은 서비스에서도 이런 경계는 생각보다 유용했습니다. 스케줄러 메서드 안에 비즈니스 로직을 모두 밀어 넣지 않아도 되기 때문입니다.

## 2.3 외부 API 실패를 "규칙"으로 다루고 싶었다

Git Ranker의 점수 계산은 DB만 읽어서 끝나는 작업이 아닙니다. GitHub API가 중간에 끼어 있습니다. 이 말은 곧 타임아웃, 네트워크 오류, 사용자 정보 변경, Rate Limit 같은 외부 실패를 계속 상대해야 한다는 뜻입니다.

Spring Batch를 쓰면 이런 규칙을 비교적 선언적으로 붙일 수 있습니다.

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

이 설정 덕분에 Git Ranker의 배치는 다음 원칙을 갖게 됐습니다.

- 일시적인 GitHub API 오류는 최대 3번까지 재시도한다.
- 복구 불가능한 오류는 해당 사용자만 건너뛰고 다음 사용자로 넘어간다.
- 한 번에 모든 사용자를 한 트랜잭션으로 묶지 않고 `chunk-size=100` 단위로 자른다.

이런 정책을 직접 루프로 구현하는 것도 가능하지만, 배치 프레임워크의 언어로 표현해두면 나중에 읽을 때 훨씬 의도가 분명해집니다.

## 2.4 점수 재계산과 랭킹 재계산은 성격이 달랐다

Git Ranker의 일일 갱신은 사실 두 작업이 이어진 구조입니다.

1. 사용자별 GitHub 활동을 다시 읽고 점수를 계산한다.
2. 계산된 점수를 기준으로 전체 순위와 티어를 다시 매긴다.

첫 번째는 사용자 단위 반복 처리에 가깝고, 두 번째는 전체 집합에 대한 DB 연산에 가깝습니다. 그래서 둘을 같은 방식으로 처리하는 대신, `Chunk Step + Tasklet Step` 조합으로 나눴습니다.

```java
return new JobBuilder("dailyScoreRecalculationJob", jobRepository)
        .listener(gitHubCostListener)
        .start(scoreRecalculationStep())
        .next(rankingRecalculationStep())
        .build();
```

Spring Batch를 택한 이유는 결국 여기에 가깝습니다. **"매일 도는 작업"을 하나의 메서드가 아니라, 서로 다른 성격의 단계로 표현하고 싶었다**는 것입니다.

# 3. 현재 Git Ranker의 배치 구조

현재 코드 기준으로 보면 Git Ranker의 배치 구조는 생각보다 단순합니다. 중요한 점은 "가입 시점의 전체 스캔"과 "매일 자정 배치"가 서로 다른 경로라는 점입니다.

- 신규 가입과 수동 갱신은 `UserRegistrationService`, `UserRefreshService`에서 전체 스캔으로 처리합니다.
- 매일 자정의 전체 사용자 갱신만 Spring Batch `dailyScoreRecalculationJob`이 담당합니다.

즉, 모든 데이터를 배치로 몰아넣은 구조는 아닙니다. 온라인 요청에서 처리할 것과 배치에서 처리할 것을 나눴습니다.

## 3.1 Step 1: 사용자 점수를 다시 계산한다

첫 번째 Step은 `scoreRecalculationStep`입니다.

- `UserItemReader`: 사용자 테이블을 ID 오름차순으로 페이지 단위 조회
- `ScoreRecalculationProcessor`: 사용자별 활동 통계를 다시 계산
- `UserItemWriter`: 계산이 끝난 `User`를 저장

여기서 핵심은 `ScoreRecalculationProcessor`가 매번 전체 기간을 다 읽지 않는다는 점입니다. 현재 구현은 **기준선(baseline) + 올해 데이터 재조회** 전략을 사용합니다.

배치 프로세서는 먼저 작년 12월 31일 이전의 기준 로그가 있는지 확인한 뒤, 그 결과에 따라 전략을 고릅니다.

```java
ActivityUpdateStrategy strategy = selectStrategy(baselineLog);
ActivityUpdateContext context = createContext(baselineLog, currentYear);

ActivityStatistics stats = strategy.update(user, context);
```

- 기준 로그가 없으면 `FullActivityUpdateStrategy`
- 기준 로그가 있으면 `IncrementalActivityUpdateStrategy`

`FullActivityUpdateStrategy`는 GitHub 가입일부터 현재까지 전체 활동을 다시 읽습니다. 반면 `IncrementalActivityUpdateStrategy`는 올해 데이터만 다시 가져오고, 이전 연도까지의 누적값은 저장된 기준 로그와 합칩니다. 다만 `merged PR` 수는 별도 검색 쿼리 결과를 사용해 다시 반영합니다.

이 기준 로그는 신규 가입이나 수동 갱신 시점에 함께 만들어 둡니다. 사용자의 GitHub 가입 연도가 현재 연도보다 이전이면, `BaselineStatsCalculator`가 작년까지의 누적 통계를 계산하고 `ActivityLog`에 저장합니다.

이 구조를 택한 이유는 두 가지였습니다.

- 과거 데이터는 자주 변하지 않으므로 매일 다시 읽지 않아도 된다.
- 변동 가능성이 큰 올해 활동만 재조회하면 API 비용과 배치 시간을 줄일 수 있다.

즉, 배치의 핵심은 "어제 하루만 더한다"가 아니라 **자주 바뀌지 않는 과거 누적값은 기준선으로 두고, 변동성이 큰 현재 연도 활동을 중심으로 다시 계산한다**는 쪽에 가깝습니다.

## 3.2 Step 2: 전체 랭킹과 티어를 다시 계산한다

점수 계산이 끝나면 두 번째 Step인 `rankingRecalculationStep`이 실행됩니다. 이 단계는 `Tasklet` 하나로 구성되어 있고, 내부에서는 `bulkUpdateRanking()`을 호출합니다.

```java
public RepeatStatus execute(StepContribution contribution, ChunkContext chunkContext) {
    userRepository.bulkUpdateRanking();
    return RepeatStatus.FINISHED;
}
```

이 작업을 `Chunk`로 풀지 않은 이유는 분명했습니다. 순위 재계산은 사용자 한 명씩 자바 코드로 가공하는 작업이 아니라, **정렬과 백분위 계산을 DB가 한 번에 처리하는 편이 더 적절한 작업**이었기 때문입니다.

실제 쿼리는 MySQL Window Function을 사용해 순위와 백분위를 계산하고, 점수 조건과 결합해 티어를 갱신합니다.

```sql
RANK() OVER (ORDER BY total_score DESC) as new_rank,
CUME_DIST() OVER (ORDER BY total_score DESC) as new_percentile
```

정리하면 Git Ranker는 Step마다 다른 도구를 씁니다.

- 사용자별 API 호출과 저장: `Chunk`
- 전체 집합에 대한 순위 재산정: `Tasklet + Native Query`

Spring Batch를 붙였다고 해서 모든 단계를 같은 패턴으로 밀어붙이지는 않았습니다. 오히려 **어떤 작업은 배치답게 쪼개고, 어떤 작업은 DB에 맡기는 식으로 역할을 분리**했습니다.

## 3.3 배치도 운영 대상이 되도록 만들었다

Git Ranker에서 배치는 단순히 "밤에 한 번 도는 코드"가 아닙니다. 실행 결과를 관찰할 수 있는 운영 대상이어야 했습니다.

그래서 현재 배치에는 몇 가지 리스너를 붙여두었습니다.

- `GitHubCostListener`: 전체 사용자 수, 성공/실패 건수, 실행 시간 기록
- `BatchProgressListener`: 10% 단위 진행률 로그 출력
- `UserScoreCalculationSkipListener`: 스킵된 사용자와 실패 원인 저장
- `BatchMetrics`: Micrometer를 통해 성공/실패/처리 건수/소요 시간 수집

이 부분도 사실 작은 서비스라면 과할 수 있습니다. 하지만 배치를 "실행"만 해보는 것과, **실행 결과를 남기고 나중에 해석할 수 있게 만드는 것**은 전혀 다른 경험이었습니다.

# 4. 그렇다면 정말 Spring Batch가 정답이었을까

지금도 같은 질문을 하면 제 대답은 아주 단순합니다.

**운영 중인 작은 MVP를 빠르게 만들어야 했다면, 아마 처음에는 더 단순하게 갔을 것 같습니다.**

현재 Git Ranker 정도의 규모라면 `@Scheduled`와 서비스 메서드만으로도 충분히 출발할 수 있습니다. 그래서 이 선택에는 분명히 학습 목적이 섞여 있습니다. 어떤 의미에서는 의도된 오버엔지니어링이라고 봐도 됩니다.

다만 그 선택이 완전히 낭비였다고 생각하지는 않습니다. 실제로 Spring Batch를 도입하면서 아래가 꽤 명확해졌기 때문입니다.

| 관점 | 단순 `@Scheduled` 루프 | 현재 Git Ranker의 Spring Batch |
| --- | --- | --- |
| 실행 시점 | `@Scheduled`로 해결 가능 | `@Scheduled`로 동일하게 해결 |
| 대량 처리 경계 | 직접 루프와 트랜잭션 설계 필요 | `chunk-size=100`으로 명시 |
| 실패 대응 | 재시도/스킵을 수동 구현 | `retry`, `skip` 정책으로 선언 |
| 단계 분리 | 메서드 안에서 직접 관리 | `Job`/`Step` 구조로 분리 |
| 운영 가시성 | 별도 로깅/메트릭 설계 필요 | 리스너와 메트릭으로 확장 쉬움 |

결국 이 선택은 "반드시 필요해서"라기보다, **배치 시스템을 학습할 만한 실제 문제를 일부러 Spring Batch의 언어로 풀어본 것**에 더 가깝습니다.

# 5. 마치며

Git Ranker에 Spring Batch를 붙인 이유를 한 문장으로 줄이면 이렇습니다.

> 지금 당장 가장 가벼운 선택은 아니었지만, 이 프로젝트에서 배우고 싶었던 문제가 정확히 그 방향에 있었기 때문입니다.

작은 서비스에 무거운 도구를 쓰는 일은 언제나 조심해야 합니다. 도구가 문제보다 커지면 유지보수 비용만 늘어날 수 있기 때문입니다. 저도 그 점을 의식하고 있습니다.

그럼에도 Git Ranker에서는 이 선택이 나름대로 의미가 있었습니다. `@Scheduled` 하나로 끝낼 수도 있었던 작업을, **Chunk 처리, 실패 정책, Step 분리, 운영 로그와 메트릭**까지 가진 배치 시스템으로 바꿔보면서 단순 기능 구현보다 더 많은 것을 배울 수 있었기 때문입니다.
