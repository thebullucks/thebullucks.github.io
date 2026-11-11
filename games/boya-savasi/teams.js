/* Boya Savaşı takım setleri.
   Süper Lig 2026-27 (18 takım). Sadece kulüp renkleri ve isimleri kullanılır, logo/arma kullanılmaz.
   c1: ana renk, c2: ikinci renk, pat: zemin deseni (halves, vstripes, hstripe, diag, dot, cross) */
window.TEAM_SETS = {
  superlig: {
    name: "Süper Lig 2026-27",
    emoji: "⚽",
    teams: [
      { id: "GS",  name: "Galatasaray",     short: "GS",   c1: "#F8B500", c2: "#A6192E", pat: "halves" },
      { id: "FB",  name: "Fenerbahçe",      short: "FB",   c1: "#FFE600", c2: "#002D72", pat: "vstripes" },
      { id: "BJK", name: "Beşiktaş",        short: "BJK",  c1: "#151515", c2: "#FFFFFF", pat: "vstripes" },
      { id: "TS",  name: "Trabzonspor",     short: "TS",   c1: "#7B1E3B", c2: "#5BB4E5", pat: "hstripe" },
      { id: "IBFK",name: "Başakşehir",      short: "İBFK", c1: "#F47B20", c2: "#1B2A4E", pat: "diag" },
      { id: "KSP", name: "Kasımpaşa",       short: "KSP",  c1: "#14306B", c2: "#FFFFFF", pat: "hstripe" },
      { id: "EYP", name: "Eyüpspor",        short: "EYP",  c1: "#5B2D8E", c2: "#FFD100", pat: "dot" },
      { id: "GB",  name: "Gençlerbirliği",  short: "GB",   c1: "#D50000", c2: "#151515", pat: "halves" },
      { id: "GOZ", name: "Göztepe",         short: "GÖZ",  c1: "#FFD200", c2: "#E4002B", pat: "vstripes" },
      { id: "GFK", name: "Gaziantep FK",    short: "GFK",  c1: "#C8102E", c2: "#151515", pat: "diag" },
      { id: "ALN", name: "Alanyaspor",      short: "ALN",  c1: "#F58220", c2: "#00843D", pat: "halves" },
      { id: "KON", name: "Konyaspor",       short: "KON",  c1: "#00843D", c2: "#FFFFFF", pat: "hstripe" },
      { id: "KOC", name: "Kocaelispor",     short: "KOC",  c1: "#00A651", c2: "#151515", pat: "vstripes" },
      { id: "SAM", name: "Samsunspor",      short: "SAM",  c1: "#E30613", c2: "#FFFFFF", pat: "dot" },
      { id: "RIZ", name: "Çaykur Rizespor", short: "RİZ",  c1: "#00A3E0", c2: "#00843D", pat: "diag" },
      { id: "ERZ", name: "Erzurumspor FK",  short: "ERZ",  c1: "#0066B3", c2: "#FFFFFF", pat: "dot" },
      { id: "AMD", name: "Amed SK",         short: "AMD",  c1: "#00843D", c2: "#E30613", pat: "cross" },
      { id: "COR", name: "Çorum FK",        short: "ÇOR",  c1: "#D50000", c2: "#151515", pat: "vstripes" },
    ],
  },
  // ülkeler: renkleri bayraktan otomatik çıkarılır (game.js)
  countries: { name: "Ülkeler", emoji: "🌍", teams: null },
};
