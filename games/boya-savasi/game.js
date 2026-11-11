/* Boya Savaşı — arayüz ve çizim (TheBullucks) */
(function () {
  "use strict";
  const E = window.PaintEngine, SETS = window.TEAM_SETS, CD = window.COUNTRY_DATA;
  const $ = (id) => document.getElementById(id);
  const PLAYER_COLORS = ["#ffd84a", "#ff4dd2", "#46d39a", "#ff7b39", "#7fd3ff", "#b388ff"];
  const PATS = ["vstripes", "hstripe", "halves", "diag", "dot", "cross"];
  const TERRITORIES = new Set("PR GL FK HK MO GF NC PF GP MQ RE YT PM SH SX MF BL AI MS TC WF MP BQ NF IO SJ TK NU CK AS GU VI VG KY BM AW CW FO GI IM JE GG AX EH TF HM GS BV UM CC CX PN AQ".split(" "));
  const fmtP = (p) => p.toFixed(1).replace(".", ",");
  const sfx = (name, ...a) => { if (window.SFX) window.SFX[name](...a); };

  /* ---------------- Bayraklar (ülke seti) ---------------- */
  const FLAG = {}, FLAG_IMG = {};
  async function loadFlags() {
    for (const u of ["https://cdn.jsdelivr.net/npm/country-flag-icons@1/string/3x2/+esm", "https://cdn.jsdelivr.net/npm/country-flag-icons@1/string/3x2/index.js"]) {
      try {
        const m = await import(u); let n = 0;
        for (const k of Object.keys(m)) if (/^[A-Z]{2}$/.test(k) && typeof m[k] === "string") {
          const sized = /<svg[^>]*\swidth=/.test(m[k]) ? m[k] : m[k].replace("<svg", '<svg width="96" height="64" preserveAspectRatio="none"');
          FLAG[k] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sized); n++;
        }
        if (n > 100) return;
      } catch (e) { console.log("[BS] bayrak yüklenemedi", e && e.message); }
    }
  }
  function flagImage(code) {
    if (FLAG_IMG[code] || !FLAG[code]) return FLAG_IMG[code];
    const img = new Image(); img.src = FLAG[code]; FLAG_IMG[code] = img; return img;
  }
  const hashHue = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  // bayraktan en baskın iki rengi çıkar
  async function flagColors(code) {
    const img = flagImage(code);
    if (!img) return null;
    try {
      await img.decode();
      const c = document.createElement("canvas"); c.width = 24; c.height = 16;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0, 24, 16);
      const d = g.getImageData(0, 0, 24, 16).data, hist = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
        const e = hist.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2]; hist.set(k, e);
      }
      const cols = [...hist.values()].sort((a, b) => b.n - a.n).map((e) => [e.r / e.n, e.g / e.n, e.b / e.n]);
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const c1 = cols[0], c2 = cols.find((x) => dist(x, c1) > 90) || [255, 255, 255];
      const hex = (x) => "#" + x.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      return { c1: hex(c1), c2: hex(c2) };
    } catch (e) { return null; }
  }

  /* ---------------- Durum ---------------- */
  const S = { set: "superlig", count: "all", dur: 60, powers: true, speed: 1, teams: [], match: null, state: "idle", players: [], countT: 0, shown: null, lastSec: null, fx: [], flashT: 0 };
  let setupRows = [{ name: "Oyuncu 1", id: "" }, { name: "Oyuncu 2", id: "" }];

  const countryCodes = () => Object.keys(CD.pop).filter((c) => CD.pop[c] >= 0.0009 && /^[A-Z]{2}$/.test(c) && CD.names[c] && !TERRITORIES.has(c)).sort((a, b) => CD.names[a].localeCompare(CD.names[b], "tr"));
  function teamPool() {
    if (S.set === "superlig") return SETS.superlig.teams;
    return countryCodes().map((c, i) => ({ id: c, name: CD.names[c], short: c, flag: c, c1: `hsl(${hashHue(c)},60%,45%)`, c2: "#ffffff", pat: PATS[i % PATS.length] }));
  }

  /* ---------------- Desenler ---------------- */
  function swatchCSS(t) {
    if (t.flag && FLAG[t.flag]) return `background:url("${FLAG[t.flag]}") center/cover`;
    const a = t.c1, b = t.c2;
    switch (t.pat) {
      case "vstripes": return `background:repeating-linear-gradient(90deg,${a} 0 25%,${b} 25% 50%)`;
      case "hstripe": return `background:linear-gradient(${a} 35%,${b} 35% 65%,${a} 65%)`;
      case "halves": return `background:linear-gradient(90deg,${a} 50%,${b} 50%)`;
      case "diag": return `background:linear-gradient(135deg,${a} 50%,${b} 50%)`;
      case "dot": return `background:radial-gradient(circle,${b} 32%,${a} 34%)`;
      case "cross": return `background:linear-gradient(90deg,transparent 38%,${b} 38% 62%,transparent 62%),linear-gradient(${a} 38%,${b} 38% 62%,${a} 62%)`;
      default: return `background:${a}`;
    }
  }
  // zemindeki bir kareyi takımın deseniyle boya
  function drawCell(g, cx, cy, cs, t) {
    const x = cx * cs, y = cy * cs;
    g.fillStyle = t.c1; g.fillRect(x, y, cs, cs);
    g.fillStyle = t.c2;
    switch (t.pat) {
      case "vstripes": if (cx % 2 === 1) g.fillRect(x, y, cs, cs); break;
      case "hstripe": if (cy % 3 === 1) g.fillRect(x, y, cs, cs); break;
      case "halves": if (((cx >> 1) + (cy >> 1)) % 2 === 1) g.fillRect(x, y, cs, cs); break;
      case "diag": if ((cx + cy) % 3 === 0) g.fillRect(x, y, cs, cs); break;
      case "dot": if ((cx + cy) % 2 === 0) { g.beginPath(); g.arc(x + cs / 2, y + cs / 2, cs * 0.28, 0, 7); g.fill(); } break;
      case "cross": if (cx % 4 === 1 || cy % 4 === 1) g.fillRect(x, y, cs, cs); break;
    }
  }

  /* ---------------- Kurulum ---------------- */
  function segInit(id, fn) {
    const seg = $(id);
    seg.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on"); fn(b.dataset.v);
    }));
  }
  function renderCountSeg() {
    const opts = S.set === "superlig" ? [["all", "Tümü (18)"], ["8", "8"], ["4", "4"]] : [["8", "8"], ["16", "16"], ["24", "24"]];
    if (!opts.some((o) => o[0] === String(S.count))) S.count = opts[0][0] === "all" ? "all" : +opts[0][0];
    $("segCount").innerHTML = opts.map(([v, l]) => `<button data-v="${v}" class="${String(S.count) === v ? "on" : ""}">${l}</button>`).join("");
    segInit("segCount", (v) => (S.count = v === "all" ? "all" : +v));
  }
  function renderSetup() {
    renderCountSeg();
    const pool = teamPool();
    const opts = `<option value="">— Takım seç —</option><option value="?">🎲 Rastgele</option>` + pool.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
    $("prows").innerHTML = setupRows.map((r, i) => `<div class="prow"><span class="dot" style="background:${PLAYER_COLORS[i]}"></span>
      <input class="pname" data-i="${i}" value="${r.name.replace(/"/g, "&quot;")}" maxlength="16"><select class="psel" data-i="${i}">${opts}</select>
      <button class="pdel" data-i="${i}">✕</button></div>`).join("") || `<p style="font-size:13px">Oyuncu yok, sadece izleme modu.</p>`;
    document.querySelectorAll(".psel").forEach((el) => { if (!pool.some((t) => t.id === setupRows[+el.dataset.i].id) && setupRows[+el.dataset.i].id !== "?") setupRows[+el.dataset.i].id = ""; el.value = setupRows[+el.dataset.i].id; el.onchange = () => (setupRows[+el.dataset.i].id = el.value); });
    document.querySelectorAll(".pname").forEach((el) => (el.oninput = () => (setupRows[+el.dataset.i].name = el.value)));
    document.querySelectorAll(".pdel").forEach((el) => (el.onclick = () => { setupRows.splice(+el.dataset.i, 1); renderSetup(); }));
    $("addP").disabled = setupRows.length >= PLAYER_COLORS.length;
  }
  function openSetup() { S.state = S.state === "playing" ? "paused" : S.state; renderSetup(); $("setup").classList.add("show"); }

  async function prepareFromSetup() {
    const pool = teamPool().slice();
    const used = new Set(), players = [];
    setupRows.forEach((r, i) => {
      if (!r.id) return;
      let id = r.id;
      if (id === "?" || used.has(id)) { const free = pool.filter((t) => !used.has(t.id)); id = free[Math.floor(Math.random() * free.length)].id; }
      used.add(id);
      players.push({ name: (r.name || `Oyuncu ${i + 1}`).trim(), color: PLAYER_COLORS[i], id });
    });
    const n = S.count === "all" ? pool.length : Math.max(S.count, used.size);
    const rest = pool.filter((t) => !used.has(t.id)).sort(() => Math.random() - 0.5);
    let teams = [...pool.filter((t) => used.has(t.id)), ...rest].slice(0, n);
    if (S.set === "countries") {
      teams = await Promise.all(teams.map(async (t, i) => {
        const c = await flagColors(t.flag);
        return Object.assign({}, t, c || {}, { pat: PATS[i % PATS.length] });
      }));
    }
    S.players = players;
    $("setup").classList.remove("show");
    newMatch(teams);
  }

  /* ---------------- Maç ---------------- */
  let paintCv = null, paintG = null, CS = 12;
  function newMatch(teams) {
    S.teams = teams;
    S.match = E.createMatch(teams, { duration: S.dur, powers: S.powers });
    S.state = "ready"; S.countT = 0; S.shown = null; S.lastSec = null; S.fx = [];
    const G = S.match.G;
    paintCv = document.createElement("canvas"); paintCv.width = paintCv.height = G * CS;
    paintG = paintCv.getContext("2d");
    paintG.fillStyle = "#0c1d3a"; paintG.fillRect(0, 0, G * CS, G * CS);
    paintG.fillStyle = "#0f2446";
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if ((x + y) % 2) paintG.fillRect(x * CS, y * CS, CS, CS);
    flushPaint();
    $("ssub").textContent = S.set === "superlig" ? `${SETS.superlig.name}` : "Ülkeler";
    $("btnStart").textContent = "▶ Başlat"; $("btnStart").disabled = false;
    $("resModal").classList.remove("show"); $("swin").classList.remove("show");
    setTimer(S.dur);
    for (const id of ["count", "scount"]) { const c = $(id); c.textContent = "▶"; c.style.fontSize = ""; c.classList.add("show"); }
    $("scount").innerHTML = `<span style="font-size:3vh;font-family:Rubik;font-weight:800;color:#fff;text-shadow:0 2px 8px #000">Başlatmak için dokun ▶</span>`;
    $("count").innerHTML = `<span style="font-size:22px;font-family:Rubik;font-weight:800;color:#fff;text-shadow:0 2px 8px #000">“Başlat”a bas ▶</span>`;
    renderBoard(true);
  }
  function flushPaint() {
    const m = S.match; if (!m) return;
    const G = m.G;
    for (const k of m.changed) drawCell(paintG, k % G, (k / G) | 0, CS, m.teams[m.grid[k]]);
    m.changed.length = 0;
  }
  function start() {
    if (!S.match) return;
    if (S.state === "ready") { S.state = "countdown"; S.countT = 0; S.shown = null; $("btnStart").textContent = "⏸ Duraklat"; }
    else if (S.state === "playing") { S.state = "paused"; $("btnStart").textContent = "▶ Devam"; }
    else if (S.state === "paused") { S.state = "playing"; $("btnStart").textContent = "⏸ Duraklat"; }
  }

  function setTimer(rem) {
    const v = Math.max(0, Math.ceil(rem));
    for (const id of ["timer", "stimer"]) { const el = $(id); el.textContent = v; el.classList.toggle("hot", rem <= 10 && rem > 0 && S.state === "playing"); }
  }
  function flash(html) {
    for (const id of ["flash", "sflash"]) { const el = $(id); el.innerHTML = html; el.classList.add("show"); }
    clearTimeout(flash.t); flash.t = setTimeout(() => { $("flash").classList.remove("show"); $("sflash").classList.remove("show"); }, 1600);
  }
  const playerOf = (id) => S.players.find((p) => p.id === id);

  function handleEvents() {
    const m = S.match;
    for (const ev of m.events) {
      if (ev.type === "power") {
        const t = m.teams[ev.ball.i], P = E.POWERS[ev.power];
        flash(`${P.icon} <b>${t.name}</b>: ${P.name}!`);
        if (ev.power === "bomb") { sfx("boom", false); S.fx.push({ kind: "ring", x: ev.x, y: ev.y, t0: performance.now(), r: 7, color: t.c1 }); }
        else sfx("win");
      } else if (ev.type === "bump") {
        if (Math.random() < 0.3) sfx("click", 0.5, 0);
      } else if (ev.type === "end") endMatch();
    }
    m.events.length = 0;
  }

  function endMatch() {
    S.state = "done";
    flushPaint();
    renderBoard(true);
    setTimer(0);
    sfx("beep", true);
    const st = E.standings(S.match);
    $("btnStart").disabled = true;
    setTimeout(() => {
      sfx("fanfare");
      const w = st[0];
      // Shorts kazanan ekranı
      $("swin").innerHTML = `<div class="k">KAZANAN</div><div class="sw" style="${swatchCSS(w.team)}"></div><div class="n">${w.team.name}</div><div class="p">%${fmtP(w.pct)}</div>
        <div class="o">🥈 ${st[1] ? `${st[1].team.name} %${fmtP(st[1].pct)}` : ""}<br>🥉 ${st[2] ? `${st[2].team.name} %${fmtP(st[2].pct)}` : ""}</div>`;
      $("swin").classList.add("show");
      if (!document.body.classList.contains("shorts")) showResults(st);
    }, 1200);
  }

  function resultText(st) {
    const title = S.set === "superlig" ? "Boya Savaşı · Süper Lig" : "Boya Savaşı · Ülkeler";
    return `${title}\n` + st.map((x, i) => `${i + 1}. ${x.team.name} %${fmtP(x.pct)}`).join("\n");
  }

  function showResults(st) {
    const top = st.slice(0, 3), order = [1, 0, 2].filter((i) => top[i]);
    const pl = S.players.length ? `<p style="color:var(--text)">${S.players.map((p) => { const i = st.findIndex((x) => x.team.id === p.id); return `<b style="color:${p.color}">${p.name}</b>: ${i + 1}.`; }).join(" · ")}</p>` : "";
    $("resBox").innerHTML = `<h2>MAÇ <span>SONUCU</span></h2>
      <div class="podium">${order.map((i) => `<div class="pod p${i + 1}"><div class="sw" style="${swatchCSS(top[i].team)}"></div><div class="nm">${top[i].team.name}</div><div class="t">%${fmtP(top[i].pct)}</div><div class="bar">${i + 1}</div></div>`).join("")}</div>
      ${pl}
      <div class="reslist">${st.map((x, i) => `<div>${i + 1}. ${x.team.name} · %${fmtP(x.pct)}</div>`).join("")}</div>
      <div class="controls"><button class="btn ghost" id="rLook">Arenaya bak</button><button class="btn or" id="rAgain">Tekrar oyna</button>
      <button class="btn ghost" id="rCopy">📋 Sonucu kopyala</button><button class="btn ghost" id="rSetup">⚙️ Ayarlar</button></div>
      <div class="copied" id="copied"></div><textarea class="copybox" id="copybox" readonly></textarea>`;
    $("resModal").classList.add("show");
    $("rLook").onclick = () => $("resModal").classList.remove("show");
    $("rAgain").onclick = () => newMatch(S.teams);
    $("rSetup").onclick = () => { $("resModal").classList.remove("show"); openSetup(); };
    $("rCopy").onclick = async () => {
      const txt = resultText(st);
      try { await navigator.clipboard.writeText(txt); $("copied").textContent = "Kopyalandı ✔"; }
      catch (e) { const b = $("copybox"); b.value = txt; b.style.display = "block"; b.select(); $("copied").textContent = "Metni seçip kopyalayabilirsin"; }
    };
  }

  /* ---------------- Tablo ---------------- */
  let lastBoard = 0;
  function renderBoard(force) {
    const now = performance.now();
    if (!force && now - lastBoard < 200) return;
    lastBoard = now;
    const m = S.match; if (!m) return;
    const st = E.standings(m), max = Math.max(1, st[0].pct);
    const row = (x, i) => {
      const p = playerOf(x.team.id);
      return `<div class="row ${i === 0 && x.cells > 0 ? "top" : ""}"><span class="rk">${i + 1}</span><span class="sw" style="${swatchCSS(x.team)}"></span>
        <span class="nm"><i class="bar" style="width:${(x.pct / max) * 100}%;background:${x.team.c1}"></i><span>${x.team.name}${p ? `<i class="pl" style="background:${p.color}"></i>` : ""}</span></span><span class="pc">%${fmtP(x.pct)}</span></div>`;
    };
    $("board").innerHTML = st.map(row).join("");
    $("sboard").innerHTML = st.slice(0, st.length > 10 ? 8 : st.length).map(row).join("");
    $("boardTitle").textContent = `Canlı tablo · ${m.teams.length} takım`;
  }

  /* ---------------- Çizim ---------------- */
  function sizeCanvas(cv) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return [w, h];
  }

  function drawBall(g, b, t, px, now) {
    const r = (S.match.time < b.giantUntil ? b.r * 2.2 : b.r) * px;
    const x = b.x * px, y = b.y * px;
    if (S.match.time < b.speedUntil) { g.fillStyle = "rgba(255,216,74,.25)"; g.beginPath(); g.arc(x - Math.cos(b.h) * r, y - Math.sin(b.h) * r, r * 1.1, 0, 7); g.fill(); }
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, 7); g.closePath();
    g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = r * 0.6; g.fillStyle = t.c1; g.fill(); g.shadowBlur = 0;
    g.clip();
    const img = t.flag ? flagImage(t.flag) : null;
    if (img && img.complete && img.naturalWidth) g.drawImage(img, x - r * 1.5, y - r, r * 3, r * 2);
    else {
      g.fillStyle = t.c2;
      const w = r * 2;
      switch (t.pat) {
        case "vstripes": for (let k = -2; k <= 2; k += 2) g.fillRect(x + (k * w) / 8 - w / 16, y - r, w / 8, w); break;
        case "hstripe": g.fillRect(x - r, y - r * 0.3, w, r * 0.6); break;
        case "halves": g.fillRect(x, y - r, r, w); break;
        case "diag": g.beginPath(); g.moveTo(x + r, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.fill(); break;
        case "dot": g.beginPath(); g.arc(x, y, r * 0.45, 0, 7); g.fill(); break;
        case "cross": g.fillRect(x - r * 0.22, y - r, r * 0.44, w); g.fillRect(x - r, y - r * 0.22, w, r * 0.44); break;
      }
    }
    // parlama
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,.5)"); gr.addColorStop(0.4, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(0,0,0,.3)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    g.restore();
    const p = playerOf(t.id);
    g.lineWidth = Math.max(2, r * 0.14); g.strokeStyle = p ? p.color : (S.match.time < b.frozenUntil ? "#9fe8ff" : "rgba(255,255,255,.9)");
    g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    // kısa isim
    const fs = Math.max(10, r * 0.9);
    g.font = `900 ${fs}px Rubik, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = fs * 0.28; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(t.short, x, y - r - fs * 0.6);
    g.fillStyle = p ? p.color : "#fff"; g.fillText(t.short, x, y - r - fs * 0.6);
  }

  function draw() {
    const m = S.match; if (!m) return;
    const shorts = document.body.classList.contains("shorts");
    const cv = shorts ? $("scv") : $("cv");
    const [w, h] = sizeCanvas(cv);
    const g = cv.getContext("2d");
    const px = w / m.G, now = performance.now();
    g.imageSmoothingEnabled = false;
    g.drawImage(paintCv, 0, 0, w, h);
    // güçlendirmeler
    for (const p of m.powers) {
      const x = p.x * px, y = p.y * px, rr = px * 1.6 * (1 + 0.08 * Math.sin(now / 150));
      g.fillStyle = "rgba(5,11,23,.75)"; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      g.strokeStyle = "#ffd84a"; g.lineWidth = Math.max(2, px * 0.2); g.stroke();
      g.font = `${rr * 1.2}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(E.POWERS[p.type].icon, x, y + rr * 0.05);
    }
    // efektler
    S.fx = S.fx.filter((f) => now - f.t0 < 600);
    for (const f of S.fx) {
      const k = (now - f.t0) / 600;
      g.strokeStyle = `rgba(255,255,255,${1 - k})`; g.lineWidth = px * 0.6;
      g.beginPath(); g.arc(f.x * px, f.y * px, f.r * px * (0.3 + k), 0, 7); g.stroke();
    }
    for (const b of m.balls) drawBall(g, b, m.teams[b.i], px, now);
  }

  /* ---------------- Döngü ---------------- */
  const DT = 1 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    const m = S.match;
    if (m && S.state === "countdown") {
      S.countT += real;
      const n = 3 - Math.floor(S.countT);
      if (n !== S.shown) {
        S.shown = n;
        for (const id of ["count", "scount"]) { const c = $(id); c.textContent = n > 0 ? n : "BAŞLA!"; c.classList.remove("show"); void c.offsetWidth; c.classList.add("show"); }
        sfx("beep", n <= 0);
      }
      if (S.countT >= 3) { S.state = "playing"; setTimeout(() => { $("count").classList.remove("show"); $("scount").classList.remove("show"); }, 600); }
    }
    if (m && S.state === "playing") {
      acc += real * S.speed;
      let steps = 0;
      while (acc >= DT && steps < 12 && !m.over) { E.step(m, DT); acc -= DT; steps++; }
      flushPaint(); handleEvents();
      const rem = m.duration - m.time;
      setTimer(rem);
      const sec = Math.ceil(rem);
      if (rem <= 10 && rem > 0 && sec !== S.lastSec) { S.lastSec = sec; sfx("beep", false); if (sec === 10) flash("⏱️ SON 10 SANİYE!"); }
      renderBoard(false);
    }
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------------- Başlat ---------------- */
  async function init() {
    segInit("segSet", (v) => { S.set = v; S.count = v === "superlig" ? "all" : 16; renderSetup(); });
    segInit("segDur", (v) => (S.dur = +v));
    segInit("segPow", (v) => (S.powers = v === "1"));
    segInit("segSpeed", (v) => (S.speed = +v));
    $("addP").onclick = () => { if (setupRows.length < PLAYER_COLORS.length) { setupRows.push({ name: `Oyuncu ${setupRows.length + 1}`, id: "" }); renderSetup(); } };
    $("startBtn").onclick = prepareFromSetup;
    $("btnNew").onclick = openSetup;
    $("btnStart").onclick = start;
    $("btnRestart").onclick = () => S.teams.length && newMatch(S.teams);
    $("btnShorts").onclick = () => { document.body.classList.add("shorts"); renderBoard(true); if (S.state === "done") $("swin").classList.add("show"); };
    $("sexit").onclick = () => { document.body.classList.remove("shorts"); if (S.state === "done") showResults(E.standings(S.match)); };
    $("scv").onclick = () => { if (S.state === "ready" || S.state === "paused" || S.state === "playing") start(); };
    $("cv").onclick = () => { if (S.state === "ready") start(); };
    document.addEventListener("keydown", (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); start(); }
      if (e.code === "Escape" && document.body.classList.contains("shorts")) $("sexit").click();
    });
    await loadFlags();
    // açılışta Süper Lig maçı hazır olsun, ayarlar penceresi açık
    newMatch(SETS.superlig.teams.slice());
    openSetup();
    requestAnimationFrame(frame);
  }
  init();
})();
