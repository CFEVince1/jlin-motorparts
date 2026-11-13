/**
 * Standard 15-Category Motorparts Taxonomy
 * Official J-Lin Motor Parts Inventory Taxonomy
 */

export const SHORT_TAXONOMY = {
  'Engine': {
    key: 'Engine',
    label: 'Engine',
    skuPrefix: 'ENG',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    dot: '#f59e0b',
    scope: 'Blocks, pistons, valves, cylinder heads, crankshaft, gaskets, engine parts',
    aliases: ['engine', 'engine parts', 'piston', 'valves', 'cylinder', 'gasket', 'crankshaft', 'block']
  },
  'Tires': {
    key: 'Tires',
    label: 'Tires',
    skuPrefix: 'TIRE',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.35)',
    dot: '#06b6d4',
    scope: 'Tubeless tires, tube type tires, inner tubes, tire sealants',
    aliases: ['tires', 'tire', 'inner tube', 'tubeless', 'tube']
  },
  'Wheels & Hubs': {
    key: 'Wheels & Hubs',
    label: 'Wheels & Hubs',
    skuPrefix: 'WHL',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.35)',
    dot: '#0284c7',
    scope: 'Mags, rims, wheel hubs, spokes, wheel bearings, axle',
    aliases: ['wheels & hubs', 'wheels', 'mags', 'rim', 'rims', 'hub', 'hubs', 'spokes', 'axle', 'wheel bearing']
  },
  'CVT & Pulleys': {
    key: 'CVT & Pulleys',
    label: 'CVT & Pulleys',
    skuPrefix: 'CVT',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    dot: '#10b981',
    scope: 'V-belts, pulley sets, flyballs, drive face, clutch bell, clutch lining, torque drive, clutch springs',
    aliases: ['cvt & pulleys', 'cvt', 'transmission', 'drive', 'v-belt', 'belt', 'pulley', 'flyball', 'clutch', 'torque drive', 'drive face']
  },
  'Suspension': {
    key: 'Suspension',
    label: 'Suspension',
    skuPrefix: 'SUSP',
    color: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.12)',
    border: 'rgba(20, 184, 166, 0.35)',
    dot: '#14b8a6',
    scope: 'Front fork, rear shock absorbers, fork oil, bushings, swing arm',
    aliases: ['suspension', 'shock', 'shocks', 'rear shock', 'front fork', 'fork', 'swing arm', 'absorber']
  },
  'Exhaust': {
    key: 'Exhaust',
    label: 'Exhaust',
    skuPrefix: 'EXH',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(249, 115, 22, 0.35)',
    dot: '#f97316',
    scope: 'Exhaust pipe, silencer, manifold, exhaust gasket, thermal wrap, power pipe',
    aliases: ['exhaust', 'pipe', 'silencer', 'muffler', 'manifold', 'power pipe']
  },
  'Brakes': {
    key: 'Brakes',
    label: 'Brakes',
    skuPrefix: 'BRK',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    dot: '#ef4444',
    scope: 'Brake pads, brake shoes, calipers, disc rotors, master cylinder, brake hose, brake levers',
    aliases: ['brakes', 'brake', 'caliper', 'rotors', 'rotor', 'pads', 'brake pads', 'brake shoe', 'master cylinder', 'brake hose']
  },
  'Chains & Sprockets': {
    key: 'Chains & Sprockets',
    label: 'Chains & Sprockets',
    skuPrefix: 'CHN',
    color: '#84cc16',
    bg: 'rgba(132, 204, 22, 0.12)',
    border: 'rgba(132, 204, 22, 0.35)',
    dot: '#84cc16',
    scope: 'Drive chains, front sprockets, rear sprockets, chain lube, tensioner, chain guide',
    aliases: ['chains & sprockets', 'chain', 'chains', 'sprocket', 'sprockets', 'drive chain']
  },
  'Handlebars & Controls': {
    key: 'Handlebars & Controls',
    label: 'Handlebars & Controls',
    skuPrefix: 'HNDL',
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.35)',
    dot: '#6366f1',
    scope: 'Handlebars, throttle grips, levers, throttle cables, clutch cables, handle switches',
    aliases: ['handlebars & controls', 'handlebars', 'handlebar', 'grips', 'throttle', 'lever', 'cables', 'switch']
  },
  'Lights & Mirrors': {
    key: 'Lights & Mirrors',
    label: 'Lights & Mirrors',
    skuPrefix: 'LGHT',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.12)',
    border: 'rgba(234, 179, 8, 0.35)',
    dot: '#eab308',
    scope: 'Headlights, signal lights, tail lights, LED bulbs, side mirrors, mini driving lights',
    aliases: ['lights & mirrors', 'lights', 'light', 'mirror', 'mirrors', 'headlight', 'signal light', 'tail light', 'bulb', 'led']
  },
  'Electrical': {
    key: 'Electrical',
    label: 'Electrical',
    skuPrefix: 'ELEC',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
    dot: '#3b82f6',
    scope: 'ECU, CDI, ignition coil, regulator/rectifier, stator, starter motor, batteries, spark plugs, wiring harness',
    aliases: ['electrical', 'elec', 'electronics', 'ecu', 'cdi', 'battery', 'batteries', 'spark plug', 'stator', 'regulator', 'wiring', 'starter']
  },
  'Oils & Lubricants': {
    key: 'Oils & Lubricants',
    label: 'Oils & Lubricants',
    skuPrefix: 'OIL',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.35)',
    dot: '#a855f7',
    scope: 'Engine oil, 4T/2T, gear oil, brake fluid, coolant, fork oil, grease, chain wax',
    aliases: ['oils & lubricants', 'oils', 'oil', 'lubricants', 'fluid', 'coolant', 'gear oil', 'brake fluid', 'engine oil', 'grease']
  },
  'Bolts & Accessories': {
    key: 'Bolts & Accessories',
    label: 'Bolts & Accessories',
    skuPrefix: 'BLT',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.12)',
    border: 'rgba(236, 72, 153, 0.35)',
    dot: '#ec4899',
    scope: 'Titanium bolts, stainless bolts, nuts, washers, phone mounts, crash guards, brackets',
    aliases: ['bolts & accessories', 'bolts', 'accessories', 'bolt', 'nut', 'washers', 'bracket', 'mount', 'crash guard']
  },
  'Body & Seats': {
    key: 'Body & Seats',
    label: 'Body & Seats',
    skuPrefix: 'BODY',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.35)',
    dot: '#8b5cf6',
    scope: 'Fairings, body plastics, seat covers, seat assembly, fenders, windshields',
    aliases: ['body & seats', 'body', 'seats', 'seat', 'fairing', 'fairings', 'plastic', 'fender', 'windshield']
  },
  'Riding Gear & Luggage': {
    key: 'Riding Gear & Luggage',
    label: 'Riding Gear & Luggage',
    skuPrefix: 'GEAR',
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.35)',
    dot: '#64748b',
    scope: 'Helmets, riding jackets, gloves, top boxes, saddle bags, raincoats',
    aliases: ['riding gear & luggage', 'gear', 'luggage', 'helmet', 'gloves', 'jacket', 'top box', 'box', 'bag']
  }
};

export const STANDARD_TAXONOMY_KEYS = [
  'Engine',
  'Tires',
  'Wheels & Hubs',
  'CVT & Pulleys',
  'Suspension',
  'Exhaust',
  'Brakes',
  'Chains & Sprockets',
  'Handlebars & Controls',
  'Lights & Mirrors',
  'Electrical',
  'Oils & Lubricants',
  'Bolts & Accessories',
  'Body & Seats',
  'Riding Gear & Luggage'
];

export const MOTORCYCLE_CATEGORIES = STANDARD_TAXONOMY_KEYS;

export const CANONICAL_CATEGORIES = STANDARD_TAXONOMY_KEYS.map(key => {
  const conf = SHORT_TAXONOMY[key];
  return {
    code: conf.skuPrefix,
    name: conf.key,
    label: `${conf.label} (${conf.skuPrefix})`,
    color: conf.color,
    bg: conf.bg,
    border: conf.border
  };
});

export const CANONICAL_6_CATEGORIES = CANONICAL_CATEGORIES;

export const getShortCategory = (rawCategory) => {
  if (!rawCategory || typeof rawCategory !== 'string') {
    return {
      key: 'Other',
      label: 'Other',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      border: 'rgba(148, 163, 184, 0.3)',
      dot: '#94a3b8'
    };
  }
  const clean = rawCategory.trim();
  const lower = clean.toLowerCase();

  // 1. Direct key or label match
  for (const [key, conf] of Object.entries(SHORT_TAXONOMY)) {
    if (key.toLowerCase() === lower || conf.label.toLowerCase() === lower) {
      return { ...conf };
    }
  }

  // 2. Exact alias match
  for (const conf of Object.values(SHORT_TAXONOMY)) {
    if (conf.aliases.some(alias => alias === lower)) {
      return { ...conf };
    }
  }

  // 3. Substring alias match
  for (const conf of Object.values(SHORT_TAXONOMY)) {
    if (conf.aliases.some(alias => lower.includes(alias))) {
      return { ...conf };
    }
  }

  // 4. Fallback: return clean category name with standard styling
  return {
    key: clean,
    label: clean,
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.3)',
    dot: '#94a3b8'
  };
};

export const getCategoryBadgeMeta = (catOrCode) => {
  if (!catOrCode) return CANONICAL_CATEGORIES[0];
  const str = String(catOrCode).trim().toLowerCase();
  const direct = CANONICAL_CATEGORIES.find(c => c.name.toLowerCase() === str || c.code.toLowerCase() === str);
  if (direct) return direct;
  const short = getShortCategory(catOrCode);
  return CANONICAL_CATEGORIES.find(c => c.name.toLowerCase() === short.key.toLowerCase()) || CANONICAL_CATEGORIES[0];
};

/**
 * 3-4 Letter Standard Stock History Category Codes
 */
export const getLedgerCategoryCode = (rawCategory) => {
  if (!rawCategory || typeof rawCategory !== 'string') return 'PART';
  const clean = rawCategory.trim();
  const upper = clean.toUpperCase();

  // Direct code match
  if (['ENG', 'BRK', 'CVT', 'ELEC', 'OIL', 'TIRE', 'WHL', 'SUSP', 'EXH', 'CHN', 'HNDL', 'LGHT', 'BLT', 'BODY', 'GEAR', 'CHAS'].includes(upper)) {
    return upper;
  }

  const lower = clean.toLowerCase();
  // Keyword & semantic category detection
  if (lower.includes('brake') || lower.includes('caliper') || lower.includes('rotor') || lower.includes('pad')) return 'BRK';
  if (lower.includes('cvt') || lower.includes('belt') || lower.includes('pulley') || lower.includes('flyball')) return 'CVT';
  if (lower.includes('engine') || lower.includes('piston') || lower.includes('cylinder') || lower.includes('valve') || lower.includes('carburetor')) return 'ENG';
  if (lower.includes('electric') || lower.includes('ecu') || lower.includes('cdi') || lower.includes('spark') || lower.includes('battery')) return 'ELEC';
  if (lower.includes('oil') || lower.includes('fluid') || lower.includes('lubricant') || lower.includes('coolant')) return 'OIL';
  if (lower.includes('tire') || lower.includes('tube')) return 'TIRE';
  if (lower.includes('wheel') || lower.includes('mag') || lower.includes('hub') || lower.includes('rim')) return 'WHL';
  if (lower.includes('suspension') || lower.includes('shock') || lower.includes('fork')) return 'SUSP';
  if (lower.includes('exhaust') || lower.includes('pipe') || lower.includes('muffler')) return 'EXH';
  if (lower.includes('chain') || lower.includes('sprocket')) return 'CHN';
  if (lower.includes('handle') || lower.includes('grip') || lower.includes('lever')) return 'HNDL';
  if (lower.includes('light') || lower.includes('mirror') || lower.includes('bulb') || lower.includes('lamp')) return 'LGHT';
  if (lower.includes('bolt') || lower.includes('screw') || lower.includes('nut')) return 'BLT';

  const short = getShortCategory(rawCategory);
  return short.skuPrefix || (clean.length <= 4 ? upper : 'PART');
};

/**
 * Shorten Fallback Brand Labels:
 * Replaces lengthy "Racing Boy (RCB)" with "RCB", "Generic / Aftermarket" with "AFT"
 */
export const getShortBrand = (rawBrand) => {
  if (!rawBrand || typeof rawBrand !== 'string') return 'AFT';
  const b = rawBrand.trim();
  const lower = b.toLowerCase();
  if (lower.includes('racing boy') || lower.includes('(rcb)') || lower === 'rcb') {
    return 'RCB';
  }
  if (lower.includes('aftermarket') || lower.includes('generic') || lower === 'aft') {
    return 'AFT';
  }
  if (lower.includes('yamaha') || lower.includes('ypn')) return 'YAM';
  if (lower.includes('honda') || lower.includes('hmp')) return 'HON';
  if (lower.includes('suzuki') || lower.includes('smp')) return 'SUZ';
  if (lower.includes('kawasaki')) return 'KAW';
  if (lower.includes('koso')) return 'KOSO';
  if (lower.includes('brembo')) return 'BRM';
  if (lower.includes('michelin')) return 'MCH';
  if (lower.includes('fdr')) return 'FDR';
  if (lower.includes('pirelli')) return 'PIR';
  if (lower.includes('maxxis')) return 'MAX';
  if (lower.includes('motul')) return 'MTL';
  if (lower.includes('castrol')) return 'CAS';
  if (lower.includes('shell')) return 'SHL';
  if (lower.includes('yamalube')) return 'YML';
  if (lower.includes('bando')) return 'BND';
  if (lower.includes('gates')) return 'GAT';
  if (lower.includes('uma')) return 'UMA';
  if (lower.includes('aracer')) return 'ARC';
  if (lower.includes('jvt')) return 'JVT';
  if (lower.includes('mutarru')) return 'MTR';
  if (lower.includes('ttgr')) return 'TTGR';
  if (lower.includes('ncy')) return 'NCY';
  if (b.length > 8) return b.slice(0, 6).toUpperCase();
  return b;
};

/**
 * Format Audit Log & Ledger Reference Codes:
 * Strips verbose internal database prefixes:
 * - "SO-2026-0041" -> "SO-0041"
 * - "PO-2026-0012" -> "PO-0012"
 */
export const formatLedgerReference = (rawRef) => {
  if (!rawRef || typeof rawRef !== 'string') return '—';
  let clean = rawRef.trim();
  clean = clean.replace(/^(SO|PO)-\d{4}-/i, '$1-');
  clean = clean.replace(/^(SO|PO)-/i, '$1-');
  clean = clean.replace(/^RCV-\d{4}-/i, 'RCV-');
  clean = clean.replace(/^ADJ-\d{4}-/i, 'ADJ-');
  clean = clean.replace(/^SWAP-\d{8}-/i, 'SWAP-');
  clean = clean.replace(/^AUDIT-(\d{9,})/i, (_, id) => `AUDIT-${id.slice(-4)}`);
  return clean;
};

/**
 * Clean & Format Item Ledger Remarks:
 * Normalizes order codes and formats audit remarks cleanly without hard truncation.
 */
export const cleanLedgerRemark = (rawRemark, maxLen = 60) => {
  if (!rawRemark || typeof rawRemark !== 'string') return 'System transaction';
  let clean = rawRemark.trim();
  clean = clean.replace(/Purchase Order \d+/i, 'PO Received');
  clean = clean.replace(/Sales Order Checkout \d+/i, 'POS Sale');
  clean = clean.replace(/Physical Count Discrepancy Adjustment/i, 'Audit Adjustment');
  clean = clean.replace(/SO-\d{4}-(\d+)/gi, 'SO-$1');
  if (clean.length > maxLen) {
    return clean.slice(0, maxLen - 3) + '...';
  }
  return clean;
};
