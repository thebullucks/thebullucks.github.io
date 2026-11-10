/* Bilye Yarışı — fizik motoru ve parkurlar (TheBullucks)
   Tarayıcıda window.MarbleEngine, Node'da module.exports olarak kullanılır. */
(function (root) {
  "use strict";

  const W = 1000;          // dünya genişliği
  const R = 12;            // bilye yarıçapı
  const G = 1150;          // yerçekimi (px/s²)
  const VMAX = 1200;       // hız sınırı
  const CELL = 100;        // ızgara hücresi (y ekseninde)

  /* ---------------- Engeller ---------------- */
  // seg: kalın çizgi (kapsül). circ: daire. Hareketli olanlar update(t) ile konum değiştirir.

  function seg(ax, ay, bx, by, t, opt) {
    return Object.assign({ type: "seg", ax, ay, bx, by, pax: ax, pay: ay, pbx: bx, pby: by, t: t || 8, e: 0.4, active: true, moving: false, style: "wall" }, opt || {});
  }
  function circ(cx, cy, r, opt) {
    return Object.assign({ type: "circ", cx, cy, r, pcx: cx, pcy: cy, e: 0.5, active: true, moving: false, style: "peg" }, opt || {});
  }
  // pivot etrafında dönen/kayan kapsül: yerel uçlar (lax,lay)-(lbx,lby), fn(t) -> {a, dx, dy}
  function kseg(px, py, lax, lay, lbx, lby, t, fn, opt) {
    const o = seg(0, 0, 0, 0, t, Object.assign({ moving: true, style: "move" }, opt || {}));
    o.px = px; o.py = py; o.lax = lax; o.lay = lay; o.lbx = lbx; o.lby = lby; o.fn = fn;
    o.update = function (time) {
      const s = this.fn(time), c = Math.cos(s.a || 0), n = Math.sin(s.a || 0);
      const ox = this.px + (s.dx || 0), oy = this.py + (s.dy || 0);
      this.ax = ox + this.lax * c - this.lay * n; this.ay = oy + this.lax * n + this.lay * c;
      this.bx = ox + this.lbx * c - this.lby * n; this.by = oy + this.lbx * n + this.lby * c;
    };
    o.update(0); o.pax = o.ax; o.pay = o.ay; o.pbx = o.bx; o.pby = o.by;
    return o;
  }
  function kcirc(px, py, r, fn, opt) {
    const o = circ(px, py, r, Object.assign({ moving: true }, opt || {}));
    o.px = px; o.py = py; o.fn = fn;
    o.update = function (time) { const s = this.fn(time); this.cx = this.px + (s.dx || 0); this.cy = this.py + (s.dy || 0); };
    o.update(0); o.pcx = o.cx; o.pcy = o.cy;
    return o;
  }

  /* ---------------- Parkur bölümleri ----------------
     Her bölüm (b, y0) alır; b.add(engel), b.deco(süs), b.label(...) kullanır ve yüksekliğini döndürür. */

  const SECTIONS = {
    start(b, y0, n) {
      const perRow = Math.floor((W - 120) / (2 * R + 8));
      const rows = Math.ceil(n / perRow);
      const h = 80 + rows * (2 * R + 8) + 40;
      b.spawnY = y0 + 60; b.spawnRows = rows; b.perRow = perRow;
      b.gate = b.add(seg(20, y0 + h, W - 20, y0 + h, 8, { style: "gate" }));
      b.label(y0 + h - 30, "🏁 START");
      return h + 30;
    },

    zigzag(b, y0, n = 4) {
      const gap = 150, sp = 170;
      for (let i = 0; i < n; i++) {
        const y = y0 + 40 + i * sp;
        if (i % 2 === 0) b.add(seg(20, y, W - gap, y + 110, 9));
        else b.add(seg(W - 20, y, gap, y + 110, 9));
      }
      b.label(y0 + 20, "↯ ZİKZAK");
      return 100 + n * sp;
    },

    pegs(b, y0, rows = 7) {
      const sp = 74;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? sp / 2 : 0;
        for (let x = 70 + off; x < W - 50; x += sp) b.add(circ(x, y0 + 50 + r * 62, 8));
      }
      b.label(y0 + 20, "• ÇİVİ TARLASI");
      return 70 + rows * 62;
    },

    windmills(b, y0) {
      const mills = [[290, 170, 1.6], [710, 380, -1.4], [330, 600, 1.8]];
      for (const [cx, cy0, w] of mills) {
        const cy = y0 + cy0;
        for (let k = 0; k < 4; k++) {
          const base = (k * Math.PI) / 2;
          b.add(kseg(cx, cy, 0, 0, 125, 0, 8, (t) => ({ a: base + w * t }), { style: "spin" }));
        }
        b.add(circ(cx, cy, 14, { style: "hub" }));
      }
      b.add(seg(20, y0 + 40, 180, y0 + 120, 8)); b.add(seg(W - 20, y0 + 240, W - 200, y0 + 330, 8));
      b.add(seg(20, y0 + 470, 160, y0 + 540, 8)); b.add(seg(W - 20, y0 + 560, W - 170, y0 + 650, 8));
      b.label(y0 + 20, "🌀 FIRTINA DEĞİRMENLERİ");
      return 780;
    },

    funnel(b, y0) {
      b.add(seg(20, y0 + 30, W / 2 - 46, y0 + 260, 9));
      b.add(seg(W - 20, y0 + 30, W / 2 + 46, y0 + 260, 9));
      b.add(seg(W / 2 - 46, y0 + 260, W / 2 - 46, y0 + 320, 9));
      b.add(seg(W / 2 + 46, y0 + 260, W / 2 + 46, y0 + 320, 9));
      b.label(y0 + 15, "⏳ KUM SAATİ");
      return 360;
    },

    bridge(b, y0) {
      // Boğaz Köprüsü: kuleler, sallanan halatlar (süs) ve kayan köprü tabliyeleri
      b.deco({ kind: "tower", x: 140, y: y0 + 30, h: 520 });
      b.deco({ kind: "tower", x: W - 140, y: y0 + 30, h: 520 });
      b.deco({ kind: "cable", x1: 140, x2: W - 140, y: y0 + 40, sag: 140 });
      const layers = [[y0 + 170, 1.1, 0], [y0 + 330, 1.4, 1.7], [y0 + 490, 0.9, 3.1]];
      for (const [y, w, ph] of layers) {
        b.add(kseg(250, y, -140, 0, 140, 0, 8, (t) => ({ dx: 120 * Math.sin(w * t + ph) }), { style: "deck" }));
        b.add(kseg(W - 250, y, -140, 0, 140, 0, 8, (t) => ({ dx: -120 * Math.sin(w * t + ph) }), { style: "deck" }));
      }
      b.add(seg(20, y0 + 560, 200, y0 + 640, 8)); b.add(seg(W - 20, y0 + 560, W - 200, y0 + 640, 8));
      b.label(y0 + 15, "🌉 BOĞAZ KÖPRÜSÜ");
      return 680;
    },

    balloons(b, y0) {
      // Kapadokya balonları: yukarı aşağı süzülen zıplatan balonlar
      const pos = [[180, 120], [500, 90], [820, 130], [330, 300], [670, 290], [160, 470], [500, 480], [840, 460]];
      const cols = ["#ff5d6c", "#ffd84a", "#46d39a", "#7fd3ff", "#ff7b39", "#b388ff", "#ff4dd2", "#3fb6f0"];
      pos.forEach(([x, y], i) => {
        const ph = i * 1.3, amp = 30 + (i % 3) * 10, w = 0.8 + (i % 4) * 0.15;
        b.add(kcirc(x, y0 + y, 36 + (i % 3) * 4, (t) => ({ dy: amp * Math.sin(w * t + ph), dx: 12 * Math.sin(0.5 * t + ph) }), { style: "balloon", e: 0.92, color: cols[i % cols.length] }));
      });
      b.add(seg(20, y0 + 560, 220, y0 + 620, 8)); b.add(seg(W - 20, y0 + 560, W - 220, y0 + 620, 8));
      b.label(y0 + 15, "🎈 KAPADOKYA BALONLARI");
      return 660;
    },

    seesaw(b, y0) {
      const planks = [[300, y0 + 150, 0], [700, y0 + 330, 1.6], [400, y0 + 510, 3]];
      for (const [x, y, ph] of planks) {
        b.add(kseg(x, y, -175, 0, 175, 0, 9, (t) => ({ a: 0.42 * Math.sin(1.3 * t + ph) }), { style: "plank" }));
        b.deco({ kind: "pivot", x, y });
      }
      b.add(seg(20, y0 + 60, 140, y0 + 120, 8)); b.add(seg(W - 20, y0 + 240, W - 150, y0 + 300, 8));
      b.add(seg(20, y0 + 600, 180, y0 + 660, 8)); b.add(seg(W - 20, y0 + 600, W - 180, y0 + 660, 8));
      b.label(y0 + 15, "⚖️ TAHTEREVALLİLER");
      return 700;
    },

    trapdoors(b, y0) {
      // Kapanlar: her katta tek kapı periyodik açılır, zemin kapıya doğru eğimli
      const doors = [[W / 2, 0], [210, 1.2], [W - 210, 2.4]];
      doors.forEach(([dx, ph], i) => {
        const y = y0 + 120 + i * 190, dw = 110;
        b.add(seg(20, y - 40, dx - dw / 2, y, 8));
        b.add(seg(W - 20, y - 40, dx + dw / 2, y, 8));
        const open = (t) => { const c = ((t + ph) % 3.6); return c < 1.3 ? Math.min(1, c / 0.25, (1.3 - c) / 0.25) : 0; };
        b.add(kseg(dx - dw / 2, y, 0, 0, dw, 0, 8, (t) => ({ a: 1.45 * open(t) }), { style: "door" }));
      });
      b.label(y0 + 15, "🚪 KAPANLAR");
      return 120 + 3 * 190 + 40;
    },

    hammers(b, y0) {
      const hs = [[250, y0 + 40, 0], [500, y0 + 200, 1.2], [750, y0 + 360, 2.5], [500, y0 + 520, 0.6]];
      for (const [x, y, ph] of hs) {
        const fn = (t) => ({ a: Math.PI / 2 + 1.0 * Math.sin(1.9 * t + ph) });
        b.add(kseg(x, y, 0, 0, 150, 0, 6, fn, { style: "arm" }));
        // çekiç başı: kolun ucunda dönen kısa kalın kapsül
        b.add(kseg(x, y, 150, -26, 150, 26, 14, fn, { style: "head", e: 0.75 }));
        b.deco({ kind: "pivot", x, y });
      }
      b.add(seg(20, y0 + 150, 330, y0 + 230, 8)); b.add(seg(W - 20, y0 + 300, W - 330, y0 + 380, 8));
      b.add(seg(20, y0 + 470, 300, y0 + 550, 8)); b.add(seg(W - 20, y0 + 620, W - 260, y0 + 690, 8));
      b.label(y0 + 15, "🔨 ÇEKİÇLER");
      return 740;
    },

    wheel(b, y0) {
      // Çamaşır makinesi: içine girilen dönen tambur, iki kapısı var
      const cx = W / 2, cy = y0 + 320, Rw = 160, N = 20, w = 1.05;
      for (let k = 0; k < N; k++) {
        if (k % 10 === 0 || k % 10 === 1) continue; // iki kapı
        const a0 = (k / N) * 2 * Math.PI, a1 = ((k + 1) / N) * 2 * Math.PI;
        b.add(kseg(cx, cy, Rw * Math.cos(a0), Rw * Math.sin(a0), Rw * Math.cos(a1), Rw * Math.sin(a1), 7, (t) => ({ a: w * t }), { style: "drum" }));
      }
      // içerideki kanatlar
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * 2 * Math.PI + 0.5;
        b.add(kseg(cx, cy, Rw * 0.55 * Math.cos(a), Rw * 0.55 * Math.sin(a), Rw * 0.95 * Math.cos(a), Rw * 0.95 * Math.sin(a), 6, (t) => ({ a: w * t }), { style: "drum" }));
      }
      const k45 = Rw * 0.74;
      b.add(seg(20, y0 + 20, cx - k45 - 10, cy - k45 - 10, 9));
      b.add(seg(W - 20, y0 + 20, cx + k45 + 10, cy - k45 - 10, 9));
      b.add(seg(20, cy + 60, cx - 120, cy + Rw + 110, 8));
      b.add(seg(W - 20, cy + 60, cx + 120, cy + Rw + 110, 8));
      b.deco({ kind: "drum", x: cx, y: cy, r: Rw });
      b.label(y0 + 15, "🌊 ÇAMAŞIR MAKİNESİ");
      return 320 + Rw + 160;
    },

    pinball(b, y0) {
      // Langırt: zıplatan tamponlar ve sallanan paletler
      const bum = [[250, 120], [500, 80], [750, 120], [375, 250], [625, 250], [500, 380]];
      for (const [x, y] of bum) b.add(circ(x, y0 + y, 26, { style: "bumper", e: 1.0, kick: 260 }));
      b.add(kseg(260, y0 + 480, 0, 0, 170, 0, 9, (t) => ({ a: 0.5 * Math.sin(2.4 * t) + 0.25 }), { style: "flipper" }));
      b.add(kseg(W - 260, y0 + 480, 0, 0, -170, 0, 9, (t) => ({ a: -0.5 * Math.sin(2.4 * t + 1.2) - 0.25 }), { style: "flipper" }));
      b.add(seg(20, y0 + 400, 260, y0 + 480, 8)); b.add(seg(W - 20, y0 + 400, W - 260, y0 + 480, 8));
      b.label(y0 + 15, "💥 LANGIRT");
      return 600;
    },

    finish(b, y0) {
      b.add(seg(20, y0 + 30, W / 2 - 120, y0 + 200, 9));
      b.add(seg(W - 20, y0 + 30, W / 2 + 120, y0 + 200, 9));
      b.finishY = y0 + 260;
      b.deco({ kind: "finish", y: b.finishY });
      // toplama havuzu
      const fy = y0 + 640;
      b.add(seg(20, fy - 80, W / 2, fy, 10));
      b.add(seg(W - 20, fy - 80, W / 2, fy, 10));
      b.label(y0 + 15, "🏆 FİNİŞ");
      return 700;
    },
  };

  const TRACKS = [
    { id: "kapadokya", name: "Kapadokya Rüzgârı", emoji: "🎈", desc: "Süzülen balonlar, zikzak yamaçlar ve değirmenler", parts: [["zigzag", 3], ["balloons"], ["pegs", 6], ["seesaw"], ["balloons"], ["funnel"], ["zigzag", 3], ["windmills"], ["balloons"], ["pegs", 5]] },
    { id: "bogaz", name: "Boğaz Köprüsü", emoji: "🌉", desc: "Kayan köprüler, tahterevalliler ve kapanlar", parts: [["pegs", 5], ["bridge"], ["seesaw"], ["funnel"], ["bridge"], ["zigzag", 3], ["trapdoors"], ["bridge"], ["pegs", 4]] },
    { id: "firtina", name: "Fırtına Değirmeni", emoji: "🌀", desc: "Dönen değirmenler ve dev çekiçler", parts: [["windmills"], ["zigzag", 3], ["hammers"], ["funnel"], ["windmills"], ["pegs", 6], ["hammers"], ["zigzag", 3], ["windmills"], ["hammers"]] },
    { id: "camasir", name: "Çamaşır Makinesi", emoji: "🌊", desc: "Dönen tamburlar ve langırt", parts: [["funnel"], ["wheel"], ["pinball"], ["pegs", 5], ["wheel"], ["zigzag", 3], ["pinball"], ["trapdoors"], ["wheel"]] },
    { id: "surpriz", name: "Sürpriz Parkur", emoji: "🎲", desc: "Her yarışta rastgele bölümler", parts: null },
  ];
  const MIDDLE = [["zigzag", 3], ["pegs", 6], ["windmills"], ["funnel"], ["bridge"], ["balloons"], ["seesaw"], ["trapdoors"], ["hammers"], ["wheel"], ["pinball"]];

  function buildTrack(track, n, rand) {
    rand = rand || Math.random;
    let parts = track.parts;
    if (!parts) {
      const pool = MIDDLE.slice(); parts = [];
      while (parts.length < 9) { const i = Math.floor(rand() * pool.length); parts.push(pool.splice(i, 1)[0]); if (!pool.length) break; }
      // huni gibi bir boğaz noktası garanti olsun
      if (!parts.some((p) => p[0] === "funnel")) parts.splice(3, 0, ["funnel"]);
    }
    const obs = [], decos = [], labels = [];
    const b = {
      add: (o) => { obs.push(o); return o; },
      deco: (d) => decos.push(d),
      label: (y, text) => labels.push({ y, text }),
    };
    let y = 0;
    y += SECTIONS.start(b, y, n);
    for (const [name, arg] of parts) y += SECTIONS[name](b, y, arg);
    y += SECTIONS.finish(b, y);
    const H = y;
    obs.push(seg(10, -200, 10, H + 50, 12, { style: "side" }));
    obs.push(seg(W - 10, -200, W - 10, H + 50, 12, { style: "side" }));
    return { W, H, obs, decos, labels, gate: b.gate, finishY: b.finishY, spawnY: b.spawnY, perRow: b.perRow, parts: parts.map((p) => p[0]) };
  }

  /* ---------------- Dünya ---------------- */

  function createWorld(track, entrants, opts) {
    opts = opts || {};
    const rand = opts.rand || Math.random;
    const T = buildTrack(track, entrants.length, rand);
    const order = entrants.map((e, i) => i).sort(() => rand() - 0.5);
    const marbles = entrants.map((e, i) => ({ id: i, code: e.code, name: e.name, x: 0, y: 0, vx: 0, vy: 0, ang: rand() * 6.28, best: 0, lastImprove: 0, finished: false, finishTime: null, place: null, kicks: 0 }));
    const sp = 2 * R + 8;
    order.forEach((idx, k) => {
      const row = Math.floor(k / T.perRow), col = k % T.perRow;
      const m = marbles[idx];
      m.x = 60 + col * sp + (row % 2 ? sp / 2 : 0) + (rand() - 0.5) * 4;
      m.y = T.spawnY + row * sp;
      m.best = m.y;
    });
    const world = { T, marbles, time: 0, raceTime: 0, started: false, finishedCount: 0, grid: null, events: [] };
    buildGrid(world);
    return world;
  }

  function buildGrid(world) {
    const grid = new Map();
    const ins = (o, y0, y1) => { for (let c = Math.floor(y0 / CELL); c <= Math.floor(y1 / CELL); c++) { if (!grid.has(c)) grid.set(c, []); grid.get(c).push(o); } };
    for (const o of world.T.obs) {
      let y0, y1;
      if (o.type === "circ") {
        const ext = o.moving ? 80 : 0;
        y0 = o.cy - o.r - ext; y1 = o.cy + o.r + ext;
      } else if (o.moving) {
        const reach = Math.max(Math.hypot(o.lax, o.lay), Math.hypot(o.lbx, o.lby)) + 200;
        y0 = o.py - reach; y1 = o.py + reach;
      } else { y0 = Math.min(o.ay, o.by) - o.t; y1 = Math.max(o.ay, o.by) + o.t; }
      ins(o, y0 - R, y1 + R);
    }
    world.grid = grid;
    world.movers = world.T.obs.filter((o) => o.moving);
  }

  function openGate(world) { world.T.gate.active = false; world.started = true; world.raceTime = 0; }

  function collideSeg(m, o, dt) {
    const ex = o.bx - o.ax, ey = o.by - o.ay;
    const L2 = ex * ex + ey * ey || 1e-9;
    let u = ((m.x - o.ax) * ex + (m.y - o.ay) * ey) / L2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = o.ax + ex * u, qy = o.ay + ey * u;
    let dx = m.x - qx, dy = m.y - qy;
    const d2 = dx * dx + dy * dy, rr = R + o.t;
    if (d2 >= rr * rr) return false;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { dx = -ey; dy = ex; d = Math.hypot(dx, dy); }
    const nx = dx / d, ny = dy / d;
    m.x += nx * (rr - d); m.y += ny * (rr - d);
    let ovx = 0, ovy = 0;
    if (o.moving) {
      const vax = (o.ax - o.pax) / dt, vay = (o.ay - o.pay) / dt, vbx = (o.bx - o.pbx) / dt, vby = (o.by - o.pby) / dt;
      ovx = vax * (1 - u) + vbx * u; ovy = vay * (1 - u) + vby * u;
    }
    respond(m, nx, ny, ovx, ovy, o.e, 0, dt);
    return true;
  }

  function collideCirc(m, o, dt) {
    let dx = m.x - o.cx, dy = m.y - o.cy;
    const rr = R + o.r, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    let d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    m.x += nx * (rr - d); m.y += ny * (rr - d);
    const ovx = o.moving ? (o.cx - o.pcx) / dt : 0, ovy = o.moving ? (o.cy - o.pcy) / dt : 0;
    respond(m, nx, ny, ovx, ovy, o.e, o.kick || 0, dt);
    if (o.kick) o.hit = 0.25;
    return true;
  }

  function respond(m, nx, ny, ovx, ovy, e, kick, dt) {
    const rvx = m.vx - ovx, rvy = m.vy - ovy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      // sert çarpışmada sekme, hafif temasta (yuvarlanma) sekme yok
      const ee = vn < -120 ? e : 0;
      const j = -(1 + ee) * vn + kick;
      m.vx += j * nx; m.vy += j * ny;
    }
    // teğetsel sürtünme (zamana göre ölçekli, yuvarlanma direnci gibi)
    const tvx = rvx - vn * nx, tvy = rvy - vn * ny;
    const f = Math.min(1, 0.35 * dt * 60 / 60);
    m.vx -= tvx * f * 0.02; m.vy -= tvy * f * 0.02;
  }

  function step(world, dt) {
    world.time += dt;
    if (world.started) world.raceTime += dt;
    const t = world.time;
    for (const o of world.movers) {
      if (o.type === "seg") { o.pax = o.ax; o.pay = o.ay; o.pbx = o.bx; o.pby = o.by; }
      else { o.pcx = o.cx; o.pcy = o.cy; }
      o.update(t);
    }
    const ms = world.marbles, grid = world.grid, T = world.T;
    for (const m of ms) {
      m.vy += G * dt;
      m.vx *= 0.9995; m.vy *= 0.9995;
      const sp = Math.hypot(m.vx, m.vy);
      if (sp > VMAX) { m.vx *= VMAX / sp; m.vy *= VMAX / sp; }
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.ang += (m.vx / R) * dt;
      const c0 = Math.floor((m.y - R) / CELL), c1 = Math.floor((m.y + R) / CELL);
      for (let c = c0; c <= c1; c++) {
        const list = grid.get(c);
        if (!list) continue;
        for (const o of list) {
          if (!o.active) continue;
          if (o.type === "seg") collideSeg(m, o, dt); else collideCirc(m, o, dt);
        }
      }
      if (m.x < 22 + R) { m.x = 22 + R; if (m.vx < 0) m.vx = -m.vx * 0.4; }
      if (m.x > W - 22 - R) { m.x = W - 22 - R; if (m.vx > 0) m.vx = -m.vx * 0.4; }
    }
    // bilye-bilye
    const n = ms.length, rr = 2 * R, rr2 = rr * rr;
    for (let i = 0; i < n; i++) {
      const a = ms[i];
      for (let j = i + 1; j < n; j++) {
        const b = ms[j];
        const dy = b.y - a.y;
        if (dy > rr || dy < -rr) continue;
        const dx = b.x - a.x, d2 = dx * dx + dy * dy;
        if (d2 >= rr2 || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (rr - d) / 2;
        a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const jj = -(1 + 0.6) * vn / 2;
          a.vx -= jj * nx; a.vy -= jj * ny; b.vx += jj * nx; b.vy += jj * ny;
        }
      }
    }
    // ilerleme, finiş ve takılma kontrolü
    for (const m of ms) {
      if (!m.finished && world.started && m.y >= T.finishY) {
        m.finished = true; m.finishTime = world.raceTime; m.place = ++world.finishedCount;
        world.events.push({ type: "finish", m });
      }
      if (m.y > m.best + 25) { m.best = m.y; m.lastImprove = world.time; }
      if (world.started && !m.finished && world.time - m.lastImprove > 5 && Math.hypot(m.vx, m.vy) < 90) {
        m.vx += (Math.random() - 0.5) * 700; m.vy -= 450 + Math.random() * 250;
        m.lastImprove = world.time; m.kicks++;
        world.events.push({ type: "stuck", m });
      }
    }
  }

  // yarış sıralaması: bitirenler bitiş sırasına göre, diğerleri ilerlemeye göre
  function standings(world) {
    return world.marbles.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.place - b.place;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.y - a.y;
    });
  }

  const API = { W, R, TRACKS, SECTIONS, buildTrack, createWorld, openGate, step, standings };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.MarbleEngine = API;
})(typeof window !== "undefined" ? window : globalThis);
