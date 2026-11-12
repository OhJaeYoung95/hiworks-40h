# 캐릭터 팩

이 폴더에 캐릭터 팩을 넣으면 배포할 때 스크립트에 함께 묶여 모든 사용자에게 나옵니다.
엔진(`src/mascot.js`)은 지금 상황에 맞는 **트리거**만 정하고, 실제 그림은 팩 파일대로 재생합니다.

```
characters/
├─ config.json          (선택) 기본 캐릭터 켜고 끄기
└─ <id>/
   ├─ character.json    팩 설정
   └─ *.png / *.gif / *.webp / *.jpg / *.svg
```

- 폴더 이름이 `_`로 시작하면 작업 중으로 보고 배포에 넣지 않습니다. 예: `_draft/`
- 팩 `id`가 기본 캐릭터(`kong`, `ppyong`, `hodu`, `mong`, `bora`)와 같으면 그 캐릭터를 대신합니다.
- 기본 캐릭터 다섯을 이 규격으로 뽑아 둔 샘플이 `samples/characters/`에 있습니다. 폴더를 그대로 여기로 복사해 고쳐 쓰면 됩니다.

## 작업 순서

1. **작업실**을 엽니다: https://ohjaeyoung95.github.io/hiworks-40h/studio.html
2. **팩 폴더 열기**로 `characters/<id>` 폴더(또는 `characters` 폴더)를 고릅니다.
3. 파일을 고치면 작업실이 자동으로 다시 읽습니다. 규격 오류, 빠진 트리거, 트리거 버튼별 재생을 확인합니다.
4. 커밋하고 푸시하면 테스트 → 빌드 → 배포가 자동으로 진행됩니다. 규격이 틀리면 빌드가 멈추고 GitHub Actions에 이유가 나옵니다.

로컬에서 미리 보려면 `npm run build`를 하고, `npm run mock` 후 `http://localhost:4173/tests/mock.html` 또는 `http://localhost:4173/dist/studio.html`을 엽니다.

## character.json

```json
{
  "id": "cloud",
  "label": "구름이",
  "size": 64,
  "speed": 30,
  "pauseChance": 0.5,
  "chaser": false,
  "bounce": true,
  "facing": "right",
  "lines": {
    "celebrate": "퇴근이다!",
    "rest": "Zz",
    "meet": { "default": "안녕!", "kong": "콩떡아 안녕" }
  },
  "animations": {
    "idle":  { "frames": ["idle1.png", "idle2.png"], "fps": 2 },
    "walk":  { "sheet": "walk.png", "count": 4, "fps": 8 },
    "walk_left": { "sheet": "walk-left.png", "count": 4, "fps": 8 },
    "hop":   { "frames": ["hop.png"], "motion": "none" },
    "dance": { "frames": ["d1.png", "d2.png"], "fps": 6, "special": true, "duration": 3000, "say": "룰루", "sayAt": 200 }
  }
}
```

| 항목 | 기본값 | 설명 |
|---|---|---|
| `id` | 폴더 이름 | 영문 소문자로 시작, 영문·숫자·`-` |
| `label` | id | 화면에 쓰는 이름 |
| `size` | 64 | 캐릭터 상자 크기(px). 그림은 이 상자 안에 바닥 가운데로 맞춰집니다 |
| `speed` | 30 | 걷는 속도(px/초). 서두를 때·도망칠 때는 2.7배 |
| `pauseChance` | 0.5 | 걷다가 멈출 확률(0~1). 멈추면 가끔 특수 애니메이션을 재생 |
| `chaser` | false | true면 30~50초마다 다른 캐릭터를 쫓아갑니다 (보라괴물처럼) |
| `bounce` | true | 폴짝·축하 때 엔진이 위아래로 튀게 할지. 그림 자체에 점프가 있으면 false |
| `facing` | right | 그림이 보는 방향. `right`/`left`는 반대로 걸을 때 좌우를 뒤집고, `front`는 뒤집지 않습니다 |
| `lines` | | 말풍선 대사. `meet`은 상대 id별 대사, 없으면 `default` |

### 애니메이션 하나

| 항목 | 기본값 | 설명 |
|---|---|---|
| `frames` | | 프레임 이미지 목록. 한 장이면 정지 그림(또는 움직이는 GIF·SVG) |
| `sheet` + `count` | | 가로로 이어 붙인 스프라이트 시트와 칸 수. `frames`와 둘 중 하나만 |
| `fps` | 8 | 초당 프레임 |
| `loop` | true | 반복 여부 (`hop`, `click`은 기본이 한 번 재생) |
| `motion` | none | 엔진이 덧붙이는 움직임: `bob`(통통), `breathe`(숨쉬기), `shake`(떨림), `wobble`(흔들흔들) |
| `special` | false | true면 그 캐릭터만의 특수 애니메이션. 쉬는 중에 가끔 재생 |
| `duration` | 3000 | 특수: 재생 시간(ms) |
| `say` / `sayAt` | | 특수: 말풍선 대사와 나오는 시점(ms) |
| `moving` | false | 특수: 재생하면서 빠르게 이동 |

이름 뒤에 `_left`를 붙인 애니메이션(예: `walk_left`)이 있으면 왼쪽으로 갈 때 뒤집지 않고 그 그림을 씁니다.
방향별로 그린 스프라이트 시트를 쓸 때 사용합니다.

## 트리거

엔진은 아래 순서로 상황을 보고 트리거를 하나 고릅니다. 팩에 그 애니메이션이 없으면 오른쪽 순서대로 대신 재생합니다.
`idle`은 꼭 있어야 하고, 나머지는 없어도 됩니다.

| 트리거 | 언제 | 없으면 |
|---|---|---|
| `celebrate` | 40시간을 채워 축하할 때 | `hop` → `idle` |
| `rest` | 퇴근해서 쉬는 중 | `idle` |
| `hurry` | 퇴근 1시간 전, 축하·휴식 자리로 갈 때 | `walk` → `idle` |
| `flee` | 괴물에게 쫓겨 도망갈 때 | `hurry` → `walk` → `idle` |
| `chase` | 쫓아갈 때 (`chaser` 팩) | `hurry` → `walk` → `idle` |
| `hop` | 가끔 폴짝 뛸 때, 놀랐을 때 | `idle` |
| `click` | 캐릭터를 눌렀을 때 | `hop` → `idle` |
| 특수 이름 | 쉬는 중 가끔 (`special: true`) | `idle` |
| `meet` | 다른 캐릭터와 마주쳐 대화할 때 | `idle` |
| `walk` | 돌아다닐 때 | `idle` |
| `idle` | 멈춰 있을 때 | (필수) |

## config.json (선택)

```json
{ "builtin": ["kong", "hodu"] }
```

`builtin`에 적은 기본 캐릭터만 나옵니다. 빈 목록(`[]`)이면 기본 캐릭터 없이 팩만 나옵니다. 파일이 없으면 기본 캐릭터가 모두 나옵니다.

## 주의

- 이미지는 스크립트 안에 묶여 모든 사용자에게 배포되고, 이 저장소는 공개 저장소입니다. **직접 만들었거나 배포해도 되는 그림만** 넣어 주세요. 다른 작품의 캐릭터를 그대로 쓰거나 따라 그린 그림은 넣지 마세요.
- 팩 하나가 3MB를 넘으면 빌드 때 경고가 나옵니다. 큰 PNG는 줄이거나 시트로 합쳐 주세요.
