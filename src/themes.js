// 테마: 어떤 캐릭터를 몇 명, 어떤 이름·크기로 내보낼지 정한 묶음.
// 그림은 담지 않고 캐릭터 id만 가리키므로 공유 코드가 짧다. 그림은 기본 캐릭터나 캐릭터 팩에서 온다.
// 하이웍스 화면(mascot.js), 빌드(themes/ 폴더 검사), 테마 만들기 화면(themes.html)이 같이 쓴다.
(function (root) {
  const CODE_PREFIX = 'HW40T1.';
  const MAX_CAST = 10;
  const NAME_MAX = 20;
  const LABEL_MAX = 12;
  const SIZE_MIN = 32;
  const SIZE_MAX = 160;

  class ThemeError extends Error {}

  // 화면에 그대로 넣어도 안전한 짧은 글자로 만든다.
  const clean = (value, max) =>
    typeof value === 'string'
      ? value.replace(/[\u0000-\u001f\u007f<>&"`]/g, '').trim().slice(0, max)
      : '';

  // 테마를 규격에 맞게 고친다. knownIds가 있으면 없는 캐릭터는 빼고 warnings에 적는다.
  function normalizeTheme(raw, knownIds) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ThemeError('테마 형식이 아니에요.');
    if (!Array.isArray(raw.cast)) throw new ThemeError('"cast"(나올 캐릭터 목록)가 없어요.');
    const warnings = [];
    const cast = [];
    for (const entry of raw.cast) {
      const item = typeof entry === 'string' ? { id: entry } : entry;
      if (!item || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(item.id)) {
        warnings.push('id가 없는 캐릭터를 뺐어요.');
        continue;
      }
      if (knownIds && !knownIds.has(item.id)) {
        warnings.push(`"${item.id}" 캐릭터가 이 버전에 없어서 뺐어요.`);
        continue;
      }
      const out = { id: item.id };
      const name = clean(item.name, LABEL_MAX);
      if (name) out.name = name;
      if (item.size !== undefined && item.size !== null && item.size !== '') {
        const size = Number(item.size);
        if (Number.isFinite(size)) out.size = Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, size)));
      }
      cast.push(out);
    }
    if (cast.length > MAX_CAST) {
      warnings.push(`캐릭터는 ${MAX_CAST}명까지라 뒤쪽 ${cast.length - MAX_CAST}명을 뺐어요.`);
      cast.length = MAX_CAST;
    }
    if (!cast.length) throw new ThemeError('나올 캐릭터가 하나도 없어요.');
    return { theme: { name: clean(raw.name, NAME_MAX) || '이름 없는 테마', cast }, warnings };
  }

  const toBase64Url = (text) => {
    let bin = '';
    for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromBase64Url = (code) => {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  };

  // 공유 코드: HW40T1.<테마 JSON을 base64url로>
  function encodeTheme(theme) {
    return CODE_PREFIX + toBase64Url(JSON.stringify({ name: theme.name, cast: theme.cast }));
  }

  // 공유 코드(또는 테마 JSON 그대로)를 읽는다. 규격 검사는 normalizeTheme으로 한다.
  function decodeTheme(code) {
    const raw = String(code || '').trim();
    // 메신저에서 줄이 바뀌어 붙여 넣어져도 코드는 읽히게 공백을 지운다 (JSON은 그대로 읽는다).
    const text = raw.startsWith('{') ? raw : raw.replace(/\s+/g, '');
    try {
      if (text.startsWith('{')) return JSON.parse(text);
      if (text.startsWith(CODE_PREFIX)) return JSON.parse(fromBase64Url(text.slice(CODE_PREFIX.length)));
    } catch {
      throw new ThemeError('테마 코드가 깨졌어요. 처음부터 끝까지 다 복사했는지 확인해 주세요.');
    }
    throw new ThemeError(`테마 코드가 아니에요. "${CODE_PREFIX}"로 시작하는 코드를 붙여 넣어 주세요.`);
  }

  const themes = { CODE_PREFIX, MAX_CAST, NAME_MAX, LABEL_MAX, SIZE_MIN, SIZE_MAX, ThemeError, normalizeTheme, encodeTheme, decodeTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = themes;
  else root.HW40_THEMES = themes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
