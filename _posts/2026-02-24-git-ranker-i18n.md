---
header:
  teaser: /assets/images/logo.png

title: "[Git Ranker #10] 외국인도 참여할 수 있도록. 국제화(i18n) 구축기"
excerpt: "Google Search Console/Analytics에서 한국인 사용자 비중이 약 96%라는 지표를 확인하고, 외국인도 참여 가능한 서비스로 확장하기 위해 국제화를 도입한 기록"

categories:
  - Git Ranker

tags:
  - I18n
  - Spring Boot
  - MessageSource

toc_label: "i18n 구축기"
toc: true
toc_sticky: true

date: 2026-02-24
last_modified_at: 2026-02-24
---

Git Ranker를 처음 만들 때는 타겟 사용자를 사실상 **한국인**으로만 생각했습니다.

실제로 운영 지표를 보면 그 생각이 맞아 보이기도 했습니다.  

![google search console](https://imgur.com/mIanPUL.png)
![google search console2](https://imgur.com/T7nyw1n.png)

Google Search Console를 확인했을 때 사용자 비중이 **약 96% 한국인**이었고, 외국인 유입은 거의 없었기 때문입니다.

처음에는 이렇게 생각했습니다.

> "어차피 거의 한국인만 오는데, 한국어 메시지만 잘 나오면 되는 거 아닐까?"

그런데 시간이 지나면서 오히려 반대로 느꼈습니다.  

지금의 비중이 “원래 한국인만 쓰는 서비스”라는 뜻일 수도 있지만, **외국인이 들어와도 이해하고 참여하기 어려운 구조라서 떠나는 것**일 수도 있었습니다.

그래서 이번에는 외국인도 참여 가능한 기본기를 만들자는 목표로 **국제화(i18n)** 작업을 시작했습니다.

---

# 국제화를 결심한 이유

## 1. 사용자 비중이 96% 한국인이라는 사실

Google Search Console, Analytics를 보니 한국어 사용자 중심 서비스라는 건 분명했습니다.  
하지만 저는 이 숫자를 “현 상태 유지 근거”가 아니라 **“개선 필요 신호”**로 봤습니다.

- 외국인이 검색으로 유입되어도 **안내 메시지를 이해하기 어렵다**.
- 오류가 나면 **왜 실패했는지 파악하기 어렵다**.
- 결국 **시도 자체를 포기하고 이탈할 가능성이 높다**.

외국인이 없다는 결과를 그냥 받아들이기보다, 외국인도 진입할 수 있는 구조를 먼저 만들어야 한다고 판단했습니다.

## 2. 구현하면서 보인 하드코딩 메시지 문제

국제화를 붙이려고 코드를 보기 시작했을 때 더 큰 문제가 보였습니다.

- 예외 메시지가 코드에 직접 하드코딩돼 있었다.
- 검증 메시지(`@NotBlank`, `@Pattern`, `@Min`)도 문자열 하드코딩이었다.
- 같은 의미의 문구가 여러 파일에 흩어져 있었다.

처음엔 “영어 properties 파일만 추가하면 되겠지”라고 생각했는데, 실제로는 **메시지 표현 방식 자체를 key 기반으로 바꾸는 리팩터링**이 필요했습니다.

---

# 작업 목표 정의

처음부터 모든 API 응답, 배치 로그, 관리자 메시지, 프론트 문구까지 한 번에 바꾸려 하니 **메시지 키 누락**이 잦아지고, **검증 포인트가 폭증**해서 어떤 변경이 실제 사용자 영향인지 추적하기 어려웠습니다.

게다가 국제화와 무관한 리팩터링이 섞이면서 **PR이 비대해지고 리뷰/배포 리스크도 함께 증가**했습니다. 그래서 이번에는 **사용자 영향이 크고 백엔드에서 통제 가능한 영역**만 대상으로 정했습니다.

1. `Accept-Language` 기반으로 `ko/en` 언어 협상
2. 비즈니스 예외 메시지를 key 기반으로 전환
3. 검증 메시지를 key 기반으로 전환
4. 다국어 메시지 파일(`messages_ko.properties`, `messages_en.properties`)로 분리

화면 텍스트 전체 국제화는 다음 단계로 미루고 이번에는 **에러/검증 경험 일관성**에 집중했습니다.

---

# 1단계: i18n 인프라 추가

먼저 `MessageSource`와 `LocaleResolver`를 설정했습니다.

```java
@Configuration
public class MessageConfig {

    @Bean
    public MessageSource messageSource() {
        ReloadableResourceBundleMessageSource messageSource = new ReloadableResourceBundleMessageSource();
        messageSource.setBasenames("classpath:messages");
        messageSource.setDefaultEncoding(StandardCharsets.UTF_8.name());
        messageSource.setFallbackToSystemLocale(false);
        return messageSource;
    }

    @Bean
    public LocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver localeResolver = new AcceptHeaderLocaleResolver();
        localeResolver.setDefaultLocale(Locale.KOREAN);
        localeResolver.setSupportedLocales(List.of(Locale.KOREAN, Locale.ENGLISH));
        return localeResolver;
    }
}
```

여기서 신경 쓴 포인트는 2개였습니다.

- **기본 언어를 `ko`로 고정**
- **`Accept-Language` 헤더로 `ko/en` 협상**

특히 `setFallbackToSystemLocale(false)`는 서버 OS 언어 설정에 따라 예기치 않게 메시지가 바뀌는 상황을 피하려고 넣었습니다.

## Accept-Language 헤더는 어떻게 동작할까?

국제화를 하면서 처음 헷갈렸던 부분이 `Accept-Language` 헤더였습니다.  

이 헤더는 브라우저(클라이언트)가 서버에 보내는 **HTTP 요청 헤더**로, 서버에게 **"나는 어떤 언어를 선호하는지"**를 전달합니다.

예를 들면 요청에 이렇게 담깁니다.

```text
Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7
```

여기서 `q` 값은 선호도(가중치)입니다.

- **`q` 값이 높을수록 우선순위가 높음**
- **`q`가 생략되면 보통 `1.0`으로 간주**

서버는 이 값을 보고, 자신이 지원하는 언어(`ko`, `en`) 중 가장 적절한 언어를 선택합니다.  
이 과정을 HTTP에서는 **콘텐츠 협상(Content Negotiation)**이라고 부릅니다.

Spring의 `AcceptHeaderLocaleResolver`를 사용하면 이 과정을 자동으로 처리할 수 있습니다.

1. 클라이언트의 `Accept-Language` 확인
2. 서버의 지원 Locale 목록(`ko`, `en`)과 매칭
3. 매칭 실패 시 기본 Locale(`ko`) 사용

---

# 2단계: 메시지 파일 분리

`messages_ko.properties`와 `messages_en.properties`를 만들고 에러/검증 메시지를 key로 관리하기 시작했습니다.

```properties
# messages_ko.properties
error.common.invalid-request=잘못된 요청이에요. 입력 값을 확인해주세요.
validation.user.username.not-blank=GitHub username은 필수값입니다.
```

```properties
# messages_en.properties
error.common.invalid-request=Invalid request. Please check your input values.
validation.user.username.not-blank=GitHub username is required.
```

단순해 보이지만 이 단계에서 기준을 세우는 게 중요했습니다.

- `error.github.*`
- `error.auth.*`
- `error.user.*`
- `validation.*`

키 네이밍을 도메인 단위로 맞춰두니 나중에 키가 늘어나도 추적이 쉬워졌습니다.

---

# 3단계: ErrorType을 문구에서 key로 바꾸기
```java
GITHUB_USER_NOT_FOUND(HttpStatus.NOT_FOUND, "GitHub 사용자를 찾을 수 없어요.", LogLevel.INFO),
INVALID_REQUEST(HttpStatus.BAD_REQUEST, "잘못된 요청이에요. 입력 값을 확인해주세요.", LogLevel.INFO),
...
```
기존 `ErrorType`은 사용자에게 보여줄 한국어 문장 자체를 들고 있었습니다.

이 구조에서는 **다국어 확장이 불가능**하기 때문에 아래처럼 `message`를 `messageKey`로 전환했습니다.

```java
GITHUB_USER_NOT_FOUND(HttpStatus.NOT_FOUND, "error.github.user-not-found", LogLevel.INFO),
INVALID_REQUEST(HttpStatus.BAD_REQUEST, "error.common.invalid-request", LogLevel.INFO),
...
```

이 리팩터링의 의미는 생각보다 컸습니다.

- 에러 코드와 사용자 문구를 분리
- 문구 수정 시 Java 코드 변경 없이 properties만 수정
- 언어 추가 시 비즈니스 코드 변경 최소화

처음엔 작업량이 커 보여서 망설였지만, 결론적으로 **이번 작업의 핵심은 이 전환**이었습니다.

---

# 4단계: GlobalExceptionHandler에서 locale 메시지 해석

메시지 키를 실제 문구로 해석하는 책임은 `GlobalExceptionHandler`에 뒀습니다.

```java
private String resolveMessage(String messageKey, Object... args) {
    return messageSource.getMessage(messageKey, args, messageKey, LocaleContextHolder.getLocale());
}
```

`BusinessException` 처리 시

- `ErrorType`에서 `messageKey` 조회
- 현재 locale(`LocaleContextHolder`) 기준으로 해석
- `ApiResponse.error(...)`로 응답

동적 메시지도 이 방식으로 처리했습니다.

```properties
# ko
error.github.rate-limit-retry-after={0} 이후에 다시 시도해주세요.
# en
error.github.rate-limit-retry-after=Please try again after {0}.
```

문자열 연결로 처리하던 부분을 key+placeholder로 바꿔 다국어에서도 문장 순서/표현을 자연스럽게 유지할 수 있었습니다.

---

# 5단계: 검증 메시지를 key 기반으로 전환

사용자가 가장 자주 만나는 에러는 검증 실패 메시지입니다. 그래서 검증 어노테이션 하드코딩도 반드시 정리해야 했습니다.

기존 방식

```java
@NotBlank(message = "GitHub username은 필수값입니다.")
```

변경

```java
@NotBlank(message = "{validation.user.username.not-blank}")
```

`@Pattern`, `@Min`도 같은 방식으로 바꿨습니다.

- `validation.user.username.pattern`
- `validation.ranking.page.min`

이렇게 바꾼 뒤 `Accept-Language: en`에서 동일 요청을 보내면 검증 실패 메시지도 영어로 응답됩니다.

---

# 시행착오

## 1. “파일만 만들면 된다”는 착각

`messages_en.properties`를 만들어도 코드가 여전히 하드코딩 문구를 반환하면 아무 변화가 없습니다.

국제화는 번역 파일 추가가 아니라 **메시지 흐름 전체를 key 기반으로 바꾸는 구조 변경**이었습니다.

## 2. key 누락 시 key 문자열이 그대로 내려옴

`{validation.xxx}` 포맷이 잘못됐거나 key가 없으면 사용자에게 key 문자열이 그대로 노출될 수 있습니다.

그래서 key 이름 변경/추가 시에는 반드시 실제 API 호출로 확인했습니다.

## 3. 정적 응답 구조와 MessageSource 연결

`ApiResponse.error(...)`가 정적 팩토리라 일반 DI 흐름으로 메시지 해석을 직접 연결하기가 애매했습니다.

기존 구조를 크게 흔들지 않기 위해 `MessageUtils`를 두어 해결했습니다.  
완벽한 구조라기보다, 현재 코드베이스에서 안전하게 적용 가능한 선택이었습니다.

---

# 결과: 사용자 경험의 변화

국제화 적용 후 가장 큰 변화는 **같은 API라도 요청 언어에 따라 자연스러운 메시지를 제공할 수 있게 된 것**입니다.

예시로 `page=-1` 요청 시,

`Accept-Language: ko`

```json
{
  "result": "ERROR",
  "data": null,
  "error": {
    "type": "INVALID_REQUEST",
    "message": "페이지 번호는 0 이상이어야 합니다",
    "data": null
  }
}
```

`Accept-Language: en`

```json
{
  "result": "ERROR",
  "data": null,
  "error": {
    "type": "INVALID_REQUEST",
    "message": "Page number must be 0 or greater.",
    "data": null
  }
}
```

---

# 확장성을 위해 고려한 것들

이번 작업은 **“영어 지원 완료”가 아니라 “확장 가능한 기반 구축”**에 목적이 있었습니다.

1. 키 네이밍 규칙을 도메인 단위로 고정
2. 기본 locale/지원 locale을 코드에 명시
3. 동적 메시지는 placeholder로 표준화
4. 에러 코드는 고정하고, 사용자 문구만 locale별로 분리

이 구조 덕분에 다음 언어를 추가할 때는 핵심 비즈니스 로직보다 메시지 레이어 중심으로 확장할 수 있습니다.

---

# 마무리
![git-ranker-main](https://imgur.com/zuB0kHz.png)
이번 국제화 작업에서 가장 크게 바뀐 생각은

> 국제화는 번역 작업이 아니라 설계 작업이다.

처음 시작할 때는 “영어 메시지 몇 개만 추가하면 된다”고 생각했습니다.  
하지만, 실제로는 예외 구조, 검증 구조, 응답 구조를 함께 정리해야 했습니다.

그리고 국제화를 결심하게 만든 출발점도 분명했습니다.

- 사용자 지표의 약 96%가 한국인이라는 현실
- 외국인 참여 장벽을 낮춰야 한다는 문제의식
- 구현 과정에서 드러난 하드코딩 메시지의 한계

이번 작업은 **외국인도 참여 가능한 서비스를 만들기 위한 첫 구조 개선**이었습니다.

앞으로는 locale별 자동화 테스트를 붙이고, 프론트와 백엔드의 메시지 정책도 더 일관되게 맞춰갈 계획입니다.

처음 해본 국제화였지만 이번 경험 덕분에 “기능 구현”과 “서비스 운영 준비”가 다른 문제라는 걸 배웠습니다.
