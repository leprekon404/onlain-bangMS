-- ===========================================================
-- Таблица аудита действий пользователей
-- ===========================================================

USE online_banking_db;

CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NULL,
    action_type VARCHAR(50) NOT NULL COMMENT 'LOGIN, TRANSFER, ACCOUNT_CREATE, ACCOUNT_UPDATE, ACCOUNT_CLOSE, PASSWORD_CHANGE, etc.',
    action_status VARCHAR(20) NOT NULL COMMENT 'success или failure',
    ip_address VARCHAR(45) NULL COMMENT 'IPv4 или IPv6',
    user_agent VARCHAR(255) NULL COMMENT 'User-Agent браузера',
    details JSON NULL COMMENT 'Дополнительные данные о действии',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_audit_user_time (user_id, created_at),
    INDEX idx_audit_action_time (action_type, created_at),
    INDEX idx_audit_status (action_status, created_at),
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Примеры action_type:
-- LOGIN - вход в систему
-- LOGIN_FAILED - неудачный вход
-- LOGOUT - выход из системы
-- REGISTER - регистрация
-- TRANSFER - перевод средств
-- DEPOSIT - пополнение счёта
-- WITHDRAW - снятие средств
-- ACCOUNT_CREATE - создание счёта
-- ACCOUNT_UPDATE - изменение счёта
-- ACCOUNT_CLOSE - закрытие счёта
-- PASSWORD_CHANGE - смена пароля
-- API_KEY_CREATE - создание API ключа
-- API_KEY_DELETE - удаление API ключа

-- Примеры записей:
-- {
--   "reason": "invalid_password",
--   "username": "ivanov",
--   "attempts": 3
-- }

-- {
--   "from_account": 1,
--   "to_account": 2,
--   "amount": 5000.00,
--   "currency": "RUB",
--   "transaction_id": 42
-- }
