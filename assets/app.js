/* Casa do Mar — prototype application.
   Classic script (no bundler, no framework): hash router, views, 5-step booking
   wizard, mock payment, localStorage-backed reservations. Expects globals
   window.LCS_CORE, window.LCS_DATA, window.LCS_I18N[locale]. */
(function (global) {
  'use strict';

  var C = global.LCS_CORE;
  var D = global.LCS_DATA;

  var DEFAULT = 'en';
  var LOCALES = ['en', 'pt', 'fr', 'es', 'ru', 'ar', 'zh'];
  var LABEL = { en: 'English', pt: 'Português', fr: 'Français', es: 'Español', ru: 'Русский', ar: 'العربية', zh: '中文' };
  var SHORT = { en: 'EN', pt: 'PT', fr: 'FR', es: 'ES', ru: 'RU', ar: 'AR', zh: '中' };
  var RTL = { ar: true };
  var STORE = 'lcs.bookings';
  var THEME_KEY = 'lcs.theme';
  var ACCENT_KEY = 'lcs.accent';
  var THEMES = ['auto', 'light', 'dark'];
  var ACCENTS = ['clay', 'olive', 'brass'];

  var state = {
    locale: DEFAULT,
    path: '/',
    query: new URLSearchParams(),
    calMonth: '',
    flash: '',
    errors: {},
    form: {},
    busy: false,
    lastPath: null,
    theme: 'auto',
    accent: 'clay'
  };

  /* ===================== 1. utilities ===================== */

  function pad2(n) { return String(n).padStart(2, '0'); }

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function params(obj) {
    var sp = new URLSearchParams();
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (v === '' || v === null || v === undefined || v === false) return;
      sp.set(k, String(v));
    });
    return sp;
  }

  function withQuery(patch) {
    var sp = new URLSearchParams();
    state.query.forEach(function (v, k) { sp.set(k, v); });
    Object.keys(patch || {}).forEach(function (k) {
      var v = patch[k];
      if (v === '' || v === null || v === undefined) sp.delete(k);
      else sp.set(k, String(v));
    });
    return sp;
  }

  function contextQuery() {
    return params({
      in: state.query.get('in') || '',
      out: state.query.get('out') || '',
      g: state.query.get('g') || ''
    });
  }

  /* ===================== 2. i18n ===================== */

  function dict() { return (global.LCS_I18N && global.LCS_I18N[state.locale]) || {}; }
  function baseDict() { return (global.LCS_I18N && global.LCS_I18N[DEFAULT]) || {}; }

  function interpolate(s, vars) {
    if (!vars) return s;
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }

  function raw(key) {
    var v = dict()[key];
    if (v === undefined) v = baseDict()[key];
    return v;
  }

  function t(key, vars) {
    var v = raw(key);
    if (v && typeof v === 'object') v = v.other || v.many || v.one;
    if (typeof v !== 'string') return key;
    return interpolate(v, vars);
  }

  function num(n) {
    try { return new Intl.NumberFormat(state.locale, { numberingSystem: 'latn' }).format(n); }
    catch (e) { return String(n); }
  }

  function tn(key, n) {
    var table = raw(key);
    if (table && typeof table === 'object') {
      var cat = C.pluralCategory(state.locale, n);
      var s = table[cat];
      if (s === undefined) s = table.other || table.many || table.one;
      if (typeof s === 'string') return interpolate(s, { n: num(n) });
    }
    return num(n) + ' ' + t(key);
  }

  /* LRI/PDI: amounts are digits plus a currency glyph; isolating them keeps RTL
     paragraphs from reordering the symbol to the other side of the number. */
  /* Numbers, signed numbers and percentages are laid out left-to-right even inside an
     RTL sentence; without the isolate the sign and the % land on the wrong side. */
  function bidiNum(str) { return String(str).replace(/([−\-–]?\s?\d+(?:[.,]\d+)?\s?%?)/g, '\u2066$1\u2069'); }
  function money(minor) { return '\u2066' + C.formatMoney(minor, D.config.currency, state.locale) + '\u2069'; }
  function dfmt(iso, style) { return C.formatDate(iso, state.locale, style); }

  /* ===================== 2b. theme ===================== */

  function store(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function restore(key, allowed, fallback) {
    try {
      var v = global.localStorage.getItem(key);
      return allowed.indexOf(v) !== -1 ? v : fallback;
    } catch (e) { return fallback; }
  }

  function prefersDark() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches); }
    catch (e) { return false; }
  }

  /* 'auto' is resolved here rather than in CSS: one attribute on <html> drives both
     the palette and the native control colours, and it keeps the dark token block
     from having to exist twice (once for the attribute, once for the media query). */
  function resolveTheme(mode) {
    if (mode === 'dark' || mode === 'light') return mode;
    return prefersDark() ? 'dark' : 'light';
  }

  function themeColorOf(theme) { return theme === 'dark' ? '#14110d' : '#f6f2ea'; }

  function applyTheme(animate) {
    var doc = global.document;
    if (!doc || !doc.documentElement) return;
    var de = doc.documentElement;
    var theme = resolveTheme(state.theme);
    de.setAttribute('data-theme', theme);
    de.setAttribute('data-theme-mode', state.theme);
    de.setAttribute('data-accent', state.accent);
    var meta = doc.querySelector ? doc.querySelector('meta[name="theme-color"]') : null;
    if (meta && meta.setAttribute) meta.setAttribute('content', themeColorOf(theme));
    if (animate && de.classList) {
      de.classList.add('theme-anim');
      global.setTimeout(function () { de.classList.remove('theme-anim'); }, 340);
    }
  }

  function syncThemeUI() {
    var doc = global.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    var i;
    var modes = doc.querySelectorAll('[data-theme-option]');
    for (i = 0; i < modes.length; i++) {
      modes[i].setAttribute('aria-pressed', modes[i].getAttribute('data-theme-option') === state.theme ? 'true' : 'false');
    }
    var swatches = doc.querySelectorAll('[data-accent-name]');
    for (i = 0; i < swatches.length; i++) {
      swatches[i].setAttribute('aria-pressed', swatches[i].getAttribute('data-accent-name') === state.accent ? 'true' : 'false');
    }
  }

  function setTheme(mode) {
    if (THEMES.indexOf(mode) === -1) return;
    state.theme = mode;
    store(THEME_KEY, mode);
    applyTheme(true);
    syncThemeUI();
  }

  function setAccent(name) {
    if (ACCENTS.indexOf(name) === -1) return;
    state.accent = name;
    store(ACCENT_KEY, name);
    applyTheme(true);
    syncThemeUI();
  }

  /* ===================== 3. routing ===================== */

  function parseHash(hash) {
    var s = String(hash == null ? '' : hash).replace(/^#/, '');
    if (s.charAt(0) === '/') s = s.slice(1);
    var qi = s.indexOf('?');
    var pathPart = qi === -1 ? s : s.slice(0, qi);
    var qs = qi === -1 ? '' : s.slice(qi + 1);
    var segs = pathPart.split('/').filter(Boolean);
    var locale = DEFAULT;
    if (segs.length && LOCALES.indexOf(segs[0]) !== -1) locale = segs.shift();
    return { locale: locale, path: '/' + segs.join('/'), query: new URLSearchParams(qs) };
  }

  function buildHash(parts) {
    var loc = parts && parts.locale && parts.locale !== DEFAULT ? parts.locale + '/' : '';
    var path = String((parts && parts.path) || '/').replace(/^\/+/, '');
    var qs = '';
    if (parts && parts.query) {
      var sp = parts.query instanceof URLSearchParams ? parts.query : new URLSearchParams(parts.query);
      var s = sp.toString();
      if (s) qs = '?' + s;
    }
    return '#/' + loc + path + qs;
  }

  function matchRoute(path) {
    var m;
    if (path === '/' || path === '') return { name: 'home' };
    if (path === '/apartments') return { name: 'apartments' };
    if ((m = path.match(/^\/apartments\/([\w-]+)$/))) return { name: 'unit', slug: m[1] };
    if (path === '/booking') return { name: 'booking' };
    if ((m = path.match(/^\/confirmation\/([\w-]+)$/))) return { name: 'confirmation', code: m[1] };
    if (path === '/location') return { name: 'location' };
    if (path === '/faq') return { name: 'faq' };
    if (path === '/policies') return { name: 'policies' };
    if (path === '/legal') return { name: 'legal' };
    return { name: 'notfound' };
  }

  function readLocation() {
    var parsed = parseHash(global.location ? global.location.hash : '');
    state.locale = parsed.locale;
    state.path = parsed.path;
    state.query = parsed.query;
  }

  function go(hash, replace) {
    if (replace) {
      try {
        global.history.replaceState(null, '', hash);
        readLocation();
        render();
        return;
      } catch (e) { /* file:// or sandboxed frame — fall through to hash change */ }
    }
    if (global.location.hash === hash) { readLocation(); render(); return; }
    global.location.hash = hash;
  }

  function link(path, patch) {
    if (patch === null) return buildHash({ locale: state.locale, path: path });
    var q = patch === undefined ? state.query : withQuery(patch);
    return buildHash({ locale: state.locale, path: path, query: q });
  }

  /* ===================== 4. storage ===================== */

  function loadBookings() {
    try {
      var txt = global.localStorage.getItem(STORE);
      var list = txt ? JSON.parse(txt) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveBookings(list) {
    try { global.localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  function findBooking(code) {
    var list = loadBookings();
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    return null;
  }

  function setBookingStatus(code, status) {
    var list = loadBookings();
    list.forEach(function (b) { if (b.code === code) b.status = status; });
    saveBookings(list);
  }

  /* ===================== 5. domain helpers ===================== */

  function cfg() { return D.config; }

  function unitById(id) {
    for (var i = 0; i < D.units.length; i++) if (D.units[i].id === id) return D.units[i];
    return null;
  }

  function unitBySlug(slug) { return unitById(slug); }

  function unavailableFor(unitId) {
    var map = C.buildUnavailability(D.units, D.buildBlocks(C.todayISO()), loadBookings(), Date.now());
    return map[unitId] || new Set();
  }

  function selOf(unitId) {
    return {
      unit: unitId || '',
      checkIn: state.query.get('in') || '',
      checkOut: state.query.get('out') || '',
      guests: Number(state.query.get('g') || 2)
    };
  }

  function messageOf(res) {
    if (!res || res.ok) return '';
    switch (res.code) {
      case 'err.minStay': return t('err.minStay', { n: res.n });
      case 'err.maxStay': return t('err.maxStay', { n: res.n });
      case 'err.blocked': return t('err.blocked');
      case 'err.past': return t('err.past');
      case 'err.order': return t('err.order');
      case 'err.window': return t('err.window');
      case 'err.required': return t('err.required');
      default: return t('err.generic');
    }
  }

  function currentUnitId() {
    var r = matchRoute(state.path);
    if (r.name === 'unit') {
      var u = unitBySlug(r.slug);
      if (u) return u.id;
    }
    return state.query.get('unit') || '';
  }

  /* ===================== 6. chrome ===================== */

  function headerHtml() {
    var items = [['/apartments', 'nav.apartments'], ['/location', 'nav.location'], ['/faq', 'nav.faq'], ['/policies', 'nav.policies']];
    var links = items.map(function (it) {
      var active = state.path === it[0] || (it[0] === '/apartments' && state.path.indexOf('/apartments/') === 0);
      return '<a href="' + link(it[0], contextQuery()) + '"' + (active ? ' aria-current="page"' : '') + '>' + esc(t(it[1])) + '</a>';
    }).join('');
    var langs = LOCALES.map(function (l) {
      var href = buildHash({ locale: l, path: state.path, query: contextQuery() });
      return '<a href="' + href + '" hreflang="' + l + '" lang="' + l + '"' + (l === state.locale ? ' aria-current="true"' : '') + '>' +
        '<span>' + esc(LABEL[l]) + '</span><span class="langsw__meta">' + SHORT[l] + '</span></a>';
    }).join('');
    var themeBtns = THEMES.map(function (m) {
      return '<button type="button" class="seg" data-theme-option="' + m + '"' +
        (state.theme === m ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
        esc(t('setts.' + m)) + '</button>';
    }).join('');
    var accentBtns = ACCENTS.map(function (acc) {
      return '<button type="button" class="swatch" data-accent-name="' + acc + '"' +
        (state.accent === acc ? ' aria-pressed="true"' : ' aria-pressed="false"') +
        ' aria-label="' + esc(t('setts.' + acc)) + '"><span aria-hidden="true"></span></button>';
    }).join('');
    var iconSun = '<svg class="ico ico--sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
      '<path d="M12 2.7v2.1M12 19.2v2.1M2.7 12h2.1M19.2 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M18.5 5.5L17 7M7 17l-1.5 1.5"/></g></svg>';
    var iconMoon = '<svg class="ico ico--moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M20.2 14.6A8.3 8.3 0 0 1 9.4 3.8a8.5 8.5 0 1 0 10.8 10.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    var settings =
      '<details class="setts"><summary title="' + esc(t('setts.label')) + '">' + iconSun + iconMoon +
        '<span class="vh">' + esc(t('setts.label')) + '</span></summary>' +
        '<div class="setts__menu">' +
          '<p class="setts__h">' + esc(t('setts.theme')) + '</p>' +
          '<div class="segs" role="group" aria-label="' + esc(t('setts.theme')) + '">' + themeBtns + '</div>' +
          '<p class="setts__h">' + esc(t('setts.accent')) + '</p>' +
          '<div class="swatches" role="group" aria-label="' + esc(t('setts.accent')) + '">' + accentBtns + '</div>' +
        '</div></details>';

    var bookHref = link('/booking', { unit: '', in: '', out: '', step: 1 });
    return '<div class="wrap head__in">' +
      '<a class="brand" href="' + link('/', contextQuery()) + '">' +
        '<span class="brand__mark">' + esc(cfg().brand) + '</span><span class="brand__dot" aria-hidden="true"></span></a>' +
      '<nav class="nav">' + links + '</nav>' +
      '<div class="head__end">' + settings +
        '<details class="langsw"><summary><span aria-hidden="true">' + SHORT[state.locale] + '</span><span aria-hidden="true">▾</span>' +
        '<span class="vh">' + esc(t('lang.label')) + '</span></summary>' +
        '<div class="langsw__menu">' + langs + '</div></details>' +
        '<a class="btn btn--clay btn--sm" href="' + bookHref + '">' + esc(t('nav.book')) + '</a>' +
      '</div></div>';
  }

  function footerHtml() {
    var year = new Date().getFullYear();
    var explore = [['/apartments', 'nav.apartments'], ['/booking', 'booking.title'], ['/location', 'nav.location'], ['/faq', 'faq.title'], ['/policies', 'policies.title'], ['/legal', 'legal.title']]
      .map(function (it) {
        return '<li><a href="' + link(it[0], contextQuery()) + '">' + esc(t(it[1])) + '</a></li>';
      }).join('');
    var langs = LOCALES.map(function (l) {
      return '<li><a href="' + buildHash({ locale: l, path: state.path, query: contextQuery() }) + '" hreflang="' + l + '" lang="' + l + '">' +
        esc(LABEL[l]) + '</a></li>';
    }).join('');
    return '<div class="wrap">' +
      '<div class="foot__grid">' +
        '<div>' +
          '<div class="brand__mark">' + esc(cfg().brand) + '</div>' +
          '<p class="foot__note">' + esc(t('brand.tagline')) + '</p>' +
          '<p class="foot__note">' + esc(t('footer.note')) + '</p>' +
        '</div>' +
        '<div><h4>' + esc(t('nav.apartments')) + '</h4><ul>' + explore + '</ul></div>' +
        '<div><h4>' + esc(t('lang.label')) + '</h4><ul>' + langs + '</ul>' +
          '<p class="foot__note">' + esc(t('footer.langNote')) + '</p></div>' +
      '</div>' +
      '<div class="foot__bottom"><span>' + esc(t('footer.rights', { year: year })) + '</span>' +
        '<span>' + esc(t('footer.placeholders')) + '</span></div>' +
      '</div>';
  }

  function guestOptions(selected, max) {
    var out = '';
    for (var i = 1; i <= max; i++) {
      out += '<option value="' + i + '"' + (i === Number(selected) ? ' selected' : '') + '>' + esc(tn('guests', i)) + '</option>';
    }
    return out;
  }

  /* ===================== 7. fragments ===================== */

  function typeLabel(u) { return t(D.typeMeta[u.type].labelKey); }

  function unitCard(u, dates) {
    var href = link('/apartments/' + u.slug, contextQuery());
    var tag = '';
    if (dates && dates.in && dates.out) {
      var ok = C.rangeCheck(cfg(), unavailableFor(u.id), dates.in, dates.out, C.todayISO()).ok;
      tag = ok
        ? '<span class="card__tag card__tag--free">' + esc(t('card.free')) + '</span>'
        : '<span class="card__tag card__tag--busy">' + esc(t('card.busy')) + '</span>';
    }
    return '<article class="card">' +
      '<div class="card__media"><div class="plate"><span class="plate__arch" aria-hidden="true"></span>' +
        '<span class="plate__t">' + esc(typeLabel(u)) + ' · ' + esc(u.no) + '</span></div>' + tag + '</div>' +
      '<div class="card__body">' +
        '<h3 class="card__title"><a href="' + href + '">' + esc(typeLabel(u)) + ' ' + esc(u.no) + '</a></h3>' +
        '<ul class="card__specs"><li>' + u.sqm + ' m²</li><li>' + esc(tn('guests', u.maxGuests)) + '</li></ul>' +
        '<div class="card__foot">' +
          '<span class="price">' + esc(money(C.minNightly(cfg(), u))) +
            '<span class="price__unit">' + esc(t('lbl.perNight')) + '</span></span>' +
          '<a class="btn btn--ghost btn--sm" href="' + href + '">' + esc(t('cta.viewUnit')) + '</a>' +
        '</div>' +
      '</div></article>';
  }

  function monthKeyOf(iso) { return String(iso || '').slice(0, 7); }

  function shiftMonth(key, delta) {
    var y = Number(key.slice(0, 4));
    var m = Number(key.slice(5, 7)) - 1 + delta;
    var d = new Date(y, m, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function monthLabel(key) {
    try {
      return new Intl.DateTimeFormat(state.locale, { month: 'long', year: 'numeric', numberingSystem: 'latn' })
        .format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
    } catch (e) { return key; }
  }

  function dowLabels() {
    var out = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(2024, 0, 1 + i); /* 2024-01-01 is a Monday */
      try { out.push(new Intl.DateTimeFormat(state.locale, { weekday: 'short', numberingSystem: 'latn' }).format(d)); }
      catch (e) { out.push(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][i]); }
    }
    return out;
  }

  function calendarHtml(unitId, sel) {
    var config = cfg();
    var today = C.todayISO();
    var limit = C.windowEnd(today, config.windowMonths);
    var un = unavailableFor(unitId);
    var key = /^\d{4}-\d{2}$/.test(state.calMonth)
      ? state.calMonth
      : (sel.checkIn ? monthKeyOf(sel.checkIn) : monthKeyOf(today));
    var y = Number(key.slice(0, 4));
    var mo = Number(key.slice(5, 7)) - 1;
    var startPad = (new Date(y, mo, 1).getDay() + 6) % 7;
    var daysIn = new Date(y, mo + 1, 0).getDate();
    var cells = [];
    var i, d;
    for (i = 0; i < startPad; i++) cells.push('');
    for (d = 1; d <= daysIn; d++) cells.push(y + '-' + pad2(mo + 1) + '-' + pad2(d));
    while (cells.length % 7 !== 0) cells.push('');

    var body = cells.map(function (iso) {
      if (!iso) return '<button class="is-out" type="button" tabindex="-1" disabled aria-hidden="true"></button>';
      var blocked = un.has(iso) || iso < today || iso > limit;
      var isIn = iso === sel.checkIn;
      var isOut = iso === sel.checkOut;
      var inRange = !!(sel.checkIn && sel.checkOut && iso > sel.checkIn && iso < sel.checkOut);
      var classes = [];
      if (inRange) classes.push('is-inrange');
      if (isIn) classes.push('is-edge-start');
      if (isOut) classes.push('is-edge-end');
      if (iso === today) classes.push('is-today');
      return '<button type="button" data-action="cal-day" data-day="' + iso + '"' +
        (classes.length ? ' class="' + classes.join(' ') + '"' : '') +
        (blocked ? ' disabled' : '') +
        (isIn || isOut ? ' aria-pressed="true"' : ' aria-pressed="false"') +
        ' aria-label="' + esc(dfmt(iso, 'long')) + '">' + Number(iso.slice(8, 10)) + '</button>';
    }).join('');

    var canPrev = key > monthKeyOf(today);
    var canNext = key < monthKeyOf(limit);
    return '<div class="cal">' +
      '<div class="cal__head"><span class="cal__title">' + esc(monthLabel(key)) + '</span>' +
        '<div class="cal__nav">' +
          '<button type="button" data-action="cal-nav" data-delta="-1"' + (canPrev ? '' : ' disabled') + ' aria-label="' + esc(t('lbl.checkIn')) + '">‹</button>' +
          '<button type="button" data-action="cal-nav" data-delta="1"' + (canNext ? '' : ' disabled') + ' aria-label="' + esc(t('lbl.checkOut')) + '">›</button>' +
        '</div></div>' +
      '<div class="cal__dow">' + dowLabels().map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
      '<div class="cal__grid">' + body + '</div>' +
      '</div>';
  }

  function quoteHtml(unit, sel, extra) {
    var config = cfg();
    var res = C.rangeCheck(config, unavailableFor(unit.id), sel.checkIn, sel.checkOut, C.todayISO());
    var q = res.ok ? C.quote(config, unit, sel.checkIn, sel.checkOut, sel.guests) : null;

    var head = '<div class="summary__unit">' +
      '<div class="summary__plate">' + esc(unit.no) + '</div>' +
      '<div><div class="summary__name">' + esc(typeLabel(unit)) + ' ' + esc(unit.no) + '</div>' +
      '<div class="summary__sub">' + esc(tn('guests', sel.guests)) + ' · ' + unit.sqm + ' m²</div></div></div>';

    var dates = '';
    if (sel.checkIn && sel.checkOut) {
      /* each date is isolated as a whole: in Arabic the first date must sit on the right,
         and a per-number isolate would drag the digits across the dash */
      dates = '<div class="tiny"><bdi>' + esc(dfmt(sel.checkIn, 'medium')) + '</bdi> – <bdi>' +
        esc(dfmt(sel.checkOut, 'medium')) + '</bdi> · ' +
        esc(tn('nights', C.nightsBetween(sel.checkIn, sel.checkOut))) + '</div>';
    }

    if (!sel.checkIn || !sel.checkOut) {
      return '<div class="panel summary">' + head + '<p class="tiny">' + esc(t('unit.selectDatesFirst')) + '</p>' + (extra || '') + '</div>';
    }
    if (!q) {
      return '<div class="panel summary">' + head + dates +
        '<div class="notice notice--err" style="margin-block-start:.8rem">' + esc(messageOf(res)) + '</div>' + (extra || '') + '</div>';
    }

    var lines = q.lines.map(function (ln) {
      var label = ln.key === 'quote.discount' ? bidiNum(t(ln.key, { pct: ln.pct })) : t(ln.key);
      if (ln.key === 'quote.nightly') label = label + ' · ' + tn('nights', ln.nights);
      if (ln.key === 'quote.extraGuest') label = label + ' · ' + tn('guests', ln.guests);
      return '<li' + (ln.amountMinor < 0 ? ' class="lines--neg"' : '') + '><span>' + esc(label) +
        '</span><span class="amt">' + esc(money(ln.amountMinor)) + '</span></li>';
    }).join('');

    var placeholder = q.lines.some(function (l) { return l.isPlaceholder; })
      ? '<div class="flag"><span aria-hidden="true">✳</span><span>' + esc(t('quote.placeholder')) + '</span></div>'
      : '';

    return '<div class="panel summary">' + head + dates +
      '<ul class="lines">' + lines + '</ul>' +
      '<div class="total"><span>' + esc(t('quote.total')) + '</span><span class="amt">' + esc(money(q.totalMinor)) + '</span></div>' +
      '<div class="due"><span>' + esc(t('quote.dueNow')) + '</span><span class="amt">' + esc(money(q.dueNowMinor)) + '</span></div>' +
      placeholder +
      '<div class="ttl">' + esc(t('quote.expires', { n: config.quoteTtlMinutes })) + '</div>' +
      (extra || '') + '</div>';
  }

  function stepsHtml(step) {
    var keys = ['booking.step1', 'booking.step2', 'booking.step3', 'booking.step4', 'booking.step5'];
    var items = keys.map(function (k, i) {
      var n = i + 1;
      var st = n < step ? 'done' : (n === step ? 'current' : 'todo');
      return '<li data-state="' + st + '"' + (n === step ? ' aria-current="step"' : '') + '>' +
        '<span class="n">' + n + '</span><span class="lbl">' + esc(t(k)) + '</span></li>';
    }).join('');
    return '<ol class="steps">' + items + '</ol>';
  }

  function fieldHtml(name, labelKey, opts) {
    opts = opts || {};
    var err = state.errors[name];
    var id = 'f-' + name;
    var val = state.form[name] == null ? '' : state.form[name];
    var input = opts.textarea
      ? '<textarea class="input" id="' + id + '" name="' + name + '" rows="3"' + (err ? ' aria-invalid="true"' : '') + '>' + esc(val) + '</textarea>'
      : '<input class="input" id="' + id + '" name="' + name + '" type="' + (opts.type || 'text') + '"' +
        (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
        (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : '') +
        ' value="' + esc(val) + '"' + (err ? ' aria-invalid="true" aria-describedby="' + id + '-err"' : '') + '>';
    return '<div class="field"><label for="' + id + '">' + esc(t(labelKey)) + '</label>' + input +
      (opts.hint ? '<p class="field__hint">' + esc(opts.hint) + '</p>' : '') +
      (err ? '<p class="field__err" id="' + id + '-err">' + esc(err) + '</p>' : '') +
      '</div>';
  }

  function pageHtml(opts) {
    return '<div class="wrap section ' + (opts.cls || '') + '">' +
      '<div class="stack">' +
        (opts.eyebrow ? '<p class="eyebrow">' + esc(opts.eyebrow) + '</p>' : '') +
        '<h1>' + esc(opts.title) + '</h1>' +
        (opts.lede ? '<p class="lede">' + esc(opts.lede) + '</p>' : '') +
      '</div>' +
      (opts.body || '') + '</div>';
  }

  /* ===================== 8. views ===================== */

  function flashHtml() {
    if (!state.flash) return '';
    return '<div class="notice" role="status">' + esc(state.flash) + '</div>';
  }

  function errorHtml(errors) {
    var keys = Object.keys(errors || {});
    if (!keys.length) return '';
    return '<div class="notice notice--err" role="alert">' + esc(errors[keys[0]]) + '</div>';
  }

  function dateField(name, labelKey, value, min, max) {
    return '<div class="field"><label for="q-' + name + '">' + esc(t(labelKey)) + '</label>' +
      '<input class="input" id="q-' + name + '" name="' + name + '" type="date" value="' + esc(value) + '"' +
      (min ? ' min="' + min + '"' : '') + (max ? ' max="' + max + '"' : '') + '></div>';
  }

  function searchFormHtml(sel) {
    var today = C.todayISO();
    var limit = C.windowEnd(today, cfg().windowMonths);
    return '<form class="search" data-form="search" novalidate>' +
      dateField('in', 'lbl.checkIn', sel.checkIn, today, limit) +
      dateField('out', 'lbl.checkOut', sel.checkOut, sel.checkIn || today, limit) +
      '<div class="field"><label for="q-g">' + esc(t('lbl.guests')) + '</label>' +
      '<select class="input" id="q-g" name="g">' + guestOptions(sel.guests, 6) + '</select></div>' +
      '<button class="btn btn--clay" type="submit">' + esc(t('cta.checkAvailability')) + '</button>' +
      '</form>';
  }

  function linesHtml(lines) {
    return '<ul class="lines">' + lines.map(function (ln) {
      var label = ln.key === 'quote.discount' ? bidiNum(t(ln.key, { pct: ln.pct })) : t(ln.key);
      if (ln.key === 'quote.nightly' && ln.nights) label = label + ' · ' + tn('nights', ln.nights);
      if (ln.key === 'quote.extraGuest' && ln.guests) label = label + ' · ' + tn('guests', ln.guests);
      return '<li' + (ln.amountMinor < 0 ? ' class="lines--neg"' : '') + '><span>' + esc(label) +
        '</span><span class="amt">' + esc(money(ln.amountMinor)) + '</span></li>';
    }).join('') + '</ul>';
  }

  function viewHome() {
    var sel = selOf('');
    var dates = { in: sel.checkIn, out: sel.checkOut };
    var cards = D.units.slice(0, 6).map(function (u) { return unitCard(u, dates); }).join('');
    var stats = [['12', 'home.stat1'], ['32–84', 'home.stat2'], ['5', 'home.stat3']].map(function (s) {
      return '<div class="stat"><div class="stat__n">' + esc('\u2066' + s[0] + '\u2069') + '</div>' +
        '<div class="stat__l">' + esc(t(s[1])) + '</div></div>';
    }).join('');
    var feats = ['1', '2', '3'].map(function (n) {
      return '<div class="feat"><div class="feat__n">' + n + '</div>' +
        '<h3>' + esc(t('home.why' + n + '.t')) + '</h3><p>' + esc(t('home.why' + n + '.d')) + '</p></div>';
    }).join('');

    return '<div class="wrap section"><div class="hero">' +
        '<div class="hero__grid"><div class="stack">' +
          '<p class="eyebrow">' + esc(t('home.eyebrow')) + '</p>' +
          '<h1>' + esc(t('home.title')) + '</h1>' +
          '<p class="lede">' + esc(t('home.lede')) + '</p>' +
        '</div>' +
        '<div class="hero__art" aria-hidden="true"><span>12</span></div></div>' +
        '<div class="hero__stats">' + stats + '</div>' +
      '</div></div>' +

      '<div class="wrap section section--tight"><div class="stack">' +
        '<h2>' + esc(t('home.searchTitle')) + '</h2>' +
        searchFormHtml(sel) +
        flashHtml() +
      '</div></div>' +

      '<div class="wrap section"><div class="stack">' +
        '<div class="row row--between"><h2>' + esc(t('home.unitsTitle')) + '</h2>' +
          '<a class="linkish" href="' + link('/apartments', contextQuery()) + '">' + esc(t('cta.exploreUnits')) + '</a></div>' +
        '<p class="lede">' + esc(t('home.unitsLede')) + '</p>' +
        '<div class="units">' + cards + '</div>' +
      '</div></div>' +

      '<div class="wrap section"><div class="stack">' +
        '<h2>' + esc(t('home.whyTitle')) + '</h2>' +
        '<div class="feats">' + feats + '</div>' +
      '</div></div>';
  }

  function viewApartments() {
    var sel = selOf('');
    var only = state.query.get('only') === '1';
    var dates = { in: sel.checkIn, out: sel.checkOut };
    var usable = only && sel.checkIn && sel.checkOut;
    var list = D.units.filter(function (u) {
      if (!usable) return true;
      return C.rangeCheck(cfg(), unavailableFor(u.id), sel.checkIn, sel.checkOut, C.todayISO()).ok;
    });
    var cards = list.map(function (u) { return unitCard(u, dates); }).join('');
    var chip = function (label, on, patch) {
      return '<a class="chip" aria-pressed="' + (on ? 'true' : 'false') + '" href="' +
        link('/apartments', patch) + '">' + esc(label) + '</a>';
    };
    var filters = chip(t('apt.all'), !only, { only: '', in: sel.checkIn, out: sel.checkOut, g: sel.guests }) +
      chip(t('apt.availableOnly'), only, { only: '1', in: sel.checkIn, out: sel.checkOut, g: sel.guests });

    return pageHtml({
      title: t('apt.title'),
      lede: t('apt.lede'),
      body: '<div class="stack">' +
        searchFormHtml(sel) +
        '<div class="filters">' + filters + '</div>' +
        (list.length ? '<div class="units">' + cards + '</div>'
          : '<p class="filters__note">' + esc(t('apt.noResults')) + '</p>') +
        '</div>'
    });
  }

  function viewUnit(slug) {
    var u = unitBySlug(slug);
    if (!u) return viewNotFound();
    var config = cfg();
    var sel = selOf(u.id);
    var res = C.rangeCheck(config, unavailableFor(u.id), sel.checkIn, sel.checkOut, C.todayISO());

    var specs = [
      [t('lbl.guests'), tn('guests', u.maxGuests)],
      [t('lbl.bedrooms'), u.bedrooms ? String(u.bedrooms) : t('lbl.studio')],
      [t('lbl.bathrooms'), String(u.bathrooms)],
      [t('lbl.sqm'), u.sqm + ' m²']
    ].map(function (row) {
      return '<li><span class="k">' + esc(row[0]) + '</span><span>' + esc(row[1]) + '</span></li>';
    }).join('');

    var amenities = u.amenities.map(function (a) {
      return '<li><span aria-hidden="true">·</span><span>' + esc(t('amenity.' + a)) + '</span></li>';
    }).join('');

    var cta = '<a class="btn btn--clay btn--wide" href="' +
      link('/booking', { unit: u.id, in: sel.checkIn, out: sel.checkOut, g: sel.guests, step: res.ok ? 3 : 2 }) + '">' +
      esc(res.ok ? t('cta.book') : t('booking.chooseDates')) + '</a>';

    return '<div class="wrap section"><div class="detail">' +
      '<div class="detail__body stack">' +
        '<p class="eyebrow">' + esc(typeLabel(u)) + ' · ' + esc(u.no) + '</p>' +
        '<h1>' + esc(typeLabel(u)) + ' ' + esc(u.no) + '</h1>' +
        '<p class="lede">' + esc(t('brand.tagline')) + '</p>' +
        '<ul class="spec-list">' + specs + '</ul>' +
        '<h2>' + esc(t('unit.overview')) + '</h2>' +
        '<p class="prose">' + esc(t('unit.locationNote')) + '</p>' +
        '<h2>' + esc(t('unit.amenities')) + '</h2>' +
        '<ul class="amenities">' + amenities + '</ul>' +
        '<h2>' + esc(t('unit.rules')) + '</h2>' +
        '<p class="muted">' + esc(t('unit.rulesNote')) + '</p>' +
        '<h2>' + esc(t('unit.calendar')) + '</h2>' +
        '<p class="tiny">' + esc(t('unit.calendarHint')) + '</p>' +
        flashHtml() +
        '<div class="cal-wrap">' + calendarHtml(u.id, sel) + '</div>' +
        '<p class="tiny">' + esc(t('unit.minStayNote', { n: config.minStay })) + '</p>' +
      '</div>' +
      '<aside class="aside">' + quoteHtml(u, sel, cta) + '</aside>' +
      '</div></div>';
  }

  function guestsField(sel) {
    return '<div class="field"><label for="b-g">' + esc(t('lbl.guests')) + '</label>' +
      '<select class="input" id="b-g" data-guests>' + guestOptions(sel.guests, 6) + '</select></div>';
  }

  function reviewHtml(sel) {
    var rows = [
      [t('lbl.checkIn'), dfmt(sel.checkIn, 'long')],
      [t('lbl.checkOut'), dfmt(sel.checkOut, 'long')],
      [t('lbl.nights'), tn('nights', C.nightsBetween(sel.checkIn, sel.checkOut))],
      [t('lbl.guests'), tn('guests', sel.guests)]
    ];
    return '<dl class="dl">' + rows.map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function detailsFormHtml() {
    var f = state.form;
    return '<form class="stack" data-form="details" novalidate>' +
      '<div class="two">' +
        fieldHtml('firstName', 'form.firstName', { autocomplete: 'given-name' }) +
        fieldHtml('lastName', 'form.lastName', { autocomplete: 'family-name' }) +
      '</div>' +
      '<div class="two">' +
        fieldHtml('email', 'form.email', { type: 'email', autocomplete: 'email' }) +
        fieldHtml('phone', 'form.phone', { type: 'tel', autocomplete: 'tel' }) +
      '</div>' +
      '<div class="two">' +
        fieldHtml('country', 'form.country', { autocomplete: 'country-name' }) +
        fieldHtml('arrival', 'form.arrival', { type: 'time' }) +
      '</div>' +
      fieldHtml('notes', 'form.notes', { textarea: true }) +
      '<label class="check"><input type="checkbox" name="consent"' + (f.consent ? ' checked' : '') + '>' +
        '<span>' + esc(t('form.consent')) + '</span></label>' +
      (state.errors.consent ? '<p class="field__err">' + esc(state.errors.consent) + '</p>' : '') +
      '<div class="row"><button class="btn btn--clay" type="submit">' + esc(t('cta.continue')) + '</button>' +
        '<button class="btn btn--quiet" type="button" data-action="back-review">' + esc(t('cta.back')) + '</button></div>' +
      '</form>';
  }

  function payFormHtml(q) {
    return '<form class="stack" data-form="pay" novalidate>' +
      fieldHtml('card', 'pay.card', { inputmode: 'numeric', autocomplete: 'cc-number' }) +
      '<div class="two">' +
        fieldHtml('expiry', 'pay.expiry', { inputmode: 'numeric', autocomplete: 'cc-exp' }) +
        fieldHtml('cvc', 'pay.cvc', { inputmode: 'numeric', autocomplete: 'cc-csc' }) +
      '</div>' +
      fieldHtml('cardName', 'pay.cardName', { autocomplete: 'cc-name' }) +
      '<p class="field__hint">' + esc(t('pay.secure')) + '</p>' +
      '<button class="btn btn--clay btn--wide" type="submit"' + (state.busy ? ' disabled' : '') + '>' +
        esc(state.busy ? t('pay.processing') : t('cta.pay', { amount: money(q.dueNowMinor) })) + '</button>' +
      '<button class="linkish" type="button" data-action="test-card">' + esc(t('pay.testCard')) + '</button>' +
      '<button class="btn btn--quiet btn--sm" type="button" data-action="back-details">' + esc(t('cta.back')) + '</button>' +
      '</form>';
  }

  function viewBooking() {
    var config = cfg();
    var unitId = state.query.get('unit') || '';
    var unit = unitById(unitId);
    var sel = selOf(unitId);
    var step = Number(state.query.get('step') || '1') || 1;
    if (!unit && step > 1) step = 1;
    if (unit && step > 2) {
      if (!C.rangeCheck(config, unavailableFor(unit.id), sel.checkIn, sel.checkOut, C.todayISO()).ok) step = 2;
    }
    step = C.clamp(step, 1, 5);

    var main = '';
    if (step === 1) {
      var pick = D.units.map(function (u) {
        var href = link('/booking', { unit: u.id, in: sel.checkIn, out: sel.checkOut, g: sel.guests, step: 2 });
        return '<li><a href="' + href + '">' +
          '<span class="pick__name">' + esc(typeLabel(u)) + ' ' + esc(u.no) + '</span>' +
          '<span class="pick__meta">' + u.sqm + ' m² · ' + esc(tn('guests', u.maxGuests)) + '</span>' +
          '<span class="pick__price">' + esc(money(C.minNightly(config, u))) + '</span>' +
          '<span class="pick__go" aria-hidden="true">→</span></a></li>';
      }).join('');
      main = '<div class="stack"><h2>' + esc(t('booking.pickUnit')) + '</h2>' +
        '<p class="tiny">' + esc(t('booking.pickUnitHint')) + '</p>' +
        '<ul class="pick">' + pick + '</ul></div>';
    } else if (step === 2) {
      main = '<div class="stack"><h2>' + esc(t('booking.datesTitle')) + '</h2>' +
        flashHtml() +
        '<div class="cal-wrap">' + calendarHtml(unit.id, sel) + '</div>' +
        guestsField(sel) +
        '<p class="tiny">' + esc(t('unit.minStayNote', { n: config.minStay })) + '</p>' +
        '<div class="row">' +
          '<button class="btn btn--clay" type="button" data-action="to-review">' + esc(t('cta.continue')) + '</button>' +
          '<a class="btn btn--quiet" href="' + link('/booking', { unit: '', in: sel.checkIn, out: sel.checkOut, g: sel.guests, step: 1 }) + '">' +
            esc(t('booking.changeUnit')) + '</a>' +
        '</div></div>';
    } else if (step === 3) {
      main = '<div class="stack"><h2>' + esc(t('booking.reviewTitle')) + '</h2>' +
        reviewHtml(sel) +
        '<div class="row">' +
          '<button class="btn btn--clay" type="button" data-action="to-details">' + esc(t('cta.continue')) + '</button>' +
          '<button class="btn btn--quiet" type="button" data-action="back-dates">' + esc(t('booking.editDates')) + '</button>' +
        '</div></div>';
    } else if (step === 4) {
      main = '<div class="stack"><h2>' + esc(t('booking.detailsTitle')) + '</h2>' +
        errorHtml(state.errors) +
        detailsFormHtml() + '</div>';
    } else {
      var q = C.quote(config, unit, sel.checkIn, sel.checkOut, sel.guests);
      main = '<div class="stack"><h2>' + esc(t('booking.paymentTitle')) + '</h2>' +
        errorHtml(state.errors) +
        (q.ok ? payFormHtml(q) : '<div class="notice notice--err">' + esc(t('err.generic')) + '</div>') +
        '</div>';
    }

    var summary = unit ? quoteHtml(unit, sel, '') : '<div class="panel summary">' +
      '<p class="tiny">' + esc(t('booking.noUnit')) + '</p></div>';

    return '<div class="wrap section">' +
      '<div class="stack"><p class="eyebrow">' + esc(t('booking.stepOf', { n: step })) + '</p>' +
        '<h1>' + esc(t('booking.title')) + '</h1></div>' +
      stepsHtml(step) +
      '<div class="wizard">' +
        '<div class="wizard__main">' + main + '</div>' +
        '<aside class="aside">' + summary + '</aside>' +
      '</div></div>';
  }

  function viewConfirmation(code) {
    var b = findBooking(code);
    if (!b) {
      return pageHtml({
        title: t('confirm.notFound'),
        body: '<p class="row"><a class="btn btn--clay" href="' + link('/apartments', params({})) + '">' +
          esc(t('confirm.backHome')) + '</a></p>'
      });
    }
    var unit = unitById(b.unitId);
    var cancelled = b.status === 'cancelled';
    var name = (unit ? typeLabel(unit) + ' ' + unit.no : b.unitId);
    var rowHtml = function (row) {
      return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>';
    };
    /* stay facts above the breakdown, money below it: reading order matches the decision
       the guest is making (what did I book -> what does it cost) */
    var stayRows = [
      [t('lbl.checkIn'), dfmt(b.checkIn, 'long')],
      [t('lbl.checkOut'), dfmt(b.checkOut, 'long')],
      [t('lbl.nights'), tn('nights', C.nightsBetween(b.checkIn, b.checkOut))],
      [t('lbl.guests'), tn('guests', b.guests)]
    ].map(rowHtml).join('');
    var moneyRows = [
      [t('quote.total'), money(b.totalMinor)],
      [t('quote.dueNow'), money(b.dueNowMinor)]
    ].map(rowHtml).join('');

    var acts = '<button class="btn btn--ghost btn--sm" type="button" data-action="ics" data-code="' + esc(b.code) + '">' +
        esc(t('cta.downloadIcs')) + '</button>' +
      '<button class="btn btn--quiet btn--sm no-print" type="button" data-action="print">' + esc('Print') + '</button>';

    return '<div class="wrap section"><article class="receipt">' +
      '<div class="receipt__top">' +
        '<div><p class="eyebrow">' + esc(t('confirm.code')) + '</p>' +
          '<div class="receipt__code">' + esc(b.code) + '</div></div>' +
        '<div class="receipt__acts no-print">' + acts + '</div>' +
      '</div>' +
      '<h1>' + esc(cancelled ? t('confirm.cancelled') : t('confirm.title')) + '</h1>' +
      '<p class="lede">' + esc(t('confirm.lede', { email: (b.guest && b.guest.email) || '' })) + '</p>' +
      '<h2>' + esc(t('confirm.summary')) + '</h2>' +
      '<p class="receipt__unit">' + esc(name) + '</p>' +
      '<dl class="dl">' + stayRows + '</dl>' +
      linesHtml(b.lines || []) +
      '<dl class="dl dl--money">' + moneyRows + '</dl>' +
      '<p class="tiny">' + esc(t('confirm.emailNote')) + '</p>' +
      (cancelled
        ? '<div class="stamp stamp--off">' + esc(t('confirm.cancelled')) + '</div>'
        : '<div class="row row--between no-print"><div><h3>' + esc(t('confirm.cancelTitle')) + '</h3>' +
            '<p class="tiny">' + esc(t('confirm.cancelNote')) + '</p></div>' +
            '<button class="btn btn--quiet btn--sm" type="button" data-action="cancel-booking" data-code="' + esc(b.code) + '">' +
              esc(t('cta.cancelBooking')) + '</button></div>') +
      '<p class="no-print"><a class="linkish" href="' + link('/apartments', params({})) + '">' +
        esc(t('confirm.backHome')) + '</a></p>' +
      '</article></div>';
  }

  function viewLocation() {
    var near = ['near1', 'near2', 'near3'].map(function (k) {
      return '<li>' + esc(t('location.' + k)) + '</li>';
    }).join('');
    return pageHtml({
      title: t('location.title'),
      lede: t('location.lede'),
      body: '<div class="stack">' +
        '<div class="panel stack"><h2>' + esc(t('location.near')) + '</h2><ul class="amenities">' + near + '</ul></div>' +
        '<div class="panel"><p class="tiny">' + esc(t('location.mapNote')) + '</p>' +
          '<p class="tiny"><span class="ph">ADDRESS_TBD</span></p></div>' +
        '<p class="muted">' + esc(t('unit.locationNote')) + '</p>' +
        '</div>'
    });
  }

  function viewFaq() {
    var acc = ['1', '2', '3'].map(function (n) {
      return '<details><summary>' + esc(t('faq.q' + n)) + '</summary>' +
        '<div class="acc__body"><p>' + esc(t('faq.a' + n)) + '</p></div></details>';
    }).join('');
    return pageHtml({ title: t('faq.title'), lede: t('faq.lede'), body: '<div class="acc">' + acc + '</div>' });
  }

  function viewPolicies() {
    var arts = ['cancel', 'house', 'privacy', 'terms'].map(function (k) {
      return '<article><h2>' + esc(t('policies.' + k + '.t')) + '</h2>' +
        '<p>' + esc(t('policies.' + k + '.d')) + '</p></article>';
    }).join('');
    return pageHtml({ title: t('policies.title'), lede: t('policies.lede'), body: '<div class="pol">' + arts + '</div>' });
  }

  function viewLegal() {
    var rows = [
      [t('legal.entityLabel'), cfg().legalEntity],
      [t('legal.licenseLabel'), cfg().license],
      [t('legal.addressLabel'), cfg().address]
    ].map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd><span class="ph">' + esc(r[1]) + '</span></dd></div>';
    }).join('');
    return pageHtml({
      title: t('legal.title'),
      body: '<div class="stack"><p>' + esc(t('legal.body')) + '</p>' +
        '<dl class="dl">' + rows + '</dl></div>'
    });
  }

  function viewNotFound() {
    return pageHtml({
      title: t('confirm.notFound'),
      body: '<p><a class="btn btn--clay" href="' + link('/', params({})) + '">' +
        esc(t('confirm.backHome')) + '</a></p>'
    });
  }

  function pageTitleOf(route) {
    switch (route.name) {
      case 'home': return t('meta.home.title');
      case 'apartments': return t('apt.title');
      case 'unit': {
        var u = unitBySlug(route.slug);
        return u ? typeLabel(u) + ' ' + u.no : t('apt.title');
      }
      case 'booking': return t('booking.title');
      case 'confirmation': return t('confirm.title');
      case 'location': return t('location.title');
      case 'faq': return t('faq.title');
      case 'policies': return t('policies.title');
      case 'legal': return t('legal.title');
      default: return t('meta.home.title');
    }
  }

  function viewFor(route) {
    switch (route.name) {
      case 'home': return viewHome();
      case 'apartments': return viewApartments();
      case 'unit': return viewUnit(route.slug);
      case 'booking': return viewBooking();
      case 'confirmation': return viewConfirmation(route.code);
      case 'location': return viewLocation();
      case 'faq': return viewFaq();
      case 'policies': return viewPolicies();
      case 'legal': return viewLegal();
      default: return viewNotFound();
    }
  }

  /* ===================== 9. render ===================== */

  function render() {
    var doc = global.document;
    if (!doc) return;
    var route = matchRoute(state.path);
    var head = doc.getElementById('siteHead');
    var foot = doc.getElementById('siteFoot');
    var view = doc.getElementById('view');
    if (head) head.innerHTML = headerHtml();
    if (foot) foot.innerHTML = footerHtml();
    if (view) view.innerHTML = viewFor(route);

    var de = doc.documentElement;
    de.setAttribute('lang', state.locale);
    de.setAttribute('dir', RTL[state.locale] ? 'rtl' : 'ltr');
    var title = pageTitleOf(route);
    doc.title = route.name === 'home' ? title : title + ' · ' + cfg().brand;
    var desc = doc.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('meta.home.desc'));

    if (state.lastPath !== state.path) {
      state.lastPath = state.path;
      try { global.scrollTo(0, 0); } catch (e) { /* no-op */ }
    }
  }

  /* ===================== 10. navigation helpers ===================== */

  function patchNav(patch, replace) {
    var sp = withQuery(patch);
    go(buildHash({ locale: state.locale, path: state.path, query: sp }), replace !== false);
  }

  function pickDay(day) {
    var unitId = currentUnitId();
    var sel = selOf(unitId);
    var nextIn = sel.checkIn;
    var nextOut = sel.checkOut;
    if (!nextIn || nextOut || day <= nextIn) {
      nextIn = day;
      nextOut = '';
    } else {
      nextOut = day;
    }
    if (nextIn && nextOut) {
      var res = C.rangeCheck(cfg(), unavailableFor(unitId), nextIn, nextOut, C.todayISO());
      if (!res.ok) {
        state.flash = messageOf(res);
        nextOut = '';
      } else {
        state.flash = '';
      }
    }
    patchNav({ in: nextIn, out: nextOut });
  }

  /* ===================== 11. booking form validation ===================== */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function readForm(el) {
    var out = {};
    Array.prototype.forEach.call(el.elements || [], function (node) {
      if (!node.name) return;
      out[node.name] = node.type === 'checkbox' ? node.checked : node.value;
    });
    return out;
  }

  function validateDetails(data) {
    var errs = {};
    if (!String(data.firstName || '').trim()) errs.firstName = t('err.name');
    if (!String(data.lastName || '').trim()) errs.lastName = t('err.required');
    var email = String(data.email || '').trim();
    if (!email) errs.email = t('err.required');
    else if (!EMAIL_RE.test(email)) errs.email = t('err.email');
    var phone = String(data.phone || '').replace(/[^\d]/g, '');
    if (!phone) errs.phone = t('err.phone');
    else if (phone.length < 6) errs.phone = t('err.phone');
    if (!data.consent) errs.consent = t('err.required');
    state.form = {
      firstName: data.firstName || '', lastName: data.lastName || '',
      email: email, phone: data.phone || '', country: data.country || '',
      arrival: data.arrival || '', notes: data.notes || '', consent: !!data.consent
    };
    state.errors = errs;
    if (Object.keys(errs).length) { render(); return; }
    patchNav({ step: 5 });
  }

  function validatePay(data) {
    var errs = {};
    var digits = String(data.card || '').replace(/\D/g, '');
    if (!digits) errs.card = t('err.required');
    else if (!C.luhn(digits)) errs.card = t('err.card');
    var exp = String(data.expiry || '').replace(/[^\d]/g, '');
    if (!exp) errs.expiry = t('err.required');
    else if (!C.validExpiry(exp, Date.now())) errs.expiry = t('err.expiry');
    var cvc = String(data.cvc || '').replace(/\D/g, '');
    if (cvc.length < 3 || cvc.length > 4) errs.cvc = t('err.cvc');
    if (!String(data.cardName || '').trim()) errs.cardName = t('err.name');

    state.form.card = data.card || '';
    state.form.expiry = data.expiry || '';
    state.form.cvc = data.cvc || '';
    state.form.cardName = data.cardName || '';
    state.errors = errs;
    if (Object.keys(errs).length) { render(); return; }
    state.busy = true;
    render();
    global.setTimeout(completeBooking, 900);
  }

  function completeBooking() {
    var config = cfg();
    var unit = unitById(state.query.get('unit') || '');
    var sel = selOf(unit ? unit.id : '');
    if (!unit) { state.busy = false; state.errors = {}; render(); return; }
    var res = C.rangeCheck(config, unavailableFor(unit.id), sel.checkIn, sel.checkOut, C.todayISO());
    var q = res.ok ? C.quote(config, unit, sel.checkIn, sel.checkOut, sel.guests) : null;
    if (!q) {
      state.busy = false;
      state.errors = { form: messageOf(res) };
      state.flash = messageOf(res);
      patchNav({ step: 2 });
      return;
    }
    var rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    var booking = {
      code: C.bookingCode(config.codePrefix, C.todayISO(), rand),
      unitId: unit.id, unitNo: unit.no, type: unit.type,
      checkIn: sel.checkIn, checkOut: sel.checkOut, guests: sel.guests,
      totalMinor: q.totalMinor, dueNowMinor: q.dueNowMinor, currency: q.currency,
      lines: q.lines, status: 'confirmed', locale: state.locale,
      createdAt: Date.now(), expiresAt: 0,
      quoteSnapshot: { nights: q.nights, guests: q.guests, currency: q.currency },
      guest: {
        firstName: state.form.firstName || '', lastName: state.form.lastName || '',
        email: state.form.email || '', phone: state.form.phone || ''
      }
    };
    var list = loadBookings();
    list.push(booking);
    saveBookings(list);
    state.busy = false;
    state.errors = {};
    state.flash = '';
    state.form = {};
    go(buildHash({ locale: state.locale, path: '/confirmation/' + booking.code, query: params({}) }), false);
  }

  /* ===================== 12. calendar (.ics) export ===================== */

  function icsText(b) {
    var unit = unitById(b.unitId);
    var name = unit ? typeLabel(unit) + ' ' + unit.no : b.unitId;
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '') + 'Z';
    var rows = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//' + cfg().icsPrefix + '//Booking//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + b.code + '@' + (cfg().domain || 'local'),
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + String(b.checkIn).replace(/-/g, ''),
      'DTEND;VALUE=DATE:' + String(b.checkOut).replace(/-/g, ''),
      'SUMMARY:' + cfg().brand + ' — ' + name,
      'DESCRIPTION:' + t('confirm.code') + ': ' + b.code,
      'LOCATION:' + cfg().address,
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return rows.join('\r\n');
  }

  function download(filename, text, mime) {
    try {
      var blob = new global.Blob([text], { type: mime });
      var url = global.URL.createObjectURL(blob);
      var a = global.document.createElement('a');
      a.href = url;
      a.download = filename;
      global.document.body.appendChild(a);
      a.click();
      global.document.body.removeChild(a);
      global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 1500);
      return true;
    } catch (e) {
      global.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
      return false;
    }
  }

  /* ===================== 13. events ===================== */

  /* native <details> does not close on an outside click; without this the language
     and display menus stay open behind whatever the guest clicks next */
  function closeMenus(target) {
    var doc = global.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    var open = doc.querySelectorAll('details[open]');
    for (var i = 0; i < open.length; i++) {
      if (open[i].contains && target && open[i].contains(target)) continue;
      open[i].removeAttribute('open');
    }
  }

  function onClick(e) {
    var target = e.target;
    if (target && target.closest) {
      var modeBtn = target.closest('[data-theme-option]');
      if (modeBtn) { setTheme(modeBtn.getAttribute('data-theme-option')); return; }
      var accBtn = target.closest('[data-accent-name]');
      if (accBtn) { setAccent(accBtn.getAttribute('data-accent-name')); return; }
    }
    closeMenus(target);
    var el = target && target.closest ? target.closest('[data-action]') : null;
    if (!el) return;
    var act = el.getAttribute('data-action');

    if (act === 'cal-nav') {
      var delta = Number(el.getAttribute('data-delta')) || 0;
      var sel = selOf(currentUnitId());
      var base = /^\d{4}-\d{2}$/.test(state.calMonth) ? state.calMonth : monthKeyOf(sel.checkIn || C.todayISO());
      state.calMonth = shiftMonth(base, delta);
      render();
      return;
    }

    if (act === 'cal-day') {
      e.preventDefault();
      pickDay(el.getAttribute('data-day'));
      return;
    }

    if (act === 'to-review') {
      var unitId = state.query.get('unit') || '';
      var s = selOf(unitId);
      var res = C.rangeCheck(cfg(), unavailableFor(unitId), s.checkIn, s.checkOut, C.todayISO());
      if (!res.ok) { state.flash = messageOf(res); render(); return; }
      state.flash = '';
      state.errors = {};
      patchNav({ step: 3 });
      return;
    }

    if (act === 'to-details') { state.errors = {}; patchNav({ step: 4 }); return; }
    if (act === 'back-dates') { state.errors = {}; patchNav({ step: 2 }); return; }
    if (act === 'back-review') { state.errors = {}; patchNav({ step: 3 }); return; }
    if (act === 'back-details') { state.errors = {}; patchNav({ step: 4 }); return; }

    if (act === 'test-card') {
      state.form.card = '4242 4242 4242 4242';
      state.form.expiry = '12/29';
      state.form.cvc = '123';
      state.form.cardName = state.form.cardName || 'TEST GUEST';
      state.errors = {};
      render();
      return;
    }

    if (act === 'ics') {
      var b = findBooking(el.getAttribute('data-code'));
      if (b) download(b.code + '.ics', icsText(b), 'text/calendar;charset=utf-8');
      return;
    }

    if (act === 'print') { try { global.print(); } catch (err) { /* no-op */ } return; }

    if (act === 'cancel-booking') {
      var code = el.getAttribute('data-code');
      var ok = true;
      try { if (global.confirm) ok = global.confirm(t('confirm.cancelTitle')); } catch (err) { ok = true; }
      if (!ok) return;
      setBookingStatus(code, 'cancelled');
      state.flash = t('confirm.cancelled');
      render();
      return;
    }
  }

  function onSubmit(e) {
    var form = e.target;
    var kind = form && form.getAttribute ? form.getAttribute('data-form') : null;
    if (!kind) return;
    e.preventDefault();
    var data = readForm(form);

    if (kind === 'search') {
      var q = params({ in: data.in || '', out: data.out || '', g: data.g || '2' });
      state.flash = '';
      go(buildHash({ locale: state.locale, path: '/apartments', query: q }), false);
      return;
    }
    if (kind === 'details') { validateDetails(data); return; }
    if (kind === 'pay') { validatePay(data); return; }
  }

  function onChange(e) {
    var el = e.target;
    if (!el || !el.hasAttribute) return;
    if (el.hasAttribute('data-guests')) {
      el.blur();
      patchNav({ g: el.value });
    }
  }

  function onInput(e) {
    var el = e.target;
    if (!el || !el.name) return;
    var form = el.closest ? el.closest('[data-form]') : null;
    if (!form) return;
    var kind = form.getAttribute('data-form');
    if (kind !== 'details' && kind !== 'pay') return;
    state.form[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }

  /* ===================== 14. boot ===================== */

  function onHashChange() {
    readLocation();
    state.flash = '';
    state.errors = {};
    render();
  }

  function boot() {
    state.theme = restore(THEME_KEY, THEMES, 'auto');
    state.accent = restore(ACCENT_KEY, ACCENTS, 'clay');
    applyTheme(false);
    try {
      if (global.matchMedia) {
        var mq = global.matchMedia('(prefers-color-scheme: dark)');
        var onSchemeChange = function () { if (state.theme === 'auto') applyTheme(true); };
        if (mq.addEventListener) mq.addEventListener('change', onSchemeChange);
        else if (mq.addListener) mq.addListener(onSchemeChange);
      }
    } catch (e) { /* no matchMedia: stay on the stored choice */ }
    readLocation();
    state.calMonth = monthKeyOf(state.query.get('in') || C.todayISO());
    var doc = global.document;
    doc.addEventListener('click', onClick);
    doc.addEventListener('submit', onSubmit);
    doc.addEventListener('change', onChange);
    doc.addEventListener('input', onInput);
    global.addEventListener('hashchange', onHashChange);
    if (!global.location.hash) {
      try { global.history.replaceState(null, '', '#/'); } catch (e) { global.location.hash = '/'; }
    }
    render();
  }

  global.LCS_APP = {
    render: render, boot: boot, state: state,
    go: go, buildHash: buildHash, parseHash: parseHash,
    matchRoute: matchRoute, t: t, icsText: icsText,
    __test: {
      viewFor: viewFor, validateDetails: validateDetails, validatePay: validatePay,
      completeBooking: completeBooking, pickDay: pickDay,
      loadBookings: loadBookings, findBooking: findBooking, setBookingStatus: setBookingStatus,
      setTheme: setTheme, setAccent: setAccent, applyTheme: applyTheme,
      resolveTheme: resolveTheme, prefersDark: prefersDark
    }
  };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : this);
