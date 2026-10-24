/**
 * scripts/sync_clean_catalog_and_serials.js
 * 
 * Replaces legacy/test part numbers, fixes broken cost prices and selling prices,
 * configures 50 serialized products with 50 matching serial lots, and preserves
 * historical foreign keys and ledger records intact.
 */

const fs = require('fs');
const path = require('path');

// Ensure module resolution for backend dependencies
module.paths.push(path.join(__dirname, '..', 'backend', 'node_modules'));
module.paths.push(path.join(__dirname, 'node_modules'));

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables
const envPaths = [
  path.join(__dirname, '..', 'backend', '.env'),
  path.join(__dirname, '.env'),
  path.join(process.cwd(), 'backend', '.env'),
  path.join(process.cwd(), '.env')
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}

const PART_MAP = {
  1: { part_number: 'YAM-4T-SLV800', name: 'Yamalube 4T Silver 20W-40 800mL', brand: 'Yamalube', category: 'Lubricants', cost: 175.00, price: 240.00, stock: 50, serialized: 0 },
  2: { part_number: 'RCB-HG55-BLK', name: 'RCB Hand Grips HG55', brand: 'RCB', category: 'Accessories', cost: 150.00, price: 250.00, stock: 20, serialized: 0 },
  3: { part_number: 'DOM-GRP-RC', name: 'Domino Racing Grips', brand: 'Domino', category: 'Accessories', cost: 300.00, price: 450.00, stock: 33, serialized: 0 },
  4: { part_number: 'NGK-CR8EIX', name: 'NGK Iridium Spark Plug CR8EIX', brand: 'NGK', category: 'Ignition', cost: 350.00, price: 500.00, stock: 46, serialized: 0 },
  5: { part_number: 'BND-BP-CER', name: 'Bendix Brake Pads Ceramic', brand: 'Bendix', category: 'Brakes', cost: 180.00, price: 300.00, stock: 16, serialized: 0 },
  6: { part_number: 'ELG-BP-SNT', name: 'Elig Brake Pads Sintered', brand: 'Elig', category: 'Brakes', cost: 250.00, price: 400.00, stock: 31, serialized: 0 },
  7: { part_number: 'MTL-300V-10W40', name: 'Motul 300V 10W40 1L', brand: 'Motul', category: 'Lubricants', cost: 800.00, price: 1100.00, stock: 28, serialized: 0 },
  8: { part_number: 'MTL-SCT-10W40', name: 'Motul Scooter Expert LE 10W40', brand: 'Motul', category: 'Lubricants', cost: 280.00, price: 380.00, stock: 40, serialized: 0 },
  9: { part_number: 'YAM-AT-PREM1L', name: 'Yamalube AT Premium 1L', brand: 'Yamalube', category: 'Lubricants', cost: 200.00, price: 300.00, stock: 38, serialized: 0 },
  10: { part_number: 'KIX-4T-SCT10W40', name: 'Kixx Ultra 4T Scooter 10W40', brand: 'Kixx', category: 'Lubricants', cost: 180.00, price: 250.00, stock: 31, serialized: 0 },
  11: { part_number: 'PRL-DRS-9080', name: 'Pirelli Diablo Rosso Sport 90/80-14', brand: 'Pirelli', category: 'Tires', cost: 1800.00, price: 2300.00, stock: 18, serialized: 0 },
  12: { part_number: 'MAX-VIC-10080', name: 'Maxxis Victra S98 100/80-14', brand: 'Maxxis', category: 'Tires', cost: 1500.00, price: 1950.00, stock: 56, serialized: 0 },
  13: { part_number: 'FDR-ZEV-9080', name: 'FDR Sport Zevo 90/80-14', brand: 'FDR', category: 'Tires', cost: 1200.00, price: 1600.00, stock: 54, serialized: 0 },
  14: { part_number: 'COR-R26-9080', name: 'Corsa Platinum R26 90/80-14', brand: 'Corsa', category: 'Tires', cost: 1300.00, price: 1750.00, stock: 32, serialized: 0 },
  15: { part_number: 'GAT-PWR-VBELT', name: 'Gates Powerlink V-Belt', brand: 'Gates', category: 'Transmission', cost: 450.00, price: 650.00, stock: 10, serialized: 0 },
  16: { part_number: 'BAN-VBT-ARX', name: 'Bando V-Belt (Aerox/Nmax)', brand: 'Bando', category: 'Transmission', cost: 400.00, price: 600.00, stock: 16, serialized: 0 },
  17: { part_number: 'MTR-ROL-10G', name: 'MTRT Roller Weights 10g', brand: 'MTRT', category: 'Transmission', cost: 250.00, price: 350.00, stock: 52, serialized: 0 },
  18: { part_number: 'RS8-FLY-12G', name: 'RS8 Flyballs 12g Set', brand: 'RS8', category: 'Transmission', cost: 200.00, price: 300.00, stock: 45, serialized: 0 },
  19: { part_number: 'JVT-CSP-1000', name: 'JVT Center Spring 1000 RPM', brand: 'JVT', category: 'Transmission', cost: 300.00, price: 450.00, stock: 55, serialized: 0 },
  20: { part_number: 'JVT-CLP-1500', name: 'JVT Clutch Spring 1500 RPM', brand: 'JVT', category: 'Transmission', cost: 150.00, price: 250.00, stock: 17, serialized: 0 },
  21: { part_number: 'UMA-CLN-SET', name: 'Uma Racing Clutch Lining Set', brand: 'Uma Racing', category: 'Transmission', cost: 600.00, price: 850.00, stock: 43, serialized: 0 },
  22: { part_number: 'TDD-LED-M01B', name: 'TDD LED Headlight Bulb M01B', brand: 'TDD', category: 'Electrical', cost: 250.00, price: 400.00, stock: 11, serialized: 0 },
  23: { part_number: 'OSR-HS1-ALS', name: 'Osram All Season Bulb HS1', brand: 'Osram', category: 'Electrical', cost: 200.00, price: 350.00, stock: 22, serialized: 0 },
  24: { part_number: 'KNN-AF-ARX', name: 'K&N Washable Air Filter (Aerox)', brand: 'K&N', category: 'Filters', cost: 2000.00, price: 2800.00, stock: 42, serialized: 0 },
  25: { part_number: 'MTR-HFA-FLT', name: 'MTRT High Flow Air Filter', brand: 'MTRT', category: 'Filters', cost: 800.00, price: 1200.00, stock: 39, serialized: 0 },
  26: { part_number: 'KOS-HUR-FLT', name: 'Koso Hurricane Air Filter', brand: 'Koso', category: 'Filters', cost: 900.00, price: 1350.00, stock: 31, serialized: 0 },
  27: { part_number: 'SSS-SPK-1438', name: 'SSS Sprocket Set 14T-38T', brand: 'SSS', category: 'Transmission', cost: 500.00, price: 750.00, stock: 14, serialized: 0 },
  28: { part_number: 'OSK-SPK-CLR', name: 'Osaki Colored Sprocket Set', brand: 'Osaki', category: 'Transmission', cost: 450.00, price: 650.00, stock: 23, serialized: 0 },
  29: { part_number: 'DID-CHN-428H', name: 'DID Heavy Duty Chain 428H', brand: 'DID', category: 'Transmission', cost: 600.00, price: 900.00, stock: 43, serialized: 0 },
  30: { part_number: 'YBN-GLD-428', name: 'YBN Gold Chain 428', brand: 'YBN', category: 'Transmission', cost: 400.00, price: 650.00, stock: 54, serialized: 0 },
  31: { part_number: 'SKF-BRG-6201', name: 'SKF High Speed Bearing 6201', brand: 'SKF', category: 'Engine Parts', cost: 150.00, price: 250.00, stock: 32, serialized: 0 },
  32: { part_number: 'FAG-BRG-SET', name: 'FAG Engine Bearing Set', brand: 'FAG', category: 'Engine Parts', cost: 600.00, price: 950.00, stock: 11, serialized: 0 },
  33: { part_number: 'HNG-BLT-CRK', name: 'Heng Gold Bolts (Crankcase Set)', brand: 'Heng', category: 'Accessories', cost: 800.00, price: 1200.00, stock: 51, serialized: 0 },
  34: { part_number: 'HNG-BLT-DSC', name: 'Heng Titanium Disc Bolts', brand: 'Heng', category: 'Accessories', cost: 250.00, price: 400.00, stock: 16, serialized: 0 },
  35: { part_number: 'MRN-BRK-36IN', name: 'Morin Braided Brake Hose 36"', brand: 'Morin', category: 'Brakes', cost: 450.00, price: 700.00, stock: 9, serialized: 0 },
  36: { part_number: 'ERL-FTG-SET', name: 'Earls Brake Line Fittings', brand: 'Earls', category: 'Brakes', cost: 150.00, price: 250.00, stock: 19, serialized: 0 },
  37: { part_number: 'MTL-COL-1L', name: 'Motul Factory Line Coolant 1L', brand: 'Motul', category: 'Fluids', cost: 450.00, price: 650.00, stock: 23, serialized: 0 },
  38: { part_number: 'ICE-COL-189L', name: 'Engine Ice Coolant 1.89L', brand: 'Engine Ice', category: 'Fluids', cost: 1200.00, price: 1600.00, stock: 19, serialized: 0 },
  39: { part_number: 'BRM-BF-DOT4', name: 'Brembo Dot 4 Brake Fluid', brand: 'Brembo', category: 'Fluids', cost: 350.00, price: 550.00, stock: 30, serialized: 0 },
  40: { part_number: 'YAM-GO-100ML', name: 'Yamaha Genuine Gear Oil 100ml', brand: 'Yamaha', category: 'Lubricants', cost: 80.00, price: 120.00, stock: 31, serialized: 0 },
  41: { part_number: 'RS8-GO-120ML', name: 'RS8 Scooter Gear Oil 120ml', brand: 'RS8', category: 'Lubricants', cost: 100.00, price: 150.00, stock: 51, serialized: 0 },
  42: { part_number: 'OPT1-THR-CBL', name: 'Option 1 Throttle Cable', brand: 'Option 1', category: 'Cables', cost: 150.00, price: 250.00, stock: 21, serialized: 0 },
  43: { part_number: 'UMA-QTC-CBL', name: 'Uma Racing Quick Throttle Cable', brand: 'Uma Racing', category: 'Cables', cost: 300.00, price: 500.00, stock: 27, serialized: 0 },
  44: { part_number: 'JVT-BKC-RR', name: 'JVT Brake Cable Rear', brand: 'JVT', category: 'Cables', cost: 180.00, price: 300.00, stock: 27, serialized: 0 },
  45: { part_number: 'YAM-OF-GEN', name: 'Yamaha Genuine Oil Filter', brand: 'Yamaha', category: 'Filters', cost: 120.00, price: 200.00, stock: 47, serialized: 0 },
  46: { part_number: 'KNN-OF-KN141', name: 'KN Oil Filter KN-141', brand: 'K&N', category: 'Filters', cost: 450.00, price: 650.00, stock: 37, serialized: 0 },
  47: { part_number: 'PRL-VLV-CNC', name: 'Pirelli Tubeless Valve CNC', brand: 'Pirelli', category: 'Tires', cost: 150.00, price: 250.00, stock: 49, serialized: 0 },
  48: { part_number: 'RCB-BRE-ALY', name: 'RCB Bar Ends Alloy', brand: 'RCB', category: 'Accessories', cost: 350.00, price: 550.00, stock: 23, serialized: 0 },
  49: { part_number: 'NUI-BLS-ALY', name: 'Nui Racing Brake Lever Spacer', brand: 'Nui Racing', category: 'Accessories', cost: 120.00, price: 200.00, stock: 21, serialized: 0 },
  50: { part_number: 'KOS-VMT-SLM', name: 'Koso Volt Meter Slim', brand: 'Koso', category: 'Electrical', cost: 450.00, price: 700.00, stock: 33, serialized: 0 },
  51: { part_number: 'OPT1-HRN-12V', name: 'Option 1 Horn 12V', brand: 'Option 1', category: 'Electrical', cost: 250.00, price: 400.00, stock: 26, serialized: 0 },

  // ==========================================
  // 50 SERIALIZED PRODUCTS (IDs 52 to 101)
  // Each product gets stock = 3 and 1 matching serial lot (quantity = 3)
  // ==========================================
  52: { part_number: 'ARA-RC-SPX', name: 'aRacer RC Super X ECU', brand: 'aRacer', category: 'Electronics', cost: 15000.00, price: 18500.00, stock: 3, serialized: 1, serial: 'ARA-SPX-8801' },
  53: { part_number: 'ARA-RC-MN5', name: 'aRacer RC Mini 5 ECU', brand: 'aRacer', category: 'Electronics', cost: 8500.00, price: 10500.00, stock: 3, serialized: 1, serial: 'ARA-MN5-4420' },
  54: { part_number: 'UMA-M5-ECU', name: 'Uma Racing M5 ECU', brand: 'Uma Racing', category: 'Electronics', cost: 9000.00, price: 11000.00, stock: 3, serialized: 1, serial: 'UMA-M5-2190' },
  55: { part_number: 'JVT-BLK-63MM', name: 'JVT Racing Cylinder Block 63mm', brand: 'JVT', category: 'Engine Parts', cost: 3500.00, price: 4800.00, stock: 3, serialized: 1, serial: 'JVT-BLK-6311' },
  56: { part_number: 'MTR-BLK-59MM', name: 'MTRT Ceramic Block 59mm', brand: 'MTRT', category: 'Engine Parts', cost: 3200.00, price: 4500.00, stock: 3, serialized: 1, serial: 'MTR-BLK-5904' },
  57: { part_number: 'UMA-SH-PRO23', name: 'Uma Racing Superhead Pro 20/23', brand: 'Uma Racing', category: 'Engine Parts', cost: 12000.00, price: 15000.00, stock: 3, serialized: 1, serial: 'UMA-SHP-2023' },
  58: { part_number: 'JVT-BVH-2428', name: 'JVT Big Valve Head 24/28', brand: 'JVT', category: 'Engine Parts', cost: 8000.00, price: 10500.00, stock: 3, serialized: 1, serial: 'JVT-BVH-2428' },
  59: { part_number: 'MTR-CRK-3MM', name: 'MTRT Racing Crankshaft +3mm', brand: 'MTRT', category: 'Engine Parts', cost: 6500.00, price: 8500.00, stock: 3, serialized: 1, serial: 'MTR-CRK-3001' },
  60: { part_number: 'JVT-CRK-ASY', name: 'JVT Crankshaft Assembly', brand: 'JVT', category: 'Engine Parts', cost: 6000.00, price: 8000.00, stock: 3, serialized: 1, serial: 'JVT-CRK-9912' },
  61: { part_number: 'YSS-GSP-RR', name: 'YSS G-Sport Rear Shock', brand: 'YSS', category: 'Suspension', cost: 7500.00, price: 9500.00, stock: 3, serialized: 1, serial: 'YSS-GSP-7712' },
  62: { part_number: 'YSS-GRC-RR', name: 'YSS G-Racing Rear Shock', brand: 'YSS', category: 'Suspension', cost: 15000.00, price: 18500.00, stock: 3, serialized: 1, serial: 'YSS-GRC-1109' },
  63: { part_number: 'OHL-YA740', name: 'Ohlins YA740 Rear Shock', brand: 'Ohlins', category: 'Suspension', cost: 35000.00, price: 42000.00, stock: 2, serialized: 1, serial: 'OHL-YA7-4001' },
  64: { part_number: 'RCB-VDS-RR', name: 'RCB VD Series Rear Shock', brand: 'RCB', category: 'Suspension', cost: 8500.00, price: 11000.00, stock: 3, serialized: 1, serial: 'RCB-VDS-6621' },
  65: { part_number: 'RCB-VSS-RR', name: 'RCB VS Series Rear Shock', brand: 'RCB', category: 'Suspension', cost: 6500.00, price: 8500.00, stock: 3, serialized: 1, serial: 'RCB-VSS-3381' },
  66: { part_number: 'OHL-FSK-KIT', name: 'Ohlins FSK Front Fork Spring Kit', brand: 'Ohlins', category: 'Suspension', cost: 12000.00, price: 15000.00, stock: 3, serialized: 1, serial: 'OHL-FSK-5510' },
  67: { part_number: 'YYP-RC-V3', name: 'Yy Pang Racing Pipe V3', brand: 'Yy Pang', category: 'Exhaust', cost: 4500.00, price: 6000.00, stock: 3, serialized: 1, serial: 'YYP-RC3-9012' },
  68: { part_number: 'JVT-PWR-V2', name: 'JVT Power Pipe V2', brand: 'JVT', category: 'Exhaust', cost: 3800.00, price: 5000.00, stock: 3, serialized: 1, serial: 'JVT-PWR-8821' },
  69: { part_number: 'RS8-OPN-EVO', name: 'RS8 Open Pipe EVO', brand: 'RS8', category: 'Exhaust', cost: 3500.00, price: 4800.00, stock: 3, serialized: 1, serial: 'RS8-OPN-4410' },
  70: { part_number: 'DNG-SAI4-RC', name: 'Daeng Sai 4 Racing Pipe', brand: 'Daeng', category: 'Exhaust', cost: 5500.00, price: 7500.00, stock: 3, serialized: 1, serial: 'DNG-SAI-7718' },
  71: { part_number: 'NMB-RC-EXH', name: 'Namban Racing Exhaust', brand: 'Namban', category: 'Exhaust', cost: 4800.00, price: 6500.00, stock: 3, serialized: 1, serial: 'NMB-RC-3319' },
  72: { part_number: 'KOS-TB-32MM', name: 'Koso Throttle Body 32mm', brand: 'Koso', category: 'Engine Parts', cost: 3000.00, price: 4200.00, stock: 3, serialized: 1, serial: 'KOS-TB3-2201' },
  73: { part_number: 'UMA-TB-34MM', name: 'Uma Racing Throttle Body 34mm', brand: 'Uma Racing', category: 'Engine Parts', cost: 3500.00, price: 4800.00, stock: 3, serialized: 1, serial: 'UMA-TB3-4412' },
  74: { part_number: 'KOS-INJ-160', name: 'Koso High Flow Fuel Injector 160cc', brand: 'Koso', category: 'Engine Parts', cost: 1800.00, price: 2500.00, stock: 3, serialized: 1, serial: 'KOS-INJ-1601' },
  75: { part_number: 'UMA-INJ-200', name: 'Uma Racing Fuel Injector 200cc', brand: 'Uma Racing', category: 'Engine Parts', cost: 2200.00, price: 3000.00, stock: 3, serialized: 1, serial: 'UMA-INJ-2001' },
  76: { part_number: 'FAI-PST-62MM', name: 'Faito Forged Piston Kit 62mm', brand: 'Faito', category: 'Engine Parts', cost: 2800.00, price: 3800.00, stock: 3, serialized: 1, serial: 'FAI-PST-6201' },
  77: { part_number: 'UMA-PST-65MM', name: 'Uma Racing Forged Piston 65mm', brand: 'Uma Racing', category: 'Engine Parts', cost: 3200.00, price: 4500.00, stock: 3, serialized: 1, serial: 'UMA-PST-6501' },
  78: { part_number: 'MTR-CAM-ST2', name: 'MTRT Racing Camshaft Stage 2', brand: 'MTRT', category: 'Engine Parts', cost: 1500.00, price: 2200.00, stock: 3, serialized: 1, serial: 'MTR-CAM-ST21' },
  79: { part_number: 'JVT-CAM-V3', name: 'JVT Racing Camshaft V3', brand: 'JVT', category: 'Engine Parts', cost: 1800.00, price: 2500.00, stock: 3, serialized: 1, serial: 'JVT-CAM-V301' },
  80: { part_number: 'SWR-CAM-PF3', name: 'SWR Racing Cam Profile 3', brand: 'SWR', category: 'Engine Parts', cost: 2000.00, price: 2800.00, stock: 3, serialized: 1, serial: 'SWR-CAM-PF31' },
  81: { part_number: 'RCB-SP522-14', name: 'RCB SP522 Forged Mags 14"', brand: 'RCB', category: 'Wheels', cost: 5500.00, price: 7500.00, stock: 3, serialized: 1, serial: 'RCB-SP5-2214' },
  82: { part_number: 'RCB-SP811-17', name: 'RCB SP811 Mags 17"', brand: 'RCB', category: 'Wheels', cost: 4800.00, price: 6500.00, stock: 3, serialized: 1, serial: 'RCB-SP8-1117' },
  83: { part_number: 'BRM-P4-CAL', name: 'Brembo 4-Piston Caliper (P4)', brand: 'Brembo', category: 'Brakes', cost: 12000.00, price: 15000.00, stock: 3, serialized: 1, serial: 'BRM-P4-1192' },
  84: { part_number: 'BRM-CRB-CAL', name: 'Brembo 2-Piston Crab Caliper', brand: 'Brembo', category: 'Brakes', cost: 8000.00, price: 10500.00, stock: 3, serialized: 1, serial: 'BRM-CRB-8831' },
  85: { part_number: 'RCB-S1-RMC', name: 'RCB S1 Radial Master Cylinder', brand: 'RCB', category: 'Brakes', cost: 4500.00, price: 6000.00, stock: 3, serialized: 1, serial: 'RCB-S1-5519' },
  86: { part_number: 'BRM-RCS15-CC', name: 'Brembo RCS 15 Corsa Corta', brand: 'Brembo', category: 'Brakes', cost: 18000.00, price: 22000.00, stock: 2, serialized: 1, serial: 'BRM-RCS-1501' },
  87: { part_number: 'NIS-SAM-CAL', name: 'Nissin Samurai Brake Caliper', brand: 'Nissin', category: 'Brakes', cost: 4000.00, price: 5500.00, stock: 3, serialized: 1, serial: 'NIS-SAM-4402' },
  88: { part_number: 'NUI-SWA-ALY', name: 'Nui Racing Alloy Swing Arm', brand: 'Nui Racing', category: 'Chassis', cost: 3500.00, price: 4800.00, stock: 3, serialized: 1, serial: 'NUI-SWA-3312' },
  89: { part_number: 'QTT-SWA-RC', name: 'QTT Racing Swing Arm', brand: 'QTT', category: 'Chassis', cost: 4200.00, price: 5800.00, stock: 3, serialized: 1, serial: 'QTT-SWA-8819' },
  90: { part_number: 'KOS-DOHC-KIT', name: 'Koso DOHC Cylinder Head Kit', brand: 'Koso', category: 'Engine Parts', cost: 25000.00, price: 32000.00, stock: 2, serialized: 1, serial: 'KOS-DOH-9901' },
  91: { part_number: 'UMA-CVT-SET', name: 'Uma Racing CVT Pulley Set', brand: 'Uma Racing', category: 'Transmission', cost: 3000.00, price: 4200.00, stock: 3, serialized: 1, serial: 'UMA-CVT-3310' },
  92: { part_number: 'JVT-CVT-V2', name: 'JVT CVT Pulley Kit v2', brand: 'JVT', category: 'Transmission', cost: 2500.00, price: 3500.00, stock: 3, serialized: 1, serial: 'JVT-CVT-2209' },
  93: { part_number: 'MTR-BLC-ASY', name: 'MTRT Bell and Clutch Assembly', brand: 'MTRT', category: 'Transmission', cost: 3800.00, price: 5000.00, stock: 3, serialized: 1, serial: 'MTR-BLC-7712' },
  94: { part_number: 'KTC-RZR-RR', name: 'KTech Razor R Rear Shock', brand: 'KTech', category: 'Suspension', cost: 22000.00, price: 28000.00, stock: 2, serialized: 1, serial: 'KTC-RZR-6610' },
  95: { part_number: 'OPT1-RST-ALY', name: 'Option 1 Rear Set Alloy', brand: 'Option 1', category: 'Chassis', cost: 2800.00, price: 3800.00, stock: 3, serialized: 1, serial: 'OPT-RST-5512' },
  96: { part_number: 'TTG-QSF-KIT', name: 'TTGR Quick Shifter Kit', brand: 'TTGR', category: 'Electronics', cost: 6500.00, price: 8500.00, stock: 3, serialized: 1, serial: 'TTG-QSF-4401' },
  97: { part_number: 'KIT-CDI-RC', name: 'Kitti Racing CDI Unit', brand: 'Kitti', category: 'Electronics', cost: 2500.00, price: 3500.00, stock: 3, serialized: 1, serial: 'KIT-CDI-2210' },
  98: { part_number: 'UMA-OILP-HV', name: 'Uma Racing Oil Pump High Volume', brand: 'Uma Racing', category: 'Engine Parts', cost: 1200.00, price: 1800.00, stock: 3, serialized: 1, serial: 'UMA-OIL-1102' },
  99: { part_number: 'KOS-SPD-LCD', name: 'Koso Digital Speedometer LCD', brand: 'Koso', category: 'Electronics', cost: 5500.00, price: 7500.00, stock: 3, serialized: 1, serial: 'KOS-SPD-8812' },
  100: { part_number: 'JVT-TNS-MAN', name: 'JVT Tensioner Manual Alloy', brand: 'JVT', category: 'Engine Parts', cost: 800.00, price: 1200.00, stock: 3, serialized: 1, serial: 'JVT-TNS-2649' },
  101: { part_number: 'RS8-TRQ-ASY', name: 'RS8 Torque Drive Assembly', brand: 'RS8', category: 'Transmission', cost: 2200.00, price: 3000.00, stock: 3, serialized: 1, serial: 'RS8-TRQ-6683' },

  // Cleaned test items
  102: { part_number: 'BRT-CDI-DB', name: 'BRT Dual Band Digital CDI Unit', brand: 'BRT', category: 'Electronics', cost: 2200.00, price: 3100.00, stock: 4, serialized: 0 },
  104: { part_number: 'OSR-T19-AS', name: 'Osram All Season T19 Headlight Bulb', brand: 'Osram', category: 'Electrical', cost: 65.00, price: 100.00, stock: 30, serialized: 0 },
  105: { part_number: 'NGK-CPR9EA9', name: 'NGK Standard Spark Plug CPR9EA-9', brand: 'NGK', category: 'Ignition', cost: 95.00, price: 150.00, stock: 15, serialized: 0 },
  106: { part_number: 'RCB-LV-ALY', name: 'RCB Alloy Lever Set', brand: 'RCB', category: 'Accessories', cost: 650.00, price: 950.00, stock: 8, serialized: 0 },
  107: { part_number: 'REP-SNT-10W40', name: 'Repsol Moto Sintetico 4T 10W-40 1L', brand: 'Repsol', category: 'Lubricants', cost: 260.00, price: 380.00, stock: 10, serialized: 0 },
  108: { part_number: 'FDR-XR-9080', name: 'FDR Sport XR Evo 90/80-14', brand: 'FDR', category: 'Tires', cost: 1150.00, price: 1650.00, stock: 5, serialized: 0 },
  109: { part_number: 'MCH-CTY-11080', name: 'Michelin City Grip 2 110/80-14', brand: 'Michelin', category: 'Tires', cost: 2100.00, price: 2900.00, stock: 7, serialized: 0 }
};

async function syncTarget(config, targetName) {
  console.log(`\n========================================`);
  console.log(`Connecting to ${targetName}...`);
  console.log(`========================================`);
  
  const conn = await mysql.createConnection(config);
  try {
    await conn.beginTransaction();

    console.log(`[${targetName}] Starting atomic catalog & serial migration...`);

    // 1. Update products
    for (const [idStr, info] of Object.entries(PART_MAP)) {
      const id = Number(idStr);
      const markup = Math.round(((info.price - info.cost) / info.cost) * 100 * 100) / 100;

      await conn.query(`
        UPDATE products
        SET 
          part_number = ?,
          sku = ?,
          name = ?,
          brand = ?,
          category = ?,
          cost_price = ?,
          markup_percentage = ?,
          selling_price = ?,
          retail_price = ?,
          stock = ?,
          current_stock = ?,
          is_serialized = ?,
          is_active = 1
        WHERE id = ?
      `, [
        info.part_number,
        info.part_number,
        info.name,
        info.brand,
        info.category,
        info.cost,
        markup,
        info.price,
        info.price,
        info.stock,
        info.stock,
        info.serialized,
        id
      ]);
    }
    console.log(`[${targetName}] Updated ${Object.keys(PART_MAP).length} products with clean codes and fixed prices.`);

    // 2. Fetch existing serials referenced by sale_item_serials
    const [referencedSerials] = await conn.query('SELECT DISTINCT serial_id FROM sale_item_serials');
    const refSet = new Set(referencedSerials.map(r => r.serial_id));

    // 3. For each of the 50 serialized products (52 to 101), ensure exactly ONE active serial with quantity = stock
    let activeSerialCount = 0;
    for (let pId = 52; pId <= 101; pId++) {
      const info = PART_MAP[pId];
      if (!info) continue;

      // Find serials for this product
      const [existingSerials] = await conn.query('SELECT id, serial_number, status, quantity FROM product_serials WHERE product_id = ? ORDER BY id ASC', [pId]);

      // Pick an existing serial that is not referenced by sale_item_serials, or use the first one
      let targetSerial = existingSerials.find(s => !refSet.has(s.id));

      if (targetSerial) {
        // Update it to be available with matching stock
        await conn.query(`
          UPDATE product_serials
          SET serial_number = ?, quantity = ?, status = 'available'
          WHERE id = ?
        `, [info.serial, info.stock, targetSerial.id]);
        activeSerialCount++;

        // Any other serials for this product: if NOT referenced in sale_item_serials, remove them
        for (const s of existingSerials) {
          if (s.id !== targetSerial.id) {
            if (refSet.has(s.id)) {
              // Keep referenced historical sold serial with 0 qty
              await conn.query("UPDATE product_serials SET status = 'sold', quantity = 0 WHERE id = ?", [s.id]);
            } else {
              // Delete unused surplus serial
              await conn.query("DELETE FROM product_serials WHERE id = ?", [s.id]);
            }
          }
        }
      } else {
        // Insert new available serial
        await conn.query(`
          INSERT INTO product_serials (product_id, serial_number, quantity, status)
          VALUES (?, ?, ?, 'available')
        `, [pId, info.serial, info.stock]);
        activeSerialCount++;
      }
    }
    console.log(`[${targetName}] Configured ${activeSerialCount} active serial lots for 50 serialized products.`);

    // 4. Invariant Verification
    const [serializedCheck] = await conn.query(`
      SELECT p.id, p.part_number, p.name, p.stock,
             COALESCE(SUM(CASE WHEN s.status = 'available' OR s.status IS NULL THEN s.quantity ELSE 0 END), 0) AS total_serial_qty
      FROM products p
      LEFT JOIN product_serials s ON p.id = s.product_id
      WHERE p.is_serialized = 1 AND p.is_active = 1
      GROUP BY p.id
    `);

    let mismatches = 0;
    for (const row of serializedCheck) {
      if (Number(row.stock) !== Number(row.total_serial_qty)) {
        console.error(`[MISMATCH] Product ${row.id} (${row.part_number}): stock=${row.stock}, serial_qty=${row.total_serial_qty}`);
        mismatches++;
      }
    }

    if (mismatches > 0) {
      throw new Error(`[${targetName}] Invariant check failed with ${mismatches} mismatches! Rolling back.`);
    }

    // 5. Price verification
    const [brokenCheck] = await conn.query(`
      SELECT id, part_number, name, cost_price, selling_price
      FROM products
      WHERE is_active = 1 AND (cost_price <= 0 OR selling_price <= 0 OR cost_price >= selling_price)
    `);

    if (brokenCheck.length > 0) {
      throw new Error(`[${targetName}] Price check failed: found ${brokenCheck.length} broken products! Rolling back.`);
    }

    await conn.commit();
    console.log(`✅ [${targetName}] SUCCESS! Invariant: 100% MATCH across all ${serializedCheck.length} serialized products.`);
    console.log(`✅ [${targetName}] Zero broken prices. Catalog clean and verified.`);

  } catch (err) {
    await conn.rollback();
    console.error(`❌ [${targetName}] FAILED:`, err);
    throw err;
  } finally {
    await conn.end();
  }
}

async function run() {
  const aivenConfig = {
    host: process.env.AIVEN_HOST || process.env.DB_HOST || 'mysql-4b0b661-icovincent-7faa.a.aivencloud.com',
    port: Number(process.env.AIVEN_PORT || process.env.DB_PORT || 27827),
    user: process.env.AIVEN_USER || process.env.DB_USER || 'avnadmin',
    password: process.env.AIVEN_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.AIVEN_NAME || process.env.DB_NAME || 'defaultdb',
    ssl: { rejectUnauthorized: false }
  };

  const localConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'jlin_inventory_db'
  };

  // Run on Aiven Cloud Database
  await syncTarget(aivenConfig, 'AIVEN CLOUD DB');

  // Run on Local MySQL Database
  // Wait, check if local has products 1 to 109 first
  const localConn = await mysql.createConnection(localConfig);
  const [localRows] = await localConn.query('SELECT COUNT(*) as c FROM products');
  await localConn.end();

  if (localRows[0].c < 100) {
    console.log(`\nLocal DB has only ${localRows[0].c} products. Inserting missing products from clean catalog...`);
    // Insert products into local DB
    const lConn = await mysql.createConnection(localConfig);
    for (const [idStr, info] of Object.entries(PART_MAP)) {
      const id = Number(idStr);
      const markup = Math.round(((info.price - info.cost) / info.cost) * 100 * 100) / 100;
      await lConn.query(`
        INSERT INTO products (id, part_number, sku, name, brand, category, size, cost_price, markup_percentage, selling_price, retail_price, stock, current_stock, reorder_level, is_serialized, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 'Standard', ?, ?, ?, ?, ?, ?, 2, ?, 1)
        ON DUPLICATE KEY UPDATE
          part_number = VALUES(part_number),
          sku = VALUES(sku),
          name = VALUES(name),
          brand = VALUES(brand),
          category = VALUES(category),
          cost_price = VALUES(cost_price),
          markup_percentage = VALUES(markup_percentage),
          selling_price = VALUES(selling_price),
          retail_price = VALUES(retail_price),
          stock = VALUES(stock),
          current_stock = VALUES(current_stock),
          is_serialized = VALUES(is_serialized),
          is_active = 1
      `, [id, info.part_number, info.part_number, info.name, info.brand, info.category, info.cost, markup, info.price, info.price, info.stock, info.stock, info.serialized]);
    }
    await lConn.end();
  }

  await syncTarget(localConfig, 'LOCAL MYSQL DB');

  console.log('\n========================================');
  console.log('ALL DATABASES SYNCHRONIZED AND VERIFIED!');
  console.log('========================================');
}

run().catch((e) => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
