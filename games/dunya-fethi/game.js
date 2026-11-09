/* Dünya Fethi — TheBullucks */
(function () {
  "use strict";

  const CD = window.COUNTRY_DATA;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (n) => Math.floor(Math.random() * n);

  const PLAYER_COLORS = ["#ffd84a", "#ff4dd2", "#46d39a", "#ff7b39", "#7fd3ff", "#b388ff"];
  const SPEEDS = {
    slow: { roll: 1500, gap: 900 },
    normal: { roll: 850, gap: 450 },
    fast: { roll: 350, gap: 150 },
    turbo: { roll: 0, gap: 40 },
  };

  const S = {
    terr: [],          // {code,name,pop,feature,el,tinyEl,patImg,owner,lp,dist[]}
    emp: new Map(),    // founderIdx -> {id, terr:Set, alive}
    flags: {},         // code -> data uri
    battles: 0,
    running: false,
    busy: false,
    speed: "normal",
    pair: "near",
    mult: "country",
    players: [],       // {name,color,code,idx,out,place}
    elimOrder: 0,
    upset: null,
    biggest: null,
    over: false,
  };

  /* ---------------- Veri yükleme ---------------- */

  const NAME_FIX = { "Kosovo": "XK", "N. Cyprus": "CY", "Somaliland": "SO", "Northern Cyprus": "CY" };

  function normCode(c) {
    if (!c) return null;
    c = String(c);
    if (/^[A-Z]{2}$/.test(c)) return c;
    if (/^[A-Z]{3}$/.test(c)) return CD.a3[c] || null;
    if (/^-?\d+$/.test(c)) {
      const p = c.padStart(3, "0");
      return CD.num[p] || CD.num[String(+c)] || null;
    }
    return null;
  }

  async function loadTopojson() {
    if (window.topojson) return window.topojson;
    const m = await import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm");
    return m;
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const SOURCES = [
    {
      name: "yerel",
      load: async () => {
        const r = await fetch("data/world.json");
        if (!r.ok) throw new Error("yok");
        const j = await r.json();
        if (j.type === "Topology") {
          const tj = await loadTopojson();
          const key = Object.keys(j.objects)[0];
          return tj.feature(j, j.objects[key]).features;
        }
        return j.features;
      },
    },
    {
      name: "world-atlas",
      load: async () => {
        const m = await import("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json/+esm");
        const topo = m.default || m;
        const tj = await loadTopojson();
        return tj.feature(topo, topo.objects.countries).features;
      },
    },
    {
      name: "datamaps",
      load: async () => {
        await loadScript("https://cdn.jsdelivr.net/npm/datamaps@0.5.9/dist/datamaps.world.min.js");
        const topo = window.Datamap.prototype.worldTopo;
        const tj = await loadTopojson();
        return tj.feature(topo, topo.objects.world).features;
      },
    },
  ];

  async function loadWorld() {
    for (const src of SOURCES) {
      try {
        const feats = await src.load();
        if (feats && feats.length > 100) { console.log("[DF] harita kaynağı:", src.name); return feats; }
      } catch (e) { console.log("[DF] kaynak başarısız:", src.name, e && e.message); }
    }
    throw new Error("Harita verisi yüklenemedi");
  }

  async function loadFlags() {
    const urls = [
      "https://cdn.jsdelivr.net/npm/country-flag-icons@1/string/3x2/+esm",
      "https://cdn.jsdelivr.net/npm/country-flag-icons@1/string/3x2/index.js",
    ];
    for (const u of urls) {
      try {
        const m = await import(u);
        const out = {};
        for (const k of Object.keys(m)) {
          if (/^[A-Z]{2}$/.test(k) && typeof m[k] === "string") {
            out[k] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(m[k]);
          }
        }
        if (Object.keys(out).length > 100) return out;
      } catch (e) { console.log("[DF] bayrak kaynağı başarısız", u, e && e.message); }
    }
    return {};
  }

  function colorFor(code) {
    let h = 0;
    for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h},55%,48%)`;
  }

  function emojiFlag(code) {
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  function fallbackFlag(code) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><rect width="60" height="40" fill="${colorFor(code)}"/><text x="30" y="26" font-size="16" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">${code}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function flagOf(code) { return S.flags[code] || fallbackFlag(code); }

  /* ---------------- Yardımcılar ---------------- */

  function multFromPop(p) {
    if (p >= 1000) return 2.0;
    if (p >= 300) return 1.75;
    if (p >= 100) return 1.5;
    if (p >= 50) return 1.3;
    if (p >= 20) return 1.2;
    if (p >= 5) return 1.1;
    return 1.0;
  }

  function empPop(e) {
    let p = 0;
    for (const i of e.terr) p += S.terr[i].pop;
    return p;
  }

  function empMult(e) {
    return S.mult === "empire" ? multFromPop(empPop(e)) : multFromPop(S.terr[e.id].pop);
  }

  function fmtPop(p) {
    if (p >= 1000) return (p / 1000).toFixed(2).replace(".", ",") + " milyar";
    if (p >= 1) return (Math.round(p * 10) / 10).toString().replace(".", ",") + " milyon";
    return Math.round(p * 1000).toLocaleString("tr-TR") + " bin";
  }

  function aliveEmpires() { return [...S.emp.values()].filter((e) => e.alive); }

  function largestPolygonCentroid(f) {
    const g = f.geometry;
    if (g.type === "Polygon") return d3.geoCentroid(f);
    let best = null, bestA = -1;
    for (const coords of g.coordinates) {
      const poly = { type: "Polygon", coordinates: coords };
      const a = d3.geoArea(poly);
      if (a > bestA) { bestA = a; best = poly; }
    }
    return d3.geoCentroid(best);
  }

  /* ---------------- Harita ---------------- */

  let svg, gRoot, gTerr, gTiny, gOutline, gFx, defs, zoom, path, proj, W, H;

  function buildMap(features) {
    const wrap = $("mapwrap");
    W = wrap.clientWidth; H = wrap.clientHeight;
    svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`);
    defs = svg.append("defs");
    gRoot = svg.append("g");
    gTerr = gRoot.append("g");
    gTiny = gRoot.append("g");
    gOutline = gRoot.append("g");
    gFx = gRoot.append("g");

    // Ülkeleri hazırla (birleştir: aynı kod birden çok parçaysa)
    const byCode = new Map();
    for (const f of features) {
      const pn = f.properties && f.properties.name;
      const code = normCode((f.properties && (f.properties.id || f.properties.iso_a2)) || f.id) || NAME_FIX[pn];
      if (!code || code === "AQ") continue;
      const pop = CD.pop[code];
      if (pop == null || pop < 0.0009) continue;
      if (!f.geometry) continue;
      if (byCode.has(code)) {
        const prev = byCode.get(code);
        const toMulti = (g) => g.type === "Polygon" ? [g.coordinates] : g.coordinates;
        prev.geometry = { type: "MultiPolygon", coordinates: toMulti(prev.geometry).concat(toMulti(f.geometry)) };
      } else {
        byCode.set(code, { type: "Feature", id: code, properties: {}, geometry: f.geometry });
      }
    }

    const fc = { type: "FeatureCollection", features: [...byCode.values()] };
    proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], fc);
    path = d3.geoPath(proj);

    S.terr = [];
    for (const [code, f] of byCode) {
      const name = CD.names[code] || (f.properties && f.properties.name) || code;
      const lp = largestPolygonCentroid(f);
      S.terr.push({ code, name, pop: CD.pop[code], feature: f, owner: null, lp });
    }
    S.terr.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    S.terr.forEach((t, i) => (t.idx = i));

    // Mesafe matrisi (büyük parça merkezleri arası)
    const n = S.terr.length;
    for (const t of S.terr) t.dist = new Float32Array(n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = d3.geoDistance(S.terr[i].lp, S.terr[j].lp);
        S.terr[i].dist[j] = d; S.terr[j].dist[i] = d;
      }

    // Çizim
    for (const t of S.terr) {
      const d = path(t.feature);
      const b = path.bounds(t.feature);
      let x0 = b[0][0], y0 = b[0][1], x1 = b[1][0], y1 = b[1][1];
      const area = (x1 - x0) * (y1 - y0);
      const c = proj(t.lp) || [(x0 + x1) / 2, (y0 + y1) / 2];
      t.xy = c;
      t.tiny = !isFinite(area) || area < 40;
      if (t.tiny) { x0 = c[0] - 4; y0 = c[1] - 4; x1 = c[0] + 4; y1 = c[1] + 4; }
      // bayrak kaplama dikdörtgeni (3:2, "cover")
      const w = Math.max(x1 - x0, 0.5), h = Math.max(y1 - y0, 0.5);
      let fw, fh;
      if (w / h > 1.5) { fw = w; fh = w / 1.5; } else { fh = h; fw = h * 1.5; }
      const px = (x0 + x1) / 2 - fw / 2, py = (y0 + y1) / 2 - fh / 2;
      const pat = defs.append("pattern").attr("id", "p-" + t.code)
        .attr("patternUnits", "userSpaceOnUse").attr("x", px).attr("y", py)
        .attr("width", fw).attr("height", fh);
      t.patImg = pat.append("image").attr("width", fw).attr("height", fh)
        .attr("preserveAspectRatio", "none").attr("href", flagOf(t.code));
      t.el = gTerr.append("path").attr("class", "terr").attr("d", d)
        .attr("fill", `url(#p-${t.code})`).datum(t);
      if (t.tiny) {
        t.tinyEl = gTiny.append("circle").attr("class", "terr tiny").attr("cx", c[0]).attr("cy", c[1])
          .attr("r", 4).attr("fill", `url(#p-${t.code})`).datum(t);
      }
    }

    // Etkileşim
    const tip = $("tip");
    svg.selectAll(".terr")
      .on("mousemove", (ev, t) => {
        const e = S.emp.get(t.owner);
        const ownerT = S.terr[t.owner];
        const r = $("mapwrap").getBoundingClientRect();
        let html = `<div class="t"><img src="${flagOf(t.code)}" style="width:22px;height:15px;border-radius:2px;object-fit:cover">${t.name}</div>`;
        html += `<div class="s">Nüfus: ${fmtPop(t.pop)}</div>`;
        if (ownerT && ownerT.idx !== t.idx) html += `<div class="s">Sahibi: <b style="color:var(--orange2)">${ownerT.name}</b></div>`;
        if (e) html += `<div class="s">İmparatorluk: ${e.terr.size} ülke · ×${empMult(e).toFixed(2)}</div>`;
        tip.innerHTML = html;
        tip.style.display = "block";
        let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
        if (x + 200 > r.width) x -= 220;
        if (y + 110 > r.height) y -= 120;
        tip.style.left = x + "px"; tip.style.top = y + "px";
      })
      .on("mouseleave", () => (tip.style.display = "none"));

    zoom = d3.zoom().scaleExtent([1, 14]).translateExtent([[-W * 0.2, -H * 0.2], [W * 1.2, H * 1.2]])
      .on("zoom", (ev) => gRoot.attr("transform", ev.transform));
    svg.call(zoom).on("dblclick.zoom", null);
    $("zIn").onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.6);
    $("zOut").onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.6);
    $("zReset").onclick = () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
  }

  function paintTerr(t) {
    const owner = S.terr[t.owner];
    t.patImg.attr("href", flagOf(owner.code));
  }

  function drawPlayerOutlines() {
    gOutline.selectAll("*").remove();
    for (const p of S.players) {
      if (p.out) continue;
      const e = S.emp.get(p.idx);
      if (!e || !e.alive) continue;
      const feats = [...e.terr].map((i) => S.terr[i].feature);
      gOutline.append("path").attr("class", "pl-outline").attr("stroke", p.color)
        .attr("d", path({ type: "FeatureCollection", features: feats }));
    }
  }

  /* ---------------- Oyun durumu ---------------- */

  function resetGame() {
    S.emp = new Map();
    for (const t of S.terr) {
      t.owner = t.idx;
      S.emp.set(t.idx, { id: t.idx, terr: new Set([t.idx]), alive: true });
      paintTerr(t);
      t.el.classed("atk def", false);
    }
    S.battles = 0; S.over = false; S.upset = null; S.biggest = null; S.elimOrder = 0;
    for (const p of S.players) { p.out = false; p.place = null; }
    $("log").innerHTML = "";
    $("result").textContent = "Başlamak için “Savaş!” tuşuna bas.";
    renderSide($("sideA"), null, "Saldıran");
    renderSide($("sideB"), null, "Savunan");
    gFx.selectAll("*").remove();
    updateUI();
  }

  function pickPair() {
    const alive = aliveEmpires();
    if (alive.length < 2) return null;
    const A = alive[rnd(alive.length)];
    let B;
    if (S.pair === "random") {
      do { B = alive[rnd(alive.length)]; } while (B === A);
    } else {
      // En yakın 3 imparatorluktan biri
      const best = new Map(); // empId -> min dist
      for (const i of A.terr) {
        const di = S.terr[i].dist;
        for (let j = 0; j < S.terr.length; j++) {
          const o = S.terr[j].owner;
          if (o === A.id) continue;
          const d = di[j];
          const cur = best.get(o);
          if (cur === undefined || d < cur) best.set(o, d);
        }
      }
      const sorted = [...best.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3);
      const w = [0.55, 0.3, 0.15].slice(0, sorted.length);
      let r = Math.random() * w.reduce((a, b) => a + b, 0), k = 0;
      while (r > w[k] && k < w.length - 1) { r -= w[k]; k++; }
      B = S.emp.get(sorted[k][0]);
    }
    return [A, B];
  }

  function nearestPair(A, B) {
    let best = Infinity, bi = null, bj = null;
    for (const i of A.terr) for (const j of B.terr) {
      const d = S.terr[i].dist[j];
      if (d < best) { best = d; bi = i; bj = j; }
    }
    return [S.terr[bi], S.terr[bj]];
  }

  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHTML(v, rolling) {
    let s = `<div class="die${rolling ? " roll" : ""}">`;
    for (let i = 0; i < 9; i++) s += `<i class="${PIPS[v].includes(i) ? "on" : ""}"></i>`;
    return s + "</div>";
  }

  function renderSide(el, e, label, dice, rolling, score) {
    el.classList.remove("win", "lose");
    if (!e) { el.innerHTML = `<div class="sub">${label}</div><div style="height:110px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:30px">?</div>`; return; }
    const t = S.terr[e.id];
    const m = empMult(e);
    el.innerHTML = `<div class="sub">${label}</div>
      <img class="flag" src="${flagOf(t.code)}" alt="">
      <div class="nm">${t.name}</div>
      <div class="sub">${e.terr.size} ülke · ${fmtPop(empPop(e))}</div>
      <div class="mult">Çarpan ×${m.toFixed(2)}</div>
      <div class="dice">${(dice || [1, 1, 1]).map((v) => dieHTML(v, rolling)).join("")}</div>
      <div class="score">${score != null ? score.toFixed(1).replace(".", ",") : "–"}</div>`;
  }

  const roll3 = () => [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)];

  async function battle(animated = true) {
    if (S.over) return;
    const pair = pickPair();
    if (!pair) return;
    const [A, B] = pair;
    const sp = SPEEDS[S.speed];
    const anim = animated && sp.roll > 0;

    // vurgu
    gTerr.selectAll(".terr").classed("atk def", false);
    if (animated) {
      for (const i of A.terr) S.terr[i].el.classed("atk", true);
      for (const i of B.terr) S.terr[i].el.classed("def", true);
      gFx.selectAll("*").remove();
      const [ta, tb] = nearestPair(A, B);
      const [x1, y1] = ta.xy, [x2, y2] = tb.xy;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.25;
      gFx.append("path").attr("class", "bline").attr("d", `M${x1},${y1} Q${mx},${my} ${x2},${y2}`);
    }

    const mA = empMult(A), mB = empMult(B);
    let dA, dB, sA, sB, ties = 0;
    while (true) {
      dA = roll3(); dB = roll3();
      sA = (dA[0] + dA[1] + dA[2]) * mA;
      sB = (dB[0] + dB[1] + dB[2]) * mB;
      sA = Math.round(sA * 10) / 10; sB = Math.round(sB * 10) / 10;
      if (anim) {
        const t0 = performance.now();
        $("result").textContent = ties ? "Berabere! Zarlar yeniden atılıyor…" : "Zarlar atılıyor…";
        while (performance.now() - t0 < sp.roll) {
          renderSide($("sideA"), A, "Saldıran", roll3(), true, null);
          renderSide($("sideB"), B, "Savunan", roll3(), true, null);
          await sleep(70);
        }
      }
      if (sA !== sB) break;
      ties++;
      if (animated) {
        renderSide($("sideA"), A, "Saldıran", dA, false, sA);
        renderSide($("sideB"), B, "Savunan", dB, false, sB);
        if (anim) { $("result").textContent = "Berabere!"; await sleep(500); }
      }
    }

    const Wn = sA > sB ? A : B, L = Wn === A ? B : A;
    const wM = Wn === A ? mA : mB, lM = Wn === A ? mB : mA;
    if (animated) {
      renderSide($("sideA"), A, "Saldıran", dA, false, sA);
      renderSide($("sideB"), B, "Savunan", dB, false, sB);
      $(Wn === A ? "sideA" : "sideB").classList.add("win");
      $(Wn === A ? "sideB" : "sideA").classList.add("lose");
    }

    // Fetih
    const lostCount = L.terr.size;
    for (const i of L.terr) {
      const t = S.terr[i];
      t.owner = Wn.id; Wn.terr.add(i);
      if (animated) { paintTerr(t); t.el.classed("flash", false); t.el.node().getBoundingClientRect(); t.el.classed("flash", true); }
    }
    L.terr = new Set(); L.alive = false;
    S.battles++;

    if (lM - wM > 0 && (!S.upset || lM - wM > S.upset.gap)) S.upset = { gap: lM - wM, w: Wn.id, l: L.id };
    if (!S.biggest || lostCount > S.biggest.n) S.biggest = { n: lostCount, w: Wn.id, l: L.id };

    const wn = S.terr[Wn.id], ln = S.terr[L.id];
    const msg = lostCount > 1
      ? `<b>${wn.name}</b> <span class="x">→</span> ${ln.name} imparatorluğunu yıktı (${lostCount} ülke)`
      : `<b>${wn.name}</b> <span class="x">→</span> ${ln.name} fethedildi`;
    addLog(wn.code, ln.code, msg, sA, sB);
    if (animated) $("result").innerHTML = `<span style="color:var(--win)">${wn.name}</span> kazandı! ${ln.name} fethedildi.`;

    // Oyuncu elemeleri
    const aliveCount = aliveEmpires().length;
    for (const p of S.players) {
      if (!p.out && p.idx === L.id) {
        p.out = true; p.place = aliveCount + 1;
        if (animated) toast(`${p.name} elendi! (${ln.name}, ${wn.name} tarafından fethedildi)`);
      }
    }

    if (animated) { updateUI(); drawPlayerOutlines(); }
    if (aliveCount <= 1) { if (!animated) refreshAll(); finish(); }
  }

  function addLog(wc, lc, msg, sA, sB) {
    const div = document.createElement("div");
    div.innerHTML = `<img src="${flagOf(wc)}" alt=""><span>${msg}</span>`;
    const log = $("log");
    log.prepend(div);
    while (log.children.length > 60) log.lastChild.remove();
  }

  function refreshAll() {
    for (const t of S.terr) { paintTerr(t); }
    gTerr.selectAll(".terr").classed("atk def", false);
    gFx.selectAll("*").remove();
    updateUI(); drawPlayerOutlines();
  }

  function updateUI() {
    const alive = aliveEmpires();
    $("hudAlive").textContent = alive.length;
    $("hudBattles").textContent = S.battles;
    const top = alive.sort((a, b) => b.terr.size - a.terr.size || empPop(b) - empPop(a)).slice(0, 10);
    $("lb").innerHTML = top.map((e, i) => {
      const t = S.terr[e.id];
      const pl = S.players.filter((p) => p.idx === e.id).map((p) => `<span class="pl" style="background:${p.color}" title="${p.name}"></span>`).join("");
      return `<li><span class="rk">${i + 1}</span><img src="${flagOf(t.code)}" alt=""><span class="n">${t.name}${pl}</span><span class="c">${e.terr.size} ülke · ×${empMult(e).toFixed(2)}</span></li>`;
    }).join("");
    // oyuncular
    if (S.players.length) {
      $("playersCard").style.display = "";
      $("players").innerHTML = S.players.map((p) => {
        const t = S.terr[p.idx]; const e = S.emp.get(p.idx);
        const st = p.out ? `${p.place}. oldu` : `${e.terr.size} ülke`;
        return `<div class="pchip ${p.out ? "out" : ""}" style="border-color:${p.color}"><img src="${flagOf(t.code)}" alt=""><b>${p.name}</b> <span style="color:var(--muted)">${t.name}</span><span class="st">${st}</span></div>`;
      }).join("");
    } else $("playersCard").style.display = "none";
    const done = S.over;
    $("btnBattle").disabled = done || S.running;
    $("btnSkip").disabled = done;
    $("btnAuto").disabled = done;
    $("btnAuto").textContent = S.running ? "⏸ Durdur" : "▶ Otomatik";
  }

  function finish() {
    S.over = true; S.running = false;
    updateUI();
    const champ = aliveEmpires()[0];
    const t = S.terr[champ.id];
    let pl = "";
    if (S.players.length) {
      const winner = S.players.find((p) => p.idx === champ.id);
      if (winner) { winner.place = 1; pl = `<p style="font-size:18px;color:var(--text)">🏆 Kazanan oyuncu: <b style="color:${winner.color}">${winner.name}</b></p>`; }
      else {
        const sorted = S.players.slice().sort((a, b) => a.place - b.place);
        pl = `<p style="color:var(--text)">Hiçbir oyuncunun ülkesi sona kalamadı. En uzun dayanan: <b style="color:${sorted[0].color}">${sorted[0].name}</b> (${S.terr[sorted[0].idx].name})</p>`;
      }
    }
    const up = S.upset ? `${S.terr[S.upset.w].name} → ${S.terr[S.upset.l].name}` : "–";
    const bg = S.biggest ? `${S.terr[S.biggest.w].name} (${S.biggest.n} ülke aldı)` : "–";
    $("winBox").innerHTML = `<h2>DÜNYANIN <span>HAKİMİ</span></h2>
      <img src="${flagOf(t.code)}" alt="">
      <div style="font-family:Bungee,Rubik;font-size:28px">${t.name}</div>
      ${pl}
      <div class="stats">
        <div>Toplam savaş<b>${S.battles}</b></div>
        <div>Başlangıç nüfusu<b>${fmtPop(t.pop)}</b></div>
        <div>En büyük sürpriz<b>${up}</b></div>
        <div>En büyük tek fetih<b>${bg}</b></div>
      </div>
      <div class="controls"><button class="btn ghost" id="wClose">Haritaya bak</button><button class="btn or" id="wNew">Yeni Oyun</button></div>`;
    $("winModal").classList.add("show");
    $("wClose").onclick = () => $("winModal").classList.remove("show");
    $("wNew").onclick = () => { $("winModal").classList.remove("show"); openSetup(); };
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------------- Kontroller ---------------- */

  async function oneBattle() {
    if (S.busy || S.over) return;
    S.busy = true; updateUI();
    try { await battle(true); } finally { S.busy = false; updateUI(); }
  }

  async function autoLoop() {
    if (S.running) { S.running = false; updateUI(); return; }
    S.running = true; updateUI();
    while (S.running && !S.over) {
      if (!S.busy) {
        S.busy = true;
        try { await battle(true); } finally { S.busy = false; }
      }
      await sleep(SPEEDS[S.speed].gap);
    }
    S.running = false; updateUI();
  }

  async function skipToEnd() {
    S.running = false;
    while (S.busy) await sleep(30);
    S.busy = true;
    $("result").textContent = "Sonuç hesaplanıyor…";
    await sleep(20);
    let guard = 0;
    while (!S.over && guard++ < 5000) await battle(false);
    S.busy = false;
    refreshAll();
  }

  function segInit(id, key, after) {
    const seg = $(id);
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        S[key] = b.dataset.v;
        if (after) after();
      };
    });
  }

  /* ---------------- Kurulum ekranı ---------------- */

  let setupRows = [];
  function openSetup() {
    S.running = false;
    if (!setupRows.length) setupRows = [{ name: "Oyuncu 1", code: "?" }, { name: "Oyuncu 2", code: "?" }];
    renderSetup();
    $("setup").classList.add("show");
  }

  function countryOptions(sel) {
    let s = `<option value="">— Ülke seç —</option><option value="?" ${sel === "?" ? "selected" : ""}>🎲 Rastgele</option>`;
    for (const t of S.terr) s += `<option value="${t.code}" ${sel === t.code ? "selected" : ""}>${t.name}</option>`;
    return s;
  }

  function renderSetup() {
    $("prows").innerHTML = setupRows.map((r, i) => `
      <div class="prow">
        <span class="dot" style="background:${PLAYER_COLORS[i]}"></span>
        <input data-i="${i}" class="pn" value="${r.name.replace(/"/g, "&quot;")}" maxlength="18" placeholder="İsim">
        <select data-i="${i}" class="pc">${countryOptions(r.code)}</select>
        <button data-i="${i}" class="pd" title="Sil">✕</button>
      </div>`).join("") || `<p style="font-size:13px">Oyuncu yok — sadece izleme modu.</p>`;
    document.querySelectorAll(".pn").forEach((el) => (el.oninput = () => (setupRows[+el.dataset.i].name = el.value)));
    document.querySelectorAll(".pc").forEach((el) => (el.onchange = () => (setupRows[+el.dataset.i].code = el.value)));
    document.querySelectorAll(".pd").forEach((el) => (el.onclick = () => { setupRows.splice(+el.dataset.i, 1); renderSetup(); }));
    $("addP").disabled = setupRows.length >= PLAYER_COLORS.length;
  }

  function startFromSetup() {
    const used = new Set();
    const players = [];
    setupRows.forEach((r, i) => {
      if (!r.code) return;
      let code = r.code;
      if (code === "?" || used.has(code)) {
        const pool = S.terr.filter((t) => !used.has(t.code));
        code = pool[rnd(pool.length)].code;
      }
      used.add(code);
      const t = S.terr.find((x) => x.code === code);
      players.push({ name: (r.name || `Oyuncu ${i + 1}`).trim(), color: PLAYER_COLORS[i], code, idx: t.idx, out: false, place: null });
    });
    S.players = players;
    $("setup").classList.remove("show");
    resetGame();
    drawPlayerOutlines();
    if (players.length) toast(players.map((p) => `${p.name}: ${S.terr[p.idx].name}`).join(" · "));
  }

  /* ---------------- Başlat ---------------- */

  async function init() {
    try {
      const [features, flags] = await Promise.all([loadWorld(), loadFlags()]);
      S.flags = flags;
      buildMap(features);
      $("loading").style.display = "none";
      resetGame();
      openSetup();
    } catch (e) {
      console.error(e);
      $("loadingTxt").innerHTML = "Harita yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.<br><small>" + (e && e.message) + "</small>";
      document.querySelector(".spinner").style.display = "none";
    }

    $("btnBattle").onclick = oneBattle;
    $("btnAuto").onclick = autoLoop;
    $("btnSkip").onclick = skipToEnd;
    $("btnNew").onclick = openSetup;
    $("startGame").onclick = startFromSetup;
    $("addP").onclick = () => { if (setupRows.length < PLAYER_COLORS.length) { setupRows.push({ name: `Oyuncu ${setupRows.length + 1}`, code: "?" }); renderSetup(); } };
    $("randAll").onclick = () => { setupRows.forEach((r) => (r.code = "?")); renderSetup(); };
    $("btnFs").onclick = () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => toast("Tam ekran bu görünümde desteklenmiyor"));
      } catch (e) { toast("Tam ekran bu görünümde desteklenmiyor"); }
    };
    segInit("segSpeed", "speed");
    segInit("segPair", "pair");
    segInit("segMult", "mult", () => updateUI());
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); oneBattle(); }
    });
  }

  init();
})();
