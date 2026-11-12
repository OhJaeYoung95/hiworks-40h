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
      .row { display: flex; justify-content: space-between; color: #556; font-variant-numeric: tabular-nums; }
      .pill { padding: 6px 12px; background: #fff; border: 1px solid #d5dbe5; border-radius: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,.15); color: #222; font: 600 13px 'Malgun Gothic', sans-serif; }
    </style>
    <div class="panel" id="panel">
      <div class="head"><span id="title"></span><span><button id="pet" title="캐릭터 켜기/끄기">🐾</button><button id="pic" title="몽실이를 내 그림으로 바꾸기 (이 브라우저에만 저장)">🖼</button><button id="min" title="접기">–</button></span></div>
      <div class="main" id="main"></div>
      <div class="note" id="note"></div>
      <div id="rows"></div>
    </div>
    <button class="pill" id="pill" hidden></button>`;

  const $ = (id) => shadow.getElementById(id);
  const setCollapsed = (collapsed) => {
    $('panel').hidden = collapsed;
    $('pill').hidden = !collapsed;
  };
  $('min').onclick = () => setCollapsed(true);
  $('pill').onclick = () => setCollapsed(false);
  $('pet').onclick = () => globalThis.HW40.toggleMascot();
  $('pic').onclick = () => globalThis.HW40.pickCustomImage();

  const COLOR = { wait: '#8fa3c9', done: '#7fa650', warn: '#d9822b' };

  function view({ title, main, note, rows = [], accent = COLOR.wait, pill }) {
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
        rows,
        accent: ok ? COLOR.done : COLOR.warn,
      });
      return;
    }

    if (r.state === 'not-started') {
      view({
        title: r.isFriday ? '지금 출근하면 퇴근 가능' : '아직 출근 전',
        main: r.isFriday ? secToTime(r.leaveAt) : '',
        rows,
      });
      return;
    }

    if (!r.isFriday) {
      view({ title: '이번 주 근무 현황', main: formatDuration(r.remaining), note: '40시간까지 남음', rows, pill: `${formatDuration(r.remaining)} 남음` });
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
