-- ============================================
-- МОДУЛЬ АНАЛИТИКИ И ПЛАНИРОВАНИЯ БЮДЖЕТА
-- ============================================

USE online_banking_db;

-- Категории транзакций
CREATE TABLE IF NOT EXISTS transaction_categories (
  category_id INT PRIMARY KEY AUTO_INCREMENT,
  category_name VARCHAR(100) NOT NULL,
  category_type ENUM('income', 'expense') NOT NULL,
  icon VARCHAR(50) NULL,
  color VARCHAR(7) NULL,
  parent_category_id INT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_parent_category
    FOREIGN KEY (parent_category_id) REFERENCES transaction_categories(category_id)
    ON DELETE SET NULL,
  
  INDEX idx_category_type (category_type),
  INDEX idx_parent_category (parent_category_id)
) ENGINE=InnoDB;

-- Связь транзакций с категориями
CREATE TABLE IF NOT EXISTS transaction_category_mapping (
  mapping_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  transaction_id BIGINT NOT NULL,
  category_id INT NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by ENUM('user', 'system', 'ai') NOT NULL DEFAULT 'user',
  
  CONSTRAINT fk_mapping_transaction
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
    ON DELETE CASCADE,
  
  CONSTRAINT fk_mapping_category
    FOREIGN KEY (category_id) REFERENCES transaction_categories(category_id)
    ON DELETE CASCADE,
  
  UNIQUE KEY uniq_transaction_category (transaction_id),
  INDEX idx_mapping_category (category_id)
) ENGINE=InnoDB;

-- Бюджеты пользователей
CREATE TABLE IF NOT EXISTS budgets (
  budget_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  category_id INT NULL,
  
  budget_name VARCHAR(100) NOT NULL,
  budget_amount DECIMAL(15,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  
  period_type ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE NULL,
  
  alert_threshold DECIMAL(5,2) NULL COMMENT 'Процент для предупреждения (например, 80)',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_budget_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  
  CONSTRAINT fk_budget_category
    FOREIGN KEY (category_id) REFERENCES transaction_categories(category_id)
    ON DELETE SET NULL,
  
  INDEX idx_budget_user (user_id),
  INDEX idx_budget_dates (start_date, end_date),
  INDEX idx_budget_category (category_id)
) ENGINE=InnoDB;

-- Финансовые цели
CREATE TABLE IF NOT EXISTS financial_goals (
  goal_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  
  goal_name VARCHAR(200) NOT NULL,
  goal_description TEXT NULL,
  target_amount DECIMAL(15,2) NOT NULL,
  current_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  
  target_date DATE NULL,
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at DATETIME NULL,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_goal_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  
  INDEX idx_goal_user (user_id),
  INDEX idx_goal_status (is_completed)
) ENGINE=InnoDB;

-- Кэш аналитических данных для быстрого доступа
CREATE TABLE IF NOT EXISTS analytics_cache (
  cache_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  cache_key VARCHAR(100) NOT NULL,
  cache_data JSON NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  
  CONSTRAINT fk_cache_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  
  UNIQUE KEY uniq_user_cache (user_id, cache_key, period_start, period_end),
  INDEX idx_cache_expires (expires_at)
) ENGINE=InnoDB;

-- ============================================
-- НАЧАЛЬНЫЕ ДАННЫЕ
-- ============================================

-- Стандартные категории расходов
INSERT INTO transaction_categories (category_name, category_type, icon, color, is_system) VALUES
  ('Продукты', 'expense', '🛒', '#FF6B6B', TRUE),
  ('Транспорт', 'expense', '🚗', '#4ECDC4', TRUE),
  ('Коммунальные услуги', 'expense', '🏠', '#45B7D1', TRUE),
  ('Развлечения', 'expense', '🎬', '#FFA07A', TRUE),
  ('Здоровье', 'expense', '💊', '#98D8C8', TRUE),
  ('Образование', 'expense', '📚', '#6C5CE7', TRUE),
  ('Одежда', 'expense', '👔', '#A29BFE', TRUE),
  ('Рестораны и кафе', 'expense', '🍽️', '#FD79A8', TRUE),
  ('Связь', 'expense', '📱', '#FDCB6E', TRUE),
  ('Подписки', 'expense', '💳', '#E17055', TRUE),
  ('Прочие расходы', 'expense', '📦', '#B2BEC3', TRUE)
ON DUPLICATE KEY UPDATE category_name = VALUES(category_name);

-- Стандартные категории доходов
INSERT INTO transaction_categories (category_name, category_type, icon, color, is_system) VALUES
  ('Зарплата', 'income', '💰', '#00B894', TRUE),
  ('Фриланс', 'income', '💼', '#00CEC9', TRUE),
  ('Инвестиции', 'income', '📈', '#6C5CE7', TRUE),
  ('Подарки', 'income', '🎁', '#FD79A8', TRUE),
  ('Возврат средств', 'income', '↩️', '#FDCB6E', TRUE),
  ('Прочие доходы', 'income', '💵', '#55EFC4', TRUE)
ON DUPLICATE KEY UPDATE category_name = VALUES(category_name);

SELECT '✅ Таблицы модуля аналитики созданы' AS status;
