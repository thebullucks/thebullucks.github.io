/* Dünya Fethi — TheBullucks */
(function () {
  "use strict";

  const CD = window.COUNTRY_DATA;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (n) => Math.floor(Math.random() * n);
  const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");

  const PLAYER_COLORS = ["#ffd84a", "#ff4dd2", "#46d39a", "#ff7b39", "#7fd3ff", "#b388ff"];

  // roll: zarların hep birlikte döndüğü süre
  // seq: zarlar tek tek mi açılsın, step: her zarın açılma aralığı
  // reveal: zarlar bitince kazanan açıklanmadan önceki bekleme
  // gap: sonuç ekranda kaldıktan sonra yeni savaşa kadar geçen süre (ms)
  const SPEEDS = {
    slow:   { roll: 1200, seq: true,  step: 800, reveal: 1100, gap: 4200 },
    normal: { roll: 900,  seq: true,  step: 550, reveal: 850,  gap: 3200 },
    fast:   { roll: 700,  seq: false, step: 0,   reveal: 500,  gap: 1500 },
    turbo:  { roll: 0,    seq: false, step: 0,   reveal: 0,    gap: 120 },
  };

  // Büyük ülkeler bölgelere ayrılır. Başkent bölgesi en son düşer.
  const KM2_PER_SR = 510072000 / (4 * Math.PI);
  const SPLIT3_KM2 = 5000000, SPLIT2_KM2 = 1900000;
  const CAPITALS = {
    RU: [37.62, 55.75], CA: [-75.7, 45.42], US: [-77.04, 38.9], CN: [116.4, 39.9], BR: [-47.88, -15.79],
    AU: [149.13, -35.28], IN: [77.21, 28.61], AR: [-58.38, -34.6], KZ: [71.45, 51.17], DZ: [3.06, 36.75],
    CD: [15.31, -4.32], GL: [-51.72, 64.18], SA: [46.72, 24.69], MX: [-99.13, 19.43], ID: [106.85, -6.21],
    SD: [32.53, 15.5], LY: [13.19, 32.89], IR: [51.39, 35.69], MN: [106.92, 47.92], PE: [-77.04, -12.05],
  };

  const S = {
    terr: [],          // bölgeler: {code,key,name,rname,isCap,nReg,pop,feature,el,tinyEl,patImg,owner,lp,xy,dist}
    capIdx: {},        // ülke kodu -> başkent bölgesinin indeksi
    emp: new Map(),    // kurucu (başkent bölgesi) indeksi -> {id, terr:Set, alive}
    flags: {},
    battles: 0,
    running: false,
    busy: false,
    speed: "normal",
    pair: "near",
    mult: "country",
    players: [],
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
    return await import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm");
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

  function fallbackFlag(code) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><rect width="60" height="40" fill="${colorFor(code)}"/><text x="30" y="26" font-size="16" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">${code}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function flagOf(code) { return S.flags[code] || fallbackFlag(code); }

  /* ---------------- Geometri yardımcıları ---------------- */

  const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

  function safeArea(poly) {
    const a = d3.geoArea({ type: "Polygon", coordinates: poly });
    return a > 2 * Math.PI ? 4 * Math.PI - a : a;
  }

  function largestPoly(g) {
    let best = null, bestA = -1;
    for (const p of polysOf(g)) {
      const a = safeArea(p);
      if (a > bestA) { bestA = a; best = p; }
    }
    return best;
  }

  // Ana kara doğunun uzağındaysa (Rusya) ya da batının uzağındaysa (ABD) tarih çizgisini aşan parçaları kaydır
  function unwrapLon(g) {
    const main = largestPoly(g);
    const c = d3.geoCentroid({ type: "Polygon", coordinates: main });
    // her noktayı ayrı ayrı kaydır: tarih çizgisini kesen tek parça halkalar da süreklileşir
    const fix = c[0] > 60 ? (q) => (q[0] < -90 ? [q[0] + 360, q[1]] : q)
      : c[0] < -60 ? (q) => (q[0] > 90 ? [q[0] - 360, q[1]] : q)
      : (q) => q;
    const polys = polysOf(g).map((p) => p.map((r) => r.map(fix)));
    return { type: "MultiPolygon", coordinates: polys };
  }

  function clipRing(ring, axis, val, keepLess) {
    const inside = (p) => (keepLess ? p[axis] <= val : p[axis] >= val);
    const out = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (val - a[axis]) / (b[axis] - a[axis]);
        const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        p[axis] = val;
        out.push(p);
      }
    }
    if (out.length < 3) return null;
    out.push(out[0].slice());
    return out;
  }

  function densify(ring) {
    const out = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const d = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      if (d > 1) {
        const n = Math.ceil(d);
        for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      }
      out.push(b);
    }
    return out;
  }

  function clipGeom(polys, axis, lo, hi) {
    const res = [];
    for (const p of polys) {
      const rings = [];
      for (let ri = 0; ri < p.length; ri++) {
        let r = p[ri];
        if (lo != null) r = r && clipRing(r, axis, lo, false);
        if (hi != null) r = r && clipRing(r, axis, hi, true);
        if (!r) { if (ri === 0) break; else continue; }
        rings.push(r);
      }
      if (rings.length && rings[0]) res.push(rings);
    }
    return res;
  }

  function areaOf(polys) { let a = 0; for (const p of polys) a += safeArea(p); return a; }

  function splitCountry(geom, n, capital) {
    const g = unwrapLon(geom);
    const polys = g.coordinates;
    const main = largestPoly(g);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of main[0]) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    const axis = (x1 - x0) >= (y1 - y0) * 1.1 ? 0 : 1;
    let lo = Infinity, hi = -Infinity;
    for (const p of polys) for (const q of p[0]) { lo = Math.min(lo, q[axis]); hi = Math.max(hi, q[axis]); }
    const total = areaOf(polys);
    const cuts = [];
    for (let k = 1; k < n; k++) {
      const target = total * k / n;
      let a = lo, b = hi;
      for (let it = 0; it < 30; it++) {
        const m = (a + b) / 2;
        if (areaOf(clipGeom(polys, axis, null, m)) < target) a = m; else b = m;
      }
      cuts.push((a + b) / 2);
    }
    const bounds = [null, ...cuts, null];
    const pieces = [];
    for (let k = 0; k < n; k++) {
      const part = clipGeom(polys, axis, bounds[k], bounds[k + 1])
        .map((p) => p.map(densify))
        .map((p) => (d3.geoArea({ type: "Polygon", coordinates: p }) > 2 * Math.PI ? p.map((r) => r.slice().reverse()) : p));
      pieces.push(part);
    }
    // başkent hangi parçada?
    let capK = 0;
    if (capital) {
      let v = capital[axis];
      if (axis === 0 && v < lo) v += 360;
      if (axis === 0 && v > hi) v -= 360;
      capK = cuts.filter((c) => c < v).length;
    }
    const labels = axis === 0
      ? (n === 3 ? ["Batı", "Orta", "Doğu"] : ["Batı", "Doğu"])
      : (n === 3 ? ["Güney", "Orta", "Kuzey"] : ["Güney", "Kuzey"]);
    return pieces.map((p, k) => ({
      geometry: { type: "MultiPolygon", coordinates: p },
      label: labels[k], isCap: k === capK,
    })).filter((x) => x.geometry.coordinates.length);
  }

  /* ---------------- Oyun yardımcıları ---------------- */

  function multFromPop(p) {
    if (p >= 1000) return 2.0;
    if (p >= 300) return 1.75;
    if (p >= 100) return 1.5;
    if (p >= 50) return 1.3;
    if (p >= 20) return 1.2;
    if (p >= 5) return 1.1;
    return 1.0;
  }

  function empPop(e) { let p = 0; for (const i of e.terr) p += S.terr[i].pop; return p; }
  function empCountries(e) { const s = new Set(); for (const i of e.terr) s.add(S.terr[i].code); return s.size; }
  function empMult(e) {
    return S.mult === "empire" ? multFromPop(empPop(e)) : multFromPop(CD.pop[S.terr[e.id].code]);
  }

  function fmtPop(p) {
    if (p >= 1000) return (p / 1000).toFixed(2).replace(".", ",") + " milyar";
    if (p >= 1) return (Math.round(p * 10) / 10).toString().replace(".", ",") + " milyon";
    return Math.round(p * 1000).toLocaleString("tr-TR") + " bin";
  }

  function aliveEmpires() { return [...S.emp.values()].filter((e) => e.alive); }
  const fullName = (t) => (t.rname ? `${t.name} · ${t.rname}` : t.name);

  /* ---------------- Harita ---------------- */

  let svg, gRoot, gTerr, gTiny, gOutline, gCap, gFx, defs, zoom, path, proj, W, H;

  function buildMap(features) {
    const wrap = $("mapwrap");
    W = wrap.clientWidth; H = wrap.clientHeight;
    svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`);
    defs = svg.append("defs");
    gRoot = svg.append("g");
    gTerr = gRoot.append("g");
    gTiny = gRoot.append("g");
    gOutline = gRoot.append("g");
    gCap = gRoot.append("g");
    gFx = gRoot.append("g");

    // Aynı koda ait parçaları birleştir
    const byCode = new Map();
    for (const f of features) {
      const pn = f.properties && f.properties.name;
      const code = normCode((f.properties && (f.properties.id || f.properties.iso_a2)) || f.id) || NAME_FIX[pn];
      if (!code || code === "AQ" || !f.geometry) continue;
      const pop = CD.pop[code];
      if (pop == null || pop < 0.0009) continue;
      if (byCode.has(code)) {
        const prev = byCode.get(code);
        prev.geometry = { type: "MultiPolygon", coordinates: polysOf(prev.geometry).concat(polysOf(f.geometry)) };
      } else byCode.set(code, { type: "Feature", id: code, properties: {}, geometry: f.geometry });
    }

    const fc = { type: "FeatureCollection", features: [...byCode.values()] };
    proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], fc);
    path = d3.geoPath(proj);

    // Bölgeleri oluştur
    S.terr = [];
    for (const [code, f] of byCode) {
      const name = CD.names[code] || code;
      const pop = CD.pop[code];
      const km2 = d3.geoArea(f) * KM2_PER_SR;
      const n = km2 >= SPLIT3_KM2 ? 3 : km2 >= SPLIT2_KM2 ? 2 : 1;
      let parts = null;
      if (n > 1) {
        try { parts = splitCountry(f.geometry, n, CAPITALS[code]); } catch (e) { console.log("[DF] bölme hatası", code, e); }
        if (!parts || parts.length < 2) parts = null;
      }
      if (!parts) parts = [{ geometry: f.geometry, label: null, isCap: true }];
      parts.forEach((p, k) => {
        S.terr.push({
          code, key: parts.length > 1 ? `${code}-${k}` : code, name,
          rname: parts.length > 1 ? (p.isCap ? `${p.label} (Başkent)` : p.label) : null,
          isCap: p.isCap, nReg: parts.length, pop: pop / parts.length,
          feature: { type: "Feature", properties: {}, geometry: p.geometry },
        });
      });
    }
    S.terr.sort((a, b) => a.name.localeCompare(b.name, "tr") || (b.isCap - a.isCap));
    S.terr.forEach((t, i) => {
      t.idx = i;
      if (t.isCap) S.capIdx[t.code] = i;
      t.mainPoly = largestPoly(t.feature.geometry);
      t.lp = d3.geoCentroid({ type: "Polygon", coordinates: t.mainPoly });
    });

    // Mesafe matrisi
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
      // Bayrağı ülkenin ANA kara parçasına göre yerleştir (deniz aşırı toprakları yok say)
      const b = path.bounds({ type: "Polygon", coordinates: t.mainPoly });
      let x0 = b[0][0], y0 = b[0][1], x1 = b[1][0], y1 = b[1][1];
      const fb = path.bounds(t.feature);
      const area = (fb[1][0] - fb[0][0]) * (fb[1][1] - fb[0][1]);
      const c = proj(t.lp) || [(x0 + x1) / 2, (y0 + y1) / 2];
      t.xy = c;
      t.tiny = !isFinite(area) || area < 40;
      if (t.tiny || !isFinite(x0)) { x0 = c[0] - 4; y0 = c[1] - 4; x1 = c[0] + 4; y1 = c[1] + 4; }
      const w = Math.max(x1 - x0, 0.5), h = Math.max(y1 - y0, 0.5);
      let fw, fh;
      if (w / h > 1.5) { fw = w; fh = w / 1.5; } else { fh = h; fw = h * 1.5; }
      const px = (x0 + x1) / 2 - fw / 2, py = (y0 + y1) / 2 - fh / 2;
      const pat = defs.append("pattern").attr("id", "p-" + t.key)
        .attr("patternUnits", "userSpaceOnUse").attr("x", px).attr("y", py)
        .attr("width", fw).attr("height", fh);
      t.patImg = pat.append("image").attr("width", fw).attr("height", fh)
        .attr("preserveAspectRatio", "none").attr("href", flagOf(t.code));
      t.el = gTerr.append("path").attr("class", "terr").attr("d", d)
        .attr("fill", `url(#p-${t.key})`).datum(t);
      if (t.tiny) {
        t.tinyEl = gTiny.append("circle").attr("class", "terr tiny").attr("cx", c[0]).attr("cy", c[1])
          .attr("r", 4).attr("fill", `url(#p-${t.key})`).datum(t);
      }
      if (t.nReg > 1 && t.isCap && CAPITALS[t.code]) {
        const cp = proj(CAPITALS[t.code]);
        if (cp) gCap.append("text").attr("class", "capstar").attr("x", cp[0]).attr("y", cp[1]).text("★");
      }
    }

    // Etkileşim
    const tip = $("tip");
    svg.selectAll(".terr")
      .on("mousemove", (ev, t) => {
        const e = S.emp.get(t.owner);
        const ownerT = S.terr[t.owner];
        const r = $("mapwrap").getBoundingClientRect();
        let html = `<div class="t"><img src="${flagOf(t.code)}" style="width:22px;height:15px;border-radius:2px;object-fit:cover">${fullName(t)}</div>`;
        html += `<div class="s">Nüfus: ${fmtPop(CD.pop[t.code])}${t.nReg > 1 ? ` · ${t.nReg} bölgeli büyük ülke` : ""}</div>`;
        if (ownerT && ownerT.code !== t.code) html += `<div class="s">Sahibi: <b style="color:var(--orange2)">${ownerT.name}</b></div>`;
        if (e) html += `<div class="s">İmparatorluk: ${empCountries(e)} ülke · ×${empMult(e).toFixed(2)}</div>`;
        tip.innerHTML = html;
        tip.style.display = "block";
        let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
        if (x + 220 > r.width) x -= 240;
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

  function paintTerr(t) { t.patImg.attr("href", flagOf(S.terr[t.owner].code)); }

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
      if (t.isCap) S.emp.set(t.idx, { id: t.idx, terr: new Set(), alive: true });
    }
    for (const t of S.terr) {
      t.owner = S.capIdx[t.code];
      S.emp.get(t.owner).terr.add(t.idx);
      paintTerr(t);
      t.el.classed("atk def", false);
    }
    S.battles = 0; S.over = false; S.upset = null; S.biggest = null;
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
      const best = new Map();
      for (const i of A.terr) {
        const di = S.terr[i].dist;
        for (let j = 0; j < S.terr.length; j++) {
          const o = S.terr[j].owner;
          if (o === A.id) continue;
          const d = di[j], cur = best.get(o);
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

  function nearestBetween(setA, setB) {
    let best = Infinity, bi = null, bj = null;
    for (const i of setA) for (const j of setB) {
      const d = S.terr[i].dist[j];
      if (d < best) { best = d; bi = i; bj = j; }
    }
    return [S.terr[bi], S.terr[bj]];
  }

  /* ---------------- Zar arayüzü ---------------- */

  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieInner = (v) => { let s = ""; for (let i = 0; i < 9; i++) s += `<i class="${PIPS[v].includes(i) ? "on" : ""}"></i>`; return s; };

  function renderSide(el, e, label) {
    el.classList.remove("win", "lose");
    if (!e) { el.innerHTML = `<div class="sub">${label}</div><div style="height:118px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:30px">?</div>`; return; }
    const t = S.terr[e.id];
    const capLeft = S.terr.filter((x) => x.code === t.code && x.owner === e.id).length;
    const regInfo = t.nReg > 1 ? ` · ${capLeft}/${t.nReg} bölge` : "";
    el.innerHTML = `<div class="sub">${label}</div>
      <img class="flag" src="${flagOf(t.code)}" alt="">
      <div class="nm">${t.name}</div>
      <div class="sub">${empCountries(e)} ülke${regInfo}</div>
      <div class="mult">Çarpan ×${empMult(e).toFixed(2)}</div>
      <div class="dice">${[1, 1, 1].map((v) => `<div class="die">${dieInner(v)}</div>`).join("")}</div>
      <div class="score">–</div><div class="calc"></div>`;
  }

  function setDie(sideEl, i, v, cls) {
    const d = sideEl.querySelectorAll(".die")[i];
    if (!d) return;
    d.className = "die" + (cls ? " " + cls : "");
    d.innerHTML = dieInner(v);
  }

  function setScore(sideEl, big, small) {
    sideEl.querySelector(".score").textContent = big;
    sideEl.querySelector(".calc").textContent = small || "";
  }

  const roll3 = () => [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)];

  async function animateRoll(A, B, dA, dB, mA, mB, sp) {
    const elA = $("sideA"), elB = $("sideB");
    const stopped = { A: [false, false, false], B: [false, false, false] };
    for (let i = 0; i < 3; i++) { setDie(elA, i, 1 + rnd(6), "roll"); setDie(elB, i, 1 + rnd(6), "roll"); }
    setScore(elA, "–"); setScore(elB, "–");
    const spin = setInterval(() => {
      for (let i = 0; i < 3; i++) {
        if (!stopped.A[i]) setDie(elA, i, 1 + rnd(6), "roll");
        if (!stopped.B[i]) setDie(elB, i, 1 + rnd(6), "roll");
      }
    }, 80);
    try {
      await sleep(sp.roll);
      if (sp.seq) {
        let sumA = 0, sumB = 0;
        for (let i = 0; i < 3; i++) {
          stopped.A[i] = true; setDie(elA, i, dA[i], "stop"); sumA += dA[i];
          setScore(elA, String(sumA));
          $("result").textContent = `${i + 1}. zar: ${S.terr[A.id].name} ${dA[i]} attı…`;
          await sleep(sp.step);
          stopped.B[i] = true; setDie(elB, i, dB[i], "stop"); sumB += dB[i];
          setScore(elB, String(sumB));
          $("result").textContent = `${i + 1}. zar: ${S.terr[B.id].name} ${dB[i]} attı…`;
          await sleep(sp.step);
        }
      } else {
        for (let i = 0; i < 3; i++) { stopped.A[i] = stopped.B[i] = true; setDie(elA, i, dA[i], "stop"); setDie(elB, i, dB[i], "stop"); }
      }
    } finally { clearInterval(spin); }
  }

  function showFinal(el, d, m, s) {
    for (let i = 0; i < 3; i++) setDie(el, i, d[i]);
    const raw = d[0] + d[1] + d[2];
    setScore(el, fmt1(s), m !== 1 ? `${raw} × ${m.toFixed(2).replace(".", ",")}` : `${raw}`);
  }

  /* ---------------- Savaş ---------------- */

  async function battle(animated = true) {
    if (S.over) return;
    const pair = pickPair();
    if (!pair) return;
    const [A, B] = pair;
    const sp = SPEEDS[S.speed];
    const anim = animated && sp.roll > 0;

    gTerr.selectAll(".terr").classed("atk def", false);
    if (animated) {
      for (const i of A.terr) S.terr[i].el.classed("atk", true);
      for (const i of B.terr) S.terr[i].el.classed("def", true);
      gFx.selectAll("*").remove();
      const [ta, tb] = nearestBetween(A.terr, B.terr);
      const [x1, y1] = ta.xy, [x2, y2] = tb.xy;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.25;
      gFx.append("path").attr("class", "bline").attr("d", `M${x1},${y1} Q${mx},${my} ${x2},${y2}`);
      renderSide($("sideA"), A, "Saldıran");
      renderSide($("sideB"), B, "Savunan");
    }

    const mA = empMult(A), mB = empMult(B);
    let dA, dB, sA, sB, ties = 0;
    while (true) {
      dA = roll3(); dB = roll3();
      sA = Math.round((dA[0] + dA[1] + dA[2]) * mA * 10) / 10;
      sB = Math.round((dB[0] + dB[1] + dB[2]) * mB * 10) / 10;
      if (anim) {
        $("result").textContent = ties ? "Berabere! Zarlar yeniden atılıyor…" : "Zarlar atılıyor…";
        await animateRoll(A, B, dA, dB, mA, mB, ties ? { ...sp, seq: false, roll: 700 } : sp);
      }
      if (animated) { showFinal($("sideA"), dA, mA, sA); showFinal($("sideB"), dB, mB, sB); }
      if (sA !== sB) break;
      ties++;
      if (anim) { $("result").innerHTML = `<span class="rw" style="color:var(--orange2)">Berabere!</span>`; await sleep(1200); }
    }

    const Wn = sA > sB ? A : B, L = Wn === A ? B : A;
    const wM = Wn === A ? mA : mB, lM = Wn === A ? mB : mA;
    if (anim && sp.reveal) { $("result").textContent = "Puanlar hesaplanıyor…"; await sleep(sp.reveal); }
    if (animated) {
      $(Wn === A ? "sideA" : "sideB").classList.add("win");
      $(Wn === A ? "sideB" : "sideA").classList.add("lose");
    }

    const wn = S.terr[Wn.id], ln = S.terr[L.id];

    // Kaybedenin başkenti dışında bölgesi kaldıysa sadece bir bölgesini kaybeder
    const spare = [...L.terr].filter((i) => S.terr[i].code === ln.code && !S.terr[i].isCap);
    let taken, fell;
    if (spare.length) {
      const [, tgt] = nearestBetween(Wn.terr, spare);
      taken = [tgt.idx]; fell = false;
    } else {
      taken = [...L.terr]; fell = true;
    }

    for (const i of taken) {
      const t = S.terr[i];
      L.terr.delete(i); t.owner = Wn.id; Wn.terr.add(i);
      if (animated) { paintTerr(t); t.el.classed("flash", false); t.el.node().getBoundingClientRect(); t.el.classed("flash", true); }
    }
    S.battles++;
    if (lM - wM > 0 && (!S.upset || lM - wM > S.upset.gap)) S.upset = { gap: lM - wM, w: Wn.id, l: L.id };

    let msg, resHTML;
    if (fell) {
      L.alive = false;
      const cnt = new Set(taken.map((i) => S.terr[i].code)).size;
      if (!S.biggest || cnt > S.biggest.n) S.biggest = { n: cnt, w: Wn.id, l: L.id };
      const capTxt = ln.nReg > 1 ? " başkentini aldı ve" : "";
      msg = cnt > 1
        ? `<b>${wn.name}</b> <span class="x">→</span> ${ln.name}${capTxt} imparatorluğunu yıktı (${cnt} ülke)`
        : `<b>${wn.name}</b> <span class="x">→</span> ${ln.name}${ln.nReg > 1 ? " başkenti düştü" : " fethedildi"}`;
      resHTML = `<span class="rw">🏆 ${wn.name} kazandı!</span><br><span class="rl">${ln.name}${ln.nReg > 1 ? " başkentini kaybetti ve" : ""} fethedildi${cnt > 1 ? ` (${cnt} ülke el değiştirdi)` : ""}</span>`;
    } else {
      const t = S.terr[taken[0]];
      const left = spare.length - 1;
      msg = `<b>${wn.name}</b> <span class="x">→</span> ${ln.name} ${t.rname} bölgesini aldı`;
      resHTML = `<span class="rw">🏆 ${wn.name} kazandı!</span><br><span class="rl">${ln.name} ${t.rname} bölgesini kaybetti. ${left ? `${left} bölge ve` : "Sadece"} başkenti kaldı!</span>`;
    }
    addLog(wn.code, msg);
    if (animated) $("result").innerHTML = resHTML;

    const aliveCount = aliveEmpires().length;
    if (fell) for (const p of S.players) {
      if (!p.out && p.idx === L.id) {
        p.out = true; p.place = aliveCount + 1;
        if (animated) toast(`${p.name} elendi! (${ln.name}, ${wn.name} tarafından fethedildi)`);
      }
    }

    if (animated) { updateUI(); drawPlayerOutlines(); }
    if (aliveCount <= 1) { if (!animated) refreshAll(); finish(); }
  }

  function addLog(wc, msg) {
    const div = document.createElement("div");
    div.innerHTML = `<img src="${flagOf(wc)}" alt=""><span>${msg}</span>`;
    const log = $("log");
    log.prepend(div);
    while (log.children.length > 60) log.lastChild.remove();
  }

  function refreshAll() {
    for (const t of S.terr) paintTerr(t);
    gTerr.selectAll(".terr").classed("atk def", false);
    gFx.selectAll("*").remove();
    updateUI(); drawPlayerOutlines();
  }

  function updateUI() {
    const alive = aliveEmpires();
    $("hudAlive").textContent = alive.length;
    $("hudBattles").textContent = S.battles;
    const top = alive.map((e) => ({ e, c: empCountries(e), p: empPop(e) }))
      .sort((a, b) => b.c - a.c || b.p - a.p).slice(0, 10);
    $("lb").innerHTML = top.map(({ e, c }, i) => {
      const t = S.terr[e.id];
      const pl = S.players.filter((p) => p.idx === e.id).map((p) => `<span class="pl" style="background:${p.color}" title="${p.name}"></span>`).join("");
      return `<li><span class="rk">${i + 1}</span><img src="${flagOf(t.code)}" alt=""><span class="n">${t.name}${pl}</span><span class="c">${c} ülke · ×${empMult(e).toFixed(2)}</span></li>`;
    }).join("");
    if (S.players.length) {
      $("playersCard").style.display = "";
      $("players").innerHTML = S.players.map((p) => {
        const t = S.terr[p.idx]; const e = S.emp.get(p.idx);
        const st = p.out ? `${p.place}. oldu` : `${empCountries(e)} ülke`;
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
        <div>Başlangıç nüfusu<b>${fmtPop(CD.pop[t.code])}</b></div>
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
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
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
      const until = performance.now() + SPEEDS[S.speed].gap;
      while (S.running && performance.now() < until) await sleep(50);
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
    for (const t of S.terr) if (t.isCap) s += `<option value="${t.code}" ${sel === t.code ? "selected" : ""}>${t.name}${t.nReg > 1 ? ` (${t.nReg} bölge)` : ""}</option>`;
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
    const caps = S.terr.filter((t) => t.isCap);
    setupRows.forEach((r, i) => {
      if (!r.code) return;
      let code = r.code;
      if (code === "?" || used.has(code)) {
        const pool = caps.filter((t) => !used.has(t.code));
        code = pool[rnd(pool.length)].code;
      }
      used.add(code);
      players.push({ name: (r.name || `Oyuncu ${i + 1}`).trim(), color: PLAYER_COLORS[i], code, idx: S.capIdx[code], out: false, place: null });
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
