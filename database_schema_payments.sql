-- ============================================
-- РАСШИРЕНИЕ СХЕМЫ БД ДЛЯ МОДУЛЯ ПЛАТЕЖЕЙ
-- ============================================

USE online_banking_db;

-- Таблица шаблонов платежей
CREATE TABLE IF NOT EXISTS payment_templates (
  template_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  template_data JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME NULL,
  CONSTRAINT fk_template_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  INDEX idx_template_user (user_id)
) ENGINE=InnoDB;

-- Таблица автоплатежей
CREATE TABLE IF NOT EXISTS auto_payments (
  auto_payment_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  template_id BIGINT NOT NULL,
  frequency ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL,
  next_execution_date DATE NOT NULL,
  last_execution_date DATETIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_autopay_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_autopay_template
    FOREIGN KEY (template_id) REFERENCES payment_templates(template_id)
    ON DELETE CASCADE,
  INDEX idx_autopay_user (user_id),
  INDEX idx_autopay_next_date (next_execution_date, is_active)
) ENGINE=InnoDB;

-- Таблица для внешних API ключей
CREATE TABLE IF NOT EXISTS external_api_keys (
  api_key_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  api_key VARCHAR(64) NOT NULL UNIQUE,
  api_name VARCHAR(100) NOT NULL,
  permissions JSON NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  last_used DATETIME NULL,
  CONSTRAINT fk_apikey_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  INDEX idx_apikey (api_key),
  INDEX idx_apikey_user (user_id)
) ENGINE=InnoDB;

-- Логирование внешних API запросов
CREATE TABLE IF NOT EXISTS api_request_logs (
  log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  api_key_id BIGINT NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  request_data JSON NULL,
  response_status INT NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_apilog_key
    FOREIGN KEY (api_key_id) REFERENCES external_api_keys(api_key_id)
    ON DELETE CASCADE,
  INDEX idx_apilog_key (api_key_id),
  INDEX idx_apilog_date (created_at)
) ENGINE=InnoDB;

-- Проверка успешного создания
SELECT '✅ Таблицы для модуля платежей созданы' AS status;
