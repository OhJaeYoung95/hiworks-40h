// 기본으로 들어 있는 오리지널 캐릭터들. 외부 이미지 없이 SVG와 CSS 애니메이션으로 그린다.
// mascot.js가 화면에 띄우고, scripts/export-samples.js가 캐릭터 팩 샘플로 뽑아낸다.
(function (root) {
  const ART_CSS = `
    .leg { transform-box: fill-box; transform-origin: top center; }
    .walk .leg-a { animation: step .5s ease-in-out infinite; }
    .walk .leg-b { animation: step .5s ease-in-out infinite reverse; }
    .walk #body { animation: bob .25s ease-in-out infinite alternate; }
    .fast .leg-a, .fast .leg-b, .skit-zoom .leg-a, .skit-zoom .leg-b { animation-duration: .2s; }
    .fast #body, .skit-zoom #body { animation-duration: .1s; }
    .idle #body { animation: breathe 1.6s ease-in-out infinite alternate; }
    .prop, #confetti, #eyes-closed { display: none; }
    #body { transform-box: fill-box; transform-origin: bottom center; }
    .skit-weed #weed { display: inline; animation: weed-pop 3.2s linear forwards; }
    .skit-weed #body { animation: tug 3.2s ease-in-out forwards; }
    .skit-tear #tears { display: inline; }
    .skit-tear #tears path { animation: tear-drop .9s ease-in infinite; }
    .skit-tear #tears path + path { animation-delay: .45s; }
    .skit-tear #body { animation: tremble .12s linear infinite alternate; }
    .skit-eat #food, .skit-carrot #food { display: inline; transform-box: fill-box; transform-origin: center;
      animation: munch 3s steps(4) forwards; }
    .skit-eat #body, .skit-carrot #body { animation: bob .22s ease-in-out infinite alternate; }
    .skit-coffee #mug { display: inline; transform-box: fill-box; transform-origin: left bottom;
      animation: sip 3.4s ease-in-out forwards; }
    .skit-nap #eyes-open { display: none; }
    .skit-nap #eyes-closed { display: inline; }
    .skit-nap #body { animation: breathe 1.8s ease-in-out infinite alternate; }
    .skit-roar #body { animation: tremble .08s linear infinite alternate; }
    .party #cert, .party #confetti { display: inline; }
    .party #confetti rect { animation: confetti 1.3s linear infinite; }
    .party #confetti rect:nth-child(2) { animation-delay: .35s; }
    .party #confetti rect:nth-child(3) { animation-delay: .7s; }
    .party #confetti rect:nth-child(4) { animation-delay: 1s; }
    @keyframes step { from { transform: rotate(-24deg); } to { transform: rotate(24deg); } }
    @keyframes bob { from { transform: translateY(0); } to { transform: translateY(-2px); } }
    @keyframes breathe { from { transform: translateY(0); } to { transform: translateY(1px); } }
    @keyframes hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-26px); } }
    @keyframes tug { 0%, 100% { transform: rotate(0); } 15%, 45% { transform: rotate(9deg); }
      30%, 60% { transform: rotate(4deg); } 72% { transform: rotate(13deg); } 80% { transform: rotate(-9deg); } }
    @keyframes weed-pop { 0%, 72% { transform: translateY(0); opacity: 1; }
      90% { transform: translateY(-16px); opacity: 1; } 100% { transform: translateY(-20px); opacity: 0; } }
    @keyframes tear-drop { 0%, 65% { opacity: 1; } 0% { transform: translateY(0); }
      100% { transform: translateY(11px); opacity: 0; } }
    @keyframes tremble { from { transform: translateX(-.7px); } to { transform: translateX(.7px); } }
    @keyframes munch { from { transform: scale(1); } to { transform: scale(0); } }
    @keyframes sip { 0%, 100% { transform: rotate(0); } 25%, 45% { transform: rotate(-32deg); }
      60%, 80% { transform: rotate(-32deg) translateY(-1px); } }
    @keyframes confetti { from { transform: translateY(0) rotate(0); opacity: 1; }
      to { transform: translateY(58px) rotate(200deg); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  `;

  const CONFETTI = `
    <g id="confetti">
      <rect x="4" y="-8" width="4" height="4" fill="#f2a58e"/>
      <rect x="20" y="-14" width="4" height="4" fill="#8cc152"/>
      <rect x="40" y="-10" width="4" height="4" fill="#8fd0f2"/>
      <rect x="56" y="-16" width="4" height="4" fill="#f4c542"/>
    </g>`;

  const legs = (fill) => `
    <g fill="${fill}" stroke="#6b4a2b" stroke-width="2">
      <rect class="leg leg-a" x="21" y="49" width="8" height="12" rx="4"/>
      <rect class="leg leg-b" x="35" y="49" width="8" height="12" rx="4"/>
    </g>`;

  // 머리에 새싹이 난 떡. 겁이 많고 잘 운다.
  const KONG = {
    id: 'kong',
    label: '콩떡이',
    speed: 28,
    pauseChance: 0.5,
    partyLine: '40시간 합격! 퇴근!',
    restLine: 'Zz',
    skits: {
      weed: { ms: 3200, text: '뽑았다!', sayAt: 2400 },
      tear: { ms: 2600, text: '흐엉…', sayAt: 200 },
      eat: { ms: 3000, text: '냠냠', sayAt: 200 },
    },
    art: `
      ${legs('#e9c48f')}
      <g id="body">
        <path d="M32 15 C32 11 33 9 34 7" fill="none" stroke="#5c8a3a" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M34 8 C38 2 45 3 47 5 C45 10 38 11 34 8 Z" fill="#8cc152" stroke="#5c8a3a" stroke-width="1.5"/>
        <path d="M33 9 C29 4 23 5 21 7 C23 11 29 12 33 9 Z" fill="#a5d36a" stroke="#5c8a3a" stroke-width="1.5"/>
        <ellipse cx="32" cy="33" rx="23" ry="20" fill="#f6dfb4" stroke="#6b4a2b" stroke-width="2"/>
        <ellipse cx="25" cy="24" rx="7" ry="3.5" fill="#fff" opacity=".6"/>
        <ellipse cx="28" cy="32" rx="2.4" ry="3" fill="#3d2a17"/>
        <ellipse cx="44" cy="32" rx="2.4" ry="3" fill="#3d2a17"/>
        <ellipse cx="22" cy="39" rx="4" ry="2.4" fill="#f2a58e" opacity=".75"/>
        <ellipse cx="49" cy="39" rx="3.4" ry="2.4" fill="#f2a58e" opacity=".75"/>
        <path d="M33 37 Q36 41 39 37" fill="none" stroke="#3d2a17" stroke-width="1.8" stroke-linecap="round"/>
        <g id="tears" class="prop" fill="#4fb0e8" stroke="#2b86bd" stroke-width=".6">
          <path d="M28 35 C24.5 40 24.5 43 28 43 C31.5 43 31.5 40 28 35 Z"/>
          <path d="M44 35 C40.5 40 40.5 43 44 43 C47.5 43 47.5 40 44 35 Z"/>
        </g>
      </g>
      <g id="weed" class="prop" fill="none" stroke="#5c8a3a" stroke-width="2.5" stroke-linecap="round">
        <path d="M62 62 L62 48"/>
        <path d="M62 62 C62 56 60 53 56 51"/>
        <path d="M62 62 C62 56 64 53 69 51"/>
      </g>
      <g id="food" class="prop">
        <path d="M46 34 C48 34 58 47 56 49 C54 51 38 51 36 49 C34 47 44 34 46 34 Z" fill="#fff" stroke="#6b4a2b" stroke-width="1.5"/>
        <rect x="41" y="44" width="10" height="6" rx="1" fill="#2f3b2c"/>
      </g>
      <g id="cert" class="prop">
        <rect x="50" y="10" width="20" height="25" rx="1.5" fill="#fff" stroke="#6b4a2b" stroke-width="1.5" transform="rotate(8 60 22)"/>
        <path d="M54 16 L65 18 M53.5 20 L64.5 22" stroke="#9a8a76" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="60" cy="28" r="4" fill="none" stroke="#d9483b" stroke-width="2"/>
      </g>`,
  };

  // 한쪽 귀가 접힌 연보라 토끼. 이마에 반창고를 붙인 말썽꾸러기.
  const PPYONG = {
    id: 'ppyong',
    label: '뿅이',
    speed: 58,
    pauseChance: 0.3,
    partyLine: '야호!',
    restLine: 'Zz',
    skits: {
      zoom: { ms: 2200, text: '뿅!', sayAt: 100, moving: true },
      carrot: { ms: 3000, text: '아삭아삭', sayAt: 200 },
    },
    art: `
      ${legs('#c6b6e6')}
      <g id="body">
        <ellipse cx="23" cy="14" rx="5.5" ry="13" fill="#dcd0f2" stroke="#6b4a2b" stroke-width="2"/>
        <ellipse cx="23" cy="15" rx="2.4" ry="8.5" fill="#f4c3d3"/>
        <path d="M38 23 C37 12 40 6 46 5 C52 4 57 8 58 13 C54 11 49 12 46 17 C45 20 45 22 45 24 Z" fill="#dcd0f2" stroke="#6b4a2b" stroke-width="2" stroke-linejoin="round"/>
        <ellipse cx="32" cy="37" rx="21" ry="17" fill="#e6dcf7" stroke="#6b4a2b" stroke-width="2"/>
        <g transform="rotate(-18 24 27)">
          <rect x="18" y="24.5" width="12" height="5" rx="2" fill="#f2d3a8" stroke="#a9825a" stroke-width="1"/>
          <path d="M23 25.5 V28.5 M25 25.5 V28.5" stroke="#a9825a" stroke-width=".8"/>
        </g>
        <circle cx="29" cy="36" r="2.6" fill="#3d2a17"/>
        <circle cx="44" cy="36" r="2.6" fill="#3d2a17"/>
        <circle cx="30" cy="35" r=".9" fill="#fff"/>
        <circle cx="45" cy="35" r=".9" fill="#fff"/>
        <path d="M33 41 Q37 46 41 41 Z" fill="#b5475f" stroke="#3d2a17" stroke-width="1.3" stroke-linejoin="round"/>
        <rect x="35.6" y="41" width="2.8" height="2.4" fill="#fff"/>
        <ellipse cx="23" cy="42" rx="3.4" ry="2.1" fill="#f2a5c0" opacity=".8"/>
        <ellipse cx="49" cy="42" rx="3" ry="2.1" fill="#f2a5c0" opacity=".8"/>
      </g>
      <g id="food" class="prop">
        <path d="M43 44 L57 40 C59 44 57 48 54 49 Z" fill="#f09a3e" stroke="#6b4a2b" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M57 41 L62 37 M58 43 L63 42" stroke="#5c8a3a" stroke-width="2" stroke-linecap="round"/>
      </g>`,
  };

  // 동그란 안경을 쓴 치즈 고양이. 늘 침착하고 느릿느릿 걷는다.
  const HODU = {
    id: 'hodu',
    label: '호두',
    speed: 15,
    pauseChance: 0.7,
    partyLine: '수고했어',
    restLine: '수고했어',
    skits: {
      coffee: { ms: 3400, text: '후루룩', sayAt: 900 },
      nap: { ms: 3600, text: 'Zz', sayAt: 300 },
    },
    art: `
      <path d="M12 46 C3 44 2 34 7 29" fill="none" stroke="#6b4a2b" stroke-width="7" stroke-linecap="round"/>
      <path d="M12 46 C3 44 2 34 7 29" fill="none" stroke="#f2ae63" stroke-width="4" stroke-linecap="round"/>
      ${legs('#e89c4e')}
      <g id="body">
        <path d="M13 26 L15 8 L29 17 Z" fill="#f2ae63" stroke="#6b4a2b" stroke-width="2" stroke-linejoin="round"/>
        <path d="M51 26 L49 8 L35 17 Z" fill="#f2ae63" stroke="#6b4a2b" stroke-width="2" stroke-linejoin="round"/>
        <ellipse cx="32" cy="35" rx="24" ry="19" fill="#f6bd7c" stroke="#6b4a2b" stroke-width="2"/>
        <path d="M26 17 L27 23 M32 16 L32 23 M38 17 L37 23" stroke="#cf7a2c" stroke-width="2.4" stroke-linecap="round"/>
        <g id="eyes-open">
          <circle cx="28" cy="34" r="2.1" fill="#3d2a17"/>
          <circle cx="44" cy="34" r="2.1" fill="#3d2a17"/>
        </g>
        <g id="eyes-closed" fill="none" stroke="#3d2a17" stroke-width="1.8" stroke-linecap="round">
          <path d="M24.5 34.5 Q28 37 31.5 34.5"/>
          <path d="M40.5 34.5 Q44 37 47.5 34.5"/>
        </g>
        <g fill="none" stroke="#4a3520" stroke-width="1.7">
          <circle cx="28" cy="34" r="6.2"/>
          <circle cx="44" cy="34" r="6.2"/>
          <path d="M34.2 33.5 H37.8"/>
        </g>
        <path d="M34 42 L38 42 L36 44.5 Z" fill="#d9707a"/>
        <path d="M18 42 L9 40 M18 45 L9 46 M54 42 L60 40 M54 45 L60 46" stroke="#6b4a2b" stroke-width="1.1" stroke-linecap="round"/>
      </g>
      <g id="mug" class="prop">
        <rect x="46" y="42" width="11" height="11" rx="2" fill="#fff" stroke="#6b4a2b" stroke-width="1.6"/>
        <path d="M57 45 C61 45 61 51 57 51" fill="none" stroke="#6b4a2b" stroke-width="1.6"/>
        <rect x="47.5" y="44" width="8" height="2.4" fill="#8a5a33"/>
      </g>`,
  };

  // 양쪽 귀가 축 늘어진 크림색 토끼. 통통하고 느긋하며 간식을 좋아한다.
  const MONG = {
    id: 'mong',
    label: '몽실이',
    speed: 22,
    pauseChance: 0.6,
    partyLine: '오예~ 퇴근!',
    restLine: 'Zz',
    skits: {
      eat: { ms: 3000, text: '쿠키 냠', sayAt: 200 },
      nap: { ms: 3600, text: '꾸벅…', sayAt: 300 },
    },
    art: `
      ${legs('#f3e3b8')}
      <g id="body">
        <path d="M22 17 C14 12 6 16 4 26 C2 36 4 46 8 47 C12 48 13 40 14 32 C15 26 18 22 24 21 Z" fill="#fbf0cf" stroke="#4a3520" stroke-width="2" stroke-linejoin="round"/>
        <path d="M16 19 C10 21 7.5 30 8 42" fill="none" stroke="#f4b9c4" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M42 17 C50 12 58 16 60 26 C62 36 60 46 56 47 C52 48 51 40 50 32 C49 26 46 22 40 21 Z" fill="#fbf0cf" stroke="#4a3520" stroke-width="2" stroke-linejoin="round"/>
        <path d="M48 19 C54 21 56.5 30 56 42" fill="none" stroke="#f4b9c4" stroke-width="2.6" stroke-linecap="round"/>
        <ellipse cx="32" cy="34" rx="22" ry="20" fill="#fdf3d6" stroke="#4a3520" stroke-width="2"/>
        <ellipse cx="24" cy="23" rx="5" ry="2.6" fill="#fff" opacity=".7"/>
        <ellipse cx="14" cy="45" rx="3" ry="4" fill="#fdf3d6" stroke="#4a3520" stroke-width="1.8"/>
        <ellipse cx="50" cy="45" rx="3" ry="4" fill="#fdf3d6" stroke="#4a3520" stroke-width="1.8"/>
        <g id="eyes-open">
          <circle cx="25" cy="33" r="3" fill="#3d2a17"/>
          <circle cx="39" cy="33" r="3" fill="#3d2a17"/>
          <circle cx="26" cy="32" r="1.1" fill="#fff"/>
          <circle cx="40" cy="32" r="1.1" fill="#fff"/>
        </g>
        <g id="eyes-closed" fill="none" stroke="#3d2a17" stroke-width="1.8" stroke-linecap="round">
          <path d="M22 33.5 Q25 31 28 33.5"/>
          <path d="M36 33.5 Q39 31 42 33.5"/>
        </g>
        <circle cx="19" cy="39" r="3.2" fill="#f7a8b4" opacity=".85"/>
        <circle cx="45" cy="39" r="3.2" fill="#f7a8b4" opacity=".85"/>
        <ellipse cx="32" cy="37" rx="1.8" ry="1.3" fill="#e9839a"/>
        <path d="M32 38.3 V40 M29.5 41 Q32 43 34.5 41" fill="none" stroke="#3d2a17" stroke-width="1.4" stroke-linecap="round"/>
      </g>
      <g id="food" class="prop">
        <circle cx="50" cy="45" r="6" fill="#d9a060" stroke="#6b4a2b" stroke-width="1.5"/>
        <circle cx="48" cy="43" r="1.1" fill="#5a3a1e"/>
        <circle cx="52" cy="46" r="1.1" fill="#5a3a1e"/>
        <circle cx="49" cy="48" r="1" fill="#5a3a1e"/>
      </g>`,
  };

  // 뿔 하나 달린 보라색 털뭉치 괴물. 가끔 친구들을 쫓아다니며 놀래킨다.
  const BORA = {
    id: 'bora',
    label: '보라괴물',
    speed: 34,
    pauseChance: 0.5,
    chaser: true,
    partyLine: '축하한다 크앙!',
    restLine: 'Zz',
    skits: {
      roar: { ms: 2000, text: '크아앙!', sayAt: 200 },
      nap: { ms: 3600, text: 'Zz', sayAt: 300 },
    },
    art: `
      ${legs('#7a5bb8')}
      <g id="body">
        <path d="M30 13 L33 2 L37 13 Z" fill="#f3e6c4" stroke="#3a2456" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M11 30 C10 18 20 12 32 12 C44 12 54 18 53 30 L56 34 L53 37 L55 42 L51 45 C48 52 40 54 32 54 C24 54 16 52 13 45 L9 42 L11 37 L8 34 Z" fill="#9b7fd4" stroke="#3a2456" stroke-width="2" stroke-linejoin="round"/>
        <path d="M22 14 L24 9 L27 13 M40 13 L43 9 L44 14" fill="#9b7fd4" stroke="#3a2456" stroke-width="1.6" stroke-linejoin="round"/>
        <ellipse cx="24" cy="21" rx="5" ry="2.5" fill="#fff" opacity=".35"/>
        <g id="eyes-open">
          <circle cx="25" cy="31" r="4.6" fill="#fff" stroke="#3a2456" stroke-width="1.4"/>
          <circle cx="41" cy="31" r="4.6" fill="#fff" stroke="#3a2456" stroke-width="1.4"/>
          <circle cx="26" cy="31.5" r="2.2" fill="#2a1a3d"/>
          <circle cx="42" cy="31.5" r="2.2" fill="#2a1a3d"/>
        </g>
        <g id="eyes-closed" fill="none" stroke="#2a1a3d" stroke-width="1.8" stroke-linecap="round">
          <path d="M21 32 Q25 35 29 32"/>
          <path d="M37 32 Q41 35 45 32"/>
        </g>
        <path d="M24 40 Q33 46 42 40" fill="#5a2d4f" stroke="#2a1a3d" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M27 41 L28.5 44 L30 42 M36 42 L37.5 44 L39 41" fill="#fff" stroke="#2a1a3d" stroke-width=".8" stroke-linejoin="round"/>
        <path d="M11 38 L4 32 M53 38 L60 32" stroke="#3a2456" stroke-width="5" stroke-linecap="round"/>
        <path d="M11 38 L4 32 M53 38 L60 32" stroke="#9b7fd4" stroke-width="2.6" stroke-linecap="round"/>
      </g>`,
  };

  // 왼쪽부터의 축하 자리 순서. 말풍선이 긴 콩떡이가 오른쪽을 쓴다.
  // 왼쪽부터의 축하 자리 순서. 말풍선이 긴 콩떡이가 오른쪽을 쓴다.
  const CHARACTERS = [BORA, PPYONG, HODU, MONG, KONG];

  // 둘이 마주쳤을 때 대사 (id 알파벳순 키)
  const MEET_LINES = {
    'kong+ppyong': { ppyong: '비켜비켜!', kong: '히익!' },
    'hodu+ppyong': { ppyong: '같이 놀자!', hodu: '바빠.' },
    'hodu+kong': { kong: '안녕…', hodu: '오냐.' },
    'kong+mong': { mong: '같이 간식 먹을래?', kong: '응!' },
    'hodu+mong': { mong: '선배 쿠키 드실래요?', hodu: '하나만.' },
    'mong+ppyong': { ppyong: '느림보다!', mong: '천천히 가도 돼~' },
  };

  const builtins = { characters: CHARACTERS, meetLines: MEET_LINES, artCss: ART_CSS, confetti: CONFETTI };
  if (typeof module !== 'undefined' && module.exports) module.exports = builtins;
  else root.HW40_BUILTINS = builtins;
})(typeof globalThis !== 'undefined' ? globalThis : this);
