/* LCS core — pure logic, no DOM. Shared by the browser app and node tests. */
(function (root) {
  'use strict';

  var MS_DAY = 86400000;

  function pad2(n) { return String(n).padStart(2, '0'); }
  function parseISO(iso) {
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayISO() { return toISO(new Date()); }
  function addDays(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
  function nightsBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / MS_DAY); }
  function eachNight(a, b) {
    var n = nightsBetween(a, b), out = [], i;
    for (i = 0; i < n; i++) out.push(addDays(a, i));
    return out;
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function windowEnd(today, months) { return addDays(today, Math.round(months * 30.44)); }

  /* ---------- pricing ---------- */

  function isWeekendNight(iso) { var w = parseISO(iso).getDay(); return w === 5 || w === 6; }

  function nightlyRate(cfg, unit, iso) {
    var season = cfg.seasons[parseISO(iso).getMonth()];
    if (typeof season !== 'number') season = 1;
    var weekend = isWeekendNight(iso) ? cfg.weekendMultiplier : 1;
    return Math.round(unit.baseNightly * 100 * season * weekend);
  }

  function minNightly(cfg, unit) {
    var lowest = Math.min.apply(null, cfg.seasons);
    return Math.round(unit.baseNightly * 100 * lowest);
  }

  function discountRate(cfg, nights) {
    if (nights >= 28 && cfg.discounts.monthly) return cfg.discounts.monthly;
    if (nights >= 7 && cfg.discounts.weekly) return cfg.discounts.weekly;
    return 0;
  }

  function quote(cfg, unit, checkIn, checkOut, guests) {
    var nights = nightsBetween(checkIn, checkOut);
    if (!checkIn || !checkOut || nights <= 0) return { ok: false, code: 'err.order' };

    var g = clamp(Number(guests) || 1, 1, unit.maxGuests);
    var lodging = 0;
    eachNight(checkIn, checkOut).forEach(function (d) { lodging += nightlyRate(cfg, unit, d); });

    var extraGuests = Math.max(0, g - unit.baseGuests);
    var extra = extraGuests * Math.round(cfg.extraGuestFee * 100) * nights;
    var cleaning = Math.round(unit.cleaningFee * 100);
    var rate = discountRate(cfg, nights);
    var discount = -Math.round(lodging * rate);

    var tax = 0;
    if (cfg.tax && cfg.tax.enabled) {
      var taxedNights = Math.min(nights, cfg.tax.maxNights || nights);
      tax = Math.round(cfg.tax.perPersonPerNight * 100) * g * taxedNights;
    }

    var lines = [{ key: 'quote.nightly', amountMinor: lodging, nights: nights }];
    if (cleaning) lines.push({ key: 'quote.cleaning', amountMinor: cleaning });
    if (extra) lines.push({ key: 'quote.extraGuest', amountMinor: extra, guests: extraGuests, nights: nights });
    if (discount) lines.push({ key: 'quote.discount', amountMinor: discount, pct: Math.round(rate * 100) });
    if (tax) lines.push({ key: 'quote.tax', amountMinor: tax, isPlaceholder: !!(cfg.tax && cfg.tax.isPlaceholder) });

    var subtotal = lodging + cleaning + extra + discount;
    return {
      ok: true,
      nights: nights,
      guests: g,
      lines: lines,
      subtotalMinor: subtotal,
      totalMinor: subtotal + tax,
      dueNowMinor: subtotal + tax,
      currency: cfg.currency,
      currencyIsPlaceholder: !!cfg.currencyIsPlaceholder
    };
  }

  /* ---------- availability ---------- */

  function buildUnavailability(units, blocks, bookings, nowMs) {
    var map = {};
    units.forEach(function (u) { map[u.id] = new Set(); });

    (blocks || []).forEach(function (b) {
      var ids = b.unitId ? [b.unitId] : Object.keys(map);
      ids.forEach(function (id) {
        var set = map[id];
        if (!set) return;
        for (var i = 0; i < b.nights; i++) set.add(addDays(b.from, i));
      });
    });

    (bookings || []).forEach(function (bk) {
      if (!bk || bk.status === 'cancelled') return;
      if (bk.status === 'pending' && bk.expiresAt && Date.parse(bk.expiresAt) <= nowMs) return;
      var set = map[bk.unitId];
      if (!set) return;
      eachNight(bk.checkIn, bk.checkOut).forEach(function (d) { set.add(d); });
    });

    return map;
  }

  function rangeCheck(cfg, unavailable, checkIn, checkOut, today) {
    if (!checkIn || !checkOut) return { ok: false, code: 'err.required' };
    var nights = nightsBetween(checkIn, checkOut);
    if (nights <= 0) return { ok: false, code: 'err.order' };
    if (checkIn < today) return { ok: false, code: 'err.past' };
    if (checkOut > windowEnd(today, cfg.windowMonths)) return { ok: false, code: 'err.window' };
    if (nights < cfg.minStay) return { ok: false, code: 'err.minStay', n: cfg.minStay };
    if (nights > cfg.maxStay) return { ok: false, code: 'err.maxStay', n: cfg.maxStay };
    for (var d = checkIn; d < checkOut; d = addDays(d, 1)) {
      if (unavailable.has(d)) return { ok: false, code: 'err.blocked', date: d };
    }
    return { ok: true, nights: nights };
  }

  /* last valid check-out date: the first unavailable night after checkIn */
  function maxCheckOut(unavailable, checkIn, cfg) {
    var limit = addDays(checkIn, cfg.maxStay);
    var last = addDays(checkIn, 1);
    for (var d = addDays(checkIn, 1); d <= limit; d = addDays(d, 1)) {
      last = d;
      /* a taken night still works as the departure day: the guest leaves that morning */
      if (unavailable.has(d)) break;
    }
    return last;
  }

  /* ---------- formatting ---------- */

  function pluralCategory(locale, n) {
    var l = String(locale).split('-')[0];
    n = Math.abs(Number(n) || 0);
    if (l === 'ru') {
      var m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return 'one';
      if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 'few';
      return 'many';
    }
    if (l === 'ar') {
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      if (n % 100 >= 3 && n % 100 <= 10) return 'few';
      return 'many';
    }
    if (l === 'pt' || l === 'fr') return n === 1 ? 'one' : 'other';
    if (l === 'es') return n === 1 ? 'one' : 'other';
    return n === 1 ? 'one' : 'other';
  }

  function formatMoney(minor, currency, locale) {
    var value = minor / 100;
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'EUR',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2,
        numberingSystem: 'latn'
      }).format(value);
    } catch (e) {
      return (currency || 'EUR') + ' ' + value.toFixed(2);
    }
  }

  function formatDate(iso, locale, style) {
    var opts = {
      short: { day: 'numeric', month: 'short' },
      medium: { day: 'numeric', month: 'short', year: 'numeric' },
      long: { weekday: 'long', day: 'numeric', month: 'long' },
      month: { month: 'long', year: 'numeric' },
      weekday: { weekday: 'short' }
    }[style || 'medium'];
    try {
      return new Intl.DateTimeFormat(locale, Object.assign({ numberingSystem: 'latn' }, opts)).format(parseISO(iso));
    } catch (e) {
      return iso;
    }
  }

  /* ---------- payment helpers ---------- */

  function luhn(digits) {
    var s = String(digits).replace(/\D/g, '');
    if (s.length < 13 || s.length > 19) return false;
    var sum = 0, alt = false;
    for (var i = s.length - 1; i >= 0; i--) {
      var d = s.charCodeAt(i) - 48;
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function validExpiry(mmYY, nowMs) {
    var m = String(mmYY).match(/^(\d{2})\s*\/?\s*(\d{2})$/);
    if (!m) return false;
    var month = Number(m[1]), year = 2000 + Number(m[2]);
    if (month < 1 || month > 12) return false;
    var end = new Date(year, month, 1).getTime(); // first day of next month
    return end > (nowMs || Date.now());
  }

  function luhnLast4(digits) { return String(digits).replace(/\D/g, '').slice(-4); }

  function bookingCode(prefix, dateISO, rand) {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var r = typeof rand === 'function' ? rand() : Math.random();
    var out = '';
    for (var i = 0; i < 4; i++) {
      r = typeof rand === 'function' ? rand() : Math.random();
      out += alphabet[Math.floor(r * alphabet.length) % alphabet.length];
    }
    return String(prefix || 'BOOK') + '-' + String(dateISO || todayISO()).replace(/-/g, '') + '-' + out;
  }

  /* price for a whole stay, no extras — used by list cards */
  function stayTotal(cfg, unit, checkIn, checkOut) {
    var sum = 0;
    eachNight(checkIn, checkOut).forEach(function (d) { sum += nightlyRate(cfg, unit, d); });
    return sum;
  }

  var api = {
    MS_DAY: MS_DAY,
    parseISO: parseISO,
    toISO: toISO,
    todayISO: todayISO,
    addDays: addDays,
    nightsBetween: nightsBetween,
    eachNight: eachNight,
    clamp: clamp,
    windowEnd: windowEnd,
    isWeekendNight: isWeekendNight,
    nightlyRate: nightlyRate,
    minNightly: minNightly,
    discountRate: discountRate,
    quote: quote,
    buildUnavailability: buildUnavailability,
    rangeCheck: rangeCheck,
    maxCheckOut: maxCheckOut,
    pluralCategory: pluralCategory,
    formatMoney: formatMoney,
    formatDate: formatDate,
    luhn: luhn,
    validExpiry: validExpiry,
    luhnLast4: luhnLast4,
    bookingCode: bookingCode,
    stayTotal: stayTotal
  };

  root.LCS_CORE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
