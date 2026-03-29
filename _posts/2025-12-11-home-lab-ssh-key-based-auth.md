---
header:
  teaser: /assets/images/logo.png
  og_image: "https://i.imgur.com/IW4hBSN.png"

title: "[Home Lab #1] SSH 비밀번호 인증을 끄고 Ed25519 키 인증으로 전환하기"
excerpt: "인터넷에 노출된 홈서버 SSH를 비밀번호 인증에서 Ed25519 공개키 인증으로 전환하며, 왜 바꿔야 하는지와 Ubuntu 24.04에서 안전하게 적용하는 순서를 정리했다."
categories:
  - Home Lab
tags:
  - SSH
  - Security
  - Ubuntu
  - Linux
  - Ed25519

toc_label: "SSH 키 인증 전환"
toc: true
toc_sticky: true

permalink: /home-lab/home-lab-ssh-key-based-auth/
redirect_from:
  - /home lab/home-lab-ssh-key-based-auth/
date: 2025-12-11
last_modified_at: 2026-03-30
---

![mainImage](https://i.imgur.com/IW4hBSN.png)

미니 PC에 Ubuntu를 설치하고 홈서버로 운영하기 시작했을 때, 가장 먼저 필요했던 것은 **원격 접속 경로**였습니다. 키보드와 모니터를 계속 연결해 둘 수는 없었고, 집 밖에서도 노트북 하나로 서버를 관리하고 싶었습니다. 그래서 가장 먼저 연 것이 SSH였습니다.

처음에는 비밀번호 인증만 켜둔 상태로 접속했습니다. 당장 접속은 쉬웠지만, 인터넷에 노출된 SSH 포트는 생각보다 빠르게 자동화된 스캔 대상이 됩니다. "복잡한 비밀번호 하나면 충분하지 않을까"라고 생각했던 지점이 가장 먼저 흔들린 것도 바로 여기였습니다.

이 글에서는 **왜 비밀번호 인증을 끄기로 했는지**, **SSH 공개키 인증이 실제로 어떻게 동작하는지**, **Ubuntu 24.04 서버에서 Ed25519 키 기반 인증으로 안전하게 전환하는 순서**를 한 번에 정리합니다.

<aside>
<strong>이 글의 기준 환경</strong>
<ul>
  <li>클라이언트: macOS</li>
  <li>서버: Ubuntu 24.04 LTS</li>
  <li>목표 상태: 비밀번호 인증 비활성화, Ed25519 공개키 인증만 허용</li>
</ul>
</aside>

# 1. 왜 SSH에서 비밀번호 인증부터 걷어냈나

SSH 포트를 외부에 열어두면, 누가 내 서버 주소를 알고 있을 때만 접속을 시도하는 것이 아닙니다. 인터넷을 스캔하는 봇들이 흔한 계정명과 비밀번호 조합을 계속 던져보는 일이 훨씬 더 일반적입니다.

비밀번호 인증이 특히 불편하게 느껴진 이유는 아래 세 가지였습니다.

- 비밀번호는 결국 **사람이 기억하고 입력할 수 있는 문자열**이라 공격 표면이 넓습니다.
- 같은 비밀번호를 여러 곳에 재사용하거나, 길어도 예측 가능한 패턴을 쓰기 쉽습니다.
- 서버 입장에서는 로그인 시도마다 인증 절차를 수행해야 하므로, 실패 시도 자체가 계속 쌓입니다.

결국 문제는 "비밀번호가 약할 수 있다"보다, **비밀번호라는 인증 방식 자체가 인터넷에 노출된 SSH 엔드포인트와 잘 맞지 않는다**는 데 있었습니다.

# 2. SSH 공개키 인증은 어떻게 동작하나

SSH(Secure Shell)는 네트워크를 통해 다른 시스템에 안전하게 접속하고 명령을 실행하기 위한 암호화 프로토콜입니다. 예전의 Telnet처럼 평문으로 인증 정보를 주고받는 방식과 달리, SSH는 접속 과정과 세션 전체를 암호화합니다.

공개키 인증은 여기에 **비대칭키 암호화**를 결합합니다. 로컬 컴퓨터에는 **비공개키(Private Key)**를 두고, 서버에는 짝이 되는 **공개키(Public Key)**를 등록합니다.

> SSH 공개키 인증은 **비공개키를 서버에 보내는 방식이 아니라, 비공개키로 만든 서명을 서버가 공개키로 검증하는 방식**이다.

실제 인증 흐름은 아래처럼 이해하면 됩니다.

1. 클라이언트가 서버에 접속하면서 공개키 인증을 시도합니다.
2. 서버는 해당 사용자의 `~/.ssh/authorized_keys`에서 일치하는 공개키를 찾습니다.
3. 서버는 현재 세션 정보를 바탕으로 검증용 데이터를 만들고, 클라이언트는 이 데이터에 **비공개키로 서명**합니다.
4. 서버는 저장해 둔 공개키로 그 서명을 검증합니다.
5. 검증이 성공하면 서버는 "이 비공개키를 실제로 가진 클라이언트"라고 판단하고 접속을 허용합니다.

중요한 점은 **비공개키가 로컬 머신 밖으로 나가지 않는다**는 것입니다. 서버에 저장되는 것은 공개키뿐이고, 공격자가 로그인하려면 결국 내 로컬에 있는 비공개키와 그 키의 패스프레이즈까지 함께 확보해야 합니다.

![SSH 공개키 인증 흐름](https://i.imgur.com/MhEwqHC.png)

*(이해를 돕기 위해 Gemini로 흐름 이미지를 생성했습니다.)*

# 3. 왜 RSA 대신 Ed25519를 골랐나

`ssh-keygen`을 실행하면 `RSA`, `Ed25519` 같은 알고리즘을 선택할 수 있습니다. 홈서버의 기본값으로는 `Ed25519`가 더 합리적이라고 판단했습니다.

## RSA

RSA는 오랫동안 널리 사용된 알고리즘이라 호환성이 좋습니다. 다만 현재 기준 보안 강도를 맞추려면 키 길이를 충분히 크게 잡아야 하고, 그만큼 키 파일과 연산 비용도 커집니다.

- 구형 시스템과의 호환성이 필요할 때 여전히 유용합니다.
- 보안 수준을 충분히 확보하려면 더 긴 키 길이를 써야 합니다.
- 키 크기가 커질수록 생성, 서명, 검증 비용도 함께 커집니다.

## Ed25519

Ed25519는 현대적인 타원곡선 기반 서명 알고리즘입니다. SSH 용도로는 짧은 키 길이, 빠른 연산, 간단한 사용성이 강점입니다.

- 기본 키 길이가 짧아 관리가 단순합니다.
- 서명과 검증 속도가 빠르고 실사용 성능이 좋습니다.
- 현재의 일반적인 Linux, macOS, OpenSSH 환경에서는 지원이 잘 갖춰져 있습니다.

정리하면, **아주 오래된 장비와의 호환성이 절대적으로 중요하지 않다면 Ed25519가 더 나은 기본값**에 가깝습니다.

# 4. Ubuntu 서버를 키 인증만 허용하도록 바꾼 순서

## 4.1 로컬에서 Ed25519 키 쌍 생성

먼저 SSH에 사용할 키를 로컬에서 생성합니다.

```bash
ssh-keygen -t ed25519 -a 100 -C "home-lab"
```

- `-t ed25519`: 키 알고리즘으로 `Ed25519`를 선택합니다.
- `-a 100`: 패스프레이즈를 설정했을 때 키 파생 함수(KDF) 반복 횟수를 늘려 키 파일 탈취 시 저항성을 높입니다.
- `-C "home-lab"`: 이 키가 어디에 쓰이는지 식별하기 위한 주석입니다.

명령을 실행하면 저장 경로를 묻습니다. 하나의 기본 키만 쓴다면 `~/.ssh/id_ed25519`를 그대로 사용해도 충분합니다. 다만 서버가 여러 대라면 `id_ed25519_homelab`처럼 별도 파일명으로 분리하는 편이 관리하기 쉽습니다.

그리고 가능하면 **패스프레이즈도 함께 설정하는 쪽이 좋습니다.** 비공개키 파일이 유출되더라도 패스프레이즈가 한 번 더 방어선이 되어주기 때문입니다.

## 4.2 공개키를 서버에 등록

생성된 공개키(`.pub`)를 서버의 `authorized_keys`에 넣어야 합니다.

`ssh-copy-id`를 사용할 수 있는 환경이라면 가장 간단합니다.

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub username@your_server_ip
```

이 명령은 서버의 `~/.ssh/authorized_keys`에 공개키를 추가해 줍니다.

환경에 따라 `ssh-copy-id`가 없다면 직접 넣어도 됩니다.

```bash
cat ~/.ssh/id_ed25519.pub | ssh username@your_server_ip \
  'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
```

이때 서버 쪽 `~/.ssh` 디렉터리와 `authorized_keys` 파일 권한이 너무 느슨하면 SSH가 키를 무시할 수 있으므로, 권한까지 함께 맞추는 것이 중요합니다.

## 4.3 비밀번호를 끄기 전에 새 세션에서 먼저 로그인 테스트

공개키를 올렸다면, **아직 비밀번호 인증을 끄기 전에** 새 터미널 창에서 로그인부터 확인합니다.

```bash
ssh username@your_server_ip
```

기본 경로(`~/.ssh/id_ed25519`)가 아니라 다른 파일명으로 키를 만들었다면 `-i`로 명시합니다.

```bash
ssh -i ~/.ssh/id_ed25519_homelab username@your_server_ip
```

로그인이 정상적으로 되고, 패스프레이즈를 설정했다면 그 프롬프트만 뜬 뒤 바로 접속되면 준비가 끝난 것입니다.

<aside>
<strong>가장 중요한 순서</strong>
비밀번호 인증을 끄기 전에는 현재 접속 중인 SSH 세션을 닫지 말고, 반드시 새 터미널 창에서 공개키 로그인 성공을 먼저 확인해야 합니다. 이 순서를 건너뛰면 서버에 스스로 잠길 수 있습니다.
</aside>

## 4.4 SSH 설정에서 비밀번호 인증 차단

Ubuntu 24.04에서는 `/etc/ssh/sshd_config` 본문을 직접 수정하는 대신, `sshd_config.d` 아래에 드롭인 파일을 두는 방식이 관리하기 편합니다.

```bash
sudo sudoedit /etc/ssh/sshd_config.d/99-publickey-only.conf
```

파일에는 아래처럼 최소 설정만 넣었습니다.

```text
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
```

각 항목의 의미는 다음과 같습니다.

- `PubkeyAuthentication yes`: 공개키 인증을 허용합니다.
- `PasswordAuthentication no`: 일반 비밀번호 인증을 끕니다.
- `KbdInteractiveAuthentication no`: 키보드 입력 기반의 추가 인증 경로를 끕니다.

예전 문서에서는 `ChallengeResponseAuthentication no`를 함께 넣는 예시를 자주 보는데, 현재 OpenSSH 문서에서는 `KbdInteractiveAuthentication` 항목을 직접 확인하는 편이 더 명확합니다.

추가로, 루트 계정 직접 로그인이 필요 없다면 `PermitRootLogin no`도 함께 검토할 만합니다. 다만 운영 방식에 따라 영향이 있으므로 이번 글에서는 핵심 전환 범위에서만 다뤘습니다.

## 4.5 설정 검증 후 SSH 재적용

설정을 저장했다면 바로 재시작하기보다 먼저 문법을 검사합니다.

```bash
sudo sshd -t
```

출력이 없다면 문법 검사는 통과한 것입니다. 그다음 SSH 데몬 설정을 다시 읽힙니다.

```bash
sudo systemctl reload ssh
```

실제로 어떤 값이 적용됐는지는 아래 명령으로 다시 확인할 수 있습니다.

```bash
sudo sshd -T | grep -E 'pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication'
```

기대한 출력은 다음과 같습니다.

```text
pubkeyauthentication yes
passwordauthentication no
kbdinteractiveauthentication no
```

이후 새 터미널에서 다시 접속해 보고, 키가 없는 환경에서 접속하면 `Permission denied (publickey)`처럼 거절되는지 확인하면 전환이 끝납니다.

## 4.6 선택 사항: `~/.ssh/config`로 접속 이름 정리

서버를 한 대 이상 운영한다면 클라이언트 쪽 설정도 함께 정리하는 편이 좋습니다.

```config
Host homelab
    HostName your_server_ip
    User username
    IdentityFile ~/.ssh/id_ed25519_homelab
    IdentitiesOnly yes
```

이제부터는 아래처럼 더 짧게 접속할 수 있습니다.

```bash
ssh homelab
```

키 파일을 여러 개 쓰는 환경에서는 이런 별칭이 실수를 줄이는 데 꽤 도움이 됩니다.

# 5. 여기서 끝은 아니다

비밀번호 인증을 껐다고 해서 SSH 보안이 끝난 것은 아닙니다. 이번 작업은 **가장 넓은 공격 표면 하나를 먼저 줄인 것**에 가깝습니다.

이후에도 같이 챙겨야 할 것들은 남아 있습니다.

- OS와 OpenSSH 패키지를 계속 업데이트할 것
- SSH 로그를 확인하고 반복 시도 IP를 차단할 것
- 비공개키에 패스프레이즈를 설정하고 안전하게 백업할 것
- 필요하다면 방화벽과 포트 공개 범위를 더 좁힐 것

저는 이 작업 다음 단계로 SSH 로그를 분석하고, [Fail2ban으로 반복 시도 IP를 자동 차단하는 설정](/home-lab/home-lab-fail2ban/)까지 이어서 적용했습니다.

# 6. 마무리

홈서버에서 SSH를 여는 일은 단순히 "원격으로 편하게 접속한다"는 수준에서 끝나지 않았습니다. 인터넷과 직접 맞닿는 출입구를 하나 열어두는 일이기도 했습니다. 그래서 이번 전환에서 얻은 가장 큰 변화는 편의성보다도 **공격 표면을 줄였다는 확신**이었습니다.

SSH는 한 번 열어두면 계속 외부와 맞닿아 있는 관리 채널입니다. 그래서 홈서버를 처음 열 때부터 비밀번호보다 **공개키 기반 인증을 기본값으로 두는 편이 훨씬 안전한 출발점**이라고 느꼈습니다.

# 참고 자료

- [가비아 라이브러리](https://library.gabia.com/contents/infrahosting/9002/)
- [홈 서버 구축기 - OS 설치부터 SSH 연결 설정까지](https://hyeon9mak.github.io/home-server-ssh-setting/)
- [How to Set Up SSH Keys on Ubuntu](https://www.digitalocean.com/community/tutorials/how-to-set-up-ssh-keys-on-ubuntu-22-04)
