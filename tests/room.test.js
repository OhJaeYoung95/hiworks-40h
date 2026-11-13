const assert = require('node:assert');
const test = require('node:test');
const { createRoom } = require('../src/room.js');

// 가짜 연결: 초대 코드 → 답장 코드를 주고받으면 두 쪽이 이어지고, 메시지는 JSON으로 오간다.
function fakeNet() {
  const byCode = new Map();
  let n = 0;
  const makeLink = (hooks) => {
    const link = { hooks, other: null, open: false };
    const deliver = (to, msg) => setImmediate(() => to.open && to.hooks.onMessage(JSON.parse(JSON.stringify(msg))));
    Object.assign(link, {
      async invite(nick) {
        const code = `INV${(n += 1)}`;
        byCode.set(code, { link, nick });
        return code;
      },
      async accept(code, nick) {
        const inviter = byCode.get(code);
        link.other = inviter.link;
        inviter.link.other = link;
        const reply = `REP${(n += 1)}`;
        byCode.set(reply, { link, nick });
        return { reply, peer: { nick: inviter.nick } };
      },
      async finish(reply) {
        const replier = byCode.get(reply);
        for (const l of [link, replier.link]) l.open = true;
        setImmediate(() => [link, replier.link].forEach((l) => l.hooks.onOpen()));
        return { nick: replier.nick };
      },
      send(msg) {
        if (!link.open || !link.other) return false;
        deliver(link.other, msg);
        return true;
      },
      close() {
        if (!link.open) return;
        link.open = false;
        link.hooks.onClose('local');
        const o = link.other;
        if (o && o.open) {
          o.open = false;
          setImmediate(() => o.hooks.onClose('closed'));
        }
      },
    });
    return link;
  };
  return makeLink;
}

const tick = () => new Promise((r) => setTimeout(r, 20));

function person(makeLink, nick, avatar) {
  const log = [];
  const state = { nick, avatar };
  const room = createRoom({
    makeLink,
    me: () => state,
    on: {
      join: (p) => log.push(`join:${p.nick}:${p.avatar && p.avatar.id}`),
      leave: (p) => log.push(`leave:${p.nick}`),
      say: (p, text) => log.push(`say:${p.nick}:${text}`),
      petted: (p) => log.push(`petted-by:${p.nick}`),
      closed: (reason) => log.push(`closed:${reason}`),
    },
  });
  return { room, log, state };
}

async function enter(host, guest) {
  const code = await host.room.invite();
  const { reply, hostNick } = await guest.room.join(code);
  assert.strictEqual(hostNick, host.state.nick);
  await host.room.accept(reply);
  await tick();
}

test('방장이 연 방에 여러 명이 들어오면 모두가 서로의 아바타를 본다', async () => {
  const net = fakeNet();
  const a = person(net, '에이', { id: 'kong' });
  const b = person(net, '비이', { id: 'hodu' });
  const c = person(net, '씨이', { id: 'mong' });
  a.room.open();
  await enter(a, b);
  await enter(a, c);
  assert.deepStrictEqual(a.room.people().map((p) => p.nick), ['에이', '비이', '씨이']);
  assert.deepStrictEqual(b.room.people().map((p) => p.nick), ['비이', '에이', '씨이']);
  assert.deepStrictEqual(c.room.people().map((p) => p.nick).sort(), ['비이', '씨이', '에이']);
  assert.ok(b.log.includes('join:씨이:mong'), '먼저 온 사람도 새로 온 사람을 본다');
  assert.ok(c.log.includes('join:비이:hodu'), '새로 온 사람도 먼저 온 사람을 본다');
  assert.strictEqual(c.room.myId, 'm2');
});

test('말은 방장을 거쳐 모두에게 가고, 쓰다듬기는 그 사람에게만 간다', async () => {
  const net = fakeNet();
  const [a, b, c] = [person(net, '에이'), person(net, '비이'), person(net, '씨이')];
  a.room.open();
  await enter(a, b);
  await enter(a, c);
  b.room.say('  점심 뭐 먹어요?  ');
  a.room.say('국밥!');
  await tick();
  await tick();
  assert.ok(a.log.includes('say:비이:점심 뭐 먹어요?'));
  assert.ok(c.log.includes('say:비이:점심 뭐 먹어요?'));
  assert.ok(!b.log.some((l) => l.startsWith('say:비이')), '내 말은 나에게 되돌아오지 않는다');
  assert.ok(b.log.includes('say:에이:국밥!') && c.log.includes('say:에이:국밥!'));

  c.room.pet('m1');
  b.room.pet('h');
  await tick();
  await tick();
  assert.ok(b.log.includes('petted-by:씨이'));
  assert.ok(a.log.includes('petted-by:비이'));
  assert.ok(!c.log.some((l) => l.startsWith('petted')));
});

test('아바타를 바꾸면 모두의 화면에서 바뀐다', async () => {
  const net = fakeNet();
  const [a, b, c] = [person(net, '에이', { id: 'kong' }), person(net, '비이', { id: 'hodu' }), person(net, '씨이', { id: 'mong' })];
  a.room.open();
  await enter(a, b);
  await enter(a, c);
  b.state.avatar = { id: 'my-cat' };
  b.room.avatarChanged();
  a.state.avatar = { id: 'bora' };
  a.room.avatarChanged();
  await tick();
  await tick();
  assert.ok(a.log.includes('join:비이:my-cat') && c.log.includes('join:비이:my-cat'));
  assert.ok(b.log.includes('join:에이:bora') && c.log.includes('join:에이:bora'));
});

test('동료가 나가면 모두에게서 사라지고, 방장이 나가면 방이 닫힌다', async () => {
  const net = fakeNet();
  const [a, b, c] = [person(net, '에이'), person(net, '비이'), person(net, '씨이')];
  a.room.open();
  await enter(a, b);
  await enter(a, c);
  b.room.leave();
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(a.log.includes('leave:비이') && c.log.includes('leave:비이'));
  assert.deepStrictEqual(c.room.people().map((p) => p.nick), ['씨이', '에이']);

  a.room.leave();
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(c.log.includes('closed:host-left'));
  assert.ok(a.log.includes('closed:left') && b.log.includes('closed:left'), '스스로 나간 사람은 "나왔어요"');
  assert.ok(c.log.includes('leave:에이'));
  assert.ok(c.room.closed && a.room.closed);
});

test('방 캐릭터는 방장 테마로 시작하고, 권한 받은 사람만 자기 캐릭터를 데려오거나 뺄 수 있다', async () => {
  const net = fakeNet();
  const casts = { a: [], b: [], c: [] };
  // createRoom에 cast/perm 이벤트를 연결한 사람을 다시 만든다
  const mk = (nick, k) => {
    const state = { nick };
    const perm = [];
    const room = createRoom({
      makeLink: net,
      me: () => state,
      on: {
        cast: (list, change) => casts[k].push({ ids: list.map((i) => i.id), change: change && (change.added ? `+${change.nick}:${change.added.id}` : `-${change.nick}:${change.removed.id}`) }),
        perm: (v) => perm.push(v),
      },
    });
    return { room, state, perm };
  };
  const A = mk('에이', 'a');
  const B = mk('비이', 'b');
  const C = mk('씨이', 'c');
  A.room.open([{ id: 'kong' }, { id: 'hodu', name: '호떡' }]);
  await enter(A, B);
  await enter(A, C);
  assert.deepStrictEqual(casts.b.at(-1).ids, ['kong', 'hodu'], '들어온 사람도 방장 테마를 본다');

  // 권한이 없으면 못 바꾼다
  assert.strictEqual(B.room.addCast({ id: 'mong' }), false);
  A.room.grant('m1', true);
  await tick();
  assert.deepStrictEqual(B.perm, [true]);
  assert.strictEqual(B.room.canEdit, true);
  assert.strictEqual(C.room.canEdit, false);
  assert.ok(C.room.people().find((p) => p.nick === '비이').editor);

  // 권한 받은 비이가 자기 캐릭터(그림 포함)를 데려온다
  B.room.addCast({ id: 'my-cat', name: '냥이', spec: { id: 'my-cat' } });
  await tick();
  await tick();
  for (const k of ['a', 'b', 'c']) {
    assert.deepStrictEqual(casts[k].at(-1).ids, ['kong', 'hodu', 'my-cat']);
    assert.strictEqual(casts[k].at(-1).change, '+비이:my-cat');
  }
  assert.deepStrictEqual(C.room.cast()[2].spec, { id: 'my-cat' });

  // 빼기
  B.room.removeCast(A.room.cast()[0].key);
  await tick();
  await tick();
  assert.deepStrictEqual(casts.c.at(-1).ids, ['hodu', 'my-cat']);
  assert.strictEqual(casts.c.at(-1).change, '-비이:kong');

  // 권한을 거두면 다시 못 바꾼다 (방장이 무시한다)
  A.room.grant('m1', false);
  await tick();
  assert.strictEqual(B.room.canEdit, false);
  C.room.addCast({ id: 'bora' });
  await tick();
  assert.deepStrictEqual(A.room.cast().map((i) => i.id), ['hodu', 'my-cat']);
});
