---
header:
  teaser: /assets/images/logo.png
  og_image: "https://cdn.imgchest.com/files/4dfac6b76b0f.png"

title: "[Git Ranker #10] 외국인도 참여할 수 있도록. 국제화(i18n) 구축기"
excerpt: "운영 지표에서 한국어 사용자가 절대다수라는 사실을 확인한 뒤, Git Ranker를 외국인도 이해할 수 있는 서비스로 확장하기 위해 메시지 흐름을 국제화한 기록"

categories:
  - Git Ranker

tags:
  - I18n
  - Spring Boot
  - MessageSource
  - Accept-Language

toc_label: "i18n 구축기"
toc: true
toc_sticky: true

permalink: /git-ranker/git-ranker-i18n/
redirect_from:
  - /git ranker/git-ranker-i18n/
date: 2026-02-24
last_modified_at: 2026-03-30
---

![mainImage](https://cdn.imgchest.com/files/4dfac6b76b0f.png)

Git Ranker를 처음 만들 때는 사실상 **한국인 사용자만 떠올리고** 있었습니다. 실제 운영 지표도 그렇게 보였습니다. Search Console과 Analytics를 확인해 보니 한국어 사용자 비중이 압도적으로 높았고, 체감상도 외국인 유입은 거의 없었습니다.

하지만 시간이 지나고 나니 이 숫자가 다르게 읽히기 시작했습니다. **"원래 한국인만 쓰는 서비스"** 라는 뜻일 수도 있지만, 반대로 **"외국인이 들어와도 메시지를 이해하지 못해서 바로 이탈하는 구조"** 일 수도 있었기 때문입니다.

이번 작업은 그 문제를 해결하기 위한 첫 단계였습니다. 프론트 전체를 한 번에 번역하기보다, 우선 백엔드가 책임지는 **예외 메시지**와 **검증 메시지**부터 `ko/en`으로 일관되게 내려줄 수 있는 기반을 만들었습니다.

<aside>
<strong>이번 글의 범위</strong><br>
이번 국제화 작업은 화면 전체 번역이 아니라, <strong>백엔드 응답 메시지의 국제화 기반</strong>을 만드는 데 집중합니다. 즉, `Accept-Language`에 따라 예외와 검증 메시지를 안정적으로 바꿔 내려주는 구조를 정리하는 작업입니다.
</aside>

# 1. 96% 한국인이라는 숫자의 의미

![google search console](https://i.imgur.com/mIanPUL.png)

처음에는 이 지표를 보고 이렇게 생각했습니다.

> "어차피 대부분 한국인인데, 한국어 메시지만 잘 보이면 되는 것 아닐까?"

그런데 서비스 운영 관점에서는 정반대 해석도 가능했습니다.

- 외국인이 검색으로 들어와도 **안내 문구를 이해하지 못할 수 있다**.
- 요청이 실패해도 **왜 실패했는지 파악하기 어렵다**.
- 결국 서비스의 가치보다 먼저 **언어 장벽을 만나 이탈할 수 있다**.

즉, **외국인 사용자가 적다**는 사실만으로 **외국인 사용자가 필요 없다**고 결론 내릴 수는 없었습니다. 오히려 지금 구조가 외국인에게 불리하게 설계되어 있을 가능성을 먼저 의심해야 했습니다.

![google search console2](https://i.imgur.com/T7nyw1n.png)

그래서 이번 작업의 목표를 이렇게 잡았습니다.

1. 요청 언어에 따라 `ko/en` 메시지를 내려줄 수 있어야 한다.
2. 비즈니스 예외와 검증 실패가 같은 규칙으로 동작해야 한다.
3. 이후 언어가 늘어나도 비즈니스 코드 수정은 최소화되어야 한다.

# 2. 번역 파일보다 먼저 드러난 구조 문제

국제화(i18n)를 처음 생각하면 흔히 `messages_en.properties`부터 떠올리게 됩니다. 저도 처음에는 그랬습니다. 하지만 코드를 뜯어보니, Git Ranker에는 아직 **번역을 얹을 수 있는 구조 자체가 충분히 준비되어 있지 않았습니다.**

간단히 구분하면 이렇습니다.

- **국제화(i18n)**: 코드가 locale에 따라 적절한 언어를 선택할 수 있게 만드는 구조
- **현지화(l10n)**: 그 구조 위에 실제 언어별 문장을 채워 넣는 작업

이번 작업이 생각보다 커진 이유는, 단순히 영어 문장을 추가하는 `l10n`보다 먼저 **메시지 흐름을 분리하는 `i18n` 작업**이 필요했기 때문입니다.

당시 코드에는 이런 문제가 섞여 있었습니다.

- `ErrorType`이 사용자에게 보여줄 **한국어 문장 자체**를 들고 있었다.
- `@NotBlank`, `@Pattern`, `@Min` 같은 검증 메시지도 **문자열 하드코딩**이었다.
- 같은 의미의 문구가 여러 파일에 흩어져 있어서 **일관성 있게 관리하기 어려웠다**.
- 동적 메시지는 문자열 연결로 처리하고 있어서 **언어별 문장 순서를 바꾸기 어려웠다**.

> **번역 파일을 추가하는 것만으로는 국제화가 끝나지 않습니다.**
>
> 문자열을 코드 밖으로 꺼내고, 어떤 레이어가 어떤 시점에 그 문자열을 해석할지 먼저 정리해야 합니다.

그래서 이번에는 범위를 명확히 제한했습니다.

1. `Accept-Language` 기반 언어 협상
2. `ErrorType`과 예외 응답의 key 기반 전환
3. 검증 메시지의 key 기반 전환
4. `messages_ko.properties`, `messages_en.properties` 분리

프론트 전체 문구, 배치 로그, 관리자 전용 메시지까지 한 번에 건드리지는 않았습니다. **이번 목표는 "영어 지원 완료"가 아니라 "확장 가능한 메시지 레이어 구축"** 이었습니다.

# 3. `Accept-Language` 기반 언어 협상 인프라

첫 단계는 `MessageSource`와 `LocaleResolver`를 붙여, 요청이 들어왔을 때 **어떤 언어를 선택할지 결정하는 경로**를 만드는 일이었습니다.

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

여기서 핵심은 세 가지였습니다.

- **기본 언어를 `ko`로 고정**한다.
- 요청의 `Accept-Language` 헤더를 보고 **`ko/en` 중 하나를 선택**한다.
- 서버 OS locale에 영향을 받지 않도록 `setFallbackToSystemLocale(false)`를 켠다.

예를 들어 브라우저가 아래 헤더를 보내면,

```text
Accept-Language: en-US,en;q=0.9,ko;q=0.8
```

서버는 지원 locale 목록 안에서 영어를 고릅니다. 반대로 지원하지 않는 언어만 들어오면 기본값인 한국어를 사용합니다.

이 방식이 좋았던 이유는 API 특성 때문이었습니다. 세션에 언어 상태를 따로 저장하지 않아도 되고, 요청마다 헤더만 보면 어떤 언어로 응답할지 결정할 수 있어서 동작이 단순합니다. **국제화된 API는 결국 "문장을 어디에 둘 것인가"뿐 아니라, "요청마다 어떤 언어를 선택할 것인가"를 함께 정의해야 합니다.**

# 4. `ErrorType`의 역할 재정의

국제화에서 가장 먼저 손을 대야 했던 곳은 `ErrorType`이었습니다. 기존 구조에서는 enum이 사용자 문장을 직접 들고 있었습니다.

```java
GITHUB_USER_NOT_FOUND(HttpStatus.NOT_FOUND, "GitHub 사용자를 찾을 수 없어요.", LogLevel.INFO),
INVALID_REQUEST(HttpStatus.BAD_REQUEST, "잘못된 요청이에요. 입력 값을 확인해주세요.", LogLevel.INFO),
```

이 상태에서는 언어를 추가할 때마다 Java 코드를 바꿔야 합니다. 그래서 `message`를 `messageKey`로 전환했습니다.

```java
GITHUB_USER_NOT_FOUND(HttpStatus.NOT_FOUND, "error.github.user-not-found", LogLevel.INFO),
INVALID_REQUEST(HttpStatus.BAD_REQUEST, "error.common.invalid-request", LogLevel.INFO),
```

겉으로 보기엔 단순 치환처럼 보여도, 의미는 꽤 달랐습니다.

- `ErrorType`은 이제 **어떤 문제가 발생했는지**만 표현합니다.
- 실제 사용자 문장은 `messages_ko.properties`, `messages_en.properties`가 책임집니다.
- 문구 수정이나 언어 추가는 비즈니스 로직이 아니라 **메시지 레이어의 변경**이 됩니다.

이렇게 분리해두면 도메인 로직은 "이 상황은 `INVALID_REQUEST`다"까지만 알면 됩니다. **어떤 언어로, 어떤 어조로 사용자에게 보여줄지는 응답 레이어에서 늦게 결정할 수 있습니다.**

# 5. 예외 메시지의 해석 시점

메시지 key를 도입했다면, 결국 어딘가에서는 그 key를 실제 문장으로 바꿔야 합니다. Git Ranker에서는 그 책임을 `GlobalExceptionHandler`에 두었습니다.

```java
private String resolveMessage(String messageKey, Object... args) {
    return messageSource.getMessage(messageKey, args, messageKey, LocaleContextHolder.getLocale());
}
```

흐름은 아래처럼 정리됩니다.

1. 도메인이나 서비스 레이어가 `BusinessException(ErrorType.INVALID_REQUEST)`를 던진다.
2. `GlobalExceptionHandler`가 `errorType.getMessageKey()`를 가져온다.
3. `LocaleContextHolder.getLocale()` 기준으로 `MessageSource`에서 문장을 해석한다.
4. 해석된 문장을 `ApiResponse.error(...)`에 담아 내려준다.

이 방식의 장점은 분명했습니다. **예외를 발생시키는 쪽은 locale을 몰라도 된다**는 점입니다. 도메인 로직은 오직 오류의 의미만 표현하고, 사용자 문장은 응답 직전 레이어에서 결정합니다.

동적 메시지도 같은 방식으로 처리했습니다. 예를 들어 rate limit 안내처럼 값이 들어가는 메시지는 placeholder를 사용했습니다.

```properties
# messages_ko.properties
error.github.rate-limit-retry-after={0} 이후에 다시 시도해주세요.

# messages_en.properties
error.github.rate-limit-retry-after=Please try again after {0}.
```

이렇게 해두면 문자열을 코드에서 이어 붙이지 않아도 되고, 언어마다 어순이 달라져도 메시지 파일에서 자연스럽게 조정할 수 있습니다.

# 6. 정적 응답 구조와 `MessageSource` 연결

문제는 여기서 끝나지 않았습니다. Git Ranker의 응답 구조는 `ApiResponse.error(...)` 같은 **정적 팩토리**를 중심으로 돌아가고 있었고, 내부에서 `ErrorMessage` 객체를 바로 생성하고 있었습니다.

즉, `GlobalExceptionHandler`처럼 Spring DI를 자연스럽게 받는 클래스와 달리, 응답 객체 쪽은 `MessageSource`를 바로 주입하기 애매했습니다.

그래서 이번에는 구조를 크게 뒤엎기보다, `MessageUtils`를 하나 두어 **정적 응답 계층이 메시지 해석을 위임할 수 있는 접점**을 만들었습니다.

```java
@Component
public class MessageUtils {

    private static MessageSource messageSource;

    public MessageUtils(MessageSource messageSource) {
        MessageUtils.messageSource = messageSource;
    }

    public static String getMessage(String messageKey, Object... args) {
        if (messageSource == null) {
            return messageKey;
        }

        return messageSource.getMessage(messageKey, args, messageKey, LocaleContextHolder.getLocale());
    }
}
```

그리고 `ErrorMessage`는 기본 생성 시 이 유틸을 통해 key를 실제 문장으로 해석합니다.

```java
public ErrorMessage(ErrorType errorType, Object data) {
    this(errorType.toString(), MessageUtils.getMessage(errorType.getMessageKey()), data);
}
```

<aside>
<strong>왜 이런 우회가 필요했나</strong><br>
이 선택은 가장 우아한 구조라기보다, 기존 `ApiResponse` 정적 팩토리 패턴을 크게 흔들지 않으면서 국제화를 연결하기 위한 <strong>현실적인 타협</strong>이었습니다. 새로 설계한다면 응답 생성 책임을 Bean 레이어로 끌어올리는 편이 더 깔끔할 수 있습니다. 다만 이번 코드베이스에서는 변경 범위를 통제하는 쪽이 더 중요했습니다.
</aside>

이 지점이 이번 작업에서 개인적으로 가장 "국제화는 설계"라고 느껴졌던 부분이었습니다. **번역 파일을 추가하는 것보다, 기존 구조의 어느 지점에서 locale을 해석할지를 정하는 일이 더 어려웠기 때문입니다.**

# 7. 검증 메시지까지 국제화해야 하는 이유

예외 메시지만 국제화하고 검증 메시지를 그대로 두면 경험이 어색해집니다. 사용자는 성공 응답보다 **입력 검증 실패**를 더 자주 먼저 만나기 때문입니다.

그래서 `RegisterUserRequest`, `UserController`, `RankingController`의 검증 어노테이션도 모두 key 기반으로 바꿨습니다.

기존 방식은 이런 식이었습니다.

```java
@NotBlank(message = "GitHub username은 필수값입니다.")
@Pattern(message = "GitHub 사용자명은 1-39자의 영문, 숫자, 하이픈만 허용됩니다")
@Min(value = 0, message = "페이지 번호는 0 이상이어야 합니다")
```

변경 후에는 아래처럼 통일했습니다.

```java
@NotBlank(message = "{validation.user.username.not-blank}")
@Pattern(message = "{validation.user.username.pattern}")
@Min(value = 0, message = "{validation.ranking.page.min}")
```

메시지 파일도 도메인 기준으로 나눴습니다.

```properties
# messages_ko.properties
validation.user.username.not-blank=GitHub username은 필수값입니다.
validation.user.username.pattern=GitHub 사용자명은 1-39자의 영문, 숫자, 하이픈만 허용됩니다
validation.ranking.page.min=페이지 번호는 0 이상이어야 합니다
```

```properties
# messages_en.properties
validation.user.username.not-blank=GitHub username is required.
validation.user.username.pattern=GitHub username allows 1-39 letters, numbers, and hyphens only.
validation.ranking.page.min=Page number must be 0 or greater.
```

이렇게 해두면 사용자가 `Accept-Language: en`으로 요청했을 때, 비즈니스 예외뿐 아니라 validation error도 같은 방식으로 영어로 내려갑니다. **국제화는 일부 메시지만 바꾸는 작업이 아니라, 사용자가 만나는 실패 경험 전체를 같은 규칙으로 맞추는 작업**에 가깝습니다.

# 8. 언어별 응답 변화

예를 들어 `/api/v1/ranking?page=-1` 요청은 `RankingController`의 `@Min` 검증에 걸립니다.

같은 요청이라도 헤더에 따라 메시지가 달라집니다.

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

여기서 중요한 점은 `type` 자체는 그대로 유지된다는 것입니다. 즉, **클라이언트는 안정적인 에러 코드를 기준으로 처리하고**, 사용자에게 보여줄 문구만 locale에 따라 바뀝니다. 이 분리가 있어야 국제화가 들어가도 API 계약이 흔들리지 않습니다.

# 9. 이번 작업의 성과와 남은 과제

이번 변경으로 얻은 것은 단순히 영어 문장 몇 줄이 아니었습니다.

- 이제 같은 API가 요청 언어에 따라 **자연스러운 사용자 문구**를 내려줄 수 있습니다.
- 문장 수정은 Java 코드보다 **메시지 파일 수정**으로 해결할 수 있습니다.
- 새 언어를 추가할 때도 핵심 비즈니스 로직이 아니라 **message bundle 확장**이 중심이 됩니다.

반대로 아직 남은 과제도 분명합니다.

- 프론트 화면 문구까지 국제화한 것은 아닙니다.
- 메시지 key가 누락되면 key 문자열이 그대로 노출될 수 있습니다.
- locale별 자동화 테스트는 아직 충분하지 않습니다.

특히 마지막 항목은 다음 단계에서 꼭 보강하고 싶습니다. 지금 구조는 사람이 직접 API를 호출해 확인해도 동작하지만, 국제화는 key 하나만 틀려도 사용자에게 바로 티가 납니다. 그래서 이후에는 `MockMvc` 기반으로 `Accept-Language` 헤더를 바꿔가며 **예외/검증 응답이 각 locale에 맞게 내려오는지 자동으로 검증**할 생각입니다.

> **국제화는 "영어 지원"이라는 기능 추가가 아니라, 서비스가 어떤 언어로 사용자와 대화할지를 설계하는 일에 더 가깝습니다.**

처음에는 `messages_en.properties`만 만들면 끝날 줄 알았습니다. 하지만 실제로는 `ErrorType`, `GlobalExceptionHandler`, `ApiResponse`, `ErrorMessage`, validation annotation까지 함께 움직여야 했습니다.

결국 이번 작업의 핵심은 번역이 아니었습니다. **사용자 문장을 코드에서 분리하고, 요청 언어에 따라 마지막 순간에 해석하는 구조를 만든 것**이 핵심이었습니다. Git Ranker가 외국인도 참여할 수 있는 서비스가 되려면 아직 갈 길이 남아 있지만, 적어도 이제는 그 출발선은 제대로 만들었다고 생각합니다.
