# Defense Notes

## Part Number = Identity

The system uses the real `part_number` as the operational product identity across Products, POS, Inventory, Transactions, Reports, receipts, and filters.

Generated SKUs were removed because they are internal and ambiguous. Motorcycle shops identify parts by real manufacturer/service part numbers, fitment, and size/spec, not by system-generated labels.

## Compatibility = Correctness

Compatibility is stored relationally through `product_compatibility`, not as loose text on a product name.

The system keeps both machine-readable and human-readable forms:

- `motorcycle_unit_ids` for forms, filters, and joins.
- `compatibility` and `compatibility_display` for cashiers, reports, product tables, and receipts.

This answers the panelist/shop question: `Para kanino yung part?`

## Size = Precision

`size` is required because motorcycle parts such as bolts, bearings, wires, spark plugs, and fittings can look similar but fail if the size/spec is wrong.

Product names alone are not precise enough for motorcycle-parts inventory.

## Serial = Tracking Unit

Serialized products require explicit serial selection during POS checkout.

The backend rejects serialized sales without selected `serial_ids`, rejects duplicate selected serials, verifies each serial belongs to the product, locks available serial rows during checkout, and marks selected serials as sold.

This prevents the old unsafe behavior where the system could auto-pick a serial without cashier confirmation.

## Immutable Sales Snapshots

Sale items store snapshot fields:

- `part_number`
- `product_name`
- `brand`
- `size`
- sale price and subtotal

Reports, receipts, and transaction history remain accurate even if the product record is edited later.

## Unified Filtering

The frontend uses shared filtering logic instead of one-off page filters.

Search priority is deterministic:

1. exact part number
2. partial part number
3. compatibility
4. product name
5. brand
6. size

This keeps Products, POS, Inventory, and Transactions consistent during demos.

## Reports Are Operational

Reports focus on shop questions:

- Which part numbers sell most?
- Which parts sell for which motorcycle model?
- Which compatible parts are low stock?
- How much sales/profit came from filtered part groups?

The report screen avoids generic charts that do not support motorcycle-parts decisions.

## Known Limitations

- `backend/db/database.sql` is destructive and should not be run on production data without backup.
- `sales-by-motorcycle` depends on sold products having compatibility rows; old legacy sales without compatibility will not appear in motorcycle-model groupings.
- Frontend lint still has existing out-of-scope issues in `AuthContext.jsx` and `Users.jsx`.

## Future Improvements

- Snapshot `compatibility_display` directly on sale items if immutable historical compatibility text becomes required.
- Move product filtering to backend indexed queries if product count grows beyond the current frontend-friendly scale.
- Add printed thermal receipt layout optimization so `part_number` stays readable even for long product names.
