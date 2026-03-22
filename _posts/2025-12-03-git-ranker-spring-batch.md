---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/KXha7Uy.png"

title: "[Git Ranker #2] 대용량 데이터 처리와 무결성, 왜 하필 Spring Batch여야만 했나 ?"
excerpt: "단순 반복문과 스케줄러의 한계를 넘어, 데이터 무결성과 대용량 트래픽을 감당하기 위해 Spring Batch를 도입한 기술적 의사결정 과정과 Job 아키텍처 상세 설계"
categories:
  - Git Ranker
  - Spring Batch
tags:
   - Spring Batch
   - Architecture
   - GitHub API
  
toc_label: "Spring Batch 도입기"
toc: true
toc_sticky: true

permalink: /git-ranker/spring-batch/git-ranker-spring-batch/
redirect_from:
  - /git ranker/spring batch/git-ranker-spring-batch/
date: 2025-12-03
last_modified_at: 2025-12-03
---
# 1. “그냥 반복문 돌려서 저장하면 되는 거 아닌가 ?”

Git Ranker 프로젝트의 핵심은 **“GitHub 활동 데이터를 수집하여 점수를 매기는 것”** 입니다. 처음 기획 단계에서 이 로직을 떠올렸을 때, 머릿속엔 단순한 `for` 문이 스쳐 지나갔습니다.

> “사용자 등록 요청이 오면, GitHub API 호출해서 1년 치 데이터 가져오고, 점수 계산해서 DB에 `save()` 하면 끝 아닌가?”
>

하지만 서비스를 운영 관점에서 바라보니, 이는 굉장히 위험한 설계였습니다. 

천하의 GitHub 이라도 외부 API는 언제든 끊길 수 있고, 사용자가 늘어나면 데이터의 양은 기하급수적으로 많아지기 때문입니다. Git Ranker의 심장이라 할 수 있는 **데이터 처리 파이프라인**을 왜 **Spring Batch**로 설계했는지 그 고민의 과정을 공유하고자 합니다.

# 2. 왜 굳이 무거운 Spring Batch 인가 ?

물론 `Spring Batch` 는 러닝 커브가 있고 설정이 복잡합니다. 그럼에도 불구하고 `@Async` 나 단순 `@Scheduled` 스케줄러 대신 배치를 선택한 이유는 명확했습니다.

## 2.1 비동기 처리 (`@Async`)

가입 시 1년 치 데이터를 가져오는 건 꽤 오래 걸리는 작업입니다. 이를 비동기로 처리한다고 가정해봤을 때, 만약 1월 1일부터 12월 31일까지 데이터를 저장하다가 **11월쯤 네트워크 오류로 멈춘다면 ..?**

이 사용자는 11월, 12월 데이터가 누락된 채로 랭킹에 올라갑니다. 더 최악인 건 **어디서 끊겼는지 알 수 없기 때문에** **처음부터 다시** 받아야 한다는 점이고 이는 API 호출 낭비로 이어질겁니다.

## 2.2 단순 스케줄러 (`@Scheduled`)

매일 새벽 전체 사용자의 점수를 업데이트하는 로직을 단순 스케줄러로 짠다면 어떨까요 ?

사용자가 10명일 때는 괜찮지만, 10만 명이 된다면 ? ~~_(그러면 좋겠지만 ..)_~~ 트랜잭션 하나가 너무 길어지면서 **DB Lock**이 걸리거나 타임아웃이 발생하여 서비스 전체 장애로 이어질 가능성이 큽니다.

## 2.3 Spring Batch

Spring Batch는 위 문제들에 대한 명확한 해답을 가지고 있습니다.

- **실패 지점 관리 (State Management) :** `JobRepository` 가 작업 상태를 기록합니다. 11월에 실패했다면, 다음 실행 시 **11월부터 이어서(`Restart`)** 수행할 수 있어 데이터 무결성을 보장합니다.
- **청크 지향 처리 (Chunk-oriented) :** 10만 명을 한 번에 처리하지 않고, 100명씩 끊어서 트랜잭션을 맺어 시스템 부하를 일정하게 유지할 수 있습니다.

# 3. Job 설계 전략

Spring Batch 도입을 결정하고 Job을 설계하는 단계에서 가장 큰 난관은 **가입 시점과 매일 새벽의 로직**이 비슷하면서도 다르다는 점이었습니다.

- **Case A (신규 가입) :** 사용자 가입 즉시 한 명에 대해 1년 치 데이터 처리
- **Case B (새벽 갱신) :** 매일 정해진 시간에 전체 사용자에 대해 어제 하루 치 데이터 처리

![이원화 Job 아키텍처](https://i.imgur.com/KXha7Uy.png)

이를 해결하기 위해 두 개의 Job으로 역할을 분리하되, 핵심 로직(Processor)은 재사용하는 구조로 설계했습니다.

## 🚀 Job 1: `UserOnboardingJob` (신규 가입용)

- **Trigger :** 사용자 가입 즉시 실행 (`JobLauncher` 비동기 호출)
- **Target :** 방금 가입한 사용자 1명
- **Data Range :** 가입한 날의 하루 전 날짜를 기준으로 최근 1년

전체 랭킹 재산정 과정은 생략하고 일단 점수만 빠르게 계산하여 사용자에게 보여주는 전략을 선택했습니다.

## 🌙 Job 2: `DailyActivityUpdateJob` (새벽 갱신용)

- **Trigger :** 매일 새벽 N시 (`Cron`)
- **Target :** DB에 등록된 전체 사용자
- **Data Range :** 어제

`Chunk` 처리가 핵심이며, 대용량 데이터를 안정적으로 처리하고 모든 사용자 갱신이 끝나면 전체 랭킹을 다시 산정합니다.

# 4. 상세 Step 구성 : Read-Process-Write

두 Job의 구체적인 구성을 뜯어보겠습니다.

## 4.1 UserOnboardingJob

가입한 사용자 한 명에 대한 1년간의 GitHub 활동을 수집하고 점수를 계산합니다.

### Step1 : `fetchUserHistoryStep` (1년 치 데이터 수집 및 점수 산정)
- **Reader (`ListItemReader`)**
    - 파라미터로 넘겨받은 사용자 1명을 리스트로 감싸서 읽습니다.
- **Processor (`GitHubActivityProcessor`)**
    - GitHub API를 호출합니다.
    - 입력받은 `User` 엔티티의 정보로 최근 1년간의 GitHub 활동 내역을 가져옵니다.
    - `Commit`, `Pull Request` 수 등을 카운트하여 점수로 환산하고, `User` 객체의 `totalScore` 에 더해줍니다.

  ⇒ 해당 Processor 는 날짜 파라미터만 바꿔주면 `DailyActivityUpdateJob` 에서도 그대로 쓸 수 있도록 재사용성을 높였습니다.
  
- **Writer (`CompositeItemWriter`)**
    - 사용자 정보 업데이트와 1년 치 활동 로그(`ActivityLog`)를 저장합니다.

## 4.2 DailyActivityUpdateJob

대용량 처리를 위해 **2개의 Step**으로 나누어 설계했습니다.

### Step1 : `fetchDailyActivityStep` (데이터 수집 및 점수 누적)

DB에 등록되어있는 전체 사용자의 어제 활동을 수집하고 점수를 계산합니다.

![Chunk 프로세스](https://i.imgur.com/xv2SdrH.png)

- **Reader (`UserPagingItemReader`)**
    - DB에서 사용자 목록을 Chunk Size 만큼 페이징 하여 읽어옵니다.
- **Processor (`GitHubActivityProcessor`)**
  - `UserOnboardingJob`과 동일한 로직을 사용합니다.
  - 다만 조회 기간을 어제로 설정하여 주입합니다.

- **Writer (`CompositeItemWriter`)**
    - 점수가 변경된 `User` 와 새로운 `ActivityLog` 를 동시에 저장합니다.

### Step2 : `updateRankingStep` (랭킹 및 티어 산정)

모든 사용자의 점수 업데이트가 끝난 후(Step 1 종료 후) 실행되며, Step 실행 전 `StepExecutionListener` 나 별도의 쿼리를 통해 `전체 사용자 수` 를 미리 파악하여 `JobExecution` 컨텍스트에 저장

- **Reader (`RepositoryItemReader`)**
    - `totalScore` 기준 내림차순 정렬된 전체 사용자를 읽어옵니다.
- **Processor (`TierCalculationProcessor`)**
    - 현재 처리 중인 사용자의 등수와 미리 구한 전체 사용자 수를 비교하여 백분율을 계산하고 이에 맞는 티어를 산정합니다.
- **Writer (`UserUpdateWriter`)**
    - 변경된 랭킹과 티어 정보를 DB에 반영합니다.

# 5. 마치며

위와 같이 Spring Batch를 도입하여 **안정성과 확장성**을 고려한 설계를 세웠습니다. 네트워크가 끊겨도, 사용자가 늘어나도 서버는 금방 죽지 않고 꿋꿋하게 데이터를 처리할 수 있을겁니다…!
