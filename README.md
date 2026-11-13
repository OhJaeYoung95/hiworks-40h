# 하이웍스 40시간 퇴근 계산기

하이웍스 근무 페이지에 금요일 퇴근 가능 시각을 띄우고, 오리지널 캐릭터(콩떡이, 뿅이, 호두)가 화면 아래를 돌아다니는 Tampermonkey 스크립트입니다.

> 하이웍스와 관계없는 개인이 만든 **비공식 도구**입니다. 화면 글자를 읽어 계산만 하고, 어떤 데이터도 외부로 보내지 않습니다.

- **사용자:** 배포된 안내 페이지(`https://<계정>.github.io/hiworks-40h/`)에서 설치합니다. 이후 업데이트는 자동입니다.
- **관리자:** 이 저장소의 `main`에 올리면 테스트 → 빌드 → 배포가 자동으로 진행됩니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `src/config.js` | **회사 근무 규칙** (주 근무시간, 점심시간, 금요일 퇴근 시각). 규칙이 바뀌면 여기만 고칩니다 |
| `src/calc.js` | 화면 글자 읽기와 퇴근 시각 계산 |
| `src/content.js` | 오른쪽 아래 패널 |
| `src/mascot.js` | 캐릭터 엔진: 상황을 보고 애니메이션 트리거를 정합니다 |
| `src/builtin-characters.js` | 기본 캐릭터 다섯(SVG 그림·대사) |
| `src/sprite.js` | 캐릭터 팩 재생기 (하이웍스 화면과 작업실이 같이 씀) |
| `src/chars.js` | 내 캐릭터 코드(그림 포함)의 규격·압축 (하이웍스 화면과 캐릭터 만들기 화면이 같이 씀) |
| `src/themes.js` | 테마 규격과 공유 코드 (하이웍스 화면·빌드·테마 만들기 화면이 같이 씀) |
| `characters/` | **캐릭터 팩**. 규격은 [characters/README.md](characters/README.md) |
| `themes/` | **공용 테마**. 모두의 🎨 목록에 나옵니다. 규격은 [themes/README.md](themes/README.md) |
| `samples/characters/` | 기본 캐릭터를 팩 규격으로 뽑은 샘플 (`npm run samples`로 다시 만듦) |
| `src/manifest.json` | 이름, 설명, 실행 주소, 버전의 "주.부" 부분. 로컬 테스트용 확장 프로그램 설정도 겸합니다 |
| `scripts/build-userscript.js` | `src/`와 `characters/`를 Tampermonkey 스크립트 하나로, 안내 페이지·작업실과 함께 만듭니다 |
| `scripts/packs.js` | 캐릭터 팩 규격 검사 (빌드와 작업실이 같이 씀) |
| `site/index.html` | 동료용 설치 안내 페이지 원본 |
| `site/studio.html` | 캐릭터 팩 작업실. 배포 후 `…/hiworks-40h/studio.html` |
| `site/maker.html` | 캐릭터 만들기 화면. 그림을 끌어다 놓아 캐릭터 코드를 만듭니다. 배포 후 `…/hiworks-40h/maker.html` |
| `site/themes.html` | 테마 만들기 화면. 배포 후 `…/hiworks-40h/themes.html` |
| `.github/workflows/deploy.yml` | 자동 배포 설정 |
| `tests/` | 계산·빌드·팩·테마 테스트와 동작 확인용 모의 페이지 |

## 처음 한 번 설정

1. **GitHub 계정**에 **2단계 인증**을 켭니다. 이 저장소에 올린 코드가 동료들 근무 페이지에서 실행되므로 꼭 필요합니다.
2. GitHub에서 **공개(Public)** 저장소 `hiworks-40h`를 만들고 이 폴더를 올립니다.
3. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
4. **Actions** 탭에서 "배포"가 초록색으로 끝나면 `https://<계정>.github.io/hiworks-40h/`가 열립니다. 이 주소를 동료들에게 보내면 됩니다.

## 수정하고 배포하기

1. `src/`의 파일을 고칩니다.
2. 확인합니다.
   ```bash
   npm test
   ```
3. `main`에 올립니다. 1~2분 뒤 배포되고, 동료들의 Tampermonkey가 보통 하루 안에 새 버전을 받습니다.

버전은 자동으로 올라갑니다. `manifest.json`의 `"version": "1.3.0"`에서 앞의 `1.3`에 배포 번호가 붙어 `1.3.12`처럼 됩니다. 큰 변경이면 `1.4.0`처럼 앞자리를 올리세요.

공개 저장소이므로 원작 캐릭터 이미지나 대사처럼 저작권이 있는 내용은 올리지 마세요.

## 다른 PC에서 작업하기

```bash
git clone https://github.com/<계정>/hiworks-40h.git
```

Node.js 20 이상이 필요합니다. 별도 패키지 설치는 없습니다.

## 화면으로 확인하기

```bash
npm run build
```

```bash
npm run mock
```

브라우저에서 `http://localhost:4173/tests/mock.html`을 엽니다.

- `?t=19:42:10`: 시각을 바꿔 퇴근 축하 등 상태별 동작 확인
- `?r=0.4`: 캐릭터 시작 위치 고정
- `?build=1`: `src/` 대신 빌드된 스크립트로 확인

실제 하이웍스 페이지에서 배포 전에 시험하려면, Tampermonkey를 잠시 끄고 `chrome://extensions`에서 `src` 폴더를 **압축해제된 확장 프로그램**으로 로드하면 됩니다.
