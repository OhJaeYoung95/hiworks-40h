// 내 캐릭터: 그림까지 통째로 담은 "캐릭터 코드". GitHub 없이 코드(또는 .txt 파일)로 주고받는다.
// 받은 사람의 브라우저에만 저장되고, 어떤 서버로도 보내지 않는다.
// 하이웍스 화면(mascot.js)과 캐릭터 만들기 화면(maker.html)이 같이 쓴다.
(function (root) {
  const CODE_PREFIX = 'HW40C1.';
  const ID_PREFIX = 'my-';
  const MAX_BYTES = 1500 * 1024; // 캐릭터 하나에 담을 수 있는 그림 데이터 (브라우저 저장소 한도를 생각한 값)
  // SVG도 받는다: 캐릭터 그림은 CSS 배경으로만 그려서 SVG 안의 스크립트나 외부 주소가 실행·요청되지 않는다.
  const DATA_URL = /^data:image\/(png|webp|gif|jpeg|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;
  const EXT = { png: '.png', webp: '.webp', gif: '.gif', jpeg: '.jpg', 'svg+xml': '.svg' };

  class CharError extends Error {}

  const rules = () => {
    const r = typeof module !== 'undefined' && module.exports ? require('../scripts/packs.js') : root.HW40_PACK_RULES;
    if (!r) throw new CharError('캐릭터 규칙을 불러오지 못했어요.');
    return r;
  };

  // 캐릭터 설정(spec)을 검사하고 엔진용 팩으로 바꾼다. 그림은 data URL(PNG·WebP·GIF·JPG)만 받는다.
  function normalizeCharacter(spec) {
    if (!spec || typeof spec !== 'object') throw new CharError('캐릭터 형식이 아니에요.');
    if (typeof spec.id !== 'string' || !spec.id.startsWith(ID_PREFIX)) throw new CharError('내 캐릭터 id는 "my-"로 시작해야 해요.');
    const bytes = JSON.stringify(spec).length;
    if (bytes > MAX_BYTES) throw new CharError(`그림이 너무 커요 (${Math.round(bytes / 1024)}KB, 최대 ${MAX_BYTES / 1024}KB). 그림 수나 크기를 줄여 주세요.`);

    // 팩 규칙은 파일 이름으로 검사하므로, 그림마다 임시 이름을 붙여 넘긴다.
    const urls = [];
    const nameOf = (url) => {
      const m = typeof url === 'string' && DATA_URL.exec(url);
      if (!m) throw new CharError('그림 데이터가 깨졌거나 지원하지 않는 형식이에요.');
      urls.push(url);
      return `img${urls.length - 1}${EXT[m[1]]}`;
    };
    const animations = {};
    for (const [name, anim] of Object.entries(spec.animations || {})) {
      if (!anim || typeof anim !== 'object') continue;
      const copy = { ...anim };
      if (Array.isArray(anim.frames)) copy.frames = anim.frames.map(nameOf);
      if (anim.sheet !== undefined) copy.sheet = nameOf(anim.sheet);
      animations[name] = copy;
    }
    try {
      const pack = rules().normalizePack({ ...spec, animations }, spec.id, (file) => urls[Number(/^img(\d+)\./.exec(file)[1])]);
      pack.label = String(pack.label).slice(0, 20);
      pack.size = Math.min(160, Math.max(32, pack.size));
      return pack;
    } catch (e) {
      throw new CharError(e.message.replace(/^\[캐릭터 팩\] [^:]+: /, ''));
    }
  }

  const toBase64Url = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  async function pipe(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }

  // 캐릭터 코드: HW40C1.<설정 JSON을 압축해 base64url로>
  async function encodeCharacter(spec) {
    const json = new TextEncoder().encode(JSON.stringify(spec));
    return CODE_PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate')));
  }

  async function decodeCharacter(code) {
    const text = String(code || '').replace(/\s+/g, '');
    if (!text.startsWith(CODE_PREFIX)) throw new CharError(`캐릭터 코드가 아니에요. "${CODE_PREFIX}"로 시작하는 코드를 붙여 넣어 주세요.`);
    try {
      const bytes = await pipe(fromBase64Url(text.slice(CODE_PREFIX.length)), new DecompressionStream('deflate'));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new CharError('캐릭터 코드가 깨졌어요. 처음부터 끝까지 다 복사했는지 확인해 주세요.');
    }
  }

  // 팩 데이터(엔진용)를 캐릭터 설정으로 되돌린다. 기본 캐릭터 샘플을 고쳐 쓸 때 쓴다.
  function packToSpec(pack) {
    const animations = {};
    for (const [name, a] of Object.entries(pack.animations)) {
      const out = { fps: a.fps, loop: a.loop, motion: a.motion };
      if (a.sheet) Object.assign(out, { sheet: a.sheet, count: a.count });
      else out.frames = [...a.frames];
      if (a.special) Object.assign(out, { special: true, duration: a.special.ms, say: a.special.text, sayAt: a.special.sayAt, moving: a.special.moving });
      animations[name] = out;
    }
    return {
      id: pack.id, label: pack.label, size: pack.size, speed: pack.speed, pauseChance: pack.pauseChance,
      chaser: pack.chaser, bounce: pack.bounce, facing: pack.facing, lines: pack.lines, animations,
    };
  }

  const newId = () => ID_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const chars = { CODE_PREFIX, ID_PREFIX, MAX_BYTES, CharError, normalizeCharacter, encodeCharacter, decodeCharacter, packToSpec, newId };
  if (typeof module !== 'undefined' && module.exports) module.exports = chars;
  else root.HW40_CHARS = chars;
})(typeof globalThis !== 'undefined' ? globalThis : this);
