// 놀러 가기: 동료와 초대 코드를 주고받아 브라우저끼리 직접 연결한다 (WebRTC). 우리 서버는 없다.
// 1) A가 초대 코드(HW40V1)를 만들어 보낸다 → 2) B가 넣고 답장 코드(HW40V2)를 돌려보낸다 → 3) A가 넣으면 연결.
// 연결되면 서로의 대표 캐릭터가 상대 화면에 놀러 가고, 적은 말이 그 캐릭터의 말풍선으로 뜬다.
// 대화는 두 브라우저 사이로만 오가고 어디에도 저장되지 않는다.
// 연결 주소를 알아낼 때만 공개 STUN 서버(구글)에 물어본다. 대화 내용은 거기로 가지 않는다.
(function (root) {
  const INVITE_PREFIX = 'HW40V1.';
  const REPLY_PREFIX = 'HW40V2.';
  const NICK_MAX = 12;
  const TEXT_MAX = 100;
  const CHUNK = 16000; // 데이터 채널 한 번에 보내는 글자 수 (큰 캐릭터 그림은 나눠 보낸다)
  const GATHER_MS = 3000;
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  class VisitError extends Error {}

  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }
  const bytesToB64 = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64ToBytes = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  const cleanNick = (nick) => String(nick || '').replace(/[<>&"]/g, '').trim().slice(0, NICK_MAX) || '동료';
  const cleanText = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX);

  // 연결 정보(SDP)와 이름을 압축해 코드로 만든다.
  async function encodeSignal(prefix, payload) {
    const json = new TextEncoder().encode(JSON.stringify(payload));
    return prefix + bytesToB64(await pipe(json, new CompressionStream('deflate')));
  }

  // expect: 받아야 할 코드 종류. 다른 종류를 넣으면 무엇을 넣어야 하는지 알려준다.
  async function decodeSignal(code, expect) {
    const text = String(code || '').replace(/\s+/g, '');
    const other = expect === INVITE_PREFIX ? REPLY_PREFIX : INVITE_PREFIX;
    if (text.startsWith(other)) {
      throw new VisitError(expect === INVITE_PREFIX
        ? '답장 코드예요. 초대한 사람이 넣는 코드라서, 내가 받은 초대 코드를 넣어 주세요.'
        : '초대 코드예요. 상대가 그 코드를 넣고 돌려준 답장 코드(HW40V2…)를 넣어 주세요.');
    }
    if (!text.startsWith(expect)) {
      throw new VisitError(`${expect === INVITE_PREFIX ? '초대' : '답장'} 코드가 아니에요. "${expect}"로 시작하는 코드를 붙여 넣어 주세요.`);
    }
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(await pipe(b64ToBytes(text.slice(expect.length)), new DecompressionStream('deflate'))));
    } catch {
      throw new VisitError('코드가 깨졌어요. 처음부터 끝까지 다 복사했는지 확인해 주세요.');
    }
    if (!payload || typeof payload.sdp !== 'string') throw new VisitError('코드가 깨졌어요. 처음부터 끝까지 다 복사했는지 확인해 주세요.');
    return { sdp: payload.sdp, nick: cleanNick(payload.nick) };
  }

  // 큰 메시지를 조각내 보낸다. 받는 쪽은 createJoiner로 다시 붙인다.
  let nextId = 0;
  function splitMessage(obj, size = CHUNK) {
    const text = JSON.stringify(obj);
    if (text.length <= size) return [JSON.stringify({ t: 'msg', d: text })];
    const id = (nextId += 1);
    const n = Math.ceil(text.length / size);
    return Array.from({ length: n }, (_, i) => JSON.stringify({ t: 'part', id, i, n, d: text.slice(i * size, (i + 1) * size) }));
  }
  function createJoiner() {
    const pending = new Map();
    return (frame) => {
      if (!frame || typeof frame.d !== 'string') return null;
      if (frame.t === 'msg') return JSON.parse(frame.d);
      if (frame.t !== 'part') return null;
      const parts = pending.get(frame.id) || [];
      parts[frame.i] = frame.d;
      pending.set(frame.id, parts);
      if (parts.filter((p) => typeof p === 'string').length < frame.n) return null;
      pending.delete(frame.id);
      return JSON.parse(parts.join(''));
    };
  }

  // 브라우저끼리의 연결 하나. hooks: onOpen(), onMessage(msg), onClose(reason)
  function createLink(hooks) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const join = createJoiner();
    let channel = null;
    let closed = false;
    const finish = (reason) => {
      if (closed) return;
      closed = true;
      try {
        pc.close();
      } catch {
        // 이미 닫혔다.
      }
      hooks.onClose(reason);
    };
    const bind = (ch) => {
      channel = ch;
      ch.onopen = () => hooks.onOpen();
      ch.onmessage = (e) => {
        let msg = null;
        try {
          msg = join(JSON.parse(e.data));
        } catch {
          return; // 알 수 없는 메시지는 무시한다.
        }
        if (msg) hooks.onMessage(msg);
      };
      ch.onclose = () => finish('closed');
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') finish('failed');
    };
    // 연결 후보(주소)를 다 모을 때까지 기다린다. 오래 걸리면 모은 만큼만 쓴다.
    const gathered = () => new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => pc.iceGatheringState === 'complete' && resolve();
      pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, GATHER_MS);
    });
    return {
      // 초대하는 쪽
      async invite(nick) {
        bind(pc.createDataChannel('hw40'));
        await pc.setLocalDescription(await pc.createOffer());
        await gathered();
        return encodeSignal(INVITE_PREFIX, { sdp: pc.localDescription.sdp, nick: cleanNick(nick) });
      },
      // 초대받은 쪽: 초대 코드를 넣고 답장 코드를 만든다.
      async accept(code, nick) {
        const peer = await decodeSignal(code, INVITE_PREFIX);
        pc.ondatachannel = (e) => bind(e.channel);
        await pc.setRemoteDescription({ type: 'offer', sdp: peer.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered();
        return { reply: await encodeSignal(REPLY_PREFIX, { sdp: pc.localDescription.sdp, nick: cleanNick(nick) }), peer };
      },
      // 초대한 쪽: 답장 코드를 넣으면 연결된다.
      async finish(code) {
        const peer = await decodeSignal(code, REPLY_PREFIX);
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: peer.sdp });
        } catch {
          throw new VisitError('이 답장 코드는 지금 초대에 맞지 않아요. 방금 보낸 초대 코드로 만든 답장인지 확인해 주세요.');
        }
        return peer;
      },
      send(obj) {
        if (!channel || channel.readyState !== 'open') return false;
        for (const frame of splitMessage(obj)) channel.send(frame);
        return true;
      },
      close: () => finish('local'),
    };
  }

  const visit = {
    INVITE_PREFIX, REPLY_PREFIX, NICK_MAX, TEXT_MAX, VisitError,
    encodeSignal, decodeSignal, splitMessage, createJoiner, createLink, cleanNick, cleanText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = visit;
  else root.HW40_VISIT = visit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
