---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/ULF1Qk1.png"

title: "JPA와 MySQL로 구현한 동시성 제어"
excerpt: "Redis 대신 JPA의 Pessimistic Lock과 MySQL을 활용하여 좋아요 기능의 동시성 문제를 해결하고, 시스템 복잡도를 줄이면서 데이터 정합성을 보장한 과정을 다룹니다."
categories:
 - Backend
tags:
  - 동시성 제어
  - JPA
  - Pessimistic Lock
  - MySQL
 
toc_label: "JPA와 MySQL로 구현한 동시성 제어"
toc: true
toc_sticky: true

date: 2025-02-05
last_modified_at: 2025-02-05 
---
# Redis를 사용하지 않으려는 이유

> 현재 꾸미 서비스에는 좋아요/싫어요 기능의 **동시성 제어를 위해 Redis를 사용하고 있었습니다.**
그러나 기능 분석 결과, Redis 사용이 **오버 엔지니어링이라고 판단**했습니다.

![image.png](https://i.imgur.com/ULF1Qk1.png)

좋아요/싫어요 기능은 SNS 서비스와 달리 **실시간성이 매우 중요한 기능이 아닙니다.** 사용자들이 동시에 좋아요 버튼을 누르는 상황이 자주 발생하지 않으며, 초당 처리해야 할 트랜잭션 수가 많지 않습니다.

즉, 수 밀리초 단위의 즉각적인 반영보다는 **좋아요 수의 정확성**이 더 중요합니다.

추가적으로, Redis 사용으로 인한 여러 단점들이 존재했는데,

- 추가 인프라 관리 오버헤드 발생
- Redis와 MySQL 간 데이터 동기화 로직 필요
- 장애 상황에서 데이터 정합성 보장의 어려움
- 시스템 복잡도 증가

이번 기회에 JPA와 MySQL만으로 동시성 문제를 해결하는 방법을 고민하고, 정확한 좋아요 수를 보장하는 방안을 구현하고자 합니다.

## 기능 요구사항

### 기본 피드백 기능

1. 사용자는 도서에 대해 좋아요/싫어요 표시 가능
2. 한 도서에 대해 사용자당 하나의 피드백만 가능 (좋아요/싫어요/선택 안함)
3. 좋아요/싫어요 상태는 변경 및 취소 가능

### 도서 점수 관리

1. 도서의 전체 좋아요 수 관리
2. 좋아요 시 도서의 `likes` 증가
3. 좋아요 취소 시 도서의 `likes` 감소
4. 좋아요에서 싫어요로 변경 시 좋아요 수 감소

### ~~사용자 성향 분석~~

1. ~~피드백을 통한 사용자(`Child`)의 MBTI 성향 분석~~
2. ~~도서 추천에 활용~~

*사용자 성향 분석 요구사항은 동시성과 크게 관련이 없으므로 이번 글에서는 제외하려고 합니다.*

---

## Entity

해결 과정을 설명하기에 앞서, 요구사항에 필요한 필수 도메인에 대한 코드 먼저 첨부하겠습니다.

*( 각 도메인 객체에 다양한 속성과 역할이 있지만, 요구사항에 필요한 내용만 적었습니다. )*

```java
// 도서 정보와 좋아요 수를 관리하는 도메인
@Entity
public class Book {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private int likes;
    
    // 기타 도서 관련 필드 ...
    
    public void incrementLikes() {
        this.likes++;
    }
    
    public void decrementLikes() {
        if (this.likes > 0) {
            this.likes--;
        }
    }
}

// 사용자의 좋아요 상태를 관리하는 도메인
@Entity
public class Feedback {
    @Enumerated(EnumType.STRING)
    private Thumbs thumbs;  // UP, DOWN, UNCHECKED
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "child_id")
    private Child child;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id")
    private Book book;
    
    /* 피드백 상태 변경을 위한 메서드 */
    public void updateThumbs(Thumbs newThumbs) {
        if (this.thumbs == newThumbs) {
            throw new IllegalStateException("같은 상태로 피드백을 업데이트 할 수 없습니다.");
        }
        this.thumbs = newThumbs;
    }
}
```

# 기존 코드 구현 분석

> 기존 Redis를 활용한 좋아요 처리
>

```java
public Long updateLike(Long bookId, Long childId) {
		String key = "like:" + bookId;
		redisTemplate.opsForSet().add(key, childId.toString());
		
		/* 
				... Redis와 MySQL 간 데이터 동기화 로직 ...
		*/
}
```

단순한 기능임에도 불구하고 동시성 문제 해결만을 위해 **추가적인 인프라를 관리**해야 하며 **운영DB와 데이터를 동기화하기 위한 추가적인 로직이 필요한 번거로움이 있었습니다.**

# 동시성 문제가 발생 가능한 상황

## 1. Race Condition (경쟁 상태)

> 동일한 작업을 수행하는 여러 트랜잭션이 경쟁하는 상황을 가정했을 때

도서의 좋아요 수(`likes`)가 (5)인 상황에서 두 사용자(A, B)가 동시에 좋아요를 누르는 경우

1. `사용자A` 가 `likes` (5) 를 읽음
2. `사용자B` 가 `likes` (5) 를 읽음
3. `사용자A` 가 좋아요 수를 (1) 증가시켜 (6)으로 업데이트
4. `사용자B` 가 좋아요 수를 (1) 증가시켜 (6)으로 업데이트

→ 기대값은 (7)이지만 실제 저장된 값은 (6)으로, 한 사용자의 작업이 무시됩니다.

## 2. Lost Update (갱신 손실)

> 서로 다른 작업을 수행하는 트랜잭션들이 충돌하여 마지막 갱신만 남는 상황을 가정했을 때

도서의 좋아요 수(`likes`)가 (5)인 상황에서 사용자A는 좋아요, 사용자B는 좋아요를 취소하는 경우

1. `사용자A` 가 `likes` (5) 를 읽음
2. `사용자B` 가 `likes` (5) 를 읽음
3. `사용자A` 가 좋아요 수를 (1) 증가시켜 (6)으로 업데이트
4. `사용자B` 가 좋아요 수를 (1) 감소시켜 (4)로 업데이트

→ 좋아요를 증가시킨 작업은 무시되고 최종값은 (4)가 됩니다.

이러한 문제들로 인해, 실제 좋아요 수와 DB의 값이 불일치하는 **데이터 정합성 문제**가 발생할 수 있습니다.

따라서, `Book` 엔티티의 `likes` 필드를 업데이트하는 지점에 동시성 제어가 필요합니다.

---

# 문제 해결을 위한 방안 검토

## 1. Synchronized

```java
public synchronized Long updateLike(Long bookId, Long childId) {
    // 좋아요 처리 로직
}
```

**장점**

- 구현이 매우 간단함
- JVM 레벨의 동시성 제어

**단점**

- 서버가 여러 대인 분산 환경에서는 동시성 제어 불가
- 메서드 전체에 락이 걸리기 때문에 성능 저하

→ 현재 저희 서비스는 단일 서버이기 때문에 `synchronized` 를 사용해도 해당 요구사항을 만족시킬 수 있지만, 추후 **확장성을 고려했을 때 적합하지 않다고 판단했습니다.**

## 2. Optimistic Lock (낙관적 락)

> JPA에서 제공하는 낙관적 락 방식
>

```java
@Entity
public class Book {
		@Version
		private Long version;
		
		@Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private int likes;
    
    // ... 위와 동일
}
```

이를 SQL로 변환되면 다음과 같이 실행됩니다.

```sql
UPDATE BOOK
SET likes = likes + 1, version = version + 1
WHERE id = ? AND version = ?
```

데이터 수정 시 `Version` 필드를 확인하고, `UPDATE` 쿼리 실행 시 `WHERE` 절에 버전 정보를 포함하는 방식으로 동작합니다.

**장점**

- 실제 Lock 이 없기 때문에 성능이 좋음
- 구현이 간단함

**단점**

- 충돌 시 예외가 발생하기 때문에 재시도 로직이 필요함
- 높은 동시성 환경에서는 충돌이 빈번해 성능 저하 가능성

→ 좋아요/싫어요 기능에서는 **빈번한 수정으로 충돌 가능성이 있기 때문에 낙관적 락은 적합하지 않다고 판단했습니다.**

## 3. Pessimistic Lock (비관적 락)

### 3-1. Pessimistic Read (공유 락, Shared Lock, S-Lock)

```java
@Lock(LockModeType.PESSIMISTIC_READ)
@Query("SELECT b FROM Book b WHERE b.id = :id")
Optional<Book> findByIdWithPessimisticRead(@Param("id") Long id);
```

이를 SQL로 변환되면 다음과 같이 실행됩니다.

```sql
SELECT ... FOR SHARE
```

공유 락은 **다른 트랜잭션의 읽기는 허용되지만 쓰기 작업은 블로킹합니다**.

따라서, 공유 락은 읽기 일관성이 중요한 경우에 사용하고 긴 트랜잭션에서 데이터 정합성 유지에 사용합니다.

→ 쓰기 작업이 필요한 좋아요/싫어요 기능에서는 공유 락은 적합하지 않다고 판단했습니다.

### 3-2. Pessimistic Write (배타적 락, Exclusive Lock, X-Lock)

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT b FROM Book b WHERE b.id = :id")
Optional<Book> findByIdWithPessimisticRead(@Param("id") Long id);
```

이를 SQL로 변환되면 다음과 같이 실행됩니다.

```sql
SELECT ... FOR UPDATE
```

배타적 락은 다른 트랜잭션의 읽기/쓰기 모두를 블로킹하여 **완벽한 동시성 제어**가 가능합니다. 데이터 수정이 빈번한 경우와 강력한 동시성 제어가 필요한 경우에 사용합니다.

→ 동시 수정이 완벽히 차단되기 때문에 **데이터 정합성이 보장**되고 JPA가 제공하는 기능으로 **구현이 간단**해 이번 요구사항에 가장 적합하다고 판단했습니다.

# 추가적으로 고려한 부분

## 1. Lock Timeout 설정

> 데드락(Deadlock) 방지를 위해 락 획득 대기 시간을 설정했습니다.
>
>
> *데드락 : 두 개 이상의 트랜잭션이 각각 상대방이 가진 락을 기다리며 진행이 불가능한 상태*
>


예를 들어

- 트랜잭션 A: `Book(id=1)` 에 대한 Lock 획득 → `Book(id=2)` 에 대한 Lock 획득 시도 (대기)
- 트랜잭션 B: `Book(id=2)` 에 대한 Lock 획득 → `Book(id=1)` 에 대한 Lock 획득 시도 (대기)

이런 상황에서 A는 B가 가진 Lock을 기다리고, B는 A가 가진 Lock을 기다리며 둘 다 영원히 진행이 불가능한 데드락 상태가 발생합니다.

따라서, Lock 획득 타임아웃을 설정해 **무한 대기 상태를 방지**해줬습니다.

```java
@QueryHints({
		@QueryHint(name = "javax.persistence.lock.timeout", value = "3000")
})
```

1. 트랜잭션 A: `Book` (id=1)에 대한 Lock 획득
2. 트랜잭션 B: `Book` (id=2)에 대한 Lock 획득 시도 (대기)
3. 3초 (`3000ms`) 동안 대기
4. 3초 내 Lock 획득 실패 시 예외 발생 및 롤백

## 2. 트랜잭션 격리 수준 설정

DB 락과 더불어 데이터 일관성을 유지하기 위해 트랜잭션 격리 수준 (Isolation Level) 을 고려했습니다.

```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
```

**READ_UNCOMMITED**는 Dirty Read 문제가 발생합니다.

1. 트랜잭션 A: 좋아요 증가 (5 -> 6)
2. 트랜잭션 B: 증가된 값인 6을 읽음
3. 트랜잭션 A: 문제가 발생해 Rollback 수행
4. 트랜잭션 B는 잘못된 값인 6을 계속해서 사용

**READ_COMMITTED**는 Dirty Read 문제는 방지하지만, Non-Repeatable Read 문제가 발생합니다.

1. 트랜잭션 A: 좋아요 수 (5) 확인
2. 트랜잭션 B: 좋아요 증가 (5 -> 6)
3. 트랜잭션 A: 다시 좋아요 수 확인 (6)
4. 트랜잭션 A는 같은 트랜잭션 내에서 다른 값을 읽게 됨

**REPEATABLE_READ**는 Non-Repeatable Read 문제는 방지하지만, Phantom Read 문제가 발생할 수 있습니다.

1. 트랜잭션 A: 좋아요 수 (5) 확인
2. 트랜잭션 B: 좋아요 증가 (5 -> 6)
3. 트랜잭션 A: 다시 좋아요 수 확인 (5)
4. 트랜잭션 내 일관된 데이터를 보장

**SERIALIZABLE**은 완벽한 격리 수준을 제공하지만, 성능 저하가 심합니다.

**좋아요 수 조회에 대해 일관성을 보장**해 주는 REPEATABLE_READ와 SERIALIZABLE 중 성능을 고려하여 REPEATABLE_READ를 선택했습니다. 특히 좋아요/싫어요 기능에서는 Phantom Read가 큰 문제가 되지 않으므로, **성능 오버헤드가 적은** REPEATABLE_READ가 적합하다고 판단했습니다.

# 계층별 구현 코드

## Repository

```java
@Repository
public interface BookRepository extends JpaRepository<Book, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints({
        @QueryHint(name = "javax.persistence.lock.timeout", value = "3000")
    })
    @Query("SELECT b FROM Book b WHERE b.id = :id")
    Optional<Book> findByIdWithPessimisticLock(@Param("id") Long id);
}
```

1. `PESSIMISTIC_WRITE` 배타적 락으로 동시 수정을 방지
2. `lock.timeout` 3초 설정으로 데드락을 방지
3. 단일 행을 조회하며 `Row-Level Lock` 으로 다른 도서에는 영향이 없도록 해 좋아요/싫어요 작업에 대해 빠르게 처리

## Service

```java
@Service
@Transactional
public class BookDetailService {
    // 좋아요 처리를 위한 트랜잭션 설정
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public Long updateLike(Long bookId, Long childId) {
        // 1. 비관적 락으로 도서 조회 및 검증
        Book book = bookRepository.findByIdWithPessimisticLock(bookId)
            .orElseThrow(() -> new ApiException(ErrorCode.BOOK_NOT_EXIST));

        // 2. 피드백 조회 및 검증
        Feedback feedback = feedbackRepository.findByBookIdAndChildId(bookId, childId)
            .orElseThrow(() -> new ApiException(ErrorCode.FEEDBACK_NOT_EXIST));

        // 3. 중복 좋아요 체크
        if (feedback.getThumbs() == Thumbs.UP) {
            throw new ApiException(ErrorCode.ALREADY_LIKED);
        }

        // 4. 트랜잭션 내에서 안전하게 모든 상태 업데이트
        feedback.updateThumbs(Thumbs.UP);
        book.incrementLikes();
        
        // 변경된 엔티티는 트랜잭션 종료 시 자동으로 저장됨
        return 1L;
    }
    
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public Long updateHate(Long bookId, Long childId) {
        Book book = bookRepository.findByIdWithPessimisticLock(bookId)
            .orElseThrow(() -> new ApiException(ErrorCode.BOOK_NOT_EXIST));

        Feedback feedback = feedbackRepository.findByBookIdAndChildId(bookId, childId)
            .orElseThrow(() -> new ApiException(ErrorCode.FEEDBACK_NOT_EXIST));

        if (feedback.getThumbs() == Thumbs.DOWN) {
            throw new ApiException(ErrorCode.ALREADY_HATE);
        }

        // 기존에 좋아요 상태였다면 좋아요 수 감소
        if (feedback.getThumbs() == Thumbs.UP) {
            book.decrementLikes();
        }

        feedback.updateThumbs(Thumbs.DOWN);
        
        return 1L;
    }
}
```

# 동시성 검증을 위한 테스트

> 멀티스레드 환경에서 동시 요청에 대한 정확성을 검증하기 위한 테스트 코드를 작성했습니다.
>

## Race Condition 검증

```java
@Test
@DisplayName("동시에 여러 사용자가 좋아요를 눌러도 좋아요 수가 정확히 증가해야 한다")
void concurrentLikeTest() throws InterruptedException {
    // given
    Book book = createBook("Test Book");
    Parent parent = createParent("Test Parent");
    int numberOfThreads = 10;
    List<Child> children = new ArrayList<>();
    List<Feedback> feedbacks = new ArrayList<>();

    // 데이터 초기화 및 영속화
    for (int i = 0; i < numberOfThreads; i++) {
        Child child = createChild("Child" + i, parent);
        children.add(child);
        Feedback feedback = createFeedback(child, book);
        feedbacks.add(feedback);
    }

    // 모든 데이터가 DB에 반영되도록 명시적으로 플러시
    TestTransaction.flagForCommit();
    TestTransaction.end();

    // 새로운 트랜잭션 시작
    TestTransaction.start();

    ExecutorService executorService = Executors.newFixedThreadPool(numberOfThreads);
    CountDownLatch latch = new CountDownLatch(numberOfThreads);

    // when
    for (int i = 0; i < numberOfThreads; i++) {
        Child child = children.get(i);
        executorService.submit(() -> {
            try {
                bookDetailService.updateLike(book.getId(), child.getId());
            } finally {
                latch.countDown();
            }
        });
    }

    latch.await();
    executorService.shutdown();

    // then
    Book updatedBook = bookRepository.findById(book.getId()).orElseThrow();
    assertThat(updatedBook.getLikes()).isEqualTo(numberOfThreads);
}

```

`동시성 문제가 발생하는 경우`

![image.png](https://i.imgur.com/uRBfLOj.png)

`동시성 문제를 해결한 경우`

![image.png](https://i.imgur.com/sXg5GLC.png)

## Lost Update 검증

```java
@Test
@DisplayName("동시에 좋아요/싫어요를 눌러도 정확한 좋아요 수가 유지되어야 한다")
void concurrentLikeAndHateTest() throws InterruptedException {
    // given
    Book book = createBook("Test Book");
    Parent parent = createParent("Test Parent");

    int numberOfThreads = 10;
    List<Child> children = new ArrayList<>();
    List<Feedback> feedbacks = new ArrayList<>();

    // 데이터 초기화 및 영속화
    for (int i = 0; i < numberOfThreads; i++) {
        Child child = createChild("Child" + i, parent);
        children.add(child);

        Feedback feedback = createFeedback(child, book);
        feedbacks.add(feedback);
    }

    // 모든 데이터가 DB에 반영되도록 명시적으로 플러시
    TestTransaction.flagForCommit();
    TestTransaction.end();

    // 새로운 트랜잭션 시작
    TestTransaction.start();

    ExecutorService executorService = Executors.newFixedThreadPool(numberOfThreads);
    CountDownLatch latch = new CountDownLatch(numberOfThreads);

    // when
    for (int i = 0; i < numberOfThreads; i++) {
        Child child = children.get(i);
        final int index = i;
        executorService.submit(() -> {
            try {
                if (index % 2 == 0) {
                    bookDetailService.updateLike(book.getId(), child.getId());
                } else {
                    bookDetailService.updateHate(book.getId(), child.getId());
                }
            } finally {
                latch.countDown();
            }
        });
    }

    latch.await();

    // then
    Book updatedBook = bookRepository.findById(book.getId()).orElseThrow();
    List<Feedback> updatedFeedbacks = feedbackRepository.findByBookId(book.getId());

    long likeCount = updatedFeedbacks.stream()
            .filter(f -> f.getThumbs() == Thumbs.UP)
            .count();

    assertThat(updatedBook.getLikes()).isEqualTo(likeCount);
}
```

`동시성 문제가 발생하는 경우`

![image.png](https://i.imgur.com/jUM5XHY.png)

`동시성 문제를 해결한 경우`

![image.png](https://i.imgur.com/B81tLX2.png)

---

# 마치며

Redis를 제거함으로써 **시스템 복잡도는 감소**했고, `Amazon ElastiCache` 와 같은 인메모리 DB를 사용하지 않아 **운영 비용 또한 절감**할 수 있었습니다.

이번 리팩토링을 통해 JPA와 MySQL만으로 동시성 문제를 해결하면서 시스템 복잡도를 낮추고 데이터 정합성을 보장할 수 있었습니다.
또한, **더 단순한 해결책이 더 나은 선택인 경우가 될 수 있다**는 경험을 할 수 있었습니다.

[https://github.com/ggumiggumi/ggumi-backend/pull/111](https://github.com/ggumiggumi/ggumi-backend/pull/111)