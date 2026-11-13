// src/의 파일들을 Tampermonkey 스크립트 하나와 설치 안내 페이지로 만든다.
//
//   node scripts/build-userscript.js
//
// GitHub Actions에서는 GITHUB_REPOSITORY(예: owner/hiworks-40h)와 BUILD_NUMBER가 주어져
// 자동 업데이트 주소와 매번 올라가는 버전이 들어간다.
const fs = require('node:fs');
const path = require('node:path');

const { loadPacks, packsScript, PackError } = require('./packs.js');
const { normalizeTheme, ThemeError } = require('../src/themes.js');
const { characters: BUILTIN_CHARACTERS } = require('../src/builtin-characters.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PACKS_DIR = path.join(ROOT, 'characters');
const SAMPLES_DIR = path.join(ROOT, 'samples', 'characters');
const THEMES_DIR = path.join(ROOT, 'themes');

// themes/<id>.json: 모두에게 목록으로 나오는 공용 테마. 파일을 더하면 목록이 늘어난다.
// 없는 캐릭터를 가리키면 빌드를 멈춘다.
function loadThemes(dir, knownIds) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((file) => {
      const where = `[테마] themes/${file}`;
      const id = file.slice(0, -5);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new PackError(`${where}: 파일 이름은 영문 소문자·숫자·-로 지어 주세요.`);
      let raw;
      try {
        raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      } catch (e) {
        throw new PackError(`${where}: JSON을 읽지 못했어요 (${e.message})`);
      }
      try {
        const { theme, warnings } = normalizeTheme(raw, knownIds);
        if (warnings.length) throw new ThemeError(warnings.join(' '));
        return { id, ...theme };
      } catch (e) {
        throw new PackError(`${where}: ${e.message}`);
      }
    });
}

// 캐릭터 팩 작업실(studio.html)과 그 화면이 쓰는 파일들. 하이웍스 화면과 같은 재생기·검사 규칙을 쓴다.
function studioFiles(packs) {
  const samples = loadPacks(SAMPLES_DIR).packs;
  const src = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
  return {
    // 테마 만들기 화면: 하이웍스와 같은 캐릭터 엔진을 이 페이지 아래에 띄워 미리 본다.
    'themes.html': fs.readFileSync(path.join(ROOT, 'site', 'themes.html'), 'utf8'),
    'studio/themes.js': src('themes.js'),
    // 캐릭터 만들기 화면: 그림을 끌어다 놓고 캐릭터 코드를 만든다.
    'maker.html': fs.readFileSync(path.join(ROOT, 'site', 'maker.html'), 'utf8'),
    'studio/chars.js': src('chars.js'),
    'studio/builtin-characters.js': src('builtin-characters.js'),
    'studio/packs-data.js': `${packs}\n`,
    'studio/mascot.js': src('mascot.js'),
    'studio.html': fs.readFileSync(path.join(ROOT, 'site', 'studio.html'), 'utf8'),
    'studio/pack-rules.js': fs.readFileSync(path.join(__dirname, 'packs.js'), 'utf8'),
    'studio/sprite.js': fs.readFileSync(path.join(SRC, 'sprite.js'), 'utf8'),
    'studio/samples.js': `window.HW40_SAMPLES = ${JSON.stringify(samples)};\n`,
  };
}
const SCRIPT_NAME = 'hiworks-40h.user.js';
// 실행 순서가 중요하다: 설정 → 계산 → 패널 → 기본 캐릭터 → 팩 재생기 → 팩 규칙 → 테마·캐릭터 코드 규칙
// → 캐릭터 팩·공용 테마 → 캐릭터 엔진
// site.js가 이 사이트에서 켤지 정하고, 등록하지 않은 사이트면 'gate'에서 바로 멈춘다.
const SOURCES = ['version', 'site.js', 'gate', 'config.js', 'calc.js', 'company.js', 'reader.js', 'content.js', 'builtin-characters.js', 'sprite.js', 'pack-rules', 'themes.js', 'chars.js', 'packs', 'mascot.js', 'visit.js', 'room.js'];

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
}

// manifest의 "주.부" 버전에 빌드 번호를 붙여 배포할 때마다 버전이 올라가게 한다.
function resolveVersion(manifestVersion, buildNumber) {
  if (!buildNumber) return manifestVersion;
  const [major, minor] = manifestVersion.split('.');
  return `${major}.${minor}.${buildNumber}`;
}

// GitHub Pages 주소. 계정 이름은 주소에서 소문자가 된다.
function pagesUrl(repository) {
  if (!repository) return null;
  const [owner, repo] = repository.split('/');
  return `https://${owner.toLowerCase()}.github.io/${repo}/`;
}

function build({ version, baseUrl, repository, packsDir = PACKS_DIR, themesDir = THEMES_DIR, includeHidden = false }) {
  const manifest = readManifest();
  const packData = loadPacks(packsDir, { includeHidden });
  const knownIds = new Set([...BUILTIN_CHARACTERS.map((c) => c.id), ...packData.packs.map((p) => p.id)]);
  const themes = loadThemes(themesDir, knownIds);
  // site: 패널의 "테마 만들기" 링크가 여는 배포 주소
  const packs = packsScript({ ...packData, themes, site: baseUrl });
  const scriptUrl = baseUrl ? baseUrl + SCRIPT_NAME : null;
  const repoUrl = repository ? `https://github.com/${repository}` : null;

  const header = [
    '// ==UserScript==',
    `// @name         ${manifest.name}`,
    `// @namespace    ${repoUrl || 'hiworks-40h'}`,
    `// @version      ${version}`,
    `// @description  ${manifest.description}`,
    // 어느 근무 페이지에서나 켤 수 있게 모든 사이트에서 읽히지만, 등록한 사이트(하이웍스는 기본)가 아니면 아무것도 하지 않는다.
    '// @match        *://*/*',
    '// @run-at       document-idle',
    '// @grant        GM_registerMenuCommand',
    '// @grant        GM_getValue',
    '// @grant        GM_setValue',
    '// @noframes',
    ...(scriptUrl ? [`// @updateURL    ${scriptUrl}`, `// @downloadURL  ${scriptUrl}`] : []),
    ...(repoUrl ? [`// @homepageURL  ${repoUrl}`] : []),
    '// ==/UserScript==',
  ].join('\n');

  const read = (file) => {
    if (file === 'packs') return packs;
    if (file === 'gate') return 'if (!globalThis.HW40_SITE.enabled) return;';
    // 패널에 보여줄 버전 (Tampermonkey 머리말의 @version과 같다)
    if (file === 'version') return `globalThis.HW40_VERSION = ${JSON.stringify(version)};`;
    // 캐릭터 코드 검사에 쓰는 팩 규칙 (빌드와 같은 파일)
    if (file === 'pack-rules') return fs.readFileSync(path.join(__dirname, 'packs.js'), 'utf8').trim();
    return fs.readFileSync(path.join(SRC, file), 'utf8').trim();
  };
  const body = SOURCES.map((file) => `// ---- ${file} ----\n${read(file)}`).join('\n\n');

  // 파일끼리 주고받는 값(HW40 등)을 페이지 전역이 아닌 이 객체에 둔다.
  const script = `${header}\n\n(function (globalThis) {\n${body}\n})({});\n`;

  const config = require(path.join(SRC, 'config.js'));
  const html = fs
    .readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8')
    .replaceAll('{{SCRIPT_URL}}', SCRIPT_NAME)
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{REPO_URL}}', repoUrl || '#')
    .replaceAll('{{WEEKLY_HOURS}}', String(config.weeklyHours))
    .replaceAll('{{WORK_START}}', config.workStart)
    .replaceAll('{{LUNCH}}', `${config.lunchStart}~${config.lunchEnd}`)
    .replaceAll('{{FRIDAY_LEAVE}}', config.fridayEarliestLeave);

  return { script, html, packs, studio: studioFiles(packs), scriptName: SCRIPT_NAME };
}

if (require.main === module) {
  const repository = process.env.GITHUB_REPOSITORY;
  const version = resolveVersion(readManifest().version, process.env.BUILD_NUMBER);
  // 로컬 확인용: HW40_PACKS_DIR=samples/characters 처럼 다른 팩 폴더를 쓸 수 있다 (배포는 항상 characters/).
  const packsDir = process.env.HW40_PACKS_DIR ? path.resolve(ROOT, process.env.HW40_PACKS_DIR) : PACKS_DIR;
  const { script, html, packs, studio, scriptName } = build({ version, baseUrl: pagesUrl(repository), repository, packsDir });

  const out = path.join(ROOT, 'dist');
  fs.mkdirSync(path.join(out, 'studio'), { recursive: true });
  fs.writeFileSync(path.join(out, scriptName), script);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  for (const [file, content] of Object.entries(studio)) fs.writeFileSync(path.join(out, file), content);
  // 모의 페이지에서 src/ 파일과 함께 불러 쓰는 팩 데이터
  fs.writeFileSync(path.join(out, 'packs.js'), `${packs}\n`);
  console.log(`dist/${scriptName} v${version}${repository ? ` → ${pagesUrl(repository)}` : ' (자동 업데이트 주소 없음: 로컬 빌드)'}`);
}

module.exports = { build, resolveVersion, pagesUrl };
