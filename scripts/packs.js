// 캐릭터 팩(characters/<id>/character.json + 이미지)을 읽어 엔진이 쓰는 데이터로 만든다.
// 규격은 characters/README.md 참고. 이미지는 data URL로 바꿔 스크립트 안에 묶는다.
// 빌드(Node)와 작업 화면 studio.html(브라우저)이 같은 규칙으로 검사하도록 둘 다에서 돌아간다.
(function (root) {
  const MIME = {
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };
  const MOTIONS = ['none', 'bob', 'breathe', 'shake', 'wobble'];
  const FACINGS = ['right', 'left', 'front'];
  const TRIGGERS = ['idle', 'walk', 'hurry', 'flee', 'chase', 'celebrate', 'rest', 'hop', 'click', 'meet'];
  const ONE_SHOT = ['hop', 'click'];
  const ID_RE = /^[a-z][a-z0-9-]*$/;
  const NAME_RE = /^[a-z][a-z0-9_-]*$/;
  const WARN_BYTES = 3 * 1024 * 1024;

  class PackError extends Error {}

  function fail(where, message) {
    throw new PackError(`[캐릭터 팩] ${where}: ${message}`);
  }

  const extOf = (file) => {
    const m = /\.[^./\\]+$/.exec(file);
    return m ? m[0].toLowerCase() : '';
  };

  // 이미지 파일 이름 검사. 실제 읽기는 resolveFile(이름, 위치)이 맡는다 (Node: 파일, 브라우저: 고른 폴더).
  function checkFile(file, where) {
    if (typeof file !== 'string' || !file) fail(where, '이미지 파일 이름이 비어 있어요.');
    if (/(^|[\\/])\.\.([\\/]|$)/.test(file) || /^[\\/]/.test(file)) fail(where, `"${file}"는 팩 폴더 밖을 가리켜요.`);
    if (!MIME[extOf(file)]) fail(where, `"${file}"는 지원하지 않는 형식이에요. (${Object.keys(MIME).join(', ')})`);
    return file;
  }

  const num = (value, fallback, where, name) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !(value > 0)) fail(where, `${name}은(는) 0보다 큰 숫자여야 해요.`);
    return value;
  };

  function readAnimation(name, spec, where, resolveFile) {
    if (!spec || typeof spec !== 'object') fail(where, '애니메이션 설정이 객체가 아니에요.');
    const hasFrames = spec.frames !== undefined;
    const hasSheet = spec.sheet !== undefined;
    if (hasFrames === hasSheet) fail(where, '"frames"와 "sheet" 중 하나만 써 주세요.');

    const anim = {
      fps: num(spec.fps, 8, where, 'fps'),
      loop: spec.loop === undefined ? !ONE_SHOT.includes(name) : Boolean(spec.loop),
      motion: spec.motion || 'none',
    };
    if (!MOTIONS.includes(anim.motion)) fail(where, `motion은 ${MOTIONS.join(', ')} 중 하나예요.`);

    if (hasFrames) {
      if (!Array.isArray(spec.frames) || !spec.frames.length) fail(where, '"frames"는 이미지 파일 이름 목록이에요.');
      anim.frames = spec.frames.map((f, i) => resolveFile(checkFile(f, `${where} frames[${i}]`), `${where} frames[${i}]`));
    } else {
      anim.sheet = resolveFile(checkFile(spec.sheet, `${where} sheet`), `${where} sheet`);
      anim.count = Math.round(num(spec.count, 1, where, 'count'));
    }

    if (spec.special) {
      if (TRIGGERS.includes(name)) fail(where, `"${name}"은 트리거 이름이라 special로 쓸 수 없어요.`);
      anim.special = {
        ms: num(spec.duration, 3000, where, 'duration'),
        text: typeof spec.say === 'string' ? spec.say : '',
        sayAt: spec.sayAt === undefined ? 200 : Math.max(0, Number(spec.sayAt) || 0),
        moving: Boolean(spec.moving),
      };
    }
    return anim;
  }

  // character.json 내용(spec)을 검사하고 엔진용 데이터로 바꾼다.
  function normalizePack(spec, folder, resolveFile) {
    const where = `${folder}/character.json`;
    if (!spec || typeof spec !== 'object') fail(where, '내용이 JSON 객체가 아니에요.');
    const id = spec.id === undefined ? folder.replace(/^_/, '') : spec.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) fail(where, 'id는 영문 소문자로 시작하는 영문·숫자·하이픈이에요.');
    if (!spec.animations || typeof spec.animations !== 'object') fail(where, '"animations"가 없어요.');
    if (!spec.animations.idle) fail(where, '"idle" 애니메이션은 꼭 있어야 해요.');
    const facing = spec.facing || 'right';
    if (!FACINGS.includes(facing)) fail(where, `facing은 ${FACINGS.join(', ')} 중 하나예요.`);
    const lines = spec.lines || {};

    const animations = {};
    for (const [name, anim] of Object.entries(spec.animations)) {
      if (!NAME_RE.test(name)) fail(where, `애니메이션 이름 "${name}"은 영문 소문자로 써 주세요.`);
      animations[name] = readAnimation(name, anim, `${where} animations.${name}`, resolveFile);
    }

    return {
      id,
      label: typeof spec.label === 'string' ? spec.label : id,
      size: Math.round(num(spec.size, 64, where, 'size')),
      speed: num(spec.speed, 30, where, 'speed'),
      pauseChance: spec.pauseChance === undefined ? 0.5 : Math.min(1, Math.max(0, Number(spec.pauseChance) || 0)),
      chaser: Boolean(spec.chaser),
      bounce: spec.bounce !== false,
      facing,
      lines: {
        celebrate: lines.celebrate || '퇴근!',
        rest: lines.rest || 'Zz',
        meet: lines.meet && typeof lines.meet === 'object' ? lines.meet : {},
      },
      animations,
    };
  }

  // 아래는 Node(빌드)에서만 쓴다.
  function readPackDir(dir, folder) {
    const fs = require('node:fs');
    const path = require('node:path');
    let spec;
    try {
      spec = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
    } catch (e) {
      fail(`${folder}/character.json`, `JSON을 읽지 못했어요 (${e.message})`);
    }
    return normalizePack(spec, folder, (file, where) => {
      const full = path.resolve(dir, file);
      if (!full.startsWith(path.resolve(dir) + path.sep)) fail(where, `"${file}"는 팩 폴더 밖을 가리켜요.`);
      if (!fs.existsSync(full)) fail(where, `"${file}" 파일이 없어요.`);
      return `data:${MIME[extOf(file)]};base64,${fs.readFileSync(full).toString('base64')}`;
    });
  }

  // 밑줄(_)로 시작하는 폴더는 작업용이라 includeHidden일 때만 읽는다.
  function loadPacks(packsRoot, { includeHidden = false, warn = console.warn } = {}) {
    const fs = require('node:fs');
    const path = require('node:path');
    const result = { builtin: null, packs: [] };
    if (!fs.existsSync(packsRoot)) return result;

    const configFile = path.join(packsRoot, 'config.json');
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (config.builtin !== undefined) {
        if (!Array.isArray(config.builtin)) fail('config.json', '"builtin"은 기본 캐릭터 id 목록이에요.');
        result.builtin = config.builtin;
      }
    }

    const folders = fs
      .readdirSync(packsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && (includeHidden || !d.name.startsWith('_')))
      .map((d) => d.name)
      .sort();
    const seen = new Set();
    for (const folder of folders) {
      const dir = path.join(packsRoot, folder);
      if (!fs.existsSync(path.join(dir, 'character.json'))) continue;
      const pack = readPackDir(dir, folder);
      if (seen.has(pack.id)) fail(`${folder}/character.json`, `id "${pack.id}"가 다른 팩과 겹쳐요.`);
      seen.add(pack.id);
      const bytes = JSON.stringify(pack).length;
      if (bytes > WARN_BYTES) warn(`[캐릭터 팩] ${folder}: 이미지가 ${(bytes / 1024 / 1024).toFixed(1)}MB로 커서 스크립트가 무거워져요.`);
      result.packs.push(pack);
    }
    return result;
  }

  const packsScript = (data) => `globalThis.HW40_PACKS = ${JSON.stringify(data)};`;

  const api = { MIME, MOTIONS, FACINGS, TRIGGERS, PackError, normalizePack, loadPacks, packsScript };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HW40_PACK_RULES = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
