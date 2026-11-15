// The DOM HUD: health, ammo, money, clock, scores, bomb, kill feed, buy menu and
// overlays. It never touches the simulation; main.js pushes numbers in. Values
// are cached so the DOM is only written when something actually changes.
const OVERLAY = {
  start: { title: 'Emberline', copy: 'Round-based tactics on Foundry Yard. Hold the sites, or take them. First to five rounds wins.', action: 'Click to play' },
  paused: { title: 'Emberline', copy: 'Paused. Click to resume.', action: 'Click to resume' },
};

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

  function set(key, element, value, suffix = '') {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value + suffix;
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
      timerValue.classList.toggle('urgent', planted || s <= 15);
    },
    setScore(def, atk) { set('def', scoreDef, def); set('atk', scoreAtk, atk); },
    setRound(value) { set('round', roundValue, value); },
    setKills(value) { set('kills', killsValue, value); },
    setGrenades(value) { set('grenades', grenadesValue, value); },
    setBomb(text, urgent) {
      set('bomb', bombStatus, text);
      bombStatus.classList.toggle('urgent', Boolean(urgent));
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
      const row = document.createElement('div');
      row.textContent = text;
      killfeed.prepend(row);
      while (killfeed.children.length > 4) killfeed.lastChild.remove();
      setTimeout(() => row.classList.add('fade'), 4200);
      setTimeout(() => row.remove(), 5200);
    },
    banner(text, holdMs = 2600) {
      bannerEl.textContent = text;
      bannerEl.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { bannerEl.hidden = true; }, holdMs);
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
    hideBuy() { buyMenu.hidden = true; },
    isBuyOpen() { return !buyMenu.hidden; },
    showOverlay(mode, scoreText) {
      if (mode === 'end') {
        title.textContent = scoreText.won ? 'Match won' : 'Match lost';
        copy.textContent = scoreText.detail;
        play.textContent = 'Play again';
      } else {
        const text = OVERLAY[mode];
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
