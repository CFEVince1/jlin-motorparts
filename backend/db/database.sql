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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. PRODUCTS (Flattened, no more variants)
-- ==========================================
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    part_number VARCHAR(100) NOT NULL,
    name VARCHAR(150) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    size VARCHAR(50) NOT NULL,
    measurement VARCHAR(100),
    thread_type VARCHAR(50),
    cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock INT NOT NULL DEFAULT 0,
    reorder_level INT NOT NULL DEFAULT 5,
    is_serialized BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- For soft deletes instead of deleting sales history
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_part_brand (part_number, brand),
    INDEX idx_part_number (part_number),
    INDEX idx_brand (brand),
    INDEX idx_name (name),
    INDEX idx_size (size)
);

-- ==========================================
-- 3. MOTORCYCLE UNITS
-- Source list for motorcycle compatibility
-- ==========================================
CREATE TABLE motorcycle_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year_model VARCHAR(20),
    UNIQUE KEY unique_motorcycle_unit (brand, model, year_model),
    INDEX idx_model (model)
);

-- ==========================================
-- 4. PRODUCT COMPATIBILITY
-- Maps one product to all motorcycle units it fits
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

-- ==========================================
-- 4.1 COMPATIBILITY GROUPS
-- Represents platforms or engine families
-- ==========================================
CREATE TABLE compatibility_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    INDEX idx_group_name (group_name)
);

-- ==========================================
-- 4.2 COMPATIBILITY GROUP UNITS
-- Maps a platform to many motorcycle units
-- ==========================================
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

-- ==========================================
-- 4.3 PRODUCT COMPATIBILITY GROUPS
-- Maps a product to platforms
-- ==========================================
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
-- Only populated if products.is_serialized = TRUE
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
-- 6. SALES (POS Transactions)
-- Immutable. Connected to the user who processed it.
-- ==========================================
CREATE TABLE sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    tendered_amount DECIMAL(10,2) NOT NULL,
    change_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payment_method ENUM('Cash', 'GCash', 'Card') NOT NULL DEFAULT 'Cash',
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 7. SALE ITEMS
-- Snapshot of the product price and quantity at time of sale
-- ==========================================
CREATE TABLE sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    part_number VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    size VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL, -- Stored here so historical sales don't change if product price changes later
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ==========================================
-- 8. SALE ITEM SERIALS
-- Maps the exact serial numbers sold in a specific transaction
-- ==========================================
CREATE TABLE sale_item_serials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_item_id INT NOT NULL,
    serial_id INT NOT NULL,
    UNIQUE (serial_id),
    FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
    FOREIGN KEY (serial_id) REFERENCES product_serials(id)
);

-- ==========================================
-- 9. SAMPLE MOTORCYCLE PARTS DATA
-- Used for development, testing, and panel demonstrations
-- ==========================================
INSERT INTO motorcycle_units (brand, model, year_model) VALUES
    ('Yamaha', 'Mio i125', '2023'),
    ('Suzuki', 'Raider FI', '2022'),
    ('Honda', 'Click 125', NULL),
    ('Honda', 'XRM', NULL);

INSERT INTO products (
    part_number,
    name,
    brand,
    category,
    size,
    measurement,
    thread_type,
    cost_price,
    selling_price,
    stock,
    reorder_level,
    is_serialized
) VALUES
    ('BLT-M8-001', 'Bolt M8', 'JRP', 'Bolts', 'M8 x 20mm', '8mm x 20mm', 'M8', 8.00, 15.00, 50, 10, FALSE),
    ('SP-001', 'Spark Plug', 'NGK', 'Ignition', 'Standard', 'Standard motorcycle spark plug', NULL, 75.00, 120.00, 30, 8, FALSE),
    ('ECU-RAIDER-01', 'ECU', 'Suzuki', 'Electrical', 'Raider FI ECU', 'Raider FI compatible ECU', NULL, 1500.00, 2500.00, 3, 1, TRUE);

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

