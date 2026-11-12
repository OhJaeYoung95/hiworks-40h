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
  assert.match(script, /@match {8}https:\/\/hr-work\.office\.hiworks\.com\/\*\n/);
  assert.match(script, /@updateURL {4}https:\/\/me\.github\.io\/hiworks-40h\/hiworks-40h\.user\.js\n/);
  assert.match(script, /@downloadURL {2}https:\/\/me\.github\.io\/hiworks-40h\/hiworks-40h\.user\.js\n/);
  assert.match(script, /@grant {8}none\n/);
});

test('로컬 빌드에는 자동 업데이트 주소를 넣지 않는다', () => {
  const { script } = build({ version: '1.3.0', baseUrl: null, repository: undefined });
  assert.doesNotMatch(script, /@updateURL/);
});

test('스크립트는 문법 오류 없이 하나로 합쳐진다', () => {
  const { script } = build({ version: '1.3.0', baseUrl: null, repository: undefined });
  for (const file of ['config.js', 'calc.js', 'content.js', 'builtin-characters.js', 'sprite.js', 'themes.js', 'packs', 'mascot.js']) assert.match(script, new RegExp(`// ---- ${file} ----`));
  assert.doesNotThrow(() => new vm.Script(script));
});

test('안내 페이지의 자리표시자가 모두 채워진다', () => {
  const { html } = build({ version: '1.3.7', baseUrl: null, repository: 'me/hiworks-40h' });
  assert.doesNotMatch(html, /\{\{/);
  assert.match(html, /v1\.3\.7/);
  assert.match(html, /https:\/\/github\.com\/me\/hiworks-40h/);
  assert.match(html, /13:00~14:00/);
});
