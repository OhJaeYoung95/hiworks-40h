// 하이웍스 화면 글자를 읽어 우측 하단 패널에 퇴근 시각을 표시한다.
// 페이지를 읽기만 하며, 어떤 데이터도 외부로 보내지 않는다.
(function () {
  const { parsePage, evaluate, secToTime, formatDuration, RULES } = globalThis.HW40;
  const READ_EVERY_MS = 5000;

  // body 바깥에 붙여서 패널 글자가 body.innerText 파싱에 섞이지 않게 한다.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .panel { width: 260px; padding: 14px 16px; background: #fff; color: #222;
        border: 1px solid #d5dbe5; border-left: 4px solid var(--accent, #8fa3c9); border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,.15); font: 13px/1.5 'Malgun Gothic', sans-serif; }
      .head { display: flex; justify-content: space-between; align-items: center; color: #667; font-size: 12px; }
      button { border: 0; background: none; cursor: pointer; color: #667; font-size: 14px; padding: 0 2px; }
      .main { font-size: 26px; font-weight: 700; margin: 2px 0; font-variant-numeric: tabular-nums; }
      .note { font-weight: 600; margin-bottom: 8px; }
      .hint { color: #889; font-size: 11px; margin-top: 4px; }
      .foot { display: flex; justify-content: flex-end; margin-top: 6px; color: #aab; font-size: 10px; }
      .updated { margin: 6px 0 0; padding: 5px 8px; border-radius: 6px; background: #eef6e6; color: #3d6b1f; font-size: 12px; font-weight: 600; }
      .row { display: flex; justify-content: space-between; color: #556; font-variant-numeric: tabular-nums; }
      .pill { padding: 6px 12px; background: #fff; border: 1px solid #d5dbe5; border-radius: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,.15); color: #222; font: 600 13px 'Malgun Gothic', sans-serif; }
      .menu { max-height: 60vh; overflow-y: auto; margin: 8px 0 10px; padding: 8px; background: #f5f7fa; border-radius: 6px; }
      .menu-title { font-size: 12px; color: #667; margin-bottom: 4px; }
      .theme { display: flex; align-items: center; gap: 4px; }
      .theme .pick { flex: 1; text-align: left; font-size: 13px; color: #222; padding: 3px 4px; border-radius: 4px; }
      .theme .pick:hover { background: #e8ecf3; }
      .theme .pick[aria-checked="true"] { font-weight: 700; color: #3b5ba9; }
      .theme .pick[aria-checked="true"]::before { content: '● '; }
      .theme .pick[aria-checked="false"]::before { content: '○ '; color: #99a; }
      .tag { font-size: 10px; color: #778; border: 1px solid #ccd3df; border-radius: 8px; padding: 0 5px; margin-left: 4px; }
      .menu-actions { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 6px; font-size: 12px; }
      .menu-actions button, .menu-actions a { font-size: 12px; color: #3b5ba9; text-decoration: none; padding: 0; }
      .msg { font-size: 12px; color: #556; margin-top: 4px; }
      textarea { width: 100%; box-sizing: border-box; height: 56px; font: 11px Consolas, monospace; margin-top: 4px; }
    </style>
    <div class="panel" id="panel">
      <div class="head"><span id="title"></span><span><button id="pet" title="캐릭터 켜기/끄기">🐾</button><button id="theme" title="캐릭터 테마">🎨</button><button id="min" title="접기">–</button></span></div>
      <div class="menu" id="themeMenu" hidden>
        <div class="menu-title">캐릭터 테마</div>
        <div id="themeList" role="radiogroup" aria-label="캐릭터 테마"></div>
        <div class="menu-actions">
          <button id="themeAdd">＋ 테마 코드 넣기</button><button id="themeFile">파일에서 넣기</button><button id="themeCopy">코드 복사</button><a id="themeMake" target="_blank" rel="noopener" hidden>테마 만들기 ↗</a>
        </div>
        <div id="themePaste" hidden>
          <textarea id="themeCode" placeholder="받은 테마 코드(HW40T…)를 붙여 넣으세요"></textarea>
          <div class="menu-actions"><button id="themeOk">넣기</button><button id="themeCancel">취소</button></div>
        </div>
        <div class="msg" id="themeMsg" hidden></div>
      </div>
      <div class="main" id="main"></div>
      <div class="note" id="note"></div>
      <div id="rows"></div>
      <div class="hint" id="hint" hidden></div>
      <div class="updated" id="updated" hidden></div>
      <div class="foot"><span id="version"></span></div>
    </div>
    <button class="pill" id="pill" hidden></button>`;

  const $ = (id) => shadow.getElementById(id);

  // 지금 쓰는 버전. 새 버전을 받은 뒤 처음 열면 잠깐 알려준다.
  const VERSION = globalThis.HW40_VERSION || '';
  const SEEN_KEY = 'hw40-seen-version';
  if (VERSION) {
    $('version').textContent = `v${VERSION}`;
    $('version').title = '40시간 퇴근 계산기 버전';
    let seen = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
      localStorage.setItem(SEEN_KEY, VERSION);
    } catch {
      // 저장소를 못 쓰면 알림 없이 버전만 보여준다.
    }
    if (seen && seen !== VERSION) {
      $('updated').textContent = `새 버전 v${VERSION}로 업데이트됐어요`;
      $('updated').hidden = false;
      setTimeout(() => {
        $('updated').hidden = true;
      }, 15000);
    }
  }
  const setCollapsed = (collapsed) => {
    $('panel').hidden = collapsed;
    $('pill').hidden = !collapsed;
  };
  $('min').onclick = () => setCollapsed(true);
  $('pill').onclick = () => setCollapsed(false);
  $('pet').onclick = () => globalThis.HW40.toggleMascot();

  // ---------- 테마 목록 ----------
  // 기본 · 공용(저장소 themes/) · 내 테마(공유 코드로 추가). 고른 테마는 이 브라우저에만 저장된다.
  const themes = () => globalThis.HW40.themes;
  const message = (text) => {
    $('themeMsg').textContent = text || '';
    $('themeMsg').hidden = !text;
  };
  function renderThemes() {
    const t = themes();
    if (!t) return;
    const active = t.active();
    $('themeList').replaceChildren(
      ...t.list().map((theme) => {
        const row = document.createElement('div');
        row.className = 'theme';
        const pick = document.createElement('button');
        pick.className = 'pick';
        pick.setAttribute('role', 'radio');
        pick.setAttribute('aria-checked', String(theme.key === active));
        pick.textContent = theme.name;
        pick.title = `${theme.cast.length}명`;
        if (theme.source !== 'default') {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = theme.source === 'shared' ? '공용' : '내 테마';
          pick.appendChild(tag);
        }
        pick.onclick = () => {
          t.apply(theme.key);
          message('');
          renderThemes();
        };
        row.appendChild(pick);
        if (theme.source === 'mine') {
          const del = document.createElement('button');
          del.textContent = '✕';
          del.title = '이 테마 지우기';
          del.onclick = () => {
            if (!window.confirm(`"${theme.name}" 테마를 지울까요?`)) return;
            t.remove(theme.key);
            renderThemes();
          };
          row.appendChild(del);
        }
        return row;
      })
    );
    if (t.site) {
      $('themeMake').href = `${t.site}themes.html`;
      $('themeMake').hidden = false;
    }
  }
  $('theme').onclick = () => {
    $('themeMenu').hidden = !$('themeMenu').hidden;
    message('');
    renderThemes();
  };
  // 테마 코드(캐릭터가 담긴 코드 포함)를 내 테마로 넣는다. 만들기·고치기는 테마 만들기 화면에서 한다.
  async function addThemeCode(code) {
    message('읽는 중…');
    try {
      const r = await themes().addCode(code);
      const extra = r.characters ? ` 캐릭터 ${r.characters}명도 함께 들어왔어요.` : '';
      message(`"${r.name}" 테마를 넣었어요.${extra}${r.warnings.length ? ` ${r.warnings.join(' ')}` : ''}`);
      $('themePaste').hidden = true;
      $('themeCode').value = '';
    } catch (e) {
      message(e.message);
    }
    renderThemes();
  }
  $('themeAdd').onclick = () => {
    $('themePaste').hidden = !$('themePaste').hidden;
    message('');
    if (!$('themePaste').hidden) $('themeCode').focus();
  };
  $('themeCancel').onclick = () => {
    $('themePaste').hidden = true;
  };
  $('themeOk').onclick = () => addThemeCode($('themeCode').value);
  $('themeFile').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (file) addThemeCode(await file.text());
    };
    input.click();
  };
  $('themeCopy').onclick = async () => {
    const code = await themes().code(themes().active());
    try {
      await navigator.clipboard.writeText(code);
      message('지금 테마 코드를 복사했어요. 동료에게 보내 주세요.');
    } catch {
      window.prompt('이 코드를 복사해 동료에게 보내 주세요.', code);
    }
  };

  const COLOR = { wait: '#8fa3c9', done: '#7fa650', warn: '#d9822b' };

  function view({ title, main, note, rows = [], accent = COLOR.wait, pill, hint }) {
    $('hint').textContent = hint || '';
    $('hint').hidden = !hint;
    $('title').textContent = title;
    $('main').textContent = main || '';
    $('main').hidden = !main;
    $('note').textContent = note || '';
    $('panel').style.setProperty('--accent', accent);
    $('rows').replaceChildren(
      ...rows.map(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'row';
        const l = document.createElement('span');
        l.textContent = label;
        const v = document.createElement('span');
        v.textContent = value;
        row.append(l, v);
        return row;
      })
    );
    $('pill').textContent = pill || title;
  }

  // 월~목: 금요일 예상 퇴근 줄과 그 가정
  const hhmm = (sec) => secToTime(sec).slice(0, 5);
  function withFriday(r, rows) {
    if (!r.friday) return { rows };
    const f = r.friday;
    return {
      rows: [...rows, ['금요일 예상 퇴근', hhmm(f.leaveAt)]],
      hint: f.need
        ? `목요일까지 하루 ${Math.round(f.daily / 3600)}시간 · 금요일 ${hhmm(f.start)} 출근 기준 (금요일 ${formatDuration(f.need)} 근무)`
        : `목요일까지 하루 ${Math.round(f.daily / 3600)}시간이면 40시간을 다 채워요`,
    };
  }

  function render(r) {
    if (r.state === 'unreadable') {
      host.hidden = location.pathname.indexOf('/personal') === -1;
      view({ title: '40시간 계산기', note: '화면에서 읽지 못함', rows: [['누락', r.missing.join(', ')]], accent: COLOR.warn });
      return;
    }
    host.hidden = false;
    if (r.state === 'other-week') {
      view({ title: '40시간 계산기', note: '이번 주 화면에서만 계산해요' });
      return;
    }

    const rows = [
      ['누적', formatDuration(r.total)],
      ['남은 시간', formatDuration(Math.max(0, r.remaining))],
    ];

    if (r.state === 'clocked-out') {
      const ok = r.remaining <= 0;
      view({
        title: '오늘 퇴근 완료',
        note: ok ? '이번 주 40시간 달성' : `40시간까지 ${formatDuration(r.remaining)} 부족`,
        ...(ok ? { rows } : withFriday(r, rows)),
        accent: ok ? COLOR.done : COLOR.warn,
      });
      return;
    }

    if (r.state === 'not-started') {
      view({
        title: r.isFriday ? '지금 출근하면 퇴근 가능' : '아직 출근 전',
        main: r.isFriday ? secToTime(r.leaveAt) : '',
        ...withFriday(r, rows),
      });
      return;
    }

    if (!r.isFriday) {
      view({ title: '이번 주 근무 현황', main: formatDuration(r.remaining), note: '40시간까지 남음', ...withFriday(r, rows), pill: `${formatDuration(r.remaining)} 남음` });
      return;
    }

    const canLeave = r.nowSec >= r.leaveAt;
    const left = r.leaveAt - r.nowSec;
    const note = canLeave
      ? '지금 퇴근 가능'
      : `${formatDuration(left)} 후 · ${r.earlyLeave ? `${secToTime(RULES.fridayEarliestLeave).slice(0, 5)} 조기 퇴근` : '40시간 채운 뒤 퇴근'}`;
    view({
      title: '금요일 퇴근 가능 시각',
      main: secToTime(r.leaveAt),
      note,
      rows,
      accent: canLeave ? COLOR.done : COLOR.wait,
      pill: canLeave ? '지금 퇴근 가능' : `퇴근 ${secToTime(r.leaveAt)}`,
    });
  }

  let page = null;
  let lastRead = 0;
  function tick() {
    const nowMs = Date.now();
    if (!page || nowMs - lastRead >= READ_EVERY_MS) {
      page = parsePage(document.body ? document.body.innerText : '');
      lastRead = nowMs;
    }
    const result = evaluate(page, new Date(nowMs));
    globalThis.HW40.latest = result; // mascot.js가 읽는다
    render(result);
  }
  tick();
  setInterval(tick, 1000);
})();
