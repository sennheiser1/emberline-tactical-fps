// The DOM HUD: health, ammo, money, clock, scores, bomb, kill feed, buy menu and
// overlays. It never touches the simulation; main.js pushes numbers in. Values
// are cached so the DOM is only written when something actually changes.
// drawShot paints the same HUD onto a 2D canvas for staged captures, which the
// WebGL canvas alone cannot carry: same values, same layout, same palette.
const OVERLAY = {
  start: { title: 'Emberline', copy: 'Round-based tactics on Foundry Yard. Hold the sites, or take them. First to five rounds wins.', action: 'Click to play' },
  paused: { title: 'Emberline', copy: 'Paused. Click to resume.', action: 'Click to resume' },
};
const INK = '#e9e6df';
const MUTED = '#98a0a8';
const ACCENT = '#f0a830';
const SURFACE = '#1e2228';
const HAIRLINE = '#2c323a';
const DIM = 'rgba(20, 22, 26, .72)';
const PANEL = 'rgba(20, 22, 26, .94)';
const CONTROLS = [
  [['W A S D', true], [' move   ', false], ['Mouse', true], [' look   ', false], ['Click', true], [' fire', false]],
  [['R', true], [' reload   ', false], ['Q', true], [' switch weapon   ', false], ['Ctrl', true], [' / ', false], ['C', true], [' crouch   ', false], ['Space', true], [' jump', false]],
  [['E', true], [' hold to defuse   ', false], ['G', true], [' throw grenade   ', false], ['B', true], [' buy menu', false]],
];

export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const vignette = el('vignette');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const healthBar = el('health-bar');
  const healthValue = el('health-value');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const scoreDef = el('score-def');
  const scoreAtk = el('score-atk');
  const roundValue = el('round-value');
  const killsValue = el('kills-value');
  const grenadesValue = el('grenades-value');
  const bombStatus = el('bomb-status');
  const killfeed = el('killfeed');
  const bannerEl = el('banner');
  const progressWrap = el('progress-wrap');
  const progressBar = el('progress-bar');
  const progressLabel = el('progress-label');
  const hint = el('interact-hint');
  const buyMenu = el('buy-menu');
  const buyMoney = el('buy-money');
  const buyRows = [el('buy-1'), el('buy-2'), el('buy-3'), el('buy-4')];
  const last = {};
  let hitTimer = 0;
  let bannerTimer = 0;
  let damageTimer = 0;
  let bannerText = '';
  let bannerVisible = false;
  let timerUrgent = false;
  let bombUrgent = false;
  let overlayState = null;
  let buyState = null;
  const feedRows = [];

  function set(key, element, value, suffix = '') {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value + suffix;
  }

  function snapshot() {
    return {
      mag: last.mag ?? 12, reserve: last.reserve ?? 48,
      weapon: last.weapon ?? 'P-9 Sidearm', health: last.health ?? 100,
      money: last.money ?? '$800', timer: last.timer ?? '1:40',
      timerUrgent, def: last.def ?? 0, atk: last.atk ?? 0,
      round: last.round ?? 1, kills: last.kills ?? 0,
      grenades: last.grenades ?? 1, bomb: last.bomb ?? 'Bomb carried',
      bombUrgent, gap: last.gap ?? 6, bannerText, bannerVisible,
      feed: [...feedRows], overlay: overlayState, buy: buyState,
    };
  }

  function drawShot(ctx, w, h, shot) {
    const s = snapshot();
    const cx = w / 2;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    // Crosshair: four ticks around the centre, gap from the bloom state.
    ctx.fillStyle = INK;
    const g = s.gap;
    ctx.fillRect(cx - g - 7, h / 2 - 1, 7, 2);
    ctx.fillRect(cx + g, h / 2 - 1, 7, 2);
    ctx.fillRect(cx - 1, h / 2 - g - 7, 2, 7);
    ctx.fillRect(cx - 1, h / 2 + g, 2, 7);
    // Top bar, centred: scores, clock, round, kills, bomb.
    const parts = [
      { text: `DEF ${s.def}`, font: '15px system-ui, sans-serif', color: INK },
      { text: s.timer, font: '22px system-ui, sans-serif', color: s.timerUrgent ? ACCENT : INK },
      { text: `ATK ${s.atk}`, font: '15px system-ui, sans-serif', color: INK },
      { text: `Round ${s.round}`, font: '15px system-ui, sans-serif', color: INK },
      { text: `Kills ${s.kills}`, font: '15px system-ui, sans-serif', color: INK },
      { text: s.bomb, font: '15px system-ui, sans-serif', color: s.bombUrgent ? ACCENT : MUTED },
    ];
    const gap = 22;
    let total = -gap;
    for (const p of parts) { ctx.font = p.font; total += ctx.measureText(p.text).width + gap; }
    let x = cx - total / 2;
    ctx.textAlign = 'left';
    for (const p of parts) {
      ctx.font = p.font;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, 32);
      x += ctx.measureText(p.text).width + gap;
    }
    // Kill feed, top right, newest first.
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    s.feed.forEach((row, i) => ctx.fillText(row, w - 18, 78 + i * 17));
    // Health and money, bottom left.
    const trackY = h - 66;
    ctx.fillStyle = HAIRLINE;
    ctx.fillRect(18, trackY, 240, 8);
    ctx.fillStyle = s.health <= 30 ? ACCENT : INK;
    ctx.fillRect(18, trackY, Math.max(0, 240 * s.health / 100), 8);
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.fillText('Health', 18, trackY + 28);
    ctx.fillText('Money', 18, trackY + 48);
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(String(s.health), 258, trackY + 28);
    ctx.fillText(s.money, 258, trackY + 48);
    // Weapon and ammo, bottom right.
    ctx.textAlign = 'right';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(s.weapon.toUpperCase(), w - 18, h - 78);
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillStyle = s.mag === 0 ? ACCENT : INK;
    const reserveText = ` / ${s.reserve}`;
    ctx.font = '17px system-ui, sans-serif';
    const reserveW = ctx.measureText(reserveText).width;
    ctx.font = '30px system-ui, sans-serif';
    const magW = ctx.measureText(String(s.mag)).width;
    ctx.fillText(String(s.mag), w - 18 - reserveW, h - 42);
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(reserveText, w - 18, h - 42);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`Grenades ${s.grenades} (G)`, w - 18, h - 20);
    // Round banner.
    if (s.bannerVisible && s.bannerText) {
      ctx.font = '30px system-ui, sans-serif';
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,.7)';
      ctx.shadowBlur = 12;
      ctx.fillText(s.bannerText, cx, Math.round(h * 0.22));
      ctx.shadowBlur = 0;
    }
    // Title panel for the start shot.
    if (shot === 'start' && s.overlay) {
      ctx.fillStyle = DIM;
      ctx.fillRect(0, 0, w, h);
      const pw = 520;
      const ph = 300;
      const px = cx - pw / 2;
      const py = h / 2 - ph / 2;
      ctx.fillStyle = SURFACE;
      ctx.strokeStyle = HAIRLINE;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 12);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.font = '30px system-ui, sans-serif';
      ctx.fillText(s.overlay.title, cx, py + 46);
      ctx.fillStyle = MUTED;
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText('Round-based tactics on Foundry Yard. Hold the sites,', cx, py + 76);
      ctx.fillText('or take them. First to five rounds wins.', cx, py + 96);
      ctx.font = '13px system-ui, sans-serif';
      CONTROLS.forEach((line, li) => {
        let lx = cx;
        let lw = 0;
        for (const [text, bold] of line) {
          ctx.font = `${bold ? '600 ' : ''}13px system-ui, sans-serif`;
          lw += ctx.measureText(text).width;
        }
        lx -= lw / 2;
        ctx.textAlign = 'left';
        for (const [text, bold] of line) {
          ctx.font = `${bold ? '600 ' : ''}13px system-ui, sans-serif`;
          ctx.fillStyle = bold ? INK : MUTED;
          ctx.fillText(text, lx, py + 130 + li * 24);
          lx += ctx.measureText(text).width;
        }
        ctx.textAlign = 'center';
      });
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.roundRect(cx - 78, py + 226, 156, 42, 8);
      ctx.fill();
      ctx.fillStyle = '#1a1405';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(s.overlay.action, cx, py + 253);
    }
    // Buy menu for the buy shot.
    if (shot === 'buy' && s.buy) {
      const b = s.buy;
      const pw = 340;
      const ph = 218;
      const px = cx - pw / 2;
      const py = h / 2 - ph / 2;
      ctx.fillStyle = PANEL;
      ctx.strokeStyle = HAIRLINE;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 10);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillText('Buy menu', px + 20, py + 28);
      ctx.fillStyle = MUTED;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`Money ${b.money} — press 1–4 to buy, B to close.`, px + 20, py + 48);
      const rows = [
        { key: '1', name: 'P-9 Sidearm', price: 'Owned', owned: true, afford: true },
        { key: '2', name: 'K-9 SMG', price: '$1,500', owned: b.owned.smg, afford: b.moneyValue >= 1500 },
        { key: '3', name: 'VK-7 Rifle', price: '$2,500', owned: b.owned.rifle, afford: b.moneyValue >= 2500 },
        { key: '4', name: 'Frag grenade', price: '$300', owned: b.grenades > 0, afford: b.moneyValue >= 300 },
      ];
      rows.forEach((row, i) => {
        const ry = py + 66 + i * 36;
        ctx.strokeStyle = HAIRLINE;
        ctx.beginPath();
        ctx.moveTo(px + 20, ry);
        ctx.lineTo(px + pw - 20, ry);
        ctx.stroke();
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillStyle = ACCENT;
        ctx.fillText(row.key, px + 20, ry + 24);
        ctx.fillStyle = (row.owned || !row.afford) ? MUTED : INK;
        ctx.fillText(row.name, px + 40, ry + 24);
        ctx.textAlign = 'right';
        ctx.fillText(row.owned ? 'Owned' : row.price, px + pw - 20, ry + 24);
        ctx.textAlign = 'left';
      });
    }
    ctx.restore();
  }

  return {
    setAmmo(mag, reserve) {
      set('mag', ammoMag, mag);
      if (last.reserve !== reserve) {
        last.reserve = reserve;
        ammoReserve.textContent = `/ ${reserve}`;
      }
      el('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { set('weapon', weaponName, name); },
    setHealth(value) {
      set('health', healthValue, value);
      if (last.healthBar !== value) {
        last.healthBar = value;
        healthBar.style.width = `${value}%`;
        healthBar.classList.toggle('low', value <= 30);
      }
    },
    setMoney(value) { set('money', moneyValue, `$${value}`); set('buyMoney', buyMoney, `$${value}`); },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      set('timer', timerValue, text);
      timerUrgent = planted || s <= 15;
      timerValue.classList.toggle('urgent', timerUrgent);
    },
    setScore(def, atk) { set('def', scoreDef, def); set('atk', scoreAtk, atk); },
    setRound(value) { set('round', roundValue, value); },
    setKills(value) { set('kills', killsValue, value); },
    setGrenades(value) { set('grenades', grenadesValue, value); },
    setBomb(text, urgent) {
      set('bomb', bombStatus, text);
      bombUrgent = Boolean(urgent);
      bombStatus.classList.toggle('urgent', bombUrgent);
    },
    setCrosshairGap(px) {
      const rounded = Math.round(px);
      if (last.gap === rounded) return;
      last.gap = rounded;
      crosshair.style.setProperty('--gap', `${rounded}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => vignette.classList.remove('on'), 180);
    },
    feed(text) {
      feedRows.unshift(text);
      while (feedRows.length > 4) feedRows.pop();
      const row = document.createElement('div');
      row.textContent = text;
      killfeed.prepend(row);
      while (killfeed.children.length > 4) killfeed.lastChild.remove();
      setTimeout(() => row.classList.add('fade'), 4200);
      setTimeout(() => row.remove(), 5200);
    },
    banner(text, holdMs = 2600) {
      bannerText = text;
      bannerVisible = true;
      bannerEl.textContent = text;
      bannerEl.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { bannerVisible = false; bannerEl.hidden = true; }, holdMs);
    },
    setProgress(value, label) {
      if (value === null) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      progressLabel.textContent = label;
      progressBar.style.width = `${Math.round(value * 100)}%`;
    },
    setHint(text) {
      if (last.hint === text) return;
      last.hint = text;
      hint.textContent = text || '';
      hint.hidden = !text;
    },
    showBuy(money, owned, grenades) {
      buyState = { money: `$${money}`, moneyValue: money, owned, grenades };
      buyMenu.hidden = false;
      set('buyMoney', buyMoney, `$${money}`);
      const states = [
        { owned: owned.pistol, afford: true },
        { owned: owned.smg, afford: money >= 1500 },
        { owned: owned.rifle, afford: money >= 2500 },
        { owned: grenades > 0, afford: money >= 300 },
      ];
      buyRows.forEach((row, i) => {
        row.classList.toggle('owned', states[i].owned);
        row.classList.toggle('poor', !states[i].owned && !states[i].afford);
      });
    },
    hideBuy() { buyState = null; buyMenu.hidden = true; },
    isBuyOpen() { return !buyMenu.hidden; },
    showOverlay(mode, scoreText) {
      if (mode === 'end') {
        overlayState = { title: scoreText.won ? 'Match won' : 'Match lost', copy: scoreText.detail, action: 'Play again' };
        title.textContent = overlayState.title;
        copy.textContent = overlayState.copy;
        play.textContent = overlayState.action;
      } else {
        overlayState = { ...OVERLAY[mode] };
        title.textContent = overlayState.title;
        copy.textContent = overlayState.copy;
        play.textContent = overlayState.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlayState = null; overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    snapshot,
    drawShot,
  };
}
