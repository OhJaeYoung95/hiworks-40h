// 근무 규칙과 계산. DOM에 의존하지 않아 node로 바로 테스트할 수 있다.
(function (root) {
  const H = 3600;
  const CONFIG = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.HW40_CONFIG;
  const clock = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * H + m * 60;
  };
  // 지금 쓰는 근무 규칙. 회사 설정을 넣으면 setRules가 이 객체를 그대로 고쳐 쓴다 (다른 파일도 같은 객체를 본다).
  const RULES = {};
  // rules: company.js의 규칙 모양 { mode, hours, workStart, lunch, earliest, daily }. 없으면 config.js 기본값.
  function setRules(rules) {
    const r = rules || {
      mode: 'week',
      hours: CONFIG.weeklyHours,
      workStart: CONFIG.workStart,
      lunch: [CONFIG.lunchStart, CONFIG.lunchEnd],
      earliest: CONFIG.fridayEarliestLeave,
      daily: CONFIG.plannedDailyHours,
    };
    Object.assign(RULES, {
      mode: r.mode || 'week',
      hours: r.hours, // 'auto'면 월 단위에서 그달 평일 × 하루 시간
      autoHours: r.hours === 'auto',
      target: r.hours === 'auto' ? 0 : r.hours * H,
      weeklyTarget: r.hours === 'auto' ? 0 : r.hours * H,
      workStart: clock(r.workStart),
      lunchStart: r.lunch ? clock(r.lunch[0]) : 0,
      lunchEnd: r.lunch ? clock(r.lunch[1]) : 0,
      fridayEarliestLeave: r.earliest ? clock(r.earliest) : 0,
      plannedDaily: r.daily * H,
    });
    return RULES;
  }
  setRules(null);

  const TIME = '(\\d{1,2}:\\d{2}:\\d{2})';
  const DURATION = '((?:\\d+\\s*시간\\s*)?(?:\\d+\\s*분\\s*)?(?:\\d+\\s*초)?)';

  function timeToSec(s) {
    const [h, m, sec] = s.split(':').map(Number);
    return h * H + m * 60 + sec;
  }

  function secToTime(sec) {
    const s = Math.floor(sec);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(s / H))}:${pad(Math.floor((s % H) / 60))}:${pad(s % 60)}`;
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / H)}시간 ${Math.floor((s % H) / 60)}분 ${s % 60}초`;
  }

  // "31시간 45분 57초" -> 초. 숫자가 없으면 null.
  function durationToSec(text) {
    if (!text || !/\d/.test(text)) return null;
    const part = (unit) => {
      const m = text.match(new RegExp(`(\\d+)\\s*${unit}`));
      return m ? Number(m[1]) : 0;
    };
    return part('시간') * H + part('분') * 60 + part('초');
  }

  function parseWeek(text) {
    const m = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*~\s*(?:(\d{1,2})월\s*)?(\d{1,2})일/);
    if (!m) return null;
    const year = Number(m[1]);
    const startMonth = Number(m[2]);
    const endMonth = m[4] ? Number(m[4]) : startMonth;
    return {
      start: new Date(year, startMonth - 1, Number(m[3])),
      end: new Date(endMonth < startMonth ? year + 1 : year, endMonth - 1, Number(m[5])),
    };
  }

  // 00:00:00 은 "아직 기록 없음"으로 표시되는 자리표시자다.
  function parseClock(text, label) {
    const nearButton = text.match(new RegExp(`${label}하기\\s*${TIME}`));
    const m = nearButton || text.match(new RegExp(`${TIME}\\s*${label}`));
    if (!m) return { found: false, sec: null };
    const sec = timeToSec(m[1]);
    return { found: true, sec: sec === 0 ? null : sec };
  }

  // 주간 근무현황의 요일 칸("출근 08:55 퇴근 18:00 총 8시간 4분 33초")에서 근무 인정 시작(9시) 전에
  // 출근해 사이트 합계에 더해진 시간을 모은다. 요일 이름과 칸이 떨어져 읽혀도 되도록 칸 내용만 찾는다.
  // 그날 합계에서 9시~퇴근 근무시간을 뺀 만큼이 9시 전 시간이다 (퇴근 전인 오늘 칸은 "총"이 없어 건너뛴다).
  function earlyArrival(text) {
    const cell = new RegExp(`출근\\s*(\\d{1,2}:\\d{2})(?::\\d{2})?\\s*퇴근\\s*(\\d{1,2}:\\d{2})(?::\\d{2})?\\s*총\\s*:?\\s*${DURATION}`, 'g');
    let extra = 0;
    for (const m of text.matchAll(cell)) {
      const inSec = timeToSec(`${m[1]}:00`);
      const outSec = timeToSec(`${m[2]}:00`);
      const total = durationToSec(m[3]);
      if (inSec >= RULES.workStart || total === null) continue;
      // 화면의 출근 시각은 분까지라 1분 안쪽 여유를 둔다.
      const cap = RULES.workStart - inSec + 59;
      extra += Math.max(0, Math.min(total - workedBetween(RULES.workStart, outSec), cap));
    }
    return extra;
  }

  function parsePage(text) {
    const summaryAt = text.lastIndexOf('주간 합계');
    const summary = summaryAt >= 0 ? text.slice(summaryAt) : '';

    const weeklyMatch = summary.match(new RegExp(`실근무[\\s\\S]*?총\\s*:\\s*${DURATION}`));
    let worked = weeklyMatch ? durationToSec(weeklyMatch[1]) : null;
    if (worked === null) {
      // 합계 영역을 못 읽으면 요일별 "총 7시간 48분 39초"를 더한다.
      const days = [...text.matchAll(new RegExp(`총\\s+${DURATION}`, 'g'))]
        .map((m) => durationToSec(m[1]))
        .filter((v) => v !== null);
      if (days.length) worked = days.reduce((a, b) => a + b, 0);
    }

    // 사이트 합계는 실제 출근 시각부터 센 값이라 9시 전 시간을 뺀다.
    const early = earlyArrival(text);
    if (worked !== null) worked = Math.max(0, worked - early);

    const leaveMatch = summary.match(new RegExp(`휴가\\s*${DURATION}`));
    const leave = (leaveMatch && durationToSec(leaveMatch[1])) || 0;

    const clockIn = parseClock(text, '출근');
    const clockOut = parseClock(text, '퇴근');

    const missing = [];
    const week = parseWeek(text);
    if (!week) missing.push('주간 날짜');
    if (worked === null) missing.push('주간 근무시간');
    if (!clockIn.found) missing.push('출근 시각');

    return { week, worked, early, leave, clockIn: clockIn.sec, clockOut: clockOut.sec, missing };
  }

  // 점심시간을 제외한 실제 근무시간
  function workedBetween(from, to) {
    if (to <= from) return 0;
    const lunch = Math.max(0, Math.min(to, RULES.lunchEnd) - Math.max(from, RULES.lunchStart));
    return to - from - lunch;
  }

  // from부터 need초를 더 일하면 끝나는 시각 (점심시간은 건너뜀)
  function finishTime(from, need) {
    let start = from;
    if (start >= RULES.lunchStart && start < RULES.lunchEnd) start = RULES.lunchEnd;
    const end = start + need;
    if (start < RULES.lunchStart && end > RULES.lunchStart) return end + (RULES.lunchEnd - RULES.lunchStart);
    return end;
  }

  // 월~목: 목요일까지 남은 날을 하루 plannedDaily씩 일하고, 금요일에 오늘과 같은 시각에 출근한다고 보고
  // 금요일에 몇 시에 퇴근할 수 있을지 계산한다. 오늘 이미 일한 시간은 그대로 센다.
  function fridayForecast(page, weekday, total, todayWorked, clockedOut) {
    if (weekday < 1 || weekday > 4) return null;
    const todayMore = clockedOut ? 0 : Math.max(0, RULES.plannedDaily - todayWorked);
    const planned = total + todayMore + RULES.plannedDaily * (4 - weekday);
    const need = Math.max(0, RULES.weeklyTarget - planned);
    const start = page.clockIn !== null ? Math.max(page.clockIn, RULES.workStart) : RULES.workStart;
    return {
      need,
      start,
      leaveAt: Math.max(finishTime(start, need), RULES.fridayEarliestLeave),
      daily: RULES.plannedDaily,
    };
  }

  // 오늘 이번 달 남은 평일 수 (오늘 포함 여부 선택). 공휴일은 모른다.
  function weekdaysLeft(now, includeToday) {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let n = 0;
    for (let d = now.getDate() + (includeToday ? 0 : 1); d <= last; d += 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), d).getDay();
      if (day !== 0 && day !== 6) n += 1;
    }
    return n;
  }

  // 이번 달 평일 수 × 하루 시간 (월 단위 자동 목표)
  function monthTarget(now) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return weekdaysLeft(first, true) * RULES.plannedDaily;
  }

  // 하루 단위 (시차출퇴근): 출근 시각 + 하루 목표 = 퇴근
  function evaluateDay(base, page, nowSec, startSec, clockedOut) {
    const target = RULES.target;
    const floor = (t) => Math.max(t, RULES.fridayEarliestLeave);
    if (startSec === null) {
      return { ...base, state: 'not-started', total: 0, remaining: target, leaveAt: floor(finishTime(Math.max(nowSec, RULES.workStart), target)) };
    }
    if (clockedOut) {
      const total = workedBetween(startSec, page.clockOut);
      return { ...base, state: 'clocked-out', total, remaining: target - total };
    }
    const total = workedBetween(startSec, nowSec);
    const leaveAt = floor(finishTime(startSec, target));
    return { ...base, state: 'working', total, remaining: Math.max(0, target - total), reachAt: leaveAt, leaveAt };
  }

  // 월 단위: 남은 시간을 남은 평일에 똑같이 나눠, 오늘 몇 시에 나가면 되는지 권한다.
  function evaluateMonth(base, page, now, nowSec, startSec, todayWorked, clockedOut) {
    const before = page.worked + page.leave;
    const target = RULES.autoHours ? monthTarget(now) : RULES.target;
    base = { ...base, target };
    if (clockedOut) {
      const daysLeft = weekdaysLeft(now, false);
      const remaining = target - before;
      return { ...base, state: 'clocked-out', total: before, remaining, month: { daysLeft, share: daysLeft ? Math.max(0, remaining) / daysLeft : 0 } };
    }
    const daysLeft = Math.max(1, weekdaysLeft(now, true));
    const share = Math.max(0, target - before) / daysLeft;
    if (startSec === null) {
      return { ...base, state: 'not-started', total: before, remaining: Math.max(0, target - before), leaveAt: null, month: { daysLeft, share } };
    }
    const total = before + todayWorked;
    const leaveAt = Math.max(finishTime(startSec, share), RULES.fridayEarliestLeave);
    return { ...base, state: 'working', total, remaining: Math.max(0, target - total), reachAt: leaveAt, leaveAt, month: { daysLeft, share } };
  }

  function evaluate(page, now) {
    if (page.missing.length) return { state: 'unreadable', missing: page.missing };

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // 이번 주 날짜를 읽은 화면(하이웍스)에서만 다른 주인지 본다.
    if (page.week && (today < page.week.start || today > page.week.end)) return { state: 'other-week' };

    const nowSec = now.getHours() * H + now.getMinutes() * 60 + now.getSeconds();
    const isFriday = now.getDay() === 5;
    const base = { isFriday, nowSec, target: RULES.target, mode: RULES.mode };
    const clockedOut = page.clockIn !== null && page.clockOut !== null;
    // 근무 인정 시작보다 일찍 출근했으면 그 시각부터 센다.
    const startSec = page.clockIn !== null ? Math.max(page.clockIn, RULES.workStart) : null;
    const todayWorked = startSec !== null && !clockedOut ? workedBetween(startSec, nowSec) : 0;
    // 누적에 오늘 일하는 중인 시간이 이미 들어 있는 화면이면 그만큼 빼고 아래에서 다시 더한다.
    if (page.includesToday && todayWorked && page.worked !== null) page = { ...page, worked: Math.max(0, page.worked - todayWorked) };

    if (RULES.mode === 'day') return evaluateDay(base, page, nowSec, startSec, clockedOut);
    if (RULES.mode === 'month') return evaluateMonth(base, page, now, nowSec, startSec, todayWorked, clockedOut);

    const before = page.worked + page.leave; // 오늘 진행분 제외(퇴근 후에는 사이트 합계에 포함됨)

    if (clockedOut) {
      return {
        ...base,
        state: 'clocked-out',
        total: before,
        remaining: RULES.weeklyTarget - before,
        friday: fridayForecast(page, now.getDay(), before, 0, true),
      };
    }

    if (startSec === null) {
      const need = Math.max(0, RULES.weeklyTarget - before);
      return {
        ...base,
        state: 'not-started',
        total: before,
        remaining: need,
        leaveAt: isFriday ? Math.max(finishTime(Math.max(nowSec, RULES.workStart), need), RULES.fridayEarliestLeave) : null,
        friday: fridayForecast(page, now.getDay(), before, 0, false),
      };
    }

    const total = before + todayWorked;
    const need = Math.max(0, RULES.weeklyTarget - before);
    const reachAt = finishTime(startSec, need);
    return {
      ...base,
      state: 'working',
      total,
      remaining: Math.max(0, RULES.weeklyTarget - total),
      reachAt,
      earlyLeave: isFriday && reachAt <= RULES.fridayEarliestLeave,
      leaveAt: isFriday ? Math.max(reachAt, RULES.fridayEarliestLeave) : null,
      friday: fridayForecast(page, now.getDay(), total, todayWorked, false),
    };
  }

  // 캐릭터 상태: 평소 / 퇴근 1시간 전부터 서두름 / 퇴근 가능 시각에 축하 / 퇴근 후 휴식
  function mascotMood(r) {
    if (!r) return 'normal';
    if (r.state === 'clocked-out') return 'rest';
    // 오늘 퇴근 시각이 있는 날 (주 단위의 금요일, 월·하루 단위는 매일)
    if (r.state === 'working' && typeof r.leaveAt === 'number') {
      if (r.nowSec >= r.leaveAt) return 'celebrate';
      if (r.leaveAt - r.nowSec <= H) return 'hurry';
    }
    return 'normal';
  }

  const api = { RULES, setRules, parsePage, evaluate, mascotMood, workedBetween, finishTime, secToTime, formatDuration, timeToSec };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HW40 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
