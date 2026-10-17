-- ⚠️ WARNING: THIS WILL WIPE THE EXISTING DATABASE 
-- Do not run this on production if you need to keep old data!
DROP DATABASE IF EXISTS jlin_inventory_db;
CREATE DATABASE jlin_inventory_db;
USE jlin_inventory_db;

-- ==========================================
-- 1. USERS
-- Strictly limited to 'admin' and 'staff'
-- ==========================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
    token_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. PRODUCTS
-- Canonical product catalog with stock & current_stock synchronization
-- ==========================================
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    part_number VARCHAR(100) NOT NULL,
    sku VARCHAR(100) DEFAULT NULL,
    name VARCHAR(150) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    size VARCHAR(50) NOT NULL,
    measurement VARCHAR(100),
    thread_type VARCHAR(50),
    cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    retail_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock INT NOT NULL DEFAULT 0,
    current_stock INT NOT NULL DEFAULT 0,
    reorder_level INT NOT NULL DEFAULT 5,
    is_serialized BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_part_brand (part_number, brand),
    INDEX idx_part_number (part_number),
    INDEX idx_sku (sku),
    INDEX idx_brand (brand),
    INDEX idx_name (name),
    INDEX idx_size (size)
);

-- ==========================================
-- 3. MOTORCYCLE UNITS & MODELS
-- Compatibility catalog
-- ==========================================
CREATE TABLE motorcycle_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year_model VARCHAR(20),
    UNIQUE KEY unique_motorcycle_unit (brand, model, year_model),
    INDEX idx_model (model)
);

CREATE TABLE motorcycle_models (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year_start INT DEFAULT NULL,
    year_end INT DEFAULT NULL,
    year_model VARCHAR(50) DEFAULT NULL,
    engine_displacement VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_motorcycle_model (brand, model, year_model),
    INDEX idx_model_brand (brand),
    INDEX idx_model_name (model)
);

-- ==========================================
-- 4. PRODUCT COMPATIBILITY
-- Direct unit mapping & hierarchical model mapping
-- ==========================================
CREATE TABLE product_compatibility (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    motorcycle_unit_id INT NOT NULL,
    UNIQUE KEY unique_product_motorcycle (product_id, motorcycle_unit_id),
    INDEX idx_product_motorcycle (product_id, motorcycle_unit_id),
    INDEX idx_product_id (product_id),
    INDEX idx_motorcycle_id (motorcycle_unit_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (motorcycle_unit_id) REFERENCES motorcycle_units(id) ON DELETE CASCADE
);

CREATE TABLE product_compatibilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    motorcycle_model_id INT NOT NULL,
    compatibility_status ENUM('COMPATIBLE', 'NOT_COMPATIBLE', 'CONDITIONAL') NOT NULL DEFAULT 'COMPATIBLE',
    notes VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_prod_compat (product_id, motorcycle_model_id),
    INDEX idx_compat_product (product_id),
    INDEX idx_compat_model (motorcycle_model_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (motorcycle_model_id) REFERENCES motorcycle_models(id) ON DELETE CASCADE
);

-- ==========================================
-- 4.1 COMPATIBILITY GROUPS (Platforms / Engines)
-- ==========================================
CREATE TABLE compatibility_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    INDEX idx_group_name (group_name)
);

CREATE TABLE compatibility_group_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    compatibility_group_id INT NOT NULL,
    motorcycle_unit_id INT NOT NULL,
    UNIQUE KEY unique_group_unit (compatibility_group_id, motorcycle_unit_id),
    INDEX idx_group_unit_group (compatibility_group_id),
    INDEX idx_group_unit_motorcycle (motorcycle_unit_id),
    FOREIGN KEY (compatibility_group_id) REFERENCES compatibility_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (motorcycle_unit_id) REFERENCES motorcycle_units(id) ON DELETE CASCADE
);

CREATE TABLE product_compatibility_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    compatibility_group_id INT NOT NULL,
    UNIQUE KEY unique_product_group (product_id, compatibility_group_id),
    INDEX idx_product_group_product (product_id),
    INDEX idx_product_group_group (compatibility_group_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (compatibility_group_id) REFERENCES compatibility_groups(id) ON DELETE CASCADE
);

-- ==========================================
-- 5. PRODUCT SERIALS
-- ==========================================
CREATE TABLE product_serials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    status ENUM('available', 'sold') NOT NULL DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ==========================================
-- 6. SUPPLIERS & RECEIVING RECORDS (Purchases / Stock In)
-- ==========================================
CREATE TABLE suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    contact_person VARCHAR(100) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    phone VARCHAR(50) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_supplier_name (name),
    INDEX idx_supplier_active (is_active)
);

CREATE TABLE receiving_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    reference_number VARCHAR(100) NOT NULL,
    reference_no VARCHAR(100) DEFAULT NULL,
    received_by INT DEFAULT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status ENUM('draft', 'received', 'cancelled') NOT NULL DEFAULT 'received',
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_supplier_ref (supplier_id, reference_no),
    INDEX idx_rec_ref (reference_number),
    INDEX idx_rec_supplier (supplier_id),
    INDEX idx_rec_date (received_at),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE TABLE receiving_record_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receiving_record_id INT NOT NULL,
    product_id INT NOT NULL,
    item_id INT DEFAULT NULL,
    quantity INT NOT NULL,
    cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rec_item_rec (receiving_record_id),
    INDEX idx_rec_item_prod (product_id),
    FOREIGN KEY (receiving_record_id) REFERENCES receiving_records(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ==========================================
-- 7. SALES (POS Transactions)
-- ==========================================
CREATE TABLE sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    tendered_amount DECIMAL(10,2) NOT NULL,
    change_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payment_method ENUM('Cash', 'GCash', 'Card') NOT NULL DEFAULT 'Cash',
    order_number VARCHAR(100) DEFAULT NULL,
    payment_reference VARCHAR(100) DEFAULT NULL,
    payment_provider VARCHAR(50) DEFAULT NULL,
    payment_status VARCHAR(50) DEFAULT 'paid',
    subtotal_amount DECIMAL(10,2) DEFAULT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    card_type VARCHAR(50) DEFAULT NULL,
    card_last4 VARCHAR(4) DEFAULT NULL,
    paid_at TIMESTAMP NULL DEFAULT NULL,
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY uq_sales_payment_reference (payment_reference)
);

CREATE TABLE sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    part_number VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    size VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE sale_item_serials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_item_id INT NOT NULL,
    serial_id INT NOT NULL,
    UNIQUE (serial_id),
    FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
    FOREIGN KEY (serial_id) REFERENCES product_serials(id)
);

-- ==========================================
-- 8. INVENTORY TRANSACTIONS (Append-only Ledger)
-- ==========================================
CREATE TABLE inventory_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_number VARCHAR(100) UNIQUE NOT NULL,
    reference_no VARCHAR(100) DEFAULT NULL,
    product_id INT NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    quantity_change INT NOT NULL DEFAULT 0,
    balance_before INT NOT NULL DEFAULT 0,
    balance_after INT NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2) DEFAULT NULL,
    reference_type VARCHAR(50) DEFAULT NULL,
    reference_id INT DEFAULT NULL,
    loss_transaction_id BIGINT DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    remarks TEXT DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_it_product (product_id),
    INDEX idx_it_type (transaction_type),
    INDEX idx_it_created (created_at),
    INDEX idx_it_ref (reference_type, reference_id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_it_quantity_change_sign CHECK (
        (transaction_type IN ('STOCK_OUT', 'SALE', 'DAMAGE', 'LOSS', 'RETURN_TO_SUPPLIER', 'ADJUSTMENT_SUB') AND quantity_change < 0)
        OR
        (transaction_type IN ('STOCK_IN', 'PURCHASE_RECEIPT', 'FOUND', 'RETURN', 'ADJUSTMENT_ADD') AND quantity_change > 0)
        OR
        (transaction_type = 'OPENING_BALANCE' AND quantity_change >= 0)
    )
);

-- Sentinel table to block TRUNCATE via foreign key reference
CREATE TABLE inventory_transactions_lock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id BIGINT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inv_tx_lock FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id)
);

-- ==========================================
-- 9. TRIGGERS
-- ==========================================
DELIMITER ;;

-- Sync products stock and current_stock, sku and part_number, retail_price and selling_price
CREATE TRIGGER trg_sync_products_insert
BEFORE INSERT ON products
FOR EACH ROW
BEGIN
    IF NEW.sku IS NULL OR NEW.sku = '' THEN
        SET NEW.sku = NEW.part_number;
    END IF;
    IF NEW.part_number IS NULL OR NEW.part_number = '' THEN
        SET NEW.part_number = NEW.sku;
    END IF;
    IF NEW.current_stock IS NULL OR (NEW.current_stock = 0 AND NEW.stock IS NOT NULL AND NEW.stock != 0) THEN
        SET NEW.current_stock = COALESCE(NEW.stock, 0);
    ELSEIF NEW.stock IS NULL OR (NEW.stock = 0 AND NEW.current_stock IS NOT NULL AND NEW.current_stock != 0) THEN
        SET NEW.stock = COALESCE(NEW.current_stock, 0);
    END IF;
    IF NEW.retail_price IS NULL OR NEW.retail_price = 0 THEN
        SET NEW.retail_price = COALESCE(NEW.selling_price, 0.00);
    END IF;
    IF NEW.selling_price IS NULL OR NEW.selling_price = 0 THEN
        SET NEW.selling_price = COALESCE(NEW.retail_price, 0.00);
    END IF;
END;;

CREATE TRIGGER trg_sync_products_update
BEFORE UPDATE ON products
FOR EACH ROW
BEGIN
    IF NEW.current_stock != OLD.current_stock AND NEW.stock = OLD.stock THEN
        SET NEW.stock = NEW.current_stock;
    ELSEIF NEW.stock != OLD.stock AND NEW.current_stock = OLD.current_stock THEN
        SET NEW.current_stock = NEW.stock;
    END IF;

    IF NEW.sku != OLD.sku AND (NEW.part_number = OLD.part_number OR NEW.part_number IS NULL) THEN
        SET NEW.part_number = NEW.sku;
    ELSEIF NEW.part_number != OLD.part_number AND (NEW.sku = OLD.sku OR NEW.sku IS NULL) THEN
        SET NEW.sku = NEW.part_number;
    END IF;

    IF NEW.retail_price != OLD.retail_price AND NEW.selling_price = OLD.selling_price THEN
        SET NEW.selling_price = NEW.retail_price;
    ELSEIF NEW.selling_price != OLD.selling_price AND NEW.retail_price = OLD.retail_price THEN
        SET NEW.retail_price = NEW.selling_price;
    END IF;
END;;

-- Immutable Ledger Protection
CREATE TRIGGER trg_block_inventory_transactions_update
BEFORE UPDATE ON inventory_transactions
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Forbidden: inventory_transactions is an immutable append-only ledger and cannot be modified.';
END;;

CREATE TRIGGER trg_block_inventory_transactions_delete
BEFORE DELETE ON inventory_transactions
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Forbidden: inventory_transactions is an immutable append-only ledger and cannot be deleted.';
END;;

DELIMITER ;

-- ==========================================
-- 10. COMPATIBILITY VIEW: items
-- ==========================================
CREATE OR REPLACE VIEW items AS
SELECT 
    id,
    id AS item_id,
    COALESCE(sku, part_number) AS sku,
    part_number,
    name,
    brand,
    category,
    size,
    measurement,
    thread_type,
    cost_price,
    COALESCE(retail_price, selling_price) AS retail_price,
    selling_price,
    COALESCE(current_stock, stock) AS current_stock,
    stock,
    reorder_level,
    is_serialized,
    is_active,
    created_at,
    updated_at
FROM products;

-- ==========================================
-- 11. SAMPLE DATA (For Development & Demonstration)
-- ==========================================
INSERT INTO motorcycle_units (brand, model, year_model) VALUES
    ('Yamaha', 'Mio i125', '2023'),
    ('Suzuki', 'Raider FI', '2022'),
    ('Honda', 'Click 125', NULL),
    ('Honda', 'XRM', NULL);

INSERT INTO products (
    part_number, sku, name, brand, category, size, measurement, thread_type,
    cost_price, selling_price, retail_price, stock, current_stock, reorder_level, is_serialized
) VALUES
    ('BLT-M8-001', 'BLT-M8-001', 'Bolt M8', 'JRP', 'Bolts', 'M8 x 20mm', '8mm x 20mm', 'M8', 8.00, 15.00, 15.00, 50, 50, 10, FALSE),
    ('SP-001', 'SP-001', 'Spark Plug', 'NGK', 'Ignition', 'Standard', 'Standard motorcycle spark plug', NULL, 75.00, 120.00, 120.00, 30, 30, 8, FALSE),
    ('ECU-RAIDER-01', 'ECU-RAIDER-01', 'ECU', 'Suzuki', 'Electrical', 'Raider FI ECU', 'Raider FI compatible ECU', NULL, 1500.00, 2500.00, 2500.00, 3, 3, 1, TRUE);

INSERT INTO product_compatibility (product_id, motorcycle_unit_id)
SELECT p.id, m.id
FROM products p
JOIN motorcycle_units m ON m.brand = 'Suzuki' AND m.model = 'Raider FI' AND m.year_model = '2022'
WHERE p.part_number = 'BLT-M8-001' AND p.brand = 'JRP';

INSERT INTO product_compatibility (product_id, motorcycle_unit_id)
SELECT p.id, m.id
FROM products p
JOIN motorcycle_units m ON (
    (m.brand = 'Yamaha' AND m.model = 'Mio i125' AND m.year_model = '2023')
    OR (m.brand = 'Honda' AND m.model = 'Click 125' AND m.year_model IS NULL)
)
WHERE p.part_number = 'SP-001' AND p.brand = 'NGK';

INSERT INTO product_compatibility (product_id, motorcycle_unit_id)
SELECT p.id, m.id
FROM products p
JOIN motorcycle_units m ON m.brand = 'Suzuki' AND m.model = 'Raider FI' AND m.year_model = '2022'
WHERE p.part_number = 'ECU-RAIDER-01' AND p.brand = 'Suzuki';

INSERT INTO product_serials (product_id, serial_number, status)
SELECT p.id, serials.serial_number, 'available'
FROM products p
JOIN (
    SELECT 'ECU001' AS serial_number
    UNION ALL SELECT 'ECU002'
    UNION ALL SELECT 'ECU003'
) serials
WHERE p.part_number = 'ECU-RAIDER-01' AND p.brand = 'Suzuki';

INSERT INTO compatibility_groups (group_name, description) VALUES
    ('Yamaha Mio Platform', 'Shared parts for Yamaha Mio series'),
    ('Honda Click Platform', 'Shared parts for Honda Click series'),
    ('Suzuki Raider Platform', 'Shared parts for Suzuki Raider series');

INSERT INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
SELECT cg.id, mu.id FROM compatibility_groups cg, motorcycle_units mu
WHERE cg.group_name = 'Yamaha Mio Platform' AND mu.brand = 'Yamaha' AND mu.model = 'Mio i125';

INSERT INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
SELECT cg.id, mu.id FROM compatibility_groups cg, motorcycle_units mu
WHERE cg.group_name = 'Honda Click Platform' AND mu.brand = 'Honda' AND mu.model = 'Click 125';

INSERT INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id)
SELECT cg.id, mu.id FROM compatibility_groups cg, motorcycle_units mu
WHERE cg.group_name = 'Suzuki Raider Platform' AND mu.brand = 'Suzuki' AND mu.model = 'Raider FI';
