// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, and the methodology with the calibration table. No network:
// every byte it shows is in data.js. The value model (RadarModel) and the farm plans (RadarFarm)
// are the same modules main.ts runs, so the page, the board and the screenshots agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var MODEL = window.RadarModel;
  var FARM = window.RadarFarm;
  if (!DATA || !MODEL || !FARM) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'rank', dir: 1, selected: null };

  // The calibration as main.ts computed it, rebuilt from the table data.js carries, so the page
  // can recompute every row from the model and check the number board.json carries.
  var COMPS = { globalMedian: DATA.comps.globalMedian, globalN: DATA.comps.globalN, categories: {} };
  DATA.comps.rows.forEach(function (r) {
    COMPS.categories[r.category] = { n: r.n, median: r.median, multiple: r.multiple };
  });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    return 'x' + n.toFixed(2);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || '(no category)') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  /** The ten strongest rows as an inline SVG bar chart, log scale, drawn from the same data.js.
      It follows the current filter, so the chart and the table below it always agree. */
  function chartPanel() {
    var top = rows().slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }).slice(0, 10);
    if (!top.length) return null;
    var maxV = top[0].implied_value_usd;
    var lo = Math.min(Math.log10(1e7), Math.log10(maxV) - 1), hi = Math.log10(maxV);
    var labelW = 216, valueW = 96, rowH = 34, pad = 10, w = 1000;
    var plotW = w - labelW - valueW - 16;
    var h = pad + top.length * rowH + 26;
    var parts = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Top 10 protocols by implied value, log scale">'];
    [1e7, 1e8, 1e9].forEach(function (v) {
      var frac = (Math.log10(v) - lo) / (hi - lo);
      if (frac < 0 || frac > 1) return;
      var x = labelW + frac * plotW;
      parts.push('<line x1="' + Math.round(x) + '" y1="' + pad + '" x2="' + Math.round(x) + '" y2="' + (pad + top.length * rowH) + '" class="chart-grid"/>');
      parts.push('<text x="' + Math.round(x) + '" y="' + (pad + top.length * rowH + 18) + '" class="chart-tick">' + fmtUsd(v) + '</text>');
    });
    top.forEach(function (r, i) {
      var y = pad + i * rowH;
      var frac = (Math.log10(r.implied_value_usd) - lo) / (hi - lo);
      var bw = Math.max(24, Math.round(frac * plotW));
      parts.push('<text x="2" y="' + (y + 17) + '" class="chart-rank">' + r.rank + '</text>');
      parts.push('<text x="28" y="' + (y + 17) + '" class="chart-name">' + esc(r.name) + '</text>');
      parts.push('<rect x="' + labelW + '" y="' + (y + 4) + '" width="' + bw + '" height="16" rx="3" class="chart-bar' + (i === 0 ? ' first' : '') + '"/>');
      parts.push('<text x="' + (labelW + bw + 8) + '" y="' + (y + 17) + '" class="chart-value">' + fmtUsd(r.implied_value_usd) + '</text>');
    });
    parts.push('</svg>');
    return el('section', { class: 'panel chart' },
      el('h2', { text: 'Top 10 by implied value' }),
      el('p', { class: 'sub', text: 'Log scale: each step is 10x. The bars are the same numbers the table below and board.json carry.' }),
      el('div', { class: 'chart-svg', html: parts.join('') })
    );
  }

  /** A farm plan's totals, parsed from its six step strings, never invented. */
  function planTotals(steps) {
    function costOf(s) {
      var m = s.match(/ Cost: (.+) Time: /);
      return m ? m[1] : '';
    }
    function timeOf(s) {
      var m = s.match(/ Time: (.+)\.$/);
      return m ? m[1] : '';
    }
    function amount(re, s) {
      var m = s.match(re);
      if (!m) return null;
      var lo = parseFloat(m[1].replace(/,/g, ''));
      var hi = m[2] ? parseFloat(m[2].replace(/,/g, '')) : lo;
      return [lo, hi];
    }
    function fmtMoney(n) {
      return n % 1 === 0 ? String(n) : n.toFixed(2);
    }
    function moneyPair(a) {
      if (!a) return null;
      return a[0] === a[1] ? 'about $' + fmtMoney(a[0]) : '$' + fmtMoney(a[0]) + '\u2013$' + fmtMoney(a[1]);
    }
    function minutes(s) {
      var m = s.match(/(\d+) minutes/);
      return m ? parseInt(m[1], 10) : 0;
    }
    function joinAnd(arr) {
      if (arr.length <= 1) return arr.join('');
      return arr.slice(0, -1).join(', ') + ' plus ' + arr[arr.length - 1];
    }
    var capital = null;
    var cap = costOf(steps[1]).match(/\$([\d,]+) of capital/);
    if (cap) capital = parseInt(cap[1].replace(/,/g, ''), 10);
    var g1 = amount(/\$([\d.]+)(?:\u2013([\d.]+))? of gas/, costOf(steps[0]));
    var g2 = amount(/\$([\d.]+)(?:\u2013([\d.]+))? in gas/, costOf(steps[1]));
    var setup = g1 && g2 ? [g1[0] + g2[0], g1[1] + g2[1]] : (g1 || g2);
    var weekly = amount(/\$([\d.]+)(?:\u2013([\d.]+))? of gas a week/, costOf(steps[2]));
    var active = minutes(timeOf(steps[0])) + minutes(timeOf(steps[1])) + minutes(timeOf(steps[4])) + minutes(timeOf(steps[5]));
    var weeklyMin = minutes(timeOf(steps[2]));
    var hold = null;
    var hm = timeOf(steps[3]).match(/(\d+) days/);
    if (hm) hold = parseInt(hm[1], 10);
    var parts = [];
    if (capital !== null) parts.push('$' + capital + ' of capital in the position');
    var sg = moneyPair(setup);
    var wg = moneyPair(weekly);
    if (sg) parts.push(sg + ' of gas to set up' + (wg ? ', then ' + wg + ' of gas a week' : ''));
    var tb = [];
    if (active) tb.push(active + ' minutes of active time');
    if (weeklyMin) tb.push(weeklyMin + ' minutes a week');
    if (hold !== null) tb.push('a ' + hold + '-day hold');
    if (tb.length) parts.push(joinAnd(tb));
    if (!parts.length) return null;
    return el('div', { class: 'totals' }, el('b', { text: 'Plan total' }), ' ' + parts.join(' \u00b7 '));
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, by TVL. Implied value is a model, not a promise: it is what a token would be worth if the protocol issued one today and its record stayed as it is.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || '(no category)'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', null, el('span', { class: 'status pre', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('implied', 'Multiple'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios are what calibrate the board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var compRows = DATA.comps.rows.map(function (r) {
      return el('tr', null,
        el('td', { text: r.category }),
        el('td', { class: 'num', text: String(r.n) }),
        el('td', { class: 'num', text: fmtMult(r.median) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'The multiple is not a hand-picked constant. For each category it is the median market-cap-to-TVL ratio of the ' + DATA.comps.globalN + ' protocols in this snapshot whose token already trades, in that category, shrunk toward the global median of ' + fmtMult(DATA.comps.globalMedian) + ' so a category with one or two live comps cannot run away with the board: multiple = clamp((n x median + ' + m.shrink_n + ' x global median) / (n + ' + m.shrink_n + '), ' + m.mult_floor + ', ' + m.mult_cap + '). A category with no live comp takes the global median.' }),
      el('p', { class: 'sub', text: 'Growth is the seven-day TVL change, clamped to ' + m.growth_floor + '% .. ' + m.growth_cap + '%. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, excluding exchanges and versioned pools. The live-token protocols are set aside with their market caps shown.' }),
      el('h3', { text: 'The calibration, from this snapshot' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comp-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Live comps' }),
            el('th', { scope: 'col', text: 'Median mcap / TVL' }),
            el('th', { scope: 'col', text: 'Multiple used' })
          )),
          el('tbody', null, compRows)
        )
      ),
      el('p', { class: 'note', text: 'A protocol records no token; that is the record, never proof it has none. A wrapped, staked or bridged product of a token that already trades is not a protocol still waiting on a launch of its own. Implied value is this entry\u2019s own claim, never a price, and it does not predict whether or when a token is issued.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = FARM.farmSteps(row);
    var check = MODEL.impliedValue(row, DATA.as_of, COMPS);
    var compNote = check.compFromCategory
      ? 'from ' + check.compN + ' live comp' + (check.compN === 1 ? '' : 's') + ' in ' + (row.category || 'this category') + ', median mcap / TVL ' + fmtMult(check.compMedian)
      : 'no live comp in this category, so the global median ' + fmtMult(check.compMedian) + ' is used';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? '  ·  on the watchlist' : '  ·  early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'First listed' }), el('b', { class: 'num', text: row.listed_at || 'unknown' }))
      ),
      el('p', { class: 'sub', text: 'The multiple is ' + compNote + '. Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(check.implied) + (check.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      planTotals(steps)
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      var chart = chartPanel();
      if (chart) shell.appendChild(chart);
    }
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
