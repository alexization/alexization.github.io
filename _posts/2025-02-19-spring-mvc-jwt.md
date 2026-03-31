---
header:
  teaser: /assets/images/logo.png
  og_image: "https://cdn.imgchest.com/files/4291300b4fb9.png"

title: "Spring MVC의 진입점을 파고들어 개선한 JWT 토큰 처리 시스템"
excerpt: "반복되는 JWT 토큰 검증 코드를 제거하기 위해 Spring MVC의 HandlerInterceptor와 ArgumentResolver를 활용한 토큰 처리 시스템 구축 과정을 다룹니다."
categories:
 - Backend
tags:
  - Spring
  - JWT
  - 토큰 처리
  - 인증 시스템
 
toc_label: "Spring MVC JWT 토큰 처리 시스템"
toc: true
toc_sticky: true

date: 2025-02-19
last_modified_at: 2025-02-19 
---

![mainImage](https://cdn.imgchest.com/files/4291300b4fb9.png)

# 시작은 불편함에서

멀티 모듈로 구성된 댕글 서비스에서 Auth 모듈은 **사용자 인증과 인가를 담당하는 핵심 모듈**입니다.

Spring Security + JWT + OAuth2.0을 기반으로 구축된 이 모듈은 처음에는 단순히 “동작하는 코드”를 만드는 데 초점을 맞췄습니다.

초기 구현에서는 로그인 성공 시 사용자 정보가 담긴 JWT 토큰을 생성하고, 보호된 엔드포인트에 접근할 때마다 이 토큰을 검증하는 방식이었습니다. 그러나 REST API를 개발하면서 **사용자의 인증 상태나 권한을 확인해야 하는 엔드포인트**가 늘어났고, 각 컨트롤러마다 토큰 처리 코드가 반복되었습니다.

## 초기 구현 방식

```java
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/user")
public class AccountController {
    
    private final JwtTokenProvider jwtTokenProvider;
    private final AccountService accountService;

    @GetMapping("/info")
    public CommonResponseEntity<ProfileInfo.UpdatePage> getUserProfileInfo(HttpServletRequest request) {
        // 1. JWT 토큰 추출
        String token = request.getHeader("Authorization");
        if (token == null || !token.startsWith("Bearer ")) {
            throw new AuthException(AuthExceptionType.INVALID_TOKEN);
        }
        token = token.substring(7);

        // 2. 토큰 검증
        if (!jwtTokenProvider.validateToken(token)) {
            throw new AuthException(AuthExceptionType.INVALID_TOKEN);
        }

        // 3. 토큰에서 사용자 정보 추출
        Claims claims = jwtTokenProvider.parseClaims(token);
        Long userId = Long.parseLong(claims.getSubject());

        // 4. 비즈니스 로직 수행
        return success(accountService.getUserProfileInfo(userId));
    }
}
```

토큰 검증 코드가 API 엔드포인트마다 반복되다 보니, 토큰 처리 방식을 조금만 수정하려고 해도 여러 컨트롤러를 일일이 찾아다니며 고쳐야 했습니다.

이런 반복 작업을 하면서 자연스럽게 **‘HTTP 요청이 들어오는 첫 시점에서 토큰을 한 번만 처리할 수 있지 않을까?’** 라는 생각이 들었습니다.

Spring Security의 표준 패턴을 따르는 것도 방법이었지만, 이번 기회에 **Spring MVC의 요청 처리 구조를 더 깊이 이해**하고 싶었습니다. Spring 프레임워크가 요청을 어떻게 처리하는지, 그 과정에서 제가 활용할 수 있는 부분은 무엇인지 찾아보기로 했습니다.

# Spring MVC 요청 처리 구조 탐색

> 처음에는 `DispatcherServlet`을 그저 “요청을 알맞은 컨트롤러로 전달해주는 무언가” 정도로만 이해하고 있었습니다.
하지만 요청 처리 구조를 파고들면서, **`DispatcherServlet`이 프론트 컨트롤러 패턴의 구현체이며, 요청 처리 과정에서 다양한 확장 포인트를 제공한다는 것을 알게 되었습니다.**
>

실제 `DispatcherServlet`의 `doDispatch` 메소드를 살펴보면,

```java
protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
      // 1. 핸들러 조회
      HandlerExecutionChain mappedHandler = getHandler(request);
      
      // 2. 핸들러 어댑터 조회
      HandlerAdapter ha = geetHandlerAdapter(mappedHandler.getHandler());
      
      // 3. 인터셉터 전처리
      if (!mappedHandler.applyPreHandle(request, response)) {
      		return;
      }
      
      // 4. 핸들러 실행
      ModelAndView mv = ha.handle(request, response, mappedHandler.getHandler());
      
      // 5. 인터셉터 후처리
      mappedHandler.applyPostHandle(request, response, mv);
      
      // 6. 뷰 렌더링
      processDispatchResult(request, response, mappedHandler, mv, dispatchException);
}
```

코드를 보면 알 수 있듯이, 모든 요청이 컨트롤러에 도달하기 전 **인터셉터 전처리** 단계를 거칩니다. 바로 이 지점이 JWT 토큰을 처리하기에 적합한 위치라고 판단했습니다.

## Spring MVC의 상세 요청 처리 흐름 정리

> 더 자세히 알아보기 위해 Spring MVC의 전체 요청 처리 흐름을 단계별로 살펴봤습니다.
>

```
[클라이언트 요청]        ← HTTP 요청 시작
         ↓
[DispatcherServlet]  ← Front Controller (모든 요청의 진입점)
         ↓
[HandlerMapping]     ← URL에 맞는 컨트롤러 검색
         ↓
[HandlerInterceptor] ← 전처리(preHandle), 여기서 JWT 토큰 검증 !!
         ↓
[HandlerAdapter]     ← 핸들러 메소드 호출 준비 (컨트롤러 실행 준비)
         ↓
[ArgumentResolver]   ← 메소드 파라미터 준비, 검증된 토큰 정보를 파라미터로 변환 !!
         ↓
[Controller]         ← 실제 비즈니스 로직 처리
         ↓
[HandlerInterceptor] ← 후처리(postHandle)
         ↓
[ViewResolver]       ← View 결정
         ↓
[View]               ← 응답 생성
         ↓
[HandlerInterceptor] ← 완료 처리(afterCompletion)
         ↓
[클라이언트 응답]
```

특히, 이 흐름에서 주목한 부분은 **HandlerInterceptor와 ArgumentResolver**였습니다.

인터셉터는 **컨트롤러 실행 전에 공통 작업을 처리할 수 있는 위치**이고, ArgumentResolver는 **컨트롤러에 전달될 파라미터를 동적으로 만들어내는 위치입니다.**

### HandlerInterceptor

> Spring MVC의 `HandlerInterceptor` 는 컨트롤러 실행 전후에 공통 작업을 처리할 수 있게 해주는 인터페이스입니다.
>

```java
public interface HandlerInterceptor {
		// 컨트롤러 실행 전
    default boolean preHandle(HttpServletRequest request, 
                            HttpServletResponse response, 
                            Object handler) throws Exception {
        return true;
    }
    
    // 컨트롤러 실행 후, View 렌더링 전
    default void postHandle(HttpServletRequest request, 
                          HttpServletResponse response, 
                          Object handler,
                          ModelAndView modelAndView) throws Exception {
    }
    
    // View 렌더링 후
    default void afterCompletion(HttpServletRequest request, 
                               HttpServletResponse response, 
                               Object handler, 
                               Exception ex) throws Exception {
    }
}
```

특히 **`preHandle` 메소드는 컨트롤러 실행 전에 호출되므로, JWT 토큰 검증에 완벽하게 맞는 위치**입니다.

여기서 토큰을 검증하고 그 결과를 `request attribute` 에 저장하면, 이후 처리 단계에서 토큰 정보를 사용할 수 있습니다.

### HandlerMethodArgumentResolver

> 검증된 토큰 정보를 컨트롤러에서 편리하게 사용할 수 있도록 `ArgumentResolver` 를 활용했습니다.
>

```java
public interface HandlerMethodArgumentResolver {
    boolean supportsParameter(MethodParameter parameter);
    
    Object resolveArgument(MethodParameter parameter, 
                         ModelAndViewContainer mavContainer,
                         NativeWebRequest webRequest, 
                         WebDataBinderFactory binderFactory) throws Exception;
}
```

해당 인터페이스를 구현하면,

- `supportsParameter` : 어떤 파라미터를 처리할지 결정
- `resolveArgument` : 실제 파라미터 값을 생성

인터셉터에서 `request attribute` 에 저장한 토큰 정보를 해당 메서드에서 가져와 컨트롤러 파라미터로 변환할 수 있습니다.

# JWT 토큰 처리 시스템 구현

## @AuthPayload 어노테이션 구현

가장 먼저, 인증이 필요한 컨트롤러 파라미터를 명시적으로 표시할 `@AuthPayload` 어노테이션을 만들었습니다.

```java
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface AuthPayload {
		boolean required() default true;
}
```

1. **`@Target(ElementType.PARAMETER)` :** 메소드 파라미터에만 사용되도록 제한
2. **`Retention(RetentionPolicy.RUNTIME)` :** 런타임에도 어노테이션 정보가 유지되어 리플렉션으로 접근 가능
3. **required 속성** **:** 토큰이 필수인지 여부 지정
    - `true(기본값)` : 유효한 토큰이 없으면 예외 발생
    - `false` : 토큰이 없어도 접근 가능, 비로그인 사용자 처리 시 사용

## JWT 인터셉터 구현

모든 요청에 대한 JWT 토큰을 처리할 인터셉터를 구현했습니다.

```java
@Component
@RequiredArgsConstructor
public class JwtAuthInterceptor implements HandlerInterceptor {

    private final JwtTokenProvider jwtTokenProvider;
    public static final String PAYLOAD_ATTRIBUTE = "auth_payload";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String token = resolveToken(request);

        /* 토큰이 없는 경우는 비회원으로 간주하며, null 값을 넣어준다. */
        if (token == null) {
            request.setAttribute(PAYLOAD_ATTRIBUTE, new PayloadDto(null, null, null));
            return true;
        }

        if (jwtTokenProvider.validateToken(token)) {
            Claims claims = jwtTokenProvider.parseClaims(token);
            String[] subjects = claims.getSubject().split(",");
            String email = subjects[0];
            Long accountId = Long.valueOf(subjects[1]);
            Role role = fromString(claims.get("auth", String.class).substring(5));

            request.setAttribute(PAYLOAD_ATTRIBUTE, new PayloadDto(accountId, email, role));
        }

        return true;
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");

        if (bearerToken == null) {
            return null;
        }

        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }

        throw new AuthException(AuthExceptionType.UNSUPPORTED_TOKEN);
    }

    private Role fromString(String roleString) {
        for (Role role : Role.values()) {
            if (role.name().equalsIgnoreCase(roleString)) {
                return role;
            }
        }
        throw new RuntimeException("Invalid role : " + roleString);
    }
}
```

1. **토큰 추출 :** 요청 헤더에서 `Bearer` 토큰 추출
2. **유효성 검증 :** 토큰 유효성 검사 수행
3. **정보 추출 :** 토큰에서 사용자 ID, 이메일, 역할 추출
4. **정보 저장 :** 추출한 정보를 `PayloadDto` 객체로 변환하여 `request attribute` 에 저장

<aside>

### 요청 별 독립성 보장

인터셉터를 구현하면서 “여러 요청이 동시에 들어올 때 `request attribute` 가 서로 간섭하지 않을까?”라는 의문이 들었습니다.

**Spring MVC에서 각 HTTP 요청은 별도의 스레드에서 처리되며, 각 스레드는 자신만의 `HttpServletRequest` 객체를 가집니다.** 이는 Thread-local 스토리지와 유사한 개념으로 동작합니다.

1. 사용자 A가 요청을 보내는 경우

    ```java
    HttpServletRequest requestA = // 사용자 A의 새로운 requeset 객체
    requestA.setAttribute("auth_payload", payloadDto);
    ```

2. 동시에 사용자 B가 요청을 보내는 경우

    ```java
    HttpServletRequest requestB = // 사용자 B의 새로운 requeset 객체
    requestB.setAttribute("auth_payload", payloadDto);
    ```


- 사용자 A의 요청과 관련된 데이터는 사용자 A의 request 객체에만 존재
- 사용자 B의 요청과 관련된 데이터는 사용자 B의 request 객체에만 존재
- 서로 다른 요청 간에는 데이터가 공유되거나 덮어씌워지지 않음

→ 따라서 `request.setAttribute()` 를 통한 데이터 저장이 멀티스레드 환경에서도 안전하게 동작합니다.

</aside>

### 비로그인 사용자 처리 메커니즘

```java
/* 토큰이 없는 경우는 비회원으로 간주하며, null 값을 넣어준다. */
if (token == null) {
    request.setAttribute(PAYLOAD_ATTRIBUTE, new PayloadDto(null, null, null));
    return true;
}
```

인터셉터 구현 코드에서 **토큰이 없는 경우에도 예외를 던지지 않고, 대신 `null` 값을 가진 `PayloadDto` 객체를 생성해 `request attribute` 에 저장**합니다.

이를 통해 `@AuthPayload(required = false)` 로 설정하면, 해당 엔드포인트는 토큰이 없어도 접근 가능하며 **로그인/비로그인 상태를 구분하여 다른 결과를 제공**할 수 있습니다.

컨트롤러에서는 `payloadDto.getAccountId() != null` 과 같은 간단한 조건문으로 로그인 여부를 확인할 수 있도록 했습니다.

## ArgumentResolver 구현

인터셉터에서 검증한 토큰 정보를 컨트롤러의 파라미터로 자동 변환하는 `ArgumentResolver` 구현했습니다.

```java
@Component
@RequiredArgsConstructor
public class PayloadArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType().equals(PayloadDto.class)
                && parameter.hasParameterAnnotation(AuthPayload.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        
        HttpServletRequest request = (HttpServletRequest) webRequest.getNativeRequest();
        PayloadDto payload = (PayloadDto) request.getAttribute(JwtAuthInterceptor.PAYLOAD_ATTRIBUTE);

        AuthPayload authPayload = parameter.getParameterAnnotation(AuthPayload.class);
        if (authPayload.required() && (payload == null || payload.getAccountId() == null)) {
            throw new AuthException(AuthExceptionType.INVALID_TOKEN);
        }

        return payload;
    }
}
```

1. **`supportsParameter`** : 파라미터 지원 여부 확인
    - `@AuthPayload` 어노테이션이 붙은 `PayloadDto` 타입 파라미터만 처리하도록 정의
    - 다른 파라미터는 기본 `Resolver`가 처리
2. **`resolveArgument`** : 값 변환 및 검증
    - `request attribute` 에서 저장된 `PayloadDto` 객체 가져오기
    - `required` 속성에 따른 유효성 검증 → `required = true` 인 경우, 유효한 토큰 정보가 없으면 예외 발생
    - 검증된 `PayloadDto` 객체 반환

## Spring MVC 설정

마지막으로, 구현한 컴포넌트들을 Spring MVC 설정에 등록했습니다.

```java
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final PayloadArgumentResolver payloadArgumentResolver;
    private final JwtAuthInterceptor jwtAuthInterceptor;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(payloadArgumentResolver);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(jwtAuthInterceptor)
                .excludePathPatterns(
				                // 공개 API 경로
                        "/api/*/kakao",
                        "/api/*/refresh-token",
                        // 회원가입 관련 API
                        "/api/user/available-nickname",
                        "/api/user/breed/list",
                        "/api/user/join-with-pet",
                        "/api/user/join-without-pet",
                        "/api/groomer/join",
                        "/api/vet/join"
                );
    }
}
```

1. ArgumentResolver 등록 : 커스텀 `PayloadArgumentResolver` 를 Spring의 기본 `ArgumentResolver` 목록에 추가
2. 인터셉터 등록 : JWT 인터셉터를 등록하고, 인증이 필요 없는 경로는 제외 패턴으로 설정

특히, `excludePathPatterns` 를 통해 로그인, 회원가입 등 인증이 필요 없는 경로를 인터셉터 처리에서 제외시켰습니다.

## Controller 실제 사용

```java
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/user")
public class DetailInfoController {
    private final DetailInfoService detailInfoService;

		/*
		* 비로그인 사용자 : payloadDto.getAccountId() == null
		* 로그인 사용자 : payloadDto.getAccountId() != null
		*/
    @GetMapping("/shops")
    public CommonResponseEntity<DetailResp> getBeautyShopsList(@AuthPayload(required = false) PayloadDto payloadDto,
                                                               @RequestParam(required = false) String address,
                                                               @RequestParam(defaultValue = "0") int page,
                                                               @RequestParam(defaultValue = "5") int size) {
        return success(detailInfoService.findBeautyShops(payloadDto.getAccountId(), address, page, size));
    }

		/*
		*	기타 로직
		*/
}
```

`@AuthPayload` 의 required 기본값은 `true` 이고, 유효한 토큰이 없으면 `AuthException` 이 발생합니다.

→ **기존에는 각 엔드포인트마다 반복되던 10~15줄의 토큰 처리 코드가 단 한 줄의 파라미터 선언으로 대체**할 수 있었고, 이는 코드의 가독성과 유지보수성을 크게 향상시켰습니다.

# 전체 시스템 흐름

<aside>
개선된 시스템의 전체 흐름을 단계별로 살펴보겠습니다.

1. HTTP 요청이 들어오면 `DispatcherServlet` 이 요청을 받음
2. `WebConfig` 에 등록된 `JwtAuthInterceptor` 의 `preHandle` 메소드 실행
    - `Authorization` 헤더에서 JWT 토큰 추출
    - 토큰 검증 및 정보 추출
    - 정보를 `PayloadDto` 객체로 변환하여 `request attribute` 에 저장
3. Controller 메서드 호출 전 `PayloadArgumentResolver` 동작
    - `@AuthPayload` 어노테이션 확인
    - `request attribute`에서 `PayloadDto` 추출
    - Controller 메소드 파라미터로 전달
4. Controller에서 `PayloadDto` 사용
</aside>

# 마치며

이번 개선 과정을 통해 단순히 문제를 해결하는 것을 넘어, Spring MVC 프레임워크에 대해 깊이 경험할 수 있었습니다.

- `DispatcherServlet` 이 단순한 라우터가 아닌, 정교하게 설계된 프론트 컨트롤러의 패턴의 구현체라는 점
- 인터셉터와 ArgumentResolver가 제공하는 확장 포인트들
- Spring이 HTTP 요청을 처리하는 방식

처음에는 단순히 **반복되는 코드를 줄이고 싶다는 생각으로 시작**했지만, 결과적으로 더욱 견고해지고 유지보수하기 좋은 설계를 할 수 있었으며, 개발자로서 **“왜 이렇게 동작하지 ?” 라는 의문을 가지고 프레임워크의 내부를 파고드는 것이 더 나은 해결책을 찾는 출발점**이 될 수 있다는 교훈을 얻었습니다.
