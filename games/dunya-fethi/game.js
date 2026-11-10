/* Dünya Fethi — TheBullucks
   İki mod: "classic" (her ülke tek parça) ve "city" (Şehir Savaşı: her ülke şehirlere bölünür). */
(function () {
  "use strict";

  const CD = window.COUNTRY_DATA;
  const CITIES = window.CITY_DATA || {};
  const CAPNAMES = window.CAPITAL_NAMES || {};
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let SKIP = false;
  const nap = (ms) => (SKIP ? Promise.resolve() : sleep(ms)); // animasyon beklemeleri, "Sonuca atla" ile kesilir
  const sfx = (name, ...a) => { if (!SKIP && window.SFX) window.SFX[name](...a); };
  const rnd = (n) => Math.floor(Math.random() * n);
  const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");

  const PLAYER_COLORS = ["#ffd84a", "#ff4dd2", "#46d39a", "#ff7b39", "#7fd3ff", "#b388ff"];

  // roll: zarların hep birlikte döndüğü süre; seq: zarlar tek tek mi açılsın; step: her zarın açılma aralığı
  // reveal: zarlar bitince kazanan açıklanmadan önceki bekleme; gap: yeni savaşa kadar geçen süre (ms)
  const SPEEDS = {
    slow:   { roll: 1200, seq: true,  step: 800, reveal: 1100, gap: 4200 },
    normal: { roll: 900,  seq: true,  step: 550, reveal: 850,  gap: 3200 },
    fast:   { roll: 700,  seq: false, step: 0,   reveal: 500,  gap: 1500 },
    turbo:  { roll: 0,    seq: false, step: 0,   reveal: 0,    gap: 120 },
  };

  const S = {
    mode: "classic",
    terr: [],          // birimler (klasik: ülke, şehir modu: şehir)
    capIdx: {},        // ülke kodu -> başkent biriminin indeksi (= imparatorluk kimliği)
    emp: new Map(),
    flags: {},
    battles: 0,
    running: false,
    busy: false,
    speed: "normal",
    pair: "near",
    mult: "empire",
    players: [],
    upset: null,
    biggest: null,
    over: false,
  };
  let RAW_FEATURES = null;
  let builtMode = null;

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

  // Bir ülkeyi ekran koordinatlarında halkalara çevir (tarih çizgisi kesmesi d3 tarafından yapılır)
  function projectRings(feature) {
    const rings = [];
    let cur = null;
    const ctx = {
      moveTo(x, y) { cur = [[x, y]]; rings.push(cur); },
      lineTo(x, y) { cur && cur.push([x, y]); },
      closePath() { if (cur && cur.length) cur.push(cur[0].slice()); cur = null; },
      arc() {},
    };
    d3.geoPath(proj, ctx)(feature);
    return rings.filter((r) => r.length >= 4);
  }

  const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };

  // Halkayı dışbükey bir çokgenle kırp (Sutherland–Hodgman)
  function clipConvex(ring, poly) {
    const s = Math.sign(ringArea(poly.concat([poly[0]]))) || 1;
    let out = ring.slice(0, -1);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const inside = (x) => s * ((q[0] - p[0]) * (x[1] - p[1]) - (q[1] - p[1]) * (x[0] - p[0])) >= 0;
      const inp = out; out = [];
      if (!inp.length) break;
      for (let j = 0; j < inp.length; j++) {
        const a = inp[j], b = inp[(j + 1) % inp.length];
        const ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) {
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const ex = q[0] - p[0], ey = q[1] - p[1];
          const den = ex * dy - ey * dx;
          if (den !== 0) {
            const t = (ey * (a[0] - p[0]) - ex * (a[1] - p[1])) / den;
            out.push([a[0] + t * dx, a[1] + t * dy]);
          }
        }
      }
    }
    if (out.length < 3) return null;
    out.push(out[0].slice());
    return out;
  }

  const ringsToD = (rings) => rings.map((r) => "M" + r.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z").join("");
  function ringsBBox(rings) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1, y1];
  }

  /* ---------------- Oyun yardımcıları ---------------- */

  function multFromPop(p) {
    if (p >= 4000) return 2.5;
    if (p >= 2000) return 2.25;
    if (p >= 1000) return 2.0;
    if (p >= 300) return 1.75;
    if (p >= 100) return 1.5;
    if (p >= 50) return 1.3;
    if (p >= 20) return 1.2;
    if (p >= 5) return 1.1;
    return 1.0;
  }
  function multFromCity(p) {
    if (p >= 20) return 2.0;
    if (p >= 10) return 1.75;
    if (p >= 5) return 1.5;
    if (p >= 2) return 1.3;
    if (p >= 1) return 1.2;
    if (p >= 0.5) return 1.1;
    return 1.0;
  }

  const isCity = () => S.mode === "city";
  function empPop(e) { let p = 0; for (const i of e.terr) p += S.terr[i].pop; return p; }
  function empCountries(e) { const s = new Set(); for (const i of e.terr) s.add(S.terr[i].code); return s.size; }
  function empSize(e) { return isCity() ? e.terr.size : empCountries(e); }
  const sizeWord = () => (isCity() ? "şehir" : "ülke");
  function empMult(e) {
    return S.mult === "empire" ? multFromPop(empPop(e)) : multFromPop(CD.pop[S.terr[e.id].code]);
  }
  function fightMult(e, cell) {
    if (isCity() && S.mult !== "empire" && cell) return multFromCity(cell.cityPop);
    return empMult(e);
  }

  function fmtPop(p) {
    if (p >= 1000) return (p / 1000).toFixed(2).replace(".", ",") + " milyar";
    if (p >= 1) return (Math.round(p * 10) / 10).toString().replace(".", ",") + " milyon";
    return Math.round(p * 1000).toLocaleString("tr-TR") + " bin";
  }

  function aliveEmpires() { return [...S.emp.values()].filter((e) => e.alive); }
  const empName = (e) => S.terr[e.id].name;

  /* ---------------- Harita ---------------- */

  let svg, gRoot, gTerr, gTiny, gOutline, gDots, gFx, defs, zoom, path, proj, W, H;

  function prepFeatures(features) {
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
    return byCode;
  }

  function buildMap(mode) {
    S.mode = mode;
    builtMode = mode;
    const wrap = $("mapwrap");
    W = wrap.clientWidth; H = wrap.clientHeight;
    svg = d3.select("#map");
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    defs = svg.append("defs");
    gRoot = svg.append("g");
    gTerr = gRoot.append("g");
    gTiny = gRoot.append("g");
    gOutline = gRoot.append("g");
    gDots = gRoot.append("g");
    gFx = gRoot.append("g");

    const byCode = prepFeatures(RAW_FEATURES);
    const fc = { type: "FeatureCollection", features: [...byCode.values()] };
    proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], fc);
    path = d3.geoPath(proj);

    // Birimleri oluştur
    S.terr = []; S.capIdx = {};
    for (const [code, f] of byCode) {
      const name = CD.names[code] || code;
      const pop = CD.pop[code];
      const mainPoly = largestPoly(f.geometry);
      const countryLP = d3.geoCentroid({ type: "Polygon", coordinates: mainPoly });
      const list = mode === "city" ? CITIES[code] : null;
      if (!list || list.length < 2) {
        const capCity = list ? list[0] : null;
        const fb = path.bounds(f);
        const pb = path.bounds({ type: "Polygon", coordinates: mainPoly });
        S.terr.push({
          code, name, isCap: true, pop, feature: f,
          city: capCity ? capCity[0] : (CAPNAMES[code] || name),
          cityPop: capCity ? capCity[3] : Math.min(pop, 3),
          d: path(f), pb: [pb[0][0], pb[0][1], pb[1][0], pb[1][1]],
          area: (fb[1][0] - fb[0][0]) * (fb[1][1] - fb[0][1]),
          lp: countryLP, xy: proj(countryLP), dotXY: null,
        });
        continue;
      }
      // Şehir hücreleri: ülkeyi şehirlere göre Voronoi parçalarına böl
      const rings = projectRings(f);
      const pts = list.map((c) => proj([c[2], c[1]]));
      const [bx0, by0, bx1, by1] = ringsBBox(rings);
      const pad = 50;
      const vor = d3.Delaunay.from(pts).voronoi([Math.min(bx0, ...pts.map((p) => p[0])) - pad, Math.min(by0, ...pts.map((p) => p[1])) - pad,
        Math.max(bx1, ...pts.map((p) => p[0])) + pad, Math.max(by1, ...pts.map((p) => p[1])) + pad]);
      list.forEach((c, i) => {
        const cell = vor.cellPolygon(i);
        let cr = [];
        if (cell) {
          const poly = cell.slice(0, -1);
          for (const r of rings) { const k = clipConvex(r, poly); if (k && Math.abs(ringArea(k)) > 0.01) cr.push(k); }
        }
        let main = null, mainA = -1;
        for (const r of cr) { const a = Math.abs(ringArea(r)); if (a > mainA) { mainA = a; main = r; } }
        const bb = cr.length ? ringsBBox(cr) : [pts[i][0], pts[i][1], pts[i][0], pts[i][1]];
        const mb = main ? ringsBBox([main]) : bb;
        S.terr.push({
          code, name, isCap: !!c[4], pop: pop / list.length,
          city: c[0], cityPop: c[3],
          d: cr.length ? ringsToD(cr) : "", pb: mb,
          area: (bb[2] - bb[0]) * (bb[3] - bb[1]),
          lp: [c[2], c[1]], xy: pts[i], dotXY: pts[i],
        });
      });
    }
    S.terr.sort((a, b) => a.name.localeCompare(b.name, "tr") || (b.isCap - a.isCap) || b.cityPop - a.cityPop);
    S.terr.forEach((t, i) => { t.idx = i; if (t.isCap) S.capIdx[t.code] = i; });

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
      const c = t.xy || [0, 0];
      t.tiny = !isFinite(t.area) || t.area < 40 || !t.d;
      let [x0, y0, x1, y1] = t.pb;
      if (t.tiny || !isFinite(x0)) { x0 = c[0] - 4; y0 = c[1] - 4; x1 = c[0] + 4; y1 = c[1] + 4; }
      const w = Math.max(x1 - x0, 0.5), h = Math.max(y1 - y0, 0.5);
      let fw, fh;
      if (w / h > 1.5) { fw = w; fh = w / 1.5; } else { fh = h; fw = h * 1.5; }
      const px = (x0 + x1) / 2 - fw / 2, py = (y0 + y1) / 2 - fh / 2;
      const pat = defs.append("pattern").attr("id", "p-" + t.idx)
        .attr("patternUnits", "userSpaceOnUse").attr("x", px).attr("y", py)
        .attr("width", fw).attr("height", fh);
      t.patImg = pat.append("image").attr("width", fw).attr("height", fh)
        .attr("preserveAspectRatio", "none").attr("href", flagOf(t.code));
      t.el = gTerr.append("path").attr("class", "terr").attr("d", t.d || `M${c[0]},${c[1]}Z`)
        .attr("fill", `url(#p-${t.idx})`).datum(t);
      t.tinyEl = null;
      if (t.tiny) {
        t.tinyEl = gTiny.append("circle").attr("class", "terr tiny").attr("cx", c[0]).attr("cy", c[1])
          .attr("r", 4).attr("fill", `url(#p-${t.idx})`).datum(t);
      }
      if (mode === "city" && t.dotXY) {
        if (t.isCap) gDots.append("text").attr("class", "capstar").attr("x", t.dotXY[0]).attr("y", t.dotXY[1]).text("★");
        else gDots.append("circle").attr("class", "citydot").attr("cx", t.dotXY[0]).attr("cy", t.dotXY[1]).attr("r", 1.8);
      }
    }

    // Etkileşim
    const tip = $("tip");
    svg.selectAll(".terr")
      .on("mousemove", (ev, t) => {
        const e = S.emp.get(t.owner);
        const ownerT = S.terr[t.owner];
        const r = $("mapwrap").getBoundingClientRect();
        let html;
        if (isCity()) {
          html = `<div class="t"><img src="${flagOf(t.code)}" style="width:22px;height:15px;border-radius:2px;object-fit:cover">${t.city}${t.isCap ? " ★" : ""}</div>`;
          html += `<div class="s">${t.name} · şehir nüfusu ${fmtPop(t.cityPop)}</div>`;
        } else {
          html = `<div class="t"><img src="${flagOf(t.code)}" style="width:22px;height:15px;border-radius:2px;object-fit:cover">${t.name}</div>`;
          html += `<div class="s">Nüfus: ${fmtPop(CD.pop[t.code])}</div>`;
        }
        if (ownerT && ownerT.code !== t.code) html += `<div class="s">Sahibi: <b style="color:var(--orange2)">${ownerT.name}</b></div>`;
        if (e) html += `<div class="s">İmparatorluk: ${empSize(e)} ${sizeWord()} · çarpan ×${(isCity() ? fightMult(e, t) : empMult(e)).toFixed(2)}</div>`;
        tip.innerHTML = html;
        tip.style.display = "block";
        let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
        if (x + 220 > r.width) x -= 240;
        if (y + 110 > r.height) y -= 120;
        tip.style.left = x + "px"; tip.style.top = y + "px";
      })
      .on("mouseleave", () => (tip.style.display = "none"));

    zoom = d3.zoom().scaleExtent([1, 16]).translateExtent([[-W * 0.2, -H * 0.2], [W * 1.2, H * 1.2]])
      .on("zoom", (ev) => gRoot.attr("transform", ev.transform));
    svg.call(zoom).on("dblclick.zoom", null);
    $("zIn").onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.6);
    $("zOut").onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.6);
    $("zReset").onclick = () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);

    const mb = document.querySelector('#segMult button[data-v="country"]');
    if (mb) mb.textContent = mode === "city" ? "Şehir nüfusu" : "Ülke nüfusu";
  }

  function paintTerr(t) { t.patImg.attr("href", flagOf(S.terr[t.owner].code)); }

  function drawPlayerOutlines() {
    gOutline.selectAll("*").remove();
    for (const p of S.players) {
      if (p.out) continue;
      const e = S.emp.get(p.idx);
      if (!e || !e.alive) continue;
      if (isCity()) {
        for (const i of e.terr) {
          const t = S.terr[i];
          const q = t.dotXY || t.xy;
          if (q) gOutline.append("circle").attr("class", "pl-ring").attr("stroke", p.color)
            .attr("cx", q[0]).attr("cy", q[1]).attr("r", 4.5);
        }
      } else {
        const feats = [...e.terr].map((i) => S.terr[i].feature);
        gOutline.append("path").attr("class", "pl-outline").attr("stroke", p.color)
          .attr("d", path({ type: "FeatureCollection", features: feats }));
      }
    }
  }

  /* ---------------- Oyun durumu ---------------- */

  function resetGame() {
    S.emp = new Map();
    for (const t of S.terr) if (t.isCap) S.emp.set(t.idx, { id: t.idx, terr: new Set(), alive: true });
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

  // Başkent en son düşer: bir ülkenin kendi şehirlerinden biri elindeyken başkentine saldırılamaz.
  // Başkent düşünce o ülkenin elindeki her şey (fethettiği şehirler dahil) fatihe geçer.
  function ownCitiesLeft(L) {
    const code = S.terr[L.id].code;
    let n = 0;
    for (const i of L.terr) if (i !== L.id && S.terr[i].code === code) n++;
    return n;
  }
  // Hücre, sahibinin kendi ülkesine mi ait?
  function isHome(j) { const t = S.terr[j]; return S.terr[t.owner].code === t.code; }
  function isProtected(j) {
    const L = S.emp.get(S.terr[j].owner);
    return L.id === j && ownCitiesLeft(L) > 0;
  }

  function weightedPick(arr) {
    const w = [0.55, 0.3, 0.15].slice(0, arr.length);
    let r = Math.random() * w.reduce((a, b) => a + b, 0), k = 0;
    while (r > w[k] && k < w.length - 1) { r -= w[k]; k++; }
    return arr[k];
  }

  function pickPair() {
    const alive = aliveEmpires();
    if (alive.length < 2) return null;
    const A = alive[rnd(alive.length)];

    if (!isCity()) {
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
        B = S.emp.get(weightedPick([...best.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3))[0]);
      }
      return { A, B, aCell: null, bCell: null };
    }

    // Şehir modu: hedef her zaman bir ülkenin KENDİ şehridir (fethedilmiş şehirler sahibi çökünce toptan el değiştirir)
    const ok = (j) => S.terr[j].owner !== A.id && isHome(j) && !isProtected(j);
    let target;
    if (S.pair === "random") {
      const cand = [];
      for (let j = 0; j < S.terr.length; j++) if (ok(j)) cand.push(j);
      target = cand[rnd(cand.length)];
    } else {
      const best = new Map(); // hedef -> mesafe
      for (const i of A.terr) {
        const di = S.terr[i].dist;
        for (let j = 0; j < S.terr.length; j++) {
          if (!ok(j)) continue;
          const d = di[j], cur = best.get(j);
          if (cur === undefined || d < cur) best.set(j, d);
        }
      }
      target = weightedPick([...best.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3))[0];
    }
    const B = S.emp.get(S.terr[target].owner);
    let aCell = null, bd = Infinity;
    for (const i of A.terr) { const d = S.terr[i].dist[target]; if (d < bd) { bd = d; aCell = i; } }
    return { A, B, aCell: S.terr[aCell], bCell: S.terr[target] };
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

  function renderSide(el, e, label, cell, m) {
    el.classList.remove("win", "lose");
    if (!e) { el.innerHTML = `<div class="sub">${label}</div><div style="height:118px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:30px">?</div>`; return; }
    const t = S.terr[e.id];
    let title, sub;
    if (cell) {
      title = cell.city + (cell.isCap ? " ★" : "");
      sub = cell.code !== t.code ? `${t.name} (${cell.name} şehri)` : `${t.name} · ${e.terr.size} şehir`;
    } else {
      title = t.name;
      sub = `${empCountries(e)} ülke`;
    }
    el.innerHTML = `<div class="sub">${label}</div>
      <img class="flag" src="${flagOf(t.code)}" alt="">
      <div class="nm">${title}</div>
      <div class="sub">${sub}</div>
      <div class="sub pop">👥 ${fmtPop(empPop(e))}</div>
      <div class="mult">Çarpan ×${(m != null ? m : empMult(e)).toFixed(2)}</div>
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

  async function animateRoll(nameA, nameB, dA, dB, sp) {
    const elA = $("sideA"), elB = $("sideB");
    const stopped = { A: [false, false, false], B: [false, false, false] };
    for (let i = 0; i < 3; i++) { setDie(elA, i, 1 + rnd(6), "roll"); setDie(elB, i, 1 + rnd(6), "roll"); }
    setScore(elA, "–"); setScore(elB, "–");
    const spin = setInterval(() => {
      sfx("rattle");
      for (let i = 0; i < 3; i++) {
        if (!stopped.A[i]) setDie(elA, i, 1 + rnd(6), "roll");
        if (!stopped.B[i]) setDie(elB, i, 1 + rnd(6), "roll");
      }
    }, 80);
    try {
      await nap(sp.roll);
      if (sp.seq) {
        let sumA = 0, sumB = 0;
        for (let i = 0; i < 3; i++) {
          stopped.A[i] = true; setDie(elA, i, dA[i], "stop"); sumA += dA[i]; sfx("diceStop");
          setScore(elA, String(sumA));
          $("result").textContent = `${i + 1}. zar: ${nameA} ${dA[i]} attı…`;
          await nap(sp.step);
          stopped.B[i] = true; setDie(elB, i, dB[i], "stop"); sumB += dB[i]; sfx("diceStop");
          setScore(elB, String(sumB));
          $("result").textContent = `${i + 1}. zar: ${nameB} ${dB[i]} attı…`;
          await nap(sp.step);
        }
      } else {
        for (let i = 0; i < 3; i++) { stopped.A[i] = stopped.B[i] = true; setDie(elA, i, dA[i], "stop"); setDie(elB, i, dB[i], "stop"); }
        sfx("diceStop"); setTimeout(() => sfx("diceStop"), 70);
      }
    } finally { clearInterval(spin); }
  }

  function showFinal(el, d, m, s) {
    for (let i = 0; i < 3; i++) setDie(el, i, d[i]);
    const raw = d[0] + d[1] + d[2];
    setScore(el, fmt1(s), m !== 1 ? `${raw} × ${m.toFixed(2).replace(".", ",")}` : `${raw}`);
  }

  function cityLabel(t, cls) {
    const p = t.dotXY || t.xy;
    if (!p) return;
    gFx.append("text").attr("class", "flabel " + cls).attr("x", p[0]).attr("y", p[1] - 7).text(t.city);
  }

  /* ---------------- Savaş ---------------- */

  async function battle(animated = true) {
    if (S.over) return;
    const pair = pickPair();
    if (!pair) return;
    const { A, B, aCell, bCell } = pair;
    const sp = SPEEDS[S.speed];
    const anim = animated && sp.roll > 0;
    const mA = fightMult(A, aCell), mB = fightMult(B, bCell);
    const nameA = aCell ? aCell.city : empName(A), nameB = bCell ? bCell.city : empName(B);

    gTerr.selectAll(".terr").classed("atk def", false);
    if (animated) {
      gFx.selectAll("*").remove();
      let ta, tb;
      if (aCell) {
        ta = aCell; tb = bCell;
        aCell.el.classed("atk", true); bCell.el.classed("def", true);
      } else {
        for (const i of A.terr) S.terr[i].el.classed("atk", true);
        for (const i of B.terr) S.terr[i].el.classed("def", true);
        [ta, tb] = nearestBetween(A.terr, B.terr);
      }
      const [x1, y1] = ta.dotXY || ta.xy, [x2, y2] = tb.dotXY || tb.xy;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.25;
      gFx.append("path").attr("class", "bline").attr("d", `M${x1},${y1} Q${mx},${my} ${x2},${y2}`);
      if (aCell) { cityLabel(aCell, "la"); cityLabel(bCell, "lb"); }
      renderSide($("sideA"), A, "Saldıran", aCell, mA);
      renderSide($("sideB"), B, "Savunan", bCell, mB);
    }

    let dA, dB, sA, sB, ties = 0;
    while (true) {
      dA = roll3(); dB = roll3();
      sA = Math.round((dA[0] + dA[1] + dA[2]) * mA * 10) / 10;
      sB = Math.round((dB[0] + dB[1] + dB[2]) * mB * 10) / 10;
      if (anim) {
        $("result").textContent = ties ? "Berabere! Zarlar yeniden atılıyor…" : "Zarlar atılıyor…";
        await animateRoll(nameA, nameB, dA, dB, ties ? { ...sp, seq: false, roll: 700 } : sp);
      }
      if (animated) { showFinal($("sideA"), dA, mA, sA); showFinal($("sideB"), dB, mB, sB); }
      if (sA !== sB) break;
      ties++;
      if (anim) { $("result").innerHTML = `<span class="rw" style="color:var(--orange2)">Berabere!</span>`; sfx("tie"); await nap(1200); }
    }

    const Wn = sA > sB ? A : B, L = Wn === A ? B : A;
    const wM = Wn === A ? mA : mB, lM = Wn === A ? mB : mA;
    if (anim && sp.reveal) { $("result").textContent = "Puanlar hesaplanıyor…"; await nap(sp.reveal); }
    if (anim) sfx("win");
    if (animated) {
      $(Wn === A ? "sideA" : "sideB").classList.add("win");
      $(Wn === A ? "sideB" : "sideA").classList.add("lose");
    }
    const wn = S.terr[Wn.id], ln = S.terr[L.id];

    // Ne el değiştirecek?
    let taken;
    if (isCity()) {
      let c;
      if (Wn === A) c = bCell.idx; // saldıran kazandı: hedef şehri alır
      else {
        // saldıran kaybetti: savunana en yakın kendi şehrini kaybeder (başkent en son)
        const code = S.terr[L.id].code;
        const homes = [...L.terr].filter((i) => i !== L.id && S.terr[i].code === code);
        c = homes.length ? nearestBetween(Wn.terr, homes)[1].idx : L.id;
      }
      taken = c === L.id ? [...L.terr] : [c];
    } else taken = [...L.terr];

    for (const i of taken) {
      const t = S.terr[i];
      L.terr.delete(i); t.owner = Wn.id; Wn.terr.add(i);
      if (animated) {
        paintTerr(t);
        const el = t.tinyEl || t.el;
        el.classed("flash", false); el.node().getBoundingClientRect(); el.classed("flash", true);
      }
    }
    S.battles++;
    const fell = L.terr.size === 0;
    if (anim) setTimeout(() => sfx("boom", fell), 180);
    if (fell) L.alive = false;
    if (lM - wM > 0 && (!S.upset || lM - wM > S.upset.gap)) S.upset = { gap: lM - wM, w: Wn.id, l: L.id };

    let msg, resHTML;
    if (isCity()) {
      if (fell) {
        const cap = ln.city, n = taken.length;
        if (!S.biggest || n > S.biggest.n) S.biggest = { n, w: Wn.id, l: L.id };
        const extra = n > 1 ? ` ${n} şehir el değiştirdi!` : "";
        msg = `<b>${wn.name}</b> <span class="x">→</span> ${cap} ★ düştü, <b>${ln.name}</b> oyundan çıktı${n > 1 ? ` (${n} şehir)` : ""}`;
        resHTML = `<span class="rw">🏆 ${wn.name} kazandı!</span><br><span class="rl">Başkent ${cap} düştü, ${ln.name} oyundan çıktı!${extra}</span>`;
      } else {
        const t = S.terr[taken[0]];
        const own = t.code !== ln.code ? ` (${t.name} şehri)` : "";
        const capNext = ownCitiesLeft(L) === 0 ? ` Başkent ${ln.city} artık savunmasız!` : "";
        msg = `<b>${wn.name}</b> <span class="x">→</span> ${t.city}${own} alındı`;
        resHTML = `<span class="rw">🏆 ${wn.name} kazandı!</span><br><span class="rl">${t.city} artık ${wn.name} bayrağı altında.${capNext}</span>`;
      }
    } else {
      const cnt = new Set(taken.map((i) => S.terr[i].code)).size;
      if (!S.biggest || cnt > S.biggest.n) S.biggest = { n: cnt, w: Wn.id, l: L.id };
      msg = cnt > 1
        ? `<b>${wn.name}</b> <span class="x">→</span> ${ln.name} imparatorluğunu yıktı (${cnt} ülke)`
        : `<b>${wn.name}</b> <span class="x">→</span> ${ln.name} fethedildi`;
      resHTML = `<span class="rw">🏆 ${wn.name} kazandı!</span><br><span class="rl">${ln.name} fethedildi${cnt > 1 ? ` (${cnt} ülke el değiştirdi)` : ""}</span>`;
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
    const top = alive.map((e) => ({ e, c: empSize(e), p: empPop(e) }))
      .sort((a, b) => b.c - a.c || b.p - a.p).slice(0, 10);
    $("lb").innerHTML = top.map(({ e, c }, i) => {
      const t = S.terr[e.id];
      const pl = S.players.filter((p) => p.idx === e.id).map((p) => `<span class="pl" style="background:${p.color}" title="${p.name}"></span>`).join("");
      return `<li><span class="rk">${i + 1}</span><img src="${flagOf(t.code)}" alt=""><span class="n">${t.name}${pl}</span><span class="c">${c} ${sizeWord()} · ${fmtPop(empPop(e))}${isCity() && S.mult !== "empire" ? "" : ` · ×${empMult(e).toFixed(2)}`}</span></li>`;
    }).join("");
    if (S.players.length) {
      $("playersCard").style.display = "";
      $("players").innerHTML = S.players.map((p) => {
        const t = S.terr[p.idx]; const e = S.emp.get(p.idx);
        const st = p.out ? `${p.place}. oldu` : `${empSize(e)} ${sizeWord()}`;
        return `<div class="pchip ${p.out ? "out" : ""}" style="border-color:${p.color}"><img src="${flagOf(t.code)}" alt=""><b>${p.name}</b> <span style="color:var(--muted)">${t.name}</span><span class="st">${st}</span></div>`;
      }).join("");
    } else $("playersCard").style.display = "none";
    const done = S.over;
    $("btnBattle").disabled = done || S.running;
    $("btnSkip").disabled = done;
    $("btnAuto").disabled = done;
    $("btnAuto").textContent = S.running ? "⏸ Durdur" : "▶ Otomatik";
    $("modeChip").textContent = isCity() ? "🏙 Şehir Savaşı" : "🌍 Klasik";
  }

  function finish() {
    S.over = true; S.running = false;
    setTimeout(() => window.SFX && window.SFX.fanfare(), 300);
    gFx.selectAll("*").remove();
    gTerr.selectAll(".terr").classed("atk def", false);
    updateUI();
    const champ = aliveEmpires()[0];
    const t = S.terr[champ.id];
    $("result").innerHTML = `<span class="rw">👑 ${t.name} dünyanın hakimi!</span>`;
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
    const last = isCity()
      ? `<div>En büyük çöküş<b>${S.biggest ? `${S.terr[S.biggest.l].name} (${S.biggest.n} şehir)` : "–"}</b></div>`
      : `<div>En büyük tek fetih<b>${S.biggest ? `${S.terr[S.biggest.w].name} (${S.biggest.n} ülke aldı)` : "–"}</b></div>`;
    $("winBox").innerHTML = `<h2>DÜNYANIN <span>HAKİMİ</span></h2>
      <img src="${flagOf(t.code)}" alt="">
      <div style="font-family:Bungee,Rubik;font-size:28px">${t.name}</div>
      ${pl}
      <div class="stats">
        <div>Toplam savaş<b>${S.battles}</b></div>
        <div>Başlangıç nüfusu<b>${fmtPop(CD.pop[t.code])}</b></div>
        <div>En büyük sürpriz<b>${up}</b></div>
        ${last}
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
    SKIP = true;
    while (S.busy) await sleep(30);
    SKIP = false;
    S.busy = true;
    $("result").textContent = "Sonuç hesaplanıyor…";
    await sleep(20);
    let guard = 0;
    while (!S.over && guard++ < 20000) await battle(false);
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
  let setupMode = "classic";

  function openSetup() {
    S.running = false;
    if (!setupRows.length) setupRows = [{ name: "Oyuncu 1", code: "?" }, { name: "Oyuncu 2", code: "?" }];
    setupMode = S.mode;
    renderSetup();
    $("setup").classList.add("show");
  }

  function countryOptions(sel) {
    let s = `<option value="">— Ülke seç —</option><option value="?" ${sel === "?" ? "selected" : ""}>🎲 Rastgele</option>`;
    const seen = new Set();
    for (const t of S.terr) {
      if (!t.isCap || seen.has(t.code)) continue;
      seen.add(t.code);
      const nc = setupMode === "city" ? (CITIES[t.code] ? CITIES[t.code].length : 1) : 0;
      s += `<option value="${t.code}" ${sel === t.code ? "selected" : ""}>${t.name}${nc > 1 ? ` (${nc} şehir)` : ""}</option>`;
    }
    return s;
  }

  function renderSetup() {
    document.querySelectorAll("#modePick .mode").forEach((el) => el.classList.toggle("on", el.dataset.v === setupMode));
    $("rulesClassic").style.display = setupMode === "classic" ? "" : "none";
    $("rulesCity").style.display = setupMode === "city" ? "" : "none";
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
    if (builtMode !== setupMode) buildMap(setupMode);
    const used = new Set();
    const players = [];
    const caps = S.terr.filter((t) => t.isCap);
    setupRows.forEach((r, i) => {
      if (!r.code) return;
      let code = r.code;
      if (code === "?" || used.has(code) || S.capIdx[code] == null) {
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
      RAW_FEATURES = features;
      buildMap("classic");
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
    document.querySelectorAll("#modePick .mode").forEach((el) => (el.onclick = () => { setupMode = el.dataset.v; renderSetup(); }));
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
