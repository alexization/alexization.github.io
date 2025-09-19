---
header:
   teaser: /assets/images/logo.png

title: "SQL 튜닝을 통한 API 성능 최적화 (2편)"
excerpt: "대기 진료 견적서 상세 조회 API에서 569ms 걸리던 3개의 개별 쿼리를 JOIN과 인덱스 최적화를 통해 50ms로 단축시킨 과정을 다룹니다."
categories:
  - Database
tags:
  - SQL 튜닝
  - MySQL
  - 인덱스
  - API 성능 최적화
  
toc_label: "SQL 튜닝을 통한 API 성능 최적화"
toc: true
toc_sticky: true

date: 2025-03-11
last_modified_at: 2025-03-11 
---
# 대기 진료 견적서 상세 조회 (GET)

> **테스트 환경 :** Local MySQL 8.0 / Local 애플리케이션 서버 / 100만 개 데이터 기준

## 문제 상황

사용자가 진료 견적서에 대한 상세 데이터를 조회하기 위해서는 `care_estimates` 테이블에 들어있는 `vet_id`, `pet_id` 등의 `id` 를 통해 각 `vets`, `pets` 에 해당하는 다른 테이블의 정보를 가져와야 했습니다.

기존 구현에서는 **세 개의 개별 쿼리를 순차적으로 실행**하여 데이터를 조회했습니다.

```sql
-- 1. 견적서 정보 조회
SELECT *
FROM care_estimates
WHERE estimate_id = :estimate_id;

-- 2. 수의사 정보 조회
SELECT *
FROM vets
WHERE account_id = :account_id;

-- 3. 반려동물 정보 조회
SELECT *
FROM pets
WHERE pet_id = :pet_id;
```

![사진18.png](https://i.imgur.com/3YTm4ev.png)

실제 API 호출 과정을 로그에서 살펴보면

- 견적서 조회 : `35ms`
- 수의사 조회 : `487ms`  **← 가장 큰 병목 지점**
- 반려동물 조회 : `47ms`

총 소요 시간은 `569ms` 로, 특히 수의사 정보를 조회하는 쿼리에서 현저히 긴 실행 시간이 발생하고 있어, 이 부분을 중점적으로 개선할 필요가 있었습니다.

## 문제 분석

현재 코드는 아래와 같이 3번의 개별 데이터베이스 조회를 순차적으로 실행하고 있었습니다.

![사진17.png](https://i.imgur.com/vo2speV.png)

이는 **각각의 조회마다 별도의 데이터베이스 연결을 필요로 하며, 네트워크 지연이 발생**할 수 있습니다.

# 1. JOIN을 활용한 단일 쿼리

첫 번째 개선 방안으로, **네트워크 요청을 최소화하기 위해 `JOIN`을 활용한 단일 쿼리**로 모든 필요한 데이터를 한 번에 조회하도록 변경했습니다.

```sql
SELECT c.*, v.*, p.* 
FROM care_estimates c
JOIN vets v ON v.account_id = c.vet_id
JOIN pets p ON p.pet_id = c.pet_id
WHERE c.estimate_id = :estimate_id
```

![사진19.png](https://i.imgur.com/nwPUiOK.png)

`JOIN` 쿼리로 변경한 결과, 응답 시간이 약 `540ms` 로 측정되었습니다. 이는 기존 방식(`569ms`)에 비해 약간의 개선을 보였지만, 예상보다 크게 향상되지는 않았습니다.

여전히 상당한 시간이 소요되고 있었기 때문에, 추가적인 최적화가 필요했습니다.

## 실행 계획 확인

`JOIN` 쿼리의 성능을 더 자세히 분석하기 위해 **`EXPLAIN` 을 사용하여 실행 계획**을 확인했습니다.

![사진20.png](https://i.imgur.com/na8jTNi.png)

1. `care_estimates` 와 `pets` 테이블은 모두 `type = const` 로, PK를 사용하여 매우 효율적으로 조회되고 있습니다.
2. 그러나 **`vets` 테이블은 `type = ALL` 로, 풀 테이블 스캔**을 수행하고 있습니다. 즉, 테이블의 모든 레코드를 검사하고 있습니다.

## 상세 실행 시간 분석

더 상세한 실행 시간 분석을 위해 **`EXPLAIN ANALYZE` 를 실행**한 결과

```sql
-> Nested loop left join  (cost=206669 rows=987105) (actual time=76.9..490 rows=1 loops=1)
    -> Nested loop left join  (cost=107958 rows=987105) (actual time=76.9..490 rows=1 loops=1)
        -> Rows fetched before execution  (cost=0..0 rows=1) (actual time=250e-6..292e-6 rows=1 loops=1)
        -> Filter: (v.account_id = '98980')  (cost=107958 rows=987105) (actual time=76.9..489 rows=1 loops=1)
            -> Table scan on v  (cost=107958 rows=987105) (actual time=0.142..465 rows=1e+6 loops=1)
    -> Constant row from p  (cost=663e-9..663e-9 rows=1) (actual time=0.0142..0.0143 rows=1 loops=1)
```

1. **초기 접근 시간 :** `care_estimates` 테이블에서 `estimate_id` 가 PK이므로 바로 접근 가능하여 `0.000292ms` 소요
2. **테이블 스캔 시간 :** **`vets` 테이블의 100만 개 레코드를 모두 읽는데 `465ms` 소요 ← 주요 병목 지점**
3. **필터링 시간 :** 읽은 데이터에서 조건(`account_id = ‘98980`)에 맞는 레코드를 찾는 데 추가적으로 `24ms(489ms - 465ms)` 소요
4. **결합 시간 :** `pets` 테이블에서 PK로 직접 접근하여 데이터를 결합하는데 `0.0143ms` 소요
5. **총 쿼리 실행 시간 :** 약 `490ms` 소요

분석 결과를 보다시피 다른 작업들에 대해서는 굉장히 빠르지만 **`vets` 테이블에 대해 풀 스캔을 하기 때문에 `465ms` 의 수행 시간이 소요**됩니다.

문제에 대한 원인을 파악하자면, `care_estimates`, `pets` 테이블을 찾아오는 `estimate_id`, `pet_id` 는 모두 해당 테이블의 PK 값입니다. 따라서 `type = const` 로 한 번에 가져오기 때문에 빠른 속도로 데이터를 가져옵니다.

하지만, **`vets` 테이블의 경우 PK 값은 `account_id` 가 아닌 `vet_id` 가 PK 값**이기 때문에 풀 테이블 스캔을 수행하게 됩니다.

따라서, 풀 테이블 스캔을 지양하기 위해 **`account_id` 를 인덱스 컬럼으로 활용**하여 새로운 인덱스를 추가해주기로 판단했습니다.

# 2. 인덱스를 추가한 성능 개선

두 번째 개선 방안으로, **`vets` 테이블의 `account_id` 컬럼에 인덱스를 추가**하여 조인 성능을 개선하기로 했습니다.

```sql
CREATE INDEX idx_vets_account_id ON vets(account_id);
```

![사진21.png](https://i.imgur.com/G7vgi64.png)

인덱스를 생성한 후 동일한 `JOIN` 쿼리를 실행한 결과, **응답 시간이 `50ms` 로 크게 개선**되었습니다. 이는 기존 방식(`569ms`) 대비 약 91%, `JOIN` 만 적용했을 때(`540ms`) 대비 약 90%의 성능 향상을 달성했습니다.

## 실행 계획 확인

인덱스 추가 후의 실행 계획을 다시 확인했습니다.

![사진22.png](https://i.imgur.com/GHJhXek.png)

이제 **`vets` 테이블의 접근 방식이 `type = ALL` 에서 `type = ref` 인덱스 참조로 변경**되었습니다.

이는 인덱스를 통해 해당 `account_id` 값을 가진 레코드를 효율적으로 찾을 수 있게 되었음을 확인할 수 있었습니다.

## 상세 실행 시간 분석

```sql
-> Nested loop left join  (cost=1.63 rows=1) (actual time=0.0339..0.0359 rows=1 loops=1)
    -> Nested loop left join  (cost=0.974 rows=1) (actual time=0.0228..0.0246 rows=1 loops=1)
        -> Rows fetched before execution  (cost=0..0 rows=1) (actual time=208e-6..250e-6 rows=1 loops=1)
        -> Index lookup on v using idx_vets_account_id (account_id='98980')  (cost=0.974 rows=1) (actual time=0.0217..0.0233 rows=1 loops=1)
    -> Constant row from p  (cost=0.655..0.655 rows=1) (actual time=0.0103..0.0103 rows=1 loops=1)
```

1. **초기 접근 시간 :** `care_estimates` 테이블에서 `estimate_id` 가 PK 이므로 바로 접근 가능하여 `0.00025ms` 소요
2. **인덱스 조회 시간 :** `vets` 테이블에서 `idx_vets_account_id` 인덱스를 사용해 `0.0217ms` 에 필요한 레코드를 찾음
3. **데이터 접근 시간 :** 인덱스에서 찾은 레코드의 실제 데이터에 접근하는데 `0.0016ms(0.0233ms - 0.0217ms)` 소요
4. **결합 시간 :** `pets` 테이블에서 PK로 직접 접근하여 데이터를 결합하는데 `0.0103ms` 소요
5. **총 쿼리 실행 시간 :** 약 `0.0359ms` 소요

**인덱스 추가 후 `vets` 테이블 접근 방식이 풀 테이블 스캔에서 Index lookup으로 변경**되었고, 이로 인해 **접근 시간이 매우 단축**되었습니다.

또한, 필터링 작업도 인덱스를 통해 처리되어 별도의 필터링 시간이 필요 없어졌습니다.

# 최종 성능 비교 및 개선 결과

1. 튜닝 전 : 3개의 개별 쿼리, 총 `569ms`
2. `JOIN` 적용 후 : 단일 쿼리, 총 `540ms`
3. 인덱스 추가 후 : 단일 쿼리, 총 `50ms` (약 91% 성능 향상)

# 조인(JOIN)과 인덱스의 관계

**JOIN 쿼리에서 인덱스의 역할은 매우 중요**합니다. JOIN 연산은 두 테이블을 연결하는 과정에서 많은 비용이 발생할 수 있는데, 적절한 인덱스가 있으면 이 비용을 크게 줄일 수 있습니다.

## JOIN 작동 방식

MySQL에서 일반적으로 사용하는 **Nested Loop Join**의 경우, 아래와 같은 과정으로 동작합니다:

1. 먼저 외부 테이블(outer table)에서 레코드를 하나씩 읽습니다.
2. 각 레코드마다 내부 테이블(inner table)에서 조인 조건에 맞는 레코드를 찾습니다.
3. 조건에 맞는 레코드가 있으면 결과 집합에 추가합니다.

이때 **내부 테이블에서 조인 조건에 맞는 레코드를 찾는 과정에서 인덱스가 없다면 매번 테이블 전체를 스캔**해야 하기 때문에 성능이 저하됩니다.

## 인덱스의 영향

- **조인 컬럼에 인덱스가 있는 경우**: 해당 값을 가진 레코드를 빠르게 찾을 수 있어 조인 성능이 향상됩니다.
- **조인 컬럼에 인덱스가 없는 경우**: 매번 테이블 풀 스캔이 발생하여 성능이 저하됩니다.

이번 사례에서도 `account_id` 컬럼에 인덱스를 추가함으로써 `vets` 테이블 접근 방식이 풀 테이블 스캔(ALL)에서 인덱스 조회(ref)로 바뀌게 되어 실행 시간이 크게 단축되었습니다.

# 결론

이번 SQL 튜닝을 통해 대기 진료 견적서 상세 조회 API의 응답 시간을 **569ms에서 50ms로 약 91%** 단축시켰습니다. **JOIN을 통한 단일 쿼리 방식으로 변경하고, 핵심 테이블에 적절한 인덱스를 추가**함으로써 성능을 크게 개선할 수 있었습니다.

특히 **외래 키로 사용되는 컬럼이나 조인 조건으로 자주 사용되는 컬럼에 인덱스를 추가**하는 것이 중요함을 확인했습니다. 이러한 최적화는 데이터베이스의 크기가 커질수록 더 큰 성능 향상을 가져올 수 있습니다.