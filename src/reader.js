// 처음 보는 근무 페이지: 사용자가 화면에서 "여기가 누적 근무시간" 하고 찍어 주면 그 자리를 기억했다가 5초마다 다시 읽는다.
// 브라우저 기본 기능(DOM)만 쓴다: 글자 찾기(TreeWalker) · 위치(getBoundingClientRect) · 찍은 곳의 길(CSS 선택자) · 다시 찾기(querySelector).
// 근무 시스템에 따로 요청하지 않고, 사용자가 보고 있는 화면만 읽는다.
(function (root) {
  const C = root.HW40_COMPANY;
  const { parseDurationText, parseClockText, TIME_LIKE } = C;

  // 읽을 곳 종류
  const STEPS = [
    { key: 'worked', kind: 'duration', title: '이번 주(또는 이번 달) 누적 근무시간', need: 'week' },
    { key: 'clockIn', kind: 'clock', title: '오늘 출근 시각', need: 'day' },
    { key: 'clockOut', kind: 'clock', title: '오늘 퇴근 시각 (퇴근 전이라 비어 있으면 그 빈칸)' },
    { key: 'leave', kind: 'duration', title: '휴가로 인정된 시간' },
  ];
  const isOurs = (el) => el && el.closest && el.closest('[data-hw40]');

  // ---------- 찍은 곳 기억하기 ----------
  const SAFE_ID = /^[A-Za-z][\w-]{1,40}$/;
  // 숫자가 잔뜩 섞인 id는 새로고침마다 바뀌는 경우가 많아 쓰지 않는다.
  const stableId = (id) => SAFE_ID.test(id) && (id.match(/\d/g) || []).length <= 3;
  const nth = (node) => {
    let n = 1;
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.tagName === node.tagName) n += 1;
    return `${node.tagName.toLowerCase()}:nth-of-type(${n})`;
  };
  // stop 바로 아래부터 el까지의 상대 경로 (stop이 없으면 body부터)
  function pathBetween(stop, el) {
    const parts = [];
    for (let node = el; node && node !== stop; node = node.parentElement) parts.unshift(nth(node));
    return parts.join(' > ');
  }
  function selectorOf(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      if (node.id && stableId(node.id) && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        return parts.join(' > ');
      }
      const tag = node.tagName.toLowerCase();
      let n = 1;
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.tagName === node.tagName) n += 1;
      parts.unshift(`${tag}:nth-of-type(${n})`);
      node = node.parentElement;
    }
    parts.unshift('body');
    return parts.join(' > ');
  }
  const textOf = (el) => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  // 찍은 칸 옆의 이름표 글자 (예: "누적 근무", "출근")와, 이름표에서 그 칸까지 가는 길.
  // 화면 구조가 바뀌어 원래 길로 못 찾으면, 이름표를 찾아 같은 모양의 길로 그 칸을 찾는다.
  //   up: 이름표 글자에서 몇 단계 올라가면 둘을 함께 감싼 상자인지, rel: 그 상자에서 칸까지의 길
  const isLabel = (text) => text && text.length <= 20 && /[가-힣A-Za-z]/.test(text) && !TIME_LIKE.test(text);
  function anchorOf(el) {
    let box = el;
    for (let depth = 0; depth < 4 && box.parentElement && box.parentElement !== document.documentElement; depth += 1) {
      box = box.parentElement;
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (el.contains(t) || isOurs(t.parentElement)) continue;
        const text = t.nodeValue.trim();
        if (!isLabel(text)) continue;
        let up = 0;
        for (let a = t.parentElement; a && a !== box; a = a.parentElement) up += 1;
        return { label: text, up, rel: pathBetween(box, el) };
      }
    }
    return {};
  }
  const labelOf = (el) => anchorOf(el).label || '';

  // ---------- 다시 찾기 ----------
  const parse = (kind, text) => (kind === 'clock' ? parseClockText(text) : parseDurationText(text));
  // 이름표 글자를 찾아, 가르칠 때와 같은 모양의 길로 칸을 찾는다. 모양이 다르면 찾지 않는다 (엉뚱한 칸을 읽지 않게).
  function findByAnchor(field) {
    if (!field.label || !field.rel || typeof field.up !== 'number') return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (t.nodeValue.trim() !== field.label || isOurs(t.parentElement)) continue;
      let box = t.parentElement;
      for (let i = 0; i < field.up && box; i += 1) box = box.parentElement;
      if (!box) continue;
      let el = null;
      try {
        el = box.querySelector(`:scope > ${field.rel}`);
      } catch {
        el = null;
      }
      if (el) return el;
    }
    return null;
  }
  // 읽을 곳 하나를 읽는다. found: 그 자리를 찾았는지, value: 읽은 값 (초, 비어 있으면 null)
  function readField(field, kind) {
    if (!field) return { found: false, value: null };
    let el = null;
    try {
      el = document.querySelector(field.sel);
    } catch {
      el = null;
    }
    let value = el ? parse(kind, textOf(el)) : null;
    // 그 자리가 없어졌거나, 누적 시간인데 숫자가 없으면 이름표로 다시 찾아본다.
    if (!el || (value === null && kind === 'duration')) {
      const again = findByAnchor(field);
      if (again) {
        el = again;
        value = parse(kind, textOf(el));
      }
    }
    return { found: Boolean(el), value };
  }
  // 가르친 회사 설정으로 화면을 읽어 calc.js가 쓰는 모양으로 만든다.
  function readPage(company) {
    const f = company.fields || {};
    const worked = readField(f.worked, 'duration');
    const clockIn = readField(f.clockIn, 'clock');
    const clockOut = readField(f.clockOut, 'clock');
    const leave = readField(f.leave, 'duration');
    const missing = [];
    const dayMode = company.rules && company.rules.mode === 'day';
    if (!dayMode && (!worked.found || worked.value === null)) missing.push('누적 근무시간');
    if (f.clockIn && !clockIn.found) missing.push('출근 시각');
    return {
      week: null,
      worked: dayMode ? 0 : worked.value,
      early: 0,
      leave: leave.value || 0,
      clockIn: clockIn.value,
      clockOut: clockOut.value,
      includesToday: Boolean(company.includesToday),
      missing,
    };
  }

  // ---------- 가르치기 화면 ----------
  // 화면 위에 투명한 막을 씌우고, 시간처럼 생긴 글자에 점선 테두리를 친다. 막 아래 요소를 눌러 고른다.
  // mode: 규칙 방식 (day면 출근 시각이 필수). done({ fields, includesToday }) / cancel()
  function teach({ mode, done, cancel }) {
    const host = document.createElement('div');
    host.dataset.hw40 = 'teach';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        #veil { position: fixed; inset: 0; cursor: crosshair; background: rgba(20,30,60,.08); }
        .cand { position: fixed; border: 1.5px dashed #3b5ba9; border-radius: 4px; background: rgba(59,91,169,.06); pointer-events: none; }
        .picked { position: fixed; border: 2px solid #2e7d32; border-radius: 4px; background: rgba(46,125,50,.12); pointer-events: none; }
        .picked span { position: absolute; left: 0; top: -18px; padding: 0 5px; border-radius: 6px; background: #2e7d32; color: #fff; font: 600 11px/16px 'Malgun Gothic', sans-serif; white-space: nowrap; }
        #hover { position: fixed; border: 2px solid #d9822b; border-radius: 4px; background: rgba(217,130,43,.12); pointer-events: none; display: none; }
        #bar { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); max-width: calc(100vw - 32px); box-sizing: border-box;
          padding: 10px 14px; background: #fff; color: #222; border: 1px solid #d5dbe5; border-left: 4px solid #3b5ba9; border-radius: 8px;
          box-shadow: 0 6px 20px rgba(0,0,0,.2); font: 13px/1.5 'Malgun Gothic', sans-serif; cursor: default; }
        #bar b { color: #3b5ba9; }
        #bar .sub { color: #667; font-size: 12px; }
        #bar .acts { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 6px; align-items: center; }
        #bar button { border: 0; background: none; color: #3b5ba9; cursor: pointer; font: 600 12px 'Malgun Gothic', sans-serif; padding: 0; }
        #bar label { font-size: 12px; color: #334; }
        #seen { color: #2e7d32; font-weight: 600; }
      </style>
      <div id="veil"></div>
      <div id="marks"></div>
      <div id="hover"></div>
      <div id="bar" role="dialog" aria-label="읽을 곳 가르치기">
        <div id="ask"></div>
        <div class="sub" id="seen"></div>
        <div class="acts" id="acts"></div>
      </div>`;
    const $ = (id) => shadow.getElementById(id);
    const fields = {};
    const values = {};
    let at = 0;
    let hoverEl = null;

    const under = (x, y) => {
      host.style.pointerEvents = 'none';
      const el = document.elementFromPoint(x, y);
      host.style.pointerEvents = '';
      return el && !isOurs(el) ? el : null;
    };
    function box(el, cls, label) {
      const r = el.getBoundingClientRect();
      const d = document.createElement('div');
      d.className = cls;
      Object.assign(d.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      if (label) {
        const s = document.createElement('span');
        s.textContent = label;
        d.appendChild(s);
      }
      return d;
    }
    // 시간처럼 생긴 글자 후보들
    function candidates() {
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t && out.length < 300; t = walker.nextNode()) {
        const el = t.parentElement;
        if (!el || isOurs(el) || !TIME_LIKE.test(t.nodeValue)) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.bottom > 0 && r.top < window.innerHeight) out.push(el);
      }
      return out;
    }
    function drawMarks() {
      const picked = Object.entries(fields).map(([key, f]) => {
        let el = null;
        try {
          el = document.querySelector(f.sel);
        } catch {
          el = null;
        }
        return el && box(el, 'picked', STEPS.find((s) => s.key === key).title.split(' (')[0]);
      }).filter(Boolean);
      $('marks').replaceChildren(...candidates().map((el) => box(el, 'cand')), ...picked);
    }
    function button(text, fn) {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = fn;
      return b;
    }
    function render() {
      const s = STEPS[at];
      if (!s) {
        // 마지막: 누적 시간에 오늘 진행분이 들어 있는지 묻는다.
        $('ask').innerHTML = '<b>거의 다 됐어요!</b> 한 가지만 알려 주세요.';
        $('seen').textContent = '';
        const check = document.createElement('label');
        check.innerHTML = '<input type="checkbox" id="today"> 출근해서 일하는 동안 누적 근무시간이 실시간으로 늘어나요';
        $('acts').replaceChildren(check, button('저장', finish), button('처음부터', restart), button('그만두기', stop));
        if (!fields.worked) check.hidden = true;
        return;
      }
      const required = (s.need === 'week' && mode !== 'day') || (s.need === 'day' && mode === 'day');
      $('ask').innerHTML = `<b>${at + 1}/${STEPS.length}</b> 화면에서 <b>${s.title}</b>을(를) 눌러 주세요.${required ? '' : ' <span class="sub">(없으면 건너뛰기)</span>'}`;
      $('seen').textContent = '';
      $('acts').replaceChildren(
        ...(required ? [] : [button('건너뛰기', () => next())]),
        ...(at ? [button('← 이전', () => { at -= 1; render(); })] : []),
        button('그만두기', stop),
      );
      drawMarks();
    }
    function next() {
      at += 1;
      render();
    }
    function pick(el) {
      const s = STEPS[at];
      if (!s) return;
      const text = textOf(el);
      const value = parse(s.kind, text);
      // 누적 시간인데 숫자가 없는 칸을 누르면 다시 고르게 한다. 시각은 빈칸(아직 기록 없음)도 받는다.
      if (s.kind === 'duration' && value === null) {
        $('seen').textContent = `"${text.slice(0, 30)}"에서 시간을 못 찾았어요. 시간이 적힌 칸을 눌러 주세요.`;
        return;
      }
      fields[s.key] = { sel: selectorOf(el), ...anchorOf(el) };
      values[s.key] = value;
      next();
    }
    function finish() {
      const today = shadow.getElementById('today');
      cleanup();
      done({ fields, includesToday: Boolean(today && today.checked), values });
    }
    function restart() {
      for (const k of Object.keys(fields)) delete fields[k];
      at = 0;
      render();
    }
    function stop() {
      cleanup();
      if (cancel) cancel();
    }
    const veil = $('veil');
    veil.addEventListener('mousemove', (e) => {
      hoverEl = under(e.clientX, e.clientY);
      const h = $('hover');
      if (!hoverEl) {
        h.style.display = 'none';
        return;
      }
      const r = hoverEl.getBoundingClientRect();
      Object.assign(h.style, { display: 'block', left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
    });
    veil.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = under(e.clientX, e.clientY);
      if (el) pick(el);
    });
    // 막 위에서 굴리면 페이지가 스크롤되고, 테두리를 다시 그린다.
    const redraw = () => drawMarks();
    window.addEventListener('scroll', redraw, true);
    window.addEventListener('resize', redraw);
    const onKey = (e) => {
      if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey, true);
    function cleanup() {
      window.removeEventListener('scroll', redraw, true);
      window.removeEventListener('resize', redraw);
      window.removeEventListener('keydown', onKey, true);
      host.remove();
    }
    render();
    return { stop };
  }

  root.HW40_READER = { STEPS, readPage, teach, selectorOf, labelOf, anchorOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
