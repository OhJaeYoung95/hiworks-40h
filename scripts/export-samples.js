// 기본 캐릭터들을 캐릭터 팩 규격으로 뽑아 samples/characters/ 에 둔다.
//
//   npm run samples
//
// 상태마다 SVG 파일 하나를 만든다. 각 SVG 안에 CSS 애니메이션이 들어 있어 파일 하나로 움직인다.
// 폴더를 characters/ 로 복사하면 같은 id의 기본 캐릭터 대신 그 팩이 쓰인다.
const fs = require('node:fs');
const path = require('node:path');
const { characters, meetLines, artCss, confetti } = require('../src/builtin-characters.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'samples', 'characters');
// 그림 밖으로 나가는 소품(색종이, 상장, 잡초)까지 담도록 64×64 그림 둘레에 여백을 둔다.
const VIEW = { x: -10, y: -20, size: 84 };

// 이미지 안의 애니메이션은 한 번 끝나면 다시 시작하지 않으므로, 한 번만 도는 애니메이션은 반복으로 바꾼다.
const css = artCss.replace(/\bforwards\b/g, 'infinite');

const svgFor = (def, stateClass) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.size} ${VIEW.size}"`,
    ` width="${VIEW.size}" height="${VIEW.size}" class="${stateClass}">`,
    `<style>${css}</style>`,
    def.art,
    confetti,
    '</svg>\n',
  ].join('');

function meetFor(id) {
  const meet = {};
  for (const [pair, lines] of Object.entries(meetLines)) {
    const [a, b] = pair.split('+');
    if (a === id && lines[a]) meet[b] = lines[a];
    if (b === id && lines[b]) meet[a] = lines[b];
  }
  return meet;
}

function exportCharacter(def) {
  const dir = path.join(OUT, def.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const animations = {};
  const add = (name, stateClass, extra = {}) => {
    const file = `${name}.svg`;
    fs.writeFileSync(path.join(dir, file), svgFor(def, stateClass));
    animations[name] = { frames: [file], ...extra };
  };

  add('idle', 'idle');
  add('walk', 'walk');
  add('hurry', 'walk fast');
  add('celebrate', 'party');
  // 눈 감은 그림이 있는 캐릭터만 휴식용 그림을 따로 둔다. 없으면 idle로 대신한다.
  if (def.art.includes('id="eyes-closed"')) add('rest', 'skit-nap');
  for (const [name, skit] of Object.entries(def.skits)) {
    add(name, `skit-${name}`, {
      special: true,
      duration: skit.ms,
      say: skit.text,
      sayAt: skit.sayAt,
      ...(skit.moving ? { moving: true } : {}),
    });
  }

  const pack = {
    id: def.id,
    label: def.label,
    size: VIEW.size,
    speed: def.speed,
    pauseChance: def.pauseChance,
    ...(def.chaser ? { chaser: true } : {}),
    facing: 'right',
    lines: { celebrate: def.partyLine, rest: def.restLine, meet: meetFor(def.id) },
    animations,
  };
  fs.writeFileSync(path.join(dir, 'character.json'), `${JSON.stringify(pack, null, 2)}\n`);
  return Object.keys(animations);
}

if (require.main === module) {
  for (const def of characters) console.log(`samples/characters/${def.id}: ${exportCharacter(def).join(', ')}`);
}

module.exports = { exportCharacter, OUT };
