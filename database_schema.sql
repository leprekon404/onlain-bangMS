-- ============================================
-- database_schema_full.sql для online-banking-simple
-- (объединённый: исходная схема + новые поля accounts)
-- ============================================

-- 1. БАЗА ДАННЫХ

CREATE DATABASE IF NOT EXISTS online_banking_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE online_banking_db;

-- 2. ПОЛЬЗОВАТЕЛЬ ДЛЯ ПРИЛОЖЕНИЯ

DROP USER IF EXISTS 'banking_app_user'@'localhost';
CREATE USER 'banking_app_user'@'localhost'
  IDENTIFIED BY 'SecureP@ssw0rd2025!';
GRANT ALL PRIVILEGES ON online_banking_db.* TO 'banking_app_user'@'localhost';
FLUSH PRIVILEGES;

-- 3. ОЧИСТКА ТАБЛИЦ (можно запускать скрипт повторно)

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS biometric_credentials;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- 4. ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ

CREATE TABLE users (
  user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  phone_number VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  INDEX idx_username (username),
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- 5. ТАБЛИЦА СЧЕТОВ / КАРТ

CREATE TABLE accounts (
  account_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  account_number VARCHAR(20) NOT NULL UNIQUE,
  account_type ENUM('debit','credit','savings') NOT NULL DEFAULT 'debit',
  balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_accounts_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_account_number (account_number)
) ENGINE=InnoDB;

-- 6. ТАБЛИЦА ТРАНЗАКЦИЙ

CREATE TABLE transactions (
  transaction_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  from_account_id BIGINT,
  to_account_id BIGINT,
  amount DECIMAL(15,2) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- transfer, deposit, withdraw
  description VARCHAR(255),
  status ENUM('pending','completed','failed') NOT NULL DEFAULT 'completed',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_from
    FOREIGN KEY (from_account_id) REFERENCES accounts(account_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_tx_to
    FOREIGN KEY (to_account_id) REFERENCES accounts(account_id)
    ON DELETE SET NULL,
  INDEX idx_from_account (from_account_id),
  INDEX idx_to_account (to_account_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- 7. ТАБЛИЦА БИОМЕТРИИ (на будущее)

CREATE TABLE biometric_credentials (
  credential_id VARCHAR(255) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  public_key TEXT,
  counter INT NOT NULL DEFAULT 0,
  device_name VARCHAR(100),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME,
  CONSTRAINT fk_bio_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  INDEX idx_bio_user (user_id)
) ENGINE=InnoDB;

-- 8. ТЕСТОВЫЕ ПОЛЬЗОВАТЕЛИ
-- Пароль: Password123! (bcrypt-хеш уже готов)

INSERT INTO users (username, email, password_hash, full_name, phone_number) VALUES
  ('ivanov', 'ivanov@bank.ru',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIVj7rWXKy',
   'Иванов Иван Иванович', '+7 900 123-45-67'),
  ('petrov', 'petrov@bank.ru',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIVj7rWXKy',
   'Петров Пётр Петрович', '+7 900 234-56-78'),
  ('sidorov', 'sidorov@bank.ru',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIVj7rWXKy',
   'Сидоров Сидор Сидорович', '+7 900 345-67-89');

-- 9. ТЕСТОВЫЕ СЧЕТА / КАРТЫ
-- У Петрова (user_id = 2) сразу две карты.

INSERT INTO accounts (user_id, account_number, account_type, balance, currency) VALUES
  (1, '4276123456789012', 'debit',   150000.00, 'RUB'),  -- Иванов
  (2, '4276555512349876', 'debit',    75000.00, 'RUB'),  -- Петров, карта 1
  (2, '4276555598765432', 'savings',  25000.00, 'RUB'),  -- Петров, карта 2
  (3, '4276444498761234', 'debit',    25000.00, 'RUB');  -- Сидоров

-- 10. ТЕСТОВЫЕ ТРАНЗАКЦИИ
-- Примеры переводов между картами Петрова.

INSERT INTO transactions (from_account_id, to_account_id, amount, transaction_type, description) VALUES
  (2, 3, 1000.00, 'transfer', 'Тестовый перевод с карты 1 на карту 2'),
  (3, 2,  500.00, 'transfer', 'Тестовый перевод с карты 2 на карту 1');

-- 11. ПРОВЕРКА

SELECT '✅ online_banking_db создана' AS status;
SELECT COUNT(*) AS users_count FROM users;
SELECT COUNT(*) AS accounts_count FROM accounts;
SELECT COUNT(*) AS tx_count FROM transactions;

-- Обновлённый пароль только для petrov (если хочешь отличать от остальных)

UPDATE users
SET password_hash = '$2a$12$GyOhDSSummiqMgt8fcTJaOE615OvmwmKgJ59bg2D0nGu1FRxIR3/e'
WHERE username = 'petrov';

-- 12. РАСШИРЕНИЕ ТАБЛИЦЫ accounts (лимиты, блокировка, PIN)

ALTER TABLE accounts
  ADD COLUMN daily_limit DECIMAL(15,2) NULL AFTER balance,
  ADD COLUMN is_frozen   BOOLEAN NOT NULL DEFAULT FALSE AFTER is_active,
  ADD COLUMN pin_hash    VARCHAR(255) NULL AFTER is_frozen;
