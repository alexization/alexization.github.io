---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/Ngh0CIT.png"

title: "[Git Ranker #7] 로그는 텍스트가 아니라 데이터다 : 관측 가능한 시스템 구축기"
excerpt: "요청 단위 trace_id, 구조화 로그, 배치와 GitHub API 관측, Loki/Grafana 검색까지. Git Ranker가 로그를 운영 데이터로 바꾼 과정을 정리한다."
categories:
  - Git Ranker
tags:
  - Spring Boot
  - Logging
  - Observability

toc_label: "로깅 시스템 구축기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-logging-system/
redirect_from:
  - /git ranker/git-ranker-logging-system/
date: 2025-12-18
last_modified_at: 2026-03-30
---

![mainImage](https://i.imgur.com/Ngh0CIT.png)

서비스를 배포할 때 가장 불안한 순간은 기능이 깨지는 순간이 아니라, **문제가 생겼을 때 어디서부터 봐야 하는지 모르는 상태**입니다. 요청은 들어오는데 왜 느린지 모르고, 401이나 404가 늘어나는데 어떤 경로에서 막히는지 모르고, 배치가 실패했는데 어느 사용자에서 터졌는지 모르면 서비스는 사실상 눈을 감고 운영하는 것과 다르지 않습니다.

Git Ranker는 단일 Spring Boot 애플리케이션이지만 실행 경로가 단순하지 않습니다. HTTP 요청은 인증 필터와 컨트롤러, 전역 예외 처리기를 지나고, 새벽 배치는 Spring Batch에서 별도 스레드로 돌고, 점수 계산은 GitHub GraphQL API의 지연 시간과 rate limit 영향을 받습니다. 즉, 로그는 단순히 `println`을 더 예쁘게 찍는 문제가 아니라 **서로 다른 실행 경계를 한 언어로 관찰하는 문제**였습니다.

이번 글에서는 Git Ranker가 왜 기존의 텍스트 로그 방식에서 벗어났는지, 그리고 현재 저장소 기준으로 `LoggingFilter`, `LogContext`, `GitHubApiLoggingAspect`, `logback-spring.xml`, `promtail-config.yml`이 어떻게 하나의 운영 체계로 연결되는지 정리합니다.

<aside>
<strong>이 글에서 집중하는 내용</strong><br>
이 글은 "로그를 많이 남기는 법"이 아니라, Git Ranker가 <strong>요청 단위 상관관계 ID</strong>, <strong>도메인 이벤트 중심 구조화 로그</strong>, <strong>배치와 외부 API 관측</strong>, <strong>Loki/Grafana 검색</strong>까지 어떻게 이어 붙였는지 설명합니다. 분산 트레이싱까지는 아니지만, 단일 Spring Boot 서비스에서 운영 가능한 관측 기반을 만드는 데 필요한 수준을 목표로 했습니다.
</aside>

# 1. 로그를 "출력"이 아니라 "관측 데이터"로 다시 정의했다

프로젝트 초반 로그는 흔히 보는 형태였습니다.

```java
log.info("회원가입 요청: {}", request.getUsername());
// 비즈니스 로직
log.info("회원가입 성공, ID: {}", user.getId());
```

로컬에서 한 명만 테스트할 때는 충분했습니다. 하지만 서버가 동시에 여러 요청을 처리하기 시작하면 곧바로 한계가 드러났습니다.

```text
14:23:01 INFO 회원가입 요청: Alice
14:23:01 INFO 회원가입 요청: Bob
14:23:02 INFO GitHub API 호출 시작
14:23:03 INFO 회원가입 성공, ID: 1
14:23:04 INFO GitHub API 호출 완료
14:23:04 INFO 회원가입 성공, ID: 2
```

이 로그는 "무슨 일이 있었다"는 사실만 보여줍니다. 하지만 운영에서는 그것만으로 부족합니다. 저는 아래 세 가지를 바로 추적할 수 있어야 했습니다.

- 이 로그들이 **같은 요청에서 나온 것인지**
- 실패가 났다면 **어느 단계에서, 어떤 사용자 맥락에서** 발생했는지
- HTTP 요청, 배치 작업, GitHub API 호출처럼 **서로 다른 흐름을 한 기준으로 묶을 수 있는지**

> **모니터링이 "이상이 있다"를 감지하는 일이라면, 옵저버빌리티는 "왜 그랬는지"를 거슬러 올라갈 수 있게 만드는 능력에 가깝습니다.**

그래서 Git Ranker의 로깅 설계는 처음부터 세 가지 원칙으로 정리됐습니다.

- 모든 로그는 공통 상관관계 키를 가져야 한다.
- 메서드 진입과 종료보다 상태 변화가 있는 이벤트를 남겨야 한다.
- 검색을 위한 차원과 상세 문맥을 분리해 저장소의 비용과 검색성을 함께 관리해야 한다.

# 2. 요청 진입점은 `Controller`가 아니라 `Filter`였다

![filter](https://i.imgur.com/izwcCPF.png)

처음에는 `AOP`가 가장 자연스러워 보였습니다. 로깅은 전형적인 횡단 관심사이고, 컨트롤러나 서비스 메서드 진입과 종료를 감싸면 중복을 크게 줄일 수 있기 때문입니다.

하지만 현재 Git Ranker 구조에서는 그것만으로 부족했습니다. 이유는 명확했습니다.

- 컨트롤러에 매핑되지 않은 요청은 컨트롤러 자체가 실행되지 않습니다.
- 인증과 인가 문제는 컨트롤러보다 앞단의 보안 필터 체인에서 발생할 수 있습니다.
- 요청 상관관계 ID는 비즈니스 로직이 아니라 **서블릿 컨테이너 진입 시점**에 붙어야 합니다.

그래서 실제 요청 추적의 시작점은 AOP가 아니라 `LoggingFilter`가 됐습니다.

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class LoggingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        LogContext.initRequest(
                LogContext.generateTraceId(),
                resolveClientIp(httpRequest),
                httpRequest.getHeader("User-Agent"),
                httpRequest.getMethod(),
                httpRequest.getRequestURI()
        );

        long start = currentTimeMillis();

        try {
            chain.doFilter(request, response);
        } finally {
            long latency = currentTimeMillis() - start;
            int status = httpResponse.getStatus();

            LogContext logContext = LogContext.event(Event.HTTP_RESPONSE)
                    .with("status", status)
                    .with("latency_ms", latency)
                    .with("outcome", resolveOutcome(status, latency));

            if (latency > 10_000L) {
                logContext.warn();
            } else {
                logContext.info();
            }

            LogContext.clear();
        }
    }
}
```

핵심은 두 가지였습니다.

- `@Order(Ordered.HIGHEST_PRECEDENCE)`로 가장 먼저 실행해 **보안 필터 이전**부터 같은 `trace_id`를 공유하게 만들었습니다.
- 응답이 끝난 시점에만 경계 로그를 남겨 `status`, `latency_ms`, `outcome`을 한 번에 기록했습니다.

여기서 `LogContext.clear()`는 선택이 아니라 필수입니다. 서블릿 컨테이너는 요청마다 스레드를 새로 만들지 않고 **재사용된 스레드 풀**을 돌리기 때문입니다. 이전 요청의 MDC가 남아 있으면 다음 사용자의 로그에 과거 문맥이 섞이는 순간, 로그는 즉시 신뢰를 잃습니다.

이 동작은 테스트로도 고정했습니다. `LoggingFilterTest`에서는 2xx 응답이 `success`, 4xx/5xx 응답이 `failure`, 느린 2xx 응답이 `warning`으로 기록되는지를 검증합니다. 즉, 로그 레벨과 결과 분류가 운영자 감각이 아니라 코드 계약이 되도록 했습니다.

# 3. HTTP 밖의 흐름도 같은 방식으로 추적했다

HTTP 요청만 추적해서는 충분하지 않았습니다. Git Ranker의 중요한 작업 두 개는 HTTP 바깥에서 일어났기 때문입니다.

- 매일 자정에 실행되는 Spring Batch 점수 재계산
- GitHub GraphQL API 호출과 rate limit 관리

## 3.1 배치는 스케줄러에서 직접 `trace_id`를 발급했다

배치는 `Filter`를 거치지 않습니다. 그래서 `BatchScheduler`는 배치를 시작할 때 직접 `trace_id`를 발급하고, 시작과 종료, 실패를 이벤트로 남깁니다.

```java
@Scheduled(cron = "0 0 0 * * *", zone = "${app.timezone}")
public void runDailyScoreRecalculationJob() {
    final String jobName = "DailyScoreRecalculation";

    LogContext.setTraceId(LogContext.generateTraceId());

    LogContext.event(Event.BATCH_STARTED)
            .with("job_name", jobName)
            .info();

    try {
        jobLauncher.run(dailyScoreRecalculationJob, jobParameters);

        LogContext.event(Event.BATCH_COMPLETED)
                .with("job_name", jobName)
                .info();
    } catch (Exception e) {
        LogContext.event(Event.BATCH_FAILED)
                .with("job_name", jobName)
                .with("error_message", e.getMessage())
                .error(e);
        throw new BusinessException(ErrorType.BATCH_JOB_FAILED, e.getMessage());
    } finally {
        LogContext.clear();
    }
}
```

여기에 `GitHubCostListener`와 `UserScoreCalculationSkipListener`가 붙으면서 배치 로그는 더 운영 친화적으로 바뀌었습니다.

- 배치 시작 시 `total_user_count`
- 배치 종료 시 `success_count`, `fail_count`, `skip_count`, `duration_ms`
- 항목 실패 시 `phase`, `error_type`, `retryable`

즉, "배치가 돌았다"에서 끝나는 것이 아니라 **어느 단계에서 얼마나 실패했고, 재시도 가능한 오류인지**까지 로그만으로 설명할 수 있게 됐습니다.

## 3.2 AOP는 버린 것이 아니라, GitHub API 경계로 옮겼다

반대로 AOP는 완전히 버린 도구가 아닙니다. 요청 진입점에는 맞지 않았지만, `GitHubGraphQLClient`처럼 **특정 협력자 경계**를 감싸는 데는 오히려 잘 맞았습니다.

```java
@Around("execution(* com.gitranker.api.infrastructure.github.GitHubGraphQLClient.*(..))")
public Object logGithubApiCall(ProceedingJoinPoint joinPoint) throws Throwable {
    String methodName = joinPoint.getSignature().getName();
    long start = System.currentTimeMillis();

    try {
        Object result = joinPoint.proceed();
        long latency = System.currentTimeMillis() - start;

        GitHubRateLimitInfo rateLimit = extractRateLimit(result);

        LogContext ctx = LogContext.event(Event.GITHUB_API_CALLED)
                .with("operation", methodName)
                .with("target", "github_api")
                .with("latency_ms", latency)
                .with("outcome", "success");

        if (rateLimit != null) {
            ctx.with("cost", rateLimit.cost())
               .with("remaining", rateLimit.remaining());
        }

        ctx.info();
        apiMetrics.recordSuccess(latency);
        return result;
    } catch (Exception e) {
        LogContext.event(Event.GITHUB_API_CALLED)
                .with("operation", methodName)
                .with("target", "github_api")
                .with("outcome", "failure")
                .with("error_type", e.getClass().getSimpleName())
                .with("error_message", e.getMessage())
                .error();
        throw e;
    }
}
```

이 방식 덕분에 GitHub API 로그는 단순 성공/실패를 넘어 아래 문맥을 함께 갖게 됐습니다.

- 어떤 연산이 호출됐는지
- 얼마나 느렸는지
- 이번 호출이 얼마나 많은 `cost`를 썼는지
- 남은 `remaining` 예산이 얼마나 되는지

그리고 `GitHubGraphQLClient` 내부에서는 남은 예산이 임계치 아래로 떨어지면 `RATE_LIMIT_WARNING` 이벤트를 남기고 예외를 발생시킵니다. 즉, Git Ranker에서 AOP는 "모든 것을 감싸는 도구"가 아니라, **경계가 분명한 외부 API 호출을 관찰하는 도구**로 자리를 잡았습니다.

# 4. `MDC`만 쓰지 않고 `LogContext`로 로그 계약을 고정했다

여기서부터가 실제로 가장 중요했습니다. `MDC`는 편리하지만, 그대로 쓰면 결국 각 클래스가 제멋대로 키를 넣는 **자유로운 해시맵**이 됩니다. 그렇게 되면 로그는 남아도 검색과 집계는 점점 어려워집니다.

그래서 Git Ranker는 `MDC` 위에 `Event` enum과 `LogContext`를 올려 **로그 계약 자체를 코드로 고정**했습니다.

```java
private static final Set<String> REQUEST_SCOPED_KEYS = Set.of(
        "trace_id", "username", "client_ip", "user_agent", "request_method", "request_uri"
);

public static LogContext event(Event event) {
    clearEventFields();
    return new LogContext(event);
}
```

이 구조의 장점은 분명합니다.

- 요청 전체에서 유지해야 할 값과 이벤트마다 바뀌는 값을 분리할 수 있습니다.
- `event`, `log_category`, `phase`, `outcome` 같은 핵심 축이 항상 같은 이름으로 기록됩니다.
- 각 서비스가 메시지 문자열을 파싱하지 않고도 동일한 스키마를 따를 수 있습니다.

예를 들어 수동 갱신 요청 로그는 아래처럼 남습니다.

```java
LogContext.event(Event.USER_REFRESH_REQUESTED)
        .with("username", updatedUser.getUsername())
        .with("old_score", oldScore)
        .with("new_score", updatedUser.getTotalScore())
        .with("score_diff", scoreDiff >= 0 ? "+" + scoreDiff : String.valueOf(scoreDiff))
        .info();
```

여기서 중요한 점은 `username`이 raw value로 저장되지 않는다는 것입니다. `LogContext`는 내부적으로 `LogSanitizer`를 호출해 `username`과 `target_username`을 자동 마스킹합니다. 실제로 `LogContextTest`는 `octocat`이 `oc*****`로 남는지 검증하고 있습니다.

또 하나 흥미로운 부분은 문맥이 **요청의 진행에 따라 점진적으로 풍부해진다**는 점입니다.

- `LoggingFilter`는 처음에 `trace_id`, `client_ip`, `request_method`, `request_uri`를 넣습니다.
- `JwtAuthenticationFilter`와 `OAuth2AuthenticationSuccessHandler`는 인증이 확인된 뒤 `username`을 같은 요청 문맥에 추가합니다.
- 이후 도메인 서비스와 예외 처리기는 같은 `trace_id` 아래에서 더 구체적인 이벤트를 남깁니다.

즉, Git Ranker의 로그는 한 줄짜리 메모가 아니라, **같은 요청 문맥 위에 단계적으로 쌓이는 구조화 이벤트 묶음**에 가깝습니다.

<aside>
<strong>`clearEventFields()`와 `clear()`를 분리한 이유</strong><br>
같은 요청 안에서도 `trace_id`, `request_uri` 같은 값은 유지되어야 하지만, `status`, `error_code`, `job_name` 같은 이벤트 필드는 다음 로그로 흘러가면 안 됩니다. Git Ranker는 요청 스코프와 이벤트 스코프를 분리해, 한 요청 안의 여러 로그가 서로의 문맥은 공유하되 이벤트 데이터는 오염시키지 않도록 설계했습니다.
</aside>

# 5. 로그 품질은 양이 아니라 규칙에서 결정됐다

## 5.1 메서드 시작과 종료보다 상태 변화가 있는 순간만 남겼다

초기 로깅에서 가장 먼저 줄인 것은 "컨트롤러 시작", "서비스 진입", "서비스 종료" 같은 기계적인 로그였습니다. 이런 로그는 많을수록 안심이 되기보다는, 오히려 중요한 사건을 묻어버립니다.

현재 Git Ranker가 실제로 남기는 이벤트는 대체로 아래와 같습니다.

- `USER_REGISTERED`
- `USER_LOGIN`
- `USER_REFRESH_REQUESTED`
- `BADGE_VIEWED`
- `AUTH_FAILED`
- `BATCH_STARTED`, `BATCH_COMPLETED`, `BATCH_ITEM_FAILED`
- `GITHUB_API_CALLED`, `RATE_LIMIT_WARNING`
- `HTTP_RESPONSE`
- `ERROR_HANDLED`

이벤트 이름을 보면 공통점이 있습니다. **무언가의 상태가 바뀌었거나, 운영자가 관심 가져야 할 결과가 확정된 시점**만 남깁니다. 예를 들어 `UserRegistrationService`는 신규 사용자 저장이 끝난 뒤 `initial_score`, `initial_tier`와 함께 `USER_REGISTERED`를 남기고, `BadgeService`는 배지 생성 시 `BADGE_VIEWED`를 남깁니다. 반면 메서드 진입과 종료 같은 정보는 의도적으로 줄였습니다.

## 5.2 레벨과 민감 정보도 함께 통제했다

좋은 로그는 "무조건 많이"가 아니라 **주의를 어디에 쓰게 만들 것인지**까지 설계해야 합니다.

> **로그의 목적은 더 많은 텍스트를 남기는 것이 아니라, 운영자가 정말 봐야 할 사건을 더 선명하게 남기는 것입니다.**

Git Ranker에서는 이 원칙을 두 가지로 적용했습니다.

첫째, 로그 레벨을 예외 성격과 분리하지 않았습니다. `GlobalExceptionHandler`는 `BusinessException`의 `ErrorType`이 가진 로그 레벨을 그대로 따르고, 404에 해당하는 `NoResourceFoundException`은 `debug`로 낮춰 기록합니다. 크롤러와 봇이 만든 노이즈까지 모두 `error`로 찍기 시작하면, 진짜 장애가 발생했을 때 오히려 감지가 둔해집니다.

둘째, 개인 식별 정보는 로그 친화적으로 다듬었습니다. `LogSanitizer`는 `username`, `target_username`을 자동 마스킹하고, `ScoreRecalculationProcessor`는 예기치 못한 배치 오류를 감쌀 때 raw username 대신 고정 길이 해시를 남깁니다. 덕분에 **같은 사용자를 식별할 수는 있지만, 원문을 그대로 노출하지는 않는** 균형을 맞출 수 있었습니다.

# 6. 운영 환경에서는 JSON 로그와 메트릭을 함께 흘렸다

개발 환경과 운영 환경에서 로그의 목적은 다릅니다. 로컬에서는 사람이 콘솔을 읽기 쉬워야 하고, 운영에서는 수집기와 검색기가 파싱하기 쉬워야 합니다.

그래서 `logback-spring.xml`은 프로필에 따라 출력 형식을 나눴습니다.

```xml
<springProfile name="!prod">
    <root level="INFO">
        <appender-ref ref="LOCAL_CONSOLE"/>
    </root>
</springProfile>

<springProfile name="prod">
    <root level="INFO">
        <appender-ref ref="PROD_JSON_CONSOLE"/>
    </root>
</springProfile>
```

로컬에서는 MDC를 한 줄에 붙인 텍스트 로그를 사용하고, 운영에서는 `LogstashEncoder`로 JSON 로그를 출력합니다. 운영용 appender는 `includeMdc=true`로 설정되어 있어 `trace_id`, `event`, `log_category`, `latency_ms` 같은 값이 별도 필드로 나뉘어 내려갑니다.

이 로그는 `promtail-config.yml`에서 다시 한 번 가공됩니다.

```yaml
- labels:
    level:
    event:
    log_category:

- structured_metadata:
    trace_id:
    username:
    client_ip:
    user_agent:
    job_name:
    status:
    latency_ms:
```

이 설정이 중요한 이유는 **모든 필드를 라벨로 올리지 않았기 때문**입니다.

`event`, `log_category`, `level`은 값의 종류가 제한된 저카디널리티(low-cardinality) 필드라서 라벨로 두기 좋습니다. 반면 `trace_id`, `username`, `client_ip`는 값이 사실상 무한히 늘어나는 고카디널리티(high-cardinality) 필드입니다. 이런 값을 라벨로 올리면 Loki 인덱스가 금방 비대해지고 검색 비용도 커집니다.

> **구조화 로그의 핵심은 JSON이라는 형식 자체가 아니라, 어떤 필드를 인덱싱하고 어떤 필드를 문맥으로 남길지 분리하는 데 있습니다.**

Git Ranker는 이 구분을 실제 수집 파이프라인에 반영했습니다. 검색 축은 라벨로, 세부 문맥은 `structured_metadata`로 보내는 방식입니다.

그리고 로그만 쌓아두지도 않았습니다. `docker-compose.yml`에는 `Prometheus`, `Loki`, `Promtail`, `Grafana`가 함께 올라가고, 애플리케이션은 `BusinessMetrics`, `GitHubApiMetrics`로 별도 메트릭도 기록합니다.

이 조합 덕분에 대시보드에서는 다음과 같은 화면이 실제로 구성됩니다.

- `Trace Search - 요청 추적`
- `Error & Warning Logs`
- `Batch Job Logs`
- `Rate Limit Warnings`
- `Error Rate (5xx)`
- `Latency P99`

알림도 이미 붙어 있습니다. `alert-rules.yml` 기준으로 `High Error Rate`, `Service Unavailable`, `High P99 Latency`, `GitHub API Rate Limit Low` 같은 규칙이 정의되어 있습니다.

> **로그가 한 사건의 맥락을 설명한다면, 메트릭은 같은 사건의 빈도와 추세를 보여줍니다.** 한쪽만 있으면 장애는 늦게 발견되거나, 발견해도 설명되지 않습니다.

# 7. 결과와 한계

지금의 Git Ranker에서는 `trace_id` 하나만 있으면 적어도 아래 흐름은 꽤 안정적으로 복원할 수 있습니다.

- 어떤 HTTP 요청이 들어왔는지
- 인증이 붙었는지, 어떤 사용자 문맥이 연결됐는지
- 어떤 도메인 이벤트가 발생했는지
- GitHub API 호출이 얼마나 느렸고 비용이 얼마나 들었는지
- 배치가 어디서 실패했고 재시도 가능한 오류인지
- 최종 응답이 성공인지 실패인지

예전처럼 로그를 줄 세워 놓고 눈으로 읽는 방식과는 결이 다릅니다. 지금은 로그가 **사건 하나를 설명하는 데이터 레코드**가 되고, Grafana와 Loki 위에서는 그것을 조합해 요청, 배치, 외부 API를 같은 기준으로 검색할 수 있습니다.

다만 이 구조가 곧바로 완전한 분산 트레이싱을 뜻하는 것은 아닙니다. 현재의 `trace_id`는 단일 애플리케이션 안에서, 주로 서블릿 요청과 배치 흐름을 기준으로 동작합니다. 앞으로 Git Ranker가 별도 서비스로 분리되거나, 더 깊은 비동기/리액티브 체인까지 세밀하게 추적해야 한다면 `OpenTelemetry` 같은 정식 trace propagation 체계가 필요할 것입니다.

그럼에도 지금 단계에서 중요한 변화는 분명합니다. Git Ranker는 더 이상 "로그를 남기는 서비스"가 아니라, **문제가 생겼을 때 원인을 설명할 수 있는 서비스**에 가까워졌습니다. 운영 관점에서 보면 이 차이가 생각보다 훨씬 큽니다.

# 참고 자료

- [SLF4J MDC 문서](https://www.slf4j.org/api/org/slf4j/MDC.html)
- [logstash-logback-encoder](https://github.com/logfellow/logstash-logback-encoder)
- [Logging guidelines - Atlassian](https://developer.atlassian.com/server/confluence/logging-guidelines/#context)
- [옵저버빌리티: 로그라고해서 다 같은 로그가 아니다(1/2)](https://netmarble.engineering/observability-logging-a)
- [옵저버빌리티: 로그라고해서 다 같은 로그가 아니다(2/2)](https://netmarble.engineering/observability-logging-b/)
