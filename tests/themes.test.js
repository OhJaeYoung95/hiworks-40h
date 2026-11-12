const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeTheme, encodeTheme, decodeTheme, ThemeError, MAX_CAST } = require('../src/themes.js');
const { build } = require('../scripts/build-userscript.js');

const known = new Set(['kong', 'hodu', 'mong']);

test('공유 코드는 한글 이름까지 그대로 주고받는다', () => {
  const theme = { name: '우리 팀 🐾', cast: [{ id: 'kong', name: '떡이' }, { id: 'hodu', size: 96 }] };
  const code = encodeTheme(theme);
  assert.match(code, /^HW40T1\.[A-Za-z0-9_-]+$/);
  assert.deepStrictEqual(decodeTheme(code), theme);
  assert.deepStrictEqual(decodeTheme(`  ${code.slice(0, 10)}\n${code.slice(10)} `), theme, '줄바꿈·공백이 섞여도 읽는다');
  assert.deepStrictEqual(decodeTheme(JSON.stringify(theme)), theme, 'JSON 그대로도 읽는다');
});

test('테마를 규격에 맞게 고치고, 없는 캐릭터는 빼고 알려준다', () => {
  const { theme, warnings } = normalizeTheme(
    { name: '  <b>팀</b>  ', cast: ['kong', { id: 'ghost' }, { id: 'mong', name: '아주아주아주아주긴이름입니다', size: 999 }, { id: 'hodu', size: 'x' }] },
    known,
  );
  assert.strictEqual(theme.name, 'b팀/b');
  assert.deepStrictEqual(theme.cast, [{ id: 'kong' }, { id: 'mong', name: '아주아주아주아주긴이름입', size: 160 }, { id: 'hodu' }]);
  assert.match(warnings.join(), /ghost/);
  const many = normalizeTheme({ cast: Array(MAX_CAST + 3).fill('kong') }, known);
  assert.strictEqual(many.theme.cast.length, MAX_CAST);
  assert.strictEqual(many.theme.name, '이름 없는 테마');
});

test('잘못된 코드와 빈 테마는 이유를 알려준다', () => {
  assert.throws(() => decodeTheme('안녕하세요'), (e) => e instanceof ThemeError && /HW40T1/.test(e.message));
  assert.throws(() => decodeTheme('HW40T1.%%%'), /깨졌어요/);
  assert.throws(() => normalizeTheme({ cast: ['ghost'] }, known), /하나도 없어요/);
  assert.throws(() => normalizeTheme({ name: 'x' }, known), /cast/);
});

test('themes/ 폴더의 공용 테마가 스크립트에 묶이고, 없는 캐릭터면 빌드가 멈춘다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hw40-themes-'));
  fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({ name: '팀', cast: ['kong', { id: 'bora', name: '괴물' }] }));
  fs.writeFileSync(path.join(dir, '_draft.json'), '{ 아직 작성 중');
  const { packs } = build({ version: '1.5.0', baseUrl: 'https://me.github.io/hiworks-40h/', repository: 'me/hiworks-40h', themesDir: dir });
  const data = JSON.parse(packs.replace(/^globalThis\.HW40_PACKS = /, '').replace(/;$/, ''));
  assert.deepStrictEqual(data.themes, [{ id: 'team', name: '팀', cast: [{ id: 'kong' }, { id: 'bora', name: '괴물' }] }]);
  assert.strictEqual(data.site, 'https://me.github.io/hiworks-40h/');

  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ name: '틀림', cast: ['nobody'] }));
  assert.throws(() => build({ version: '1.5.0', baseUrl: null, repository: undefined, themesDir: dir }), /themes\/bad\.json/);
});

test('저장소의 공용 테마는 규격에 맞는다', () => {
  assert.doesNotThrow(() => build({ version: '1.5.0', baseUrl: null, repository: undefined }));
});
