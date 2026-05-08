# Phase 6 Smoke Tests

Run these checks before final defense or after changing schema, product APIs, POS, transactions, or reports.

## Sample Data

- Motorcycle units exist:
  - Yamaha Mio i125 2023
  - Suzuki Raider FI 2022
  - Honda Click 125
  - Honda XRM
- Products exist:
  - Bolt M8, part number `BLT-M8-001`
  - Spark Plug, part number `SP-001`
  - ECU, part number `ECU-RAIDER-01`
- ECU serials exist and can be returned as available serials when unsold:
  - `ECU001`
  - `ECU002`
  - `ECU003`

## Search Behavior

- Search `Mio`.
  - Expected: products/sales/reports match through compatibility data, not product-name coincidence.
- Search `SP001`.
  - Expected: stored part number `SP-001` matches because part-number search ignores punctuation.
- Search `BLT-M8-001`.
  - Expected: exact part-number matches rank first.
- Search `NGK`.
  - Expected: NGK brand rows match.
- Search `M8`.
  - Expected: part-number matches rank before name/size-only matches.

## Validation Failure Tests

- Add product without `size`.
  - Expected: request fails with a 400 response.
- Add product without compatibility.
  - Expected: request fails with `At least one motorcycle compatibility is required`.
- Add duplicate `part_number + brand`.
  - Expected: request fails with a duplicate part-number/brand error.
- Sell serialized product without selected `serial_ids`.
  - Expected: sale is rejected.
- Sell the same serial twice.
  - Expected: second sale is rejected because the serial is no longer available.

## Report Checks

- Best-selling filter by part number `SP001`.
  - Expected: report row includes `SP-001`.
- Best-selling filter by motorcycle model `Mio`.
  - Expected: report row includes only Mio-compatible sold parts.
- Sales by motorcycle model.
  - Expected: model rows include unit totals, revenue, profit, and related part numbers.
- Admin stats with filters.
  - Expected: total sales and profit match filtered sale item totals.

## Final Commands

```powershell
cd backend
node -c controllers/productController.js
node -c controllers/salesController.js
node -c controllers/reportController.js

cd ..\frontend
npm run build
npm run lint
```

Known lint exception at this checkpoint:

- `frontend/src/context/AuthContext.jsx` has the existing `react-refresh/only-export-components` warning.
- `frontend/src/pages/Users.jsx` has an existing unused `err` variable.
