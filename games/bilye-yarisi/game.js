/* Bilye Yarışı — arayüz, kamera, yarış akışı (TheBullucks) */
(function () {
  "use strict";
  const E = window.MarbleEngine;
  const CD = window.COUNTRY_DATA;
  const $ = (id) => document.getElementById(id);
  const PLAYER_COLORS = ["#ffd84a", "#ff4dd2", "#46d39a", "#ff7b39", "#7fd3ff", "#b388ff"];
  const EUROPE = "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH TR UA GB".split(" ");
  const fmtT = (s) => s.toFixed(1).replace(".", ",");
  const sfx = (name, ...a) => { if (!S.demo && window.SFX) window.SFX[name](...a); };

  /* ---------------- Bayraklar ---------------- */
  const FLAG_URI = {}, FLAG_SIZED = {}, BALL = {};
  function fallbackFlag(code) {
    let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 60 40"><rect width="60" height="40" fill="hsl(${h},55%,48%)"/><text x="30" y="27" font-size="17" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">${code}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  const flagOf = (code) => FLAG_URI[code] || fallbackFlag(code);
  async function loadFlags() {
    for (const u of ["https://cdn.jsdelivr.net/npm/country-flag-icons@1/string/3x2/+esm", "https://cdn.jsdelivr.net/npm/country-flag-icons@1/string/3x2/index.js"]) {
      try {
        const m = await import(u);
        let n = 0;
        for (const k of Object.keys(m)) if (/^[A-Z]{2}$/.test(k) && typeof m[k] === "string") {
          FLAG_URI[k] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(m[k]);
          // tuvale çizim için ölçülü sürüm (bazı tarayıcılar ölçüsüz SVG'yi çizmez)
          const sized = /<svg[^>]*\swidth=/.test(m[k]) ? m[k] : m[k].replace("<svg", '<svg width="96" height="64" preserveAspectRatio="none"');
          FLAG_SIZED[k] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sized);
          n++;
        }
        if (n > 100) return;
      } catch (e) { console.log("[BY] bayrak kaynağı başarısız", e && e.message); }
    }
  }
  // Bayraklı bilye görselini önceden çiz (döndürerek çizilecek)
  function ballImage(code) {
    if (BALL[code]) return BALL[code];
    const S = 64, c = document.createElement("canvas"); c.width = c.height = S;
    BALL[code] = c;
    const img = new Image();
    img.onload = () => {
      const g = c.getContext("2d");
      g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip();
      g.drawImage(img, -S * 0.25, 0, S * 1.5, S);
      // parlama
      const gr = g.createRadialGradient(S * 0.35, S * 0.3, 2, S / 2, S / 2, S / 2);
      gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(0.35, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(0,0,0,.35)");
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      g.restore();
      g.lineWidth = 3; g.strokeStyle = "rgba(5,11,23,.9)"; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.stroke();
    };
    img.src = FLAG_SIZED[code] || flagOf(code);
    return c;
  }

  /* ---------------- Durum ---------------- */
  const S = {
    track: E.TRACKS[0], mode: "race", count: 32, pool: "random",
    entrants: [], world: null, state: "idle", paused: false, speed: 1, cam: "leader", follow: null,
    camY: 0, round: 1, roundTracks: [], survivors: null, eliminated: [], thirdAt: null, leaderId: null,
    lastCast: 0, lastStuckCast: 0, players: [], countdownT: 0, shownCount: null, demo: false,
  };

  /* ---------------- Kurulum ---------------- */
  let setupRows = [{ name: "Oyuncu 1", code: "" }, { name: "Oyuncu 2", code: "" }];

  // Bağımlı bölgeler (yarışa girmez)
  const TERRITORIES = new Set("PR GL FK HK MO GF NC PF GP MQ RE YT PM SH SX MF BL AI MS TC WF MP BQ NF IO SJ TK NU CK AS GU VI VG KY BM AW CW FO GI IM JE GG AX EH TF HM GS BV UM CC CX PN AQ".split(" "));
  const countryList = () => Object.keys(CD.pop).filter((c) => CD.pop[c] >= 0.0009 && /^[A-Z]{2}$/.test(c) && CD.names[c] && !TERRITORIES.has(c)).sort((a, b) => CD.names[a].localeCompare(CD.names[b], "tr"));

  function renderSetup() {
    $("tracks").innerHTML = E.TRACKS.map((t) => `<button class="tcard ${t.id === S.track.id ? "on" : ""}" data-id="${t.id}"><span class="e">${t.emoji}</span><b>${t.name}</b><small>${t.desc}</small></button>`).join("");
    document.querySelectorAll(".tcard").forEach((el) => (el.onclick = () => { S.track = E.TRACKS.find((t) => t.id === el.dataset.id); renderSetup(); }));
    $("modeInfo").textContent = S.mode === "race"
      ? "Tek yarış: herkes finişe koşar, ilk üç kürsüye çıkar."
      : "Eleme turnuvası: her turda yarısı elenir, parkur her turda değişir. Son 4 bilye finalde kozlarını paylaşır!";
    const opts = `<option value="">— Ülke seç —</option><option value="?">🎲 Rastgele</option>` + countryList().map((c) => `<option value="${c}">${CD.names[c]}</option>`).join("");
    $("prows").innerHTML = setupRows.map((r, i) => `<div class="prow"><span class="dot" style="background:${PLAYER_COLORS[i]}"></span>
      <input class="pn" data-i="${i}" value="${r.name.replace(/"/g, "&quot;")}" maxlength="16"><select class="pc" data-i="${i}">${opts}</select>
      <button class="pd" data-i="${i}">✕</button></div>`).join("") || `<p style="font-size:13px">Oyuncu yok, sadece izleme modu.</p>`;
    document.querySelectorAll(".pc").forEach((el) => { el.value = setupRows[+el.dataset.i].code; el.onchange = () => (setupRows[+el.dataset.i].code = el.value); });
    document.querySelectorAll(".pn").forEach((el) => (el.oninput = () => (setupRows[+el.dataset.i].name = el.value)));
    document.querySelectorAll(".pd").forEach((el) => (el.onclick = () => { setupRows.splice(+el.dataset.i, 1); renderSetup(); }));
    $("addP").disabled = setupRows.length >= PLAYER_COLORS.length;
  }

  function segInit(id, fn) {
    const seg = $(id);
    seg.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on"); fn(b.dataset.v);
    }));
  }

  function pickEntrants() {
    const all = countryList();
    const used = new Set(), players = [];
    setupRows.forEach((r, i) => {
      if (!r.code) return;
      let code = r.code;
      if (code === "?" || used.has(code)) { const pool = all.filter((c) => !used.has(c)); code = pool[Math.floor(Math.random() * pool.length)]; }
      used.add(code);
      players.push({ name: (r.name || `Oyuncu ${i + 1}`).trim(), color: PLAYER_COLORS[i], code });
    });
    let pool = all.filter((c) => !used.has(c));
    if (S.pool === "big") pool.sort((a, b) => CD.pop[b] - CD.pop[a]);
    else { if (S.pool === "europe") pool = pool.filter((c) => EUROPE.includes(c)); pool.sort(() => Math.random() - 0.5); }
    const codes = S.count === "all" ? [...used, ...pool] : [...used, ...pool].slice(0, Math.max(S.count, used.size));
    S.players = players;
    return codes.map((code) => ({ code, name: CD.names[code] || code }));
  }

  /* ---------------- Yarış akışı ---------------- */
  function trackFor(round) {
    if (round === 1) return S.track;
    const others = E.TRACKS.filter((t) => t.id !== S.roundTracks[S.roundTracks.length - 1].id);
    return others[Math.floor(Math.random() * others.length)];
  }

  function startRace(entrants, track) {
    S.entrants = entrants;
    S.roundTracks.push(track);
    S.world = E.createWorld(track, entrants);
    S.state = "countdown"; S.countdownT = 0; S.shownCount = null; S.paused = false;
    S.thirdAt = null; S.leaderId = null; S.follow = null; S.lastCast = 0;
    S.camY = S.world.T.spawnY;
    entrants.forEach((e) => ballImage(e.code));
    const keep = keepCount();
    $("hudTrack").textContent = `${track.emoji} ${track.name}${S.mode === "elim" ? ` · ${roundName(entrants.length)}${keep > 1 ? ` (ilk ${keep} geçer)` : ""}` : ""}`;
    $("log").innerHTML = "";
    $("btnPlay").textContent = "⏸ Duraklat";
    $("resModal").classList.remove("show");
    log(`<b>${track.name}</b> parkurunda ${entrants.length} bilye yarışıyor!`);
    renderStandings(true);
  }

  function keepCount() {
    if (S.mode !== "elim") return 0;
    const n = S.entrants.length;
    return n <= 4 ? 1 : Math.ceil(n / 2);
  }
  function roundName(n) { return n <= 4 ? "FİNAL" : n <= 8 ? "Yarı Final" : `${S.round}. Tur`; }

  function newTournament() {
    S.demo = false;
    S.round = 1; S.roundTracks = []; S.eliminated = [];
    $("setup").classList.remove("show");
    startRace(pickEntrants(), S.track);
  }

  function endRace() {
    if (S.state === "done") return;
    S.state = "done";
    const st = E.standings(S.world);
    const keep = keepCount();
    if (S.mode === "elim" && keep > 1) return showRound(st, keep);
    showResults(st);
  }

  function playerOf(code) { return S.players.find((p) => p.code === code); }
  function plTag(code) { const p = playerOf(code); return p ? ` <span style="color:${p.color};font-weight:800">(${p.name})</span>` : ""; }

  function podiumHTML(st) {
    const top = st.slice(0, 3);
    const order = [1, 0, 2].filter((i) => top[i]);
    return `<div class="podium">${order.map((i) => {
      const m = top[i];
      return `<div class="pod p${i + 1}"><img src="${flagOf(m.code)}" alt=""><div class="nm">${m.name}${plTag(m.code)}</div><div class="t">${m.finished ? fmtT(m.finishTime) + " sn" : "–"}</div><div class="bar">${i + 1}</div></div>`;
    }).join("")}</div>`;
  }

  function showResults(st) {
    sfx("fanfare");
    const champ = st[0];
    const isFinal = S.mode === "elim";
    const pl = S.players.length ? `<p style="color:var(--text)">${S.players.map((p) => { const i = st.findIndex((m) => m.code === p.code); return `<b style="color:${p.color}">${p.name}</b>: ${i >= 0 ? i + 1 + "." : "elendi"}`; }).join(" · ")}</p>` : "";
    $("resBox").innerHTML = `<h2>${isFinal ? "TURNUVA <span>ŞAMPİYONU</span>" : "YARIŞ <span>SONUCU</span>"}</h2>
      ${isFinal ? `<p style="font-size:18px;color:var(--text)">🏆 <b>${champ.name}</b>${plTag(champ.code)} turnuvayı kazandı!</p>` : ""}
      ${podiumHTML(st)}${pl}
      <div class="reslist">${st.map((m, i) => `<div>${i + 1}. ${m.name}${m.finished ? ` · ${fmtT(m.finishTime)} sn` : ""}</div>`).join("")}</div>
      <div class="controls"><button class="btn ghost" id="rLook">Parkura bak</button><button class="btn or" id="rAgain">${isFinal ? "Yeni turnuva" : "Tekrar yarış"}</button><button class="btn ghost full" id="rSetup">⚙️ Ayarları değiştir</button></div>`;
    $("resModal").classList.add("show");
    $("rLook").onclick = () => $("resModal").classList.remove("show");
    $("rAgain").onclick = () => { if (isFinal) newTournament(); else { S.roundTracks = []; startRace(S.entrants, S.track); } };
    $("rSetup").onclick = () => { $("resModal").classList.remove("show"); openSetup(); };
  }

  function showRound(st, keep) {
    sfx("win");
    const q = st.slice(0, keep), out = st.slice(keep);
    S.eliminated.push(...out);
    $("resBox").innerHTML = `<h2>${roundName(st.length).toUpperCase()} <span>BİTTİ</span></h2>
      <p>İlk ${keep} bilye bir sonraki tura geçti, ${out.length} bilye elendi.</p>
      ${podiumHTML(st)}
      <div class="reslist">${q.map((m, i) => `<div class="q">✔ ${i + 1}. ${m.name}${plTag(m.code)}</div>`).join("")}${out.map((m, i) => `<div class="x">✕ ${keep + i + 1}. ${m.name}${plTag(m.code)}</div>`).join("")}</div>
      <div class="controls"><button class="btn ghost" id="rLook">Parkura bak</button><button class="btn or" id="rNext">${keep <= 4 ? "🔥 Finale geç" : "Sonraki tur →"}</button></div>`;
    $("resModal").classList.add("show");
    $("rLook").onclick = () => $("resModal").classList.remove("show");
    $("rNext").onclick = () => {
      S.round++;
      startRace(q.map((m) => ({ code: m.code, name: m.name })), trackFor(S.round));
    };
  }

  function openSetup() { S.paused = true; renderSetup(); $("setup").classList.add("show"); }

  /* ---------------- Yorumcu ---------------- */
  function log(html) {
    const d = document.createElement("div"); d.innerHTML = html;
    const l = $("log"); l.prepend(d); while (l.children.length > 30) l.lastChild.remove();
  }
  let castTimer = null;
  function cast(code, text) {
    const el = $("caster");
    el.innerHTML = (code ? `<img src="${flagOf(code)}" alt="">` : "") + text;
    el.classList.add("show");
    clearTimeout(castTimer); castTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function handleEvents() {
    const w = S.world;
    if (S.demo) {
      w.events.length = 0;
      if (w.finishedCount >= w.marbles.length || w.raceTime > 120) { S.roundTracks = []; startRace(S.entrants, S.track); E.openGate(S.world); S.state = "racing"; }
      return;
    }
    while (w.events.length) {
      const ev = w.events.shift(), m = ev.m;
      if (ev.type === "finish") {
        const medal = ["🥇", "🥈", "🥉"][m.place - 1];
        if (m.place <= 3 || playerOf(m.code)) sfx("ding", m.place);
        if (medal) { cast(m.code, `${medal} ${m.name} ${m.place}. oldu! (${fmtT(m.finishTime)} sn)`); log(`${medal} <b>${m.name}</b>${plTag(m.code)} finişte! ${fmtT(m.finishTime)} sn`); }
        else if (playerOf(m.code)) log(`🏁 <b>${m.name}</b>${plTag(m.code)} ${m.place}. sırada bitirdi`);
        if (m.place === 3) S.thirdAt = w.raceTime;
      } else if (ev.type === "stuck") {
        if (w.time - S.lastStuckCast > 6) { S.lastStuckCast = w.time; log(`💨 <b>${m.name}</b> takıldı, rüzgâr itti!`); }
      }
    }
    // lider değişimi
    if (w.started && w.finishedCount === 0) {
      let lead = null;
      for (const m of w.marbles) if (!lead || m.y > lead.y) lead = m;
      if (lead && lead.id !== S.leaderId && w.time - S.lastCast > 3) {
        if (S.leaderId !== null) { sfx("blip"); cast(lead.code, `${lead.name} öne geçti!`); log(`⚡ <b>${lead.name}</b>${plTag(lead.code)} liderliği aldı`); }
        S.leaderId = lead.id; S.lastCast = w.time;
      }
    }
    // bitiş koşulları
    const n = w.marbles.length, keep = keepCount();
    if (S.mode === "elim" && keep > 1) { if (w.finishedCount >= keep) setTimeout(endRace, 1500), (S.state = "ending"); }
    else if (w.finishedCount >= n || (S.thirdAt !== null && w.raceTime - S.thirdAt > 20) || w.raceTime > 240) { S.state = "ending"; setTimeout(endRace, 1500); }
  }

  /* ---------------- Sıralama paneli ---------------- */
  let lastStand = 0;
  function renderStandings(force) {
    const now = performance.now();
    if (!force && now - lastStand < 250) return;
    lastStand = now;
    const w = S.world; if (!w) return;
    const st = E.standings(w);
    const lead = st.find((m) => !m.finished);
    $("standings").innerHTML = st.map((m, i) => {
      const p = playerOf(m.code);
      const g = m.finished ? `${fmtT(m.finishTime)} sn` : lead && lead !== m ? `+${Math.round((lead.y - m.y) / 10)} m` : (!w.started ? "" : w.finishedCount ? "yolda" : "lider");
      const medal = m.finished && m.place <= 3 ? `<span class="medal">${["🥇", "🥈", "🥉"][m.place - 1]}</span>` : i + 1;
      return `<div class="st ${m.finished ? "fin" : ""} ${S.follow === m.id ? "sel" : ""}" data-id="${m.id}"><span class="p">${medal}</span><img src="${flagOf(m.code)}" alt=""><span class="n">${m.name}${p ? `<span class="pl" style="background:${p.color}"></span>` : ""}</span><span class="g">${g}</span></div>`;
    }).join("");
    document.querySelectorAll(".st").forEach((el) => (el.onclick = () => { const id = +el.dataset.id; S.follow = S.follow === id ? null : id; renderStandings(true); }));
    $("hudTime").textContent = fmtT(w.raceTime);
    $("hudFin").textContent = `${w.finishedCount}/${w.marbles.length}`;
  }

  /* ---------------- Çizim ---------------- */
  const cv = $("cv"), ctx = cv.getContext("2d");
  let CW = 0, CH = 0, DPR = 1;
  function resize() {
    const r = $("stage").getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    CW = r.width; CH = r.height;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  }
  window.addEventListener("resize", resize);

  const STYLE = {
    wall: ["#163a6b", "#3fb6f0"], side: ["#0f2a52", "#2a6fb0"], gate: ["#5a4a10", "#ffd84a"],
    move: ["#5a2a0a", "#f07a2a"], spin: ["#0f3d5a", "#7fd3ff"], deck: ["#5a2a0a", "#ffa15c"], plank: ["#4a2a10", "#e0a060"],
    door: ["#5a1a1a", "#ff5d6c"], arm: ["#3a3a4a", "#b8c4d8"], head: ["#5a1010", "#ff5d6c"], drum: ["#2a1a5a", "#b388ff"], flipper: ["#5a2a0a", "#ffd84a"],
  };

  function draw() {
    const w = S.world; if (!w) return;
    const T = w.T;
    let scale = CW / (E.W + 40);
    if (S.cam === "wide") scale *= 0.55;
    // kamera hedefi
    let target = S.camY;
    const live = w.marbles.filter((m) => !m.finished);
    if (S.follow !== null) target = w.marbles[S.follow].y;
    else if (!w.started) target = T.spawnY + 80;
    else if (live.length === 0) target = T.finishY + 200;
    else if (S.cam === "pack") { const ys = live.map((m) => m.y).sort((a, b) => a - b); target = ys[Math.floor(ys.length / 2)]; }
    else target = Math.max(...live.map((m) => m.y));
    S.camY += (target - S.camY) * 0.08;
    const viewH = CH / scale;
    const top = Math.max(-150, Math.min(T.H - viewH + 50, S.camY - viewH * 0.45));
    const left = (CW / scale - E.W) / 2;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, "#071833"); bg.addColorStop(1, "#040a17");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
    ctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * left * scale, -DPR * top * scale);
    const y0 = top - 60, y1 = top + viewH + 60;

    // ızgara
    ctx.strokeStyle = "rgba(63,182,240,.05)"; ctx.lineWidth = 1;
    for (let gy = Math.floor(y0 / 80) * 80; gy < y1; gy += 80) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(E.W, gy); ctx.stroke(); }

    // bölüm yazıları
    ctx.font = "800 22px Rubik, sans-serif"; ctx.textAlign = "left";
    for (const l of T.labels) if (l.y > y0 && l.y < y1) { ctx.fillStyle = "rgba(127,211,255,.35)"; ctx.fillText(l.text, 40, l.y); }

    // süsler
    for (const d of T.decos) {
      if (d.kind === "tower" && d.y < y1 && d.y + d.h > y0) {
        ctx.fillStyle = "#3a1414"; ctx.fillRect(d.x - 14, d.y, 28, d.h);
        ctx.fillStyle = "#c0392b"; ctx.fillRect(d.x - 10, d.y, 20, d.h);
        ctx.fillStyle = "#e74c3c"; for (let k = 0; k < 4; k++) ctx.fillRect(d.x - 16, d.y + 40 + k * 120, 32, 10);
      } else if (d.kind === "cable" && d.y < y1 && d.y + d.sag > y0) {
        ctx.strokeStyle = "rgba(255,180,120,.6)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(d.x1, d.y); ctx.quadraticCurveTo((d.x1 + d.x2) / 2, d.y + d.sag * 2, d.x2, d.y); ctx.stroke();
        ctx.lineWidth = 1.5;
        for (let x = d.x1 + 50; x < d.x2; x += 50) { const u = (x - d.x1) / (d.x2 - d.x1); const cy = d.y + d.sag * 4 * u * (1 - u); ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x, d.y + d.sag + 40); ctx.stroke(); }
      } else if (d.kind === "drum" && Math.abs(d.y - (y0 + y1) / 2) < viewH) {
        ctx.fillStyle = "rgba(179,136,255,.07)"; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
      } else if (d.kind === "finish" && d.y > y0 && d.y < y1) {
        const s = 20;
        for (let x = 20, k = 0; x < E.W - 20; x += s, k++) for (let r = 0; r < 2; r++) { ctx.fillStyle = (k + r) % 2 ? "#fff" : "#111"; ctx.fillRect(x, d.y - s + r * s, s, s); }
        ctx.fillStyle = "#ffd84a"; ctx.font = "900 34px Bungee, Rubik"; ctx.textAlign = "center"; ctx.fillText("FİNİŞ", E.W / 2, d.y - 40); ctx.textAlign = "left";
      }
    }

    // engeller
    ctx.lineCap = "round";
    for (const o of T.obs) {
      if (o.type === "seg") {
        if (Math.max(o.ay, o.by) + o.t < y0 || Math.min(o.ay, o.by) - o.t > y1) continue;
        if (!o.active) continue;
        const st = STYLE[o.style] || STYLE.wall;
        ctx.strokeStyle = st[0]; ctx.lineWidth = o.t * 2;
        ctx.beginPath(); ctx.moveTo(o.ax, o.ay); ctx.lineTo(o.bx, o.by); ctx.stroke();
        ctx.strokeStyle = st[1]; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(o.ax, o.ay); ctx.lineTo(o.bx, o.by); ctx.stroke();
      } else {
        if (o.cy + o.r < y0 || o.cy - o.r > y1) continue;
        if (o.style === "balloon") {
          ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.25)";
          ctx.beginPath(); ctx.ellipse(o.cx, o.cy, o.r * 0.35, o.r, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, 0, 7); ctx.stroke();
          ctx.strokeStyle = "#c9a36b"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(o.cx - 8, o.cy + o.r - 2); ctx.lineTo(o.cx - 6, o.cy + o.r + 16); ctx.moveTo(o.cx + 8, o.cy + o.r - 2); ctx.lineTo(o.cx + 6, o.cy + o.r + 16); ctx.stroke();
          ctx.fillStyle = "#8a5a2b"; ctx.fillRect(o.cx - 8, o.cy + o.r + 14, 16, 10);
        } else if (o.style === "bumper") {
          const h = o.hit || 0;
          ctx.fillStyle = h > 0 ? "#fff" : "#ff4dd2"; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r + h * 12, 0, 7); ctx.fill();
          ctx.fillStyle = "#5a0a4a"; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r * 0.55, 0, 7); ctx.fill();
          if (o.hit) o.hit = Math.max(0, o.hit - 0.02);
        } else {
          ctx.fillStyle = o.style === "hub" ? "#7fd3ff" : "#3fb6f0";
          ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, 0, 7); ctx.fill();
        }
      }
    }
    for (const d of T.decos) if (d.kind === "pivot" && d.y > y0 && d.y < y1) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(d.x, d.y, 7, 0, 7); ctx.fill(); ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, 7); ctx.fill(); }

    // bilyeler
    const R = E.R;
    const st = E.standings(w);
    const rank = new Map(st.map((m, i) => [m.id, i]));
    for (const m of w.marbles) {
      if (m.y < y0 || m.y > y1) continue;
      const img = BALL[m.code];
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.ang);
      if (img) ctx.drawImage(img, -R, -R, 2 * R, 2 * R);
      ctx.restore();
      const p = playerOf(m.code);
      if (p || S.follow === m.id) { ctx.strokeStyle = p ? p.color : "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(m.x, m.y, R + 4, 0, 7); ctx.stroke(); }
    }
    // isimler (ilk 3, oyuncular, takip edilen)
    ctx.font = "800 13px Rubik, sans-serif"; ctx.textAlign = "center";
    for (const m of w.marbles) {
      if (m.y < y0 || m.y > y1) continue;
      const p = playerOf(m.code), r = rank.get(m.id);
      if (!(p || r < 3 || S.follow === m.id)) continue;
      const txt = (r < 3 ? ["🥇", "🥈", "🥉"][r] + " " : "") + m.name + (p ? ` · ${p.name}` : "");
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(5,11,23,.9)"; ctx.strokeText(txt, m.x, m.y - R - 8);
      ctx.fillStyle = p ? p.color : "#fff"; ctx.fillText(txt, m.x, m.y - R - 8);
    }

    // sağda ilerleme şeridi
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bx = CW - 18, by0 = 56, by1 = CH - 20, bh = by1 - by0;
    ctx.fillStyle = "rgba(11,26,51,.85)"; ctx.fillRect(bx - 6, by0 - 6, 12, bh + 12);
    ctx.fillStyle = "rgba(127,211,255,.25)";
    ctx.fillRect(bx - 6, by0 + (top / T.H) * bh, 12, (viewH / T.H) * bh);
    ctx.fillStyle = "#ffd84a"; ctx.fillRect(bx - 8, by0 + (T.finishY / T.H) * bh - 1, 16, 3);
    for (const m of w.marbles) {
      const yy = by0 + Math.max(0, Math.min(1, m.y / T.H)) * bh;
      const p = playerOf(m.code);
      ctx.fillStyle = p ? p.color : m.finished ? "#46d39a" : "#e8f1ff";
      ctx.beginPath(); ctx.arc(bx, yy, p ? 4 : 2.5, 0, 7); ctx.fill();
    }
    S._view = { scale, top, left };
  }

  // haritada bilyeye tıklayınca takip et
  cv.addEventListener("click", (ev) => {
    const w = S.world, v = S._view; if (!w || !v) return;
    const r = cv.getBoundingClientRect();
    const x = (ev.clientX - r.left) / v.scale - v.left, y = (ev.clientY - r.top) / v.scale + v.top;
    let best = null, bd = 30;
    for (const m of w.marbles) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } }
    S.follow = best ? best.id : null; renderStandings(true);
  });

  // çarpışma sesleri: sadece ekranda görünenler, en sert birkaç tanesi
  function playHits(w) {
    const hits = w.hits; if (!hits || !hits.length) return;
    const v = S._view;
    if (!S.demo && v && window.SFX && window.SFX.enabled) {
      const top = v.top, bot = v.top + CH / v.scale;
      const vis = hits.filter((h) => h[1] > top && h[1] < bot).sort((a, b) => b[2] - a[2]).slice(0, 3);
      for (const h of vis) {
        const pan = (h[0] / E.W) * 1.6 - 0.8;
        if (h[3] === "bumper") window.SFX.bonk(pan);
        else window.SFX.click(Math.min(1, h[2] / 900), pan);
      }
    }
    hits.length = 0;
  }

  /* ---------------- Döngü ---------------- */
  const DT = 1 / 240;
  let last = performance.now(), acc = 0;
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    const w = S.world;
    if (w && !S.paused) {
      if (S.state === "countdown") {
        S.countdownT += real;
        const n = 3 - Math.floor(S.countdownT);
        if (n !== S.shownCount) {
          S.shownCount = n;
          const c = $("count");
          c.textContent = n > 0 ? n : "BAŞLA!";
          sfx("beep", n <= 0);
          c.classList.remove("show"); void c.offsetWidth; c.classList.add("show");
        }
        if (S.countdownT >= 3) { E.openGate(w); S.state = "racing"; setTimeout(() => $("count").classList.remove("show"), 700); }
      }
      acc += real * S.speed;
      let steps = 0;
      while (acc >= DT && steps < 40) { E.step(w, DT); acc -= DT; steps++; }
      if (steps >= 40) acc = 0;
      if (S.state === "racing") handleEvents();
      playHits(w);
      renderStandings(false);
    }
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------------- Başlat ---------------- */
  async function init() {
    resize();
    segInit("segSpeed", (v) => (S.speed = +v));
    segInit("segCam", (v) => { S.cam = v; S.follow = null; });
    segInit("segMode", (v) => { S.mode = v; renderSetup(); });
    segInit("segCount", (v) => (S.count = v === "all" ? "all" : +v));
    segInit("segPool", (v) => (S.pool = v));
    $("addP").onclick = () => { if (setupRows.length < PLAYER_COLORS.length) { setupRows.push({ name: `Oyuncu ${setupRows.length + 1}`, code: "" }); renderSetup(); } };
    $("startBtn").onclick = newTournament;
    $("btnNew").onclick = openSetup;
    $("btnPlay").onclick = () => { S.paused = !S.paused; $("btnPlay").textContent = S.paused ? "▶ Devam" : "⏸ Duraklat"; };
    $("btnRestart").onclick = () => { S.round = 1; S.roundTracks = []; S.eliminated = []; startRace(S.mode === "elim" ? pickEntrants() : S.entrants.length ? S.entrants : pickEntrants(), S.track); };
    $("btnFs").onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {} };
    document.addEventListener("keydown", (e) => { if (e.code === "Space" && !/INPUT|SELECT/.test(e.target.tagName)) { e.preventDefault(); $("btnPlay").click(); } });
    await loadFlags();
    // arka planda bir tanıtım yarışı dönsün, kurulum ekranı açık
    S.entrants = []; S.players = [];
    S.demo = true;
    const allBtn = document.querySelector('#segCount button[data-v="all"]');
    if (allBtn) allBtn.textContent = `🌍 Tümü (${countryList().length})`;
    startRace(pickEntrants(), S.track);
    S.state = "racing"; E.openGate(S.world);
    openSetup(); S.paused = false;
    requestAnimationFrame(frame);
  }
  init();
})();
