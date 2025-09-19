---
header:
   teaser: /assets/images/logo.png

title: "Redis Stream으로 개선한 선착순 이벤트 시스템 (2편)"
excerpt: "Spring Boot + MySQL 구조의 성능 병목을 Redis Stream 비동기 처리로 해결하여 1,666 RPS 달성과 66% 성능 향상을 이룬 과정을 다룹니다."
categories:
  - Backend
tags:
  - Redis Stream
  - Spring Boot
  - 비동기 처리
  - 메시징 시스템
  - 선착순 이벤트
  
toc_label: "Redis Stream 선착순 이벤트 시스템 구축기"
toc: true
toc_sticky: true

date: 2025-03-23
last_modified_at: 2025-03-23 
---
1편에서는 Spring Boot와 MySQL만으로 선착순 이벤트 시스템을 구현하고 그 한계점을 분석했습니다.

이번 글에서는 Redis Stream을 활용하여 시스템을 어떻게 개선했는지 그리고 그 결과로 성능이 어떻게 향상 되었는지 공유하고자 합니다.

# Spring + MySQL 구조에서의 문제점

단일 서버 환경의 Spring Boot + MySQL 구조로 시스템을 구현했을 때 심각한 병목 현상들이 발견되었습니다.

1. **DB 커넥션 풀 고갈**
    - 50개의 제한된 커넥션에 400개 스레드가 경쟁하면서 커넥션 획득 시간이 실제 사용 시간보다 4.5배나 길어졌습니다.
    - 커넥션 획득에 평균 180ms가 소요된 반면, 실제 쿼리 실행은 40ms에 불과했습니다.
    - 전체 DB 작업 시간의 82%가 단순히 커넥션을 기다리는 데 낭비되었음을 의미합니다.
2. **스레드 풀 고갈**
    - Tomcat의 기본 스레드 풀이 완전히 소진되었습니다.
    - 대부분의 스레드가 DB 커넥션을 기다리거나 락 획득을 위해 블로킹된 상태로 시간을 소비했습니다.
3. **비관적 락(Pessimistic Lock)으로 인한 직렬화**
    - 중복 응모 방지를 위해 적용한 `@Lock(LockModeType.PESSIMISTIC_WRITE)` 가 동시성을 제한했습니다.
    - 해당 어노테이션은 SQL 쿼리를 `SELECT * FROM Apply WHERE phoneNumber = ? FOR UPDATE` 로 변환시켰고, 이로 인해 InnoDB의 Next-Key Lock이 발동되었습니다.
    - Next-Key Lock은 트랜잭션이 완료될 때까지 유지되며, 다른 트랜잭션이 동일한 레코드에 접근하는 것을 차단합니다.
4. **요청 처리 직렬화**
    - 결과적으로 동시에 들어오는 여러 요청이 병렬로 처리되지 못하고 하나씩 순차적으로 처리됨으로써 1,666 RPS 목표 처리량을 정상적으로 수행하지 못했습니다.

시스템의 핵심적인 병목은 **데이터베이스**였습니다. MySQL의 락 메커니즘은 데이터 정확성은 보장했지만 고부하 환경에서 심각한 성능 문제를 발생시켰습니다.

# Redis 도입을 결정한 이유

1. **메모리 기반 처리**
    - Redis는 인메모리 데이터 저장소로서 디스크 기반의 MySQL보다 훨씬 빠른 처리 속도를 제공합니다.
2. **비동기 처리를 통한 확장성 확보**
    - 요청을 즉시 DB에 반영하지 않고 Redis에 저장한 후, 별도 프로세스에서 비동기적으로 처리할 수 있습니다.
    - 해당 접근 방식으로 클라이언트 응답 시간과 DB 작업을 완전히 분리할 수 있습니다.
3. **원자적 연산을 통한 데이터 일관성 보장**
    - Redis는 단일 스레드 모델로 동작하면서도 여러 명령어를 원자적으로 처리할 수 있는 기능을 제공합니다.
    - 이를 통해 동시성 제어를 위한 비관적 락 없이도 데이터 일관성을 보장할 수 있습니다.
4. **부하 분산**
    - 데이터베이스에 집중되었던 부하를 Redis와 데이터베이스로 분산시켜 시스템 전체의 안정성을 높일 수 있습니다.
    - Redis는 클라이언트 요청에 대한 초기 유형 검증을 담당하고, MySQL은 영구 저장소 역할에 집중합니다.

이러한 이유들로 **Redis를 활용한 비동기 처리 방식**이 가장 적합하다고 판단했습니다.

## Redis 메시징 솔루션 비교

Redis에서 메시징을 구현할 수 있는 방법은 여러 가지가 있었습니다.

1. **List 자료구조 (LPUSH/RPOP)**
    - **장점**: 구현이 단순하고 직관적이며 기본적인 FIFO(First In, First Out) 큐 구현에 적합합니다.
    - **단점**: 메시지 처리 실패 시 재처리 메커니즘이 없어 메시지 유실 가능성이 있습니다. 또한 여러 컨슈머가 협력하여 메시지를 처리하는 컨슈머 그룹 개념을 지원하지 않습니다.
2. **Pub/Sub 방식**
    - **장점**: 실시간 메시지 전달에 최적화되어 있으며 구현이 간단합니다.
    - **단점**: 메시지가 구독자에게 즉시 전달되지 않으면 영구적으로 유실됩니다. 메시지 전달 보장이 없고, 특정 시점부터 메시지를 다시 처리하는 기능이 없어 장애 복구에 취약합니다.
3. **Sorted Set을 활용한 우선순위 큐**
    - **장점**: 메시지에 우선순위를 부여할 수 있습니다.
    - **단점**: 구현이 복잡하고 컨슈머 그룹 기능이 없어 분산 처리 시스템 구축이 어렵습니다. 또한 메시지 확인(ACK) 메커니즘을 직접 구현해야 합니다.
4. **Redis Stream**
    - **장점**: 로그 기반 데이터 구조로 설계되어 메시지 지속성, 컨슈머 그룹, 장애 복구 등 메시징 시스템에 필요한 기능을 제공합니다.
    - **단점**: Redis 5.0 이상에서만 사용 가능하며 다른 방식보다 상대적으로 복잡한 API를 가지고 있습니다.

## Redis Stream을 선택한 이유

1. **메시지 지속성 보장**
    - Stream에 저장된 메시지는 명시적으로 삭제하지 않는 한 Redis 서버에 계속 유지됩니다.
    - 이는 시스템 장애나 재시작 시에도 메시지 유실 없이 처리를 재개할 수 있게 해줍니다.
2. **컨슈머 그룹 모델**
    - 여러 컨슈머가 협력하여 메시지를 병렬로 처리할 수 있는 컨슈머 그룹 기능을 제공합니다.
    - 각 컨슈머가 어떤 메시지를 처리 중인지 상태를 자동으로 추적하므로 컨슈머 장애 시에도 다른 컨슈머가 작업을 이어받을 수 있습니다.
    - `XREADGROUP` 명령어를 통해 각 컨슈머가 균등하게 작업을 분배받을 수 있습니다.
3. **정확히 한 번 처리 구현 용이성**
    - 각 메시지는 타임스탬프와 시퀀스 번호로 구성된 고유한 ID를 가집니다 (예: 1642608413947-0).
    - 메시지 확인(ACK) 메커니즘을 통해 처리 완료된 메시지를 명시적으로 표시할 수 있어 중복 처리를 방지하고 정확히 한 번 처리를 구현하기 용이합니다.
    - `XACK` 명령어로 처리 완료된 메시지를 명확히 기록할 수 있습니다.
4. **다중 소비자 패턴 지원**
    - 동일한 메시지 스트림에 여러 소비자 그룹을 연결하여 다양한 목적으로 메시지를 독립적으로 처리할 수 있습니다.
    - 예를 들어, 하나의 응모 이벤트 데이터를 DB 저장용 소비자 그룹과 통계 집계용 소비자 그룹이 각각 처리할 수 있습니다.
5. **장애 복구 메커니즘**
    - `XPENDING` 명령어를 통해 처리 중인 메시지 목록을 조회할 수 있고, `XCLAIM` 명령어로 장시간 처리되지 않은 메시지를 다른 컨슈머에게 재할당할 수 있습니다.

선착순 이벤트 시스템에서는 무엇보다 메시지 유실 없이 정확히 100명만을 선발하는 것이 중요했기 때문에 메시지 지속성과 정확한 처리를 보장하는 Redis Stream이 가장 적합하다고 판단했습니다.

(추가적으로 그냥 Redis Pub/Sub이나 List 자료형을 사용하지 않는 이유는 DB에 저장된 applyTime이 오름차순으로 들어가지 않기 때문에 서버가 처리한 그 순서대로 DB에 저장할 수 있도록 하기 위해 Redis Stream을 적용하기로 생각했다.)

# Redis Stream을 활용한 선착순 이벤트 시스템

Redis Stream을 선착순 이벤트 시스템에 적용해보겠습니다.

## 1. 메시지 구성 (Entry)

사용자가 이벤트에 응모하면 아래와 같은 정보를 포함한 메시지가 생성됩니다.

```
1742648840457-0 name "백효석" phoneNumber "010-1234-5678" applyTime "1742648840457"
```

- `1742648840457-0` 은 메시지 ID (타임스탬프-시퀀스)
- `name`, `phoneNumber`, `applyTime` 은 응모 정보를 담고 있는 필드들

## 2. 스트림 (Stream)

모든 응모 정보는 `apply:stream` 이라는 스트림에 시간순으로 저장됩니다.

```
1742648840457-0 name "백효석" phone "010-1234-5678" applyTime "1742648840457"
1742648840467-0 name "이수진" phone "010-2345-6789" applyTime "1742648840467"
1742648840469-0 name "박현우" phone "010-3456-7890" applyTime "1742648840469"
...
```

이벤트 시작 직후의 스트림 상태는 위와 같이 들어갈 것입니다.

## 3. 컨슈머 그룹과 컨슈머

이 응모 데이터를 처리하기 위해 `apply-processors` 라는 컨슈머 그룹을 생성하고 여러 컨슈머 인스턴스를 실행합니다.

```
XGROUP CREATE apply:stream apply-processors 0
```

- `consumer1` : 데이터베이스에 응모 정보 저장 담당
- `consumer2` : 백업용 컨슈머로 장애 발생 시 대체 역할 **(예시로 해당 컨슈머는 생성하지 않음)**
- `consumer3` : 실시간 통계 집계 담당 **(예시로 해당 컨슈머는 생성하지 않음)**

# Redis Stream 구현

## 1. Redis 설정 및 Stream 초기화

먼저 Redis 연결 및 Stream을 초기화하는 설정 코드를 작성했습니다.

```java
@Configuration
@EnableScheduling
@RequiredArgsConstructor
public class StreamConfig {

    private static final String APPLY_STREAM = "apply:stream";
    private static final String CONSUMER_GROUP = "apply-processors";
    private static final String CONSUMER_NAME = "apply-db-saver";

    private final ApplyStreamListener applyStreamListener;

    @PostConstruct
    public void init() {
        try {
            // Stream이 없으면 생성
            createStreamIfNotExists();
            
            // Consumer 그룹이 없으면 생성
            createConsumerGroupIfNotExists();
        } catch (Exception e) {
            log.error(e.getMessage());
        }
    }

    @Bean
    public StreamMessageListenerContainer<String, MapRecord<String, String, String>> streamMessageListenerContainer(
            RedisConnectionFactory redisConnectionFactory) {

        StreamMessageListenerContainer.StreamMessageListenerContainerOptions<String, MapRecord<String, String, String>> options =
                StreamMessageListenerContainer.StreamMessageListenerContainerOptions
                        .builder()
                        .pollTimeout(Duration.ofMillis(100))
                        .build();

        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container =
                StreamMessageListenerContainer.create(redisConnectionFactory, options);

        // 컨슈머 그룹으로 리스닝 설정
        container.receiveAutoAck(
                Consumer.from(CONSUMER_GROUP, CONSUMER_NAME),
                StreamOffset.create(APPLY_STREAM, ReadOffset.lastConsumed()),
                applyStreamListener
        );

        container.start();
        log.info("Started Stream message listener container");

        return container;
    }
    
    private void createStreamIfNotExists() {
	      Boolean isExists = redisTemplate.hasKey(APPLY_STREAM);
        if (Boolean.FALSE.equals(isExists)) {
            Map<String, String> initialMessage = Map.of("init", "true");
            redisTemplate.opsForStream().add(APPLY_STREAM, initialMessage);
            log.info("Created Stream : {}", APPLY_STREAM);
        }
    }

    private void createConsumerGroupIfNotExists() {
        try {
            redisTemplate.opsForStream().createGroup(APPLY_STREAM, CONSUMER_GROUP);
            log.info("Created Consumer Group : {}", CONSUMER_GROUP);
        } catch (Exception e) {
            log.info("Consumer Group Creation Failed (Might already exist)");
        }
    }
}
```

## 2. 메시지 리스너 구현

Redis Stream에서 메시지를 소비하고 데이터베이스에 저장하는 리스너를 구현했습니다.

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class ApplyStreamListener implements StreamListener<String, MapRecord<String, String, String>> {

    private final static String APPLY_STREAM = "apply:stream";
    private final static String CONSUMER_GROUP = "apply-processors";
    private final ApplyRepository applyRepository;
    private final StringRedisTemplate redisTemplate;

    @Override
    @Transactional
    public void onMessage(MapRecord<String, String, String> message) {
        try {
		        // MapRecord에서 필요한 데이터 추출
            Map<String, String> values = message.getValue();

            String name = values.get("name");
            String phoneNumber = values.get("phoneNumber");
            Long applyTime = Long.parseLong(values.get("applyTime"));

            Apply apply = Apply.builder()
                    .name(name)
                    .phoneNumber(phoneNumber)
                    .applyTime(applyTime)
                    .build();

            applyRepository.save(apply);

            // 메시지 처리 완료 확인(ACK)
            RecordId messageId = message.getId();
            // 메시지 처리 완료 후 명시적으로 확인 처리하여 재처리 방지
            redisTemplate.opsForStream().acknowledge(APPLY_STREAM, CONSUMER_GROUP, messageId.getValue());
            
            log.info("Processed and acknowledged message: {}", messageId.getValue());
        } catch (Exception e) {
            log.error("Error processing message: {}", e.getMessage());
        }
    }
}
```

## 3. 응모 서비스 구현

긱존의 직접 DB로 접근하는 방식에서 Redis Stream을 활용한 비동기 처리 방식으로 변경했습니다.

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class ApplyService {

    private static final String APPLY_COUNT_KEY = "apply:count";
    private static final String APPLY_PHONE_PREFIX = "apply:phone:";
    private static final String APPLY_STREAM = "apply:stream";
    private static final int MAX_APPLICANTS = 100;
    
    private final RedisTemplate<String, String> redisTemplate;
    private final StringRedisTemplate stringRedisTemplate;

    public String applyWithStream(ApplyRequestDto requestDto) {
        String phoneNumber = requestDto.getPhoneNumber();
        String phoneKey = APPLY_PHONE_PREFIX + phoneNumber;

        // 1. Redis를 사용한 중복 응모 체크
        Boolean isApplied = redisTemplate.opsForValue().setIfAbsent(phoneKey, "applied");
        if (Boolean.FALSE.equals(isApplied)) {
            throw new ApiException(ErrorCode.DUPLICATE_APPLY);
        }

        // 2. Redis를 사용한 응모자 수 증가 및 제한 확인
        Long currentApplicants = redisTemplate.opsForValue().increment(APPLY_COUNT_KEY);
        if (currentApplicants > MAX_APPLICANTS) {
            // 제한 초과 시 등록했던 전화번호 키 삭제
            redisTemplate.delete(phoneKey);
            throw new ApiException(ErrorCode.APPLY_LIMIT_EXCEEDED);
        }

        // 3. 서버 시간 측정
        long currentServerTime = System.currentTimeMillis();

        // 4. Redis Stream에 응모 정보 저장
        Map<String, String> applyInfo = new HashMap<>();
        applyInfo.put("name", requestDto.getName());
        applyInfo.put("phoneNumber", phoneNumber);
        applyInfo.put("applyTime", String.valueOf(currentServerTime));

        // Stream에 데이터 추가
        stringRedisTemplate.opsForStream().add(APPLY_STREAM, applyInfo);
        
        return "SUCCESS";
    }
}
```

# Redis Stream 적용 프로세스 흐름

Redis Stream을 적용한 선착순 이벤트 시스템의 전체 프로세스 흐름은 크게 **클라이언트 요청 처리**와 **비동기 메시지 처리** 두 부분으로 나눌 수 있습니다.

![redis-stream-architecture-revised.svg](https://imgur.com/vz4o0WK.png)

## 클라이언트 요청 처리 과정

1. **중복 응모 체크 (Redis)**
    - `phoneNumber` 를 key로 사용해 Redis에 값을 저장(`SETIFABSENT`)
    - 이미 key가 존재하면 중복 응모로 판단하고 예외 발생
    - 이 작업은 원자적으로 수행되어 동시성 문제 없이 중복을 정확하게 체크할 수 있습니다.
2. **응모자 수 제한 체크 (Redis)**
    - `apply:count` key를 원자적으로 증가시켜(`INCREMENT`) 현재 응모자 수 계산
    - 반환된 값이 100을 초과하면 선착순 마감으로 간주하고 예외 발생
    - 예외 발생 시 이전 단계에서 등록한 전화번호 key를 삭제하여 데이터 일관성 유지
3. **메시지 생성 및 스트림 추가 (Redis)**
    - 응모 시간을 서버 시간 기준으로 기록
    - 응모 정보(이름, 전화번호, 응모시간)를 Map으로 구성
    - Redis Stream에 메시지 추가(`XADD`)
    - 클라이언트에게 성공 응답 반환 **(DB 저장 완료를 기다리지 않음)**

## 비동기 메시지 처리 과정

1. **메시지 리스닝 (Redis → 애플리케이션)**
    - Spring의 `StreamMessageListenerContainer` 가 Redis Stream으로부터 새 메시지를 지속적으로 폴링
    - 컨슈머 그룹(`apply-processors`)과 컨슈머 이름(`apply-db-saver`)으로 메시지 수신

        ```java
        // 컨슈머 그룹으로 리스닝 설정
        container.receiveAutoAck(
            Consumer.from(CONSUMER_GROUP, CONSUMER_NAME),
            StreamOffset.create(APPLY_STREAM, ReadOffset.lastConsumed()),
            applyStreamListener
        );
        ```

2. **메시지 처리 (애플리케이션 → DB)**
    - 수신된 메시지로부터 응모 정보(이름, 전화번호, 응모시간) 추출
    - `Apply` 엔티티 생성 및 데이터베이스에 저장
    - `@Transactional` 어노테이션을 통해 트랜잭션 내에서 처리됨으로써 DB 일관성 보장
3. **메시지 확인 처리 (애플리케이션 → Redis)**
    - DB 저장이 완료되면 Redis Stream에 메시지가 처리되었음을 확인(ACK)
    - 해당 메시지는 “처리됨” 상태가 되어 다시 처리되지 않음
    - 메시지 ID로 응모 시간 순서가 정확히 보존되어 선착순 정확성 유지
4. **장애 대응**
    - 처리 중 예외 발생 시 메시지는 확인되지 않은 상태로 남아 있음
    - 서버 재시작 후 미처리된 메시지를 다시 처리

중요한 포인트는 **클라이언트 요청 처리**와 **DB 저장**이 완전히 분리되어 비동기적으로 동작한다는 것입니다.

이를 통해 클라이언트는 DB 저장 여부와 상관없이 빠르게 응답을 받을 수 있고, 서버는 부하를 효과적으로 분산시킬 수 있습니다.

# 성능 테스트 및 모니터링 결과

새로운 아키텍처의 성능을 검증하기 위해 이전과 동일한 환경에서 테스트를 진행했습니다.

- **테스트 도구 :** K6
- **모니터링 :** Prometheus, Grafana
- **테스트 시나리오 :** 초당 **1,666건**의 요청을 10분간 전송

## JVM 메모리 및 GC 분석

![스크린샷 2025-03-22 오전 12.34.08.png](https://imgur.com/ZINn961.png)

![스크린샷 2025-03-22 오전 12.34.26.png](https://imgur.com/BOpqyjg.png)

**기존 시스템 (1,000 RPS)**

- Eden Space 사용량이 10MB~40MB 사이로 불안정하게 변동
- 평균 초당 0.458회의 Minor GC 발생
- Minor GC당 평균 4.57ms, 최대 11.6ms의 Stop-the-World(STW) 시간

**개선된 시스템 (1,666 RPS)**

- Eden Space 사용량이 25MB~110MB 사이로 변동폭은 커졌으나 효율적으로 관리됨
- 평균 초당 1.733회의 Minor GC 발생
- Minor GC당 평균 2.89ms, 최대 6.2ms로 약 47% 개선

Redis Stream 도입으로 객체 생성 패턴이 최적화되었습니다. 처리량이 1,000 RPS 대비 66% 증가했음에도 GC 효율성이 향상되었습니다. JPA 영속성 컨텍스트 관련 객체들의 생성이 감소했고, 메시지 처리가 분산되어 GC 부담이 줄었습니다. 특히 최대 STW 시간이 47% 감소하여 시스템 응답성이 개선되었습니다.

비동기 처리 방식은 DB 연결에 필요한 임시 객체 생성을 크게 줄이는 효과를 가져왔으며 전체적인 메모리 사용 패턴을 안정적으로 만들었습니다.

## Thread Pool 분석

![스크린샷 2025-03-22 오전 12.34.51.png](https://imgur.com/nj044tz.png)

![스크린샷 2025-03-22 오전 12.34.18.png](https://imgur.com/RcvPPXz.png)

![스크린샷 2025-03-22 오전 12.35.01.png](https://imgur.com/9cQ3INS.png)

**기존 시스템 (1,000 RPS)**

- 테스트 중 스레드 풀이 지속적으로 포화 상태 (사용률 96~99%)
- 평균 385개 스레드 사용 (Tomcat 기본 최대값 400개 근접)
- 요청 처리 시간이 최대 3.44ms로 증가

**개선된 시스템 (1,666 RPS)**

- 현재 스레드 수: 평균 334개, 최대 400개
- Daemon 스레드 360개, Live 스레드 366개

Redis Stream을 도입함으로써 스레드 활용도가 향상되었습니다. 기존 시스템에서는 대부분의 스레드가 DB 작업 대기로 블로킹 상태에 있었지만, 개선된 시스템에서는 스레드들이 실제 작업 처리에 효율적으로 활용되고 있습니다.

특히 Redis의 비동기 메시지 처리 방식으로 인해 스레드가 DB 커넥션을 기다리는 시간이 최소화되어 동일한 스레드 풀로 66% 더 많은 요청을 처리할 수 있게 되었습니다.

## DB Connection Pool 분석

![스크린샷 2025-03-22 오전 12.34.33.png](https://imgur.com/m6Pz809.png)

![스크린샷 2025-03-22 오전 12.34.44.png](https://imgur.com/TKZcO1H.png)

**기존 시스템 (1,000 RPS)**

- 커넥션 풀(50개)이 지속적으로 100% 사용
- 대기 중인 요청이 최대 34개까지 증가
- 커넥션 획득 시간이 평균 160~180ms로 증가
- 커넥션 사용 시간이 약 40ms

**개선된 시스템 (1,666 RPS)**

- 커넥션 수: 50개 유지, 49개가 idle 상태
- 커넥션 획득 시간이 0.8ms~1.2ms 수준 유지 (99% 개선)
- 커넥션 사용 시간이 약 1.6ms로 안정적 (96% 개선)

HikariCP 통계를 보면 환성 커넥션이 평균 1개로 기존 대비 현저히 감소했습니다. 이는 Redis Stream을 통한 비동기 처리 방식으로 DB 작업이 필요한 경우에만 선별적으로 커넥션을 사용했기 때문입니다.

특히 커넥션 획득 시간이 180ms에서 1.2ms로 99% 감소하고 커넥션 사용 시간도 40ms에서 1.6ms로 96% 단축됐습니다.

## CPU 사용률 분석

![스크린샷 2025-03-22 오전 12.33.50.png](https://imgur.com/Z9lfzkQ.png)

![스크린샷 2025-03-22 오전 12.33.55.png](https://imgur.com/5uLFNuv.png)

**기존 시스템 (1,000 RPS)**

- CPU 사용률이 낮음에도 성능 저하 (I/O 대기 상태)
- 대부분의 CPU 시간이 DB 커넥션 대기에 낭비

**개선된 시스템 (1,666 RPS)**

- 시스템 CPU 사용률: 평균 42.0%, 최대 52.6%
- 프로세스 CPU 사용률: 평균 11.7%, 최대 13.4%
- CPU 사용 패턴이 안정적이며 효율적

CPU 활용도 측면에서도 큰 개선이 이루어졌습니다. 기존 시스템에서는 CPU 사용률이 낮음에도 성능이 전형되는 전형적인 I/O 병목 현상을 보였습니다. 반면 Redis Stream을 도입한 후에는 CPU 사용률이 적절한 수준으로 유지되면서 실제 작업 처리에 더 많은 리소스가 할당되었습니다.

프로세스 CPU 사용률 11.7%는 애플리케이션이 효율적으로 CPU를 활용하고 있음을 보여주며 I/O bound 상태에서 균형 잡인 상태로 전환되었음을 나타내는 지표입니다.

# 결과

Redis Stream을 활용한 비동기 처리 방식으로 전환한 결과 동일한 하드웨어 환경에서 처리량이 66% 증가했음에도 시스템의 안정성과 확장성이 크게 향상되었습니다. 특히 DB 커넥션 관리와 스레드 활용 효율성이 극적으로 개선되어 목표했던 1,666 RPS의 이벤트 처리를 안정적으로 달성할 수 있게 되었습니다.

DB 중심의 동기식 처리에서 Redis Stream을 활용한 비동기 처리로 전환함으로써 시스템 병목을 해소하고 자원 활용 효율성을 크게 높일 수 있었습니다.