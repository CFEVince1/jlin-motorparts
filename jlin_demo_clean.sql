-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: jlin_inventory_db
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `jlin_inventory_db`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `jlin_inventory_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;

USE `jlin_inventory_db`;

--
-- Sequence structure for `sales_order_seq`
--

DROP SEQUENCE IF EXISTS `sales_order_seq`;
CREATE SEQUENCE `sales_order_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 1 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`sales_order_seq`, 1001, 0);

--
-- Table structure for table `compatibility_group_units`
--

DROP TABLE IF EXISTS `compatibility_group_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `compatibility_group_units` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `compatibility_group_id` int(11) NOT NULL,
  `motorcycle_unit_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_unit` (`compatibility_group_id`,`motorcycle_unit_id`),
  KEY `idx_group_unit_group` (`compatibility_group_id`),
  KEY `idx_group_unit_motorcycle` (`motorcycle_unit_id`),
  CONSTRAINT `compatibility_group_units_ibfk_1` FOREIGN KEY (`compatibility_group_id`) REFERENCES `compatibility_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compatibility_group_units_ibfk_2` FOREIGN KEY (`motorcycle_unit_id`) REFERENCES `motorcycle_units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compatibility_group_units`
--

LOCK TABLES `compatibility_group_units` WRITE;
/*!40000 ALTER TABLE `compatibility_group_units` DISABLE KEYS */;
INSERT INTO `compatibility_group_units` VALUES (1,1,1),(2,2,3),(3,3,2),(4,4,2);
/*!40000 ALTER TABLE `compatibility_group_units` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `compatibility_groups`
--

DROP TABLE IF EXISTS `compatibility_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `compatibility_groups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `group_name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `group_name` (`group_name`),
  KEY `idx_group_name` (`group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compatibility_groups`
--

LOCK TABLES `compatibility_groups` WRITE;
/*!40000 ALTER TABLE `compatibility_groups` DISABLE KEYS */;
INSERT INTO `compatibility_groups` VALUES (1,'Yamaha Mio Platform','Shared parts for Yamaha Mio series'),(2,'Honda Click Platform','Shared parts for Honda Click series'),(3,'Suzuki Raider Platform','Shared parts for Suzuki Raider series'),(4,'suzuki','for raider and skydrive'),(7,'yamaha','for raider and mio');
/*!40000 ALTER TABLE `compatibility_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_transactions`
--

DROP TABLE IF EXISTS `inventory_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_transactions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `transaction_number` varchar(100) NOT NULL,
  `reference_no` varchar(100) DEFAULT NULL,
  `product_id` int(11) NOT NULL,
  `transaction_type` varchar(50) NOT NULL,
  `quantity` int(11) NOT NULL,
  `quantity_change` int(11) DEFAULT 0,
  `balance_before` int(11) NOT NULL DEFAULT 0,
  `balance_after` int(11) NOT NULL DEFAULT 0,
  `unit_cost` decimal(10,2) DEFAULT NULL,
  `reference_type` varchar(50) DEFAULT NULL,
  `reference_id` int(11) DEFAULT NULL,
  `loss_transaction_id` bigint(20) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `transaction_number` (`transaction_number`),
  KEY `idx_it_product` (`product_id`),
  KEY `idx_it_type` (`transaction_type`),
  KEY `idx_it_created` (`created_at`),
  KEY `idx_it_ref` (`reference_type`,`reference_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `inventory_transactions_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `inventory_transactions_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_transactions`
--

LOCK TABLES `inventory_transactions` WRITE;
/*!40000 ALTER TABLE `inventory_transactions` DISABLE KEYS */;
INSERT INTO `inventory_transactions` VALUES (1,'TX-OPB-0001-717401',NULL,1,'OPENING_BALANCE',161,0,0,161,8.00,'OPENING_BALANCE',1,NULL,'Baseline OPENING_BALANCE for pre-existing product: Bolt M8 (BLT-M8-001)',NULL,1,'2026-10-07 14:51:57'),(2,'TX-OPB-0002-717405',NULL,2,'OPENING_BALANCE',29,0,0,29,75.00,'OPENING_BALANCE',2,NULL,'Baseline OPENING_BALANCE for pre-existing product: Spark Plug (SP-001)',NULL,1,'2026-10-07 14:51:57'),(3,'TX-OPB-0003-717408',NULL,3,'OPENING_BALANCE',1,0,0,1,1500.00,'OPENING_BALANCE',3,NULL,'Baseline OPENING_BALANCE for pre-existing product: ECU (ECU-RAIDER-01)',NULL,1,'2026-10-07 14:51:57'),(4,'TX-OPB-0004-717417',NULL,4,'OPENING_BALANCE',46,0,0,46,6500.00,'OPENING_BALANCE',4,NULL,'Baseline OPENING_BALANCE for pre-existing product: block (0A123D21)',NULL,1,'2026-10-07 14:51:57'),(5,'TX-OPENING-20261007-JLR-BP-AEROX','OPENING-20261007',5,'OPENING_BALANCE',0,0,0,0,250.00,'OPENING_BALANCE',5,NULL,'Baseline OPENING_BALANCE for defense demo item JLR-BP-AEROX (reference: OPENING-20261007)',NULL,1,'2026-10-07 14:56:23'),(6,'TX-OPENING-20261007-JLR-OF-AEROX','OPENING-20261007',6,'OPENING_BALANCE',0,0,0,0,120.00,'OPENING_BALANCE',6,NULL,'Baseline OPENING_BALANCE for defense demo item JLR-OF-AEROX (reference: OPENING-20261007)',NULL,1,'2026-10-07 14:56:23');
/*!40000 ALTER TABLE `inventory_transactions` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_block_inventory_transactions_update
            BEFORE UPDATE ON inventory_transactions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Forbidden: inventory_transactions is an immutable append-only ledger and cannot be modified.';
            END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_block_inventory_transactions_delete
            BEFORE DELETE ON inventory_transactions
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Forbidden: inventory_transactions is an immutable append-only ledger and cannot be deleted.';
            END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `inventory_transactions_lock`
--

DROP TABLE IF EXISTS `inventory_transactions_lock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_transactions_lock` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `transaction_id` bigint(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_inv_tx_lock` (`transaction_id`),
  CONSTRAINT `fk_inv_tx_lock` FOREIGN KEY (`transaction_id`) REFERENCES `inventory_transactions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_transactions_lock`
--

LOCK TABLES `inventory_transactions_lock` WRITE;
/*!40000 ALTER TABLE `inventory_transactions_lock` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_transactions_lock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary table structure for view `items`
--

DROP TABLE IF EXISTS `items`;
/*!50001 DROP VIEW IF EXISTS `items`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `items` AS SELECT
 1 AS `id`,
  1 AS `item_id`,
  1 AS `sku`,
  1 AS `part_number`,
  1 AS `name`,
  1 AS `brand`,
  1 AS `category`,
  1 AS `size`,
  1 AS `measurement`,
  1 AS `thread_type`,
  1 AS `cost_price`,
  1 AS `retail_price`,
  1 AS `selling_price`,
  1 AS `current_stock`,
  1 AS `stock`,
  1 AS `reorder_level`,
  1 AS `is_serialized`,
  1 AS `is_active`,
  1 AS `created_at`,
  1 AS `updated_at` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `motorcycle_models`
--

DROP TABLE IF EXISTS `motorcycle_models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `motorcycle_models` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `brand` varchar(100) NOT NULL,
  `model` varchar(100) NOT NULL,
  `year_start` int(11) DEFAULT NULL,
  `year_end` int(11) DEFAULT NULL,
  `year_model` varchar(50) DEFAULT NULL,
  `engine_displacement` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_motorcycle_model` (`brand`,`model`,`year_model`),
  KEY `idx_model_brand` (`brand`),
  KEY `idx_model_name` (`model`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `motorcycle_models`
--

LOCK TABLES `motorcycle_models` WRITE;
/*!40000 ALTER TABLE `motorcycle_models` DISABLE KEYS */;
INSERT INTO `motorcycle_models` VALUES (1,'Honda','Click 125',NULL,NULL,NULL,NULL,'2026-10-07 14:50:36','2026-10-07 14:50:36'),(2,'honda','click 125',NULL,NULL,'2025',NULL,'2026-10-07 14:50:36','2026-10-07 14:50:36'),(3,'honda','wave 125',NULL,NULL,'2024',NULL,'2026-10-07 14:50:36','2026-10-07 14:50:36'),(4,'Honda','XRM',NULL,NULL,NULL,NULL,'2026-10-07 14:50:36','2026-10-07 14:50:36'),(5,'susuki','wampipti',NULL,NULL,'2026',NULL,'2026-10-07 14:50:36','2026-10-07 14:50:36'),(6,'suzuki','raider',NULL,NULL,'2012',NULL,'2026-10-07 14:50:36','2026-10-07 14:50:36'),(7,'Suzuki','Raider FI',NULL,NULL,'2022',NULL,'2026-10-07 14:50:36','2026-10-07 14:50:36'),(8,'Yamaha','Mio i125',NULL,NULL,'2023',NULL,'2026-10-07 14:50:36','2026-10-07 14:50:36'),(16,'Honda','Click 125',NULL,NULL,NULL,NULL,'2026-10-07 14:51:56','2026-10-07 14:51:56'),(17,'Honda','XRM',NULL,NULL,NULL,NULL,'2026-10-07 14:51:56','2026-10-07 14:51:56'),(19,'Honda','Click 125',NULL,NULL,NULL,NULL,'2026-10-07 14:52:03','2026-10-07 14:52:03'),(20,'Honda','XRM',NULL,NULL,NULL,NULL,'2026-10-07 14:52:03','2026-10-07 14:52:03'),(22,'Honda','Click 125',NULL,NULL,NULL,NULL,'2026-10-07 14:52:15','2026-10-07 14:52:15'),(23,'Honda','XRM',NULL,NULL,NULL,NULL,'2026-10-07 14:52:15','2026-10-07 14:52:15'),(25,'Yamaha','Aerox 155 V1',NULL,NULL,'V1',NULL,'2026-10-07 14:56:03','2026-10-07 14:56:03'),(26,'Yamaha','Aerox 155 V3',NULL,NULL,'V3',NULL,'2026-10-07 14:56:03','2026-10-07 14:56:03');
/*!40000 ALTER TABLE `motorcycle_models` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `motorcycle_units`
--

DROP TABLE IF EXISTS `motorcycle_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `motorcycle_units` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `brand` varchar(100) NOT NULL,
  `model` varchar(100) NOT NULL,
  `year_model` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_motorcycle_unit` (`brand`,`model`,`year_model`),
  KEY `idx_model` (`model`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `motorcycle_units`
--

LOCK TABLES `motorcycle_units` WRITE;
/*!40000 ALTER TABLE `motorcycle_units` DISABLE KEYS */;
INSERT INTO `motorcycle_units` VALUES (3,'Honda','Click 125',NULL),(13,'honda','click 125','2025'),(14,'honda','wave 125','2024'),(4,'Honda','XRM',NULL),(5,'susuki','wampipti','2026'),(6,'suzuki','raider','2012'),(2,'Suzuki','Raider FI','2022'),(15,'Yamaha','Aerox 155 V1','V1'),(16,'Yamaha','Aerox 155 V3','V3'),(1,'Yamaha','Mio i125','2023');
/*!40000 ALTER TABLE `motorcycle_units` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_compatibilities`
--

DROP TABLE IF EXISTS `product_compatibilities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_compatibilities` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `motorcycle_model_id` int(11) NOT NULL,
  `compatibility_status` enum('COMPATIBLE','NOT_COMPATIBLE','CONDITIONAL') NOT NULL DEFAULT 'COMPATIBLE',
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_prod_compat` (`product_id`,`motorcycle_model_id`),
  KEY `idx_compat_product` (`product_id`),
  KEY `idx_compat_model` (`motorcycle_model_id`),
  CONSTRAINT `product_compatibilities_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_compatibilities_ibfk_2` FOREIGN KEY (`motorcycle_model_id`) REFERENCES `motorcycle_models` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_compatibilities`
--

LOCK TABLES `product_compatibilities` WRITE;
/*!40000 ALTER TABLE `product_compatibilities` DISABLE KEYS */;
INSERT INTO `product_compatibilities` VALUES (1,2,1,'COMPATIBLE',NULL,'2026-10-07 14:51:56'),(2,2,16,'COMPATIBLE',NULL,'2026-10-07 14:51:56'),(3,4,6,'COMPATIBLE',NULL,'2026-10-07 14:51:56'),(4,1,7,'COMPATIBLE',NULL,'2026-10-07 14:51:56'),(5,3,7,'COMPATIBLE',NULL,'2026-10-07 14:51:56'),(6,2,8,'COMPATIBLE',NULL,'2026-10-07 14:51:56'),(8,2,19,'COMPATIBLE',NULL,'2026-10-07 14:52:03'),(11,2,22,'COMPATIBLE',NULL,'2026-10-07 14:52:15'),(14,5,25,'COMPATIBLE','COMPATIBLE','2026-10-07 14:56:23'),(15,5,26,'NOT_COMPATIBLE','Incompatible caliper bolt spacing','2026-10-07 14:56:23'),(16,6,25,'COMPATIBLE','COMPATIBLE','2026-10-07 14:56:23'),(17,6,26,'COMPATIBLE','COMPATIBLE','2026-10-07 14:56:23');
/*!40000 ALTER TABLE `product_compatibilities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_compatibility`
--

DROP TABLE IF EXISTS `product_compatibility`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_compatibility` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `motorcycle_unit_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_product_motorcycle` (`product_id`,`motorcycle_unit_id`),
  KEY `idx_product_motorcycle` (`product_id`,`motorcycle_unit_id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_motorcycle_id` (`motorcycle_unit_id`),
  CONSTRAINT `product_compatibility_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_compatibility_ibfk_2` FOREIGN KEY (`motorcycle_unit_id`) REFERENCES `motorcycle_units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_compatibility`
--

LOCK TABLES `product_compatibility` WRITE;
/*!40000 ALTER TABLE `product_compatibility` DISABLE KEYS */;
INSERT INTO `product_compatibility` VALUES (1,1,2),(3,2,1),(2,2,3),(5,3,2),(6,4,6),(7,5,15),(8,6,15),(9,6,16);
/*!40000 ALTER TABLE `product_compatibility` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_compatibility_groups`
--

DROP TABLE IF EXISTS `product_compatibility_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_compatibility_groups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `compatibility_group_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_product_group` (`product_id`,`compatibility_group_id`),
  KEY `idx_product_group_product` (`product_id`),
  KEY `idx_product_group_group` (`compatibility_group_id`),
  CONSTRAINT `product_compatibility_groups_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_compatibility_groups_ibfk_2` FOREIGN KEY (`compatibility_group_id`) REFERENCES `compatibility_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_compatibility_groups`
--

LOCK TABLES `product_compatibility_groups` WRITE;
/*!40000 ALTER TABLE `product_compatibility_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_compatibility_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_serials`
--

DROP TABLE IF EXISTS `product_serials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_serials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `serial_number` varchar(100) NOT NULL,
  `status` enum('available','sold') NOT NULL DEFAULT 'available',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `serial_number` (`serial_number`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `product_serials_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_serials`
--

LOCK TABLES `product_serials` WRITE;
/*!40000 ALTER TABLE `product_serials` DISABLE KEYS */;
INSERT INTO `product_serials` VALUES (1,3,'ECU001','available','2026-09-30 16:07:41'),(2,3,'ECU002','sold','2026-09-30 16:07:41'),(3,3,'ECU003','sold','2026-09-30 16:07:41');
/*!40000 ALTER TABLE `product_serials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `part_number` varchar(100) NOT NULL,
  `sku` varchar(100) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `brand` varchar(100) NOT NULL,
  `category` varchar(100) NOT NULL,
  `size` varchar(50) NOT NULL,
  `measurement` varchar(100) DEFAULT NULL,
  `thread_type` varchar(50) DEFAULT NULL,
  `cost_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `selling_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `retail_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `stock` int(11) NOT NULL DEFAULT 0,
  `current_stock` int(11) NOT NULL DEFAULT 0,
  `reorder_level` int(11) NOT NULL DEFAULT 5,
  `is_serialized` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_part_brand` (`part_number`,`brand`),
  KEY `idx_part_number` (`part_number`),
  KEY `idx_brand` (`brand`),
  KEY `idx_name` (`name`),
  KEY `idx_size` (`size`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,'BLT-M8-001','BLT-M8-001','Bolt M8','JRP','Bolts','M8 x 20mm','8mm x 20mm','M8',8.00,15.00,15.00,161,161,10,0,1,'2026-09-30 16:07:41','2026-10-07 15:01:45'),(2,'SP-001','SP-001','Spark Plug','NGK','Ignition','Standard','Standard motorcycle spark plug',NULL,75.00,120.00,120.00,29,29,8,0,1,'2026-09-30 16:07:41','2026-10-07 15:01:45'),(3,'ECU-RAIDER-01','ECU-RAIDER-01','ECU','Suzuki','Electrical','Raider FI ECU','Raider FI compatible ECU',NULL,1500.00,2500.00,2500.00,1,1,1,1,1,'2026-09-30 16:07:41','2026-10-07 15:01:45'),(4,'0A123D21','0A123D21','block','jvt','engine','66mm','172.mm',NULL,6500.00,7500.00,7500.00,46,46,1,0,1,'2026-10-01 05:31:52','2026-10-07 15:01:45'),(5,'JLR-BP-AEROX','JLR-BP-AEROX','Aerox Front Brake Pad Set','Yamaha','Brakes','Standard','Aerox OEM Front Caliper Fitment',NULL,250.00,450.00,450.00,0,0,5,0,1,'2026-10-07 14:56:03','2026-10-07 15:01:45'),(6,'JLR-OF-AEROX','JLR-OF-AEROX','Aerox Engine Oil Filter Element','Yamaha','Maintenance','Standard','Yamaha BlueCore 155cc Engine',NULL,120.00,220.00,220.00,0,0,5,0,1,'2026-10-07 14:56:03','2026-10-07 15:01:45');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_sync_products_insert
        BEFORE INSERT ON products
        FOR EACH ROW
        BEGIN
            IF NEW.sku IS NULL OR NEW.sku = '' THEN
                SET NEW.sku = NEW.part_number;
            END IF;
            IF NEW.part_number IS NULL OR NEW.part_number = '' THEN
                SET NEW.part_number = NEW.sku;
            END IF;
            IF NEW.current_stock IS NULL THEN
                SET NEW.current_stock = COALESCE(NEW.stock, 0);
            END IF;
            IF NEW.stock IS NULL THEN
                SET NEW.stock = COALESCE(NEW.current_stock, 0);
            END IF;
            IF NEW.retail_price IS NULL OR NEW.retail_price = 0 THEN
                SET NEW.retail_price = COALESCE(NEW.selling_price, 0.00);
            END IF;
            IF NEW.selling_price IS NULL OR NEW.selling_price = 0 THEN
                SET NEW.selling_price = COALESCE(NEW.retail_price, 0.00);
            END IF;
        END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_sync_products_update
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
        END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `receiving_record_items`
--

DROP TABLE IF EXISTS `receiving_record_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `receiving_record_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `receiving_record_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `item_id` int(11) DEFAULT NULL,
  `quantity` int(11) NOT NULL,
  `cost_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_rec_item_rec` (`receiving_record_id`),
  KEY `idx_rec_item_prod` (`product_id`),
  CONSTRAINT `receiving_record_items_ibfk_1` FOREIGN KEY (`receiving_record_id`) REFERENCES `receiving_records` (`id`) ON DELETE CASCADE,
  CONSTRAINT `receiving_record_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `receiving_record_items`
--

LOCK TABLES `receiving_record_items` WRITE;
/*!40000 ALTER TABLE `receiving_record_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `receiving_record_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `receiving_records`
--

DROP TABLE IF EXISTS `receiving_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `receiving_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_id` int(11) NOT NULL,
  `reference_number` varchar(100) NOT NULL,
  `reference_no` varchar(100) DEFAULT NULL,
  `received_by` int(11) DEFAULT NULL,
  `received_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `total_cost` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('draft','received','cancelled') NOT NULL DEFAULT 'received',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplier_ref` (`supplier_id`,`reference_no`),
  KEY `idx_rec_ref` (`reference_number`),
  KEY `idx_rec_supplier` (`supplier_id`),
  KEY `idx_rec_date` (`received_at`),
  KEY `received_by` (`received_by`),
  CONSTRAINT `receiving_records_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `receiving_records_ibfk_2` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `receiving_records`
--

LOCK TABLES `receiving_records` WRITE;
/*!40000 ALTER TABLE `receiving_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `receiving_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_item_serials`
--

DROP TABLE IF EXISTS `sale_item_serials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sale_item_serials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sale_item_id` int(11) NOT NULL,
  `serial_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `serial_id` (`serial_id`),
  KEY `sale_item_id` (`sale_item_id`),
  CONSTRAINT `sale_item_serials_ibfk_1` FOREIGN KEY (`sale_item_id`) REFERENCES `sale_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sale_item_serials_ibfk_2` FOREIGN KEY (`serial_id`) REFERENCES `product_serials` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_item_serials`
--

LOCK TABLES `sale_item_serials` WRITE;
/*!40000 ALTER TABLE `sale_item_serials` DISABLE KEYS */;
INSERT INTO `sale_item_serials` VALUES (1,5,2),(2,10,3);
/*!40000 ALTER TABLE `sale_item_serials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_items`
--

DROP TABLE IF EXISTS `sale_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sale_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sale_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `part_number` varchar(100) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `brand` varchar(100) NOT NULL,
  `size` varchar(50) NOT NULL,
  `quantity` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sale_id` (`sale_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `sale_items_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sale_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_items`
--

LOCK TABLES `sale_items` WRITE;
/*!40000 ALTER TABLE `sale_items` DISABLE KEYS */;
INSERT INTO `sale_items` VALUES (1,1,1,'BLT-M8-001','Bolt M8','JRP','M8 x 20mm',1,15.00,15.00),(2,2,4,'0A123D21','block','jvt','66mm',1,7500.00,7500.00),(3,3,4,'0A123D21','block','jvt','66mm',1,7500.00,7500.00),(4,4,4,'0A123D21','block','jvt','66mm',1,7500.00,7500.00),(5,5,3,'ECU-RAIDER-01','ECU','Suzuki','Raider FI ECU',1,2500.00,2500.00),(6,6,1,'BLT-M8-001','Bolt M8','JRP','M8 x 20mm',6,15.00,90.00),(7,7,1,'BLT-M8-001','Bolt M8','JRP','M8 x 20mm',2,15.00,30.00),(8,7,4,'0A123D21','block','jvt','66mm',1,7500.00,7500.00),(9,7,2,'SP-001','Spark Plug','NGK','Standard',1,120.00,120.00),(10,7,3,'ECU-RAIDER-01','ECU','Suzuki','Raider FI ECU',1,2500.00,2500.00);
/*!40000 ALTER TABLE `sale_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales`
--

DROP TABLE IF EXISTS `sales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `tendered_amount` decimal(10,2) NOT NULL,
  `change_due` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` enum('Cash','GCash','Card') NOT NULL DEFAULT 'Cash',
  `sale_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `order_number` varchar(100) DEFAULT NULL,
  `payment_reference` varchar(100) DEFAULT NULL,
  `payment_provider` varchar(50) DEFAULT NULL,
  `payment_status` varchar(50) DEFAULT 'paid',
  `subtotal_amount` decimal(10,2) DEFAULT NULL,
  `discount_amount` decimal(10,2) DEFAULT 0.00,
  `tax_amount` decimal(10,2) DEFAULT 0.00,
  `card_type` varchar(50) DEFAULT NULL,
  `card_last4` varchar(4) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `sales_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales`
--

LOCK TABLES `sales` WRITE;
/*!40000 ALTER TABLE `sales` DISABLE KEYS */;
INSERT INTO `sales` VALUES (1,1,15.00,21.00,6.00,'Cash','2026-09-30 16:18:57',NULL,NULL,NULL,'paid',NULL,0.00,0.00,NULL,NULL,NULL),(2,1,7500.00,7501.00,1.00,'Cash','2026-10-01 05:32:43',NULL,NULL,NULL,'paid',NULL,0.00,0.00,NULL,NULL,NULL),(3,2,7500.00,99999999.99,99999999.99,'Cash','2026-10-07 07:58:26',NULL,NULL,NULL,'paid',NULL,0.00,0.00,NULL,NULL,NULL),(4,2,7500.00,7500.00,0.00,'Cash','2026-10-07 07:59:41',NULL,NULL,NULL,'paid',NULL,0.00,0.00,NULL,NULL,NULL),(5,2,2500.00,2501.00,1.00,'Cash','2026-10-07 08:00:09',NULL,NULL,NULL,'paid',NULL,0.00,0.00,NULL,NULL,NULL),(6,2,90.00,91.00,1.00,'Cash','2026-10-07 08:00:26',NULL,NULL,NULL,'paid',NULL,0.00,0.00,NULL,NULL,NULL),(7,2,10150.00,10200.00,50.00,'Cash','2026-10-07 08:01:56',NULL,NULL,NULL,'paid',NULL,0.00,0.00,NULL,NULL,NULL);
/*!40000 ALTER TABLE `sales` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_order_items`
--

DROP TABLE IF EXISTS `sales_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_order_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sales_order_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `part_number` varchar(100) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `brand` varchar(100) NOT NULL,
  `size` varchar(50) NOT NULL,
  `quantity` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_so_item_order` (`sales_order_id`),
  KEY `idx_so_item_product` (`product_id`),
  CONSTRAINT `sales_order_items_ibfk_1` FOREIGN KEY (`sales_order_id`) REFERENCES `sales_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sales_order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_order_items`
--

LOCK TABLES `sales_order_items` WRITE;
/*!40000 ALTER TABLE `sales_order_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_orders`
--

DROP TABLE IF EXISTS `sales_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_number` varchar(100) NOT NULL,
  `user_id` int(11) NOT NULL,
  `customer_name` varchar(150) DEFAULT 'Walk-in Customer',
  `customer_phone` varchar(50) DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `subtotal_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(50) NOT NULL DEFAULT 'Cash',
  `payment_status` enum('paid','partial','pending','refunded','voided') NOT NULL DEFAULT 'paid',
  `tendered_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `change_due` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_reference` varchar(100) DEFAULT NULL,
  `payment_provider` varchar(50) DEFAULT NULL,
  `card_type` varchar(50) DEFAULT NULL,
  `card_last4` varchar(4) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `status` enum('completed','pending','cancelled','refunded','voided') NOT NULL DEFAULT 'completed',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `idx_so_number` (`order_number`),
  KEY `idx_so_user` (`user_id`),
  KEY `idx_so_status` (`status`),
  KEY `idx_so_date` (`created_at`),
  CONSTRAINT `sales_orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_orders`
--

LOCK TABLES `sales_orders` WRITE;
/*!40000 ALTER TABLE `sales_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `suppliers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_supplier_name` (`name`),
  KEY `idx_supplier_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES (1,'Yamaha Motor Philippines',NULL,NULL,NULL,NULL,1,'2026-10-07 14:56:03','2026-10-07 14:56:03');
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','staff') NOT NULL DEFAULT 'staff',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `token_version` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','$2b$10$T371LzxZ1q6SGo6wKG6Rp.fQzuZOrKVt6zPSpggoGYKRg2ulmcCD6','admin','2026-09-30 16:13:51','2026-09-30 17:43:28',1),(2,'staff','$2b$10$RVihsw1YmuM17GiQPvovk.mPKhGYpXGV.MMp3xit7v/xT9nO6Sr4O','staff','2026-09-30 16:13:51','2026-09-30 17:43:28',1);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'jlin_inventory_db'
--

--
-- Current Database: `jlin_inventory_db`
--

USE `jlin_inventory_db`;

--
-- Final view structure for view `items`
--

/*!50001 DROP VIEW IF EXISTS `items`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `items` AS select `products`.`id` AS `id`,`products`.`id` AS `item_id`,coalesce(`products`.`sku`,`products`.`part_number`) AS `sku`,`products`.`part_number` AS `part_number`,`products`.`name` AS `name`,`products`.`brand` AS `brand`,`products`.`category` AS `category`,`products`.`size` AS `size`,`products`.`measurement` AS `measurement`,`products`.`thread_type` AS `thread_type`,`products`.`cost_price` AS `cost_price`,coalesce(`products`.`retail_price`,`products`.`selling_price`) AS `retail_price`,`products`.`selling_price` AS `selling_price`,coalesce(`products`.`current_stock`,`products`.`stock`) AS `current_stock`,`products`.`stock` AS `stock`,`products`.`reorder_level` AS `reorder_level`,`products`.`is_serialized` AS `is_serialized`,`products`.`is_active` AS `is_active`,`products`.`created_at` AS `created_at`,`products`.`updated_at` AS `updated_at` from `products` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-07 23:26:51
