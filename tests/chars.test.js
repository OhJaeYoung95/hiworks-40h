const assert = require('node:assert');
const test = require('node:test');
const { normalizeCharacter, encodeCharacter, decodeCharacter, CharError, newId } = require('../src/chars.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const spec = (extra = {}) => ({
  id: 'my-test1',
  label: '구름이',
  size: 72,
  speed: 30,
  facing: 'right',
  lines: { celebrate: '퇴근이다!', meet: { default: '안녕' } },
  animations: {
    idle: { frames: [PNG, PNG], fps: 3, motion: 'breathe' },
    walk: { frames: [PNG], fps: 6 },
    sp1: { frames: [PNG], special: true, duration: 3000, say: '커피~', sayAt: 300 },
  },
  ...extra,
});

test('캐릭터 코드로 그림까지 그대로 주고받는다', async () => {
  const code = await encodeCharacter(spec());
  assert.match(code, /^HW40C1\.[A-Za-z0-9_-]+$/);
  assert.deepStrictEqual(await decodeCharacter(code), spec());
  // 메신저에서 줄이 바뀌어 붙여 넣어져도 읽는다
  assert.deepStrictEqual(await decodeCharacter(`${code.slice(0, 20)}\n ${code.slice(20)}\n`), spec());
});

test('캐릭터 설정을 엔진용 팩으로 바꾼다', () => {
  const pack = normalizeCharacter(spec());
  assert.strictEqual(pack.id, 'my-test1');
  assert.strictEqual(pack.label, '구름이');
  assert.deepStrictEqual(pack.animations.idle.frames, [PNG, PNG]);
  assert.strictEqual(pack.animations.idle.motion, 'breathe');
  assert.deepStrictEqual(pack.animations.sp1.special, { ms: 3000, text: '커피~', sayAt: 300, moving: false });
  assert.strictEqual(normalizeCharacter(spec({ size: 999 })).size, 160, '크기는 160px까지');
});

test('잘못된 캐릭터는 이유를 알려준다', async () => {
  const bad = (s, re) => assert.throws(() => normalizeCharacter(s), (e) => e instanceof CharError && re.test(e.message));
  bad(spec({ id: 'kong' }), /my-/);
  bad(spec({ animations: { walk: { frames: [PNG] } } }), /idle/);
  bad(spec({ animations: { idle: { frames: ['https://example.com/a.png'] } } }), /지원하지 않는/);
  bad(spec({ animations: { idle: { frames: ['data:text/html;base64,PHN2Zy8+'] } } }), /지원하지 않는/);
  bad(spec({ animations: { idle: { frames: [`data:image/png;base64,${'A'.repeat(1600 * 1024)}`] } } }), /너무 커요/);
  await assert.rejects(decodeCharacter('HW40T1.abc'), /캐릭터 코드가 아니에요/);
  await assert.rejects(decodeCharacter('HW40C1.%%%%'), /깨졌어요/);
});

test('새 캐릭터 id는 my-로 시작하고 겹치지 않는다', () => {
  const a = newId();
  assert.match(a, /^my-[a-z0-9]+$/);
  assert.notStrictEqual(a, newId());
});

test('기본 캐릭터 샘플을 내 캐릭터로 바꿔 코드로 주고받을 수 있다', async () => {
  const path = require('node:path');
  const { loadPacks } = require('../scripts/packs.js');
  const { packToSpec } = require('../src/chars.js');
  const kong = loadPacks(path.join(__dirname, '..', 'samples', 'characters')).packs.find((p) => p.id === 'kong');
  const spec = { ...packToSpec(kong), id: 'my-kong2', label: '내 콩떡이' };
  const pack = normalizeCharacter(spec);
  assert.deepStrictEqual(Object.keys(pack.animations).sort(), Object.keys(kong.animations).sort());
  assert.deepStrictEqual(pack.animations.weed.special, kong.animations.weed.special);
  const back = normalizeCharacter(await decodeCharacter(await encodeCharacter(spec)));
  assert.strictEqual(back.label, '내 콩떡이');
});
