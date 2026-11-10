/**
 * Standard 6-Category Motorparts Taxonomy (Max 6 Characters)
 * 
 * 1. CVT (CVT / Drive / Transmission: V-belts, flyballs, pulley sets, chains, sprockets)
 * 2. Elec (Electronics / Electrical / Ignition: ECUs, CDI units, regulators, spark plugs, wiring)
 * 3. Engine (Engine / Engine Parts / Exhaust / Filters: Blocks, pistons, valves, gaskets, oil filters)
 * 4. Brakes (Brakes: Calipers, brake pads, master cylinders, rotors, levers)
 * 5. Oils (Fluids / Oils / Lubricants: Brake fluid, engine oil, gear oil, fork oil, coolant)
 * 6. Wheels (Tires / Wheels / Suspension: Tires, rims/mags, wheel bearings, shocks, bolts)
 */

export const SHORT_TAXONOMY = {
  Brakes: {
    key: 'Brakes',
    label: 'Brakes',
    skuPrefix: 'BRK',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    dot: '#ef4444',
    scope: 'Calipers, brake pads, master cylinders, rotors, levers',
    aliases: ['brakes', 'brake', 'cables', 'caliper', 'rotors', 'pads', 'lever']
  },
  Elec: {
    key: 'Elec',
    label: 'Elec',
    skuPrefix: 'ELC',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
    dot: '#3b82f6',
    scope: 'ECUs, CDI units, regulators, spark plugs, wiring, horns, lights',
    aliases: ['electronics', 'electrical', 'elec', 'ignition', 'ecu', 'cdi', 'wiring', 'spark plug', 'battery', 'horn', 'light', 'lights']
  },
  Engine: {
    key: 'Engine',
    label: 'Engine',
    skuPrefix: 'ENG',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    dot: '#f59e0b',
    scope: 'Blocks, pistons, valves, gaskets, oil filters, tensioners, radiators',
    aliases: ['engine', 'engine parts', 'exhaust', 'filters', 'filter', 'piston', 'valves', 'cylinder', 'gasket', 'tensioner', 'pipe']
  },
  CVT: {
    key: 'CVT',
    label: 'CVT',
    skuPrefix: 'CVT',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    dot: '#10b981',
    scope: 'V-belts, flyballs, pulley sets, chains, sprockets, clutch springs',
    aliases: ['transmission', 'cvt', 'drive', 'chains & sprockets', 'cvt & pulleys', 'belt', 'pulley', 'flyball', 'clutch', 'chain', 'sprocket']
  },
  Oils: {
    key: 'Oils',
    label: 'Oils',
    skuPrefix: 'OIL',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.35)',
    dot: '#a855f7',
    scope: 'Brake fluid, engine oil, gear oil, fork oil, coolant, grease',
    aliases: ['oils', 'fluids', 'lubricants', 'fluid', 'oil', 'coolant', 'brake fluid', 'gear oil', 'engine oil', 'grease']
  },
  Wheels: {
    key: 'Wheels',
    label: 'Wheels',
    skuPrefix: 'WHL',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.35)',
    dot: '#06b6d4',
    scope: 'Tires, rims/mags, wheel bearings, shocks, bolts, chassis, accessories',
    aliases: ['tires', 'wheels', 'wheels & hubs', 'suspension', 'chassis', 'accessories', 'body & seats', 'parts', 'tire', 'rim', 'mag', 'shock', 'bearing', 'bolt']
  }
};

export const STANDARD_TAXONOMY_KEYS = ['Brakes', 'Elec', 'Engine', 'CVT', 'Oils', 'Wheels'];

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

  // 1. Direct key match
  for (const [key, conf] of Object.entries(SHORT_TAXONOMY)) {
    if (key.toLowerCase() === lower || conf.label.toLowerCase() === lower) {
      return { ...conf };
    }
  }

  // 2. Alias match
  for (const conf of Object.values(SHORT_TAXONOMY)) {
    if (conf.aliases.some(alias => lower.includes(alias))) {
      return { ...conf };
    }
  }

  // 3. Fallback: cap to 6 characters
  const shortLabel = clean.length > 6 ? clean.substring(0, 6) : clean;
  return {
    key: shortLabel,
    label: shortLabel,
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.3)',
    dot: '#94a3b8'
  };
};

export const MOTORCYCLE_CATEGORIES = [
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

export const CANONICAL_CATEGORIES = [
  { code: 'ENG', name: 'Engine', label: 'Engine (ENG)', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)' },
  { code: 'TIRE', name: 'Tires', label: 'Tires (TIRE)', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.35)' },
  { code: 'WHL', name: 'Wheels & Hubs', label: 'Wheels & Hubs (WHL)', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.35)' },
  { code: 'CVT', name: 'CVT & Pulleys', label: 'CVT & Pulleys (CVT)', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)' },
  { code: 'SUSP', name: 'Suspension', label: 'Suspension (SUSP)', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.35)' },
  { code: 'EXH', name: 'Exhaust', label: 'Exhaust (EXH)', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.35)' },
  { code: 'BRK', name: 'Brakes', label: 'Brakes (BRK)', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)' },
  { code: 'CHN', name: 'Chains & Sprockets', label: 'Chains & Sprockets (CHN)', color: '#84cc16', bg: 'rgba(132, 204, 22, 0.12)', border: 'rgba(132, 204, 22, 0.35)' },
  { code: 'HNDL', name: 'Handlebars & Controls', label: 'Handlebars & Controls (HNDL)', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.35)' },
  { code: 'LGHT', name: 'Lights & Mirrors', label: 'Lights & Mirrors (LGHT)', color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.35)' },
  { code: 'ELEC', name: 'Electrical', label: 'Electrical (ELEC)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)' },
  { code: 'OIL', name: 'Oils & Lubricants', label: 'Oils & Lubricants (OIL)', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.35)' },
  { code: 'BLT', name: 'Bolts & Accessories', label: 'Bolts & Accessories (BLT)', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.35)' },
  { code: 'BODY', name: 'Body & Seats', label: 'Body & Seats (BODY)', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.35)' },
  { code: 'GEAR', name: 'Riding Gear & Luggage', label: 'Riding Gear & Luggage (GEAR)', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)', border: 'rgba(100, 116, 139, 0.35)' }
];

export const CANONICAL_6_CATEGORIES = CANONICAL_CATEGORIES;

export const getCategoryBadgeMeta = (catOrCode) => {
  if (!catOrCode) return CANONICAL_CATEGORIES[0];
  const str = String(catOrCode).trim().toLowerCase();
  const direct = CANONICAL_CATEGORIES.find(c => c.name.toLowerCase() === str || c.code.toLowerCase() === str);
  if (direct) return direct;
  const code = getLedgerCategoryCode(catOrCode);
  return CANONICAL_CATEGORIES.find(c => c.code === code) || CANONICAL_CATEGORIES[0];
};

/**
 * 3-4 Letter Standard Stock History Category Codes:
 * - Powertrain: ENG (Engine, Engine Parts, Exhaust, Filters)
 * - Drivetrain: CVT (CVT, Transmission, Drive, Belts, Pulleys)
 * - Braking: BRK (Brakes, Calipers, Pads, Levers, Rotors)
 * - Electrical: ELEC (Electrical, Electronics, Ignition, Lights, Spark)
 * - Chassis & Wheels: CHAS (Chassis, Suspension, Shocks, Wheels, Mags, Tires)
 * - Fluids & Lubes: OIL (Oils, Fluids, Lubricants, Coolant)
 */
export const getLedgerCategoryCode = (rawCategory) => {
  if (!rawCategory || typeof rawCategory !== 'string') return 'ENG';
  const c = rawCategory.trim().toLowerCase();
  if (c === 'brk' || c.includes('brak') || c.includes('caliper') || c.includes('pad') || c.includes('lever') || c.includes('rotor')) return 'BRK';
  if (c === 'elec' || c.includes('elec') || c.includes('ignit') || c.includes('ecu') || c.includes('cdi') || c.includes('light') || c.includes('spark') || c.includes('wire') || c.includes('headlight')) return 'ELEC';
  if (c === 'eng' || c.includes('eng') || c.includes('exhaust') || c.includes('filter') || c.includes('piston') || c.includes('valve') || c.includes('gasket') || c.includes('cylinder') || c.includes('tensioner')) return 'ENG';
  if (c === 'cvt' || c.includes('cvt') || c.includes('trans') || c.includes('drive') || c.includes('belt') || c.includes('pulley') || c.includes('sprocket') || c.includes('chain') || c.includes('flyball')) return 'CVT';
  if (c === 'oil' || c.includes('oil') || c.includes('fluid') || c.includes('lube') || c.includes('coolant') || c.includes('grease')) return 'OIL';
  if (c === 'chas' || c.includes('chas') || c.includes('tire') || c.includes('wheel') || c.includes('rim') || c.includes('mag') || c.includes('shock') || c.includes('suspension') || c.includes('handle') || c.includes('body') || c.includes('seat')) return 'CHAS';
  return 'ENG';
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
  if (lower.includes('speedmate')) {
    return 'Speedmate';
  }
  if (lower.includes('generic') || lower.includes('aftermarket') || lower === 'unknown' || lower === 'n/a' || lower === '-') {
    return 'AFT';
  }
  return b;
};

/**
 * Clean & shorten reference strings for Stock Ledger:
 * - Truncates compound return strings: RET-SO-2026-0094-01-JLR-BP-AEROX -> RET-0094
 * - Formats opening balance: OPENING-20261103 -> OPN-1103
 * - Compacts sales orders: SO-2026-0111 -> SO-0111
 */
export const formatLedgerReference = (rawRef, transactionId) => {
  if (!rawRef) return '—';
  const str = String(rawRef).trim();

  // Compound return with sale number: RET-SO-2026-0094-01-JLR-BP-AEROX
  const returnMatch = str.match(/RET-(?:SO-)?(?:\d{4}-)?0*(\d{1,5})/i);
  if (returnMatch) {
    const num = returnMatch[1].padStart(4, '0');
    return `RET-${num}`;
  }

  // Opening balance with explicit sequence: OPENING-20261103-02 -> OPN-1103-02
  const opnSeqMatch = str.match(/OPENING-(\d{4})(\d{2})(\d{2})-(\d+)/i);
  if (opnSeqMatch) {
    return `OPN-${opnSeqMatch[2]}${opnSeqMatch[3]}-${opnSeqMatch[4].padStart(2, '0')}`;
  }

  // Opening balance: OPENING-20261103 -> OPN-1103 with unique suffix from transactionId
  const opnMatch = str.match(/OPENING-(\d{4})(\d{2})(\d{2})/i);
  if (opnMatch) {
    const seqSuffix = transactionId ? `-${String(transactionId).padStart(2, '0').slice(-2)}` : '';
    return `OPN-${opnMatch[2]}${opnMatch[3]}${seqSuffix}`;
  }
  if (str.startsWith('OPENING-')) {
    const suffix = str.replace('OPENING-', '');
    const seqSuffix = transactionId ? `-${String(transactionId).padStart(2, '0').slice(-2)}` : '';
    return `OPN-${suffix.slice(-4)}${seqSuffix}`;
  }

  // POS Sale: SO-2026-0111 -> SO-0111
  const saleMatch = str.match(/^SO-(?:\d{4}-)?0*(\d{1,5})$/i);
  if (saleMatch) {
    return `SO-${saleMatch[1].padStart(4, '0')}`;
  }

  return str;
};

/**
 * Strips redundant auto-generated text and trailing pipes from Remarks
 */
export const cleanLedgerRemark = (rawRemark) => {
  if (!rawRemark) return '—';
  let text = String(rawRemark).trim();

  // Strip dangling trailing pipes, hyphens, and whitespace
  text = text.replace(/[\s|–-]+$/, '').trim();

  // Direct Restock with courier: "Driver: Direct Restock (Lalamove) | " -> "Lalamove"
  const driverCourierMatch = text.match(/Driver:\s*(?:Direct Restock\s*)?\(([^)]+)\)/i);
  if (driverCourierMatch) {
    const courier = driverCourierMatch[1].trim();
    const parts = text.split('|').map(s => s.trim()).filter(Boolean);
    const extraNotes = parts.slice(1).join(' • ').replace(/[\s|–-]+$/, '').trim();
    if (extraNotes && extraNotes !== courier) return `${courier} • ${extraNotes}`;
    return courier;
  }

  // Redundant POS Sale text: "POS Sale: SO-2026-0110 (4x Aerox Engine Oil Filter Element)"
  if (/^POS Sale:\s*SO-[\d-]+/i.test(text) || text === 'POS Sale') {
    const afterParen = text.replace(/^POS Sale:\s*SO-[\d-]+\s*\([^)]*\)\s*/i, '').replace(/[\s|–-]+$/, '').trim();
    return afterParen || '—';
  }

  // Redundant initial opening text: "Initial opening stock (10 units) for brake"
  if (/^Initial (?:opening|baseline) stock/i.test(text) || text === 'Initial stock') {
    const serialMatch = text.match(/serialized units?:\s*([^)]+)/i);
    if (serialMatch) {
      return `Serials: ${serialMatch[1].trim()}`;
    }
    return '—';
  }

  // Redundant Supplier Delivery text
  if (/^Restocked \d+ units via supplier delivery/i.test(text) || text === 'Supplier Delivery' || text === 'Direct Restock') {
    return '—';
  }

  // Historical Void / Correction text
  if (/^Return\/Refund\s*\([^)]*\)\s*from Order/i.test(text)) {
    return 'Void / Correction';
  }

  // Restocked delivery: "Restocked 20 units via supplier delivery"
  if (/^Restocked \d+ units via supplier delivery/i.test(text)) {
    return 'Supplier Delivery';
  }

  // General clean of double pipes or dangling ends
  text = text.replace(/\|\s*\|/g, '|').replace(/[\s|–-]+$/, '').trim();

  return text || '—';
};

export default {
  SHORT_TAXONOMY,
  STANDARD_TAXONOMY_KEYS,
  getShortCategory,
  getLedgerCategoryCode,
  getShortBrand,
  formatLedgerReference,
  cleanLedgerRemark
};
