---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/dxsH3Dq.png"

title: "[Home Lab #2] SSH 무차별 대입 공격 방어하기: Fail2ban 설치 및 설정"
excerpt: "SSH 키 인증을 적용한 뒤에도 반복되던 접속 시도를 `auth.log`에서 확인하고, Fail2ban으로 자동 차단까지 구성한 과정을 정리했다."
categories:
  - Home Lab
tags:
  - Security
  - Fail2ban
  - Ubuntu
  - Linux
  - SSH
  - Firewall

toc_label: "Fail2ban으로 SSH 방어"
toc: true
toc_sticky: true

permalink: /home-lab/home-lab-fail2ban/
redirect_from:
  - /home lab/home-lab-fail2ban/
date: 2025-12-14
last_modified_at: 2026-03-30
---

![mainImage](https://i.imgur.com/dxsH3Dq.png)

[앞선 글](/home-lab/home-lab-ssh-key-based-auth/)에서 SSH 비밀번호 인증을 끄고 공개키 인증만 남겼습니다. 그때는 "이제 SSH 보안은 어느 정도 정리됐다"라고 생각했습니다. 하지만 실제 서버의 `auth.log`를 열어보니, **로그인 성공 여부와 별개로 SSH 포트 자체는 계속해서 자동화된 스캔 대상**이 되고 있었습니다.

이 글에서는 **왜 SSH 키 인증만으로는 충분하지 않다고 느꼈는지**, **Fail2ban이 어떤 방식으로 방화벽과 연결되어 동작하는지**, **Ubuntu 홈서버에서 `sshd` jail을 구성하고 어떤 값으로 검증했는지**를 한 번에 정리합니다.

<aside>
<strong>이 글의 기준</strong>
<ul>
  <li>환경: Ubuntu LTS 홈서버</li>
  <li>보호 대상: 외부에 노출된 SSH 포트</li>
  <li>목표: 반복적인 로그인 실패를 감지하고 공격 IP를 자동 차단하기</li>
</ul>
</aside>

# 1. SSH 키 인증을 켰는데도 로그는 계속 시끄러웠다

![authLog](https://i.imgur.com/TPqlHh8.png)

보안을 강화한 뒤 가장 먼저 확인한 것은 `/var/log/auth.log`였습니다.

```bash
sudo tail -f /var/log/auth.log
```

로그에는 아래와 같은 패턴이 반복적으로 남아 있었습니다.

```text
Invalid user admin from 203.0.113.10 port 49822
Connection closed by authenticating user root 203.0.113.10 port 49830 [preauth]
Connection reset by authenticating user ubuntu 203.0.113.10 port 49844 [preauth]
```

각 로그를 읽어보면 공격의 성격이 꽤 선명하게 드러납니다.

- **`Invalid user ...`**: `admin`, `ubuntu`, `user`, `test` 같은 흔한 계정명을 대입해 보는 전형적인 **사전 공격(Dictionary Attack)** 패턴입니다.
- **`Connection closed ... [preauth]`**: 인증이 끝나기 전에 세션이 종료된 경우입니다. 공개키를 제시하지 못했거나, 공격 도구가 응답을 받기 전에 연결을 닫는 경우가 여기에 포함됩니다.
- **`Connection reset ... [preauth]`**: 공격 도구가 빠르게 다음 대상으로 넘어가거나, 초기 인증 단계에서 연결이 비정상 종료된 경우입니다.

중요한 점은 **SSH 키 인증이 비밀번호 로그인을 막아 주더라도, 접속 시도 자체를 사라지게 만들지는 못한다**는 것입니다. 봇은 여전히 포트가 열려 있는지 확인하고, 계정명을 바꿔가며 계속 두드려 봅니다.

> **핵심은 "뚫렸는가"가 아니라, 인터넷에 노출된 관리 포트에 대해 불필요한 시도가 계속 누적되고 있다는 점**이었다.

이 상태를 방치하면 실제 침투가 일어나지 않더라도 운영상 불편이 남습니다.

- **로그 오염(Log Pollution)**: 의미 없는 실패 로그가 계속 쌓이면 정작 봐야 할 로그인 기록이나 시스템 경고를 찾기 어려워집니다.
- **불필요한 자원 사용**: 시도 하나하나는 작아 보여도, SSH 데몬은 매번 연결을 받아들이고 인증 전 과정을 일부 수행해야 합니다.
- **단일 방어선 의존**: 공개키 인증이 첫 번째 방어선이라면, 그 앞단에서 반복 시도를 정리하는 두 번째 방어선도 필요합니다.

# 2. Fail2ban은 방화벽을 자동으로 움직이는 대응 계층이다

이 지점에서 선택한 도구가 **Fail2ban**이었습니다. Fail2ban은 직접 패킷을 검사하는 방화벽이 아니라, **로그를 읽고 임계치를 넘긴 IP에 대해 방화벽 규칙을 추가하는 자동화 계층**에 가깝습니다.

동작 흐름은 단순합니다.

1. `sshd`가 로그인 실패나 비정상 연결 종료를 로그에 남깁니다.
2. Fail2ban이 이 로그를 읽고, 정해 둔 패턴과 횟수 조건을 비교합니다.
3. 같은 IP의 실패가 `findtime` 안에서 `maxretry`를 넘으면 차단이 발생합니다.
4. Fail2ban이 `iptables`, `nftables`, `UFW` 같은 방화벽 백엔드에 규칙을 추가해 해당 IP를 일정 시간 막습니다.

> **Fail2ban은 "로그를 보는 도구"가 아니라, 로그를 근거로 방화벽을 갱신하는 자동 대응 장치**라고 이해하는 편이 정확하다.

여기서 같이 알아둘 점도 있습니다. Fail2ban은 **로그 기반**으로 동작하기 때문에 첫 시도 자체를 사전에 막지는 못합니다. 즉, **SSH 키 인증이나 포트 공개 범위 축소를 대체하는 도구가 아니라, 그 위에 올리는 두 번째 방어선**입니다.

<aside>
<strong>Fail2ban의 역할과 한계</strong><br>
Fail2ban은 반복 시도를 줄이고 로그를 정리하는 데 매우 효과적이지만, SSH를 인터넷에 그대로 노출해도 된다는 뜻은 아닙니다. 가능하다면 공개키 인증, 방화벽, 포트 접근 제어, 업데이트 관리를 함께 가져가는 편이 안전합니다.
</aside>

# 3. Ubuntu 홈서버에 `sshd` jail을 적용한 방법

## 3.1 패키지 설치

먼저 Fail2ban을 설치하고 서비스가 부팅 시 자동으로 올라오도록 설정했습니다.

```bash
sudo apt update
sudo apt install fail2ban -y
sudo systemctl enable --now fail2ban
```

## 3.2 `jail.local`에 필요한 값만 정의

Fail2ban의 기본 파일인 `/etc/fail2ban/jail.conf`는 패키지 업데이트 과정에서 바뀔 수 있습니다. 그래서 **기본 파일을 직접 수정하기보다, `jail.local`에 필요한 값만 오버라이드하는 방식**이 유지보수에 더 안전합니다.

```bash
sudoedit /etc/fail2ban/jail.local
```

저는 아래처럼 최소 설정만 넣었습니다.

```ini
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 <관리용 IP 또는 신뢰 가능한 대역>
bantime = 86400
findtime = 600
maxretry = 2

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
```

각 항목의 의미는 다음과 같습니다.

- **`ignoreip`**: 절대 차단하지 않을 주소입니다. 자기 자신을 여기에 넣을 때는 **정말 신뢰 가능한 고정 IP나 내부망만** 넣는 편이 안전합니다.
- **`bantime = 86400`**: 차단 시간을 24시간으로 둔 것입니다.
- **`findtime = 600`**: 최근 10분 동안의 실패 기록을 기준으로 판단합니다.
- **`maxretry = 2`**: 10분 안에 2번 이상 실패하면 차단합니다.
- **`[sshd]`**: SSH 로그를 감시하는 jail을 활성화합니다.

이번 설정에서 `maxretry = 2`는 꽤 공격적인 값입니다. 다만 이미 **비밀번호 인증을 꺼 둔 상태**였기 때문에, 정상 사용자가 짧은 시간에 반복 실패할 가능성은 낮다고 판단했습니다.

<aside>
<strong>환경 차이 주의</strong><br>
예시는 `/var/log/auth.log`를 읽는 환경 기준입니다. 시스템이 `journald`만 사용한다면 `logpath` 대신 `systemd` 백엔드를 쓰는 구성이 더 맞을 수 있습니다. 먼저 내 서버에서 SSH 로그가 실제로 어디에 남는지 확인하는 것이 우선입니다.
</aside>

## 3.3 설정 적용

설정을 저장한 뒤 서비스를 다시 읽히고, `sshd` jail이 정상적으로 활성화됐는지 확인했습니다.

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

정상이라면 `sshd`가 jail 목록에 나타나고, 세부 상태도 조회됩니다.

# 4. 적용 후에는 상태값을 이렇게 읽었다

제가 가장 자주 확인한 명령은 아래 하나였습니다.

```bash
sudo fail2ban-client status sshd
```

![Fail2ban sshd status](https://i.imgur.com/jV6rSVB.png)

여기서 눈여겨본 값은 네 가지였습니다.

- **`Currently failed`**: 아직 차단까지는 가지 않았고, Fail2ban이 현재 누적 실패를 추적 중인 항목 수입니다.
- **`Total failed`**: Fail2ban이 해당 jail에서 감지한 전체 실패 횟수입니다.
- **`Currently banned`**: 지금 이 시점에 실제로 차단 중인 IP 수입니다.
- **`Total banned`**: Fail2ban 서비스가 동작한 이후 누적된 차단 횟수입니다. 같은 IP가 여러 번 다시 차단되면 이 값도 함께 늘어납니다.

즉, **`Currently banned`가 의미하는 것은 "이제 네트워크 레벨에서 바로 거절되는 대상이 얼마나 있는가"**이고, **`Total banned`는 "운영 기간 동안 얼마나 자주 차단이 발생했는가"**를 보여주는 지표에 가깝습니다.

필요하다면 현재 차단된 IP 목록도 바로 확인할 수 있습니다.

```bash
sudo fail2ban-client status sshd | grep "Banned IP list"
```

## 4.1 실수로 내 IP를 막았을 때

운영 중에는 나 자신의 IP를 실수로 차단할 가능성도 있습니다. 이럴 때는 **별도 진입 경로**가 있어야 합니다. 예를 들어 집 안 콘솔, 다른 네트워크, 모바일 핫스팟, VPN 같은 경로로 다시 접속한 뒤 차단을 풀 수 있습니다.

```bash
sudo fail2ban-client set sshd unbanip <내 IP 주소>
```

`ignoreip`를 넓게 잡아 실수를 피하려 하기보다, **복구 경로를 미리 확보하고 필요한 주소만 정확히 예외 처리하는 편**이 더 안전하다고 느꼈습니다.

# 5. 마무리

SSH 키 인증이 **"올바른 열쇠가 없는 사용자는 들어오지 못하게 하는 장치"**라면, Fail2ban은 **"같은 문을 반복해서 두드리는 대상을 일정 시간 격리하는 장치"**에 가깝습니다.

이번 작업으로 얻은 가장 큰 변화는 단순히 차단 IP 수가 늘었다는 사실이 아니었습니다. **SSH를 인터넷에 노출했을 때 실제로 어떤 시도가 들어오는지 로그로 확인했고, 그 로그를 행동으로 연결하는 자동 대응 체계를 하나 더 올렸다는 점**이 더 중요했습니다.

홈서버를 운영하다 보면 보안 설정을 "한 번 해두면 끝나는 체크리스트"처럼 생각하기 쉽습니다. 하지만 실제 운영에서는 **인증 방식 강화, 로그 관찰, 자동 차단, 업데이트 관리**가 함께 가야 조금 더 운영 가능한 상태에 가까워집니다. 이번 글의 Fail2ban 설정은 그중에서도 **공개키 인증 다음에 바로 붙이기 좋은 방어선**이었습니다.
