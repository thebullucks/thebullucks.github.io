/* TheBullucks ses efektleri — dosya yok, hepsi Web Audio ile üretilir.
   Kullanım: SFX.unlock() (ilk tıklamada), SFX.dice(), SFX.win() ... SFX.toggle() ile aç/kapat. */
(function () {
  "use strict";
  let ctx = null, master = null, noiseBuf = null;
  let enabled = true;
  try { enabled = localStorage.getItem("tb-sfx") !== "off"; } catch (e) {}

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.35;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const ready = () => enabled && ctx && ctx.state === "running";

  function tone(freq, dur, opt) {
    if (!ready()) return;
    opt = opt || {};
    const t = ctx.currentTime + (opt.delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opt.type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    const v = opt.vol == null ? 0.3 : opt.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (opt.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (opt.pan != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opt.pan)); g.connect(p); node = p; }
    o.connect(g); node.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, opt) {
    if (!ready()) return;
    opt = opt || {};
    const t = ctx.currentTime + (opt.delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = opt.filter || "bandpass"; f.frequency.value = opt.freq || 2000; f.Q.value = opt.q || 1;
    const g = ctx.createGain();
    const v = opt.vol == null ? 0.2 : opt.vol;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }

  let lastClick = 0, clickCount = 0, clickWindow = 0;

  const SFX = {
    get enabled() { return enabled; },
    unlock() { const c = init(); if (c && c.state === "suspended") c.resume(); },
    toggle() {
      enabled = !enabled;
      try { localStorage.setItem("tb-sfx", enabled ? "on" : "off"); } catch (e) {}
      if (enabled) { SFX.unlock(); tone(660, 0.12, { vol: 0.15 }); }
      return enabled;
    },
    // zar sallanırken kısa tıkırtı
    rattle() { noise(0.035, { freq: 2600 + Math.random() * 1500, q: 3, vol: 0.06 }); },
    // zar masaya düşüş "tok"
    diceStop() { tone(220 + Math.random() * 60, 0.09, { type: "triangle", vol: 0.22, to: 140 }); noise(0.05, { freq: 1500, q: 2, vol: 0.08 }); },
    tie() { tone(440, 0.12, { type: "square", vol: 0.06 }); tone(440, 0.12, { type: "square", vol: 0.06, delay: 0.16 }); },
    // kazanan açıklanınca kısa iki notalı tını
    win() { tone(523, 0.18, { type: "triangle", vol: 0.16 }); tone(784, 0.28, { type: "triangle", vol: 0.16, delay: 0.1 }); },
    // fetih: yumuşak davul
    boom(big) {
      tone(big ? 110 : 150, big ? 0.6 : 0.3, { to: big ? 38 : 60, vol: big ? 0.5 : 0.3 });
      noise(big ? 0.4 : 0.15, { filter: "lowpass", freq: big ? 500 : 900, vol: big ? 0.18 : 0.08 });
    },
    // kısa zafer müziği
    fanfare() {
      [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38]].forEach(([f, d]) => tone(f, d === 0.38 ? 0.7 : 0.2, { type: "triangle", vol: 0.18, delay: d }));
      [[262, 0.38], [392, 0.38]].forEach(([f, d]) => tone(f, 0.7, { type: "sine", vol: 0.12, delay: d }));
    },
    beep(final) { tone(final ? 880 : 440, final ? 0.45 : 0.15, { type: "sine", vol: 0.2 }); },
    // bilye çarpması: cam bilye "tık", sınırlı sıklıkta
    click(power, pan) {
      if (!ready()) return;
      const now = ctx.currentTime;
      if (now - clickWindow > 0.1) { clickWindow = now; clickCount = 0; }
      if (clickCount >= 3 || now - lastClick < 0.012) return;
      clickCount++; lastClick = now;
      const v = Math.min(0.12, 0.02 + power * 0.1);
      tone(1800 + Math.random() * 1600, 0.04, { type: "sine", vol: v, pan });
    },
    bonk(pan) { tone(330, 0.12, { type: "square", vol: 0.07, to: 520, pan }); },
    ding(place) {
      const f = [1047, 880, 784][place - 1] || 1320;
      tone(f, place <= 3 ? 0.5 : 0.15, { type: "triangle", vol: place <= 3 ? 0.2 : 0.06 });
      if (place === 1) tone(f * 1.5, 0.6, { type: "triangle", vol: 0.12, delay: 0.12 });
    },
    blip() { tone(990, 0.06, { type: "sine", vol: 0.07 }); },
  };

  // ilk dokunuşta ses motorunu aç (tarayıcı kuralı)
  const first = () => { SFX.unlock(); window.removeEventListener("pointerdown", first); window.removeEventListener("keydown", first); };
  window.addEventListener("pointerdown", first);
  window.addEventListener("keydown", first);

  // başlıktaki ses düğmesi (id="btnSnd") varsa bağla
  window.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("btnSnd");
    if (!b) return;
    const paint = () => { b.textContent = enabled ? "🔊" : "🔇"; b.title = enabled ? "Sesi kapat" : "Sesi aç"; };
    paint();
    b.onclick = () => { SFX.toggle(); paint(); };
  });

  window.SFX = SFX;
})();
