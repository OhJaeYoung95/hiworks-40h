const assert = require('node:assert');
const test = require('node:test');
const C = require('../src/company.js');
const calc = require('../src/calc.js');

const H = 3600;
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);
const page = (o) => ({ week: null, worked: 0, early: 0, leave: 0, clockIn: null, clockOut: null, missing: [], ...o });

test('화면 글자에서 걸린 시간과 시각을 여러 표기로 읽는다', () => {
  const d = C.parseDurationText;
  assert.strictEqual(d('총: 31시간 45분 57초'), 31 * H + 45 * 60 + 57);
  assert.strictEqual(d('누적 32:15'), 32 * H + 15 * 60);
  assert.strictEqual(d('31:45:57'), 31 * H + 45 * 60 + 57);
  assert.strictEqual(d('7.5시간'), 7.5 * H);
  assert.strictEqual(d('31h 30m'), 31 * H + 30 * 60);
  assert.strictEqual(d('8시간'), 8 * H);
  assert.strictEqual(d('근무 없음'), null);

  const c = C.parseClockText;
  assert.strictEqual(c('IN 08:55'), 8 * H + 55 * 60);
  assert.strictEqual(c('09:12:30'), 9 * H + 12 * 60 + 30);
  assert.strictEqual(c('오후 6:03'), 18 * H + 3 * 60);
  assert.strictEqual(c('PM 12:10'), 12 * H + 10 * 60);
  assert.strictEqual(c('오전 12:30'), 30 * 60);
  assert.strictEqual(c('18시 3분'), 18 * H + 3 * 60);
  assert.strictEqual(c('--:--'), null, '퇴근 전 빈칸');
  assert.strictEqual(c('00:00:00'), null, '하이웍스의 기록 없음 표시');
});

test('규칙은 방식별 기본값으로 채우고 범위를 넘으면 고친다', () => {
  assert.deepStrictEqual(C.normalizeRules({ mode: 'month', hours: 999 }), { ...C.PRESETS.month.rules, hours: 400 });
  assert.deepStrictEqual(C.normalizeRules({}), C.PRESETS.week.rules);
  const r = C.normalizeRules({ mode: 'day', hours: 8, workStart: '7:30', lunch: null, earliest: '16:00' });
  assert.deepStrictEqual(r, { mode: 'day', hours: 8, workStart: '07:30', lunch: null, earliest: '16:00', daily: 8 });
  assert.strictEqual(C.normalizeRules({ lunch: ['14:00', '13:00'] }).lunch, null, '끝이 시작보다 빠르면 점심 없음');
});

test('회사 설정 코드는 규칙과 읽을 곳을 그대로 주고받는다', async () => {
  const company = {
    name: '우리 회사',
    host: 'work.example.com',
    rules: { mode: 'month', hours: 160, workStart: '08:00', lunch: ['12:00', '13:00'], earliest: null, daily: 8 },
    fields: { worked: { sel: 'body > div:nth-of-type(2) > span:nth-of-type(1)', label: '누적 근무' }, clockIn: { sel: '#in', label: '출근' } },
    includesToday: true,
  };
  const code = await C.encodeCompany(company);
  assert.match(code, /^HW40S1\./);
  assert.deepStrictEqual(await C.decodeCompany(`${code.slice(0, 10)}\n${code.slice(10)}`), company);
  await assert.rejects(C.decodeCompany('HW40T1.abc'), /테마·캐릭터·초대 코드/);
  await assert.rejects(C.decodeCompany('HW40S1.%%%'), /깨졌어요/);
  // 읽을 곳이 있는데 필수 칸이 없으면 알려 준다
  assert.throws(() => C.normalizeCompany({ rules: { mode: 'week' }, fields: { clockIn: { sel: '#a' } } }), /누적 근무시간/);
  assert.throws(() => C.normalizeCompany({ rules: { mode: 'day' }, fields: { worked: { sel: '#a' } } }), /출근 시각/);
});

test('월 단위: 남은 시간을 남은 평일에 나눠 오늘 권장 퇴근 시각을 낸다', (t) => {
  t.after(() => calc.setRules(null));
  calc.setRules(C.normalizeRules({ mode: 'month', hours: 160, workStart: '09:00', lunch: ['12:00', '13:00'], earliest: null }));
  // 2026년 11월 24일(화): 남은 평일 24~30일 = 5일. 지금까지 120시간 → 하루 8시간
  const r = calc.evaluate(page({ worked: 120 * H, clockIn: 9 * H }), at(2026, 11, 24, 14));
  assert.strictEqual(r.mode, 'month');
  assert.strictEqual(r.month.daysLeft, 5);
  assert.strictEqual(r.month.share, 8 * H);
  assert.strictEqual(r.leaveAt, 18 * H, '9시 출근 + 8시간 + 점심 1시간');
  assert.strictEqual(r.total, 120 * H + 4 * H, '오늘 9~14시 중 점심 빼고 4시간');
  assert.strictEqual(calc.mascotMood({ ...r, nowSec: 18 * H }), 'celebrate');
  // 퇴근 뒤에는 오늘을 빼고 남은 날로 나눈다
  const out = calc.evaluate(page({ worked: 128 * H, clockIn: 9 * H, clockOut: 18 * H }), at(2026, 11, 24, 19));
  assert.strictEqual(out.month.daysLeft, 4);
  assert.strictEqual(out.month.share, 8 * H);
});

test('하루 단위(시차출퇴근): 출근 + 하루 시간 = 퇴근, 코어타임 끝보다 일찍은 안 된다', (t) => {
  t.after(() => calc.setRules(null));
  calc.setRules(C.normalizeRules({ mode: 'day', hours: 8, workStart: '07:00', lunch: ['12:00', '13:00'], earliest: '16:00' }));
  const early = calc.evaluate(page({ clockIn: 6 * H + 30 * 60 }), at(2026, 11, 24, 10));
  assert.strictEqual(early.state, 'working');
  assert.strictEqual(early.leaveAt, 16 * H, '7시부터 8시간 + 점심 = 16시');
  const late = calc.evaluate(page({ clockIn: 10 * H }), at(2026, 11, 24, 11));
  assert.strictEqual(late.leaveAt, 19 * H);
  assert.strictEqual(late.remaining, 7 * H);
  const tooEarly = calc.evaluate(page({ clockIn: 7 * H }), at(2026, 11, 24, 8));
  calc.setRules(C.normalizeRules({ mode: 'day', hours: 6, workStart: '07:00', lunch: null, earliest: '16:00' }));
  assert.strictEqual(calc.evaluate(page({ clockIn: 7 * H }), at(2026, 11, 24, 8)).leaveAt, 16 * H, '6시간이면 13시지만 코어타임 끝 16시');
  assert.ok(tooEarly);
});

test('누적에 오늘 진행분이 이미 들어 있는 화면이면 두 번 세지 않는다', (t) => {
  t.after(() => calc.setRules(null));
  calc.setRules(null);
  // 금요일 14시, 9시 출근. 화면 누적 36시간(오늘 4시간 포함) → 실제 남은 4시간 → 18시
  const live = calc.evaluate(page({ worked: 36 * H, clockIn: 9 * H, includesToday: true }), at(2026, 11, 27, 14));
  const plain = calc.evaluate(page({ worked: 32 * H, clockIn: 9 * H }), at(2026, 11, 27, 14));
  assert.strictEqual(live.total, plain.total);
  assert.strictEqual(live.leaveAt, plain.leaveAt);
  assert.strictEqual(plain.leaveAt, 18 * H);
});

test('프리셋: 우리 회사 기본이 첫 번째이고, 모든 프리셋은 규칙 검사를 통과한다', () => {
  assert.strictEqual(C.DEFAULT_PRESET.id, 'ours');
  // 우리 회사 기본 = config.js의 하이웍스 규칙
  const config = require('../src/config.js');
  assert.deepStrictEqual(C.DEFAULT_PRESET.rules, {
    mode: 'week', hours: config.weeklyHours, workStart: config.workStart, lunch: [config.lunchStart, config.lunchEnd], earliest: config.fridayEarliestLeave, daily: config.plannedDailyHours,
  });
  for (const p of C.PRESET_LIST) assert.deepStrictEqual(C.normalizeRules(p.rules), p.rules, p.id);
  assert.strictEqual(C.presetOf({ ...C.PRESET_LIST[2].rules }).id, 'week35');
  assert.strictEqual(C.presetOf({ ...C.PRESET_LIST[2].rules, hours: 36 }), null, '고치면 직접 고친 규칙');
});

test('월 단위 자동 목표: 이번 달 평일 수 × 하루 시간', (t) => {
  t.after(() => calc.setRules(null));
  calc.setRules(C.normalizeRules({ mode: 'month', hours: 'auto', daily: 8 }));
  // 2026년 11월 평일 21일 → 168시간
  const r = calc.evaluate(page({ worked: 100 * H }), at(2026, 11, 24, 8));
  assert.strictEqual(r.target, 168 * H);
  assert.strictEqual(r.remaining, 68 * H);
});
