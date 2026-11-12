// src/의 파일들을 Tampermonkey 스크립트 하나와 설치 안내 페이지로 만든다.
//
//   node scripts/build-userscript.js
//
// GitHub Actions에서는 GITHUB_REPOSITORY(예: owner/hiworks-40h)와 BUILD_NUMBER가 주어져
// 자동 업데이트 주소와 매번 올라가는 버전이 들어간다.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const SCRIPT_NAME = 'hiworks-40h.user.js';
// 실행 순서가 중요하다: 설정 → 계산 → 패널 → 캐릭터
const SOURCES = ['config.js', 'calc.js', 'content.js', 'mascot.js'];

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

function build({ version, baseUrl, repository }) {
  const manifest = readManifest();
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

  const body = SOURCES.map((file) => `// ---- ${file} ----\n${fs.readFileSync(path.join(SRC, file), 'utf8').trim()}`).join('\n\n');

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

  return { script, html, scriptName: SCRIPT_NAME };
}

if (require.main === module) {
  const repository = process.env.GITHUB_REPOSITORY;
  const version = resolveVersion(readManifest().version, process.env.BUILD_NUMBER);
  const { script, html, scriptName } = build({ version, baseUrl: pagesUrl(repository), repository });

  const out = path.join(ROOT, 'dist');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, scriptName), script);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  console.log(`dist/${scriptName} v${version}${repository ? ` → ${pagesUrl(repository)}` : ' (자동 업데이트 주소 없음: 로컬 빌드)'}`);
}

module.exports = { build, resolveVersion, pagesUrl };
