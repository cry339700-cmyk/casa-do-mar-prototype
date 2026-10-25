/* LCS fixtures — placeholder data for the prototype.
   Every value marked isPlaceholder is a stand-in for 待补充: in the plan. */
(function (root) {
  'use strict';
  var C = root.LCS_CORE;

  var config = {
    brand: 'Casa do Mar',            // 待补充：D6 品牌名
    brandIsPlaceholder: true,
    domain: 'DOMAIN_TBD',            // 待补充：D6 域名
    currency: 'EUR',                 // 待补充：D12 结算货币
    currencyIsPlaceholder: true,
    locales: ['en', 'pt', 'fr', 'es', 'ru', 'ar', 'zh'],
    defaultLocale: 'en',
    rtlLocales: ['ar'],
    minStay: 2,
    maxStay: 28,
    windowMonths: 12,
    weekendMultiplier: 1.15,
    seasons: [0.85, 0.85, 0.90, 1.05, 1.20, 1.35, 1.35, 1.35, 1.20, 1.05, 0.85, 0.90],
    extraGuestFee: 18,               // 待补充：D8 加人费
    discounts: { weekly: 0.10, monthly: 0.25 },   // 待补充：D8 长住折扣
    tax: { enabled: true, perPersonPerNight: 2, maxNights: 7, isPlaceholder: true }, // 待补充：D9 城市税/旅游税
    quoteTtlMinutes: 15,
    lockTtlMinutes: 30,
    license: 'LICENSE_NO',           // 待补充：D2 短租执照号
    legalEntity: 'LEGAL_ENTITY_TBD', // 待补充：D6 运营主体
    address: 'ADDRESS_TBD',          // 待补充：D1 地址
    contactEmail: 'hello@example.com',
    icsPrefix: 'CASADOMAR',
    codePrefix: 'CDM'
  };

  var typeMeta = {
    studio:    { labelKey: 'type.studio',    bedrooms: 0, baseGuests: 2, maxGuests: 2, sqm: 32, bathrooms: 1, floor: 1,  baseNightly: 95,  cleaningFee: 35 },
    one:       { labelKey: 'type.one',       bedrooms: 1, baseGuests: 2, maxGuests: 3, sqm: 48, bathrooms: 1, floor: 2,  baseNightly: 130, cleaningFee: 45 },
    two:       { labelKey: 'type.two',       bedrooms: 2, baseGuests: 4, maxGuests: 5, sqm: 68, bathrooms: 2, floor: 3,  baseNightly: 175, cleaningFee: 60 },
    penthouse: { labelKey: 'type.penthouse', bedrooms: 2, baseGuests: 4, maxGuests: 6, sqm: 84, bathrooms: 2, floor: 5,  baseNightly: 240, cleaningFee: 75 }
  };

  /* 12 units: [no, type, view, floorOverride?] */
  var rows = [
    [1,  'studio',    'garden'],
    [2,  'studio',    'courtyard'],
    [3,  'studio',    'street'],
    [4,  'one',       'garden'],
    [5,  'one',       'courtyard'],
    [6,  'one',       'river'],
    [7,  'one',       'street'],
    [8,  'two',       'garden'],
    [9,  'two',       'river'],
    [10, 'two',       'courtyard'],
    [11, 'penthouse', 'river'],
    [12, 'penthouse', 'rooftop']
  ];

  var amenityPool = {
    studio:    ['wifi', 'ac', 'kitchen', 'washer', 'elevator'],
    one:       ['wifi', 'ac', 'kitchen', 'washer', 'balcony', 'workspace', 'elevator'],
    two:       ['wifi', 'ac', 'kitchen', 'washer', 'balcony', 'workspace', 'elevator', 'parking'],
    penthouse: ['wifi', 'ac', 'kitchen', 'washer', 'balcony', 'workspace', 'elevator', 'parking', 'terrace']
  };

  var units = rows.map(function (r) {
    var no = r[0], type = r[1], view = r[2], meta = typeMeta[type];
    return {
      id: 'unit-' + String(no).padStart(2, '0'),
      slug: 'unit-' + String(no).padStart(2, '0'),
      no: String(no).padStart(2, '0'),
      type: type,
      view: view,
      floor: meta.floor,
      sqm: meta.sqm,
      bathrooms: meta.bathrooms,
      bedrooms: meta.bedrooms,
      baseGuests: meta.baseGuests,
      maxGuests: meta.maxGuests,
      baseNightly: meta.baseNightly,
      cleaningFee: meta.cleaningFee,
      amenities: amenityPool[type]
    };
  });

  /* Deterministic blocked windows, relative to today, so the demo always has gaps. */
  function buildBlocks(today) {
    var out = [];
    units.forEach(function (u, i) {
      out.push({ unitId: u.id, from: C.addDays(today, 8 + ((i * 5) % 17)), nights: 4 });
      out.push({ unitId: u.id, from: C.addDays(today, 44 + ((i * 7) % 24)), nights: 6 });
      out.push({ unitId: u.id, from: C.addDays(today, 86 + ((i * 3) % 19)), nights: 3 });
    });
    // one unit fully booked for the first three weeks — exercises the "sold out" path
    out.push({ unitId: 'unit-12', from: today, nights: 21 });
    return out;
  }

  root.LCS_DATA = {
    config: config,
    typeMeta: typeMeta,
    units: units,
    buildBlocks: buildBlocks
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
