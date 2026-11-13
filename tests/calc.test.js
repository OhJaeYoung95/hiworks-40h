const assert = require('node:assert');
const test = require('node:test');
const { parsePage, evaluate, secToTime, timeToSec } = require('../src/calc.js');

// 스크린샷(2026-11-06 금요일 16:02:20)의 화면 글자
const screen = ({ worked = '31시간 45분 57초', leave = '0분 0초', clockIn = '10:28:05', clockOut = '00:00:00' } = {}) => `
11월
6
Friday
근무일
16 : 02 : 20
근무중
출근하기
${clockIn}
퇴근하기
${clockOut}
업무 회의 외근 출장
${clockIn === '00:00:00' ? '' : `${clockIn}\n출근\n출근`}
근무체크수정
주간 근무현황
2026년 11월 02일 ~ 08일
이번 주
2 (월)
출근
10:56
퇴근
19:44
총 7시간 48분 39초
3 (화)
총 8시간 42분 57초
4 (수)
총 8시간 1분 54초
5 (목)
총 7시간 12분 27초
6 (금)
출근
10:28
주간 합계
계획 0분 0초
휴가 ${leave}
실근무
총: ${worked}
야간: 0분 0초
`;

const friday = (t) => new Date(`2026-11-06T${t}`);
const run = (opts, at) => evaluate(parsePage(screen(opts)), friday(at));

test('스크린샷 값: 19:42:08에 40시간 달성', () => {
  const page = parsePage(screen());
  assert.deepStrictEqual(page.missing, []);
  assert.strictEqual(page.worked, timeToSec('31:45:57'));
  assert.strictEqual(page.clockIn, timeToSec('10:28:05'));
  assert.strictEqual(page.clockOut, null);

  const r = evaluate(page, friday('16:02:20'));
  assert.strictEqual(r.state, 'working');
  assert.strictEqual(secToTime(r.leaveAt), '19:42:08');
  assert.strictEqual(r.earlyLeave, false);
  // 31:45:57 + (10:28:05~16:02:20 - 점심 1시간 = 4:34:15)
  assert.strictEqual(secToTime(r.total), '36:20:12');
  assert.strictEqual(secToTime(r.remaining), '03:39:48');
});

test('월요일 실제 기록으로 점심 차감 규칙 확인 (10:56~19:44 = 7시간 48분)', () => {
  const { workedBetween } = require('../src/calc.js');
  assert.strictEqual(secToTime(workedBetween(timeToSec('10:56:00'), timeToSec('19:44:00'))), '07:48:00');
});

test('40시간을 17시 전에 채워도 17시 퇴근', () => {
  const r = run({ worked: '35시간', clockIn: '09:00:00' }, '10:00:00');
  assert.strictEqual(secToTime(r.reachAt), '15:00:00');
  assert.strictEqual(secToTime(r.leaveAt), '17:00:00');
  assert.strictEqual(r.earlyLeave, true);
});

test('이미 40시간을 채웠으면 17시 퇴근', () => {
  assert.strictEqual(secToTime(run({ worked: '41시간', clockIn: '10:00:00' }, '11:00:00').leaveAt), '17:00:00');
});

test('13시 정각에 끝나면 점심을 더하지 않음', () => {
  assert.strictEqual(secToTime(run({ worked: '37시간', clockIn: '10:00:00' }, '10:30:00').reachAt), '13:00:00');
});

test('점심시간 중 출근이면 14시부터 계산', () => {
  assert.strictEqual(secToTime(run({ worked: '34시간', clockIn: '13:30:00' }, '13:40:00').reachAt), '20:00:00');
});

test('14시 이후 출근이면 점심 차감 없음', () => {
  assert.strictEqual(secToTime(run({ worked: '34시간', clockIn: '14:30:00' }, '15:00:00').reachAt), '20:30:00');
});

test('휴가 시간은 40시간에 포함', () => {
  assert.strictEqual(secToTime(run({ worked: '24시간', leave: '8시간', clockIn: '10:00:00' }, '11:00:00').reachAt), '19:00:00');
});

test('출근 전이면 지금 출근 기준으로 계산', () => {
  const r = run({ clockIn: '00:00:00' }, '09:00:00');
  assert.strictEqual(r.state, 'not-started');
  assert.strictEqual(secToTime(r.leaveAt), '18:14:03');
});

test('퇴근 후 부족/달성 판정', () => {
  assert.strictEqual(run({ worked: '39시간', clockOut: '18:00:00' }, '18:01:00').remaining, 3600);
  assert.ok(run({ worked: '40시간 10분', clockOut: '18:00:00' }, '18:01:00').remaining <= 0);
});

test('다른 주를 보고 있으면 계산하지 않음', () => {
  const r = evaluate(parsePage(screen()), new Date('2026-11-13T10:00:00'));
  assert.strictEqual(r.state, 'other-week');
});

test('월을 넘기는 주도 인식', () => {
  const text = screen().replace('2026년 11월 02일 ~ 08일', '2026년 11월 30일 ~ 12월 06일');
  assert.strictEqual(evaluate(parsePage(text), new Date('2026-12-04T10:00:00')).isFriday, true);
});

test('합계 영역이 없으면 요일별 합계로 대체', () => {
  const text = screen().split('주간 합계')[0];
  assert.strictEqual(parsePage(text).worked, timeToSec('31:45:57'));
});

test('캐릭터 상태는 퇴근 시각을 따른다', () => {
  const { mascotMood } = require('../src/calc.js');
  assert.strictEqual(mascotMood(undefined), 'normal');
  assert.strictEqual(mascotMood(run({}, '16:02:20')), 'normal');
  assert.strictEqual(mascotMood(run({}, '18:42:07')), 'normal');
  assert.strictEqual(mascotMood(run({}, '18:42:08')), 'hurry');
  assert.strictEqual(mascotMood(run({}, '19:42:07')), 'hurry');
  assert.strictEqual(mascotMood(run({}, '19:42:08')), 'celebrate');
  assert.strictEqual(mascotMood(run({ clockOut: '19:50:00' }, '19:51:00')), 'rest');
  // 금요일이 아니면 서두르지 않는다
  assert.strictEqual(mascotMood(evaluate(parsePage(screen()), new Date('2026-11-05T19:00:00'))), 'normal');
});

test('화면을 못 읽으면 누락 항목을 알려줌', () => {
  const r = evaluate(parsePage('로딩 중'), friday('10:00:00'));
  assert.strictEqual(r.state, 'unreadable');
  assert.strictEqual(r.missing.length, 3);
});

test('월~목에는 목요일까지 하루 8시간, 오늘 출근 시각 기준으로 금요일 예상 퇴근을 낸다', () => {
  const page = (worked, clockIn, clockOut = null) => ({
    week: { start: new Date(2026, 10, 2), end: new Date(2026, 10, 8) },
    worked,
    leave: 0,
    clockIn: clockIn && timeToSec(clockIn),
    clockOut: clockOut && timeToSec(clockOut),
    missing: [],
  });
  const H = 3600;

  // 화요일 15시, 월요일 8시간 + 오늘 10시 출근: 화·수·목 8시간씩이면 금요일 8시간 → 10:00 출근 19:00 퇴근
  const tue = evaluate(page(8 * H, '10:00:00'), new Date(2026, 10, 3, 15, 0, 0));
  assert.strictEqual(tue.friday.need, 8 * H);
  assert.strictEqual(secToTime(tue.friday.leaveAt), '19:00:00');

  // 목요일 퇴근 후 이미 36시간: 금요일 4시간 → 9:30 출근이면 14:30이지만 17:00이 가장 빠르다
  const thu = evaluate(page(36 * H, '09:30:00', '18:30:00'), new Date(2026, 10, 5, 19, 0, 0));
  assert.strictEqual(secToTime(thu.friday.leaveAt), '17:00:00');

  // 출근 전이면 기본 출근 시각(09:00)으로 본다. 수요일 아침, 지금까지 14시간: 수·목 16시간 → 금요일 10시간
  const wed = evaluate(page(14 * H, null), new Date(2026, 10, 4, 8, 0, 0));
  assert.strictEqual(wed.friday.start, timeToSec('09:00:00'));
  assert.strictEqual(secToTime(wed.friday.leaveAt), '20:00:00');

  // 금요일과 주말에는 예상 줄을 내지 않는다
  assert.strictEqual(evaluate(page(32 * H, '10:00:00'), new Date(2026, 10, 6, 11, 0, 0)).friday, null);
  assert.strictEqual(evaluate(page(40 * H, null), new Date(2026, 10, 7, 11, 0, 0)).friday, null);
});

// 2026-11-13(금) 실제 화면 숫자: 월~목 08:55쯤 출근·18:00 퇴근, 금요일 08:55:27 출근
const DAYS = [
  ['9 (월)', '08:55', '18:00', '8시간 4분 33초'],
  ['10 (화)', '08:55', '18:00', '8시간 4분 10초'],
  ['11 (수)', '08:52', '18:00', '8시간 7분 27초'],
  ['12 (목)', '08:56', '18:00', '8시간 3분 27초'],
];
const cellOf = ([, i, o, t]) => `출근\n${i}\n퇴근\n${o}\n총 ${t}`;
const head = `출근하기\n08:55:27\n퇴근하기\n00:00:00\n주간 근무현황\n2026년 11월 09일 ~ 15일\n`;
const sum = `계획 0분 0초\n휴가 0분 0초\n실근무\n총: 32시간 19분 37초\n야간: 0분 0초\n`;
// 요일마다 이름과 칸이 붙어 읽히는 화면
const byDay = `${head}${DAYS.map((d) => `${d[0]}\n${cellOf(d)}`).join('\n')}\n13 (금)\n출근\n08:55\n14 (토)\n15 (일)\n주간 합계\n${sum}`;
// 표처럼 요일 이름 줄(주간 합계 포함)이 먼저 읽히고 칸이 뒤에 오는 화면
const byRow = `${head}${DAYS.map((d) => d[0]).join('\t')}\t13 (금)\t14 (토)\t15 (일)\t주간 합계\n${DAYS.map(cellOf).join('\t')}\t출근\n08:55\t휴무일\t휴일\t${sum}`;

for (const [name, text] of [['요일별', byDay], ['표 형태', byRow]]) {
  test(`9시 전 출근 시간은 금요일 퇴근에 영향이 없다: 매일 18:00 퇴근이면 금요일도 18:00 (${name})`, () => {
    const page = parsePage(text);
    assert.strictEqual(secToTime(page.early), '00:19:37');
    assert.strictEqual(secToTime(page.worked), '32:00:00');
    const r = evaluate(page, new Date('2026-11-13T14:20:00'));
    assert.strictEqual(secToTime(r.leaveAt), '18:00:00');
    assert.strictEqual(secToTime(r.total), '36:20:00');
    // 출근 전(아침 8시 반)에 보면 9시 출근 기준
    const before = evaluate(parsePage(text.replace('08:55:27', '00:00:00')), new Date('2026-11-13T08:30:00'));
    assert.strictEqual(secToTime(before.leaveAt), '18:00:00');
  });
}

test('9시 이후 출근과 요일 칸이 없는 화면은 그대로 계산한다', () => {
  const page = parsePage(screen());
  assert.strictEqual(page.early, 0, '월요일 10:56 출근은 뺄 시간이 없다');
});
