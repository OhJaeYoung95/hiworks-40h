// 여러 명이 모이는 방. 서버가 없으므로 방을 연 사람(방장)이 가운데에서 말을 전해 준다.
//   방장 ─┬─ 동료1      동료끼리는 직접 연결하지 않고, 방장이 받은 말을 나머지에게 넘긴다.
//         ├─ 동료2      그래서 초대 코드는 들어오는 사람마다 한 번씩만 주고받으면 된다.
//         └─ 동료3      방장이 나가면 방이 닫힌다.
// 방은 방장의 방이다: 모두의 화면에 방장의 테마 캐릭터들(방 캐릭터)이 돌아다니고, 그 위로 각자의 아바타가 나온다.
// 방장이 꾸미기 권한을 준 사람은 자기 캐릭터를 방에 데려오거나 방 캐릭터를 뺄 수 있다.
// 연결 자체(초대·답장 코드, WebRTC)는 visit.js의 createLink가 맡는다. 여기서는 누가 있고 누가 무슨 말을 했는지만 다룬다.
(function (root) {
  const HOST_ID = 'h';
  const MAX_PEOPLE = 8;
  const MAX_CAST = 12; // 방 캐릭터 수 (아바타 제외)

  const V = () => root.HW40_VISIT || (typeof require === 'function' ? require('./visit.js') : null);

  // makeLink(hooks): visit.createLink 와 같은 모양의 연결을 만든다.
  // me(): { nick, avatar } 지금 내 이름과 아바타
  // on: { people(list), join(p), leave(p), say(p, text), petted(p), closed(reason),
  //        cast(list, change), perm(canEdit) }  change: { nick, added | removed } 누가 무엇을 바꿨는지
  function createRoom({ makeLink, me, on }) {
    const { cleanNick, cleanText } = V();
    const emit = (name, ...args) => on[name] && on[name](...args);
    const people = new Map(); // pid → { pid, nick, avatar }
    let role = null; // 'host' | 'member'
    let myId = null;
    let closed = false;
    let leaving = false; // 내가 나가는 중 (그 사이 연결이 끊겨도 "나왔어요"로 본다)
    // 방장: 들어온 동료마다의 연결. 멤버: 방장과의 연결 하나.
    const links = new Map(); // pid → link
    let pending = null; // 방장: 아직 답장을 기다리는 초대 { pid, link }
    let hostLink = null;
    let nextMember = 0;
    // 방 캐릭터: [{ key, id, name?, size?, spec?, by }] (spec: 직접 만든 캐릭터의 그림 설정)
    let cast = [];
    let nextCast = 0;
    const editors = new Set(); // 꾸미기 권한을 받은 사람 (방장은 언제나 된다)
    let canEdit = false;

    const castItem = (item, by) => {
      nextCast += 1;
      const out = { key: `c${nextCast}`, id: String(item.id || ''), by };
      if (item.name) out.name = String(item.name).slice(0, 20);
      if (item.size) out.size = Number(item.size);
      if (item.spec && typeof item.spec === 'object') out.spec = item.spec;
      return out;
    };
    const nickOf = (pid) => (pid === myId ? self().nick : (people.get(pid) || {}).nick || '누군가');
    const setPerm = (value) => {
      if (value === canEdit) return;
      canEdit = value;
      emit('perm', canEdit);
    };

    const list = () => [...people.values()];
    const self = () => ({ pid: myId, nick: cleanNick(me().nick), avatar: me().avatar || null, me: true });
    const changed = () => emit('people', room.people());

    function addPerson(pid, nick, avatar) {
      const p = { pid, nick: cleanNick(nick), avatar: avatar || null };
      const had = people.has(pid);
      people.set(pid, p);
      emit('join', p, had);
      changed();
      return p;
    }
    function removePerson(pid) {
      const p = people.get(pid);
      if (!p) return;
      people.delete(pid);
      editors.delete(pid);
      emit('leave', p);
      changed();
    }

    // ---------- 방장 ----------
    const sendTo = (pid, msg) => {
      const l = links.get(pid);
      if (l) l.send(msg);
    };
    const broadcast = (msg, except = null) => {
      for (const [pid, l] of links) if (pid !== except) l.send(msg);
    };
    function hostMessage(pid, msg) {
      const p = people.get(pid);
      if (msg.t === 'hello') {
        if (!p && people.size + 1 >= MAX_PEOPLE) {
          sendTo(pid, { t: 'bye', reason: 'full' });
          return;
        }
        const joined = addPerson(pid, msg.nick, msg.avatar);
        // 새로 온 사람에게: 내 번호, 방장과 먼저 와 있던 사람들
        sendTo(pid, { t: 'welcome', you: pid });
        const host = self();
        sendTo(pid, { t: 'join', pid: HOST_ID, nick: host.nick, avatar: host.avatar });
        for (const other of people.values()) if (other.pid !== pid) sendTo(pid, { t: 'join', ...other });
        sendTo(pid, { t: 'cast', cast });
        sendTo(pid, { t: 'perm', editors: [...editors] });
        // 먼저 와 있던 사람들에게: 새로 온 사람
        broadcast({ t: 'join', ...joined }, pid);
        return;
      }
      if (!p) return; // 인사 전의 메시지는 무시한다.
      if (msg.t === 'say') {
        const text = cleanText(msg.text);
        if (!text) return;
        emit('say', p, text);
        broadcast({ t: 'say', from: pid, text }, pid);
      } else if (msg.t === 'avatar') {
        addPerson(pid, p.nick, msg.avatar);
        broadcast({ t: 'join', ...people.get(pid) }, pid);
      } else if (msg.t === 'pet') {
        if (msg.to === HOST_ID) emit('petted', p);
        else if (people.has(msg.to)) sendTo(msg.to, { t: 'pet', from: pid, to: msg.to });
      } else if (msg.t === 'castAdd' || msg.t === 'castRemove') {
        if (editors.has(pid)) editCast(pid, msg);
      } else if (msg.t === 'bye') {
        dropMember(pid);
      }
    }
    // 방장이 방 캐릭터를 바꾸고 모두에게 알린다.
    function editCast(pid, msg) {
      let change = null;
      if (msg.t === 'castAdd') {
        if (!msg.item || !msg.item.id || cast.length >= MAX_CAST) return;
        const item = castItem(msg.item, pid);
        cast = [...cast, item];
        change = { nick: nickOf(pid), added: item };
      } else {
        const item = cast.find((c) => c.key === msg.key);
        if (!item) return;
        cast = cast.filter((c) => c !== item);
        change = { nick: nickOf(pid), removed: item };
      }
      emit('cast', cast, change);
      broadcast({ t: 'cast', cast, change: { by: pid, added: change.added && change.added.key, removed: change.removed && change.removed.key } });
    }
    function dropMember(pid) {
      const l = links.get(pid);
      if (!l) return;
      links.delete(pid);
      l.close();
      removePerson(pid);
      broadcast({ t: 'leave', pid });
    }

    // ---------- 동료(멤버) ----------
    function memberMessage(msg) {
      if (msg.t === 'welcome') {
        myId = String(msg.you);
        changed();
      } else if (msg.t === 'join') {
        if (msg.pid === myId) return;
        addPerson(String(msg.pid), msg.nick, msg.avatar);
      } else if (msg.t === 'leave') {
        removePerson(msg.pid);
      } else if (msg.t === 'say') {
        const p = people.get(msg.from);
        const text = cleanText(msg.text);
        if (p && text) emit('say', p, text);
      } else if (msg.t === 'pet') {
        const p = people.get(msg.from);
        if (p && msg.to === myId) emit('petted', p);
      } else if (msg.t === 'cast') {
        if (!Array.isArray(msg.cast)) return;
        const before = cast;
        cast = msg.cast.filter((c) => c && typeof c.id === 'string' && typeof c.key === 'string').slice(0, MAX_CAST);
        let change = null;
        if (msg.change) {
          const added = msg.change.added && cast.find((c) => c.key === msg.change.added);
          const removed = msg.change.removed && before.find((c) => c.key === msg.change.removed);
          if (added || removed) change = { nick: nickOf(msg.change.by), added: added || undefined, removed: removed || undefined };
        }
        emit('cast', cast, change);
      } else if (msg.t === 'perm') {
        editors.clear();
        for (const pid of Array.isArray(msg.editors) ? msg.editors : []) editors.add(String(pid));
        setPerm(editors.has(myId));
        changed();
      } else if (msg.t === 'bye') {
        finish(msg.reason === 'full' || msg.reason === 'kicked' ? msg.reason : 'host-left');
      }
    }

    function finish(reason) {
      if (closed) return;
      closed = true;
      if (leaving) reason = 'left';
      if (pending) pending.link.close();
      for (const l of links.values()) l.close();
      links.clear();
      if (hostLink) hostLink.close();
      for (const p of list()) removePerson(p.pid);
      emit('closed', reason);
    }

    const room = {
      get role() { return role; },
      get myId() { return myId; },
      get closed() { return closed; },
      people: () => [self(), ...list()].map((p) => ({ ...p, editor: p.pid === HOST_ID || editors.has(p.pid) })),
      cast: () => cast,
      get canEdit() { return canEdit; },
      MAX_CAST,

      // 방장: 방을 연다 (아직 아무도 없다).
      // startCast: 방장의 지금 테마 캐릭터들
      open(startCast = []) {
        role = 'host';
        myId = HOST_ID;
        canEdit = true;
        cast = startCast.slice(0, MAX_CAST).map((c) => castItem(c, HOST_ID));
        changed();
        emit('cast', cast, null);
        emit('perm', true);
      },
      // 방장: 꾸미기 권한을 주거나 거둔다.
      grant(pid, on) {
        if (role !== 'host' || !people.has(pid)) return;
        if (on) editors.add(pid);
        else editors.delete(pid);
        broadcast({ t: 'perm', editors: [...editors] });
        changed();
      },
      // 방 캐릭터 데려오기 / 빼기 (방장 또는 권한 받은 사람)
      addCast(item) {
        if (!canEdit || closed) return false;
        if (cast.length >= MAX_CAST) return false;
        if (role === 'host') editCast(HOST_ID, { t: 'castAdd', item });
        else hostLink.send({ t: 'castAdd', item });
        return true;
      },
      removeCast(key) {
        if (!canEdit || closed) return;
        if (role === 'host') editCast(HOST_ID, { t: 'castRemove', key });
        else hostLink.send({ t: 'castRemove', key });
      },
      // 방장: 한 사람을 위한 초대 코드. 답장을 받기 전에 다시 만들면 앞의 초대는 버린다.
      async invite() {
        if (pending) pending.link.close();
        if (people.size + 1 >= MAX_PEOPLE) throw new V().VisitError(`방에는 ${MAX_PEOPLE}명까지 들어올 수 있어요.`);
        nextMember += 1;
        const pid = `m${nextMember}`;
        const entry = { pid, link: null };
        entry.link = makeLink({
          onOpen: () => {
            if (pending === entry) pending = null;
            links.set(pid, entry.link);
          },
          onMessage: (msg) => hostMessage(pid, msg),
          onClose: () => {
            if (pending === entry) pending = null;
            if (!closed && links.has(pid)) dropMember(pid);
          },
        });
        pending = entry;
        return entry.link.invite(cleanNick(me().nick));
      },
      // 방장: 답장 코드를 넣으면 그 사람이 들어온다. 돌려주는 값: 상대 이름
      async accept(replyCode) {
        if (!pending) throw new V().VisitError('먼저 초대 코드를 만들어 주세요.');
        const peer = await pending.link.finish(replyCode);
        return peer.nick;
      },

      // 동료: 받은 초대 코드로 답장 코드를 만든다. 방장이 그 코드를 넣으면 들어간다.
      async join(inviteCode) {
        role = 'member';
        hostLink = makeLink({
          onOpen: () => {
            const m = me();
            hostLink.send({ t: 'hello', nick: cleanNick(m.nick), avatar: m.avatar || null });
          },
          onMessage: memberMessage,
          onClose: () => finish('lost'),
        });
        const { reply, peer } = await hostLink.accept(inviteCode, cleanNick(me().nick));
        return { reply, hostNick: peer.nick };
      },

      // 말하기: 내 말을 방 전체에 보낸다.
      say(text) {
        const t = cleanText(text);
        if (!t || closed) return null;
        if (role === 'host') broadcast({ t: 'say', from: HOST_ID, text: t });
        else if (hostLink) hostLink.send({ t: 'say', text: t });
        return t;
      },
      // 다른 사람의 아바타를 쓰다듬었다 → 그 사람 화면의 아바타가 반응한다.
      pet(pid) {
        if (role === 'host') sendTo(pid, { t: 'pet', from: HOST_ID, to: pid });
        else if (hostLink) hostLink.send({ t: 'pet', to: pid });
      },
      // 내 아바타를 바꿨다.
      avatarChanged() {
        const m = self();
        if (role === 'host') broadcast({ t: 'join', pid: HOST_ID, nick: m.nick, avatar: m.avatar });
        else if (hostLink) hostLink.send({ t: 'avatar', avatar: m.avatar });
        changed();
      },
      // 나가기. 방장이 나가면 방이 닫힌다.
      leave() {
        leaving = true;
        if (role === 'host') broadcast({ t: 'bye' });
        else if (hostLink) hostLink.send({ t: 'bye' });
        // 인사가 전해질 틈을 조금 준다.
        setTimeout(() => finish('left'), 200);
      },
      // 방장이 자기 쪽에서 동료를 내보낸다 (그 동료 아바타의 👋 돌려보내기).
      kick(pid) {
        if (role !== 'host') return;
        sendTo(pid, { t: 'bye', reason: 'kicked' });
        setTimeout(() => dropMember(pid), 200);
      },
    };
    return room;
  }

  const api = { createRoom, HOST_ID, MAX_PEOPLE, MAX_CAST };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HW40_ROOM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
