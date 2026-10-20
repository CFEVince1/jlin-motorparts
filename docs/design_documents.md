# System Design Documents: JLIN Motorparts Inventory & POS System

This document contains the complete formal software engineering design diagrams for the **JLIN Motorparts Inventory & POS System**:
1. **Entity-Relationship Diagram (ERD)** — Database architecture, table schemas, keys, constraints, and relational cardinality.
2. **Data Flow Diagrams (DFD)**:
   - **DFD Level 0** — System Context Diagram showing external entities and core information flows in a balanced radial architecture.
   - **DFD Level 1** — Process Decomposition Diagram detailing sub-processes, data stores, and transactional logic across 4 structured layers.
3. **System Architecture Diagram** — 3-Tier Cloud Deployment Architecture (Vercel Frontend, Render Backend, Aiven Cloud MySQL 8, and Resend HTTPS REST Email Gateway).
4. **Architectural Quality Attributes & Defense Readiness** — Rigorous verification matrix for academic defense and production auditability.

---

## 1. Entity-Relationship Diagram (ERD)

The JLIN Motorparts database is built on **MySQL 8** with strict InnoDB foreign key enforcement, transactional consistency, and database triggers protecting immutable audit trails.

```mermaid
erDiagram
    %% 1. User & Authentication
    users ||--o{ password_otps : "requests"
    users ||--o{ sales : "processes"

    %% 2. Sales & Point of Sale Transactions
    sales ||--|{ sale_items : "contains"
    products ||--o{ sale_items : "sold_via"
    sale_items ||--o{ sale_item_serials : "allocates"
    product_serials ||--o{ sale_item_serials : "assigned_to"

    %% 3. Supplier Inflow & Receiving Records
    suppliers ||--o{ receiving_records : "supplies"
    receiving_records ||--|{ receiving_record_items : "contains"
    products ||--o{ receiving_record_items : "replenished_via"

    %% 4. Product Catalog & Serial Asset Tracking
    products ||--o{ product_serials : "tracks"
    products ||--o{ inventory_transactions : "audited_in"
    inventory_transactions ||--o| inventory_transactions_lock : "guarded_by"

    %% 5. Fitment & Motorcycle Compatibility Matrix
    products ||--o{ product_compatibilities : "fits_model"
    motorcycle_models ||--o{ product_compatibilities : "compatible_with"
    products ||--o{ product_compatibility_groups : "grouped_in"
    compatibility_groups ||--o{ product_compatibility_groups : "applies_to"
    compatibility_groups ||--o{ compatibility_group_units : "includes"
    motorcycle_units ||--o{ compatibility_group_units : "member_of"

    users {
        int id PK
        varchar username UK
        varchar password
        enum role "admin, staff"
        int token_version
        varchar email UK
        datetime email_verified_at
        timestamp created_at
    }

    password_otps {
        int id PK
        int user_id FK
        varchar purpose "link_email, password_reset"
        varchar code_hash
        int attempts
        datetime expires_at
    }

    suppliers {
        int id PK
        varchar name UK
        varchar contact_person
        varchar email
        varchar phone
        boolean is_active
    }

    receiving_records {
        int id PK
        int supplier_id FK
        varchar reference_no
        int received_by FK
        timestamp received_at
        decimal total_cost
        enum status "draft, received, cancelled"
    }

    receiving_record_items {
        int id PK
        int receiving_record_id FK
        int product_id FK
        int quantity
        decimal cost_price
        decimal subtotal
    }

    products {
        int id PK
        varchar part_number
        varchar sku
        varchar name
        varchar brand
        varchar category
        decimal cost_price
        decimal selling_price
        int current_stock
        int reorder_level
        boolean is_serialized
        boolean is_active
    }

    product_serials {
        int id PK
        int product_id FK
        varchar serial_number UK
        enum status "available, sold"
    }

    sales {
        int id PK
        int user_id FK
        varchar order_number
        decimal total_amount
        decimal tendered_amount
        decimal change_due
        varchar payment_method "Cash, GCash, Split"
        decimal cash_amount
        decimal gcash_amount
        varchar payment_reference UK
        varchar status "COMPLETED, VOIDED"
        timestamp sale_date
    }

    sale_items {
        int id PK
        int sale_id FK
        int product_id FK
        varchar part_number
        varchar product_name
        int quantity
        decimal price
        decimal cost_price
        decimal subtotal
    }

    sale_item_serials {
        int id PK
        int sale_item_id FK
        int serial_id FK,UK
    }

    inventory_transactions {
        bigint id PK
        varchar transaction_number UK
        varchar reference_no
        int product_id FK
        varchar transaction_type "STOCK_IN, SALE, RETURN, etc."
        int quantity
        int quantity_change
        int balance_before
        int balance_after
        decimal unit_cost
        timestamp created_at
    }

    inventory_transactions_lock {
        int id PK
        bigint transaction_id FK
        timestamp created_at
    }

    motorcycle_models {
        int id PK
        varchar brand
        varchar model
        varchar year_model
        varchar engine_displacement
    }

    product_compatibilities {
        int id PK
        int product_id FK
        int motorcycle_model_id FK
        enum compatibility_status "COMPATIBLE, CONDITIONAL"
    }

    compatibility_groups {
        int id PK
        varchar group_name UK
        text description
    }

    compatibility_group_units {
        int id PK
        int compatibility_group_id FK
        int motorcycle_unit_id FK
    }

    product_compatibility_groups {
        int id PK
        int product_id FK
        int compatibility_group_id FK
    }

    motorcycle_units {
        int id PK
        varchar brand
        varchar model
        varchar year_model
    }
```

### Key Database Design Principles:
1. **Multi-Modal Payment Architecture (`sales`)**:
   - `payment_method` accommodates `Cash`, `GCash`, `Card`, and **`Split`**.
   - Dedicated `cash_amount` and `gcash_amount` columns capture the exact dual-tender breakdown for split payments, ensuring accounting audits reconcile cash drawer balance and GCash wallet deposits.
2. **Immutable Inventory Ledger (`inventory_transactions`)**:
   - Protected against direct `UPDATE` and `DELETE` via MySQL database triggers (`trg_block_inventory_transactions_update`, `trg_block_inventory_transactions_delete`).
   - Protected against table truncation through foreign-key child table `inventory_transactions_lock`.
   - Guaranteed signed movement validation via SQL `CHECK` constraint: sales/losses require `quantity_change < 0`, receipts/additions require `quantity_change > 0`.
3. **Dual-Layer Compatibility Matrix**:
   - **Exact-Fit Compatibility**: Maps direct parts to exact motorcycle unit models (`product_compatibilities` & `motorcycle_models`).
   - **Platform-Level Compatibility**: Groups families of models sharing identical engine/chassis platforms (e.g. *Yamaha Aerox Platform*, *Honda Click Platform*) via `compatibility_groups` and `product_compatibility_groups`.
4. **Serialized Asset Control**:
   - Distinct individual units (e.g., ECUs, Batteries, Expensive Electronics) are tracked through `product_serials` and bound to sales invoices via `sale_item_serials` to protect against duplicate allocation or fraudulent warranty claims.
5. **Security & Cryptographic Isolation**:
   - `users.password` uses bcrypt (10 salt rounds) with live strength enforcement.
   - `users.token_version` is incremented on password changes to immediately revoke all existing JWTs across active browser sessions.
   - `password_otps` stores SHA-256 code hashes with a 10-minute expiry and a 5-attempt brute-force threshold.

---

## 2. Data Flow Diagrams (DFD)

### DFD Level 0: System Context Diagram

The Context Diagram outlines the high-level boundary of the **JLIN Motorparts Inventory & POS System** and interactions with all external entities.

```mermaid
flowchart TD
    %% Top Entities
    Admin["👤 Administrator / Owner"]
    Supplier["🏢 Parts Supplier"]

    %% Core System Center
    System(("<b>0.0</b><br/><b>JLIN Motorparts</b><br/><b>Inventory & POS System</b><br/><i>(Core Processing Hub)</i>"))

    %% Bottom Entities
    Staff["🧑‍💼 Cashier / Counter Staff"]
    Customer["👥 Walk-in Customer"]

    %% Invisible alignment
    Admin ~~~ Supplier
    Staff ~~~ Customer

    %% Styling
    classDef entity fill:#e0e7ff,stroke:#4338ca,stroke-width:2px,color:#1e1b4b,font-weight:bold;
    classDef system fill:#fef3c7,stroke:#d97706,stroke-width:3px,color:#78350f,font-weight:bold;

    class Admin,Supplier,Customer,Staff entity;
    class System system;

    %% Clear Dual-Flows
    Admin <-->|"1. User Accounts, Catalog Configuration & Stock Overrides<br/>2. Financial Analytics, Audit Ledger & Restock Alerts"| System
    Supplier <-->|"3. Supplier Invoices, Motorparts Supply & Serial Numbers<br/>4. Goods Receipt Acknowledgement & Purchase Verification"| System

    System <-->|"5. Staff Credentials, Barcode Scanning & Tender Info<br/>6. Real-time Inventory, Fitment Results & Shift Summary"| Staff
    System <-->|"7. Parts Inquiries, Motorcycle Model & Tender (Cash/GCash/Split)<br/>8. Compatible Parts Advice, Printed Thermal Receipt & Change Due"| Customer
```

---

### DFD Level 1: Process Decomposition Diagram

The Level 1 diagram breaks the system into its core operational processes, detailing interactions between external entities, business logic, persistent data stores, and analytical outputs across 4 structured layers.

```mermaid
flowchart TD
    %% Layer 1: External System Entities
    subgraph L1_Entities ["1. External System Entities"]
        Staff["🧑‍💼 Cashier / Counter Staff"]
        Supplier["🏢 Parts Supplier"]
        Customer["👥 Walk-in Customer"]
        Admin["👤 Administrator / Owner"]
    end

    %% Layer 2: Core Operational Business Processes
    subgraph L2_Processes ["2. Operational Business Processes (Level 1)"]
        P1["<b>1.0 User Authentication</b><br/>• Staff & Admin Login<br/>• Token & OTP Recovery"]
        P2["<b>2.0 Catalog & Fitment</b><br/>• Parts, Brands & Pricing<br/>• Model Compatibility Matrix"]
        P3["<b>3.0 Stock Receiving</b><br/>• Inflow PO Verification<br/>• Serial Enrollment"]
        P4["<b>4.0 POS Checkout</b><br/>• Multi-Tender Split<br/>• Void & Return to Cart"]
        P5["<b>5.0 Ledger & Audit</b><br/>• Immutable Movement Log<br/>• Physical Count Adjust"]
    end

    %% Layer 3: Persistent Relational Data Stores
    subgraph L3_Stores ["3. Persistent Data Stores (MySQL 8)"]
        D1[("<b>D1: Users & Auth</b><br/>Credentials & OTPs")]
        D2[("<b>D2: Catalog & Matrix</b><br/>Products & Bike Fitment")]
        D3[("<b>D3: Inflow Records</b><br/>Supplier Receipts & POs")]
        D4[("<b>D4: Sales Records</b><br/>Receipts, Tender & Serials")]
        D5[("<b>D5: Immutable Ledger</b><br/>Audit Trails & Balances")]
    end

    %% Layer 4: Analytics & System Outputs
    subgraph L4_Reporting ["4. Analytics, Auditing & Output Generation"]
        P6["<b>6.0 Analytics & Reporting Engine</b><br/>• Daily Sales & Revenue Breakdown<br/>• Fast / Slow Moving Parts Analytics<br/>• Cashier Reconciliation & Low-Stock Alerts"]
        Outputs["📊 Official Thermal Receipts & Business Dashboards"]
    end

    %% Layer 1 -> Layer 2 Flows
    Staff -->|"Login Credentials"| P1
    Staff -->|"Query Part & Fitment"| P2
    Staff -->|"Input Delivery Items"| P3
    Staff -->|"Tender Order & Void Cart"| P4

    Supplier -->|"Shipments & Invoices"| P3

    Customer -->|"Orders & Payment (Cash/GCash)"| P4

    Admin -->|"Credentials & Roles"| P1
    Admin -->|"Manage Products & Groups"| P2
    Admin -->|"Discrepancy Count"| P5

    %% Layer 2 -> Layer 3 Flows
    P1 -->|"Authenticate & Verify OTP"| D1
    P2 -->|"Catalog CRUD & Sync"| D2

    P3 -->|"Save Inflow Record"| D3
    P3 -->|"Increment Stock & Serials"| D2
    P3 -->|"Append STOCK_IN Movement"| D5

    P4 -->|"Deduct Stock & Serials"| D2
    P4 -->|"Insert Sale & Split Breakdown"| D4
    P4 -->|"Append SALE / RETURN Movement"| D5

    P5 -->|"Sync Actual Count"| D2
    P5 -->|"Append ADJUSTMENT Record"| D5

    %% Layer 3 -> Layer 4 Flows
    D4 -->|"Sales Data"| P6
    D5 -->|"Ledger History"| P6
    D2 -->|"Current Stock Levels"| P6

    P4 -->|"Printed Thermal Receipt"| Outputs
    P6 -->|"Exported Business & Restock Reports"| Outputs

    %% Styling
    classDef entity fill:#e0e7ff,stroke:#4338ca,stroke-width:2px,color:#1e1b4b,font-weight:bold;
    classDef proc fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,color:#14532d,font-weight:bold;
    classDef store fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f,font-weight:bold;
    classDef output fill:#fdf2f8,stroke:#db2777,stroke-width:2px,color:#831843,font-weight:bold;

    class Staff,Supplier,Customer,Admin entity;
    class P1,P2,P3,P4,P5,P6 proc;
    class D1,D2,D3,D4,D5 store;
    class Outputs output;
```

---

## 3. System Architecture Diagram

The system follows a modern **3-Tier Web Architecture** built for cloud-native deployment with strict HTTPS, zero-trust backend authorization, and managed database high availability.

```mermaid
flowchart TD
    subgraph Tier1 ["Tier 1: Presentation Layer (Vercel Edge CDN)"]
        Browser["🖥️ Staff / Admin Browser Client"]
        VercelCDN["🌐 Vercel Global Edge Network\n(https://jlin-motorparts.vercel.app)"]
        ReactApp["⚛️ React 19 SPA (Vite Bundler)\n• React Router 7 Declarative Navigation\n• Modern Glassmorphic UI & Dark/Light Theme\n• Native 58mm/80mm Thermal Receipt Generator\n• Real-time POS Cart with Split Payment Modal\n• Consolidated Account & Security Hub (/profile)"]
    end

    subgraph Tier2 ["Tier 2: Application / API Layer (Render Cloud PaaS)"]
        RenderService["⚙️ Render Web Service\n(https://jlin-motorparts.onrender.com)"]
        ExpressApp["⚡ Node.js 24 + Express 5 REST API\n• Helmet Security Headers (CSP & HSTS)\n• Strict CORS Origin & Rate Limit Protection\n• JWT Bearer Token Verification & Token Revocation\n• Express-Validator & Zod Payload Schemas\n• Automated Schema Migration (ensureSchema.js)"]
        
        subgraph Tier2_Modules ["Core Application Engine Modules"]
            AuthModule["🔐 Auth & Recovery Controller\n• Bcrypt 10-Round Hasher\n• 6-Digit Crypto OTPs\n• JWT Token Dispatcher"]
            InventoryModule["📦 Inventory & Fitment Service\n• Atomic Transaction Engine\n• Canonical Product Sync\n• Reorder Level Evaluator"]
            POSModule["🛒 POS Checkout Engine\n• Split Payment (Cash + GCash)\n• Serial Number Guard\n• Void & Re-open Cart Engine"]
        end
    end

    subgraph External_Services ["External Communications Gateway"]
        ResendAPI["📧 Resend Cloud Email API (HTTPS REST Port 443)\n• Bypasses Cloud Platform SMTP Egress Blocks\n• Dispatches 6-Digit Verification Codes & OTPs"]
    end

    subgraph Tier3 ["Tier 3: Persistence Layer (Aiven Cloud Database)"]
        ConnectionPool["🔌 mysql2 Connection Pool\n• Promise-based Execution & Auto-reconnect\n• UTC / Philippine Time (+08:00) Timezone Alignment"]
        AivenDB[("🗄️ Aiven Cloud MySQL 8 Cluster\n• TLS/SSL Enforced (aiven-ca.pem Root CA)\n• InnoDB ACID Transactions & Row-Level Locking\n• Foreign Key Cascade Integrity")]
        Triggers["🛡️ Database Engine Triggers & Audit Guards\n• trg_sync_products_insert / update\n• trg_block_inventory_transactions_update\n• trg_block_inventory_transactions_delete\n• inventory_transactions_lock Immutability Anchor"]
    end

    %% Flow Connections
    Browser <-->|"HTTPS / TLS 1.3"| VercelCDN
    VercelCDN <-->|"Delivers Static Bundles"| ReactApp
    ReactApp <-->|"REST API Requests (JSON with JWT Token)"| RenderService
    RenderService <-->|"Express Routing & Middlewares"| ExpressApp

    ExpressApp --> AuthModule
    ExpressApp --> InventoryModule
    ExpressApp --> POSModule

    AuthModule <-->|"HTTPS POST /emails (Port 443)"| ResendAPI

    ExpressApp <--> ConnectionPool
    ConnectionPool <-->|"Encrypted MySQL Protocol (SSL CA)"| AivenDB
    AivenDB --> Triggers

    %% Styling
    classDef t1 fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;
    classDef t2 fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,color:#14532d;
    classDef t3 fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
    classDef ext fill:#fdf2f8,stroke:#db2777,stroke-width:2px,color:#831843;

    class Tier1,Browser,VercelCDN,ReactApp t1;
    class Tier2,RenderService,ExpressApp,AuthModule,InventoryModule,POSModule t2;
    class Tier3,ConnectionPool,AivenDB,Triggers t3;
    class External_Services,ResendAPI ext;
```

---

## 4. Architectural Quality Attributes & Defense Readiness

| Quality Attribute | Architectural Implementation | Verification Method |
|---|---|---|
| **Multi-Tender Flexibility** | Split Payment engine allows splitting bills across Cash and GCash with live balance tracking, change calculation, and database tracking of `cash_amount` and `gcash_amount`. | Verified on POS checkout with automated invariant testing: `cash + gcash >= total`. |
| **Data Integrity** | Database-level triggers prevent ledger modification; `SELECT ... FOR UPDATE` row locking prevents concurrent double-spend of serial numbers. | Trigger rejection unit tests & concurrent checkout test scenarios. |
| **Authentication & Access** | JWT authentication with dual-role RBAC (`admin` vs. `staff`). Immediate multi-device invalidation through `users.token_version`. Live password checklist enforces strong credentials. | Automated OTP test suite & password strength validation. |
| **Email Resilience** | Outbound OTP emails use the Resend HTTPS REST API over port 443, eliminating SMTP timeout blocks (`ETIMEDOUT`) enforced by cloud hosting firewalls. | Live delivery verification to Gmail in 1.2s. |
| **Fault Tolerance & Zero Downtime** | Auto-migration scripts ([`backend/utils/ensureSchema.js`](file:///c:/Inventory/backend/utils/ensureSchema.js) & schema patches) add missing tables and columns on server boot without manual SQL execution. | Automated deployment boot verification. |
| **Navigation & Ergonomics** | Strict `end` route matching on sidebar navigation prevents multi-link active states (e.g. Sales Reports vs Discrepancy Audit). Fitment Search and Compatibility Rules consolidated into Account & Security (`/profile`). | UI visual audit on Desktop & Mobile viewports. |
| **Cart Preservation & Void Re-open** | POS payment modal supports closing via `Esc` key, background backdrop click, or "← Back to Cart" button without losing cart items. Completed sales can be immediately reversed via "↩ Void & Return to Cart" on the receipt modal, restoring stock and repopulating cart. | Interactive modal state lifecycle verification & database stock recovery test. |
