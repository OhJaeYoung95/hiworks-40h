const assert = require('node:assert');
const test = require('node:test');
const vm = require('node:vm');
const { build, resolveVersion, pagesUrl } = require('../scripts/build-userscript.js');

test('배포 때마다 버전이 올라간다', () => {
  assert.strictEqual(resolveVersion('1.3.0', undefined), '1.3.0');
  assert.strictEqual(resolveVersion('1.3.0', '42'), '1.3.42');
});

test('GitHub Pages 주소는 계정 이름을 소문자로 쓴다', () => {
  assert.strictEqual(pagesUrl('MyName/hiworks-40h'), 'https://myname.github.io/hiworks-40h/');
  assert.strictEqual(pagesUrl(undefined), null);
});

test('스크립트 머리말에 실행 주소와 자동 업데이트 주소가 들어간다', () => {
  const { script } = build({
    version: '1.3.7',
    baseUrl: 'https://me.github.io/hiworks-40h/',
    repository: 'me/hiworks-40h',
  });
  assert.match(script, /^\/\/ ==UserScript==/);
  assert.match(script, /@version {6}1\.3\.7\n/);
  // 어느 근무 페이지에서나 켤 수 있게 모든 사이트에서 읽히고, Tampermonkey 메뉴로 사이트를 등록한다.
  assert.match(script, /@match {8}\*:\/\/\*\/\*\n/);
  assert.match(script, /@updateURL {4}https:\/\/me\.github\.io\/hiworks-40h\/hiworks-40h\.user\.js\n/);
  assert.match(script, /@downloadURL {2}https:\/\/me\.github\.io\/hiworks-40h\/hiworks-40h\.user\.js\n/);
  assert.match(script, /@grant {8}GM_registerMenuCommand\n/);
  assert.match(script, /@noframes/);
  // 등록하지 않은 사이트에서는 사이트 확인 바로 다음에 멈춘다.
  assert.ok(script.indexOf('if (!globalThis.HW40_SITE.enabled) return;') < script.indexOf('// ---- config.js ----'));
});

test('등록하지 않은 사이트에서는 메뉴만 만들고 아무것도 하지 않는다', () => {
  const { script } = build({ version: '1.3.0', baseUrl: null, repository: undefined });
  const menus = [];
  const store = {};
  let touched = false;
  const sandbox = {
    location: { host: 'example.com', reload() {} },
    GM_getValue: (k, d) => (k in store ? store[k] : d),
    GM_setValue: (k, v) => { store[k] = v; },
    GM_registerMenuCommand: (name) => menus.push(name),
    // 페이지를 건드리면 표시가 남는다
    get document() { touched = true; return {}; },
    get window() { touched = true; return {}; },
  };
  vm.runInNewContext(script, sandbox);
  assert.deepStrictEqual(menus, ['⏱ 이 사이트에서 40시간 계산기 켜기']);
  assert.strictEqual(touched, false);
});

test('로컬 빌드에는 자동 업데이트 주소를 넣지 않는다', () => {
  const { script } = build({ version: '1.3.0', baseUrl: null, repository: undefined });
  assert.doesNotMatch(script, /@updateURL/);
});

test('스크립트는 문법 오류 없이 하나로 합쳐진다', () => {
  const { script } = build({ version: '1.3.0', baseUrl: null, repository: undefined });
  for (const file of ['version', 'config.js', 'calc.js', 'content.js', 'builtin-characters.js', 'sprite.js', 'pack-rules', 'themes.js', 'chars.js', 'packs', 'mascot.js']) assert.match(script, new RegExp(`// ---- ${file} ----`));
  assert.doesNotThrow(() => new vm.Script(script));
});

test('패널에 보여줄 버전이 스크립트에 들어간다', () => {
  const { script } = build({ version: '1.7.12', baseUrl: null, repository: undefined });
  assert.match(script, /globalThis\.HW40_VERSION = "1\.7\.12";/);
});

test('안내 페이지의 자리표시자가 모두 채워진다', () => {
  const { html } = build({ version: '1.3.7', baseUrl: null, repository: 'me/hiworks-40h' });
  assert.doesNotMatch(html, /\{\{/);
  assert.match(html, /v1\.3\.7/);
  assert.match(html, /https:\/\/github\.com\/me\/hiworks-40h/);
  assert.match(html, /13:00~14:00/);
});
