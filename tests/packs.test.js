const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { loadPacks, normalizePack, PackError } = require('../scripts/packs.js');
const { FALLBACKS, createSpriteRenderer } = require('../src/sprite.js');
const { build } = require('../scripts/build-userscript.js');

const SAMPLES = path.join(__dirname, '..', 'samples', 'characters');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

function tempPacks(packs, config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hw40-packs-'));
  for (const [folder, { spec, files = [] }] of Object.entries(packs)) {
    fs.mkdirSync(path.join(root, folder));
    fs.writeFileSync(path.join(root, folder, 'character.json'), JSON.stringify(spec));
    for (const f of files) fs.writeFileSync(path.join(root, folder, f), PNG);
  }
  if (config) fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
  return root;
}

const fileMap = (names) => (file, where) => {
  if (!names.includes(file)) throw new PackError(`${where}: "${file}" 파일이 없어요.`);
  return `data:image/png;base64,${file}`;
};

test('기본 캐릭터 샘플 팩 다섯 개가 규격대로 읽힌다', () => {
  const { packs } = loadPacks(SAMPLES);
  assert.deepStrictEqual(packs.map((p) => p.id), ['bora', 'hodu', 'kong', 'mong', 'ppyong']);
  for (const p of packs) {
    assert.ok(p.animations.idle.frames[0].startsWith('data:image/svg+xml;base64,'), p.id);
    assert.ok(Object.values(p.animations).some((a) => a.special), `${p.id} 특수 애니메이션`);
  }
  assert.strictEqual(packs.find((p) => p.id === 'bora').chaser, true);
  assert.deepStrictEqual(packs.find((p) => p.id === 'kong').animations.weed.special, { ms: 3200, text: '뽑았다!', sayAt: 2400, moving: false });
});

test('frames와 sheet, 기본값과 special을 읽는다', () => {
  const pack = normalizePack(
    {
      label: '테스트',
      animations: {
        idle: { frames: ['a.png', 'b.png'], fps: 4, motion: 'breathe' },
        walk: { sheet: 'walk.png', count: 6 },
        hop: { frames: ['a.png'] },
        dance: { frames: ['a.png'], special: true, duration: 2000, say: '룰루', moving: true },
      },
    },
    'test',
    fileMap(['a.png', 'b.png', 'walk.png']),
  );
  assert.strictEqual(pack.id, 'test');
  assert.strictEqual(pack.size, 64);
  assert.strictEqual(pack.facing, 'right');
  assert.strictEqual(pack.animations.idle.frames.length, 2);
  assert.strictEqual(pack.animations.idle.loop, true);
  assert.strictEqual(pack.animations.walk.count, 6);
  assert.strictEqual(pack.animations.hop.loop, false, 'hop은 기본이 한 번 재생');
  assert.deepStrictEqual(pack.animations.dance.special, { ms: 2000, text: '룰루', sayAt: 200, moving: true });
});

test('규격에 맞지 않으면 어디가 틀렸는지 알려준다', () => {
  const files = fileMap(['a.png']);
  const bad = (spec, re) => assert.throws(() => normalizePack(spec, 'x', files), (e) => e instanceof PackError && re.test(e.message));
  bad({ animations: { walk: { frames: ['a.png'] } } }, /"idle" 애니메이션은 꼭/);
  bad({ animations: { idle: { frames: ['a.png'], sheet: 'a.png' } } }, /하나만/);
  bad({ animations: { idle: { frames: ['없음.png'] } } }, /frames\[0\].*파일이 없어요/);
  bad({ animations: { idle: { frames: ['a.bmp'] } } }, /지원하지 않는 형식/);
  bad({ animations: { idle: { frames: ['../a.png'] } } }, /폴더 밖/);
  bad({ id: 'Bad Id', animations: { idle: { frames: ['a.png'] } } }, /id는/);
  bad({ animations: { idle: { frames: ['a.png'], motion: 'spin' } } }, /motion은/);
  bad({ animations: { idle: { frames: ['a.png'] }, walk: { frames: ['a.png'], special: true } } }, /트리거 이름/);
});

test('characters/ 폴더의 팩과 config.json이 스크립트에 묶인다', () => {
  const root = tempPacks(
    {
      cloud: { spec: { label: '구름', animations: { idle: { frames: ['idle.png'] } } }, files: ['idle.png'] },
      _draft: { spec: { animations: { idle: { frames: ['x.png'] } } } },
    },
    { builtin: ['kong', 'hodu'] },
  );
  const { script, packs } = build({ version: '1.4.0', baseUrl: null, repository: undefined, packsDir: root });
  const data = JSON.parse(packs.replace(/^globalThis\.HW40_PACKS = /, '').replace(/;$/, ''));
  assert.deepStrictEqual(data.builtin, ['kong', 'hodu']);
  assert.deepStrictEqual(data.packs.map((p) => p.id), ['cloud'], '_로 시작하는 폴더는 넣지 않는다');
  assert.match(script, /data:image\/png;base64,/);
  assert.doesNotThrow(() => new vm.Script(script));
});

test('같은 id의 팩이 둘이면 빌드가 멈춘다', () => {
  const spec = { id: 'dup', animations: { idle: { frames: ['i.png'] } } };
  const root = tempPacks({ a: { spec, files: ['i.png'] }, b: { spec, files: ['i.png'] } });
  assert.throws(() => loadPacks(root), /겹쳐요/);
});

function fakeEl() {
  const classes = new Set();
  return {
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      [Symbol.iterator]: () => classes.values(),
    },
    classes,
  };
}

test('재생기는 없는 트리거를 정해진 순서로 대신하고 프레임을 넘긴다', () => {
  const pack = {
    facing: 'right',
    animations: {
      idle: { frames: ['I0', 'I1'], fps: 2, loop: true, motion: 'breathe' },
      walk: { sheet: 'W', count: 4, fps: 4, loop: true, motion: 'none' },
      hop: { frames: ['H0', 'H1'], fps: 10, loop: false, motion: 'none' },
    },
  };
  const el = fakeEl();
  const render = createSpriteRenderer(pack, el);
  assert.strictEqual(render('idle', 0, 1), 1);
  assert.strictEqual(el.style.backgroundImage, 'url("I0")');
  assert.ok(el.classes.has('motion-breathe'));
  render('idle', 600, 1);
  assert.strictEqual(el.style.backgroundImage, 'url("I1")');

  // flee → hurry → walk 순서로 찾아 walk 시트를 쓴다
  assert.deepStrictEqual(FALLBACKS.flee, ['flee', 'hurry', 'walk', 'idle']);
  render('flee', 1000, 1);
  assert.strictEqual(el.style.backgroundImage, 'url("W")');
  assert.ok(!el.classes.has('motion-breathe'), '다른 애니메이션으로 바뀌면 효과도 바뀐다');
  render('flee', 1500, 1);
  assert.strictEqual(el.style.backgroundPosition, `${(2 / 3) * 100}% 0`);

  // 한 번 재생은 마지막 프레임에서 멈춘다
  render('click', 2000, 1);
  render('click', 9000, 1);
  assert.strictEqual(el.style.backgroundImage, 'url("H1")');
});

test('바라보는 방향과 _left 그림에 따라 좌우를 뒤집는다', () => {
  const anims = { idle: { frames: ['I'], fps: 1, loop: true, motion: 'none' } };
  const el = fakeEl();
  assert.strictEqual(createSpriteRenderer({ facing: 'right', animations: anims }, el)('idle', 0, -1), -1);
  assert.strictEqual(createSpriteRenderer({ facing: 'left', animations: anims }, el)('idle', 0, -1), 1);
  assert.strictEqual(createSpriteRenderer({ facing: 'front', animations: anims }, el)('idle', 0, -1), 1);
  const withLeft = { ...anims, walk: { frames: ['R'], fps: 1, loop: true, motion: 'none' }, walk_left: { frames: ['L'], fps: 1, loop: true, motion: 'none' } };
  const r = createSpriteRenderer({ facing: 'right', animations: withLeft }, el);
  assert.strictEqual(r('walk', 0, -1), 1, '왼쪽용 그림은 뒤집지 않는다');
  assert.strictEqual(el.style.backgroundImage, 'url("L")');
});

test('잡기·떨어지기·착지는 그림이 없으면 비슷한 그림으로 대신한다', () => {
  assert.deepStrictEqual(FALLBACKS.drag, ['drag', 'hop', 'idle']);
  assert.deepStrictEqual(FALLBACKS.fall, ['fall', 'flee', 'hurry', 'walk', 'idle']);
  assert.deepStrictEqual(FALLBACKS.land, ['land', 'hop', 'idle']);
  const one = (n) => ({ frames: [n], fps: 1, loop: true, motion: 'none' });
  const el = fakeEl();
  const r = createSpriteRenderer({ facing: 'right', animations: { idle: one('I'), walk: one('W'), hop: one('H') } }, el);
  r('drag', 0, 1);
  assert.strictEqual(el.style.backgroundImage, 'url("H")');
  r('fall', 100, 1);
  assert.strictEqual(el.style.backgroundImage, 'url("W")');
  const pack = normalizePack({ animations: { idle: { frames: ['a.png'] }, land: { frames: ['a.png'] } } }, 'x', fileMap(['a.png']));
  assert.strictEqual(pack.animations.land.loop, false, '착지는 기본이 한 번 재생');
});
