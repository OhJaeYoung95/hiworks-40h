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
  const GRAVITY = 2600; // 떨어질 때 가속도 (px/초²)
  const DRAG_START_PX = 5; // 이만큼 끌어야 드래그로 본다 (그보다 작으면 클릭)
  const SCREAM_HEIGHT = 50; // 이보다 높은 데서 떨어지면 비명을 지른다
  const LAND_MS = 420;
  const MENU_IDLE_MS = 5000;
  // 종이: 캐릭터는 종이에서 빠져나와 돌아다니고, 가두면 종이에 붙어 왼쪽 벽으로 유배된다.
  const EXILE_KEY = 'hw40-exiled';
  const EXILE_SCALE = 0.55;
  const WALL_STAY_MS = 6000; // 방에서 나간 아바타가 벽에 붙어 있는 시간 (그 뒤 사라진다)
  const STORAGE_KEY = 'hw40-mascot-off';
  // 예전 "몽실이 그림 바꾸기"가 남긴 그림. 기능을 뺐으니 저장 공간만 비운다.
  const OLD_CUSTOM_KEY = 'hw40-custom-image';
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
    /* 잡혀서 대롱대롱 → 버둥거리며 떨어짐 → 착지할 때 납작 */
    svg, #sprite { touch-action: none; }
    .dragged svg, .dragged #jump { animation: dangle .45s ease-in-out infinite alternate; transform-origin: 50% 0; }
    .falling svg, .falling #jump { animation: flail .09s linear infinite alternate; transform-origin: 50% 50%; }
    .land svg, .land #jump { animation: squash ${LAND_MS}ms cubic-bezier(.3,1.5,.5,1); transform-origin: 50% 100%; }
    @keyframes dangle { from { transform: rotate(-14deg); } to { transform: rotate(14deg); } }
    @keyframes flail { from { transform: rotate(-9deg) scaleY(1.06); } to { transform: rotate(9deg) scaleY(1.06); } }
    @keyframes squash { 0% { transform: scale(1.35, .62); } 45% { transform: scale(.88, 1.14); } 75% { transform: scale(1.06, .95); } 100% { transform: none; } }
    /* 클릭 메뉴: 캐릭터 둘레에 동그란 말풍선 버튼 */
    /* 종이: 캐릭터 뒤에 깔리는 공책 종이 */
    #card { position: relative; }
    #paper { position: absolute; left: 50%; bottom: -5px; border-radius: 3px; opacity: 0; pointer-events: none;
      background: #fffdf5 repeating-linear-gradient(to bottom, transparent 0 13px, rgba(110,140,200,.28) 13px 14px);
      border: 1px solid #e3dccb; box-shadow: 0 3px 9px rgba(0,0,0,.2); transform-origin: 50% 100%; }
    #paper::before { content: ''; position: absolute; top: 0; bottom: 0; left: 14%; width: 1px; background: rgba(220,110,110,.45); }
    #paper.on { opacity: 1; }
    #paper.show { animation: paperIn .34s cubic-bezier(.2,.9,.3,1.25) both; }
    #paper.away { animation: paperAway .75s ease-in both; }
    #paper.exiled { opacity: 1; pointer-events: auto; cursor: pointer; }
    @keyframes paperIn { from { opacity: 0; transform: translateY(24px) scaleY(.08); } to { opacity: 1; transform: none; } }
    @keyframes paperAway { from { opacity: 1; transform: none; } to { opacity: 0; transform: translate(-26px, 46px) rotate(-38deg) scale(.7); } }
    /* 종이 위의 그림이 된 모습 → 촥 붙기 → 톡 튀어나오기 */
    .flat { filter: sepia(.5) saturate(.7) contrast(.95); }
    .flat svg, .flat #jump { transform: scale(.88); transform-origin: 50% 100%; }
    .stuck svg, .stuck #jump { animation: splat .36s cubic-bezier(.3,1.4,.5,1) both; transform-origin: 50% 100%; }
    @keyframes splat { 0% { transform: none; } 35% { transform: scale(1.3, .68); } 100% { transform: scale(.88); } }
    .popout svg, .popout #jump { animation: popout .55s cubic-bezier(.3,1.5,.5,1); transform-origin: 50% 100%; }
    @keyframes popout { 0% { transform: scale(.88); } 40% { transform: translateY(-20px) scale(1.12); } 100% { transform: none; } }
    .sway { animation: sway 2.6s ease-in-out infinite alternate; transform-origin: 50% 0; }
    @keyframes sway { from { transform: rotate(-3deg); } to { transform: rotate(3deg); } }
    #ring { position: absolute; left: 50%; width: 0; height: 0; }
    /* 놀러 온 캐릭터의 주인 이름표 */
    #tag { position: absolute; left: 50%; bottom: -2px; transform: translateX(-50%); padding: 0 6px; border-radius: 8px;
      background: #3b5ba9; color: #fff; font: 600 10px/15px 'Malgun Gothic', sans-serif; white-space: nowrap; pointer-events: none; }
    #ring button { position: absolute; width: 38px; height: 38px; margin: -19px 0 0 -19px; padding: 0; border-radius: 50%;
      display: grid; place-items: center; background: #fff; border: 1.5px solid #6b4a2b; color: #4a3520;
      box-shadow: 0 2px 6px rgba(0,0,0,.2); font: 17px/1 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif;
      cursor: pointer; pointer-events: auto; animation: pop .26s cubic-bezier(.3,1.6,.5,1) backwards; }
    #ring button:hover, #ring button:focus-visible { background: #fff4dc; transform: scale(1.15); outline: none; }
    #ring button::after { content: attr(data-label); position: absolute; top: 100%; margin-top: 3px; white-space: nowrap;
      padding: 1px 6px; border-radius: 8px; background: #4a3520; color: #fff; font: 600 11px 'Malgun Gothic', sans-serif;
      opacity: 0; transition: opacity .12s; pointer-events: none; }
    #ring button:hover::after, #ring button:focus-visible::after { opacity: 1; }
    @keyframes pop { from { transform: translate(var(--fx), var(--fy)) scale(.2); opacity: 0; } }
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

  const maxX = (w = WIDTH) => Math.max(0, window.innerWidth - w);
  // 패널에 가리지 않고 멈춰 있을 수 있는 오른쪽 한계
  const clearMaxX = (w = WIDTH) => Math.max(0, window.innerWidth - w - PANEL_CLEARANCE);

  try {
    localStorage.removeItem(OLD_CUSTOM_KEY);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다.
  }

  const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

  // look: 테마가 정한 이름(name)과 크기(size)
  // look.guest: 놀러 온 동료의 캐릭터일 때 { nick, pet(), leave() }
  function createMascot(def, index, count, look = {}) {
    const guest = look.guest || null;
    // 패널보다 낮은 층에 두어 패널을 가리지 않게 한다. 빈 영역 클릭은 페이지로 통과시킨다.
    const W = look.size || (def.pack ? def.pack.size : WIDTH);
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:0;bottom:0;width:${W}px;height:${W}px;z-index:${2147483640 + index};pointer-events:none;`;
    host.dataset.hw40 = 'mascot';
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const label = String(look.name || def.label).replace(/[<>&"]/g, '');
    const figure = def.pack
      ? `<div id="jump"><div id="sprite" role="img" aria-label="${label}" title="${label}"></div></div>`
      : `<svg viewBox="0 0 64 64" width="${W}" height="${W}" role="img" aria-label="${label}"><title>${label}</title>${def.art}${CONFETTI}</svg>`;
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <div id="bubble" hidden style="bottom:${W + 6}px${guest ? ';white-space:normal;width:max-content;max-width:220px' : ''}"></div>
      <div id="card" style="width:${W}px;height:${W}px">
        <div id="paper" style="width:${Math.round(W * 1.25)}px;height:${Math.round(W * 1.4)}px;margin-left:${-Math.round(W * 0.625)}px" title="눌러서 풀어 주기"></div>
        <div id="flip" style="width:${W}px;height:${W}px;position:relative">${figure}</div>
      </div>
      ${guest ? `<div id="tag">${String(guest.nick).replace(/[<>&"]/g, '')}</div>` : ''}
      <div id="ring" hidden style="bottom:${Math.round(W / 2)}px"></div>`;
    const flip = shadow.getElementById('flip');
    const card = shadow.getElementById('card');
    const paper = shadow.getElementById('paper');
    const bubble = shadow.getElementById('bubble');
    const svg = shadow.querySelector('svg');
    const sprite = shadow.getElementById('sprite');
    const ring = shadow.getElementById('ring');
    const figureEl = svg || sprite;
    const render = def.pack ? createSpriteRenderer(def.pack, sprite) : null;
    if (def.pack && !def.pack.bounce) flip.classList.add('nobounce');

    const m = {
      id: def.id,
      guest,
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
      y: 0, // 바닥에서 떠 있는 높이 (잡혀 있거나 떨어질 때)
      vy: 0,
      dragging: false,
      falling: false,
      landUntil: 0,
      menuOpen: false,
    };
    // 지금 땅에서 평소처럼 움직일 수 있는지 (만남·쫓기 판정에 쓴다)
    m.free = () => !m.dragging && !m.falling && m.y === 0 && !m.menuOpen && !m.phase;
    m.phase = null; // 종이 연출 중: escape(빠져나옴) · trap(갇힘) · fly(날아감) · exiled(유배) · return(돌아옴)
    m.exiledAt = 0;

    // ---------- 종이 ----------
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const setPaper = (...names) => {
      paper.className = '';
      if (names.length) {
        void paper.offsetWidth; // 같은 애니메이션을 다시 시작하게 한다
        paper.classList.add(...names);
      }
    };
    const setFlat = (name) => {
      flip.classList.remove('flat', 'stuck', 'popout');
      if (name) {
        void flip.offsetWidth;
        flip.classList.add(...name.split(' '));
      }
    };
    // 종이에서 톡 튀어나온다 (처음 나올 때, 풀려날 때).
    m.escape = (delay = 0, line = null) => {
      m.phase = 'escape';
      setPaper('on');
      setFlat('flat');
      later(delay + 450, () => {
        setPaper('away');
        setFlat('popout');
        if (line) m.say(line, 1400);
      });
      later(delay + 1050, () => {
        setPaper();
        setFlat(null);
        m.phase = null;
        m.action = 'idle';
        m.actionUntil = performance.now() + 600;
      });
    };
    // 가두기: 종이가 스르륵 → 촥 붙고 → 왼쪽 벽으로 날아가 유배
    m.trap = () => {
      m.closeMenu();
      m.skit = null;
      m.chase = null;
      m.phase = 'trap';
      m.say('어?', 700);
      setPaper('show');
      later(380, () => {
        setFlat('flat stuck');
        m.say('촥!', 900);
      });
      later(1000, () => {
        bubble.hidden = true;
        m.spokenUntil = 0;
        m.phase = 'fly';
        m.exiledAt = Date.now();
        setPaper('on');
        exiled.add(m);
        layoutExile(m);
        saveExiled();
      });
      later(1950, () => {
        m.phase = 'exiled';
        // 날아오며 한 바퀴 돈 각도를 같은 모양의 각도로 되돌린다 (다음 자리 이동 때 거꾸로 돌지 않게).
        host.style.transition = 'none';
        host.style.transform = host.style.transform.replace(/rotate\((-?[\d.]+)deg\)/, (_, a) => `rotate(${Number(a) + 360}deg)`);
        setPaper('exiled');
        card.classList.add('sway');
      });
    };
    // 유배된 채로 바로 놓기 (새로고침 뒤)
    m.placeExiled = () => {
      m.phase = 'exiled';
      m.exiledAt = m.exiledAt || Date.now();
      setPaper('exiled');
      setFlat('flat');
      card.classList.add('sway');
    };
    // 풀어 주기: 바닥으로 내려와서 탈출
    m.releaseFromExile = () => {
      if (m.phase !== 'exiled') return;
      m.phase = 'return';
      card.classList.remove('sway');
      exiled.delete(m);
      saveExiled();
      m.x = Math.random() * clearMaxX(W);
      m.y = 0;
      host.style.transition = 'transform .6s cubic-bezier(.4,0,.3,1.2)';
      host.style.transform = `translate(${m.x}px, 0) rotate(0deg) scale(1)`;
      layoutExile();
      later(650, () => {
        host.style.transition = '';
        m.escape(0, '탈출!');
      });
    };
    // 손님이 돌아갈 때: 종이에 촥 붙어서 화면 밖으로 날아간다.
    m.goHome = (line, done) => {
      if (m.departing) return;
      m.departing = true;
      // 아직 끝나지 않은 등장 연출이 나중에 끼어들지 않게 멈춘다.
      timers.forEach(clearTimeout);
      timers.length = 0;
      m.chatUntil = 0;
      m.closeMenu();
      m.skit = null;
      m.chase = null;
      m.dragging = false;
      m.falling = false;
      m.y = 0;
      m.phase = 'trap';
      m.say(line || '안녕~', 900);
      setPaper('show');
      later(380, () => setFlat('flat stuck'));
      later(950, () => {
        m.phase = 'home';
        bubble.hidden = true;
        setPaper('on');
        m.exiledAt = Date.now();
        exiled.add(m);
        layoutExile(m);
      });
      later(1950, () => card.classList.add('sway'));
      later(1950 + WALL_STAY_MS, () => {
        exiled.delete(m);
        host.style.transition = 'opacity .6s ease-in';
        host.style.opacity = '0';
        layoutExile();
      });
      later(1950 + WALL_STAY_MS + 650, () => {
        m.cleanup();
        host.remove();
        if (done) done();
      });
    };
    m.cleanup = () => timers.forEach(clearTimeout);
    // 유배된 종이 어디를 눌러도 풀려난다.
    paper.addEventListener('pointerdown', (e) => {
      if (m.phase !== 'exiled' || e.button !== 0) return;
      e.preventDefault();
      m.releaseFromExile();
    });

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

    m.chatUntil = 0;
    m.say = (text, ms, align = null, offset = 0) => {
      // 사람이 직접 한 말(채팅)이 떠 있는 동안은 다른 대사로 덮지 않는다.
      if (performance.now() < m.chatUntil) return;
      m.bubbleAlign = align;
      m.bubbleOffset = offset;
      showBubble(text);
      m.spokenUntil = performance.now() + ms;
    };

    // 놀러 가기에서 사람이 적은 말
    m.chat = (text) => {
      const ms = Math.max(3000, text.length * 180);
      m.chatUntil = 0;
      m.say(text, ms);
      m.chatUntil = performance.now() + ms;
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

    const remainingText = () => {
      const r = api.latest;
      const left = r && typeof r.remaining === 'number' ? Math.max(0, r.remaining) : null;
      return left === null ? '안녕!' : left === 0 ? '40시간 달성!' : `${formatDuration(left)} 남았어`;
    };
    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    // ---------- 클릭 메뉴 ----------
    // 캐릭터를 누르면 위쪽 반원으로 동그란 말풍선 버튼이 펼쳐진다.
    let menuTimer = 0;
    function menuActions() {
      const skitNames = Object.keys(def.skits);
      if (guest) {
        return [
          ...(guest.pet ? [{ icon: '💗', label: '쓰다듬기', run: () => { m.say(pick(['헤헤', '좋아~', '♥']), 1800); m.hop('hop'); guest.pet(); } }] : []),
          { icon: '🤸', label: '점프', run: () => { m.hop('click'); m.say(pick(['얍!', '홉!', '뿅!']), 1200); } },
          ...(skitNames.length ? [{ icon: '⭐', label: '특기', run: () => m.playSkit(pick(skitNames)) }] : []),
          ...(guest.leave ? [{ icon: '👋', label: '내보내기', run: () => guest.leave() }] : []),
        ];
      }
      return [
        { icon: '⏱', label: '남은 시간', run: () => m.say(remainingText(), 3000) },
        { icon: '📄', label: '가두기', run: () => m.trap() },
        { icon: '🤸', label: '점프', run: () => { m.hop('click'); m.say(pick(['얍!', '홉!', '뿅!']), 1200); } },
        { icon: '💗', label: '쓰다듬기', run: () => { m.say(pick(['헤헤', '좋아~', '♥', '기분 좋다']), 1800); m.hop('hop'); } },
        {
          icon: '🍪',
          label: '간식 주기',
          run: () => {
            if (def.skits.eat) m.playSkit('eat');
            else m.say(pick(['냠냠!', '맛있다!', '고마워!']), 1800);
          },
        },
        ...(skitNames.length ? [{ icon: '⭐', label: '특기', run: () => m.playSkit(pick(skitNames)) }] : []),
      ];
    }
    m.closeMenu = () => {
      if (!m.menuOpen) return;
      m.menuOpen = false;
      ring.hidden = true;
      ring.replaceChildren();
      clearTimeout(menuTimer);
    };
    function openMenu() {
      m.menuOpen = true;
      m.skit = null;
      m.chase = null;
      bubble.hidden = true;
      m.spokenUntil = 0;
      const actions = menuActions();
      const radius = Math.max(46, W / 2 + 26);
      // 위쪽 반원(왼쪽 → 오른쪽)에 고르게 놓는다. 화면 가장자리에서는 버튼을 안쪽으로 당긴다.
      const centerX = m.x + W / 2;
      ring.replaceChildren(
        ...actions.map((a, i) => {
          const angle = Math.PI - (Math.PI * (i + 0.5)) / actions.length;
          let dx = Math.cos(angle) * radius;
          const dy = -Math.sin(angle) * radius;
          dx = Math.min(Math.max(dx, 24 - centerX), window.innerWidth - 24 - centerX);
          const b = document.createElement('button');
          b.textContent = a.icon;
          b.dataset.label = a.label;
          b.setAttribute('aria-label', a.label);
          b.style.left = `${dx}px`;
          b.style.top = `${dy}px`;
          b.style.setProperty('--fx', `${-dx}px`);
          b.style.setProperty('--fy', `${-dy}px`);
          b.style.animationDelay = `${i * 30}ms`;
          b.onclick = (e) => {
            e.stopPropagation();
            m.closeMenu();
            a.run();
          };
          return b;
        })
      );
      ring.hidden = false;
      clearTimeout(menuTimer);
      menuTimer = setTimeout(m.closeMenu, MENU_IDLE_MS);
    }
    m.openMenu = openMenu;

    // ---------- 드래그 ----------
    // 누른 채 끌면 마우스를 따라오고, 놓으면 "으아아아" 떨어져서 "콩" 착지한다. 조금만 움직였으면 클릭으로 본다.
    let press = null;
    figureEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // 종이 연출 중에는 잡을 수 없다. 유배된 종이는 누르면 풀려난다.
      if (m.phase) {
        e.preventDefault();
        if (m.phase === 'exiled') m.releaseFromExile();
        return;
      }
      e.preventDefault();
      press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, gx: e.clientX - m.x, gy: window.innerHeight - e.clientY - m.y };
      try {
        figureEl.setPointerCapture(e.pointerId);
      } catch {
        // 포인터 캡처를 못 해도 같은 요소 위에서는 동작한다.
      }
    });
    figureEl.addEventListener('pointermove', (e) => {
      if (!press || e.pointerId !== press.id) return;
      if (!m.dragging) {
        if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) < DRAG_START_PX) return;
        m.closeMenu();
        m.dragging = true;
        m.falling = false;
        m.skit = null;
        m.chase = null;
        m.fleeUntil = 0;
        m.say(pick(['어어?!', '앗!', '놔줘~', '어디 가?']), 1500);
      }
      m.x = Math.min(Math.max(e.clientX - press.gx, 0), maxX(W));
      m.y = Math.min(Math.max(window.innerHeight - e.clientY - press.gy, 0), window.innerHeight - W);
    });
    const release = (e) => {
      if (!press || e.pointerId !== press.id) return;
      const wasDrag = m.dragging;
      press = null;
      if (!wasDrag) {
        if (e.type === 'pointercancel') return;
        if (m.menuOpen) m.closeMenu();
        else openMenu();
        return;
      }
      m.drop();
    };
    // 놓으면 떨어진다. 이미 땅이면 바로 착지한다.
    m.drop = () => {
      m.dragging = false;
      m.falling = true;
      m.vy = 0;
      if (m.y > SCREAM_HEIGHT) m.say('으아아아!', 5000);
    };
    figureEl.addEventListener('pointerup', release);
    figureEl.addEventListener('pointercancel', release);

    // 축하·휴식 때 서는 자리. 겹치지 않게 패널 왼쪽 공간을 나눠 쓴다.
    const slot = () => (clearMaxX(W) * (index + 1)) / (count + 1);

    // 지금 상황에 맞는 애니메이션 트리거 이름
    function stateFor(now, mood, moving) {
      if (m.dragging) return 'drag';
      if (m.falling) return 'fall';
      if (now < m.landUntil) return 'land';
      if (m.menuOpen) return 'idle';
      if (mood === 'celebrate' || mood === 'rest') return m.hopping ? m.hopKind : moving ? 'hurry' : mood;
      if (mood === 'hurry') return 'hurry';
      if (now < m.fleeUntil) return 'flee';
      if (m.chase) return 'chase';
      if (m.hopping) return m.hopKind;
      if (m.skit) return m.skit;
      if (now < m.meetUntil) return 'meet';
      return moving ? 'walk' : 'idle';
    }

    // 잡혀 있거나 떨어지는 중이거나 막 착지했을 때: 평소 움직임 대신 이것만 한다.
    function updateAir(now, dt) {
      if (m.falling) {
        m.vy += GRAVITY * dt;
        m.y = Math.max(0, m.y - m.vy * dt);
        if (m.y === 0) {
          m.falling = false;
          m.landUntil = now + LAND_MS;
          m.say('콩!', 1300);
          flip.classList.remove('land');
          void flip.offsetWidth; // 같은 애니메이션을 다시 시작하게 한다
          flip.classList.add('land');
          setTimeout(() => flip.classList.remove('land'), LAND_MS);
          m.action = 'idle';
          m.actionUntil = now + LAND_MS + 600;
        }
      }
      flip.classList.toggle('dragged', m.dragging);
      flip.classList.toggle('falling', m.falling);
      flip.classList.toggle('walk', m.falling);
      flip.classList.toggle('fast', m.falling);
      flip.classList.toggle('idle', !m.falling);
      flip.classList.remove('party', 'hop');
      for (const name of Object.keys(def.skits)) flip.classList.remove(`skit-${name}`);
      host.style.transform = `translate(${m.x}px, ${-m.y}px)`;
      const facing = render ? render(stateFor(now, 'normal', false), now, m.dir) : m.dir;
      flip.style.transform = `scaleX(${facing})`;
      if (now < m.spokenUntil) showBubble(bubble.textContent);
      else bubble.hidden = true;
    }

    m.update = (now, dt, mood) => {
      if (m.phase) {
        // 종이 연출 중: 위치는 연출이 정하고, 그림만 넘긴다.
        if (m.phase === 'escape') host.style.transform = `translate(${m.x}px, 0)`;
        flip.classList.remove('party', 'hop', 'walk', 'fast');
        flip.classList.add('idle');
        const facing = render ? render('idle', now, m.dir) : m.dir;
        flip.style.transform = `scaleX(${facing})`;
        if (m.phase === 'escape' || m.phase === 'trap') {
          if (now < m.spokenUntil) showBubble(bubble.textContent);
          else bubble.hidden = true;
        } else bubble.hidden = true;
        return;
      }
      if (m.dragging || m.falling || now < m.landUntil) {
        updateAir(now, dt);
        return;
      }
      if (m.menuOpen) {
        // 메뉴가 열려 있는 동안은 제자리에 서 있는다.
        m.action = 'idle';
        m.actionUntil = now + 1000;
      }
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
          } else if (!m.chase.free()) {
            // 잡으려던 상대가 들려 올라갔다.
            m.chase = null;
            m.say('어라?', 1500);
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
      host.style.transform = `translate(${m.x}px, 0)`;
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

  // 기본 테마: 배포된 기본 캐릭터 그대로 (내 캐릭터는 테마를 고쳐서 넣는다)
  const defaultTheme = () => ({ key: 'default', name: '기본', source: 'default', cast: CHARACTERS.map((d) => ({ id: d.id })) });
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

  const savedThemes = () => {
    const saved = readJson(THEMES_KEY, []);
    return Array.isArray(saved) ? saved.filter((t) => t && typeof t.key === 'string') : [];
  };

  let mascots = [];
  let off = readOff();
  const applyOff = () => [...mascots, ...guests].forEach((m) => { m.host.hidden = off; });

  // ---------- 유배 ----------
  // 가둔 캐릭터는 왼쪽 벽에 작은 종이로 쌓인다. 새로고침해도 그대로 남는다 (캐릭터 id로 기억).
  const exiled = new Set();
  function saveExiled() {
    // 방에서는 저장하지 않는다 (방장의 캐릭터를 가둔 것이 내 테마에 남지 않게). 아바타·떠나는 캐릭터도 뺀다.
    if (roomCast) return;
    writeValue(EXILE_KEY, [...exiled].filter((m) => !m.guest && !m.departing).sort((a, b) => a.exiledAt - b.exiledAt).map((m) => m.id));
  }
  // 유배된 종이들의 자리를 정한다. flying: 지금 막 날아가는 캐릭터 (한 바퀴 돌며 날아간다)
  function layoutExile(flying = null) {
    const list = [...exiled].sort((a, b) => a.exiledAt - b.exiledAt);
    let y = 96;
    let x = 10;
    list.forEach((m, i) => {
      const h = m.w * 1.4 * EXILE_SCALE;
      if (y + h > window.innerHeight - 20) {
        y = 96;
        x += m.w * 1.25 * EXILE_SCALE + 10;
      }
      // 크기를 줄이면 가운데를 기준으로 줄어드므로 그만큼 당겨 놓는다.
      const shrink = (m.w * (1 - EXILE_SCALE)) / 2;
      const angle = [-6, 4, -2, 6][i % 4];
      const spin = m === flying ? angle - 360 : angle;
      m.host.style.transition = m === flying ? 'transform .9s cubic-bezier(.5,-0.25,.35,1)' : 'transform .4s ease';
      m.host.style.transform = `translate(${x - shrink}px, ${-(y - shrink)}px) rotate(${spin}deg) scale(${EXILE_SCALE})`;
      if (m !== flying) setTimeout(() => { if (m.phase === 'exiled') m.host.style.transition = ''; }, 420);
      y += h + 8;
    });
  }

  // 테마대로 캐릭터를 다시 만든다. 이 버전에 없는 캐릭터는 건너뛴다.
  // intro: 종이에서 차례로 빠져나오는 연출 (처음 열 때·테마를 바꿀 때)
  function spawn(theme, intro = true) {
    for (const m of mascots) {
      m.cleanup();
      m.host.remove();
    }
    exiled.clear();
    const cast = theme.cast.filter((c) => CATALOG.has(c.id));
    const list = cast.length ? cast : defaultTheme().cast;
    mascots = list.map((c, i) => createMascot(CATALOG.get(c.id), i, list.length, c));
    api.mascots = mascots;
    const saved = readJson(EXILE_KEY, []);
    const wanted = Array.isArray(saved) ? [...saved] : [];
    let order = 0;
    mascots.forEach((m) => {
      const at = wanted.indexOf(m.id);
      if (at >= 0) {
        wanted.splice(at, 1);
        m.exiledAt = (order += 1);
        exiled.add(m);
        m.placeExiled();
      }
    });
    layoutExile();
    if (intro) mascots.filter((m) => !m.phase).forEach((m, i) => m.escape(300 + i * 260, i === 0 ? '나왔다!' : null));
    applyOff();
  }
  window.addEventListener('resize', () => layoutExile());

  // ---------- 방 모드 ----------
  // 방에 있는 동안 화면의 캐릭터는 내 테마가 아니라 방 캐릭터(방장의 테마 + 데려온 캐릭터)다. 나가면 내 테마로 돌아온다.
  let roomCast = null;
  const roomDefs = new Map(); // 방 캐릭터 key → 그림이 함께 온 캐릭터 정의
  function roomDef(c) {
    const known = CATALOG.get(c.id);
    if (known && !known.mine) return known;
    if (c.spec && CHAR_RULES) {
      if (!roomDefs.has(c.key)) {
        try {
          roomDefs.set(c.key, packDef(CHAR_RULES.normalizeCharacter(c.spec)));
        } catch {
          roomDefs.set(c.key, null);
        }
      }
      if (roomDefs.get(c.key)) return roomDefs.get(c.key);
    }
    return known || null;
  }
  // 방 캐릭터를 맞춘다: 그대로인 캐릭터는 두고, 새로 온 캐릭터는 종이에서 나오고, 빠진 캐릭터는 벽으로 날아간다.
  function syncRoom(list, intro) {
    const want = list.map((c) => ({ c, def: roomDef(c) })).filter((w) => w.def);
    const rest = [...mascots];
    const next = want.map((w, i) => {
      const at = rest.findIndex((m) => m.roomKey === w.c.key);
      if (at >= 0) return rest.splice(at, 1)[0];
      const m = createMascot(w.def, i, want.length, { name: w.c.name, size: w.c.size });
      m.roomKey = w.c.key;
      m.escape(intro ? 300 + i * 220 : 150, intro ? null : '왔다!');
      return m;
    });
    for (const m of rest) {
      guests.push(m);
      m.goHome('안녕~', () => {
        guests = guests.filter((x) => x !== m);
      });
    }
    mascots = next;
    api.mascots = mascots;
    applyOff();
  }

  // ---------- 손님 (놀러 온 동료의 캐릭터) ----------
  // 테마를 바꿔도 그대로 남고, 유배되지 않는다. 연결이 끊기면 종이에 붙어 돌아간다.
  let guests = [];
  // 받은 캐릭터 정보로 그릴 캐릭터를 정한다. 내게도 있는 기본·팩 캐릭터면 그것을, 직접 만든 캐릭터면 함께 온 그림을 쓴다.
  function guestDef(info) {
    const known = CATALOG.get(info && info.id);
    if (known && !known.mine) return known;
    if (info && info.spec && CHAR_RULES) {
      try {
        return packDef(CHAR_RULES.normalizeCharacter(info.spec));
      } catch {
        // 그림이 깨졌으면 아래에서 다른 캐릭터로 대신한다.
      }
    }
    return known || CHARACTERS[0] || BASE_CATALOG[0];
  }
  // 지금 상대 화면에 놀러 갈 내 캐릭터: 유배되지 않은 첫 캐릭터
  // 아바타로 고를 수 있는 캐릭터: 내 테마의 캐릭터들 (방에 있어 화면이 방장 테마여도 내 테마에서 고른다)
  function myCast() {
    return findTheme(activeKey).cast.filter((c) => CATALOG.has(c.id));
  }
  // 캐릭터 하나를 다른 사람에게 보낼 정보로 만든다. 직접 만든 캐릭터면 그림 설정까지 담는다.
  function charInfo(id, look = {}) {
    const def = CATALOG.get(id);
    if (!def) return null;
    const spec = def.mine ? savedChars().find((c) => c.id === id) || null : null;
    const info = { id, name: look.name || def.label, size: look.size || (def.pack ? def.pack.size : WIDTH) };
    if (spec) info.spec = spec;
    return info;
  }
  api.guests = {
    onCast: null, // 내 테마가 바뀌면 불린다 (아바타 목록 다시 만들기)
    // 아바타로 고를 수 있는 내 캐릭터들
    cast: () => [...new Map(myCast().map((c) => [c.id, { id: c.id, name: c.name || CATALOG.get(c.id).label }])).values()],
    // 보낼 내 아바타 정보. id: 고른 캐릭터 (없으면 내 테마의 첫 캐릭터)
    me(id) {
      const cast = myCast();
      const c = cast.find((x) => x.id === id) || cast[0] || { id: CHARACTERS[0].id };
      return charInfo(c.id, c);
    },
    // 손님 캐릭터를 내 화면에 들인다. hooks: { nick, pet(), leave() }
    arrive(info, hooks) {
      const def = guestDef(info);
      const size = Math.min(Math.max(Number(info && info.size) || 0, 32), 160) || undefined;
      const name = String((info && info.name) || def.label).slice(0, 20);
      const g = createMascot(def, 9, 1, { name, size, guest: hooks });
      g.x = Math.random() * clearMaxX(g.w);
      g.host.title = `${hooks.nick}님의 ${name}`;
      g.host.hidden = off;
      guests.push(g);
      g.escape(200, hooks.quiet ? null : hooks.self ? '나왔다!' : `${hooks.nick}님 입장!`);
      return {
        say(text) {
          if (!g.phase) g.chat(text);
        },
        // 다른 사람이 쓰다듬었다
        react(nick) {
          if (!g.phase) {
            g.say(`${nick}님이 쓰다듬었다! 헤헤`, 2200);
            g.hop('hop');
          }
        },
        leave(line) {
          g.goHome(line, () => {
            guests = guests.filter((x) => x !== g);
          });
        },
      };
    },
  };

  let activeKey = findTheme(readJson(ACTIVE_KEY, 'default')).key;
  spawn(findTheme(activeKey));

  // ---------- 내 캐릭터 저장소 ----------
  // 테마 만들기 화면에서 넣은 캐릭터, 또는 테마 코드에 담겨 온 캐릭터의 설정(그림 포함)
  const savedChars = () => {
    const saved = readJson(MY_CHARS_KEY, []);
    return Array.isArray(saved) ? saved.filter((c) => c && typeof c.id === 'string') : [];
  };
  // 캐릭터 설정들을 검사해 저장한다. 같은 id면 새 그림으로 바꾼다.
  function storeChars(specs) {
    const packs = specs.map((spec) => CHAR_RULES.normalizeCharacter(spec));
    const ids = new Set(packs.map((p) => p.id));
    const before = savedChars();
    const replaced = before.filter((c) => ids.has(c.id)).map((c) => c.id);
    if (!writeValue(MY_CHARS_KEY, [...before.filter((c) => !ids.has(c.id)), ...specs])) {
      throw new CHAR_RULES.CharError('브라우저 저장 공간이 모자라 저장하지 못했어요. 안 쓰는 테마나 캐릭터를 지워 주세요.');
    }
    loadMyChars();
    return { packs, replaced };
  }
  // 어느 내 테마에도 쓰이지 않는 캐릭터를 지운다 (하이웍스 화면에서 테마를 지울 때).
  function dropUnusedChars() {
    const used = new Set(savedThemes().flatMap((t) => (t.cast || []).map((c) => (typeof c === 'string' ? c : c && c.id))));
    writeValue(MY_CHARS_KEY, savedChars().filter((c) => used.has(c.id)));
    loadMyChars();
  }

  api.themes = {
    // 고를 수 있는 캐릭터 목록 (테마 만들기 화면에서 씀). mine: 직접 넣은 캐릭터
    catalog: () => [...CATALOG.values()].map((d) => ({ id: d.id, label: d.label, pack: d.pack || null, art: d.art || null, chaser: Boolean(d.chaser), mine: Boolean(d.mine) })),
    list: () => allThemes().map(({ key, name, source, cast }) => ({ key, name, source, cast })),
    active: () => activeKey,
    apply(key) {
      const theme = findTheme(key);
      activeKey = theme.key;
      writeValue(ACTIVE_KEY, activeKey === 'default' ? null : activeKey);
      // 방에 있는 동안은 화면을 바꾸지 않는다 (방을 나오면 이 테마로 돌아온다).
      if (!roomCast) spawn(theme);
      if (api.guests.onCast) api.guests.onCast();
      return theme.key;
    },
    // 저장하지 않고 잠깐 보여주기 (테마 만들기 화면의 미리 보기)
    preview(raw) {
      const { theme, warnings } = THEME_RULES.normalizeTheme(raw, knownIds);
      spawn(theme, false);
      return warnings;
    },
    // 테마 코드를 내 테마로 추가하고 바로 적용한다. 코드에 담긴 캐릭터도 함께 저장한다.
    async addCode(code) {
      const text = String(code || '').trim();
      if (text.startsWith(CHAR_RULES.CODE_PREFIX)) {
        throw new THEME_RULES.ThemeError('캐릭터 코드예요. 테마 만들기 화면에서 캐릭터를 넣고 테마를 만든 뒤, 테마 코드를 넣어 주세요.');
      }
      const { theme: raw, characters } = await THEME_RULES.decodeThemeCode(text);
      if (characters.length) storeChars(characters);
      const { theme, warnings } = THEME_RULES.normalizeTheme(raw, knownIds);
      const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      if (!writeValue(THEMES_KEY, [...savedThemes(), { key, ...theme }])) {
        throw new THEME_RULES.ThemeError('브라우저 저장소를 쓸 수 없어 테마를 저장하지 못했어요.');
      }
      api.themes.apply(`mine:${key}`);
      return { key: `mine:${key}`, name: theme.name, warnings, characters: characters.length };
    },
    // 내 테마를 지운다. 그 테마에만 쓰이던 캐릭터도 함께 지운다.
    remove(key) {
      const target = myThemes().find((t) => t.key === key);
      if (!target) return;
      writeValue(THEMES_KEY, savedThemes().filter((t) => t.key !== target.savedKey));
      dropUnusedChars();
      if (activeKey === key) api.themes.apply('default');
    },
    // 공유 코드. 내 캐릭터가 들어 있으면 그 그림까지 담는다.
    code(keyOrTheme) {
      const t = typeof keyOrTheme === 'string' ? findTheme(keyOrTheme) : keyOrTheme;
      const ids = new Set(t.cast.map((c) => c.id));
      return THEME_RULES.encodeThemeCode({ name: t.name, cast: t.cast }, savedChars().filter((c) => ids.has(c.id)));
    },
    site: PACKS.site || null,
  };

  // 테마 만들기 화면에서 쓰는 내 캐릭터 관리 (하이웍스 패널에서는 쓰지 않는다)
  api.characters = {
    list: () => myDefs.map((d) => ({ id: d.id, label: d.label })),
    async addCode(code) {
      const spec = await CHAR_RULES.decodeCharacter(code);
      const { packs, replaced } = storeChars([spec]);
      return { id: packs[0].id, name: packs[0].label, replaced: replaced.length > 0 };
    },
    remove(id) {
      writeValue(MY_CHARS_KEY, savedChars().filter((c) => c.id !== id));
      loadMyChars();
    },
    // 테마 코드에 담겨 온 캐릭터 설정을 넣는다.
    addSpecs: (specs) => storeChars(specs),
    // 다른 탭(캐릭터 만들기)에서 넣은 캐릭터를 다시 읽는다.
    reload: () => loadMyChars(),
  };
  api.room = {
    // 방장이 방을 열 때 쓰는 처음 방 캐릭터 = 내 지금 테마
    themeCast: () => myCast().map((c) => charInfo(c.id, c)).filter(Boolean),
    // 데려올 수 있는 내 캐릭터들 (기본·팩·직접 만든 캐릭터)
    bringable: () => [...CATALOG.values()].map((d) => ({ id: d.id, name: d.label, mine: Boolean(d.mine) })),
    entryFor: (id) => charInfo(id),
    get active() { return Boolean(roomCast); },
    // 방 캐릭터를 맞춘다. 처음이면 화면을 방으로 바꾼다.
    setCast(list) {
      const first = !roomCast;
      if (first) {
        for (const m of mascots) {
          m.cleanup();
          m.host.remove();
        }
        exiled.clear();
        mascots = [];
      }
      roomCast = list;
      syncRoom(list, first);
      layoutExile();
    },
    // 방에서 나왔다: 내 테마로 돌아온다.
    exit() {
      if (!roomCast) return;
      roomCast = null;
      roomDefs.clear();
      spawn(findTheme(activeKey));
    },
  };
  api.toggleMascot = () => {
    off = !off;
    applyOff();
    writeOff(off);
  };

  // 메뉴 바깥을 누르면 열린 메뉴를 닫는다.
  window.addEventListener('pointerdown', (e) => {
    for (const m of [...mascots, ...guests]) if (m.menuOpen && !e.composedPath().includes(m.host)) m.closeMenu();
  }, true);

  let nextMeetAt = 0;
  function checkMeetings(now) {
    if (now < nextMeetAt) return;
    const mascots = everyone();
    for (let i = 0; i < mascots.length; i++) {
      for (let j = i + 1; j < mascots.length; j++) {
        const [a, b] = [mascots[i], mascots[j]];
        const reach = (a.w + b.w) / 2;
        if (a.skit || b.skit || a.chaser || b.chaser || !a.free() || !b.free() || Math.abs(a.x - b.x) > reach * 0.8) continue;
        const pair = MEET_LINES[[a.id, b.id].sort().join('+')] || {};
        // 정해진 짝 대사가 없으면 팩의 lines.meet (상대 id 또는 default)를 쓴다.
        // 손님과 만나면 따로 정한 대사가 없어도 인사한다.
        const lineOf = (me, other) => pair[me.id] || (me.def.meet && (me.def.meet[other.id] || me.def.meet.default))
          || (me.guest || other.guest ? pickOne(['안녕!', '반가워!', '어디서 왔어?', '놀러 왔구나!']) : null);
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

  const everyone = () => (guests.length ? [...mascots, ...guests] : mascots);
  let nextChaseAt = performance.now() + 15000;
  function checkChase(now) {
    const mascots = everyone();
    if (now < nextChaseAt) return;
    nextChaseAt = now + CHASE_COOLDOWN_MS * (0.7 + Math.random() * 0.6);
    for (const chaser of mascots.filter((m) => m.chaser && !m.chase && m.free())) {
      const others = mascots.filter((m) => !m.chaser && now >= m.fleeUntil && m.free());
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
      everyone().forEach((m) => m.update(now, dt, mood));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
