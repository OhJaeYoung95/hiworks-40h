// 하이웍스 화면 글자를 읽어 우측 하단 패널에 퇴근 시각을 표시한다.
// 페이지를 읽기만 하며, 어떤 데이터도 외부로 보내지 않는다.
(function () {
  const { parsePage, evaluate, secToTime, formatDuration, RULES, setRules } = globalThis.HW40;
  const READ_EVERY_MS = 5000;

  // body 바깥에 붙여서 패널 글자가 body.innerText 파싱에 섞이지 않게 한다.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  host.dataset.hw40 = 'panel';
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
      input[type="text"] { width: 100%; box-sizing: border-box; font: 13px 'Malgun Gothic', sans-serif; padding: 3px 6px; border: 1px solid #ccd3df; border-radius: 4px; }
      .vpeople { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
      .vchip { padding: 0 7px; border-radius: 9px; background: #fff; border: 1px solid #d5dbe5; font: 600 12px 'Malgun Gothic', sans-serif; color: #3b5ba9; }
      button.vchip:hover { background: #eef2fa; }
      .vchip.cast { color: #4a3520; font-weight: 400; display: inline-flex; align-items: center; gap: 2px; }
      .vchip.cast button { font-size: 10px; padding: 0 0 0 2px; color: #99a; }
      .vchip.cast button:hover { color: #c0392b; }
      [hidden] { display: none !important; }
      .form { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 5px 8px; align-items: center; font-size: 12px; color: #556; margin-top: 4px; word-break: keep-all; line-height: 1.3; }
      .form input, .form select { font: 12px 'Malgun Gothic', sans-serif; min-width: 0; box-sizing: border-box; }
      .form select, .form input[type="time"], .form input[type="text"] { width: 100%; }
      .form .pair input[type="time"] { width: auto; flex: 1; }
      .form input[type="number"] { width: 70px; }
      .form .pair { display: flex; align-items: center; gap: 4px; }
      .readbox { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #d5dbe5; font-size: 12px; color: #556; }
      .vdeco { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #d5dbe5; }
      .vavatar { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #556; margin-top: 6px; }
      .vavatar select { flex: 1; font: 12px 'Malgun Gothic', sans-serif; }
      .vsend { display: flex; gap: 4px; margin-top: 4px; }
      .vsend button { font-size: 12px; color: #3b5ba9; white-space: nowrap; }
      .vstep { font-size: 12px; color: #334; margin-top: 6px; font-weight: 600; }
    </style>
    <div class="panel" id="panel">
      <div class="head"><span id="title"></span><span><button id="pet" title="캐릭터 켜기/끄기">🐾</button><button id="visit" title="모이기 (동료들과 캐릭터로 대화)">👋</button><button id="theme" title="캐릭터 테마">🎨</button><button id="settings" title="회사 설정 (근무 규칙·읽을 곳)">⚙️</button><button id="min" title="접기">–</button></span></div>
      <div class="menu" id="setMenu" hidden>
        <div class="menu-title">회사 설정 · <span id="setSite"></span></div>
        <div class="form">
          <span>이름</span><input type="text" id="sName" maxlength="30" placeholder="우리 회사" aria-label="회사 이름">
          <span>프리셋</span><select id="sPreset" aria-label="프리셋"></select>
          <span>근무 방식</span>
          <select id="sMode" aria-label="근무 방식">
            <option value="week">주 단위 선택근무 (금요일 조기 퇴근)</option>
            <option value="month">월 단위 선택근무</option>
            <option value="day">하루 단위 (시차출퇴근)</option>
          </select>
          <span id="sHoursLabel">주 목표 시간</span><span class="pair"><input type="number" id="sHours" min="1" step="0.5" aria-label="목표 시간">시간</span>
          <label id="sAutoRow" style="grid-column:1/-1"><input type="checkbox" id="sAuto"> 이번 달 평일 수 × 하루 시간으로 자동</label>
          <span>근무 인정 시작</span><input type="time" id="sStart" aria-label="근무 인정 시작">
          <label style="grid-column:1/-1"><input type="checkbox" id="sLunchOn"> 점심시간 빼기</label><span class="pair" style="grid-column:1/-1"><input type="time" id="sLunchA" aria-label="점심 시작">~<input type="time" id="sLunchB" aria-label="점심 끝"></span>
          <span id="sEarliestLabel">금요일 가장 빠른 퇴근</span><input type="time" id="sEarliest" aria-label="가장 빠른 퇴근">
          <span id="sDailyRow" style="display:contents"><span id="sDailyLabel">월~목 예상 하루</span><span class="pair"><input type="number" id="sDaily" min="1" max="16" step="0.5" aria-label="예상 하루 근무">시간</span></span>
        </div>
        <div class="menu-actions"><button id="sSave">저장</button><button id="sReset" hidden>기본 규칙으로</button></div>
        <div class="readbox" id="readBox" hidden>
          <div>읽을 곳: <span id="readState"></span></div>
          <div class="menu-actions"><button id="sTeach">읽을 곳 가르치기</button></div>
        </div>
        <div class="menu-actions"><button id="sCopy">설정 코드 복사</button><button id="sPasteBtn">설정 코드 넣기</button></div>
        <div id="sPaste" hidden>
          <textarea id="sCode" placeholder="받은 회사 설정 코드(HW40S1…)를 붙여 넣으세요" aria-label="회사 설정 코드"></textarea>
          <div class="menu-actions"><button id="sCodeOk">넣기</button></div>
        </div>
        <div class="msg" id="setMsg" hidden></div>
      </div>
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
      <div class="menu" id="visitMenu" hidden>
        <div class="menu-title">모이기 · 동료들과 캐릭터로 대화 <span id="vCount"></span></div>
        <div id="vStart">
          <input type="text" id="vNick" maxlength="12" placeholder="내 이름 (모두에게 보여요)" aria-label="내 이름">
          <div class="menu-actions"><button id="vOpen">방 만들기</button><button id="vJoin">초대 코드로 들어가기</button></div>
        </div>
        <div id="vRoom" hidden>
          <div class="vpeople" id="vPeople" aria-label="방에 있는 사람"></div>
          <div class="menu-actions"><button id="vInvite">＋ 초대 코드 만들기</button></div>
          <div class="vdeco" id="vDeco" hidden>
            <div class="vstep" id="vCastLabel"></div>
            <div class="vpeople" id="vCast" aria-label="방 캐릭터"></div>
            <label class="vavatar" id="vBringRow">내 캐릭터 데려오기 <select id="vBring" aria-label="데려올 내 캐릭터"></select><button id="vBringOk" style="color:#3b5ba9;font-size:12px">데려오기</button></label>
          </div>
        </div>
        <label class="vavatar">내 아바타 <select id="vAvatar" aria-label="내 아바타"></select></label>
        <div id="vOutBox" hidden>
          <div class="vstep" id="vOutLabel"></div>
          <textarea id="vOut" readonly aria-label="보낼 코드"></textarea>
          <div class="menu-actions"><button id="vCopy">코드 복사</button></div>
        </div>
        <div id="vInBox" hidden>
          <div class="vstep" id="vInLabel"></div>
          <textarea id="vIn" aria-label="받은 코드"></textarea>
          <div class="menu-actions"><button id="vInOk"></button></div>
        </div>
        <div id="vChat" hidden>
          <div class="vsend"><input type="text" id="vText" maxlength="100" placeholder="할 말을 적고 Enter" aria-label="할 말"><button id="vSend">보내기</button></div>
        </div>
        <div class="msg" id="vMsg" hidden></div>
        <div class="menu-actions"><button id="vEnd" hidden></button></div>
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
    $('visitMenu').hidden = true;
    $('setMenu').hidden = true;
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

  // ---------- 모이기 (방장의 방) ----------
  // 방장이 방을 열고, 한 사람씩 초대 코드 ↔ 답장 코드를 주고받아 들인다. 서버 없이 방장이 말을 전해 준다.
  // 방에 있는 동안 모두의 화면에는 방장의 테마 캐릭터들(방 캐릭터)이 돌아다니고, 그 위로 각자의 아바타가 이름표를 달고 나온다.
  // 방장이 꾸미기 권한을 준 사람은 자기 캐릭터를 방에 데려오거나 방 캐릭터를 뺄 수 있다.
  // 말은 아바타 말풍선 + 왼쪽 벽 채팅 목록에 뜬다.
  const VISIT = () => globalThis.HW40_VISIT;
  const ROOM = () => globalThis.HW40_ROOM;
  const guests = () => globalThis.HW40.guests;
  const engineRoom = () => globalThis.HW40.room;
  const NICK_KEY = 'hw40-visit-nick';
  const AVATAR_KEY = 'hw40-room-avatar';
  const FAIL_NOTE = '연결하지 못했어요. 회사 밖에 있거나 방화벽이 막고 있으면 안 될 수 있어요.';
  const CLOSED_NOTE = {
    'host-left': '방장이 방을 닫았어요.',
    full: '방이 꽉 찼어요.',
    kicked: '방장이 방에서 내보냈어요.',
    lost: '방과 연결이 끊겼어요.',
    left: '방에서 나왔어요.',
  };
  let room = null;
  let entered = false; // 방에 실제로 들어갔는지 (멤버: 방장과 연결된 뒤)
  let joinWait = 0;
  let selfHandle = null; // 내 화면에 나온 내 아바타
  const handles = new Map(); // pid → 내 화면에 나온 그 사람의 아바타
  const readKey = (key) => {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  };
  const writeKey = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 이번에만 쓴다.
    }
  };
  $('vNick').value = readKey(NICK_KEY);
  $('vNick').addEventListener('change', () => writeKey(NICK_KEY, $('vNick').value.trim()));
  const avatarId = () => $('vAvatar').value || null;
  const myNick = () => VISIT().cleanNick($('vNick').value);
  const me = () => ({ nick: $('vNick').value, avatar: guests() ? guests().me(avatarId()) : null });
  const vmsg = (text) => {
    $('vMsg').textContent = text || '';
    $('vMsg').hidden = !text;
  };
  const optionsOf = (select, items, saved) => {
    select.replaceChildren(...items.map((c) => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.mine ? `${c.name} (내 캐릭터)` : c.name;
      return o;
    }));
    if (items.some((c) => c.id === saved)) select.value = saved;
  };

  // 아바타로 고를 수 있는 캐릭터 = 내 테마의 캐릭터
  function renderAvatars() {
    if (!guests()) return;
    optionsOf($('vAvatar'), guests().cast(), $('vAvatar').value || readKey(AVATAR_KEY));
  }
  // 내 아바타를 (다시) 내 화면에 내보낸다.
  function showSelf(quiet) {
    if (selfHandle) selfHandle.leave(quiet ? '갈아입는 중~' : '안녕~');
    selfHandle = guests().arrive(me().avatar || {}, { nick: myNick(), self: true, quiet });
  }
  $('vAvatar').addEventListener('change', () => {
    writeKey(AVATAR_KEY, $('vAvatar').value);
    if (room && entered) {
      showSelf(true);
      room.avatarChanged();
    }
  });

  // ---------- 왼쪽 벽 채팅 목록 ----------
  // 캐릭터보다 낮은 층에 둔다: 가둔 캐릭터의 종이가 왼쪽 벽에 붙으면 채팅을 덮는다.
  const wallHost = document.createElement('div');
  wallHost.style.cssText = 'position:fixed;left:8px;top:80px;bottom:96px;width:240px;z-index:2147483630;pointer-events:none;';
  wallHost.dataset.hw40 = 'wall';
  wallHost.hidden = true;
  document.documentElement.appendChild(wallHost);
  const wallRoot = wallHost.attachShadow({ mode: 'open' });
  wallRoot.innerHTML = `
    <style>
      .wall { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 5px; overflow: hidden;
        -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 70px); mask-image: linear-gradient(to bottom, transparent 0, #000 70px); }
      .line { align-self: flex-start; max-width: 100%; box-sizing: border-box; padding: 3px 10px; border-radius: 10px;
        background: rgba(255,255,255,.94); border: 1.5px solid #6b4a2b; color: #4a3520; word-break: break-all;
        font: 12px/1.45 'Malgun Gothic', sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.12); animation: in .25s ease-out; }
      .line b { margin-right: 5px; }
      .line.mine { border-color: #3b5ba9; }
      .line.sys { background: rgba(240,243,248,.92); border-color: #c3ccdb; color: #667; font-size: 11px; }
      @keyframes in { from { opacity: 0; transform: translateX(-14px); } }
    </style>
    <div class="wall" id="wall" role="log" aria-label="채팅 목록"></div>`;
  const wallEl = wallRoot.getElementById('wall');
  const NICK_COLORS = ['#c0392b', '#2e7d32', '#6a3fb5', '#b8860b', '#00838f', '#ad1457', '#5d4037', '#3b5ba9'];
  const colorOf = (pid) => NICK_COLORS[[...String(pid)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % NICK_COLORS.length];
  let wallTimer = 0;
  function wallLine(who, text, { pid = null, mine = false } = {}) {
    clearTimeout(wallTimer);
    wallHost.hidden = false;
    const row = document.createElement('div');
    row.className = who ? (mine ? 'line mine' : 'line') : 'line sys';
    if (who) {
      const b = document.createElement('b');
      b.textContent = who;
      b.style.color = mine ? '#3b5ba9' : colorOf(pid);
      row.appendChild(b);
    }
    row.appendChild(document.createTextNode(text));
    wallEl.appendChild(row);
    while (wallEl.children.length > 40) wallEl.firstChild.remove();
  }
  const josa = (word, withBatchim, without) => {
    const code = String(word).charCodeAt(String(word).length - 1) - 0xac00;
    return code >= 0 && code <= 11171 && code % 28 ? withBatchim : without;
  };

  // ---------- 패널 화면 ----------
  const STEPS = {
    start: { start: true },
    host: { room: true, chat: true, end: '방 닫기', invite: true },
    hostInviting: { room: true, chat: true, end: '방 닫기', out: '① 이 초대 코드를 들어올 사람에게 보내 주세요 (한 사람에 하나)', in: '② 그 사람이 돌려준 답장 코드를 넣으세요', ok: '들여보내기' },
    joining: { in: '받은 초대 코드를 넣으세요', ok: '답장 코드 만들기', end: '취소' },
    replied: { out: '이 답장 코드를 방장에게 보내 주세요. 방장이 넣으면 들어가요.', end: '취소' },
    member: { room: true, chat: true, end: '방에서 나가기' },
  };
  let visitStep = 'start';
  function step(name) {
    visitStep = name;
    const s = STEPS[name];
    $('vStart').hidden = !s.start;
    $('vRoom').hidden = !s.room;
    $('vInvite').hidden = !s.invite;
    $('vOutBox').hidden = !s.out;
    $('vOutLabel').textContent = s.out || '';
    $('vInBox').hidden = !s.in;
    $('vInLabel').textContent = s.in || '';
    $('vInOk').textContent = s.ok || '';
    $('vChat').hidden = !s.chat;
    $('vEnd').hidden = !s.end;
    $('vEnd').textContent = s.end || '';
    if (s.in) $('vIn').value = '';
    renderDeco();
  }
  // 사람 목록. 방장은 다른 사람 이름을 눌러 꾸미기 권한(✏️)을 주거나 거둔다.
  function renderPeople(list) {
    const hosting = room && room.role === 'host';
    $('vPeople').replaceChildren(...list.map((p) => {
      const chip = document.createElement(hosting && !p.me ? 'button' : 'span');
      chip.className = 'vchip';
      const crown = p.pid === ROOM().HOST_ID ? ' 👑' : p.editor ? ' ✏️' : '';
      chip.textContent = `${p.me ? '나' : p.nick}${crown}`;
      chip.title = p.avatar ? `${p.nick} · ${p.avatar.name}` : p.nick;
      if (!p.me) chip.style.color = colorOf(p.pid);
      if (hosting && !p.me) {
        chip.title += p.editor ? ' · 눌러서 꾸미기 권한 거두기' : ' · 눌러서 방 꾸미기 권한 주기';
        chip.onclick = () => {
          room.grant(p.pid, !p.editor);
          wallLine('', p.editor ? `${p.nick}님의 꾸미기 권한을 거뒀어요` : `${p.nick}님에게 방 꾸미기 권한을 줬어요`);
        };
      }
      return chip;
    }));
    $('vCount').textContent = `${list.length}명`;
  }
  // 방 꾸미기: 방 캐릭터 목록(✕로 빼기)과 내 캐릭터 데려오기
  function renderDeco() {
    const show = Boolean(room && entered && !room.closed && $('vRoom').hidden === false);
    $('vDeco').hidden = !show;
    if (!show) return;
    const canEdit = room.canEdit;
    const cast = room.cast();
    $('vCastLabel').textContent = `방 캐릭터 ${cast.length}/${ROOM().MAX_CAST}${canEdit ? '' : ' · 꾸미려면 방장에게 권한을 받아요'}`;
    $('vCast').replaceChildren(...cast.map((c) => {
      const chip = document.createElement('span');
      chip.className = 'vchip cast';
      chip.textContent = c.name || (engineRoom().entryFor(c.id) || {}).name || c.id;
      if (canEdit) {
        const del = document.createElement('button');
        del.textContent = '✕';
        del.title = '방에서 빼기';
        del.onclick = () => room.removeCast(c.key);
        chip.appendChild(del);
      }
      return chip;
    }));
    $('vBringRow').hidden = !canEdit;
    if (canEdit && !$('vBring').options.length) optionsOf($('vBring'), engineRoom().bringable(), '');
  }
  $('vBringOk').onclick = () => {
    if (!room || !room.canEdit) return;
    const item = engineRoom().entryFor($('vBring').value);
    if (!item) return;
    if (!room.addCast(item)) vmsg(`방 캐릭터는 ${ROOM().MAX_CAST}명까지예요. 하나를 빼고 데려와 주세요.`);
  };

  function showAvatar(p, had) {
    const old = handles.get(p.pid);
    if (old) old.leave('갈아입는 중~');
    handles.set(p.pid, guests().arrive(p.avatar || {}, {
      nick: p.nick,
      quiet: had,
      pet: () => room && room.pet(p.pid),
      leave: room && room.role === 'host' ? () => room.kick(p.pid) : null,
    }));
  }
  // 방에 들어간 순간: 화면을 방으로 바꾸고 내 아바타를 내보낸다.
  function enterRoom(note) {
    entered = true;
    showSelf(false);
    wallLine('', note);
    renderDeco();
  }
  function newRoom() {
    const r = ROOM().createRoom({
      makeLink: (hooks) => VISIT().createLink(hooks),
      me,
      on: {
        people(list) {
          if (r === room) renderPeople(list);
        },
        join(p, had) {
          if (r !== room) return;
          if (!entered && r.role === 'member') {
            step('member');
            vmsg('');
            enterRoom('방에 들어왔어요. 여기는 방장의 방이에요!');
            $('vText').focus();
          }
          if (r.role === 'host' && !had) {
            clearTimeout(joinWait);
            if (visitStep === 'hostInviting') step('host');
            vmsg('');
          }
          showAvatar(p, had);
          if (!had) wallLine('', `${p.nick}님이 들어왔어요`);
        },
        leave(p) {
          const h = handles.get(p.pid);
          if (h) h.leave('안녕~');
          handles.delete(p.pid);
          if (!r.closed) wallLine('', `${p.nick}님이 나갔어요`);
        },
        say(p, text) {
          const h = handles.get(p.pid);
          if (h) h.say(text);
          wallLine(p.nick, text, { pid: p.pid });
        },
        petted(p) {
          if (selfHandle) selfHandle.react(p.nick);
        },
        cast(list, change) {
          if (r !== room) return;
          engineRoom().setCast(list);
          if (change && change.added) {
            const name = change.added.name || (engineRoom().entryFor(change.added.id) || {}).name || '캐릭터';
            wallLine('', `${change.nick}님이 ${name}${josa(name, '을', '를')} 방에 데려왔어요`);
          } else if (change && change.removed) {
            const name = change.removed.name || (engineRoom().entryFor(change.removed.id) || {}).name || '캐릭터';
            wallLine('', `${change.nick}님이 ${name}${josa(name, '을', '를')} 방에서 뺐어요`);
          }
          renderDeco();
        },
        perm(canEdit) {
          if (r !== room) return;
          if (r.role === 'member' && entered) wallLine('', canEdit ? '방장이 방 꾸미기 권한을 줬어요 ✏️' : '방 꾸미기 권한이 없어졌어요');
          renderDeco();
        },
        closed(reason) {
          if (r !== room) return;
          const note = !entered && reason === 'lost' ? FAIL_NOTE
            : r.role === 'host' && reason === 'left' ? '방을 닫았어요.'
              : CLOSED_NOTE[reason] || '방이 닫혔어요.';
          // 다른 사람 아바타는 벽에 붙었다가 사라지고, 화면은 내 테마로 돌아온다.
          for (const h of handles.values()) h.leave('안녕~');
          handles.clear();
          if (selfHandle) selfHandle.leave('안녕~');
          selfHandle = null;
          engineRoom().exit();
          if (entered) wallLine('', note);
          room = null;
          entered = false;
          step('start');
          vmsg(note);
          // 채팅 목록은 잠깐 더 보여주고 치운다.
          wallTimer = setTimeout(() => {
            wallHost.hidden = true;
            wallEl.replaceChildren();
          }, 15000);
        },
      },
    });
    room = r;
    return r;
  }
  const canConnect = () => {
    if (!VISIT() || !ROOM() || !engineRoom() || typeof RTCPeerConnection === 'undefined') {
      vmsg('이 브라우저에서는 직접 연결을 쓸 수 없어요.');
      return false;
    }
    writeKey(NICK_KEY, $('vNick').value.trim());
    hookCast();
    if (!$('vAvatar').options.length) renderAvatars();
    $('vBring').replaceChildren();
    return true;
  };

  $('visit').onclick = () => {
    $('visitMenu').hidden = !$('visitMenu').hidden;
    $('themeMenu').hidden = true;
    $('setMenu').hidden = true;
    hookCast();
    renderAvatars();
  };
  $('vOpen').onclick = () => {
    if (!canConnect()) return;
    const r = newRoom();
    step('host');
    r.open(engineRoom().themeCast());
    enterRoom('방을 열었어요. ＋ 초대 코드 만들기로 동료를 불러 주세요. 이름을 누르면 꾸미기 권한을 줄 수 있어요.');
    vmsg('');
  };
  $('vInvite').onclick = async () => {
    const r = room;
    if (!r) return;
    vmsg('초대 코드를 만드는 중…');
    try {
      const code = await r.invite();
      if (r !== room) return;
      step('hostInviting');
      $('vOut').value = code;
      vmsg('');
    } catch (e) {
      vmsg(e.message);
    }
  };
  $('vJoin').onclick = () => {
    if (!canConnect()) return;
    newRoom();
    entered = false;
    step('joining');
    vmsg('');
    $('vIn').focus();
  };
  $('vInOk').onclick = async () => {
    const r = room;
    if (!r) return;
    try {
      if (visitStep === 'hostInviting') {
        const nick = await r.accept($('vIn').value);
        if (r !== room) return;
        $('vInBox').hidden = true;
        vmsg(`${nick}님이 들어오는 중…`);
        clearTimeout(joinWait);
        joinWait = setTimeout(() => {
          if (r === room && visitStep === 'hostInviting') {
            step('host');
            vmsg(FAIL_NOTE);
          }
        }, 20000);
      } else if (visitStep === 'joining') {
        vmsg('답장 코드를 만드는 중…');
        const { reply, hostNick } = await r.join($('vIn').value);
        if (r !== room) return;
        $('vOut').value = reply;
        step('replied');
        vmsg(`${hostNick}님의 방이에요.`);
      }
    } catch (e) {
      vmsg(e.message);
    }
  };
  $('vCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('vOut').value);
      vmsg('복사했어요. 하이웍스 메신저 등으로 보내 주세요.');
    } catch {
      $('vOut').select();
      vmsg('코드를 선택해 두었어요. Ctrl+C로 복사해 주세요.');
    }
  };
  function sendChat() {
    if (!room || !entered) return;
    const text = room.say($('vText').value);
    if (!text) return;
    if (selfHandle) selfHandle.say(text);
    wallLine(myNick(), text, { mine: true });
    $('vText').value = '';
  }
  $('vSend').onclick = sendChat;
  $('vText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) sendChat();
  });
  $('vEnd').onclick = () => {
    if (!room) return step('start');
    if (room.role === 'host' && room.people().length > 1 && !window.confirm('방을 닫으면 모두 나가게 돼요. 닫을까요?')) return;
    room.leave();
  };
  // 내 테마를 바꾸면 아바타 목록을 다시 만든다 (방 화면은 그대로).
  function hookCast() {
    if (!guests()) return;
    guests().onCast = () => {
      const before = avatarId();
      renderAvatars();
      if (room && entered && avatarId() !== before) {
        showSelf(true);
        room.avatarChanged();
      }
    };
  }
  hookCast();
  setTimeout(hookCast, 0); // 캐릭터 엔진이 패널보다 늦게 읽히는 경우
  // 페이지를 떠나면 방에서 나간다 (방장이면 방이 닫힌다).
  window.addEventListener('pagehide', () => {
    if (room) room.leave();
  });

  // ---------- 회사 설정 ----------
  // 근무 규칙(주·월·하루 단위)과, 하이웍스가 아닌 근무 페이지에서 읽을 곳. "회사 설정 코드"로 동료와 나눈다.
  const COMPANY = globalThis.HW40_COMPANY;
  const READER = globalThis.HW40_READER;
  const SITE = globalThis.HW40_SITE || { builtin: true, builtinName: '하이웍스', company: () => null, saveCompany: () => false, clearCompany() {} };
  let company = null;
  function loadCompany() {
    try {
      company = SITE.company() ? COMPANY.normalizeCompany(SITE.company()) : null;
    } catch {
      company = null;
    }
    setRules(company ? company.rules : null);
  }
  loadCompany();
  // 하이웍스가 아닌 사이트는 읽을 곳을 가르쳐야 계산할 수 있다.
  const needsTeach = () => !SITE.builtin && !(company && company.fields);
  const smsg = (text, err) => {
    $('setMsg').textContent = text || '';
    $('setMsg').hidden = !text;
    $('setMsg').style.color = err ? '#c0392b' : '';
  };
  const MODE_TEXT = {
    week: { hours: '주 목표 시간', earliest: '금요일 가장 빠른 퇴근' },
    month: { hours: '월 목표 시간', earliest: '가장 빠른 퇴근 (없으면 비움)' },
    day: { hours: '하루 근무 시간', earliest: '코어타임 끝 (없으면 비움)' },
  };
  $('sPreset').replaceChildren(
    ...COMPANY.PRESET_LIST.map((p) => new Option(p.label, p.id)),
    new Option('직접 고친 규칙', ''),
  );
  function fillForm(rules) {
    $('sMode').value = rules.mode;
    $('sAuto').checked = rules.hours === 'auto';
    $('sHours').value = rules.hours === 'auto' ? '' : rules.hours;
    $('sStart').value = rules.workStart;
    $('sLunchOn').checked = Boolean(rules.lunch);
    $('sLunchA').value = rules.lunch ? rules.lunch[0] : '12:00';
    $('sLunchB').value = rules.lunch ? rules.lunch[1] : '13:00';
    $('sEarliest').value = rules.earliest || '';
    $('sDaily').value = rules.daily;
    syncForm();
  }
  function syncForm() {
    const mode = $('sMode').value;
    const t = MODE_TEXT[mode];
    $('sHoursLabel').textContent = t.hours;
    $('sEarliestLabel').textContent = t.earliest;
    $('sAutoRow').hidden = mode !== 'month';
    const auto = mode === 'month' && $('sAuto').checked;
    $('sHours').disabled = auto;
    $('sHours').placeholder = auto ? '자동' : '';
    $('sDailyRow').hidden = mode === 'day';
    $('sDailyLabel').textContent = mode === 'month' ? '하루 기준 시간' : '월~목 예상 하루';
    // 지금 값과 같은 프리셋을 보여 준다 (고치면 "직접 고친 규칙")
    const preset = COMPANY.presetOf(formRules());
    $('sPreset').value = preset ? preset.id : '';
    $('sLunchA').disabled = !$('sLunchOn').checked;
    $('sLunchB').disabled = !$('sLunchOn').checked;
  }
  const formRules = () => COMPANY.normalizeRules({
    mode: $('sMode').value,
    hours: $('sMode').value === 'month' && $('sAuto').checked ? 'auto' : $('sHours').value,
    workStart: $('sStart').value,
    lunch: $('sLunchOn').checked ? [$('sLunchA').value, $('sLunchB').value] : null,
    earliest: $('sEarliest').value || null,
    daily: $('sDaily').value,
  });
  function renderSettings() {
    $('setSite').textContent = SITE.builtin ? `${SITE.builtinName} (기본 지원)` : SITE.host;
    $('sName').value = company ? company.name : '';
    fillForm(company ? company.rules : COMPANY.DEFAULT_PRESET.rules);
    $('sReset').hidden = !(SITE.builtin && company);
    $('readBox').hidden = SITE.builtin;
    const f = (company && company.fields) || {};
    $('readState').textContent = READER.STEPS.map((s) => `${s.title.split(' (')[0].replace('이번 주(또는 이번 달) ', '')} ${f[s.key] ? '✓' : '–'}`).join(' · ');
  }
  // 프리셋을 고르면 그 값으로 채운다. 방식을 바꾸면 그 방식의 첫 프리셋으로.
  $('sPreset').onchange = () => {
    const p = COMPANY.PRESET_LIST.find((x) => x.id === $('sPreset').value);
    if (p) fillForm(p.rules);
  };
  $('sMode').onchange = () => fillForm((COMPANY.PRESET_LIST.find((x) => x.rules.mode === $('sMode').value) || COMPANY.PRESETS[$('sMode').value]).rules);
  for (const id of ['sLunchOn', 'sAuto', 'sHours', 'sStart', 'sLunchA', 'sLunchB', 'sEarliest', 'sDaily']) $(id).addEventListener('input', syncForm);
  function store(next, note) {
    if (!SITE.saveCompany(next)) return smsg('설정을 저장하지 못했어요.', true);
    loadCompany();
    page = null; // 바로 다시 읽는다
    renderSettings();
    smsg(note);
  }
  $('sSave').onclick = () => {
    try {
      const next = COMPANY.normalizeCompany({ ...(company || {}), name: $('sName').value, rules: formRules(), host: SITE.host });
      store(next, '저장했어요. 바로 계산에 반영돼요.');
    } catch (e) {
      // 아직 읽을 곳을 안 가르친 사이트: 규칙만 먼저 저장해 둔다.
      if (needsTeach()) {
        SITE.saveCompany({ name: $('sName').value || '우리 회사', rules: formRules(), host: SITE.host, pendingTeach: true });
        loadCompany();
        smsg('규칙을 저장했어요. 이제 "읽을 곳 가르치기"를 해 주세요.');
      } else smsg(e.message, true);
    }
  };
  $('sReset').onclick = () => {
    SITE.clearCompany();
    loadCompany();
    page = null;
    renderSettings();
    smsg('하이웍스 기본 규칙으로 되돌렸어요.');
  };
  $('sTeach').onclick = () => {
    $('setMenu').hidden = true;
    const rules = formRules();
    READER.teach({
      mode: rules.mode,
      done: ({ fields, includesToday }) => {
        $('setMenu').hidden = false;
        try {
          const next = COMPANY.normalizeCompany({ name: $('sName').value || (company && company.name) || '우리 회사', rules, fields, includesToday, host: SITE.host });
          store(next, '읽을 곳을 기억했어요. 패널에 계산이 나오는지 확인해 주세요.');
        } catch (e) {
          smsg(e.message, true);
        }
      },
      cancel: () => {
        $('setMenu').hidden = false;
      },
    });
  };
  $('sCopy').onclick = async () => {
    try {
      const code = await COMPANY.encodeCompany({ ...(company || {}), name: $('sName').value || '우리 회사', rules: formRules(), host: SITE.host });
      try {
        await navigator.clipboard.writeText(code);
        smsg('회사 설정 코드를 복사했어요. 같은 근무 페이지를 쓰는 동료에게 보내 주세요.');
      } catch {
        window.prompt('이 코드를 복사해 동료에게 보내 주세요.', code);
      }
    } catch (e) {
      smsg(e.message, true);
    }
  };
  $('sPasteBtn').onclick = () => {
    $('sPaste').hidden = !$('sPaste').hidden;
    if (!$('sPaste').hidden) $('sCode').focus();
  };
  $('sCodeOk').onclick = async () => {
    try {
      const next = await COMPANY.decodeCompany($('sCode').value);
      // 하이웍스는 화면을 이미 알아서 규칙만 쓴다.
      if (SITE.builtin) delete next.fields;
      const other = next.host && next.host !== SITE.host ? ` (코드는 ${next.host}용이에요. 화면이 다르면 읽을 곳을 다시 가르쳐 주세요.)` : '';
      store({ ...next, host: SITE.host }, `"${next.name}" 설정을 넣었어요.${other}`);
      $('sCode').value = '';
      $('sPaste').hidden = true;
    } catch (e) {
      smsg(e.message, true);
    }
  };
  $('settings').onclick = () => {
    $('setMenu').hidden = !$('setMenu').hidden;
    $('themeMenu').hidden = true;
    $('visitMenu').hidden = true;
    smsg('');
    renderSettings();
  };
  // 이 사이트의 화면을 읽는다: 하이웍스는 정해진 규칙으로, 다른 사이트는 가르친 자리에서.
  const readNow = () => (company && company.fields ? READER.readPage(company) : parsePage(document.body ? document.body.innerText : ''));

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
        : `목요일까지 하루 ${Math.round(f.daily / 3600)}시간이면 ${RULES.hours}시간을 다 채워요`,
    };
  }

  // 월 단위: 남은 시간을 남은 평일에 나눠 오늘 권장 퇴근 시각
  function renderMonth(r) {
    const m = r.month;
    const rows = [
      ['이번 달 누적', formatDuration(r.total)],
      ['남은 시간', formatDuration(Math.max(0, r.remaining))],
      ['남은 평일', `${m.daysLeft}일`],
      ['하루 평균 필요', formatDuration(m.share)],
    ];
    const hint = `월 목표 ${Math.round(r.target / 360) / 10}시간 · 공휴일은 빼지 않고 평일로 셉니다`;
    const goal = Math.round(r.target / 360) / 10;
    if (r.remaining <= 0) return view({ title: '이번 달 근무', note: `월 ${goal}시간 달성`, rows, accent: COLOR.done, pill: '이번 달 달성' });
    if (r.state === 'clocked-out') return view({ title: '오늘 퇴근 완료', note: `월 ${goal}시간까지 ${formatDuration(r.remaining)}`, rows, hint });
    if (r.state === 'not-started') return view({ title: '아직 출근 전', note: `오늘 ${formatDuration(m.share)} 일하면 돼요`, rows, hint });
    const canLeave = r.nowSec >= r.leaveAt;
    view({
      title: '오늘 권장 퇴근 시각',
      main: secToTime(r.leaveAt),
      note: canLeave ? '오늘 몫을 채웠어요' : `${formatDuration(r.leaveAt - r.nowSec)} 후`,
      rows,
      hint,
      accent: canLeave ? COLOR.done : COLOR.wait,
      pill: canLeave ? '오늘 몫 달성' : `퇴근 ${secToTime(r.leaveAt)}`,
    });
  }
  // 하루 단위: 출근 + 하루 시간
  function renderDay(r) {
    const rows = [
      ['오늘 근무', formatDuration(r.total)],
      ['남은 시간', formatDuration(Math.max(0, r.remaining))],
    ];
    if (r.state === 'clocked-out') return view({ title: '오늘 퇴근 완료', note: r.remaining <= 0 ? `하루 ${RULES.hours}시간 채움` : `${formatDuration(r.remaining)} 덜 채움`, rows, accent: r.remaining <= 0 ? COLOR.done : COLOR.warn });
    if (r.state === 'not-started') return view({ title: '지금 출근하면 퇴근', main: secToTime(r.leaveAt), note: `하루 ${RULES.hours}시간 기준`, rows });
    const canLeave = r.nowSec >= r.leaveAt;
    view({
      title: '오늘 퇴근 가능 시각',
      main: secToTime(r.leaveAt),
      note: canLeave ? '지금 퇴근 가능' : `${formatDuration(r.leaveAt - r.nowSec)} 후`,
      rows,
      accent: canLeave ? COLOR.done : COLOR.wait,
      pill: canLeave ? '지금 퇴근 가능' : `퇴근 ${secToTime(r.leaveAt)}`,
    });
  }

  function render(r) {
    if (r.state === 'unreadable') {
      host.hidden = SITE.builtin && location.pathname.indexOf('/personal') === -1;
      view({
        title: '40시간 계산기',
        note: '화면에서 읽지 못함',
        rows: [['누락', r.missing.join(', ')]],
        accent: COLOR.warn,
        hint: SITE.builtin ? '' : '화면이 바뀌었으면 ⚙️ → 읽을 곳 가르치기를 다시 해 주세요',
      });
      return;
    }
    host.hidden = false;
    if (r.mode === 'month') return renderMonth(r);
    if (r.mode === 'day') return renderDay(r);
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
        note: ok ? `이번 주 ${RULES.hours}시간 달성` : `${RULES.hours}시간까지 ${formatDuration(r.remaining)} 부족`,
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
      view({ title: '이번 주 근무 현황', main: formatDuration(r.remaining), note: `${RULES.hours}시간까지 남음`, ...withFriday(r, rows), pill: `${formatDuration(r.remaining)} 남음` });
      return;
    }

    const canLeave = r.nowSec >= r.leaveAt;
    const left = r.leaveAt - r.nowSec;
    const note = canLeave
      ? '지금 퇴근 가능'
      : `${formatDuration(left)} 후 · ${r.earlyLeave ? `${secToTime(RULES.fridayEarliestLeave).slice(0, 5)} 조기 퇴근` : `${RULES.hours}시간 채운 뒤 퇴근`}`;
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
    if (needsTeach()) {
      // 처음 켠 사이트: 읽을 곳을 먼저 가르쳐야 한다.
      host.hidden = false;
      globalThis.HW40.latest = null;
      view({ title: '40시간 계산기', note: '이 사이트에서 읽을 곳을 알려 주세요', hint: '⚙️ 회사 설정 → 근무 방식을 고르고 "읽을 곳 가르치기"', accent: COLOR.warn });
      return;
    }
    if (!page || nowMs - lastRead >= READ_EVERY_MS) {
      page = readNow();
      lastRead = nowMs;
    }
    const result = evaluate(page, new Date(nowMs));
    globalThis.HW40.latest = result; // mascot.js가 읽는다
    render(result);
  }
  tick();
  setInterval(tick, 1000);
})();
