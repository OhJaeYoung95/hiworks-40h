// src/의 파일들을 Tampermonkey 스크립트 하나와 설치 안내 페이지로 만든다.
//
//   node scripts/build-userscript.js
//
// GitHub Actions에서는 GITHUB_REPOSITORY(예: owner/hiworks-40h)와 BUILD_NUMBER가 주어져
// 자동 업데이트 주소와 매번 올라가는 버전이 들어간다.
const fs = require('node:fs');
const path = require('node:path');

const { loadPacks, packsScript } = require('./packs.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PACKS_DIR = path.join(ROOT, 'characters');
const SAMPLES_DIR = path.join(ROOT, 'samples', 'characters');

// 캐릭터 팩 작업실(studio.html)과 그 화면이 쓰는 파일들. 하이웍스 화면과 같은 재생기·검사 규칙을 쓴다.
function studioFiles() {
  const samples = loadPacks(SAMPLES_DIR).packs;
  return {
    'studio.html': fs.readFileSync(path.join(ROOT, 'site', 'studio.html'), 'utf8'),
    'studio/pack-rules.js': fs.readFileSync(path.join(__dirname, 'packs.js'), 'utf8'),
    'studio/sprite.js': fs.readFileSync(path.join(SRC, 'sprite.js'), 'utf8'),
    'studio/samples.js': `window.HW40_SAMPLES = ${JSON.stringify(samples)};\n`,
  };
}
const SCRIPT_NAME = 'hiworks-40h.user.js';
// 실행 순서가 중요하다: 설정 → 계산 → 패널 → 기본 캐릭터 → 팩 재생기 → 캐릭터 팩 → 캐릭터 엔진
const SOURCES = ['config.js', 'calc.js', 'content.js', 'builtin-characters.js', 'sprite.js', 'packs', 'mascot.js'];

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

function build({ version, baseUrl, repository, packsDir = PACKS_DIR, includeHidden = false }) {
  const manifest = readManifest();
  const packs = packsScript(loadPacks(packsDir, { includeHidden }));
  const scriptUrl = baseUrl ? baseUrl + SCRIPT_NAME : null;
  const repoUrl = repository ? `https://github.com/${repository}` : null;

  const header = [
    '// ==UserScript==',
    `// @name         ${manifest.name}`,
    `// @namespace    ${repoUrl || 'hiworks-40h'}`,
    `// @version      ${version}`,
    `// @description  ${manifest.description}`,
    ...manifest.content_scripts[0].matches.map((m) => `// @match        ${m}`),
    '// @run-at       document-idle',
    '// @grant        none',
    '// @noframes',
    ...(scriptUrl ? [`// @updateURL    ${scriptUrl}`, `// @downloadURL  ${scriptUrl}`] : []),
    ...(repoUrl ? [`// @homepageURL  ${repoUrl}`] : []),
    '// ==/UserScript==',
  ].join('\n');

  const read = (file) => (file === 'packs' ? packs : fs.readFileSync(path.join(SRC, file), 'utf8').trim());
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
    .replaceAll('{{LUNCH}}', `${config.lunchStart}~${config.lunchEnd}`)
    .replaceAll('{{FRIDAY_LEAVE}}', config.fridayEarliestLeave);

  return { script, html, packs, studio: studioFiles(), scriptName: SCRIPT_NAME };
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
