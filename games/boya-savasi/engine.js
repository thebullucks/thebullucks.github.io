/* Boya Savaşı — oyun motoru (TheBullucks)
   Kare ızgara; her takımın bir topu dolaşır ve geçtiği kareleri kendi rengine boyar. */
(function (root) {
  "use strict";

  const POWERS = {
    bomb:   { icon: "💣", name: "Boya Bombası" },
    speed:  { icon: "⚡", name: "Hız" },
    giant:  { icon: "🔵", name: "Dev Top" },
    freeze: { icon: "❄️", name: "Buz" },
  };

  function createMatch(teams, opts) {
    opts = opts || {};
    const rand = opts.rand || Math.random;
    const G = opts.grid || (teams.length > 12 ? 60 : teams.length > 6 ? 50 : 40);
    const grid = new Int16Array(G * G).fill(-1);
    const counts = new Int32Array(teams.length);
    const balls = teams.map((t, i) => {
      // başlangıç: çember üzerinde eşit aralıklı, merkeze bakar
      const a = (i / teams.length) * Math.PI * 2 + rand() * 0.2;
      const rr = G * 0.36;
      const x = G / 2 + Math.cos(a) * rr, y = G / 2 + Math.sin(a) * rr;
      const h = a + Math.PI + (rand() - 0.5) * 0.8;
      return { i, x, y, h, r: 1.9, baseSpeed: 9.5, turnAt: 0.5 + rand() * 1.2, speedUntil: 0, giantUntil: 0, frozenUntil: 0, picks: 0 };
    });
    const m = {
      G, grid, counts, teams, balls, time: 0, duration: opts.duration || 60, powersOn: opts.powers !== false,
      powers: [], nextPower: 3, events: [], changed: [], rand, over: false,
    };
    for (const b of balls) paint(m, b, b.r + 1.2);
    return m;
  }

  function paint(m, b, rad) {
    const G = m.G, r2 = rad * rad;
    const x0 = Math.max(0, Math.floor(b.x - rad)), x1 = Math.min(G - 1, Math.ceil(b.x + rad));
    const y0 = Math.max(0, Math.floor(b.y - rad)), y1 = Math.min(G - 1, Math.ceil(b.y + rad));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const dx = cx + 0.5 - b.x, dy = cy + 0.5 - b.y;
      if (dx * dx + dy * dy > r2) continue;
      const k = cy * G + cx, old = m.grid[k];
      if (old === b.i) continue;
      if (old >= 0) m.counts[old]--;
      m.grid[k] = b.i; m.counts[b.i]++;
      m.changed.push(k);
    }
  }

  function radiusOf(m, b) { return b.r * (m.time < b.giantUntil ? 2.2 : 1); }
  function speedOf(m, b) {
    let s = b.baseSpeed;
    if (m.time < b.speedUntil) s *= 1.8;
    if (m.time < b.frozenUntil) s *= 0.35;
    return s;
  }

  function spawnPower(m) {
    const keys = Object.keys(POWERS);
    const type = keys[Math.floor(m.rand() * keys.length)];
    const pad = 4;
    m.powers.push({ type, x: pad + m.rand() * (m.G - 2 * pad), y: pad + m.rand() * (m.G - 2 * pad), born: m.time });
  }

  function applyPower(m, b, p) {
    b.picks++;
    m.events.push({ type: "power", ball: b, power: p.type, x: p.x, y: p.y });
    if (p.type === "bomb") paint(m, { i: b.i, x: p.x, y: p.y }, 7);
    else if (p.type === "speed") b.speedUntil = m.time + 5;
    else if (p.type === "giant") b.giantUntil = m.time + 5;
    else if (p.type === "freeze") for (const o of m.balls) if (o !== b) o.frozenUntil = m.time + 2.5;
  }

  function step(m, dt) {
    if (m.over) return;
    m.time += dt;
    const G = m.G, rand = m.rand;
    // güçlendirmeler
    if (m.powersOn && m.time >= m.nextPower && m.time < m.duration - 2) {
      if (m.powers.length < 3) spawnPower(m);
      m.nextPower = m.time + 2.5 + rand() * 2;
    }
    m.powers = m.powers.filter((p) => m.time - p.born < 9);
    // hareket
    for (const b of m.balls) {
      b.turnAt -= dt;
      if (b.turnAt <= 0) { b.h += (rand() - 0.5) * 1.8; b.turnAt = 0.7 + rand() * 1.4; }
      const s = speedOf(m, b), r = radiusOf(m, b);
      b.x += Math.cos(b.h) * s * dt; b.y += Math.sin(b.h) * s * dt;
      if (b.x < r) { b.x = r; b.h = Math.PI - b.h; }
      if (b.x > G - r) { b.x = G - r; b.h = Math.PI - b.h; }
      if (b.y < r) { b.y = r; b.h = -b.h; }
      if (b.y > G - r) { b.y = G - r; b.h = -b.h; }
    }
    // top-top çarpışması (yön değiştirme)
    const n = m.balls.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = m.balls[i], b = m.balls[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), rr = radiusOf(m, a) + radiusOf(m, b);
      if (d >= rr || d === 0) continue;
      const nx = dx / d, ny = dy / d, pen = (rr - d) / 2;
      a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
      // yansıma
      const ra = Math.atan2(ny, nx);
      a.h = 2 * (ra + Math.PI / 2) - a.h; b.h = 2 * (ra + Math.PI / 2) - b.h;
      m.events.push({ type: "bump", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    // boyama + güç toplama
    for (const b of m.balls) {
      const r = radiusOf(m, b);
      paint(m, b, r);
      for (let k = m.powers.length - 1; k >= 0; k--) {
        const p = m.powers[k];
        if (Math.hypot(p.x - b.x, p.y - b.y) < r + 1.4) { m.powers.splice(k, 1); applyPower(m, b, p); }
      }
    }
    if (m.time >= m.duration) { m.time = m.duration; m.over = true; m.events.push({ type: "end" }); }
  }

  function standings(m) {
    const total = m.G * m.G;
    return m.teams.map((t, i) => ({ i, team: t, cells: m.counts[i], pct: (m.counts[i] / total) * 100 }))
      .sort((a, b) => b.cells - a.cells);
  }

  const API = { POWERS, createMatch, step, standings };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.PaintEngine = API;
})(typeof window !== "undefined" ? window : globalThis);
