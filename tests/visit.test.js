const assert = require('node:assert');
const test = require('node:test');
const { encodeSignal, decodeSignal, splitMessage, createJoiner, cleanNick, cleanText, INVITE_PREFIX, REPLY_PREFIX, VisitError } = require('../src/visit.js');

const SDP = 'v=0\r\no=- 46117 2 IN IP4 127.0.0.1\r\ns=-\r\na=candidate:1 1 udp 2122260223 192.168.0.12 50000 typ host\r\n';

test('초대·답장 코드는 연결 정보와 이름을 그대로 주고받는다', async () => {
  const invite = await encodeSignal(INVITE_PREFIX, { sdp: SDP, nick: '재영' });
  assert.match(invite, /^HW40V1\.[A-Za-z0-9_-]+$/);
  assert.deepStrictEqual(await decodeSignal(`  ${invite.slice(0, 12)}\n${invite.slice(12)} `, INVITE_PREFIX), { sdp: SDP, nick: '재영' });
  const reply = await encodeSignal(REPLY_PREFIX, { sdp: SDP, nick: '' });
  assert.deepStrictEqual(await decodeSignal(reply, REPLY_PREFIX), { sdp: SDP, nick: '동료' }, '이름이 없으면 "동료"');
});

test('코드를 바꿔 넣거나 깨진 코드는 무엇을 넣어야 하는지 알려준다', async () => {
  const invite = await encodeSignal(INVITE_PREFIX, { sdp: SDP, nick: 'a' });
  const reply = await encodeSignal(REPLY_PREFIX, { sdp: SDP, nick: 'b' });
  await assert.rejects(decodeSignal(reply, INVITE_PREFIX), (e) => e instanceof VisitError && /답장 코드예요/.test(e.message));
  await assert.rejects(decodeSignal(invite, REPLY_PREFIX), /초대 코드예요/);
  await assert.rejects(decodeSignal('HW40T1.abc', INVITE_PREFIX), /HW40V1/);
  await assert.rejects(decodeSignal('HW40V1.%%%', INVITE_PREFIX), /깨졌어요/);
});

test('큰 메시지(캐릭터 그림)는 조각내 보내고 다시 붙인다', () => {
  const big = { t: 'hello', nick: '재영', char: { id: 'my-a', spec: { img: 'data:image/png;base64,' + 'A'.repeat(70000) } } };
  const frames = splitMessage(big, 16000);
  assert.ok(frames.length > 4);
  const join = createJoiner();
  const results = frames.map((f) => join(JSON.parse(f)));
  assert.deepStrictEqual(results.slice(0, -1).filter(Boolean), []);
  assert.deepStrictEqual(results.at(-1), big);
  // 작은 메시지는 한 번에
  const small = splitMessage({ t: 'say', text: '안녕' });
  assert.strictEqual(small.length, 1);
  assert.deepStrictEqual(join(JSON.parse(small[0])), { t: 'say', text: '안녕' });
});

test('이름과 말은 짧고 안전하게 다듬는다', () => {
  assert.strictEqual(cleanNick('  <b>아주아주아주긴이름입니다요</b> '), 'b아주아주아주긴이름입니');
  assert.strictEqual(cleanText(' 안녕\n\n하세요 '), '안녕 하세요');
  assert.strictEqual(cleanText('가'.repeat(150)).length, 100);
});
