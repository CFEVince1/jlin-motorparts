# Lessons

## 2026-05-05 - Plan and Prove Non-Trivial Work

- For any repo task with 3+ steps, schema/API decisions, or cross-page behavior, write the implementation plan to `tasks/todo.md` before changing application code.
- Check in with the user after the plan is written, then implement only after that plan is accepted or the user clearly asks to proceed.
- Track progress in `tasks/todo.md` as work is completed, and add a review/results section before final handoff.
- Use subagents for independent exploration or analysis on complex changes, keeping each agent focused on one subsystem.
- Before marking work complete, run the commands or browser checks that prove the requested behavior works, and summarize the evidence.

## 2026-05-05 - Motorcycle Inventory Planning Corrections

- Treat `part_number` as the primary product identity in Products, POS, filters, reports, receipts, and tests; `product_name` is descriptive, not the identifier.
- Return compatibility in two forms from product APIs: `motorcycle_unit_ids` for editing and human-readable `compatibility` / `compatibility_display` for cashiers, reports, and panel defense.
- Enforce `size` during product creation/update for this motorcycle-parts workflow, especially bolts, wires, and bearings. The panel expectation is that parts must carry measurements.
- Add defense notes to major school/demo plans so implementation choices can be explained: identity, tracking, correctness, and precision.
- When a unique key includes a required business identifier such as `(part_number, brand)`, make every key column `NOT NULL`; MySQL unique indexes allow repeated `NULL` values.
- Add search indexes to schema plans when POS or reports will search frequently by the same fields.
- Implement large phases one small verified slice at a time: table, test, controller, test, UI, test.
- For serialized products, normalize serial input before validation: trim whitespace, remove empty entries, and reject duplicates before saving.
- POS search must prioritize `part_number`; searching by motorcycle model must use compatibility data, not just plain product text.
- Keep `motorcycle_units.year_model` optional. A blank year means the compatibility is valid at the model level, not tied to one production year.
- Build readable compatibility labels with year only when present: `${brand} ${model} ${year_model ?? ""}` trimmed.
- For product APIs that join compatibility, never return flat join rows. Group in Node by product id and return one product with `motorcycle_unit_ids`, `compatibility`, and `compatibility_display`.
- Before changing a controller query, verify the live database has the columns the query selects. Schema files and live tables can drift.
- Frontend search/filtering must be centralized. Products, Inventory, Transactions, and POS must not each implement their own matching rules.
- Unified product search priority is strict: `part_number`, compatibility, `product_name`, brand, size, then stock status where applicable.
- Motorcycle-model search must use compatibility fields or IDs, not accidental product-name matches.
- Blank filter safety is mandatory: if there is no query and no active filters, return all rows.
- Filtering and ordering are separate. Shared filter utilities must tag match type, sort exact `part_number` matches first, and normalize all query/text comparisons with trim + lowercase.
- Text search uses OR across searchable fields; structured filters such as brand, size, compatibility, and stock status use AND logic.
- Shared filters must be null-safe: missing product fields become empty strings, missing compatibility does not crash, and stable sorting preserves original order for equal ranks.
- Debounce frontend search inputs around 200-300ms when filtering client-side lists.
- Before moving phases, distinguish "planned" from "verified." Phase 1 is not complete until serial table structure, seed data, metadata endpoints, inventory responses, and required SQL checks are proven.
- Before frontend POS work, align sales APIs to accept canonical `product_id` while preserving `variant_id` compatibility, and make transaction/detail responses include `part_number`, size, and compatibility context.
- Do not leave setup/bootstrap ownership ambiguous. If `database.sql` is the full schema source of truth, document `setupDb.js` as minimal users-table bootstrap only and keep it out of full schema management.
- Before moving to the next UI slice, close any unchecked backend verification gate with explicit command output, then mark the checklist. A build alone does not close SQL/schema verification.
- Keep frontend product type wording separate from backend storage. Backend can keep `is_serialized`; UI must display `Serialized` and `Non-Serialized`, never legacy labels such as `Bulk`.
- Product-facing compatibility labels should match mechanic language: model plus optional year, for example `Mio i125 2023`, not brand-heavy labels unless the UI specifically asks for brand.
- Remove generated SKU logic completely once real `part_number` exists. Product tables, POS, receipts, and reports must show the real part number as the reference.
- Transaction history must snapshot product identity fields such as `part_number`, product name, brand, and size so later product edits do not rewrite sales history.
- Serialized checkout must reject a sale when no explicit serial ids are selected; do not keep any old auto-pick behavior as a fallback.
- Part-number search should tolerate punctuation differences. A cashier typing `SP001` should still match stored part number `SP-001`, while the UI continues displaying the real stored part number.
- For defense, explain why generated SKU was removed: SKUs were internal and ambiguous, while motorcycle shops search by real manufacturer/service `part_number`, compatibility, and size.
- Transactions and reports should rely on immutable sale-item snapshot fields first, not live product names alone, so historical receipts and analytics do not drift after product edits.
- Motorcycle-parts reports should answer operational questions directly, such as which part numbers sell for which motorcycle models, instead of showing generic charts that do not support shop decisions.
- Direct motorcycle-to-product compatibility is accurate but does not scale by itself. For real motorcycle shop workflows, plan a platform/group layer so products can target `Mio Platform`, `Raider Platform`, or similar shared families.
- Keep direct compatibility even after adding groups. Groups reduce repetitive broad assignments; direct unit compatibility is still needed for exact-fit, year-specific, FI/carb-specific, and special-case parts.
- Prefer a `compatibility_group_units` join table over a single `compatibility_group_id` on `motorcycle_units` when future flexibility matters. A join table allows one motorcycle to belong to multiple operational groups without a later schema rewrite.
- Compatibility search must expand inherited group membership. Searching `Mio` should find products assigned directly to a Mio unit and products assigned to a group containing Mio units.
- Compatibility displays should avoid duplicate labels when the same motorcycle is included through both a group and a direct override.
