---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/bcJSQnn.png"

title: "[Git Ranker #5] 매일 새벽 동작하는 Spring Batch 기능 구현"
excerpt: "멱등성을 보장하기 위해 누적 방식 대신 전체 재계산 방식을 선택한 기술적 의사결정 과정과 Spring Batch 아키텍처 설계, 그리고 마주한 REST API Rate Limit의 구조적 한계 고민"

categories:
  - Git Ranker

tags:
   - Spring Batch
   - GitHub API

toc_label: "Spring Batch 도입기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-spring-batch/
redirect_from:
  - /git ranker/git-ranker-spring-batch/
date: 2025-12-08
last_modified_at: 2025-12-08
---
# 1. 개발 전 인식한 기획의 문제점

본격적인 Spring Batch 구현에 앞서, 초기 기획안을 검토하던 중 **운영 단계에서 데이터의 신뢰성을 무너뜨릴 수 있는 치명적인 결함**을 발견했습니다.

## 1.1 초기 기획 : 누적 방식

초기에는 API 호출 비용을 아끼기 위해 **일별 점수 누적 방식**을 고려했습니다.

- **사용자 가입 시 :** 전체 활동 데이터 수집 → 총점 계산 및 저장
- **매일 새벽 배치 :** 전날의 활동만 수집 → 기존 점수에 `+` 더하기

이 방식은 조회 범위가 하루치로 한정되므로 API 응답 속도가 빠르고 배치 처리 시간을 단축할 수 있을 것이라 기대했습니다.

## 1.2 누적 방식의 치명적인 문제점

하지만 깊이 고민해 본 결과, 이 방식은 **배치 애플리케이션의 핵심 원칙**들을 위배하고 있었습니다.

### 문제 1 : 멱등성 보장의 어려움

배치 애플리케이션은 네트워크 장애 등으로 실패했을 때 **언제든 안전하게 재실행(Re-run)** 가능해야 하며, **여러 번 실행하더라도 결과는 항상 같아야 합니다.**

하지만 `기존 점수 += 전날 점수` 와 같은 **단순 누적 방식**은 배치를 재실행할 경우 점수가 **중복으로 합산**될 위험이 큽니다. 이를 방지하기 위해선 “해당 날짜의 배치가 이미 돌았는지” 체크하는 별도의 복잡한 방어 로직이 필요하며, 이는 시스템 복잡도를 불필요하게 높입니다.

### 문제 2 : 데이터 무결성 훼손

더 큰 문제는 **“과거의 활동 취소”** 를 반영할 수 없다는 점입니다.

**상황 예시 : PR 생성 및 삭제**

1. **월요일 :** PR 생성(`+5점`) → **DB 총점 : 5점**
2. **화요일 :** 월요일에 만든 PR을 삭제 (`-5점` 반영 안됨) → **DB 총점 : 5점**
3. **수요일 배치 :** 화요일에 **“생성된”** 이벤트만 조회하므로 삭제 내역을 감지하지 못함 → **DB 총점 : 5점**

실제 GitHub 상에는 PR이 0개지만, 시스템 DB에는 5점으로 기록됩니다. 시간이 지날수록 실제 점수와 DB 점수의 차이가 커지는 **데이터 불일치**가 발생하게 됩니다.

## 1.3 기획 변경 : 전체 재계산 방식

위 두 가지 문제를 동시에 해결하기 위해, 저는 전체 재계산 방식을 선택했습니다.

```
매일 새벽 배치에서 사용자의 전체 활동 데이터를 다시 수집 → 점수 덮어쓰기(Overwrite)
```

이 방식은 배치를 10번 재실행해도 항상 **현재 시점의 GitHub 상태**로 점수를 덮어씌우기 때문에 **멱등성이 완벽하게 보장**되며, 삭제된 PR이나 커밋도 자연스럽게 점수에서 제외되어 **데이터 무결성** 또한 지킬 수 있습니다.

*(향후 `DeleteEvent` 를 추적하여 점수를 차감하는 최적화도 고려 중이나, 현재 단계에서는 **데이터 정확성 보장**이 최우선이라 판단했습니다.)*

---

# 2. Spring Batch 아키텍처 설계

전체 재계산 전략에 맞춰, 대량의 데이터를 안정적으로 처리하기 위한 Spring Batch 아키텍처를 설계했습니다.

## 2.1 Job과 Step 구조

배치 작업은 성격에 따라 크게 크게 **Daily Job(점수 갱신)과 Hourly Job(순위 갱신)** 으로 분리했습니다.

![Job Step 구조.png](https://i.imgur.com/bcJSQnn.png)

## 2.2 Chunk 방식과 Tasklet 방식

Spring Batch 는 데이터 처리 방식에 따라 크게 Chunk와 Tasklet으로 나뉩니다. 저는 각 Step의 성격에 맞춰 두 방식을 혼용했습니다.

**Step1 (점수 재계산) : Chunk 방식**

Chunk 방식은 대량의 데이터를 정해진 크기로 나누어 처리하는 방식입니다.

```
Reader → Processor → Writer (Chunk Size만큼 반복)
```

**Chunk 방식 선택 이유**

- 사용자별로 독립적인 API 호출이 필요
- 일부 사용자의 실패가 전체에 영향이 없어야 함
- 트랜잭션을 작은 단위로 분할하여 안정성 확보 가능

**Step2 (순위 재계산) : Tasklet 방식**

Tasklet 방식은 단일 작업을 한 번에 처리하는 방식입니다.

```
Execute → Finish (전체 사용자 한 번에 처리)
```

**Tasklet 방식 선택 이유**

- 순위는 전체 사용자를 대상으로 한 번에 계산해야 함
- SQL 윈도우 함수를 사용한 대량 업데이트가 효율적이라 판단

[자세한 이유에 대해서는 앞선 포스팅에 작성했습니다 !](https://alexization.github.io/git%20ranker/git-ranker-ranking-calculator/#33-chunk-vs-tasklet)

---

# 3. 점수 재계산 배치 구현 (Step 1)

Step 1 은 외부 API 통신이 핵심이기 때문에, **Chunk 방식**을 사용하여 트랜잭션 범위를 제어했습니다.

**처리 흐름**

![처리 흐름](https://i.imgur.com/hVI2fLw.png)

위 그림과 같이 `Chunk` 단위(50명) 로 데이터를 읽고 처리합니다.

1. **Reader :** DB 에서 50명의 사용자를 읽어옵니다.
2. **Processor :** 각 사용자마다 GitHub API를 5회씩 호출하여 최신 점수를 계산합니다. 이 과정이 50번 반복됩니다.
3. **Writer :** 갱신된 50명의 정보를 DB에 한 번에 저장(`Commit`) 합니다. 만약 중간에 에러가 발생하더라도 해당 Chunk만 롤백되므로 전체 배치가 중단되지 않습니다.

## 3.1 Step 구성

```java
private static final int CHUNK_SIZE = 50;

@Bean
public Step scoreRecalculationStep() {
    return new StepBuilder("scoreRecalculationStep", jobRepository)
            .<User, User>chunk(CHUNK_SIZE, transactionManager)
            .reader(userItemReader.createReader(CHUNK_SIZE))
            .processor(scoreRecalculationProcessor)
            .writer(userItemWriter)
            .build();
}
```

## **3.2 Processor 구현**

Proccessor 에서는 실제 비즈니스 로직(GitHub API 호출 및 점수 계산)을 수행합니다.

```java
@Component
public class ScoreRecalculationProcessor implements ItemProcessor<User, User> {
    private final GitHubActivityService activityService;

    @Override
    public User process(User user) {
        try {
            // 사용자의 전체 GitHub 활동 데이터 수집
            GitHubActivitySummary summary = activityService.collectAllActivities(user.getUsername());

            // 점수 전체 재계산
            int newScore = summary.calculateTotalScore();
            user.updateScore(newScore);

            return user;
        } catch (Exception e) {
            return null;  // null 반환 시 해당 사용자는 Writer에서 제외
        }
    }
}
```

[*(Step 2 인 순위 재계산(Tasklet) 구현 내용은 이전 포스팅을 참고해 주세요 !)*](https://alexization.github.io/git%20ranker/git-ranker-ranking-calculator/#3-%ED%95%B4%EA%B2%B0-%EB%B0%A9%EC%95%88--%EB%B0%B0%EC%B9%98-%EC%A3%BC%EA%B8%B0-%EB%8B%A8%EC%B6%95%EA%B3%BC-%EC%A1%B0%EA%B1%B4%EB%B6%80-%EC%8B%A4%ED%96%89)

---

# 4. 배치 실행 중 직면한 문제 : API Rate Limit

배치 로직을 완성하고 실제로 실행했을 때, 예상했던 문제가 발생했습니다.

## 4.1 Rate Limit 발생

![image.png](https://i.imgur.com/27toNyI.png)

```
HTTP 403 Forbidden
{
  "message": "API rate limit exceeded for x.x.x.x. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)",
  "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
}
```

## **4.2 GitHub Search API 의 엄격한 제한**

GitHub REST API 중에서도 **Search API**는 리소스를 많이 소모하기 때문에 아주 엄격한 제한을 가집니다.

- **일반 REST API :** 시간당 5,000회
- **Search API (인증 없이) :** 분당 10회
- **Search API (인증 사용) :** 분당 30회

## 4.3 불가능한 배치 소요 시간

현재 로직상 사용자 **1명당 5번의 Search API 호출**(Commit, Issue, PR Open, PR Merged, Review) 이 필요합니다.

사용자가 10,000명이라고 가정했을 때 배치가 얼마나 걸릴지 계산해봤습니다.

1. **필요 호출 수 :** 10,000명 * 5회 = 50,000회 요청
2. **처리 속도 제한 :** 분당 30회
3. **소요 시간 :** 50,000 ÷ 30 ≈ **1,667분**

약 27시간 47분이 소요됩니다. 매일 자정에 도는 배치가 다음날 자정까지도 끝나지 않는 상황이기 때문에 **서비스 운영이 불가능한 구조**입니다.

---

# 5. GraphQL 도입 필요성 인식

이 문제를 해결하기 위해 여러 가지 방안(GitHub Token을 여러 개 사용, 지연 처리 등) 을 검토해봤지만, 이는 모두 근본적인 해결책이 아니었습니다.

결국 REST API의 구조적인 한계를 벗어나야 한다고 판단했고, **GitHub GraphQL API** 로 전환하기로 결정했습니다.

**GraphQL API 전환 시 기대 효과**

- REST API 5회 호출을 한 번의 GraphQL 쿼리로 통합하여 네트워크 오버헤드 감소
- 분당 30회라는 개수 제한이 아닌, Node 기반의 포인트 차감 방식으로 전환되어 대량 처리에 훨씬 유리함
- 필요한 데이터만 정확하게 요청 가능
