---
header:
  teaser: /assets/images/logo.png
  og_image: "https://imgur.com/izwcCPF.png"

title: "[Git Ranker #7] 로그는 텍스트가 아니라 데이터다 : 관측 가능한 시스템 구축기"
excerpt: "텍스트 파일에 불과했던 로그를 추적 가능하고 구조화된 데이터 자산으로 변화시킨 Git Ranker의 로깅 시스템 고도화 과정"
categories:
  - Git Ranker
tags:
  - Spring Boot
  - Logging
  
toc_label: "로깅 시스템 구축기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-logging-system/
date: 2025-12-18
last_modified_at: 2025-12-18
---
서비스를 정식으로 런칭하기 전, 개발자로서 가장 경계해야 할 것은 아마 **“보이지 않는 시스템”**을 배포하는 것일 겁니다. 기능이 정상적으로 동작하는 것을 넘어, 언제 어디서든 시스템의 내부 상태를 투명하게 들여다볼 수 있는 **‘관측 가능성(Observability)’** 이 확보되지 않는다면, 작은 에러 하나가 서비스 전체의 신뢰도를 무너뜨릴 수 있기 때문입니다.

저는 대규모 트래픽을 처리해 본 경험도, 실제 서비스를 운영해 본 경험도 없는 상태에서 프로젝트를 시작했습니다. 그렇기에 더욱더 **“문제가 발생했을 때 내가 과연 원인을 찾을 수 있을까?”** 라는 막연한 불안감을 가졌고, 이를 해소하기 위해 맨땅에 헤딩하며 견고한 로깅 시스템을 구축해 나갔습니다.

단순한 텍스트 로그를 **추적 가능하고, 구조화된 데이터 자산**으로 변화시키며 겪었던 기술적 시행착오와 해결 과정에 대해 기록하고자 합니다.

# 1. 문제의 인식과 출발점

## 초기 로깅 방식의 한계

프로젝트 초기, 로깅 코드는 아래와 같은 구조로 **단순히 동작 과정을 텍스트로 확인하는 수준**이었습니다.

```java
log.info("회원가입 요청: {}", request.getUsername());
/*
 * 비즈니스 로직 (DB 조회, API 호출 등)...
 */
log.info("회원가입 성공, ID: {}", user.getId());
```

이 방식은 단일 사용자가 접속하는 로컬 환경에서는 문제가 없었지만, **멀티 스레드 기반의 웹서버 환경** 에서는 한계가 드러났습니다.

1. **식별의 한계 :** 동시에 3명의 사용자가 요청을 보내면, 로그 라인들이 서로 뒤섞여 어떤 ‘요청’과 ‘완료’가 하나의 쌍인지 찾기 힘듭니다.

    ```
    2025-12-18 14:23:01 INFO  회원가입 요청: Alice
    2025-12-18 14:23:01 INFO  회원가입 요청: Bob  
    2025-12-18 14:23:02 INFO  GitHub API 호출 시작
    2025-12-18 14:23:02 INFO  회원가입 요청: Charlie
    2025-12-18 14:23:03 INFO  GitHub API 호출 완료
    2025-12-18 14:23:03 INFO  회원가입 성공, ID: 1
    2025-12-18 14:23:04 INFO  GitHub API 호출 완료
    2025-12-18 14:23:04 INFO  회원가입 성공, ID: 2
    2025-12-18 14:23:05 INFO  회원가입 성공, ID: 3
    ```

2. **추적 불가능 :** 에러가 발생했을 때, 해당 에러가 **“어떤 사용자의”, “어떤 입력값으로”, “어떤 경로를 타다가”** 발생했는지 역추적하는 것이 불가능에 가까웠습니다.

저의 목표는 **수백 개의 스레드가 뒤섞여 돌아가는 상황에서도, 특정 요청 하나의 흐름을 온전히 찾아낼 수 있어야 했습니다.**

---

# 2. 핵심 기술 정의

이 문제를 해결하기 위해 도입한 기술은 **Logback**과 [**MDC**](https://www.slf4j.org/api/org/slf4j/MDC.html) 입니다. 단순히 라이브러리를 가져다 쓰는 것을 넘어, 그 동작 원리를 이해해야만 동시성 이슈를 방지할 수 있습니다.

## 2.1 Logback

Java 진영의 표준 로깅 프레임워크이자 Spring Boot의 기본 구현체입니다. Logback의 `Appender` 와 `Encoder` 를 커스텀하여 로그를 단순 파일이 아닌 **JSON 포맷의 데이터 스트림**으로 변환하고자 했습니다.

- **Logger :** 로그 이벤트를 발생시키는 주체 (`log.info()` 를 호출하는 객체)
- **Appender :** 발생된 로그 이벤트를 **‘어디에’** 출력할지 결정
    - `ConsoleAppender` : 콘솔에 출력
    - `FileAppender` : 파일에 저장
    - `RollingFileAppender` : 일정 크기나 시간마다 파일을 분리하여 저장
- **Encoder :** 로그 이벤트를 **‘어떻게’** 변환할지 결정

## 2.2 MDC (Mapped Diagnostic Context)

멀티 스레드 환경에서 로그에 **‘문맥(Context)’** 를 붙이기 위해 고안된 개념입니다.

- 내부적으로 Java의 **`ThreadLocal`** 을 사용합니다. `ThreadLocal` 은 오직 **‘현재 실행 중인 스레드’에서만 접근 가능한 전용 저장소**입니다.
- 요청 진입 시점에 `MDC.put("trace_id", "uuid")` 를 호출하면, 이후 해당 스레드에서 발생하는 모든 로그에 자동으로 `trace_id` 가 함께 기록됩니다.

*쉽게 말해, **“스레드 별로 존재하는 전용 사물함”** 이라고 이해하면 될것 같습니다.*

---

# 3. Spring AOP의 구조적 사각지대 발견

로깅은 대표적인 **횡단 관심사(Cross-cutting Concern)** 입니다. 따라서 코드 중복을 제거하기 위해 **Spring AOP**를 도입하는 것이 가장 합리적인 선택이라고 생각했습니다.

## 3.1 초기 구현

```java
@Slf4j
@Aspect
@Component
public class ControllerLoggingAspect {
    
    @Around("execution(* com.gitranker.api.domain..*Controller.*(..))")
    public Object logApiCall(ProceedingJoinPoint joinPoint) throws Throwable {
        MDC.put("trace_id", UUID.randomUUID().toString());
        
        log.info("[API Start] {}", joinPoint.getSignature().getName());
        
        try {
            return joinPoint.proceed();
        } finally {
            log.info("[API End]");
            MDC.clear();
        }
    }
}
```

`AOP` 적용 후 대부분의 API 로그가 잘 남는 것처럼 보였습니다. 메서드 파라미터와 반환 값, 실행 시간까지 자동으로 기록되니 초기 목표였던 **‘자동화’**는 달성한 것처럼 보였습니다.

## 3.2 사각지대 발견 : 404 에러가 로그에 남지 않는다

그런데 악의적인 공격을 가정하여 **존재하지 않는 URL(`/api/v1/unknown`)**로 요청을 보냈을 때, 예상과 달리 로그 시스템은 조용했습니다. 서버는 분명 404 에러를 반환했는데, 요청 로그는 남지 않았습니다. 

원인은 **Spring의 요청 처리 생명주기**에 있었습니다.

1. `DispatcherServlet` 이 처리할 핸들러를 찾지 못하면(`NoHandlerFoundException`), 컨트롤러 자체가 실행되지 않습니다.
2. AOP는 Spring Bean(Controller)이 실행될 때 동작하는 **프록시 패턴** 기반이므로, 컨트롤러가 실행되지 않으면 AOP 또한 동작하지 않습니다.

AOP 방식은 **“정상적으로 매핑된 요청”** 만 로깅할 수 있다는 구조적 한계가 존재했습니다. 

> 현재 Git Ranker에는 인증/인가 기능이 구현되어 있지 않지만, 만약 보안 필터가 존재한다면 그곳에서 차단된 요청 역시 AOP가 동작하지 않을 것입니다.

---

# 4. Servlet Filter를 활용한 HTTP 요청 추적

AOP의 한계를 극복하고 **“서버에 도달하는 모든 요청”**을 추적하기 위해, 저는 Spring Context의 바깥인 **Servlet Filter**로 책임을 이동시켰습니다.

## 4.1 왜 Interceptor가 아닌 Filter인가 ?

![image.png](https://imgur.com/izwcCPF.png)

Spring의 `HandlerInterceptor` 역시 고려 대상이었으나, 이 또한 `DispatcherServlet` 내부에서 동작하므로 404 에러나 보안 필터에서 차단된 요청을 잡지 못합니다.

반면 **Filter**는 서블릿 컨테이너 레벨에서 동작하여 **가장 먼저 요청을 맞이하고, 가장 마지막에 응답을 보낼 수 있는 위치**이기 때문에 Filter로 책임을 이동시키기로 결정했습니다.

## 4.2 `LoggingFilter` 구현과 Thread-Safe한 Trace ID 관리

`LoggingFilter` 를 구현하여 모든 요청에 고유한 `Trace ID` 를 발급하고, MDC에 주입했습니다.

![image.png](https://imgur.com/4V0uzR4.png)

`LoggingFilter.java`

```java
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE) // 가장 먼저 실행되어야 사각지대가 사라짐
public class LoggingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) ... {
        // 1. 요청 진입: Trace ID 생성 및 MDC 주입
        MDC.put("trace_id", UUID.randomUUID().toString().substring(0, 8));
        long start = System.currentTimeMillis();

        try {
            log.info("[HTTP Request] {} {}", httpRequest.getMethod(), httpRequest.getRequestURI());
            // 2. 비즈니스 로직 수행
            chain.doFilter(request, response);
        } finally {
            // 3. 요청 종료: Latency 계산
            long latency = System.currentTimeMillis() - start;
            MDC.put("latency_ms", String.valueOf(latency));
            
            // Thread Pool 환경에서의 Context 오염 방지
            MDC.clear();
        }
    }
}
```

### 왜 `MDC.clear()` 가 필수인가 ?

**Tomcat과 같은 WAS는 Thread Pool을 사용**합니다. 즉, A 사용자의 요청을 처리한 스레드가 죽지 않고, 바로 B 사용자의 요청을 처리하러 갑니다.

만약 MDC를 비워주지(`clear`) 않으면, **A 사용자의 데이터가 스레드에 남아있다가 B 사용자의 로그에 찍히는 문제**가 발생합니다.

---

# 5. 배치 작업과 외부(GitHub) API

HTTP 요청에 대한 추적성은 확보되었지만, Git Ranker에는 HTTP를 타지 않는 두 가지 중요한 실행 흐름이 더 있었습니다.

## 5.1 배치(Batch) 작업 : 스케줄러 실행 시점의 수동 주입

Spring Batch는 백그라운드 스레드에서 실행되므로 Filter가 동작하지 않아 MDC가 비어있습니다. 저는 스케줄러가 Job을 실행하는 시점에 **수동으로 컨텍스트를 주입**하는 전략을 선택했습니다.

`BatchScheduler.java`

```java
@Scheduled(cron = "0 0 0 * * *", zone = "UTC")
public void runDailyScoreRecalculationJob() {
    // 마치 HTTP 요청이 들어온 것처럼, 배치 작업의 맥락(Context)을 강제로 주입
    MDC.put("trace_id", UUID.randomUUID().toString().substring(0, 8));
    
    try {
        // ... Job 실행 ...
    } finally {
        // 여기서도 Thread Pool Context 오염 방지
        MDC.clear();
    }
}
```

이로써 수백 수천 건의 데이터가 처리되는 배치 작업 중 에러가 발생해도, 해당 작업의 `Trace ID` 만 검색하면 전체 흐름을 파악할 수 있게 되었습니다.

## 5.2 GitHub API : AOP를 활용한 외부 호출 관측

컨트롤러 로깅에는 실패했던 AOP가, **특정 객체의 메서드(`GitHubGraphQLClient`) 호출을 감싸는 용도**로는 완벽한 도구였습니다. 특히 외부 API는 **[비용(Cost)](https://docs.github.com/en/graphql/overview/resource-limitations)과 지연 시간(Latency) 추적**이 핵심입니다.

`GitHubApiLoggingAspect.java`

```java
@Around("execution(* ...GitHubGraphQLClient.*(..))")
public Object logGithubApiCall(ProceedingJoinPoint joinPoint) {
    long start = System.currentTimeMillis();
    try {
        Object result = joinPoint.proceed();
        // GitHub API 응답 헤더에서 Cost를 추출해 MDC에 기록
        String cost = MDC.get("cost"); 
        log.info("... Cost: {}", cost); 
        return result;
    } catch (Exception e) {
        log.error("... Reason: {}", e.getMessage());
        throw e;
    }
}
```

---

# 6. 로그 품질 향상

`Trace ID` 연결로 흐름은 보였지만, 로그의 내용 자체가 부실하다면 그것은 단순한 스토리지 낭비일 뿐입니다. 저는 **“운영 환경에서 로그는 읽는 텍스트가 아니라, 분석하는 데이터다”** 라는 원칙하에 로그 품질을 세 가지 측면에서 개선했습니다.

## 6.1 로그 레벨 표준화

모든 에러를 `ERROR` 레벨로 기록하면, 진짜 중요한 장애가 발생했을 때 관리자는 알람에 무감각해지게 될 것입니다. 저는 전역 예외 처리 단계에서 예외 타입에 따라 로그 레벨을 엄격히 분리했습니다.

- **`INFO` :** 정상적인 비즈니스 이벤트 (사용자 등록, 점수 갱신, 랭킹 재계산 …)
- **`WARN` :** 시스템 장애는 아니지만 주의가 필요한 상황 (GitHub API 재시도, 네트워크 지연 …)
- **`ERROR` :** 즉각 조치가 필요한 시스템 장애 (DB 커넥션 실패, 배치 작업 중단 …)

## 6.2 중복 로그 제거

```
[trace_id=abc123] [HTTP Request] POST /api/v1/users
[trace_id=abc123] [Controller] registerUser 메서드 시작
[trace_id=abc123] [Service] UserService.registerUser 시작
[trace_id=abc123] [Domain Event] 신규 사용자 등록 - Alice
[trace_id=abc123] [Service] UserService.registerUser 종료
[trace_id=abc123] [Controller] registerUser 메서드 종료
[trace_id=abc123] [HTTP Response] 201 Created
```

초기에는 “컨트롤러 시작”, “서비스 진입” “서비스 종료” 등 모든 메서드에 로그를 남겼습니다. 하지만 이는 로그 파일의 크기만 키울 뿐 실질적인 가치는 없었습니다.

`LoggingFilter` 가 이미 **가장 바깥쪽에서 요청의 시작과 끝**을 기록하고 있기 때문에, 비즈니스 로직 내부에서는 흐름 추적을 위한 기계적인 로그를 모두 제거하고, **“회원가입 완료”, “점수 갱신”** 과 같이 **상태가 변하는 순간**만 남겨 로그의 밀도를 높였습니다.

## 6.3 운영 환경을 위한 포맷 전략 : Text vs JSON

마지막으로, 환경(Profile)에 따라 로그의 형태를 다르게 가져가는 **이원화 전략**을 채택했습니다.

### **Text (개발/로컬 환경)**

```
2025-12-18 14:23:01.123 INFO  [http-nio-8080-exec-1] c.g.a.d.u.UserService - [Domain Event] 신규 사용자 등록 - 사용자: Alice, 점수: 1250, 티어: GOLD --> [trace_id=a1b2c3d4, username=Alice]
```

로컬 환경에서는 개발자가 콘솔에서 눈으로 읽기 편한 텍스트 형태를 유지했습니다.

### **JSON (운영 환경)**

```json
{
  "@timestamp": "2025-12-18T14:23:01.123Z",
  "level": "INFO",
  "message": "[Domain Event] 신규 사용자 등록",
  "trace_id": "a1b2c3d4",
  "username": "Alice",
  "total_score": 1250,
  "tier": "GOLD",
  "latency_ms": 1230,
  "client_ip": "203.0.113.45"
}
```

운영 환경에서는 `Loki` 나 `ELK` 같은 시스템이 파싱하기 가장 쉬운 **JSON 포맷**을 채택했습니다. [`LogstashEncoder`](https://github.com/logfellow/logstash-logback-encoder) 설정을 통해 **MDC에 담긴 메타데이터(`trace_id`, `latency`, `cost` …) 는 별도의 JSON 필드**로 자동 분리하고, 비즈니스 데이터는 `message` 필드에 담아 출력합니다.

`logback-spring.xml`

```xml
<appender name="PROD_JSON_CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <includeMdcKeyName>trace_id</includeMdcKeyName>
        <includeMdcKeyName>latency_ms</includeMdcKeyName>
        <includeMdcKeyName>github_api_cost</includeMdcKeyName>
        ...
    </encoder>
</appender>
```

---

# 7. 마무리

로깅 시스템 고도화 작업을 통해 `Trace ID` 하나만 있으면 **[진입(Filter) → 비즈니스 로직 → 외부 API → DB → 응답]** 에 이르는 전체 라이프사이클을 추적할 수 있게 되었습니다. 또한 기존 방식으로는 보이지 않던 404 에러, 배치 작업 실패, 외부 API 지연 등을 모두 수집하여 **사각지대를 제거**했습니다.

현재는 운영 환경의 로그를 단순히 JSON 데이터로 출력하는 단계까지 완료되었습니다. 앞으로는 이 데이터를 시각화하는 모니터링 대시보드를 구축하고, 장애 발생 시 즉시 알림을 받을 수 있는 Alerting 시스템을 연결하여 보다 안전하고 신뢰할 수 있는 서비스로 발전시켜 나갈 계획입니다.

---

# 참고 자료

[옵저버빌리티: 로그라고해서 다 같은 로그가 아니다(1/2) - 넷마블 기술 블로그](https://netmarble.engineering/observability-logging-a)

[옵저버빌리티: 로그라고해서 다 같은 로그가 아니다(2/2) - 넷마블 기술 블로그](https://netmarble.engineering/observability-logging-b/)

[로그는 대체 왜, 언제, 어디서, 무엇을 남겨야 하는가?](https://jaeseo0519.tistory.com/449)

[Logging guidelines](https://developer.atlassian.com/server/confluence/logging-guidelines/#context)

[[Spring] 필터(Filter)와 인터셉터(Interceptor)의 개념 및 차이](https://dev-coco.tistory.com/173)