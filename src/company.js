// 회사 설정: 근무 규칙(유연근무 방식) + 근무 페이지에서 읽을 곳 + 주고받는 "회사 설정 코드".
// DOM 없이 돌아가서 node로 테스트한다. 화면에서 읽을 곳을 가르치는 부분은 reader.js가 맡는다.
//
// 근무 규칙 (rules)
//   mode      week: 주 단위 정산 (주 목표를 채우면 금요일 조기 퇴근)
//             month: 월 단위 정산 (남은 시간을 남은 평일에 나눠 오늘 권장 퇴근 시각)
//             day: 하루 단위 (시차출퇴근: 출근 + 하루 시간 = 퇴근)
//   hours     목표 시간 (week: 주, month: 월, day: 하루)
//   workStart 근무 인정 시작. 이보다 일찍 와도 이 시각부터 센다
//   lunch     [시작, 끝] 근무에서 빼는 점심시간. 없으면 null
//   earliest  가장 빠른 퇴근 시각 (금요일 조기 퇴근 하한, 하루 모드에서는 코어타임 끝). 없으면 null
//   daily     예상 계산에 쓰는 하루 근무시간 (주 모드: 월~목 예상)
(function (root) {
  const CODE_PREFIX = 'HW40S1.';
  const NAME_MAX = 30;
  const FIELDS = ['worked', 'clockIn', 'clockOut', 'leave'];

  class CompanyError extends Error {}

  // 근무 방식마다 모르는 값을 채울 기본값
  const PRESETS = {
    week: { label: '주 단위 선택근무 (금요일 조기 퇴근)', rules: { mode: 'week', hours: 40, workStart: '09:00', lunch: ['13:00', '14:00'], earliest: '17:00', daily: 8 } },
    // hours 'auto': 이번 달 평일 수 × 하루 시간
    month: { label: '월 단위 선택근무', rules: { mode: 'month', hours: 'auto', workStart: '09:00', lunch: ['12:00', '13:00'], earliest: null, daily: 8 } },
    day: { label: '하루 단위 (시차출퇴근)', rules: { mode: 'day', hours: 8, workStart: '07:00', lunch: ['12:00', '13:00'], earliest: null, daily: 8 } },
  };
  // 패널에서 고르는 프리셋. 첫 번째(우리 회사)가 기본이다.
  const PRESET_LIST = [
    { id: 'ours', label: '우리 회사 기본 (주 40시간 · 9시부터 · 점심 13~14시 · 금 17시)', rules: PRESETS.week.rules },
    { id: 'week40', label: '주 40시간 · 점심 12~13시 · 금 16시', rules: { mode: 'week', hours: 40, workStart: '08:00', lunch: ['12:00', '13:00'], earliest: '16:00', daily: 8 } },
    { id: 'week35', label: '주 35시간 단축근무', rules: { mode: 'week', hours: 35, workStart: '09:00', lunch: ['12:00', '13:00'], earliest: '15:00', daily: 7 } },
    { id: 'month', label: '월 단위 선택근무 (평일 × 8시간 자동)', rules: PRESETS.month.rules },
    { id: 'day8', label: '시차출퇴근 하루 8시간 (7시부터)', rules: PRESETS.day.rules },
    { id: 'core', label: '시차출퇴근 + 코어타임 10~16시', rules: { mode: 'day', hours: 8, workStart: '07:00', lunch: ['12:00', '13:00'], earliest: '16:00', daily: 8 } },
  ];
  const DEFAULT_PRESET = PRESET_LIST[0];
  // 이 규칙과 똑같은 프리셋 (없으면 null: 직접 고친 규칙)
  const presetOf = (rules) => PRESET_LIST.find((p) => JSON.stringify(normalizeRules(p.rules)) === JSON.stringify(normalizeRules(rules))) || null;

  const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  const cleanClock = (v, fallback) => {
    const m = String(v || '').trim().match(HHMM);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : fallback;
  };
  const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

  // 규칙을 검사해 고친다. 모르는 값은 그 방식의 기본값으로.
  function normalizeRules(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const mode = PRESETS[r.mode] ? r.mode : 'week';
    const base = PRESETS[mode].rules;
    const limit = { week: [1, 80], month: [1, 400], day: [1, 16] }[mode];
    const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Number(v))) : d);
    let lunch = null;
    if (Array.isArray(r.lunch) && r.lunch.length === 2) {
      const a = cleanClock(r.lunch[0], null);
      const b = cleanClock(r.lunch[1], null);
      if (a && b && minutes(b) > minutes(a)) lunch = [a, b];
    } else if (r.lunch === undefined) lunch = base.lunch;
    const auto = mode === 'month' && (r.hours === 'auto' || (r.hours === undefined && base.hours === 'auto'));
    return {
      mode,
      hours: auto ? 'auto' : Math.round(num(r.hours, limit[0], limit[1], base.hours === 'auto' ? 160 : base.hours) * 100) / 100,
      workStart: cleanClock(r.workStart, base.workStart),
      lunch,
      earliest: r.earliest === null ? null : cleanClock(r.earliest, r.earliest === undefined ? base.earliest : null),
      daily: Math.round(num(r.daily, 1, 16, base.daily) * 100) / 100,
    };
  }

  // 읽을 곳 하나: { sel: CSS 선택자, label: 옆에 있던 이름표 글자 }
  function normalizeField(f) {
    if (!f || typeof f !== 'object' || typeof f.sel !== 'string' || !f.sel.trim()) return null;
    const out = { sel: f.sel.trim().slice(0, 600) };
    if (typeof f.label === 'string' && f.label.trim()) out.label = f.label.trim().slice(0, 40);
    // 이름표에서 칸까지의 길 (화면 구조가 바뀌었을 때 다시 찾는 데 쓴다)
    if (out.label && typeof f.rel === 'string' && f.rel.trim() && Number.isInteger(f.up) && f.up >= 0 && f.up <= 6) {
      out.rel = f.rel.trim().slice(0, 300);
      out.up = f.up;
    }
    return out;
  }

  // 회사 설정 전체. fields가 없으면 하이웍스처럼 이미 아는 화면(규칙만 바꿈)이다.
  function normalizeCompany(raw) {
    if (!raw || typeof raw !== 'object') throw new CompanyError('회사 설정이 비어 있어요.');
    const out = {
      name: String(raw.name || '우리 회사').replace(/[<>&"]/g, '').trim().slice(0, NAME_MAX) || '우리 회사',
      rules: normalizeRules(raw.rules),
    };
    if (raw.host) out.host = String(raw.host).slice(0, 200);
    if (raw.fields && typeof raw.fields === 'object') {
      const fields = {};
      for (const key of FIELDS) {
        const f = normalizeField(raw.fields[key]);
        if (f) fields[key] = f;
      }
      // 하루 단위는 출근 시각만 있으면 되고, 주·월 단위는 누적 근무시간이 꼭 있어야 한다.
      if (out.rules.mode === 'day' ? !fields.clockIn : !fields.worked) {
        throw new CompanyError(out.rules.mode === 'day'
          ? '출근 시각을 읽을 곳이 없어요. 읽을 곳을 다시 가르쳐 주세요.'
          : '누적 근무시간을 읽을 곳이 없어요. 읽을 곳을 다시 가르쳐 주세요.');
      }
      out.fields = fields;
      out.includesToday = Boolean(raw.includesToday);
    }
    return out;
  }

  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }
  const bytesToB64 = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64ToBytes = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  async function encodeCompany(company) {
    const json = new TextEncoder().encode(JSON.stringify(normalizeCompany(company)));
    return CODE_PREFIX + bytesToB64(await pipe(json, new CompressionStream('deflate')));
  }
  async function decodeCompany(code) {
    const text = String(code || '').replace(/\s+/g, '');
    if (!text.startsWith(CODE_PREFIX)) {
      if (/^HW40(T|C|V)/.test(text)) throw new CompanyError('회사 설정 코드가 아니에요. 테마·캐릭터·초대 코드는 다른 곳에 넣어 주세요.');
      throw new CompanyError(`회사 설정 코드가 아니에요. "${CODE_PREFIX}"로 시작하는 코드를 붙여 넣어 주세요.`);
    }
    let raw;
    try {
      raw = JSON.parse(new TextDecoder().decode(await pipe(b64ToBytes(text.slice(CODE_PREFIX.length)), new DecompressionStream('deflate'))));
    } catch {
      throw new CompanyError('회사 설정 코드가 깨졌어요. 처음부터 끝까지 다 복사했는지 확인해 주세요.');
    }
    return normalizeCompany(raw);
  }

  // ---------- 화면 글자 → 시간 ----------
  // 걸린 시간: "31:45:57", "31:45", "31시간 45분 57초", "8시간", "31h 45m", "7.5시간", "7.5h"
  function parseDurationText(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    let m = t.match(/(\d{1,3}):([0-5]\d)(?::([0-5]\d))?/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
    m = t.match(/(\d+(?:\.\d+)?)\s*(?:시간|h(?:ours?|rs?)?\b)/i);
    const mm = t.match(/(\d+)\s*(?:분|m(?:in(?:utes?)?)?\b)/i);
    const ss = t.match(/(\d+)\s*(?:초|s(?:ec(?:onds?)?)?\b)/i);
    if (!m && !mm && !ss) return null;
    return Math.round((m ? Number(m[1]) : 0) * 3600) + (mm ? Number(mm[1]) : 0) * 60 + (ss ? Number(ss[1]) : 0);
  }
  // 하루 중 시각: "09:12", "09:12:30", "오후 6:03", "PM 6:03", "18시 3분". 빈 칸·"--:--"·"00:00:00"은 기록 없음(null).
  function parseClockText(text) {
    const t = String(text || '');
    let h;
    let mi;
    let s = 0;
    let m = t.match(/(\d{1,2}):([0-5]\d)(?::([0-5]\d))?/);
    if (m) [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
    else {
      m = t.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
      if (!m) return null;
      [h, mi] = [Number(m[1]), Number(m[2] || 0)];
    }
    if (/오후|PM/i.test(t) && h < 12) h += 12;
    if (/오전|AM/i.test(t) && h === 12) h = 0;
    if (h > 23) return null;
    const sec = h * 3600 + mi * 60 + s;
    return sec === 0 ? null : sec;
  }
  // 시간처럼 생긴 글자인가 (가르칠 때 후보로 표시)
  const TIME_LIKE = /(\d{1,3}:[0-5]\d)|(\d+(?:\.\d+)?\s*시간)|(\d+\s*분)|(\d+(?:\.\d+)?\s*h\b)/i;

  const company = {
    CODE_PREFIX, FIELDS, PRESETS, PRESET_LIST, DEFAULT_PRESET, presetOf, CompanyError, TIME_LIKE,
    normalizeRules, normalizeCompany, encodeCompany, decodeCompany, parseDurationText, parseClockText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = company;
  else root.HW40_COMPANY = company;
})(typeof globalThis !== 'undefined' ? globalThis : this);
