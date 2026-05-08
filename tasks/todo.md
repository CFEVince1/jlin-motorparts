# Motorcycle-Specific Inventory Refactor Plan

## Status

- [x] Capture workflow lesson after user correction
- [x] Explore current backend schema, routes, controllers, and migration risks
- [x] Explore current frontend product, POS, reports, inventory, and transactions surfaces
- [x] User reviews and approves this implementation plan
- [x] Implement Phase 1 database/API foundation
  - [x] Products table identity/spec/index slice updated and verified
  - [x] Motorcycle units table slice updated and verified
  - [x] Product compatibility table slice updated and verified
  - [x] Product controller GET/POST validation/response slice updated and verified
  - [x] Product serials table/endpoint verification
  - [x] Seed data slice
  - [x] Motorcycle units endpoint slice
  - [x] Inventory controller response slice
  - [x] Required SQL verification slice
  - [x] Inventory/sales/report API follow-up slices
- [x] Implement Phase 2 Add Product form
- [x] Implement Phase 3 POS search and serialized checkout
- [x] Implement Phase 4 reports
- [x] Implement Phase 5 filtering everywhere
- [x] Implement Phase 6 sample data and verification
- [x] Add Phase 7 defense notes
- [x] Add final review/results notes
- [x] Plan Phase 8 compatibility groups/platform enhancement
- [ ] Implement Phase 8 compatibility groups/platform enhancement

## Summary

Refactor the inventory system around motorcycle-specific parts. The backend must first store real part numbers, product dimensions/specs, motorcycle units, part compatibility, and serials. `part_number` is the main product identity across POS, filters, reports, receipts, and tests; `product_name` is descriptive. Once that schema and API are stable, update Products, POS, Reports, Transactions, and Inventory pages to use those fields instead of generated SKUs or generic product search.

Implementation should be staged. Phase 1 must be fully verified before moving to frontend work because later phases depend on the new product API shape.

## Current Repo Facts

- Backend is Express + MySQL in `backend/server.js`, using `mysql2` pool from `backend/config/db.js`.
- Full destructive schema lives in `backend/db/database.sql`; `backend/setupDb.js` currently only creates a minimal users table and is not aligned with the full schema.
- Current product API returns `{ id, product_name, category, brand, price, stock, reorder_level, is_serialized }`.
- Current frontend product create payload sends `{ name, brand, category, cost_price, selling_price, reorder_level, is_serialized, stock, serial_numbers }`.
- Current POS checkout posts `{ items: [{ variant_id, quantity }], payment_method, tendered_amount }`; `variant_id` currently means `products.id`.
- Serialized sales currently auto-pick available serials. New POS behavior must let the cashier choose exact serials before checkout.
- `part_number` must become the primary user-facing identifier. Keep `product_name` and `price` aliases only for backward compatibility while pages migrate.
- There are many existing uncommitted changes in this worktree. Do not revert unrelated changes.

## Implementation Strategy

- Work one task/prompt at a time. Do not refactor the whole backend or frontend in one sweep.
- Keep each phase minimal and independently verifiable.
- Prefer the elegant path: one rich backend product response shape consumed consistently by Products, POS, Reports, Inventory, and Transactions.
- Execute Phase 1 as small verified slices: create/update table definitions, verify; add controller validation, verify; add API response shape, verify.

## Phase 1 - Database and Backend Product Foundation

- [x] Update `backend/db/database.sql` products schema:
  - Keep: `name`, `category`, `stock`, `cost_price`, `selling_price`, `reorder_level`, `is_active`, timestamps.
  - Add: `part_number VARCHAR(100) NOT NULL`, `size VARCHAR(50) NOT NULL`, `measurement VARCHAR(100)`, `thread_type VARCHAR(50)`.
  - Keep or add: `brand VARCHAR(100) NOT NULL`, `is_serialized BOOLEAN NOT NULL DEFAULT FALSE`.
  - Add unique constraint `UNIQUE (part_number, brand)`.
  - Add indexes: `idx_part_number (part_number)`, `idx_brand (brand)`, `idx_name (name)`, `idx_size (size)`.
- [x] Add `motorcycle_units` table:
  - `id INT AUTO_INCREMENT PRIMARY KEY`
  - `brand VARCHAR(100) NOT NULL`
  - `model VARCHAR(100) NOT NULL`
  - `year_model VARCHAR(20)`
  - recommended unique constraint `UNIQUE (brand, model, year_model)`.
  - add index `idx_model (model)` for POS and report model filtering.
  - keep `year_model` optional; if it is `NULL`, compatibility is valid at model level.
- [x] Add `product_compatibility` table:
  - `id INT AUTO_INCREMENT PRIMARY KEY`
  - `product_id INT NOT NULL`
  - `motorcycle_unit_id INT NOT NULL`
  - foreign keys to `products` and `motorcycle_units`
  - unique constraint `UNIQUE (product_id, motorcycle_unit_id)`.
  - add composite index `idx_product_motorcycle (product_id, motorcycle_unit_id)` for compatibility filtering.
  - add individual indexes `idx_product_id (product_id)` and `idx_motorcycle_id (motorcycle_unit_id)`.
- [x] Verify `product_serials` table structure:
  - `id INT AUTO_INCREMENT PRIMARY KEY`
  - `product_id INT NOT NULL`
  - `serial_number VARCHAR(100) NOT NULL`
  - `status ENUM('available','sold') DEFAULT 'available'`
  - unique serial numbers
  - foreign key `product_id -> products(id)`
- [x] Verify `GET /api/products/:id/serials` returns only available serials:
  - `SELECT id, serial_number FROM product_serials WHERE product_id = ? AND status = 'available'`.
- [x] Add realistic seed data to `database.sql`:
  - motorcycle units: Yamaha Mio i125 2023, Suzuki Raider FI 2022, Honda Click 125, XRM.
  - products: Bolt M8, Spark Plug, ECU with real `part_number`, brand, size/spec fields, prices, stock, serialized flag, and compatibility rows.
  - at least one serialized product with available serials.
- [x] Update `backend/controllers/productController.js`:
  - `GET /api/products` returns `part_number`, `size`, `measurement`, `thread_type`, `motorcycle_unit_ids`, `compatibility`, and `compatibility_display` while preserving existing `product_name` and `price` aliases for current frontend compatibility.
  - Return compatibility in this shape: `motorcycle_unit_ids: [1, 2]`, `compatibility: ["Yamaha Mio i125", "Suzuki Raider FI"]`, `compatibility_display: "Yamaha Mio i125, Suzuki Raider FI"`.
  - Build `compatibility_display` consistently from unit objects: `compatibility.map(u => `${u.brand} ${u.model} ${u.year_model ?? ""}`.trim()).join(", ")`.
  - `POST /api/products` accepts new fields plus `motorcycle_unit_ids` and `serial_numbers`.
  - Validate required fields: `part_number`, `brand`, `name`, `category`, `size`, `cost_price`, `selling_price`, `reorder_level`, `is_serialized`, and at least one `motorcycle_unit_id`.
  - Return `400` with `At least one motorcycle compatibility is required` when `motorcycle_unit_ids` is missing or empty.
  - Enforce `size` for now for all products, covering the panelist-critical categories bolts, wires, and bearings.
  - Validate serialized products: serial list required, trim whitespace, reject empty serial entries, reject duplicate serial numbers in the submitted list, stock equals serial count.
  - Validate non-serialized products: stock required and numeric.
  - Insert product and compatibility rows in one transaction.
  - On duplicate `(part_number, brand)`, return a clear 400 message.
  - `PUT /api/products/:id` updates product details and compatibility rows, without editing serial inventory.
- [x] Add product metadata endpoints in `backend/routes/productRoutes.js`:
  - `GET /api/products/motorcycle-units` returns units for compatibility selectors and filters.
  - Keep `GET /api/products/:id/serials` for available serial selection.
- [x] Update `backend/controllers/inventoryController.js` responses to include `part_number`, `size`, and compatibility display.
  - Use product compatibility joins and group results so inventory can support Phase 5 filters.
- [x] Decide whether `backend/setupDb.js` should be updated or left documented as admin-only bootstrap.
  - Decision: do not expand it. Full schema stays in `backend/db/database.sql`; `setupDb.js` is documented as minimal users-table bootstrap only.
- [x] Verify Phase 1:
  - Backend syntax checks with `node -c` on changed backend controllers/routes passed in the Phase 1 controller slice.
  - Local live DB schema/API smoke checks confirmed sample products, motorcycle units, compatibility, inventory, sales, reports, and serials.
  - Ran `SELECT part_number, brand, size FROM products WHERE part_number = 'BLT-M8-001';`
  - Ran `SELECT p.part_number, m.brand, m.model FROM products p JOIN product_compatibility pc ON p.id = pc.product_id JOIN motorcycle_units m ON pc.motorcycle_unit_id = m.id;`
  - Ran `SELECT product_id, serial_number, status FROM product_serials WHERE status = 'available';`

## Phase 2 - Products/Add Product UI

- [x] Step 1: update `frontend/src/pages/Products.jsx` form state and submit payload with backend product fields:
  - Required: Product Name, Part Number, Brand, Category, Size, Cost Price, Selling Price, Reorder Level, Product Type.
  - Optional/spec: Measurement, Thread Type.
  - Prepare `motorcycle_unit_ids` in state and payload for the compatibility selector slice.
- [x] Step 2: add compatibility multi-select using `GET /api/products/motorcycle-units`.
- [x] Rename product type labels to `Serialized` and `Non-Serialized`.
- [x] For serialized products, show serial number textarea/list and derive stock from serial count.
- [x] For non-serialized products, show stock quantity input.
- [x] Replace generated `formatSKU` display with real `part_number`.
- [x] Update product table columns to include Part Number, Product Name, Brand, Size, Stock, Price, Type, Compatibility, and Actions.
  - Compatibility column displays readable labels, for example `Mio i125, Raider FI`.
- [x] Update product search/filter logic to include part number, product name, brand, size, and compatibility model.
- [x] Verify Phase 2:
  - Add Bolt example: name `Bolt`, part number `BLT-M8-001`, size `M8 x 20mm`, compatibility `Raider FI`.
  - Confirm product appears with real part number and selected compatibility.
  - Run `npm run build` in `frontend`.

## Phase 3 - POS Search and Serialized Checkout

- [x] Update `frontend/src/pages/POS.jsx` product search to match:
  - part number first and as the main identifier
  - motorcycle model
  - product name
  - brand
  - size
- [x] When the cashier types a motorcycle model, for example `Mio`, filter products using the product compatibility relationship, not only product text fields.
- [x] Update POS product display as a table or table-like product picker with these columns:
  - Part Number as the first/main column
  - Product Name
  - Brand
  - Size
  - Stock
  - Price
  - Compatibility summary.
- [x] POS search must prioritize `part_number` matches over `product_name` matches.
- [x] Add exact serial selection flow for serialized products:
  - When adding a serialized product, fetch `/api/products/:id/serials`.
  - Show a modal or dropdown listing available serials.
  - Require the cashier to choose the exact available serial before checkout.
  - Prevent quantity from exceeding selected serial count for serialized items.
- [x] Update POS sale payload to send product ids and chosen serial ids:
  - Prefer `items: [{ product_id, quantity, serial_ids }]`.
  - Keep backend compatibility with `variant_id` only if needed during transition.
- [x] Update `backend/controllers/salesController.js`:
  - Accept `product_id` as canonical id.
  - Store sale item snapshots for `part_number`, `product_name`, `brand`, and `size` so transaction history survives later product edits.
  - For serialized products, require exact `serial_ids`, lock them, verify status `available`, mark them `sold`, and map them to `sale_item_serials`.
  - If a serialized item has no selected `serial_ids`, reject the sale; do not auto-pick serials.
  - For non-serialized products, keep stock decrement behavior.
- [x] Update receipt data to include part number, brand, size, and serial numbers when present.
- [x] Verify Phase 3:
  - Search `Mio` returns only Mio-compatible products.
  - Search `SP001` returns all products with that part number.
  - Serialized sale marks selected serial as `sold`.
  - Non-serialized sale decrements stock by quantity.

## Phase 4 - Reports

- [x] Update `backend/controllers/reportController.js` filters for:
  - motorcycle model/unit id
  - part number
  - brand
  - category
  - date range.
- [x] Reports should expose:
  - total sales
  - total profit
  - best selling parts
  - low stock
  - sales per motorcycle model if product compatibility joins make this meaningful.
- [x] Add grouping by `part_number` and by motorcycle model for top-selling parts.
  - Example row: `SP-001 -> Mio i125`.
- [x] Group sales by `part_number` and motorcycle model so defense can explain which parts sell per motorcycle unit.
- [x] Remove or stop rendering generic analytics/useless charts from report UI.
- [x] Fix or remove stale `backend/controllers/analyticsController.js` queries that still reference old tables/columns.
- [x] Update `frontend/src/pages/Reports.jsx`:
  - Add filters for motorcycle model, part number, brand, category, date range.
  - Show product rows using part number, product name, brand, size, units sold, revenue/profit where available.
  - Top-selling parts must show `part_number` plus readable compatibility/model context.
- [x] Verify Phase 4:
  - Report filters produce different results for model, part number, brand, category, and date range.
  - Admin stats match sale item totals from sample data.

## Phase 5 - Filtering Everywhere

- [x] Create shared filter utility `frontend/src/utils/productFilter.js`.
  - Use it anywhere frontend product-like rows are searched or filtered.
  - Do not duplicate matching logic inside `Products.jsx`, `Inventory.jsx`, or `Transactions.jsx`.
  - Enforce blank filter safety: if there is no query and no active filters, return all rows.
- [x] Shared filtering priority must be identical on every page:
  - `part_number` exact and partial match as primary identity and highest priority.
  - motorcycle compatibility by model, brand, or year using `compatibility_display`, `compatibility`, or `motorcycle_unit_ids`.
  - `product_name`.
  - product `brand`.
  - `size`.
  - stock status when the page supports stock filters.
- [x] Shared filtering must normalize search input and searchable fields:
  - `query.trim().toLowerCase()`.
  - compare against trimmed/lowercased `part_number`, `compatibility_display`, `product_name`, `brand`, and `size`.
  - input like `mio`, `Mio`, or ` BLT-M8-001 ` must match consistently.
  - fallback missing fields to empty string to avoid runtime errors, for example `(p.part_number || "").toLowerCase()`.
  - if `compatibility_display` is empty or null, do not crash; compatibility text match safely defaults to false.
- [x] Shared filtering must tag match type for deterministic sorting:
  - return or internally rank matches as `part_number_exact`, `part_number_partial`, `compatibility`, `product_name`, `brand`, `size`, or `none`.
- [x] Sorting standard after filtering must be identical on every page:
  - exact `part_number` match first.
  - partial `part_number` match second.
  - compatibility match third.
  - product name match fourth.
  - brand match fifth.
  - size match sixth.
  - sorting must be stable: if two rows have the same rank, preserve original order.
- [x] Example sorting behavior:
  - Search `M8`.
  - `BLT-M8-001` appears before `BLT-M8-002` if exact/prefix logic ranks it higher.
  - part-number matches appear before `Bolt M8 x 20mm` name-only matches.
- [x] Define filter combination logic:
  - text search uses OR across searchable fields.
  - structured filters such as brand, size, compatibility, and stock status use AND logic.
  - if text query matches but a selected structured filter fails, the row is hidden.
- [x] Define stock status filters consistently:
  - `in_stock` -> `stock > 0`.
  - `out_of_stock` -> `stock === 0`.
  - `low_stock` -> `stock <= reorder_level`.
- [x] Performance safety:
  - frontend filtering is acceptable for the current scale.
  - if product count grows beyond 500 rows or UI lag is observed, move filtering to backend API endpoints using indexed queries on `part_number`, `brand`, `name`, `size`, and compatibility joins.
  - add debounce around 200-300ms on search inputs to prevent unnecessary re-renders while typing.
- [x] Enforce compatibility filtering:
  - Searching by motorcycle model, for example `Mio`, must use compatibility data.
  - Do not treat `p.product_name.includes("Mio")` as valid motorcycle compatibility logic.
  - Prefer selected motorcycle filters to match `motorcycle_unit_ids`; text search may match `compatibility_display`.
- [x] Update `frontend/src/pages/Products.jsx` filters to use `filterProducts`.
  - filters: part number query, compatibility, brand, size, stock status.
- [x] Update `frontend/src/pages/Inventory.jsx`:
  - use `filterProducts`.
  - show/search part number, brand, size, compatibility
  - preserve stock-in/stock-out behavior for non-serialized products.
- [x] Update `frontend/src/pages/Transactions.jsx`:
  - filters: date range, part number, product name.
  - receipt/details show part number, brand, size, and serials.
  - transaction rows must filter from product snapshots or backend joins that include part number and compatibility context.
  - recommended backend approach: include sale item snapshot fields for `part_number`, `product_name`, `brand`, `size`, and `compatibility_display`; fallback is joining products/compatibility during fetch.
  - if snapshot fields are missing, fallback to joining the product table and compatibility tables on fetch.
  - never filter transactions using only generic transaction text; filtering must include `part_number` context.
- [x] Verify Phase 5:
  - Search `BLT-M8-001`: appears consistently in Products, Inventory, and Transactions when present.
  - Search `Mio`: only Mio-compatible products appear; matching must come from compatibility data.
  - Search by brand: returns the correct filtered list.
  - Empty search and no filters: shows all records with no accidental hiding.
  - Filters do not hide valid rows when optional fields are blank.

## Phase 6 - Testing and Sample Data

- [x] Ensure sample data includes:
  - Yamaha Mio
  - Raider FI
  - Honda Click 125
  - XRM
  - Bolt M8
  - Spark Plug
  - ECU.
- [x] Add repeatable smoke test notes or scripts for:
  - `Mio` search returns Mio-compatible products only.
  - part number search returns correct brand variants.
  - serialized sale marks selected serial sold.
- [x] Add Phase 1 fail-case tests:
  - Add product without size -> should fail.
  - Add product without compatibility -> should fail.
  - Add duplicate `part_number + brand` -> should fail.
- [x] Add Phase 1 database checks before moving to Phase 2:
  - Insert product with `part_number`, `brand`, `size`, and compatibility.
  - Fetch products and confirm `compatibility_display` and `motorcycle_unit_ids`.
  - Confirm serialized product serials are saved correctly.
  - Run search query: `SELECT * FROM products WHERE part_number = 'BLT-M8-001';`
  - Run join query: `SELECT p.name, m.model FROM products p JOIN product_compatibility pc ON p.id = pc.product_id JOIN motorcycle_units m ON pc.motorcycle_unit_id = m.id;`
- [x] Add panelist scenario test:
  - Customer asks: `Pang Mio ba 'to?`
  - Search `Mio`.
  - Expected: results show only Mio-compatible parts with readable compatibility labels.
- [x] Run final verification:
  - Backend syntax checks.
  - Frontend lint and build.
  - Manual browser checks for Products, POS, Reports, Transactions, Inventory.
  - API/database checks for compatibility rows and serial status.

## Phase 7 - Defense Notes

- [x] Add or maintain defense notes in this file after implementation:
  - `part_number = identity`: every product lookup, POS row, report row, and receipt should expose the real part number.
  - `serial = tracking unit`: serialized products must use selected serials so the shop knows exactly which unit was sold.
  - `compatibility = correctness`: compatibility answers "Para kanino yung part?" and prevents selling the wrong part for a motorcycle model.
  - `size = precision`: size is required because bolts, wires, bearings, and similar motorcycle parts cannot be identified safely by name alone.
  - `why not SKU`: generated SKUs are internal and ambiguous; motorcycle shops identify parts by real manufacturer/service part numbers, compatibility, and size/spec.

## Phase 8 - Compatibility Groups / Motorcycle Platforms

Status: planned enhancement only. Do not implement until approved. Phase 1-7 are stable and verified, so Phase 8 must be additive and backward compatible.

### Problem

The current compatibility model supports `products -> motorcycle_units`. This is correct for exact-fit parts, but it does not scale well for real motorcycle shops because many models share the same compatible parts through a platform, engine family, or product family.

Example: `Mio i125`, `Mio Soul i125`, `Mio Gear`, and `Mio Sporty` may all use the same spark plug, belt, bearing, bolts, or brake pads. Selecting every unit manually for every product is slow, repetitive, and error-prone.

### Architecture Decision

Keep both compatibility paths:

- Broad compatibility: `products -> product_compatibility_groups -> compatibility_groups -> compatibility_group_units -> motorcycle_units`.
- Exact compatibility: `products -> product_compatibility -> motorcycle_units`.

Do not remove direct `product_compatibility`. Some parts are exact-fit, year-specific, FI/carb-specific, or special-case. Group compatibility should reduce repetitive assignments, not replace precision.

Use a join table `compatibility_group_units` instead of adding only one `compatibility_group_id` column to `motorcycle_units`. This keeps the design flexible if one motorcycle needs to belong to more than one operational group later.

### Database Plan

- [ ] Add `compatibility_groups`:
  - `id INT AUTO_INCREMENT PRIMARY KEY`
  - `group_name VARCHAR(150) NOT NULL UNIQUE`
  - `description TEXT`
  - indexes: `idx_group_name (group_name)`.
- [ ] Add `compatibility_group_units`:
  - `id INT AUTO_INCREMENT PRIMARY KEY`
  - `compatibility_group_id INT NOT NULL`
  - `motorcycle_unit_id INT NOT NULL`
  - foreign keys to `compatibility_groups(id)` and `motorcycle_units(id)`
  - unique constraint `UNIQUE (compatibility_group_id, motorcycle_unit_id)`
  - indexes: `idx_group_unit_group`, `idx_group_unit_motorcycle`.
- [ ] Add `product_compatibility_groups`:
  - `id INT AUTO_INCREMENT PRIMARY KEY`
  - `product_id INT NOT NULL`
  - `compatibility_group_id INT NOT NULL`
  - foreign keys to `products(id)` and `compatibility_groups(id)`
  - unique constraint `UNIQUE (product_id, compatibility_group_id)`
  - indexes: `idx_product_group_product`, `idx_product_group_group`.
- [ ] Seed example groups:
  - `Yamaha Mio Platform`
  - `Honda Click Platform`
  - `Suzuki Raider Platform`
- [ ] Seed example group members:
  - Yamaha Mio i125 -> Yamaha Mio Platform
  - Honda Click 125 -> Honda Click Platform
  - Suzuki Raider FI -> Suzuki Raider Platform

### Backend Plan

- [ ] Add metadata endpoint:
  - `GET /api/products/compatibility-groups`
  - returns groups with member units for Products UI selectors.
- [ ] Extend product create/update payloads:
  - accept `compatibility_group_ids: number[]`
  - continue accepting `motorcycle_unit_ids: number[]`
  - validation rule: at least one direct motorcycle unit OR one compatibility group is required.
- [ ] Extend product list response:
  - keep current fields: `motorcycle_unit_ids`, `compatibility`, `compatibility_display`
  - add `compatibility_group_ids`
  - add `compatibility_groups`
  - add expanded effective motorcycle units from direct units plus group members.
- [ ] Define display rule:
  - `compatibility_display` should show group labels first, then direct-only unit labels.
  - Example: `Yamaha Mio Platform, Honda Click Platform, Raider FI 2022`.
- [ ] Define inherited search rule:
  - Searching `Mio` matches products directly compatible with a Mio unit OR products compatible with any group containing a Mio unit.
- [ ] Avoid duplicate display rows:
  - If a unit is inherited from a group and also selected directly, show it once in effective compatibility.

### Frontend Plan

- [ ] Update Products form:
  - add Compatibility Group selector above direct motorcycle unit selector.
  - keep direct unit selector for exact-fit overrides and special cases.
  - submit both `compatibility_group_ids` and `motorcycle_unit_ids`.
- [ ] Update Products table:
  - show broad platform labels and direct compatibility in the Compatibility column.
- [ ] Update POS, Inventory, Transactions, and Reports filtering:
  - searches must include group names and inherited group member models.
  - keep `part_number` as the highest-priority identity match.
- [ ] Update shared `productFilter.js`:
  - include `compatibility_groups`, group names, and effective compatibility text in matching/ranking.
  - keep blank-field safety and stable sorting.

### Verification Plan

- [ ] SQL verification:
  - insert a `Yamaha Mio Platform`
  - attach `Yamaha Mio i125` to the group
  - attach `SP-001` to the group
  - verify a join returns `SP-001 -> Mio i125`.
- [ ] API verification:
  - `GET /api/products` returns `compatibility_group_ids`, group labels, and effective compatibility.
  - `GET /api/products/compatibility-groups` returns groups with units.
- [ ] UI verification:
  - create/edit a product using `Yamaha Mio Platform` without manually selecting Mio units.
  - Products table shows platform compatibility.
  - POS search `Mio` returns products inherited through `Yamaha Mio Platform`.
  - Reports motorcycle filter includes products sold through group compatibility.
- [ ] Regression verification:
  - existing direct compatibility still works.
  - exact direct motorcycle compatibility can be combined with platform compatibility.
  - no duplicate compatibility labels appear.
  - `npm run lint` and `npm run build` pass.

### Defense Note

Use this explanation:

> Direct motorcycle-to-product compatibility is accurate but does not scale when many models share the same engine platform or part family. Compatibility groups let products inherit compatibility from motorcycle platforms like Mio or Raider, so adding a future motorcycle model only requires assigning it to the right group. Direct compatibility remains available for exact-fit and special-case parts.

## Review / Results

- Implementation in progress; only checked tasks should be treated as complete.
- Phase 1 started with the products table schema slice only. Verified by regex requirement check for `part_number`, `brand NOT NULL`, `size NOT NULL`, `measurement`, `thread_type`, `unique_part_brand`, and product search indexes.
- Added `motorcycle_units` table with `unique_motorcycle_unit` and `idx_model`. Verified schema text and live DB `SELECT * FROM motorcycle_units` plus rollback insert of `Yamaha | Mio i125 | 2023`.
- Added `product_compatibility` table with product/unit foreign keys, unique product-unit pair, `idx_product_motorcycle`, `idx_product_id`, and `idx_motorcycle_id`. Verified schema text and live DB `SELECT * FROM product_compatibility` plus rollback insert of `(product_id=1, motorcycle_unit_id=1)`.
- Review correction applied: `year_model` stays optional for model-level compatibility, and `compatibility_display` includes year only when present.
- Live DB drift found before controller work: `products` was missing new columns even though `database.sql` was updated. Applied non-destructive live migration for product columns/indexes and backfilled existing rows with deterministic `LEGACY-0001` style `part_number` and `Unspecified` size.
- Product controller GET updated to join compatibility and group duplicate rows into one product with `motorcycle_unit_ids`, `compatibility`, and `compatibility_display`. Verified with a failing-then-passing grouped-row controller check and real `/api/products` response.
- Product controller POST updated with strict validation, serial normalization/duplicate rejection, compatibility requirement, transaction insert for product + compatibility + serials, and duplicate `(part_number, brand)` handling. Verified with controller validation checks and live temporary create tests; cleanup confirmed zero `CODX-%` temp rows remain.
- Pause checkpoint: stop here before shutdown. Resume with the next backend slice after review; do not jump to frontend/POS until the next slice is approved.
- Product serials table verified live: `product_id` FK points to `products(id)`, `serial_number` is unique, and `status` is `ENUM('available','sold')` defaulting to `available`.
- Seed data added to `database.sql` and live DB: Yamaha Mio i125 2023, Suzuki Raider FI 2022, Honda Click 125, Honda XRM; Bolt M8 `BLT-M8-001`, Spark Plug `SP-001`, ECU `ECU-RAIDER-01`; ECU serials `ECU001`, `ECU002`, `ECU003`.
- Implemented and verified `GET /api/products/motorcycle-units`; API returned 4 motorcycle units.
- Updated and verified inventory response with `part_number`, `size`, and `compatibility_display`; API returned Bolt M8 with `Suzuki Raider FI 2022`.
- Required SQL verification passed: `BLT-M8-001` product exists; compatibility join returned Bolt/Raider, ECU/Raider, Spark Plug/Click, Spark Plug/Mio; available serial query returned ECU001-ECU003.
- Sales API alignment completed: `createSale` accepts canonical `product_id` while preserving `variant_id` fallback. Verified with a live temporary sale using `product_id`; sale details returned `part_number`, `size`, serial field, and `compatibility_display`, and the sale list returned `part_numbers`. Temporary sale was deleted and stock restored.
- Reports backend alignment completed without full Phase 4 redesign: low-stock and best-selling queries now include `part_number`, `size`, and `compatibility_display`. Verified controller calls; low stock currently has no rows, best-selling returned part-number-capable rows.
- Phase 2 Step 1 completed: Products form state, edit hydration, visible Add Product inputs, and submit payload now include `part_number`, `size`, `measurement`, `thread_type`, `cost_price`, `reorder_level`, and prepared `motorcycle_unit_ids`. Verified by static form/payload requirement check and frontend build.
- Phase 1 final verification gate closed explicitly after review correction: `BLT-M8-001` returned part number/brand/size, compatibility join returned Bolt/Raider, ECU/Raider, Spark Plug/Click, and Spark Plug/Mio rows, and available serial query included ECU001-ECU003.
- `setupDb.js` decision documented: keep it as minimal users-table bootstrap only; full schema remains `backend/db/database.sql`. Verified syntax with `node -c setupDb.js`.
- Phase 2 Step 2 completed: Products form now fetches `/products/motorcycle-units`, displays id-backed compatibility checkboxes, stores numeric `motorcycle_unit_ids`, hydrates selected ids on edit, and submits ids as numbers. Verified by static selector check, frontend build, and API smoke test creating/fetching `TEST-MIO-01`; test product cleanup returned no remaining `TEST-MIO-01` rows.
- Phase 2 continuation corrections completed: frontend product type labels now display `Serialized` and `Non-Serialized`, generated SKU logic was removed from source files, the product table now shows Part Number, Name, Brand, Size, Stock, Price, Type, and Compatibility, and compatibility display labels now use model plus optional year. Verified `SP-001` returns `Click 125, Mio i125 2023`. Future Phase 3 risk captured: sale items must snapshot product identity fields and serialized sales must reject missing explicit serial ids.
- Pause checkpoint before shutdown: resume at Phase 2 remaining Product UI work. Next unchecked item is product search/filter logic in `frontend/src/pages/Products.jsx`; do not jump to POS, reports, transactions, or global filtering until Products UI is reviewed and stable.
- Phase 2 Product search/filter slice implemented: `Products.jsx` now normalizes search text, searches null-safely across `part_number`, `compatibility_display`/`compatibility`, `product_name`, `brand`, and `size`, and applies stable ranking in this order: exact part number, partial part number, compatibility, name, brand, size. Existing category, brand, and product-type dropdowns still apply as structured filters.
- Phase 2 verification completed: data-driven search checks passed for `BLT`, `Mio`, `NGK`, `M8`, and blank search; `npm run build` passed in `frontend`. Current data results: `BLT` ranks `BLT-M8-001` first, `Mio` returns only `SP-001` with `Mio i125 2023` compatibility, `NGK` matches brand, `M8` matches the bolt part/size, and blank search returns all 54 products.
- Phase 3 POS search/display slice implemented only: `POS.jsx` now uses the same null-safe ranking order as Products for `part_number`, compatibility, product name, brand, and size; the product picker is now a table with Part Number, Product Name, Brand, Size, Stock, Price, and Compatibility. Cart/checkout/serial behavior was intentionally left for later Phase 3 slices.
- Phase 3 POS search/display verification passed: active-product checks for `BLT`, `Mio`, `NGK`, `M8`, and blank search matched expected results, and `npm run build` passed in `frontend`. Checkout payload still uses `variant_id` compatibility and must be handled in the later sales/serial slice.
- Phase 3 POS serial-selection UI slice completed: clicking a serialized product opens a serial picker backed by `/products/:id/serials`, selected serial ids/numbers are stored on the cart item, serialized quantity/subtotal derive from selected serial count, and checkout is blocked if any serialized cart item has no selected serials. POS payload now sends `product_id`, `variant_id`, `quantity`, and `serial_ids` for compatibility with the next backend enforcement slice. Verified the UI code paths by static check, confirmed ECU available serial data exists, and `npm run build` passed in `frontend`.
- Phase 3 sales backend enforcement completed: `salesController.js` now treats `product_id` as canonical with `variant_id` fallback, rejects serialized sales without explicit `serial_ids`, rejects duplicate/unavailable/wrong-product serial ids, locks selected available serial rows inside the transaction, marks selected serials sold, inserts `sale_item_serials`, and writes immutable sale-item snapshots for `part_number`, `product_name`, `brand`, and `size`. Live `sale_items` was migrated/backfilled with snapshot columns, and `sale_item_serials.serial_id` was made unique.
- Phase 3 backend verification completed: serialized ECU sale succeeded only with selected serial `ECU001`; selling the same serial again failed; missing serials failed; invalid serial/product combinations failed; non-serialized Bolt sale decremented stock; sale detail still returned the original ECU snapshot after temporarily editing the product name. Cleanup removed test sales and restored Bolt stock, ECU stock/name, and ECU serials to available. `SP001` search now ranks stored part number `SP-001`, `node -c controllers/salesController.js` passed, and `npm run build` passed in `frontend`.
- Pause checkpoint before shutdown: resume after Phase 3 backend enforcement. Phase 1, Phase 2, and Phase 3 are checked through backend serialized-sale enforcement and verification. Next recommended work is to review Phase 4 Reports or Phase 5 shared filtering plan before coding; do not restart old POS serial work unless a regression is found.
- Phase 5 shared filtering utility slice completed for product-like pages: added `frontend/src/utils/productFilter.js` with null-safe normalization, punctuation-tolerant part-number matching, match-type ranking, structured-filter AND logic, compatibility-id filtering, stock status helpers, and stable sorting. Migrated `Products.jsx`, `POS.jsx`, and `Inventory.jsx` to use `filterProducts`; Inventory now also shows size and compatibility and uses the shared matcher for the stock-adjust dropdown. Verified with a Node smoke test for `BLT-M8-001`, `SP001`, `Mio`, `NGK`, `M8`, blank search, compatibility id, serialized type, and stock status; `npm run build` passed in `frontend`; `git diff --check` passed for the touched Phase 5 files. `npm run lint` still has pre-existing/out-of-scope errors in `AuthContext.jsx`, `Transactions.jsx`, and `Users.jsx`. Transactions remains intentionally unchecked for the next sale-snapshot filtering slice.
- Phase 5 Transactions slice completed: `/sales` summaries now expose sale-item snapshot fields for `part_numbers`, `brands`, `sizes`, and `compatibility_display`; `Transactions.jsx` uses shared snapshot matching from `productFilter.js` instead of generic product-name-only search; the transaction table shows part numbers/products/compatibility, and receipt details show part number, brand, size, compatibility, and serial numbers. Verified snapshot matching for `SP001`, `BLT`, `Mio`, `Spark`, `NGK`, and `20mm`; verified `getSales` returns the new fields; `node -c controllers/salesController.js`, `npm run build`, and targeted `git diff --check` passed. `npm run lint` now fails only on out-of-scope existing issues in `AuthContext.jsx` and `Users.jsx`. Phase 5 still has debounce/performance safety pending.
- Phase 4 Reports backend slice completed: `reportController.js` now supports filters for date range, part number, brand, category, motorcycle unit id, and motorcycle model; best-selling reports aggregate from sale-item snapshots and attach compatibility display without multiplying quantities; added `/api/reports/sales-by-motorcycle` and `/api/reports/brands`; admin stats can use the same filters; low-stock supports motorcycle/product filters. Replaced stale `analyticsController.js` queries that referenced removed `product_variants` / `sales_items` tables with current `products`, `sale_items`, and `sales` queries. Verified with `node -c` on report/analytics files, controller smoke checks for best-selling, sales-by-motorcycle, admin stats, low stock, brands, and analytics dashboard, `npm run build`, and targeted `git diff --check`. Current live sales are mostly legacy rows, so `sales-by-motorcycle` returns zero until compatible product sales exist.
- Phase 4 Reports frontend slice completed: `Reports.jsx` now uses one operational filter bar for part number, motorcycle model, brand, category, and date range; summary cards come from filtered admin stats; best-selling rows show part number, product, brand, size, compatibility, units, revenue, and profit; sales-by-motorcycle and low-stock tables consume the new report endpoints; generic daily/monthly report cards and chart-like placeholders were removed. Verified `npm run build` and targeted `git diff --check`; `npm run lint` still fails only on the pre-existing out-of-scope `AuthContext.jsx` and `Users.jsx` issues.
- Phase 4 verification closed with temporary compatible sale data: inserted a rollback-safe sale for seeded `SP-001`, verified report filters for part number `SP001`, brand, category, motorcycle model `Mio`, and date range; verified `sales-by-motorcycle` returned model-linked rows and filtered admin stats included sale revenue/profit; then deleted the temporary sale and confirmed zero remaining rows for that sale id.
- Phase 5 debounce/performance safety completed: added `frontend/src/hooks/useDebouncedValue.js` and applied 250ms debounce to Products, POS, Inventory, Transactions, and Reports search/filter inputs. Verified `npm run build` and targeted `git diff --check`; `npm run lint` still fails only on the pre-existing out-of-scope `AuthContext.jsx` and `Users.jsx` issues.
- Phase 6 testing notes started and smoke checks verified: added `tasks/phase6-smoke-tests.md`; verified sample motorcycle units and products exist; verified product API returns `motorcycle_unit_ids` and `compatibility_display`; verified shared searches for `Mio`, `SP001`, `BLT-M8-001`, `NGK`, and `M8`; verified validation failures for missing size, missing compatibility, and duplicate `part_number + brand`; verified serialized sale rejects missing serial, accepts selected serial, rejects selling the same serial twice, and cleanup restored the sale/serial/product stock state.
- Phase 7 defense notes completed in `tasks/defense-notes.md`: documented part number identity, why generated SKU was removed, compatibility correctness, size precision, serial traceability, immutable sales snapshots, unified filtering, operational reports, known limitations, and future improvements.
- Final command verification pass: backend syntax checks passed for product, sales, reports, and analytics controllers; `npm run lint` now passes after splitting `AuthContextValue` from `AuthProvider` and removing the unused Users catch variable; `npm run build` passes; targeted `git diff --check` passes. Manual browser walkthrough remains the only final verification item not completed in this pass.
- Final manual browser walkthrough completed for Products, POS, Inventory, Transactions, and Reports using `http://localhost:5173` with the backend at `http://localhost:5000`.
- Product edit regression found during browser QA: edit form required `cost_price`, but `GET /api/products` did not return it. Fixed by adding `cost_price` to the product list API response, keeping backend validation strict.
- Products browser QA verified add/edit form fields, compatibility display, non-serialized product behavior, shared search, and edited row refresh.
- POS browser QA verified part-number search, serialized serial picker, explicit `ECU001` selection, checkout payload behavior, and receipt rendering with `part_number`, brand, size, and serial.
- Inventory browser QA verified shared filtering by `BLT-M8-001`, `Mio`, `NGK`, blank search, stock adjustment in/out, and no console errors.
- Transactions browser QA verified sale snapshot filtering using a temporary browser sale, receipt details, `part_number`, compatibility, brand/size, and serial display.
- Reports browser QA verified part-number and motorcycle model filters, best-selling parts, sales-by-motorcycle grouping, filtered admin stats, and no console errors.
- Cleanup verification after browser QA passed: temporary sale id `10` removed, QA product/user rows removed, Bolt stock restored to 50, ECU stock restored to 3, and all three ECU serials restored to `available`.
- Final command verification rerun after browser QA: backend controller syntax checks passed; `npm run lint` passed; `npm run build` passed; targeted `git diff --check` passed.
- Plan review corrections applied before Phase 1: `part_number` is primary identity, API returns human-readable compatibility, and `size` is required.
- Staff-engineer challenge before implementation: the elegant path is to make the backend product list response the single rich product shape, then update pages to consume that shape. Avoid ad hoc frontend-only matching or generated part numbers.
- Main known risk: `database.sql` is destructive. Before running it against any non-local database, confirm whether existing data must be preserved.
