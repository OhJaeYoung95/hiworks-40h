// 캐릭터 팩 애니메이션 재생기. 엔진이 보낸 트리거(상태)에 맞는 프레임을 보여준다.
// 하이웍스 화면(mascot.js)과 작업 화면(studio.html)이 같이 쓴다.
(function (root) {
  // 트리거마다 팩에 그 애니메이션이 없을 때 대신 재생할 순서
  const FALLBACKS = {
    idle: ['idle'],
    walk: ['walk', 'idle'],
    hurry: ['hurry', 'walk', 'idle'],
    flee: ['flee', 'hurry', 'walk', 'idle'],
    chase: ['chase', 'hurry', 'walk', 'idle'],
    celebrate: ['celebrate', 'hop', 'idle'],
    rest: ['rest', 'idle'],
    hop: ['hop', 'idle'],
    click: ['click', 'hop', 'idle'],
    meet: ['meet', 'idle'],
  };

  // 팩 애니메이션 재생기. 상태(트리거)를 받아 맞는 프레임을 보여준다.
  function createSpriteRenderer(pack, el) {
    let current = null;
    let startedAt = 0;
    let frameShown = -1;

    const pick = (state, dir) => {
      for (const name of FALLBACKS[state] || [state, 'idle']) {
        // 왼쪽을 볼 때 쓸 그림이 따로 있으면 (예: walk_left) 그걸 쓴다.
        if (dir < 0 && pack.animations[`${name}_left`]) return { name: `${name}_left`, mirrored: false };
        if (pack.animations[name]) return { name, mirrored: true };
      }
      return { name: 'idle', mirrored: true };
    };

    return (state, now, dir) => {
      const { name, mirrored } = pick(state, dir);
      const anim = pack.animations[name];
      if (name !== current) {
        current = name;
        startedAt = now;
        frameShown = -1;
        for (const c of [...el.classList]) if (c.startsWith('motion-')) el.classList.remove(c);
        if (anim.motion && anim.motion !== 'none') el.classList.add(`motion-${anim.motion}`);
        if (anim.sheet) {
          el.style.backgroundImage = `url("${anim.sheet}")`;
          el.style.backgroundSize = `${anim.count * 100}% 100%`;
        } else {
          el.style.backgroundSize = 'contain';
          el.style.backgroundPosition = 'center bottom';
        }
      }
      const count = anim.sheet ? anim.count : anim.frames.length;
      const step = Math.floor(((now - startedAt) / 1000) * anim.fps);
      const i = anim.loop ? step % count : Math.min(step, count - 1);
      if (i !== frameShown) {
        frameShown = i;
        if (anim.sheet) el.style.backgroundPosition = count > 1 ? `${(i / (count - 1)) * 100}% 0` : '0 0';
        else el.style.backgroundImage = `url("${anim.frames[i]}")`;
      }
      // 화면에 그릴 좌우 방향: 정면 그림은 뒤집지 않고, 왼쪽을 보는 그림은 반대로 뒤집는다.
      if (!mirrored || pack.facing === 'front') return 1;
      return pack.facing === 'left' ? -dir : dir;
    };
  }

  const sprite = { FALLBACKS, createSpriteRenderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = sprite;
  else root.HW40_SPRITE = sprite;
})(typeof globalThis !== 'undefined' ? globalThis : this);
