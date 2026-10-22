/* Storm Run: a 45-second teaser voyage for the Curse of Scully website.
   Steer through the storm, grab supply drops, dodge rocks and the Kraken. */
(function () {
  'use strict';
  var root = document.getElementById('storm-run');
  if (!root) return;

  var canvas = root.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var startPanel = root.querySelector('.sr-start');
  var endPanel = root.querySelector('.sr-end');
  var soundBtn = root.querySelector('[data-sr="sound"]');
  var out = {
    title: root.querySelector('[data-sr="title"]'),
    score: root.querySelector('[data-sr="score"]'),
    best: root.querySelector('[data-sr="best"]'),
    msg: root.querySelector('[data-sr="msg"]')
  };
  var base = root.getAttribute('data-assets') || 'assets/game/';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 480, H = 640, DUR = 45, SHIP_Y = 520;
  var KRAKEN_FRAMES = 14, KRAKEN_FW = 200, KRAKEN_FH = 132;

  /* ---------- assets ---------- */
  var IMG = {};
  ['crate', 'barrel', 'chest', 'rock1', 'rock2', 'kraken'].forEach(function (n) {
    var im = new Image();
    im.src = base + n + '.webp';
    IMG[n] = im;
  });
  function ready(im) { return im && im.complete && im.naturalWidth > 0; }

  /* ---------- best score ---------- */
  var BEST_KEY = 'scully-storm-run-best';
  function getBest() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
  function setBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} }

  /* ---------- sound (WebAudio, made on the fly) ---------- */
  var audio = null, soundOn = true, rainNode = null;
  function initAudio() {
    if (audio) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { audio = new AC(); } catch (e) { audio = null; }
  }
  function noiseBuffer(sec) {
    var len = Math.floor(audio.sampleRate * sec), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function tone(freq, start, dur, vol, type) {
    var o = audio.createOscillator(), g = audio.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(start); o.stop(start + dur + 0.05);
  }
  function noise(sec, filterFreq, vol, attack, type) {
    var s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain(), t = audio.currentTime;
    s.buffer = noiseBuffer(sec); f.type = type || 'lowpass'; f.frequency.value = filterFreq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    s.connect(f); f.connect(g); g.connect(audio.destination);
    s.start(t);
  }
  var sfx = {
    pickup: function () { var t = audio.currentTime; tone(660, t, 0.18, 0.12); tone(990, t + 0.07, 0.22, 0.1); },
    chest: function () { var t = audio.currentTime; tone(523, t, 0.2, 0.12); tone(659, t + 0.08, 0.2, 0.12); tone(784, t + 0.16, 0.2, 0.12); tone(1047, t + 0.24, 0.35, 0.1); },
    hit: function () {
      noise(0.45, 520, 0.45, 0.01);
      var t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(70, t + 0.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.65);
    },
    thunder: function () { noise(2.4, 260, 0.5, 0.06); },
    end: function (win) {
      var t = audio.currentTime;
      if (win) { tone(392, t, 0.25, 0.1); tone(523, t + 0.15, 0.25, 0.1); tone(659, t + 0.3, 0.5, 0.1); }
      else { tone(330, t, 0.3, 0.1, 'triangle'); tone(262, t + 0.2, 0.5, 0.1, 'triangle'); }
    }
  };
  function play(name, arg) { if (audio && soundOn) { try { sfx[name](arg); } catch (e) {} } }
  function startRain() {
    if (!audio || !soundOn || rainNode) return;
    var s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    s.buffer = noiseBuffer(2); s.loop = true; f.type = 'highpass'; f.frequency.value = 1400; g.gain.value = 0.035;
    s.connect(f); f.connect(g); g.connect(audio.destination); s.start();
    rainNode = s;
  }
  function stopRain() { if (rainNode) { try { rainNode.stop(); } catch (e) {} rainNode = null; } }
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
    if (!soundOn) stopRain(); else if (state === 'play') { initAudio(); startRain(); }
  });

  /* ---------- canvas sizing ---------- */
  var scale = 1;
  function resize() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.width * dpr * H / W);
    scale = canvas.width / W;
  }
  window.addEventListener('resize', resize);

  /* ---------- world ---------- */
  var state = 'ready', t = 0, scroll = 0, score = 0, hull = 3, invuln = 0, shake = 0;
  var ship, objs, texts, wake, crests, drops, bolt, flash, nextBolt, wind, windTarget, nextGust;
  var spawnObs, spawnPick, lastObsX = -999, paused = false, visible = true;

  function reset() {
    t = 0; scroll = 0; score = 0; hull = 3; invuln = 0; shake = 0;
    ship = { x: W / 2, vx: 0, tilt: 0 };
    objs = []; texts = []; wake = [];
    bolt = null; flash = 0; nextBolt = 2.5; wind = 0; windTarget = 0; nextGust = 3;
    spawnObs = 1.2; spawnPick = 0.6; lastObsX = -999;
  }
  function seedScenery() {
    crests = [];
    for (var i = 0; i < 70; i++) crests.push({ x: Math.random() * W, y: Math.random() * H, len: 14 + Math.random() * 30, a: 0.05 + Math.random() * 0.12, k: 0.6 + Math.random() * 0.6 });
    drops = [];
    for (var j = 0; j < 150; j++) drops.push({ x: Math.random() * W, y: Math.random() * H, len: 10 + Math.random() * 16, v: 700 + Math.random() * 500 });
  }
  reset(); seedScenery();

  /* ---------- input ---------- */
  var keyDir = 0, keys = {}, pointerX = null;
  function toWorldX(e) { var r = canvas.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W; }
  canvas.addEventListener('pointerdown', function (e) { pointerX = toWorldX(e); if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (er) {} } });
  canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) pointerX = toWorldX(e); });
  canvas.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') pointerX = null; });
  canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') pointerX = null; });
  window.addEventListener('keydown', function (e) {
    if (state !== 'play') return;
    var k = e.key;
    if (paused && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'A' || k === 'd' || k === 'D' || k === ' ')) { resume(); e.preventDefault(); }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.l = 1; e.preventDefault(); }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.r = 1; e.preventDefault(); }
    keyDir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.l = 0;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.r = 0;
    keyDir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
  });

  /* ---------- game flow ---------- */
  function start() {
    initAudio();
    if (audio && audio.state === 'suspended') audio.resume();
    reset();
    state = 'play';
    startPanel.hidden = true; endPanel.hidden = true;
    paused = false;
    startRain();
    canvas.focus({ preventScroll: true });
    var r = root.getBoundingClientRect();
    if (r.top < 64 || r.bottom > window.innerHeight) {
      try { root.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { root.scrollIntoView(); }
    }
  }
  function resume() { if (!paused || state !== 'play') return; paused = false; startRain(); }
  function pause() { if (state === 'play') paused = true; stopRain(); }
  function finish(win) {
    state = 'over';
    stopRain();
    play('end', win);
    if (win) score += hull * 25;
    var best = getBest(), isBest = score > best;
    if (isBest) setBest(score);
    out.title.textContent = win ? 'Land ho! You made port.' : 'Your ship went down!';
    out.score.textContent = String(score);
    out.best.textContent = isBest && score > 0 ? 'New best!' : 'Best: ' + Math.max(best, score);
    out.msg.textContent = win
      ? 'You beat the storm with ' + hull + ' hull ' + (hull === 1 ? 'plank' : 'planks') + ' to spare. In the full game you build a harbour, raise a fleet and sail against real captains.'
      : 'The storm won this time. In the full game your shipwrights can repair the hull, and a whole ocean is waiting.';
    endPanel.hidden = false;
  }
  root.querySelectorAll('[data-sr="start"]').forEach(function (b) { b.addEventListener('click', start); });

  /* ---------- spawning ---------- */
  function progress() { return Math.min(1, t / DUR); }
  function speed() { return 170 + 170 * progress(); }
  function spawnObstacle() {
    var p = progress(), x, tries = 0;
    do { x = 50 + Math.random() * (W - 100); tries++; } while (Math.abs(x - lastObsX) < 110 && tries < 8);
    lastObsX = x;
    if (t > 9 && Math.random() < 0.18 + 0.2 * p) {
      objs.push({ type: 'kraken', x: x, y: -90, r: 44, phase: Math.random() * 6.28, frame: Math.random() * KRAKEN_FRAMES, w: 150 });
    } else {
      var big = Math.random() < 0.55;
      objs.push({ type: big ? 'rock1' : 'rock2', x: x, y: -80, r: big ? 34 : 24, w: big ? 104 : 62 });
    }
  }
  function spawnPickup() {
    var r = Math.random(), x = 40 + Math.random() * (W - 80);
    var type = r < 0.1 ? 'chest' : r < 0.45 ? 'barrel' : 'crate';
    objs.push({ type: type, x: x, y: -50, r: 22, w: type === 'chest' ? 50 : 44, phase: Math.random() * 6.28, pickup: true });
  }

  /* ---------- update ---------- */
  function update(dt) {
    var p = progress();
    if (state === 'play') t += dt;
    var sp = state === 'play' ? speed() : 120;
    scroll += sp * dt;

    // wind: gentle sway that gets gustier as the storm builds
    nextGust -= dt;
    if (nextGust <= 0) { windTarget = (Math.random() * 2 - 1) * (40 + 110 * p); nextGust = 2 + Math.random() * 3; }
    wind += (windTarget - wind) * Math.min(1, dt * 1.2);

    // ship
    if (state === 'play') {
      var ax = 0;
      if (keyDir) ax = keyDir * 1500;
      else if (pointerX !== null) ax = (pointerX - ship.x) * 14 - ship.vx * 4;
      ship.vx += (ax + wind * 2.2) * dt;
      ship.vx *= Math.pow(0.08, dt);
      ship.x += ship.vx * dt;
      if (ship.x < 28) { ship.x = 28; ship.vx = 0; }
      if (ship.x > W - 28) { ship.x = W - 28; ship.vx = 0; }
    } else {
      ship.x += (W / 2 + Math.sin(scroll / 140) * 40 - ship.x) * Math.min(1, dt * 2);
      ship.vx = Math.cos(scroll / 140) * 30;
    }
    ship.tilt = Math.max(-0.35, Math.min(0.35, ship.vx / 900));

    // wake foam
    if (Math.random() < 0.9) wake.push({ x: ship.x + (Math.random() - 0.5) * 14 - Math.sin(ship.tilt) * 40, y: SHIP_Y + 40, r: 3 + Math.random() * 3, life: 1 });
    for (var i = wake.length - 1; i >= 0; i--) { var w = wake[i]; w.y += sp * dt; w.r += dt * 10; w.life -= dt * 1.1; if (w.life <= 0) wake.splice(i, 1); }

    // scenery
    crests.forEach(function (c) { c.y += sp * c.k * dt; c.x += wind * 0.15 * dt; if (c.y > H + 20) { c.y = -20; c.x = Math.random() * W; } if (c.x < -40) c.x += W + 80; if (c.x > W + 40) c.x -= W + 80; });
    drops.forEach(function (d) { d.y += d.v * dt; d.x += wind * 2.4 * dt; if (d.y > H) { d.y = -20; d.x = Math.random() * W; } if (d.x < -20) d.x += W + 40; if (d.x > W + 20) d.x -= W + 40; });

    // lightning
    nextBolt -= dt;
    if (nextBolt <= 0) {
      nextBolt = (state === 'play' ? 6 - 3 * p : 7) + Math.random() * 3;
      if (!reduce) { flash = 1; bolt = makeBolt(); }
      if (state === 'play') setTimeout(function () { play('thunder'); }, 250);
    }
    flash = Math.max(0, flash - dt * 2.6);

    if (state !== 'play') return;

    // spawns
    spawnObs -= dt; spawnPick -= dt;
    if (spawnObs <= 0) { spawnObstacle(); spawnObs = 1.15 - 0.55 * p + Math.random() * 0.35; }
    if (spawnPick <= 0) { spawnPickup(); spawnPick = 0.55 + Math.random() * 0.5; }

    invuln = Math.max(0, invuln - dt);
    shake = Math.max(0, shake - dt * 3);

    for (var j = objs.length - 1; j >= 0; j--) {
      var o = objs[j];
      o.y += sp * dt;
      if (o.type === 'kraken') { o.x += Math.sin(t * 1.4 + o.phase) * 55 * dt; o.frame = (o.frame + dt * 10) % KRAKEN_FRAMES; o.y -= sp * 0.25 * dt; }
      if (o.y > H + 120) { objs.splice(j, 1); continue; }
      // ship hit circles: bow, middle, stern
      for (var s = -1; s <= 1; s++) {
        var sx = ship.x + Math.sin(ship.tilt) * s * -30, sy = SHIP_Y + s * 30;
        // generous with supplies, forgiving with hazards
        var dx = o.x - sx, dy = o.y - sy, rr = o.r + (o.pickup ? 18 : 8);
        if (dx * dx + dy * dy < rr * rr) {
          if (o.pickup) {
            var pts = o.type === 'chest' ? 50 : o.type === 'barrel' ? 15 : 10;
            score += pts;
            texts.push({ x: o.x, y: o.y, text: '+' + pts, life: 1, gold: o.type === 'chest' });
            play(o.type === 'chest' ? 'chest' : 'pickup');
            objs.splice(j, 1);
          } else if (invuln <= 0) {
            hull -= 1; invuln = 1.4; shake = 1;
            texts.push({ x: ship.x, y: SHIP_Y - 60, text: o.type === 'kraken' ? 'Kraken!' : 'Crunch!', life: 1, bad: true });
            play('hit');
            if (hull <= 0) { finish(false); return; }
          }
          break;
        }
      }
    }
    for (var k = texts.length - 1; k >= 0; k--) { texts[k].y -= 50 * dt; texts[k].life -= dt * 1.2; if (texts[k].life <= 0) texts.splice(k, 1); }

    if (t >= DUR) finish(true);
  }

  function makeBolt() {
    var pts = [], x = 60 + Math.random() * (W - 120), y = 0;
    while (y < H * 0.55) { pts.push([x, y]); x += (Math.random() - 0.5) * 70; y += 30 + Math.random() * 40; }
    return pts;
  }

  /* ---------- drawing ---------- */
  function drawSea() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b2c38'); g.addColorStop(0.55, '#0f3d4b'); g.addColorStop(1, '#0a2731');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // slow swells
    for (var i = 0; i < 4; i++) {
      var sy = ((scroll * 0.5 + i * 210) % (H + 300)) - 150, sx = W * (0.2 + 0.6 * ((i * 0.37) % 1));
      var rg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 220);
      rg.addColorStop(0, 'rgba(44,138,138,0.22)'); rg.addColorStop(1, 'rgba(44,138,138,0)');
      ctx.fillStyle = rg; ctx.fillRect(sx - 220, sy - 220, 440, 440);
    }
    ctx.lineCap = 'round';
    crests.forEach(function (c) {
      ctx.strokeStyle = 'rgba(220,240,240,' + c.a + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(c.x - c.len / 2, c.y); ctx.quadraticCurveTo(c.x, c.y - 5, c.x + c.len / 2, c.y); ctx.stroke();
    });
  }
  function drawSprite(im, x, y, w, rot) {
    if (!ready(im)) return;
    var h = w * im.naturalHeight / im.naturalWidth;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
  }
  function drawObjects() {
    objs.forEach(function (o) {
      if (o.pickup) {
        var bob = Math.sin(t * 3 + o.phase);
        ctx.fillStyle = 'rgba(255,214,140,0.18)';
        ctx.beginPath(); ctx.ellipse(o.x, o.y + 14, o.w * 0.55, o.w * 0.2, 0, 0, 6.283); ctx.fill();
        drawSprite(IMG[o.type], o.x, o.y + bob * 3, o.w, bob * 0.08);
      } else if (o.type === 'kraken') {
        if (ready(IMG.kraken)) {
          var f = Math.floor(o.frame), h = o.w * KRAKEN_FH / KRAKEN_FW;
          ctx.drawImage(IMG.kraken, f * KRAKEN_FW, 0, KRAKEN_FW, KRAKEN_FH, o.x - o.w / 2, o.y - h / 2, o.w, h);
        }
      } else {
        ctx.fillStyle = 'rgba(230,245,245,0.25)';
        ctx.beginPath(); ctx.ellipse(o.x, o.y + o.r * 0.5, o.w * 0.55, o.w * 0.22, 0, 0, 6.283); ctx.fill();
        drawSprite(IMG[o.type], o.x, o.y, o.w);
      }
    });
  }
  function drawWake() {
    wake.forEach(function (w) {
      ctx.fillStyle = 'rgba(235,248,248,' + (w.life * 0.35) + ')';
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 6.283); ctx.fill();
    });
  }
  function drawShip() {
    if (invuln > 0 && Math.floor(invuln * 10) % 2 === 0) return;
    ctx.save();
    ctx.translate(ship.x, SHIP_Y);
    ctx.rotate(ship.tilt);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(6, 8, 20, 50, 0, 0, 6.283); ctx.fill();
    // hull
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.bezierCurveTo(16, -36, 19, -10, 18, 10);
    ctx.bezierCurveTo(17, 30, 14, 40, 12, 46);
    ctx.lineTo(-12, 46);
    ctx.bezierCurveTo(-14, 40, -17, 30, -18, 10);
    ctx.bezierCurveTo(-19, -10, -16, -36, 0, -52);
    var hg = ctx.createLinearGradient(-18, 0, 18, 0);
    hg.addColorStop(0, '#3f2512'); hg.addColorStop(0.5, '#7a4b25'); hg.addColorStop(1, '#3f2512');
    ctx.fillStyle = hg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#24130a'; ctx.stroke();
    // deck
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.bezierCurveTo(11, -30, 13, -8, 12.5, 10);
    ctx.bezierCurveTo(12, 28, 10, 36, 8.5, 41);
    ctx.lineTo(-8.5, 41);
    ctx.bezierCurveTo(-10, 36, -12, 28, -12.5, 10);
    ctx.bezierCurveTo(-13, -8, -11, -30, 0, -42);
    ctx.fillStyle = '#a8763f'; ctx.fill();
    ctx.strokeStyle = 'rgba(60,32,12,0.45)'; ctx.lineWidth = 1;
    for (var px = -8; px <= 8; px += 4) { ctx.beginPath(); ctx.moveTo(px, -30); ctx.lineTo(px, 40); ctx.stroke(); }
    // bowsprit
    ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(0, -64); ctx.stroke();
    // square sails on their yards, bellied forward by the wind
    var belly = 9 + Math.max(-3, Math.min(3, wind / 40));
    [[-24, 27], [0, 31], [24, 24]].forEach(function (m) {
      var y = m[0], half = m[1];
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.moveTo(-half + 3, y + 5); ctx.quadraticCurveTo(3, y - belly + 5, half + 3, y + 5); ctx.lineTo(half + 3, y + 10); ctx.quadraticCurveTo(3, y - belly * 0.4 + 10, -half + 3, y + 10); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.quadraticCurveTo(0, y - belly, half, y);
      ctx.lineTo(half, y + 6);
      ctx.quadraticCurveTo(0, y - belly * 0.4 + 6, -half, y + 6);
      ctx.closePath();
      var sg = ctx.createLinearGradient(0, y - belly, 0, y + 6);
      sg.addColorStop(0, '#fff6dc'); sg.addColorStop(1, '#cdb88a');
      ctx.fillStyle = sg; ctx.fill();
      ctx.strokeStyle = '#8f7a52'; ctx.lineWidth = 1; ctx.stroke();
      // yard
      ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-half - 2, y + 6); ctx.lineTo(half + 2, y + 6); ctx.stroke();
      ctx.fillStyle = '#2a170a'; ctx.beginPath(); ctx.arc(0, y + 6, 3, 0, 6.283); ctx.fill();
    });
    // pennant
    var fl = Math.sin(scroll / 30) * 2;
    ctx.fillStyle = '#e2672f';
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(12 + wind / 40, 36 + fl); ctx.lineTo(0, 40); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawRain() {
    ctx.strokeStyle = 'rgba(200,225,235,0.28)'; ctx.lineWidth = 1.2;
    var slant = wind * 0.03;
    ctx.beginPath();
    drops.forEach(function (d) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + slant * d.len / 10, d.y + d.len); });
    ctx.stroke();
  }
  function drawLightning() {
    if (flash <= 0) return;
    ctx.fillStyle = 'rgba(220,235,255,' + (flash * 0.28) + ')';
    ctx.fillRect(0, 0, W, H);
    if (bolt && flash > 0.4) {
      ctx.strokeStyle = 'rgba(255,255,255,' + flash + ')'; ctx.lineWidth = 3; ctx.shadowColor = '#bfe0ff'; ctx.shadowBlur = 18;
      ctx.beginPath(); bolt.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
  function hullIcon(x, y, on) {
    ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.quadraticCurveTo(x + 8, y - 2, x + 6, y + 9); ctx.lineTo(x - 6, y + 9); ctx.quadraticCurveTo(x - 8, y - 2, x, y - 9);
    ctx.fillStyle = on ? '#f6cf7a' : 'rgba(255,255,255,0.15)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawHud() {
    // top band
    var g = ctx.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, 'rgba(6,14,16,0.75)'); g.addColorStop(1, 'rgba(6,14,16,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 70);
    ctx.font = '700 13px "Alegreya Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#efe2bf'; ctx.textAlign = 'left';
    ctx.fillText('HULL', 16, 22);
    for (var i = 0; i < 3; i++) hullIcon(64 + i * 20, 22, i < hull);
    ctx.textAlign = 'right';
    ctx.fillText('SUPPLIES', W - 16, 14);
    ctx.font = '28px "Pirata One", Georgia, serif'; ctx.fillStyle = '#f6cf7a';
    ctx.fillText(String(score), W - 16, 38);
    // voyage progress
    var bx = 140, bw = W - 300, by = 22;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by - 2, bw, 4);
    ctx.fillStyle = '#e0ad4a'; ctx.fillRect(bx, by - 2, bw * progress(), 4);
    ctx.fillStyle = '#efe2bf'; ctx.beginPath(); ctx.arc(bx + bw * progress(), by, 5, 0, 6.283); ctx.fill();
    ctx.font = '700 11px "Alegreya Sans", system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(239,226,191,0.8)';
    ctx.fillText('PORT', bx + bw + 34, by);
    // wind
    ctx.textAlign = 'left'; ctx.fillText('WIND', 16, 50);
    var wx = 60, ww = Math.max(-40, Math.min(40, wind / 3));
    ctx.strokeStyle = '#efe2bf'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wx + 30, 50); ctx.lineTo(wx + 30 + ww, 50); ctx.stroke();
    if (Math.abs(ww) > 2) { var dir = ww > 0 ? 1 : -1; ctx.beginPath(); ctx.moveTo(wx + 30 + ww, 50); ctx.lineTo(wx + 30 + ww - dir * 6, 46); ctx.lineTo(wx + 30 + ww - dir * 6, 54); ctx.closePath(); ctx.fillStyle = '#efe2bf'; ctx.fill(); }
    // floating texts
    texts.forEach(function (tx) {
      ctx.globalAlpha = Math.max(0, tx.life);
      ctx.font = (tx.gold ? '30px' : '24px') + ' "Pirata One", Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillStyle = tx.bad ? '#ff8a62' : tx.gold ? '#ffd76a' : '#f6efd8';
      ctx.fillText(tx.text, tx.x, tx.y);
      ctx.globalAlpha = 1;
    });
    if (paused) {
      ctx.fillStyle = 'rgba(6,14,16,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.font = '40px "Pirata One", Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f6cf7a';
      ctx.fillText('Paused', W / 2, H / 2 - 14);
      ctx.font = '500 17px "Alegreya Sans", system-ui, sans-serif'; ctx.fillStyle = '#efe2bf';
      ctx.fillText('Tap the sea or press an arrow key to sail on', W / 2, H / 2 + 22);
    }
  }
  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (shake > 0 && !reduce) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
    drawSea();
    drawWake();
    drawObjects();
    drawShip();
    drawRain();
    drawLightning();
    // vignette
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(-20, -20, W + 40, H + 40);
    if (state === 'play' || state === 'over') drawHud();
  }

  /* ---------- loop: runs only while the game is on screen ---------- */
  var last = 0, running = false;
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  function run() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  function halt() { running = false; }

  resize();
  draw();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) run();
      else { pause(); halt(); }
    }, { threshold: 0.2 }).observe(root);
  } else run();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
  });
  canvas.addEventListener('pointerdown', resume);
  window.addEventListener('blur', pause);

  // test hook: lets an automated check read the game state
  root.__stormRun = { get state() { return state; }, get score() { return score; }, get hull() { return hull; }, get t() { return t; }, get paused() { return paused; }, get ship() { return ship; }, get objs() { return objs; } };
})();
