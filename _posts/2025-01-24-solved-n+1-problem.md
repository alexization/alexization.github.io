---
header:
   teaser: /assets/images/logo.png

title: "미용사 및 병원 검색 API의 N+1 문제 해결"
excerpt: "미용사 및 병원 검색 API에서 발생한 N+1 문제를 분석하고, Fetch Join의 한계를 극복하여 Native Query를 활용해 성능을 최적화한 과정을 다룹니다."
categories:
  - Backend
tags:
   - N+1 문제
   - JPA
   - 쿼리 최적화
   - Spring Data JPA
  
toc_label: "미용사 및 병원 검색 API의 N+1 문제 해결"
toc: true
toc_sticky: true

date: 2025-01-24
last_modified_at: 2025-01-24 
---

댕글 서비스에서는 사용자가 미용사와 병원을 검색할 수 있는 API를 제공하고 있습니다. 이 API는 세 가지 주요 검색 조건을 지원합니다.

1. 주소 `address` 기반 검색
2. 미용사/병원 이름 `name` 기반 검색
3. 뱃지 `badge` (#대형견, #중형견, #노견 등) 기반 검색

![댕글 서비스 검색 화면](https://i.imgur.com/iitj66f.png)

댕글 서비스 검색 화면

# 데이터베이스 구조

문제를 이해하기 위해 먼저 관련 테이블의 구조를 살펴보겠습니다. 미용사 테이블 `groomers` 은 뱃지 테이블 `grooming_badges` 과 자격증 테이블 `groomer_business_licenses` 과 1:N 관계를 가지고 있습니다.

![데이터베이스 구조](https://i.imgur.com/s1cFX5h.png)

데이터베이스 구조

```java
@Entity
@Table(name = "groomers")
public class GroomerJpaEntity {
    // ... 기본 필드 생략 ...
    
    @ElementCollection
    @CollectionTable(name = "grooming_badges", joinColumns = @JoinColumn(name = "groomer_id"))
    @Column(name = "grooming_badge")
    @Enumerated(EnumType.STRING)
    private List<GroomingBadge> badges;
    
    @OneToMany(mappedBy = "groomer", fetch = FetchType.LAZY)
    private List<LicenseJpaEntity> licenses;
    
    @OneToMany(mappedBy = "groomer", fetch = FetchType.LAZY)
    private List<GroomerKeywordJpaEntity> keywords;
    
    // ... 메서드 생략 ...
    
    public Groomer toModel() {
        return Groomer.builder()
                .groomerId(groomerId)
                .accountId(accountId)
                .daengleMeter(daengleMeter)
                .instagramId(instagramId)
                .name(name)
                .phoneNumber(phoneNumber)
                .imageUrl(imageUrl)
                .email(email)
                .address(address)
                .detailAddress(detailAddress)
                .shopId(shopId)
                .shopName(shopName)
                .introduction(introduction)
                .businessLicenses(businessLicenses)
                .licenses(licenses.stream()
                        .map(LicenseJpaEntity::toModel)
                        .toList())
                .badges(badges)
                .keywords(keywords.stream()
                        .map(GroomerKeywordJpaEntity::toModel)
                        .toList())
                .build();
    }
}
```

# 기존 검색 API 구현과 N+1 문제 발견

*아래는 미용실 기준으로 분석했으며, 미용실과 병원 모두 같은 방식으로 동작합니다.*

> 검색 API를 효율적으로 구현하기 위해 Spring Data JPA의 **페이징 기능**을 활용했습니다. 프론트엔드에서는 무한 스크롤 방식으로 데이터를 표시하며, 한 번의 API 호출로 6개의 데이터를 가져오도록 설정했습니다.
>

기존 API 코드는 다음과 같았습니다.

```java
@Query("SELECT g FROM Groomers g " +
       "WHERE (:address IS NULL OR :address = '' OR g.address LIKE CONCAT('%', :address, '%')) " +
       "AND (:name IS NULL OR :name = '' OR g.name LIKE CONCAT('%', :name, '%')) " +
       "AND (:badge IS NULL OR :badge MEMBER OF g.badges)")
Page<GroomerJpaEntity> findGroomersByKeywords(
    @Param("address") String address,
    @Param("name") String name,
    @Param("badge") GroomingBadge badge,
    Pageable pageable
);
```

*위 코드의 `MEMBER OF` 는 Hibernate 에서 컬렉션 필드에 특정 값이 포함되어 있는지 확인하는 목적으로 사용했습니다.*

## N+1 문제 발생 원인 분석

> 댕글 프로젝트는 도메인 주도 설계(DDD) 원칙을 따르는 멀티 모듈 구조로 구성되어 있습니다.
>
- **`Domain` 모듈 :** 순수 자바 객체(POJO)인 `Groomer, License, GroomingBadge` 등을 포함
- **`Persistence` 모듈 :** JPA 엔티티 `GroomerJpaEntity, LicenseJpaEntity` 등과 같은 저장소(Repository) 구현체
- **`User/Groomer/Vet` API 모듈 :** 서비스 및 컨트롤러 로직

이 구조에서 N+1 문제가 발생하는 원인으로는

1. 최초 쿼리(1)
    - `findGroomersByKeywords()` 메서드를 통해 조건에 맞는 `GroomerJpaEntity` 객체들을 조회합니다. 이때 연관 컬렉션 `badges, licenses, keywords` 은 모두 지연 로딩(LAZY)으로 설정되어 있기 때문에 프록시 객체로만 초기화 됩니다.
2. 도메인 변환 중 추가 쿼리(N)

    ```java
    // toModel() 메서드에서 연관 관계에 접근
    .licenses(licenses.stream()
            .map(LicenseJpaEntity::toModel)
            .toList())
    .badges(badges)
    .keywords(keywords.stream()
            .map(GroomerKeywordJpaEntity::toModel)
            .toList())
    ```

    - JPA 엔티티 객체를 순수 자바 객체로 변환하는 `toModel()` 메서드에서 `licenses, badges, keywords` 컬렉션에 최초로 접근하게 되어 JPA가 추가 쿼리를 실행합니다.

이로 인해 조회된 각 미용사 `GroomerJpaEntity` 에 대해 이 과정이 반복되어 N+1 문제가 발생합니다.

실제 Hibernate 로그에서는 다음과 같은 패턴의 쿼리가 발생합니다.

```sql
-- 메인 쿼리 (1) : 미용사 정보 조회
Hibernate:
		select 
				gje1_0.groomer_id,gje1_0.account_id,gje1_0.address,gje1_0.daengle_meter,gje1_0.detail_address,gje1_0.email,gje1_0.image_url,gje1_0.instagram_id,gje1_0.introduction,gje1_0.name,gje1_0.phone_number,gje1_0.shop_id,gje1_0.shop_name 
		from 
				groomers gje1_0 
		where 
				(? is null or ?='' or gje1_0.address like concat('%',?,'%') escape '') 
				and (? is null or ?='' or gje1_0.name like concat('%',?,'%') escape '') 
				and (? is null or ?='' or ? in 
						(select 
								b1_0.grooming_badge 
						from 
								grooming_badges b1_0 
						where 
								gje1_0.groomer_id=b1_0.groomer_id
						)) 
		limit ?

-- 라이센스 조회 쿼리들 (N) : 각 미용사당 1회씩 추가 발생
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?

-- 뱃지 조회 쿼리들 (N) : 각 미용사당 1회씩 추가 발생
Hibernate: select b1_0.groomer_id,b1_0.grooming_badge from grooming_badges b1_0 where b1_0.groomer_id=?
Hibernate: select b1_0.groomer_id,b1_0.grooming_badge from grooming_badges b1_0 where b1_0.groomer_id=?
Hibernate: select b1_0.groomer_id,b1_0.grooming_badge from grooming_badges b1_0 where b1_0.groomer_id=?
Hibernate: select b1_0.groomer_id,b1_0.grooming_badge from grooming_badges b1_0 where b1_0.groomer_id=?
Hibernate: select b1_0.groomer_id,b1_0.grooming_badge from grooming_badges b1_0 where b1_0.groomer_id=?
Hibernate: select b1_0.groomer_id,b1_0.grooming_badge from grooming_badges b1_0 where b1_0.groomer_id=?
```

문제는 검색 결과 화면에서는 미용사의 기본 정보(ID, 이름, 프로필 이미지)와 뱃지 정보만 필요한데, 현재 구현된 `toModel()` 메서드를 통해 **모든 연관 관계에 접근하면서 검색 API에 실제로 필요하지 않은 데이터까지 모두 로드**하게 된다는 점입니다.

이러한 N+1 문제는 데이터가 많아질수록 성능 저하가 심각해지며, 데이터베이스와 애플리케이션 서버에 불필요한 부하를 주기 때문에 이 문제를 해결할 필요가 있었습니다.

# 해결 접근법 탐색

## Fetch Join 시도

> Fetch Join이란 JPQL로 특정 엔티티를 조회할 때 연관된 엔티티 혹은 컬렉션을 즉시 로딩과 같이 한 번에 함께 조회하는 기능입니다.
>

먼저, **연관 데이터를 한 번의 쿼리로 가져오도록** Fetch Join을 시도했습니다.

```java
@Query("SELECT g FROM Groomers g " +
        "LEFT JOIN FETCH g.badges b " +
        "LEFT JOIN FETCH g.licenses l " +
        "WHERE (:address IS NULL OR :address = '' OR g.address LIKE CONCAT('%', :address, '%')) " +
        "AND (:name IS NULL OR :name = '' OR g.name LIKE CONCAT('%', :name, '%')) " +
        "AND (:badge IS NULL OR :badge MEMBER OF g.badges)")
Page<GroomerJpaEntity> findGroomersByKeywords(
        @Param("address") String address,
        @Param("name") String name,
        @Param("badge") GroomingBadge badge,
        Pageable pageable
);
```

그러나 이 접근법은 기대했던 결과와는 달리 다음과 같은 오류와 경고를 발생시켰습니다.

```java
org.hibernate.loader.MultipleBagFetchException: cannot simultaneously fetch multiple bags: 
[ddog.persistence.rdb.jpa.entity.GroomerJpaEntity.badges, ddog.persistence.rdb.jpa.entity.GroomerJpaEntity.licenses]

2025-01-24T06:06:47.103+09:00 WARN 47838 --- [nio-8080-exec-4] org.hibernate.orm.query : HHH90003004: 
firstResult/maxResults specified with collection fetch; applying in memory!
```

1. **`MultipleBagFetchException`**

   Hibernate에서는 한 번의 쿼리에서 여러 개의 `@OneToMany` 관계를 Bag(List, Set 등의 컬렉션 타입)으로 Fetch Join하는 것을 허용하지 않습니다.

   여러 Bag을 Fetch Join하면 SQL 결과가 조인으로 인해 **카티션 곱 형태**로 늘어나고, 중복된 데이터를 처리해야 하기 때문에 Hibernate는 이를 허용하지 않습니다.

2. **`HHH90003004` 경고 (페이징 경고)**

   Hibernate는 컬렉션 Fetch Join과 페이징을 함께 사용할 때 **메모리에서 페이징을 적용**하게 됩니다.

   이는 **메모리 사용량 증가와 성능 문제를 유발**할 수 있기 때문에 경고 문구를 보여주는 것입니다.

   즉, `1:N, N:N` 관계의 컬렉션을 Fetch Join하면서 동시에 페이징을 사용하게 된다면, 데이터가 많은 경우 `OutOfMemoryError` 가 발생할 가능성이 높습니다.


## 데이터 단계적 로드 시도

> Fetch Join 문제를 해결하기 위해 쿼리를 두 단계로 나눠 **데이터를 단계적으로 로드하는 방식으로 변경**했습니다.
>
1. `Groomers` 엔티티만 페이징

   첫 번째 단계에서 페이징 처리를 하고, `Groomers` 엔티티의 ID 목록을 가져옵니다.

    ```java
    @Query("SELECT g.id FROM Groomers g " +
           "WHERE (:address IS NULL OR :address = '' OR g.address LIKE CONCAT('%', :address, '%')) " +
           "AND (:name IS NULL OR :name = '' OR g.name LIKE CONCAT('%', :name, '%')) " +
           "AND (:badge IS NULL OR :badge MEMBER OF g.badges)")
    Page<Long> findPagedGroomerIds(
            @Param("address") String address,
            @Param("name") String name,
            @Param("badge") GroomingBadge badge,
            Pageable pageable
    );
    ```

2. 연관 데이터 Fetch Join

   첫 번째 단계에서 가져온 `Groomers` 의 ID 목록을 기준으로 연관 데이터를 가져옵니다.

    ```java
    @Query("SELECT g FROM Groomers g " +
           "LEFT JOIN FETCH g.badges b " +
           "WHERE g.id IN :ids")
    List<GroomerJpaEntity> findGroomersWithDetails(@Param("ids") List<Long> ids);
    ```


이 접근법으로 실행된 쿼리를 보면

```sql
Hibernate:
		select 
				gje1_0.groomer_id,gje1_0.account_id,gje1_0.address,gje1_0.daengle_meter,gje1_0.detail_address,gje1_0.email,gje1_0.image_url,gje1_0.instagram_id,gje1_0.introduction,gje1_0.name,gje1_0.phone_number,gje1_0.shop_id,gje1_0.shop_name 
		from 
				groomers gje1_0 
		where 
				(? is null or ?='' or gje1_0.address like concat('%',?,'%') escape '') 
				and (? is null or ?='' or gje1_0.name like concat('%',?,'%') escape '') 
				and (? is null or ?='' or ? in 
						(select 
								b1_0.grooming_badge 
						from 
								grooming_badges b1_0 
						where 
								gje1_0.groomer_id=b1_0.groomer_id
						)) 
		limit ?
		
Hibernate: 
		select 
				gje1_0.groomer_id,gje1_0.account_id,gje1_0.address,b1_0.groomer_id,b1_0.grooming_badge,gje1_0.daengle_meter,gje1_0.detail_address,gje1_0.email,gje1_0.image_url,gje1_0.instagram_id,gje1_0.introduction,gje1_0.name,gje1_0.phone_number,gje1_0.shop_id,gje1_0.shop_name 
		from 
				groomers gje1_0 
		left join 
				grooming_badges b1_0 
						on gje1_0.groomer_id=b1_0.groomer_id 
		where gje1_0.groomer_id in (?,?,?,?,?,?)
		
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
Hibernate: select l1_0.account_id,l1_0.license_id,l1_0.acquisition_date,l1_0.image_url,l1_0.name from licenses l1_0 where l1_0.account_id=?
```

두 가지 단계로 나누어 Fetch Join 을 사용했을 때, `badges` 에 대한 **추가적인 쿼리가 더이상 발생하지 않는다는 것**을 확인할 수 있었지만, `licenses` 에 대한 추가적인 쿼리는 계속해서 수행하고 있었습니다.

이 시점에서 생각해본 것은, 검색 결과에 필요한 데이터는 **미용사 프로필 사진 `image_url` , 이름 `name`, 태그 정보 `grooming_badge`, 미용사 계정ID `account_id` 뿐**이며, 미용 자격증 정보나 기타 데이터는 실제로 필요하지 않았습니다.

다시 말해, 굳이 `Groomers` 엔티티 객체를 모두 가져올 필요 없이 **결과에 필요한 데이터만 로드**한다면, 메모리와 네트워크 사용량을 줄이고 Hibernate의 Fetch Join 제한을 완전히 피할 수 있습니다.

## Native Query를 활용한 해결책

`Groomers` 엔티티를 전부 가져오는 대신 **검색 결과에 필요한 데이터만을 가져오도록** 변경하였습니다.

처음에는 Spring Data JPA 에서 제공하는 클래스 기반의 Projection 을 사용하려 했으나, JPQL에서 DTO 생성자와 컬렉션 필드인 `List<GroomingBadge>` 와 매핑 과정이 오히려 번거롭게 느껴졌습니다.

그래서 Native Query를 사용하여 가져온 결과 `List<Object[]>` 를 수동으로 매핑하는 방식을 선택했습니다.

`GroomerJpaRepository.java`

```java
@Query(value =
        "SELECT g.account_id, g.name, g.image_url, b.grooming_badge " +
        "FROM groomers g " +
        "LEFT JOIN grooming_badges b ON g.groomer_id = b.groomer_id " +
        "WHERE g.groomer_id IN :ids", nativeQuery = true)
List<Object[]> findGroomersWithDetails(@Param("ids") List<Long> ids);
```

`SearchGroomerResultDto.java`

```java
@Getter
public class SearchGroomerResultDto {
    private final Long accountId;
    private final String name;
    private final String imageUrl;
    private final List<GroomingBadge> badges;

    public SearchGroomerResultDto(Long accountId, String name, String imageUrl, List<GroomingBadge> badges) {
        this.accountId = accountId;
        this.name = name;
        this.imageUrl = imageUrl;
        this.badges = badges;
    }
}
```

`GroomerRepository.java`

```java
@Override
public List<SearchGroomerResultDto> findGroomersByKeywords(String address, String name, GroomingBadge badge, Pageable pageable) {
    List<Long> groomerIds = groomerJpaRepository.findPagedGroomerIds(address, name, badge, pageable).getContent();
    List<Object[]> groomersWithDetails = groomerJpaRepository.findGroomersWithDetails(groomerIds);

    Map<Long, SearchGroomerResultDto> dtoMap = new HashMap<>();

    for (Object[] groomerWithDetail : groomersWithDetails) {
        Long accountId = ((Number) groomerWithDetail[0]).longValue();
        String groomerName = (String) groomerWithDetail[1];
        String imageUrl = (String) groomerWithDetail[2];

        if (!dtoMap.containsKey(accountId)){
            dtoMap.put(accountId, new SearchGroomerResultDto(accountId, groomerName, imageUrl, new ArrayList<>()));
        }

        if (groomerWithDetail[3] == null) {
            continue;
        }

        GroomingBadge groomingBadge = GroomingBadge.valueOf((String) groomerWithDetail[3]);
        List<GroomingBadge> groomingBadges = dtoMap.get(accountId).getBadges();
        groomingBadges.add(groomingBadge);
        dtoMap.put(accountId, new SearchGroomerResultDto(accountId, groomerName, imageUrl, groomingBadges));
    }

    return new ArrayList<>(dtoMap.values());
}
```

Native Query 를 통해 가져온 결과 `List<Object[]>` 를 DTO 객체 `SearchGroomerResultDto`로 수동 매핑하는 과정이 필요했습니다.

Native Query 수행 결과는 **한 행씩 가져오기 때문에** `List<GroomingBadge>` 를 직접 구성하기가 어려웠습니다.

따라서, **HashMap 자료구조**를 활용하여 미용사의 계정ID `account_id` 를 HashMap의 Key로 설정하여 동일한 `account_id` 를 가지는 데이터가 있으면 해당 Value에 있는 `List<GroomingBadge>` 에 `GroomingBadge` 를 추가하는 방식으로 구현했습니다.

Native Query를 적용한 검색 API를 수행시켜봤습니다.

```sql
-- 1단계 : ID 페이징 쿼리
Hibernate: 
		select 
				gje1_0.groomer_id 
		from 
				groomers gje1_0 
		where 
				(? is null or ?='' or gje1_0.address like concat('%',?,'%') escape '') 
				and (? is null or ?='' or gje1_0.name like concat('%',?,'%') escape '') 
				and (? is null or ? in (select b1_0.grooming_badge from grooming_badges b1_0 where gje1_0.groomer_id=b1_0.groomer_id)) 
		limit ?
	
-- 2단계 : 필요한 데이터만 조회	
Hibernate: 
		SELECT 
				g.account_id, g.name, g.image_url, b.grooming_badge 
		FROM 
				groomers g 
		LEFT JOIN 
				grooming_badges b 
						ON g.groomer_id = b.groomer_id 
		WHERE 
				g.groomer_id IN (?,?,?,?,?,?)
```

쿼리 실행 과정을 보면, 첫 번째 단계에서 페이징을 수행한 후 두 번째 단계에서 앞서 가져온 `groomer_id` 를 기준으로 **검색 결과에 필요한 데이터만 가져오고 있습니다.** 이로써 **추가 쿼리 없이 예측한 결고대로 수행**하고 있음을 확인할 수 있었습니다.

이로써, 기존 검색 API 에서 주소 `address` , 미용사 이름 `name` , 뱃지 `badge` 를 기준으로 미용사 정보를 가져오는 과정에서 발생하는 N+1 문제를 해결했습니다.

N+1문제를 해결함으로써 추가적인 쿼리가 발생하지 않아 **데이터베이스 쿼리 성능 향상**을 기대할 수 있었으며, 데이터 양이 많아질수록 쿼리 횟수와 실행 시간이 기하급수적으로 증가하는 문제를 해결하며 **데이터 증가에 따라 발생하는 성능 문제를 사전에 방지**할 수 있었습니다.

# 참고 자료

---

[JPA Pagination, 그리고 N + 1 문제](https://tecoble.techcourse.co.kr/post/2021-07-26-jpa-pageable/)