// Token Radar's value model, version radar-2.
//
// The model answers one question: if a protocol that records no token issued one
// today and its record stayed as it is, what would that token be worth? It scores
// every protocol with the same function of the snapshot's own figures, and no
// protocol name is ever special-cased.
//
//   implied = round( tvl_usd x multiple(category) x growthMult x maturityMult )
//
// multiple(category) is NOT a hand-picked constant. It is calibrated from this
// snapshot's own live protocols: for each category, the median market-cap-to-TVL
// ratio of the protocols in that category whose token already trades, shrunk
// toward the global median so a category with one or two live comps cannot run
// away with the board:
//
//   multiple(cat) = clamp( (n x median(cat) + 4 x globalMedian) / (n + 4), 0.02, 0.80 )
//
// A category with no live comp at all takes the global median. The medians are
// medians, not means, so one outlier token cannot move a category.
//
// growthMult rewards a protocol whose TVL is growing and discounts one whose TVL
// is shrinking, on its seven-day change clamped to [-50, +100] per cent:
//   growthMult = 1 + clamp(change_7d, -50, 100) / 100 x 0.5        (range 0.75..1.50)
//
// maturityMult rewards how long a protocol has run with no token, from the day
// DefiLlama began tracking it to the snapshot's date, capped at three years:
//   maturityMult = 0.6 + 0.4 x min(age_days, 1095) / 1095           (range 0.60..1.00)
// An unlisted age uses 365 days. A protocol that has waited longer has had more
// time to build the user base a launch would price, and the record to prove it.
//
// The model is deterministic: same snapshot in, same board out. No wall clock,
// no randomness, no network, no name list. It is shared by main.ts (which writes
// board.json) and by this page (which recomputes every row it shows), so the
// screenshots, the board and the code agree by construction.

const RadarModel = (() => {
  'use strict';

  const MODEL_VERSION = 'radar-2';
  const SHRINK_N = 4;
  const MULT_FLOOR = 0.02;
  const MULT_CAP = 0.8;
  const GROWTH_FLOOR = -50;
  const GROWTH_CAP = 100;
  const GROWTH_WEIGHT = 0.5;
  const MATURITY_FLOOR = 0.6;
  const MATURITY_RANGE = 0.4;
  const MATURITY_DAYS = 1095;
  const UNKNOWN_AGE_DAYS = 365;
  const DAY_MS = 86400000;

  function median(xs) {
    if (xs.length === 0) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function round4(n) {
    return Math.round(n * 10000) / 10000;
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  /** Whole days from `listedAt` (YYYY-MM-DD) to `asOf`; null when either is absent or bad. */
  function ageDays(asOf, listedAt) {
    if (listedAt === null || listedAt === undefined) return null;
    const a = Date.parse(asOf + 'T00:00:00Z');
    const b = Date.parse(listedAt + 'T00:00:00Z');
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / DAY_MS));
  }

  /**
   * Calibrate the category multiples from the snapshot's live protocols: every
   * protocol whose token already trades (a market cap on record) contributes its
   * market-cap-to-TVL ratio to its category's median. Returns the global median,
   * the live count, and one row per category: { n, median, multiple }.
   */
  function calibrateComps(protocols) {
    const live = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd !== undefined && p.mcap_usd > 0 && p.tvl_usd > 0);
    const globalMedian = median(live.map((p) => p.mcap_usd / p.tvl_usd)) || 0;
    const byCat = {};
    for (const p of live) {
      const cat = p.category === null || p.category === undefined ? '(no category)' : p.category;
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(p.mcap_usd / p.tvl_usd);
    }
    const categories = {};
    for (const cat of Object.keys(byCat).sort()) {
      const ratios = byCat[cat];
      const med = median(ratios);
      const multiple = clamp((ratios.length * med + SHRINK_N * globalMedian) / (ratios.length + SHRINK_N), MULT_FLOOR, MULT_CAP);
      categories[cat] = { n: ratios.length, median: round4(med), multiple: round4(multiple) };
    }
    return { globalMedian: round4(globalMedian), globalN: live.length, categories };
  }

  /** The multiple one category gets under the calibration; the global median when it has no live comp. */
  function multipleFor(category, comps) {
    const cat = category === null || category === undefined ? '(no category)' : category;
    const row = comps.categories[cat];
    if (row) return row.multiple;
    return clamp(comps.globalMedian, MULT_FLOOR, MULT_CAP);
  }

  /** The comps behind one protocol's multiple, for the detail view. */
  function compRowFor(category, comps) {
    const cat = category === null || category === undefined ? '(no category)' : category;
    const row = comps.categories[cat];
    if (row) return { category: cat, n: row.n, median: row.median, multiple: row.multiple, fromCategory: true };
    return { category: cat, n: 0, median: comps.globalMedian, multiple: clamp(comps.globalMedian, MULT_FLOOR, MULT_CAP), fromCategory: false };
  }

  /**
   * One protocol's implied value under the model, with every multiplier shown.
   * `protocol` carries the snapshot's ten fields; `comps` is calibrateComps' return.
   */
  function impliedValue(protocol, asOf, comps) {
    const age = ageDays(asOf, protocol.listed_at);
    const rawGrowth = typeof protocol.change_7d === 'number' && Number.isFinite(protocol.change_7d) ? protocol.change_7d : 0;
    const growthPct = clamp(rawGrowth, GROWTH_FLOOR, GROWTH_CAP);
    const growthMult = 1 + (growthPct / 100) * GROWTH_WEIGHT;
    const ageForModel = age === null ? UNKNOWN_AGE_DAYS : age;
    const maturityMult = MATURITY_FLOOR + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
    const comp = compRowFor(protocol.category, comps);
    const implied = Math.max(1, Math.round(protocol.tvl_usd * comp.multiple * growthMult * maturityMult));
    return {
      implied,
      growthPct,
      growthMult: round4(growthMult),
      maturityMult: round4(maturityMult),
      multiple: comp.multiple,
      compN: comp.n,
      compMedian: comp.median,
      compFromCategory: comp.fromCategory,
      age,
    };
  }

  return {
    MODEL_VERSION,
    SHRINK_N,
    MULT_FLOOR,
    MULT_CAP,
    GROWTH_FLOOR,
    GROWTH_CAP,
    GROWTH_WEIGHT,
    MATURITY_FLOOR,
    MATURITY_RANGE,
    MATURITY_DAYS,
    UNKNOWN_AGE_DAYS,
    median,
    round4,
    clamp,
    ageDays,
    calibrateComps,
    multipleFor,
    compRowFor,
    impliedValue,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RadarModel;
if (typeof window !== 'undefined') window.RadarModel = RadarModel;
