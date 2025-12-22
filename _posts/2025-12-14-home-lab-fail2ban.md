---
header:
  teaser: /assets/images/logo.png

title: "[Home Lab #2] SSH 무차별 대입 공격 방어하기: Fail2ban 설치 및 설정"
excerpt: "SSH Key 인증 적용 후에도 계속되는 '무차별 대입 공격(Brute Force)'을 탐지하고, Fail2ban을 이용해 공격 IP를 자동으로 차단하는 방법 정리"
categories:
  - Home Lab
tags:
  - Security
  - Fail2ban
  - Ubuntu
  - Linux
  - SSH
  - Firewall

toc_label: ""
toc: true
toc_sticky: true

date: 2025-12-14
last_modified_at: 2025-12-14
---
# 1. 내 서버를 노리는 수많은 시도들

지난 포스팅에서 **SSH Key 기반 인증**을 적용하며 보안을 강화했습니다. 비밀번호 로그인을 원천 차단했으니 이제 안전할 것이라 생각했지만, 서버의 보안 로그를 확인해본 결과 **예상보다 훨씬 많은 외부 접속 시도**가 발생하고 있음을 확인했습니다.

단순히 로그를 확인하지 않았을 때는 몰랐던 **무차별 대입 공격(Brute Force)**의 유형 일부분을 파헤쳐 보았습니다.

## 1.1 로그 분석

실제 서버에서 기록된 무차별 대입 공격의 패턴을 일부 분석해 보았습니다.

![image.png](https://imgur.com/TPqlHh8.png)

- **`Invalid user [ID] from [IP]` :** 공격자가 존재하지 않는 계정명(`user`, `admin`, `ubuntu` 등)으로 로그인을 시도하는 경우입니다. 이는 특정 타깃을 노린 공격이라기보다, **자동화된 봇(Bot)**이 인터넷상의 모든 IP를 스캔하며 흔하게 사용되는 계정 리스트를 대입하는 전형적인 **사전 공격(Dictionary Attack)**의 양상입니다.
- **`Connection closed ... [preauth]` :** SSH Key 인증이 강제된 환경에서 나타나는 로그인입니다. 클라이언트가 서버에 접속을 시도할 때 인증에 필요한 비공개키를 제시하지 못했으므로, 실제 인증 절차가 시작되기도 전인 **인증 전 단계(Pre-authentication)**에서 서버가 연결을 끊어 버린 상태입니다.
- **`Connection reset by authenticating user root` :** 공격 툴이 응답이 없거나 실패를 인지한 후 다음 시도를 위해 세션을 강제로 재설정하거나, 서버 측의 보안 정책에 의해 초기 연결 단계에서 패킷이 차단된 기록입니다.

## 1.2 “안 뚫렸는데 왜 문제인가요?”

비록 SSH Key 인증 덕분에 실제 침투는 실패했지만, 이를 방치하면 시스템 운영 측면에서 다양한 문제가 발생할 수 있습니다.

1. **리소스 소모 :** 서버는 접속 시도마다 `sshd` 프로세스를 생성하고 암호화 핸드쉐이크 과정을 거쳐야 합니다. 수천 건의 공격이 집중될 경우 **CPU 점유율이 상승하고 네트워크 대역폭이 낭비**될 것입니다.
2. **로그 가시성 저하(Log Pollution) :** 하루에도 수천 줄씩 쌓이는 비정상 로그 때문에 정작 확인해야 할 중요한 시스템 경고나 정상 접속 기록을 찾기가 매우 어려워집니다.
3. **잠재적 위협 :** 보안 프로토콜 자체에 알려지지 않은 제로데이(Zero-day) 취약점이 발견될 경우, 인증 전 단계의 시도만으로도 위험에 노출될 수 있습니다.

---

# 2. 해결 방안 : Fail2ban을 통한 자동화된 방어

끊임없는 공격 시도를 효율적으로 차단하기 위해 **Fail2ban**을 도입하기로 결정했습니다.

## 2.1 Fail2ban 이란 ?

[Fail2ban은 로그 파일을 실시간으로 모니터링하여 침입 시도를 차단하는 **Python 기반의 프레임워크입니다.**](https://github.com/fail2ban/fail2ban)

특정 시간 이내에 일정 횟수 이상 로그인이 실패한 IP를 감지하면, 즉시 시스템의 방화벽 규칙을 수정하여 해당 IP로부터 오는 모든 패킷을 차단합니다.

## 2.2 방화벽(Firewall)의 동작 이해

Fail2ban은 직접 패킷을 차단하는 것이 아니라, 리눅스 시스템의 방화벽 도구를 제어하여 명령을 내리는 **‘관제소’** 역할을 합니다.

- **iptables :** 리눅스 커널 수준에서 패킷 필터링을 수행하는 하부 시스템입니다.
- **UFW (Uncomplicated Firewall) :** 복잡한 iptables를 사용자가 더 쉽게 명령어로 제어할 수 있도록 돕는 인터페이스입니다.

⇒ Fail2ban은 로그 분석 결과에 따라 이 방화벽들에게 “방금 이 IP는 차단 목록에 추가해”라고 명령을 내리는 역할을 합니다.

---

# 3. 구현 과정

> Ubuntu 22.04 LTS 환경 기준으로 설정을 진행했습니다.
>

## 1. 패키지 설치

우선 패키지 관리자를 통해 Fail2ban을 설치합니다.

```bash
sudo apt update
sudo apt install fail2ban -y
```

## 2. 사용자 설정 파일 생성

Fail2ban의 기본 설정 파일인 `/etc/fail2ban/jail.conf` 는 패키지 업데이트 시 초기화될 위험이 있습니다.

따라서 사용자 정의 설정을 위해 반드시 `jail.local` 파일을 생성하여 관리해야 합니다.

```bash
# 기본 설정 파일을 복사하여 사용자 설정 파일 생성
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

## 3. 상세 설정

`jail.local` 파일 내에서 핵심 옵션들을 아래와 같이 구현했습니다.

```toml
[DEFAULT]
# 실수로 관리자 IP가 차단되는 것을 방지하는 화이트리스트 (공백으로 구분)
ignoreip = 127.0.0.1/8 ::1 {본인 내부망 IP}

# 차단 시간 (초 단위), 저는 24시간으로 설정했습니다.
bantime = 86400

# 감시 범위 (초 단위), 저는 최근 10분 내의 로그를 분석하도록 설정했습니다.
findtime = 600

# 최대 시도 횟수, 저는 2회 실패 시 즉시 차단하도록 했습니다.
maxretry = 2

[sshd]
# SSH 서비스 보호 활성화 여부
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
```

설정 변경 후 **서비스를 재시작하고 자동 실행을 등록**해줬습니다.

```bash
sudo systemctl restart fail2ban

# 서버 재부팅 시 자동 실행
sudo systemctl enable fail2ban
```

---

# 4. 결과 검증 및 분석

## 4.1 상태 확인 및 결과 분석

```bash
sudo fail2ban-client status {필터 이름}

# sshd 상태를 확인하는 경우
sudo fail2ban-client status sshd
```

![1.png](https://imgur.com/jV6rSVB.png)

- `Currently filed: 6` → 최근 감시 범위(`findtime`) 내에서 접속에 실패하여 실시간 감시 중인 IP가 6개 존재함을 의미하며, 이들은 아직 차단 임계치인 `2회` 에 도달하지 않은 상태입니다.
- `Currently banned: 23` → 현재 방화벽에 의해 완전히 격리된 공격 IP가 23개임을 의미합니다. 이 IP들로부터의 접속 시도는 이제 **서버 리소스를 소모하지 않고 네트워크 하부 단계에서 즉시 드랍**됩니다.
- `Total banned: 41` → Fail2ban 서비스 구동 이후 총 41개의 IP가 차단 이력을 가지고 있음을 의미합니다.

  *(일부는 `bantime` 이 경과하여 해제되었을 겁니다.)*


## 4.2 차단 해제 방법 (Unban)

오타나 설정 실수로 본인의 IP가 차단된 경우, 외부 네트워크(모바일 핫스팟 등)를 통해 접속하여 아래의 명령어로 해제할 수 있습니다.

```bash
sudo fail2ban-client set sshd unbanip {본인 IP 주소}
```

---

# 5. 마무리

SSH Key 인증이 서버의 물리적인 출입문을 강화한 작업이라면, **Fail2ban은 그 출입문을 두드리는 부적절한 대상을 실시간으로 적발하고 격리하는 시스템**과 같습니다.

이번 작업을 통해 무차별 대입 공격을오부터 발생하는 불필요한 시스템 부하를 줄였습니다. 개인 서버를 운영한다면, 성벽을 쌓는 것뿐만 아니라 그 성벽을 지키는 자동화된 방어 체계를 구축하는 것이 필수적임을 다시 한번 체감했습니다.