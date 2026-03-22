---
header:
   teaser: /assets/images/logo.png
   og_image: "https://i.imgur.com/vNDQ3RB.png"

title: "성장하는 서비스를 위한 DDD 기반 멀티 모듈 전환기"
excerpt: "모놀리식 아키텍처의 한계를 극복하기 위해 도메인 주도 설계(DDD)와 포트-어댑터 패턴을 적용한 멀티 모듈 아키텍처로 전환한 과정입니다. 장애 격리와 도메인 경계 명확화를 통해 확장성 있는 시스템을 구축했습니다."
categories:
  - Architecture
tags:
  - DDD
  - 멀티 모듈
  - 헥사고날 아키텍처
  - 포트-어댑터 패턴
  - 도메인 모델
  - 시스템 아키텍처
  
toc_label: "DDD 기반 멀티 모듈 전환기"
toc: true
toc_sticky: true

date: 2025-03-07
last_modified_at: 2025-03-07 
---
# 변화의 필요성

댕글 서비스를 개발하면서 초기에는 빠른 기능 구현과 배포를 위해 일반적인 Spring Boot 기반의 **모놀리식 아키텍처**로 시작했습니다.

```
com.daengle
├── controller
│   ├── UserController.java
│   ├── GroomerController.java
│   ├── VetController.java
│   ├── PaymentController.java
│   └── ...
├── service
│   ├── UserService.java
│   ├── GroomerService.java
│   └── ...
├── repository
│   ├── UserRepository.java
│   └── ...
├── entity
│   ├── User.java
│   ├── Groomer.java
│   └── ...
```

구조는 초기 단계에서는 개발 속도가 빠르고, 팀원 모두가 전체 시스템을 쉽게 이해할 수 있어 효과적이었습니다. 하지만 **서비스의 규모와 복잡성이 증가하면서 여러 구조적 문제점들이 보이기 시작했습니다.**

# 초기 구조에서의 주요 문제점들

## 1. 외부 API 의존성으로 인한 장애 전파

결제 처리를 위한 PortOne API, 알림 전송을 위한 SOLAPI 등 외부 서비스에 의존하고 있었습니다. 이러한 외부 API에 장애나 지연은 **전체 시스템의 안정성에 직접적인 영향을 미치는 단일 장애점으로 작용했습니다.**

특히 결제 API에 지연이 발생하면 톰캣의 쓰레드 풀이 고갈될 가능성이 높았고, 이로 인해 예약 조회나 반려동물 조회와 같은 단순한 읽기 작업까지 영향을 받을 수 있는 위험을 사전에 파악했습니다.

## 2. 도메인 경계의 모호화와 높은 결합도

서비스 규모가 성장함에 따라 여러 도메인 개념들이 서로 얽혀있어 코드의 양이 증가하고 도메인 간 경계가 모호해져 코드 복잡성이 증가했습니다. 이는 코드 이해도와 유지보수성을 심각하게 저하시켰습니다.

예를 들어, `GroomingReviewService` 클래스를 살펴보면 다음과 같은 복잡한 의존성을 볼 수 있었습니다.

```java
@Service
@RequiredArgsConstructor
public class GroomingReviewService {
    private final UserPersist userPersist;
    private final GroomerPersist groomerPersist;
    private final GroomerKeywordPersist groomerKeywordPersist;
    private final ReservationPersist reservationPersist;
    private final GroomingReviewPersist groomingReviewPersist;
    private final GroomerDaengleMeterPersist groomerDaengleMeterPersist;
    private final BanWordValidator banWordValidator;
    private final ReviewEventPublisher reviewEventPublisher;
    
    // 복잡한 비즈니스 로직...
}
```

위 코드에서 볼 수 있듯이, **하나의 서비스 클래스에 리뷰, 유저, 미용사, 평점 계산, 금칙어 처리 등 너무 많은 책임이 집중되어 있었습니다.** 이는 단일 책임 원칙(SRP)을 명백히 위반하며, 코드의 응집도를 낮추고 결합도를 높이는 결과를 초래했습니다.

# DDD와 멀티 모듈 아키텍처 도입

위 문제들을 해결하기 위해 **도메인 주도 설계(Domain-Driven Design, DDD)와 포트-어댑터 패턴(헥사고날 아키텍처)을 적용한 멀티 모듈 아키텍처로의 전환을 결정했습니다.**

마이크로서비스 아키텍처(MSA)의 전환도 고려했지만, 운영 복잡성과 분산 시스템 관리의 어려움을 고려하여 중간 단계로 멀티 모듈 아키텍처를 선택했습니다.

## 멀티 모듈 구조 설계

먼저 시스템을 아래와 같이 주요 모듈로 분리하기로 설계했습니다.

```
daengle-server/
├── daengle-domain                  # 도메인 모듈 (순수 자바)
├── daengle-auth                    # 인증/인가 모듈
├── daengle-user-api                # 반려인용 API 모듈
├── daengle-groomer-api             # 미용사용 API 모듈
├── daengle-vet-api                 # 수의사용 API 모듈
├── daengle-payment-api             # 결제 관련 API 모듈
├── daengle-chat-api                # 채팅 관련 API 모듈
├── daengle-persistence-rdb         # RDB 영속성 모듈
├── daengle-persistence-nosql       # NoSQL 영속성 모듈
└── daengle-persistence-queue       # 메시지 큐 영속성 모듈
```

- **도메인 모듈(daengle-domain) :** 순수 자바 코드로만 구성된 핵심 비즈니스 로직
- **API 모듈(daengle-xxx-api) :** 각 사용자 유형별, 기능별 API 엔드포인트와 애플리케이션 서비스
- **영속성 모듈(daengle-persistence-xxx) :** 외부 저장소(RDB, NoSQL 등)와의 통신을 담당하는 어댑터 구현체

![댕글 멀티모듈.png](https://i.imgur.com/vNDQ3RB.png)

이 구조에서 `daengle-domain` **모듈은 시스템의 핵심으로, 모든 비즈니스 규칙과 도메인 객체를 포함합니다.** 도메인 모듈은 다른 모든 모듈에서 의존할 수 있지만, 역으로 도메인 모듈은 어떤 외부 모듈에도 의존하지 않는 의존성 역전 원칙을 철저히 준수하도록 설계했습니다.

## 도메인 모델 추출

첫 단계로, 기존 코드베이스에서 핵심 도메인 모델과 비즈니스 로직을 추출했습니다. 이 과정에서 외부 의존성 없이 순수 자바 코드로만 구성된 클래스들을 분리하는 작업이 필요했습니다.

특히 JPA 엔티티와 순수 도메인 모델을 분리하는 작업이 가장 중요했습니다.

### JPA 엔티티와 도메인 모델 분리

> 기존에는 JPA 어노테이션이 도메인 모델에 직접 적용되어 영속성 기술과 도메인 모델이 강하게 결합되어 있었습니다.
>

**JPA 어노테이션이 포함된 기존의 엔티티 (변경 전)**

```java
@Entity
@Table(name = "payments")
public class Payment {
    @Id 
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long paymentId;
    
    private Long payerId;
    private Long price;
    
    @Enumerated(EnumType.STRING)
    private PaymentStatus status;
    private LocalDateTime paymentDate;
    
    // getters, setters ...
}
```

**JPA 의존성으로부터 분리한 순수 도메인 객체 (변경 후)**

```java
package ddog.domain.payment;

public class Payment {

    private Long paymentId;
    private Long payerId;
    private Long price;
    private PaymentStatus status;
    private LocalDateTime paymentDate;
    private String paymentUid;
    private String idempotencyKey;

		// 비즈니스 메서드
    public void validationSuccess(String impUid) {
        this.paymentUid = impUid;
        this.status = PaymentStatus.PAYMENT_COMPLETED;
    }

    public void invalidate() {
        this.status = PaymentStatus.PAYMENT_INVALIDATION;
    }

    public void cancel() {
        this.status = PaymentStatus.PAYMENT_CANCELED;
    }
		
		// ...
}
```

**순수 도메인 객체로 변환하면서 단순한 `getter/setter` 가 아닌 의미 있는 비즈니스 메서드를 추가했습니다.** 이를 통해 객체 자체가 비즈니스 규칙을 캡슐화하고 책임을 가질수 있도록 했습니다.

## 포트-어댑터 패턴 적용

다음 단계로, 포트-어댑터 패턴을 적용하여 **도메인 로직과 외부 기술 스택 간의 의존성을 역전**시켰습니다.

### 포트 인터페이스 정의

도메인 객체가 외부 세계와 통신하는 방법을 정의하는 포트 인터페이스를 도메인 모듈에 배치했습니다.

```java
// 도메인 모듈에 위치한 포트 인터페이스
package ddog.domain.payment.port;

// 기술 독립적
public interface PaymentPersist {
    Optional<Payment> findByPaymentId(Long paymentId);
    
    Optional<List<Payment>> findByPayerId(Long paymentId);
    
    // ...
}
```

**이 인터페이스는 완전히 기술 독립적이며, 어떠한 외부 라이브러리나 프레임워크에 의존하지 않습니다.** 이를 통해 도메인 모델이 특정 영속성 기술에 의존하지 않게 하여 장기적으로 기술 변경에 유연하게 대응할 수 있도록 했습니다.

### **포트 인터페이스 배치 위치에 대한 고민**

포트 인터페이스를 어느 모듈에 배치할지에 대한 고민이 있었습니다. 처음에는 영속성 모듈에 배치했으나, 이렇게 하면 모든 API 모듈이 영속성 모듈에 의존하게 되는 문제가 발생했습니다.

```
API 모듈 → 영속성 모듈(포트 인터페이스) → 도메인 모듈
```

위와 같은 구조에서는 애플리케이션의 핵심인 도메인 모듈이 중심이 아니라, 영속성 모듈이 중간자 역할을 하게 됩니다. **이는 DDD의 핵심 원칙인 “도메인 중심” 사고와 충돌하기 때문에 포트 인터페이스를 도메인 모듈로 이동시켜 의존성 역전 원칙(DIP)을 명확하게 적용했습니다.**

```
API 모듈 → 도메인 모듈(포트 인터페이스) ← 영속성 모듈
```

이렇게 함으로써 도메인 모듈이 애플리케이션의 중심이 되고, 외부 기술(영속성 모듈)이 도메인에 의존하는 구조가 되었습니다.

## 영속성 어댑터 구현

포트 인터페이스를 구현하는 어댑터 클래스를 영속성 모듈에 구현했습니다. 이 어댑터는 도메인 모듈의 포트 인터페이스를 구현하며, 실제 데이터베이스와의 통신을 담당합니다.

```java
// 영속성 모듈의 어댑터 구현
package ddog.persistence.rdb.adapter;

// JPA 의존적
@Repository
@RequiredArgsConstructor
public class PaymentRepository implements PaymentPersist {

    private final PaymentJpaRepository paymentJpaRepository;

    @Override
    public Optional<Payment> findByPaymentId(Long paymentId) {
        return paymentJpaRepository.findByPaymentId(paymentId).map(PaymentJpaEntity::toModel);
    }

    @Override
    public Optional<List<Payment>> findByPayerId(Long paymentId) {
        return paymentJpaRepository.findByPayerId(paymentId)
                .map(paymentJpaEntities -> paymentJpaEntities.stream()
                        .map(PaymentJpaEntity::toModel)
                        .toList());
    }
    
    // ...
}
```

**이런 접근 방식으로 영속성 모듈은 JPA와 같은 특정 기술에 의존하지만, 도메인 모듈은 이러한 기술적 세부 사항으로부터 완전히 격리됩니다.** 따라서 도메인 로직이 특정 데이터베이스나 ORM 기술에 영향을 받지 않도록 보장할 수 있게 됐습니다.

## API 모듈 구성

마지막으로, 사용자 유형(User, Groomer, Vet)과 기능(Payment, Notification)에 따라 별도의 API 모듈을 구성했습니다.

```java
daengle-user-api
├── presentation     // 컨트롤러
├── application      // 서비스
│   ├── exception    // 도메인별 예외 정의 및 처리
│   ├── mapper       // DTO-도메인 객체 간 변환
│   ├── dto          // 데이터 전송 객체
│   └── config       // 모듈별 설정
└── resources        // 설정 파일
```

### 느슨한 결합을 위한 의존성 관리

**각 API 모듈은 오직 도메인 모듈에만 직접 의존합니다.** 실제 데이터베이스 접근을 담당하는 영속성 모듈은 직접 참조하지 않고, Spring의 의존성 주입을 통해 런타임에 연결됩니다.

```java
// API 모듈의 서비스 클래스
@Service
@RequiredArgsConstructor
public class PaymentService {
    // 도메인 모듈의 포트 인터페이스에 의존
    private final PaymentPersist paymentPersist;
    private final OrderPersist orderPersist;
    
    @Transactional
    public PaymentCallbackResp validationPayment(PaymentCallbackReq req) {
        // 비즈니스 로직
        Order order = orderPersist.findByOrderUid(req.getOrderUid())
            .orElseThrow(() -> new OrderException(OrderExceptionType.ORDER_NOT_FOUNDED));
        Payment payment = order.getPayment();
        
        // ...
    }
}
```

이로 인해 `PaymentService` 는 구체적인 데이터베이스 기술에 의존하지 않습니다. 서비스 클래스는 오직 도메인 모듈에 정의된 포트 인터페이스인 `PaymentPersist, OrderPersist` 만 알고 있으며, `PaymentPersist` 인터페이스의 실제 구현체인 `PaymentRepository` 는 스프링의 의존성 주입을 통해 런타임에 연결됩니다.

# 전환 과정에서의 주요 고민

## 1. 공통 응답/예외처리 설계

각 API 모듈이 공유하는 공통 응답/예외처리 로직을 어디에 배치할지 고민이 있었습니다.

처음에는 공통 코드들이 모여있는 `common` 모듈을 만들어 배치하는 방안을 검토했으나, 장기적인 관점에서 각 모듈이 독립적으로 발전할 가능성을 고려하여 **각 API 모듈마다 고유한 응답/예외처리 메커니즘을 가지도록 결정했습니다.**

```java
package ddog.auth.exception.common;

public record CommonResponseEntity<T>(boolean success, T response, CustomError error) {

    public static <T> CommonResponseEntity<T> success(T response) {
        return new CommonResponseEntity<>(true, response, null);
    }

    public static <T> CommonResponseEntity<T> error(T response, HttpStatus status, String message) {
        return new CommonResponseEntity<>(false, null, new CustomError(message, status));
    }
}
```

이렇게 함으로써 코드 재사용성은 일부 희생했지만, 각 모듈이 독립적으로 발전할 수 있는 유연성을 얻었습니다.

## 2. 도메인 모델과 DTO 간의 변환

API 모듈에서는 외부와의 통신을 위해 DTO를 사용합니다. 모놀리식 구조에서는 도메인 모델을 직접 응답으로 사용하는 경우도 있었지만, **멀티 모듈에서는 명확한 경계를 위해 DTO와 도메인 모델을 분리했습니다.**

이 변환 로직을 처리하기 위해 각 API 모듈에 Mapper 클래스를 구현했습니다.

```java
// Mapper 클래스 예시
public class PaymentMapper {
    public static PaymentResp toResponse(Payment payment) {
        return PaymentResp.builder()
                .paymentId(payment.getPaymentId())
                .status(payment.getStatus().name())
                .price(payment.getPrice())
                .paymentDate(payment.getPaymentDate())
                .build();
    }
    
    public static Payment toEntity(PaymentReq request, Long accountId) {
        return Payment.builder()
                .payerId(accountId)
                .price(request.getPrice())
                .status(PaymentStatus.PAYMENT_READY)
                .paymentDate(LocalDateTime.now())
                .build();
    }
}
```

# 장애 격리 검증

> 기존 아키텍처 구조와 새로운 아키텍처 구조에서 실제로 외부 API에 장애가 발생했을 경우 장애 격리 효과를 가져오는지 검증하기 위해 K6를 사용하여 부하 테스트를 수행했습니다.
>

```jsx
import http from "k6/http";
import { check } from "k6";

const BASE_URL = "https://api.daengle.com";

export let options = {
  scenarios: {
    paymentValidate: {
      executor: "constant-arrival-rate",
      rate: 2000,
      duration: "3m",
      preAllocatedVUs: 100,
      exec: "paymentValidate",
    },
  },
};

export function paymentValidate() {
  http.post(
    `${BASE_URL}/api/payment/validate`,
    JSON.stringify({
      paymentUid: "imp_501117838439",
      orderUid: "a61fa13f-052f-4685-a293-14abce0551c6",
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}

export function businessLogic() {
  http.get(`${BASE_URL}/api/vet/estimate/list`, {
    headers: { Authorization: `Bearer ${vetJWT}` },
  });
}
```

![image.png](https://i.imgur.com/P0pHrE3.png)

테스트 결과, 모놀리식 구조에서는 **결제 API에 장애가 발생하면 톰캣의 작업 쓰레드 풀이 빠르게 포화 상태에 이르렀습니다.** 이로 인해 시스템 전체의 처리 능력이 급격히 저하되어, 결제와 무관한 비즈니스 API까지 지연 시간이 크게 증가하고 오류율이 높아지는 현상을 관찰할 수 있었습니다.

![image.png](https://i.imgur.com/a3ssLaE.png)

반면, 멀티 모듈 구조에서는 **결제 API에 동일한 장애가 발생하더라도 다른 비즈니스 API는 정상적인 응답 시간을 유지했습니다.**

이는 멀티 모듈 아키텍처가 서비스 간 장애 격리를 효과적으로 제공하며, 특정 기능의 장애가 전체 시스템에 미치는 영향을 최소화한다는 것을 검증할 수 있었습니다.