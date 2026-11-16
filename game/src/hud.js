// The DOM HUD: health, ammo, money, timer, score, kill feed, crosshair, hit
// marker, damage direction, plant progress, flash blindness, buy menu and
// overlays. It never touches the simulation; main.js pushes numbers in and
// reads callbacks out.
const COPY = {
  start: {
    title: 'SANDLINE',
    copy: 'Round-based tactical FPS in a desert freight depot. Plant the charge at the Solar Array or the Warehouse Yard, or wipe the Jackals. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'SANDLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  win: {
    title: 'Sandline takes the match',
    copy: 'The depot is yours.',
    action: 'Play again',
  },
  lose: {
    title: 'Jackals take the match',
    copy: 'The depot stays theirs — for now.',
    action: 'Play again',
  },
};

const BUY_ITEMS = [
  { id: 'rifle', name: 'Longshot-55 Rifle', desc: 'Auto · 25 rounds · 3 hits to drop', price: 2700, key: '1' },
  { id: 'smg', name: 'Dune-9 SMG', desc: 'Auto · 30 rounds · fast and close', price: 1200, key: '2' },
  { id: 'shotgun', name: 'Breacher-12', desc: 'Pump · 6 shells · 8 pellets each', price: 1800, key: '3' },
  { id: 'pistol', name: 'Kestrel-9 Sidearm', desc: 'Semi-auto · 12 rounds · always yours', price: 0, key: '4' },
  { id: 'frag', name: 'Spark Grenade', desc: 'Thrown · big blast · G to throw', price: 300, key: '5' },
  { id: 'flash', name: 'Dazzler Flash', desc: 'Thrown · blinds bots · H to throw', price: 200, key: '6' },
  { id: 'armor', name: 'Plate Armor', desc: 'Soaks half of every hit', price: 650, key: '7' },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const banner = $('banner');
  const bannerText = $('banner-text');
  const bannerSub = $('banner-sub');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorFill = $('armor-fill');
  const armorRow = $('armor-row');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const feed = $('feed');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damageDir = $('damage-dir');
  const progressWrap = $('progress-wrap');
  const progressLabel = $('progress-label');
  const progressFill = $('progress-fill');
  const bombStatus = $('bomb-status');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const damageFlash = $('damage-flash');
  const flashWhite = $('flash-white');
  const nades = $('nades');

  let hitTimer = 0;
  let last = {};
  let buyOpen = false;
  let onBuy = null;

  // Build the buy menu once.
  for (const item of BUY_ITEMS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-item';
    row.dataset.id = item.id;
    row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}<small>${item.desc}</small></span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => {
      if (onBuy) onBuy(item.id);
    });
    buyList.appendChild(row);
  }

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp, armor) {
      healthFill.style.width = `${Math.max(0, hp)}%`;
      setText(healthNum, String(Math.max(0, Math.ceil(hp))), 'hp');
      armorRow.style.display = armor > 0 ? 'flex' : 'none';
      armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'res');
      setText(weaponName, name, 'wname');
    },
    setMoney(value) {
      setText(moneyValue, `$${value}`, 'money');
      setText(buyMoney, `$${value}`, 'buymoney');
    },
    setNades(frag, flash) {
      const parts = [];
      if (frag > 0) parts.push(`◉ ${frag}`);
      if (flash > 0) parts.push(`✦ ${flash}`);
      setText(nades, parts.join('  '), 'nades');
    },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      setText(timerValue, `${mm}:${ss}`, 'timer');
      timerValue.classList.toggle('danger', planted || s <= 10);
    },
    setScore(san, jac, round) {
      setText(scoreValue, `SAN ${san} — ${jac} JAC · R${round}`, 'score');
    },
    setBombStatus(text) {
      setText(bombStatus, text, 'bomb');
      bombStatus.classList.toggle('planted', text.includes('PLANTED'));
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFrom(angleDeg) {
      damageDir.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
      damageDir.classList.remove('show');
      void damageDir.offsetWidth;
      damageDir.classList.add('show');
    },
    flashDamage() {
      damageFlash.classList.remove('show');
      void damageFlash.offsetWidth;
      damageFlash.classList.add('show');
    },
    setFlashBlind(frac) {
      flashWhite.style.opacity = frac > 0 ? String(Math.min(1, frac)) : '0';
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setProgress(label, frac) {
      if (!label) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      setText(progressLabel, label, 'plabel');
      progressFill.style.width = `${Math.round(frac * 100)}%`;
    },
    killfeed(text, good) {
      const line = document.createElement('div');
      line.className = good ? 'feed-line good' : 'feed-line';
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(text, sub) {
      bannerText.textContent = text;
      bannerSub.textContent = sub || '';
      banner.hidden = false;
      clearTimeout(this._bannerTimer);
      this._bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, 3000);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    setBuyOpen(open) {
      buyOpen = open;
      buyMenu.hidden = !open;
    },
    isBuyOpen() {
      return buyOpen;
    },
    setBuyAffordability(money, owned) {
      for (const row of buyList.children) {
        const item = BUY_ITEMS.find((b) => b.id === row.dataset.id);
        const isOwned = item.id === 'pistol' || item.id === 'rifle' || item.id === 'smg' || item.id === 'shotgun'
          ? owned.has(item.id)
          : false;
        row.classList.toggle('owned', isOwned);
        row.classList.toggle('cant', !isOwned && money < item.price);
        row.querySelector('.buy-price').textContent = isOwned ? 'OWNED' : `$${item.price}`;
      }
    },
    onBuy(handler) {
      onBuy = handler;
    },
    pressBuyKey(key) {
      const item = BUY_ITEMS.find((b) => b.key === key);
      if (item && onBuy) onBuy(item.id);
    },
  };
}
