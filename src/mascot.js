// 화면 하단을 돌아다니는 오리지널 캐릭터들. 외부 이미지 없이 SVG로 그린다.
(function () {
  const api = globalThis.HW40;
  const { mascotMood, formatDuration } = api;

  const WIDTH = 64;
  const HURRY_FACTOR = 2.7;
  const PANEL_CLEARANCE = 300; // 패널 폭 + 여백 + 말풍선 여유
  const MEET_COOLDOWN_MS = 25000;
  const CHASE_COOLDOWN_MS = 40000;
  const CHASE_GIVE_UP_MS = 7000;
  const FLEE_MS = 2600;
  const STORAGE_KEY = 'hw40-mascot-off';
  // 사용자가 고른 그림. 이 브라우저의 localStorage에만 저장되고 어디로도 보내지 않는다.
  const CUSTOM_KEY = 'hw40-custom-image';
  const CUSTOM_TARGET = 'mong';
  const CUSTOM_MAX_PX = 160;
  // 테마: 내가 추가한 테마 목록과 지금 고른 테마. 역시 이 브라우저에만 저장된다.
  const THEMES_KEY = 'hw40-themes';
  const ACTIVE_KEY = 'hw40-theme';
  // 내 캐릭터: 캐릭터 코드로 추가한 그림 캐릭터들. 이 브라우저에만 저장된다.
  const MY_CHARS_KEY = 'hw40-my-chars';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const { characters: BUILTINS, meetLines: MEET_LINES, artCss: ART_CSS, confetti: CONFETTI } = globalThis.HW40_BUILTINS;
  const { createSpriteRenderer } = globalThis.HW40_SPRITE;
  const THEME_RULES = globalThis.HW40_THEMES;
  const CHAR_RULES = globalThis.HW40_CHARS;

  const STYLE = `
    :host { will-change: transform; }
    #flip { width: ${WIDTH}px; height: ${WIDTH}px; }
    svg { display: block; pointer-events: auto; cursor: pointer; overflow: visible; }
    .hop svg, .hop:not(.nobounce) #jump { animation: hop .6s cubic-bezier(.3,.7,.4,1); }
    .party svg, .party:not(.nobounce) #jump { animation: hop .6s cubic-bezier(.3,.7,.4,1) infinite; }
    /* 캐릭터 팩: 이미지 프레임을 그대로 보여준다 */
    #jump { width: 100%; height: 100%; }
    #sprite { width: 100%; height: 100%; pointer-events: auto; cursor: pointer;
      background-repeat: no-repeat; background-position: center bottom; background-size: contain;
      transform-box: fill-box; transform-origin: bottom center; }
    .motion-bob { animation: bob .25s ease-in-out infinite alternate; }
    .motion-breathe { animation: breathe 1.6s ease-in-out infinite alternate; }
    .motion-shake { animation: tremble .1s linear infinite alternate; }
    .motion-wobble { animation: wobble .8s ease-in-out infinite alternate; }
    @keyframes wobble { from { transform: rotate(-6deg); } to { transform: rotate(6deg); } }
    ${ART_CSS}
    #bubble { position: absolute; bottom: ${WIDTH + 6}px; padding: 4px 9px; white-space: nowrap;
      background: #fff; color: #4a3520; border: 1.5px solid #6b4a2b; border-radius: 10px;
      font: 600 12px 'Malgun Gothic', sans-serif; }`;

  // characters/ 폴더의 팩을 캐릭터 정의로 바꾼다. "special" 애니메이션은 그 캐릭터만의 장면이 된다.
  function packDef(pack) {
    const skits = {};
    for (const [name, anim] of Object.entries(pack.animations)) {
      if (anim.special) skits[name] = anim.special;
    }
    return {
      id: pack.id,
      label: pack.label,
      speed: pack.speed,
      pauseChance: pack.pauseChance,
      chaser: pack.chaser,
      partyLine: pack.lines.celebrate,
      restLine: pack.lines.rest,
      meet: pack.lines.meet,
      skits,
      pack,
    };
  }

  // 팩 id가 기본 캐릭터와 같으면 팩이 그 캐릭터를 대신한다. config.json의 builtin으로 기본 캐릭터를 고른다.
  const PACKS = globalThis.HW40_PACKS || { builtin: null, packs: [] };
  const packDefs = PACKS.packs.map(packDef);
  const packIds = new Set(packDefs.map((d) => d.id));
  const allowedBuiltins = Array.isArray(PACKS.builtin) ? new Set(PACKS.builtin) : null;
  const CHARACTERS = [
    ...BUILTINS.filter((d) => (!allowedBuiltins || allowedBuiltins.has(d.id)) && !packIds.has(d.id)),
    ...packDefs,
  ];
  // 테마에서 고를 수 있는 모든 캐릭터 (config.json으로 기본 목록에서 뺀 캐릭터와 내 캐릭터도 포함)
  const BASE_CATALOG = [...BUILTINS.filter((d) => !packIds.has(d.id)), ...packDefs];
  let myDefs = [];
  let CATALOG = new Map();
  let knownIds = new Set();


  function readOff() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
  function writeOff(off) {
    try {
      if (off) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 저장이 막혀 있으면 이번 페이지에서만 적용된다.
    }
  }

  function readCustom() {
    try {
      return localStorage.getItem(CUSTOM_KEY);
    } catch {
      return null;
    }
  }
  function writeCustom(url) {
    try {
      if (url) localStorage.setItem(CUSTOM_KEY, url);
      else localStorage.removeItem(CUSTOM_KEY);
      return true;
    } catch {
      return false;
    }
  }
  function readJson(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  }
  function writeValue(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  const customArt = (url) => `
    <g id="body"><image href="${url}" x="-8" y="-14" width="80" height="78" preserveAspectRatio="xMidYMax meet"/></g>`;

  // 고른 그림을 작게 줄여 PNG 데이터 URL로 만든다.
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const src = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, CUSTOM_MAX_PX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(src);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(src);
        reject(new Error('image load failed'));
      };
      img.src = src;
    });
  }

  const maxX = (w = WIDTH) => Math.max(0, window.innerWidth - w);
  // 패널에 가리지 않고 멈춰 있을 수 있는 오른쪽 한계
  const clearMaxX = (w = WIDTH) => Math.max(0, window.innerWidth - w - PANEL_CLEARANCE);

  const artFor = (def) => {
    const url = def.id === CUSTOM_TARGET ? readCustom() : null;
    return url ? customArt(url) : def.art;
  };

  // look: 테마가 정한 이름(name)과 크기(size)
  function createMascot(def, index, count, look = {}) {
    // 패널보다 낮은 층에 두어 패널을 가리지 않게 한다. 빈 영역 클릭은 페이지로 통과시킨다.
    const W = look.size || (def.pack ? def.pack.size : WIDTH);
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:0;bottom:0;width:${W}px;height:${W}px;z-index:${2147483640 + index};pointer-events:none;`;
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const label = String(look.name || def.label).replace(/[<>&"]/g, '');
    const figure = def.pack
      ? `<div id="jump"><div id="sprite" role="img" aria-label="${label}" title="${label}"></div></div>`
      : `<svg viewBox="0 0 64 64" width="${W}" height="${W}" role="img" aria-label="${label}"><title>${label}</title>${artFor(def)}${CONFETTI}</svg>`;
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <div id="bubble" hidden style="bottom:${W + 6}px"></div>
      <div id="flip" style="width:${W}px;height:${W}px">${figure}</div>`;
    const flip = shadow.getElementById('flip');
    const bubble = shadow.getElementById('bubble');
    const svg = shadow.querySelector('svg');
    const sprite = shadow.getElementById('sprite');
    const render = def.pack ? createSpriteRenderer(def.pack, sprite) : null;
    if (def.pack && !def.pack.bounce) flip.classList.add('nobounce');

    const m = {
      id: def.id,
      name: label,
      w: W,
      def,
      chaser: Boolean(def.chaser),
      host,
      x: (maxX(W) * (index + Math.random())) / count,
      dir: Math.random() < 0.5 ? 1 : -1,
      action: 'walk',
      actionUntil: 0,
      skit: null,
      spokenUntil: 0,
      bubbleAlign: null,
      bubbleOffset: 0,
      hopping: false,
      fleeUntil: 0,
      chase: null,
      chaseUntil: 0,
      meetUntil: 0,
      hopKind: 'hop',
    };

    m.hop = (kind = 'hop') => {
      if (m.hopping) return;
      m.hopping = true;
      m.hopKind = kind;
      flip.classList.add('hop');
      setTimeout(() => {
        flip.classList.remove('hop');
        m.hopping = false;
      }, 600);
    };

    function showBubble(text) {
      if (bubble.textContent !== text) bubble.textContent = text;
      bubble.hidden = false;
      // 말풍선이 화면 밖으로 나가지 않도록 화면 중앙 기준으로 정렬 방향을 정한다.
      const leftAligned = m.bubbleAlign ? m.bubbleAlign === 'left' : m.x < window.innerWidth / 2;
      bubble.style.left = leftAligned ? `${m.bubbleOffset}px` : 'auto';
      bubble.style.right = leftAligned ? 'auto' : `${m.bubbleOffset}px`;
    }

    m.redraw = () => {
      if (svg) svg.innerHTML = `<title>${label}</title>${artFor(def)}${CONFETTI}`;
    };

    m.say = (text, ms, align = null, offset = 0) => {
      m.bubbleAlign = align;
      m.bubbleOffset = offset;
      showBubble(text);
      m.spokenUntil = performance.now() + ms;
    };

    m.playSkit = (name, now = performance.now()) => {
      const { ms, text, sayAt } = def.skits[name];
      m.skit = name;
      m.action = 'skit';
      m.actionUntil = now + ms;
      setTimeout(() => {
        if (m.skit === name) m.say(text, ms - sayAt);
      }, sayAt);
    };

    m.pause = (ms, now) => {
      m.skit = null;
      m.action = 'idle';
      m.actionUntil = now + ms;
    };

    // 괴물에게 쫓길 때. 반대쪽으로 빠르게 도망간다.
    m.flee = (from, now) => {
      m.skit = null;
      m.action = 'walk';
      m.actionUntil = now + FLEE_MS;
      m.fleeUntil = now + FLEE_MS;
      m.dir = m.x < from.x ? -1 : 1;
      if ((m.dir < 0 && m.x <= 0) || (m.dir > 0 && m.x >= maxX(W))) m.dir = -m.dir;
      m.say('으악!', 1500);
      m.hop();
    };

    m.startChase = (target, now) => {
      m.skit = null;
      m.action = 'walk';
      m.chase = target;
      m.chaseUntil = now + CHASE_GIVE_UP_MS;
      m.say('어흥!', 1500);
    };

    function nextAction(now) {
      if (m.chase) {
        m.actionUntil = now + 500;
        return;
      }
      m.skit = null;
      if (m.action === 'walk' && Math.random() < def.pauseChance) {
        const names = Object.keys(def.skits);
        if (names.length && m.x <= clearMaxX(W) && Math.random() < 0.6) {
          m.playSkit(names[Math.floor(Math.random() * names.length)], now);
          return;
        }
        m.action = 'idle';
        m.actionUntil = now + 1500 + Math.random() * 2000;
        if (Math.random() < 0.3) m.hop();
      } else {
        m.action = 'walk';
        m.actionUntil = now + 4000 + Math.random() * 6000;
        if (Math.random() < 0.25) m.dir = -m.dir;
      }
    }

    (svg || sprite).addEventListener('click', () => {
      const r = api.latest;
      const left = r && typeof r.remaining === 'number' ? Math.max(0, r.remaining) : null;
      const text = left === null ? '안녕!' : left === 0 ? '40시간 달성!' : `${formatDuration(left)} 남았어`;
      m.say(text, 3000);
      m.hop('click');
    });

    // 축하·휴식 때 서는 자리. 겹치지 않게 패널 왼쪽 공간을 나눠 쓴다.
    const slot = () => (clearMaxX(W) * (index + 1)) / (count + 1);

    // 지금 상황에 맞는 애니메이션 트리거 이름
    function stateFor(now, mood, moving) {
      if (mood === 'celebrate' || mood === 'rest') return m.hopping ? m.hopKind : moving ? 'hurry' : mood;
      if (mood === 'hurry') return 'hurry';
      if (now < m.fleeUntil) return 'flee';
      if (m.chase) return 'chase';
      if (m.hopping) return m.hopKind;
      if (m.skit) return m.skit;
      if (now < m.meetUntil) return 'meet';
      return moving ? 'walk' : 'idle';
    }

    m.update = (now, dt, mood) => {
      let moving = false;
      let speed = def.speed;
      let target = null;

      if (mood !== 'normal') {
        m.chase = null;
        m.fleeUntil = 0;
      }
      if (mood !== 'normal' && m.skit) {
        m.skit = null;
        m.action = 'walk';
        m.actionUntil = 0;
      }

      if (mood === 'hurry') {
        moving = true;
        speed = def.speed * HURRY_FACTOR;
      } else if (mood === 'normal') {
        if (now >= m.actionUntil) nextAction(now);
        const skitMoves = m.skit && def.skits[m.skit].moving;
        moving = m.action === 'walk' || Boolean(skitMoves);
        if (skitMoves) speed = def.speed * HURRY_FACTOR;
        if (now < m.fleeUntil) {
          moving = true;
          speed = def.speed * HURRY_FACTOR;
        }
        if (m.chase) {
          if (now > m.chaseUntil || m.chase.host.hidden) {
            m.chase = null;
            m.say('칫…', 1500);
            m.pause(1500, now);
          } else if (Math.abs(m.chase.x - m.x) < ((W + m.chase.w) / 2) * 0.7) {
            m.chase.flee(m, now);
            m.chase = null;
            m.say('헤헤', 1500);
            m.pause(1800, now);
            moving = false;
          } else {
            moving = true;
            speed = def.speed * 2;
            target = m.chase.x;
          }
        }
      } else if (Math.abs(m.x - slot()) > 1) {
        moving = true;
        speed = def.speed * HURRY_FACTOR;
        target = slot();
      }

      if (moving && !reducedMotion) {
        const step = speed * dt;
        if (target !== null) {
          m.dir = target > m.x ? 1 : -1;
          m.x += m.dir * Math.min(step, Math.abs(target - m.x));
        } else {
          m.x += m.dir * step;
          if (m.x <= 0) m.dir = 1;
          if (m.x >= maxX(W)) m.dir = -1;
        }
      }
      m.x = Math.min(Math.max(m.x, 0), maxX(W));

      flip.classList.toggle('walk', moving);
      flip.classList.toggle('fast', mood !== 'normal' && moving);
      flip.classList.toggle('idle', !moving);
      flip.classList.toggle('party', mood === 'celebrate');
      for (const name of Object.keys(def.skits)) {
        flip.classList.toggle(`skit-${name}`, m.skit === name);
      }
      host.style.transform = `translateX(${m.x}px)`;
      const facing = render ? render(stateFor(now, mood, moving), now, m.dir) : m.dir;
      flip.style.transform = `scaleX(${facing})`;

      if (now < m.spokenUntil) {
        showBubble(bubble.textContent);
      } else {
        m.bubbleAlign = null;
        m.bubbleOffset = 0;
        if (mood === 'celebrate') showBubble(def.partyLine);
        else if (mood === 'rest') showBubble(def.restLine);
        else bubble.hidden = true;
      }
    };

    return m;
  }

  // ---------- 테마 ----------
  // 기본: 지금 배포된 캐릭터 그대로. 공용: 저장소 themes/ 폴더. 내 테마: 공유 코드로 추가한 것.
  // 저장된 내 캐릭터를 읽어 캐릭터 목록을 다시 만든다. 이 버전에서 읽을 수 없는 캐릭터는 건너뛴다.
  function loadMyChars() {
    const saved = readJson(MY_CHARS_KEY, []);
    myDefs = [];
    for (const spec of Array.isArray(saved) ? saved : []) {
      try {
        myDefs.push({ ...packDef(CHAR_RULES.normalizeCharacter(spec)), mine: true });
      } catch {
        // 깨진 캐릭터는 목록에서 숨긴다 (지우지는 않는다).
      }
    }
    CATALOG = new Map([...BASE_CATALOG, ...myDefs].map((d) => [d.id, d]));
    knownIds = new Set(CATALOG.keys());
  }
  if (CHAR_RULES) loadMyChars();
  else {
    CATALOG = new Map(BASE_CATALOG.map((d) => [d.id, d]));
    knownIds = new Set(CATALOG.keys());
  }

  // 기본 테마: 배포된 기본 캐릭터 + 내 캐릭터
  const defaultTheme = () => ({ key: 'default', name: '기본', source: 'default', cast: [...CHARACTERS, ...myDefs].map((d) => ({ id: d.id })) });
  const sharedThemes = (PACKS.themes || []).map((t) => ({ key: `shared:${t.id}`, name: t.name, source: 'shared', cast: t.cast }));

  function myThemes() {
    const saved = readJson(THEMES_KEY, []);
    if (!Array.isArray(saved)) return [];
    const out = [];
    for (const t of saved) {
      try {
        const { theme } = THEME_RULES.normalizeTheme(t, knownIds);
        out.push({ key: `mine:${t.key}`, name: theme.name, source: 'mine', cast: theme.cast, savedKey: t.key });
      } catch {
        // 이 버전에서 쓸 수 없는 테마는 목록에서 숨긴다 (지우지는 않는다).
      }
    }
    return out;
  }
  const allThemes = () => [defaultTheme(), ...sharedThemes, ...myThemes()];
  const findTheme = (key) => allThemes().find((t) => t.key === key) || defaultTheme();

  let mascots = [];
  let off = readOff();
  const applyOff = () => mascots.forEach((m) => { m.host.hidden = off; });

  // 테마대로 캐릭터를 다시 만든다. 이 버전에 없는 캐릭터는 건너뛴다.
  function spawn(theme) {
    for (const m of mascots) m.host.remove();
    const cast = theme.cast.filter((c) => CATALOG.has(c.id));
    const list = cast.length ? cast : defaultTheme().cast;
    mascots = list.map((c, i) => createMascot(CATALOG.get(c.id), i, list.length, c));
    api.mascots = mascots;
    applyOff();
  }

  let activeKey = findTheme(readJson(ACTIVE_KEY, 'default')).key;
  spawn(findTheme(activeKey));

  api.themes = {
    // 캐릭터 목록 (테마 만들기 화면에서 씀)
    catalog: () => [...CATALOG.values()].map((d) => ({ id: d.id, label: d.label, pack: d.pack || null, art: d.art || null, chaser: Boolean(d.chaser) })),
    list: () => allThemes().map(({ key, name, source, cast }) => ({ key, name, source, cast })),
    active: () => activeKey,
    apply(key) {
      const theme = findTheme(key);
      activeKey = theme.key;
      writeValue(ACTIVE_KEY, activeKey === 'default' ? null : activeKey);
      spawn(theme);
      return theme.key;
    },
    // 저장하지 않고 잠깐 보여주기 (테마 만들기 화면의 미리 보기)
    preview(raw) {
      const { theme, warnings } = THEME_RULES.normalizeTheme(raw, knownIds);
      spawn(theme);
      return warnings;
    },
    // 공유 코드를 내 테마로 추가하고 바로 적용한다.
    addCode(code) {
      const { theme, warnings } = THEME_RULES.normalizeTheme(THEME_RULES.decodeTheme(code), knownIds);
      const saved = readJson(THEMES_KEY, []);
      const list = Array.isArray(saved) ? saved : [];
      const key = Date.now().toString(36);
      list.push({ key, ...theme });
      if (!writeValue(THEMES_KEY, list)) throw new THEME_RULES.ThemeError('브라우저 저장소를 쓸 수 없어 테마를 저장하지 못했어요.');
      api.themes.apply(`mine:${key}`);
      return { key: `mine:${key}`, name: theme.name, warnings };
    },
    remove(key) {
      const target = myThemes().find((t) => t.key === key);
      if (!target) return;
      writeValue(THEMES_KEY, readJson(THEMES_KEY, []).filter((t) => t.key !== target.savedKey));
      if (activeKey === key) api.themes.apply('default');
    },
    code: (key) => {
      const t = findTheme(key);
      return THEME_RULES.encodeTheme({ name: t.name, cast: t.cast });
    },
    site: PACKS.site || null,
  };

  // ---------- 내 캐릭터 ----------
  const savedChars = () => {
    const saved = readJson(MY_CHARS_KEY, []);
    return Array.isArray(saved) ? saved : [];
  };
  api.characters = {
    list: () => myDefs.map((d) => ({ id: d.id, label: d.label })),
    // 캐릭터 코드를 추가하고 화면에 바로 내보낸다. 같은 캐릭터(id)면 새 그림으로 바꾼다.
    async addCode(code) {
      const spec = await CHAR_RULES.decodeCharacter(code);
      const pack = CHAR_RULES.normalizeCharacter(spec);
      const list = savedChars();
      const replaced = list.some((c) => c && c.id === pack.id);
      const next = [...list.filter((c) => c && c.id !== pack.id), spec];
      if (!writeValue(MY_CHARS_KEY, next)) {
        throw new CHAR_RULES.CharError('브라우저 저장 공간이 모자라 저장하지 못했어요. 안 쓰는 내 캐릭터를 지우거나 그림을 줄여 주세요.');
      }
      loadMyChars();
      // 기본 테마를 쓰고 있으면 새 캐릭터가 바로 나온다. 다른 테마라도 지금 화면에 함께 보여준다.
      const theme = findTheme(activeKey);
      spawn(theme.cast.some((c) => c.id === pack.id) ? theme : { ...theme, cast: [...theme.cast, { id: pack.id }] });
      const m = mascots.find((x) => x.id === pack.id);
      if (m) {
        m.say('안녕!', 2000);
        m.hop();
      }
      return { id: pack.id, name: pack.label, replaced };
    },
    remove(id) {
      writeValue(MY_CHARS_KEY, savedChars().filter((c) => c && c.id !== id));
      loadMyChars();
      spawn(findTheme(activeKey));
    },
    code: (id) => {
      const spec = savedChars().find((c) => c && c.id === id);
      return spec ? CHAR_RULES.encodeCharacter(spec) : Promise.reject(new Error('없는 캐릭터예요.'));
    },
  };
  api.toggleMascot = () => {
    off = !off;
    applyOff();
    writeOff(off);
  };

  api.pickCustomImage = () => {
    const target = mascots.find((m) => m.id === CUSTOM_TARGET && !m.def.pack);
    const redrawAll = () => mascots.filter((m) => m.id === CUSTOM_TARGET).forEach((m) => m.redraw());
    if (!target) {
      window.alert('그림을 바꿀 몽실이가 없어요. (캐릭터 팩으로 바뀌었거나 꺼져 있어요)');
      return;
    }
    const resetPrompt = '원래 몽실이로 되돌릴까요? 취소를 누르면 새 그림을 고릅니다.';
    if (readCustom() && window.confirm(resetPrompt)) {
      writeCustom(null);
      redrawAll();
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const url = await shrinkImage(file);
        if (!writeCustom(url)) {
          window.alert('브라우저 저장소를 쓸 수 없어 그림을 저장하지 못했어요.');
          return;
        }
        redrawAll();
        target.say('짠!', 2000);
        target.hop();
      } catch {
        window.alert('그림을 읽지 못했어요. PNG나 JPG 파일을 골라 주세요.');
      }
    };
    input.click();
  };

  let nextMeetAt = 0;
  function checkMeetings(now) {
    if (now < nextMeetAt) return;
    for (let i = 0; i < mascots.length; i++) {
      for (let j = i + 1; j < mascots.length; j++) {
        const [a, b] = [mascots[i], mascots[j]];
        const reach = (a.w + b.w) / 2;
        if (a.skit || b.skit || a.chaser || b.chaser || Math.abs(a.x - b.x) > reach * 0.8) continue;
        const pair = MEET_LINES[[a.id, b.id].sort().join('+')] || {};
        // 정해진 짝 대사가 없으면 팩의 lines.meet (상대 id 또는 default)를 쓴다.
        const lineOf = (me, other) => pair[me.id] || (me.def.meet && (me.def.meet[other.id] || me.def.meet.default));
        const [left, right] = a.x <= b.x ? [a, b] : [b, a];
        const [leftLine, rightLine] = [lineOf(left, right), lineOf(right, left)];
        if (!leftLine && !rightLine) continue;
        // 둘 사이 가운데를 기준으로 말풍선을 바깥쪽으로 펼쳐 겹치지 않게 한다.
        const leftOffset = left.w / 2 + 2 - (right.x - left.x) / 2;
        const rightOffset = right.w / 2 + 2 - (right.x - left.x) / 2;
        if (leftLine) left.say(leftLine, 2200, 'right', leftOffset);
        if (rightLine) right.say(rightLine, 2200, 'left', rightOffset);
        for (const m of [left, right]) {
          m.pause(2200, now);
          m.meetUntil = now + 2200;
        }
        right.hop();
        nextMeetAt = now + MEET_COOLDOWN_MS;
        return;
      }
    }
  }

  let nextChaseAt = performance.now() + 15000;
  function checkChase(now) {
    if (now < nextChaseAt) return;
    nextChaseAt = now + CHASE_COOLDOWN_MS * (0.7 + Math.random() * 0.6);
    for (const chaser of mascots.filter((m) => m.chaser && !m.chase)) {
      const others = mascots.filter((m) => !m.chaser && now >= m.fleeUntil);
      if (!others.length) return;
      const prey = others.reduce((a, b) => (Math.abs(a.x - chaser.x) <= Math.abs(b.x - chaser.x) ? a : b));
      chaser.startChase(prey, now);
    }
  }

  let last = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!off) {
      const mood = mascotMood(api.latest);
      if (mood === 'normal') {
        checkMeetings(now);
        checkChase(now);
      }
      mascots.forEach((m) => m.update(now, dt, mood));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
