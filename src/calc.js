// 근무 규칙과 계산. DOM에 의존하지 않아 node로 바로 테스트할 수 있다.
(function (root) {
  const H = 3600;
  const CONFIG = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.HW40_CONFIG;
  const clock = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * H + m * 60;
  };
  const RULES = {
    weeklyTarget: CONFIG.weeklyHours * H,
    lunchStart: clock(CONFIG.lunchStart),
    lunchEnd: clock(CONFIG.lunchEnd),
    fridayEarliestLeave: clock(CONFIG.fridayEarliestLeave),
  };

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

    const leaveMatch = summary.match(new RegExp(`휴가\\s*${DURATION}`));
    const leave = (leaveMatch && durationToSec(leaveMatch[1])) || 0;

    const clockIn = parseClock(text, '출근');
    const clockOut = parseClock(text, '퇴근');

    const missing = [];
    const week = parseWeek(text);
    if (!week) missing.push('주간 날짜');
    if (worked === null) missing.push('주간 근무시간');
    if (!clockIn.found) missing.push('출근 시각');

    return { week, worked, leave, clockIn: clockIn.sec, clockOut: clockOut.sec, missing };
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

  function evaluate(page, now) {
    if (page.missing.length) return { state: 'unreadable', missing: page.missing };

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (today < page.week.start || today > page.week.end) return { state: 'other-week' };

    const nowSec = now.getHours() * H + now.getMinutes() * 60 + now.getSeconds();
    const isFriday = now.getDay() === 5;
    const before = page.worked + page.leave; // 오늘 진행분 제외(퇴근 후에는 사이트 합계에 포함됨)
    const base = { isFriday, nowSec, target: RULES.weeklyTarget };

    if (page.clockIn !== null && page.clockOut !== null) {
      return { ...base, state: 'clocked-out', total: before, remaining: RULES.weeklyTarget - before };
    }

    if (page.clockIn === null) {
      const need = Math.max(0, RULES.weeklyTarget - before);
      return {
        ...base,
        state: 'not-started',
        total: before,
        remaining: need,
        leaveAt: isFriday ? Math.max(finishTime(nowSec, need), RULES.fridayEarliestLeave) : null,
      };
    }

    const total = before + workedBetween(page.clockIn, nowSec);
    const need = Math.max(0, RULES.weeklyTarget - before);
    const reachAt = finishTime(page.clockIn, need);
    return {
      ...base,
      state: 'working',
      total,
      remaining: Math.max(0, RULES.weeklyTarget - total),
      reachAt,
      earlyLeave: isFriday && reachAt <= RULES.fridayEarliestLeave,
      leaveAt: isFriday ? Math.max(reachAt, RULES.fridayEarliestLeave) : null,
    };
  }

  // 캐릭터 상태: 평소 / 퇴근 1시간 전부터 서두름 / 퇴근 가능 시각에 축하 / 퇴근 후 휴식
  function mascotMood(r) {
    if (!r) return 'normal';
    if (r.state === 'clocked-out') return 'rest';
    if (r.state === 'working' && r.isFriday) {
      if (r.nowSec >= r.leaveAt) return 'celebrate';
      if (r.leaveAt - r.nowSec <= H) return 'hurry';
    }
    return 'normal';
  }

  const api = { RULES, parsePage, evaluate, mascotMood, workedBetween, finishTime, secToTime, formatDuration, timeToSec };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HW40 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
