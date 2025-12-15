-- ============================================
-- МОДУЛЬ УВЕДОМЛЕНИЙ
-- ============================================

USE online_banking_db;

-- Типы уведомлений
CREATE TABLE IF NOT EXISTS notification_types (
  type_id INT PRIMARY KEY AUTO_INCREMENT,
  type_code VARCHAR(50) NOT NULL UNIQUE,
  type_name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  category ENUM('transaction', 'security', 'service', 'marketing', 'system') NOT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Настройки уведомлений пользователя
CREATE TABLE IF NOT EXISTS user_notification_settings (
  setting_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  notification_type_code VARCHAR(50) NOT NULL,
  
  -- Каналы доставки
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Пороги для уведомлений о транзакциях
  min_amount DECIMAL(15,2) NULL,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_notification_settings_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  
  UNIQUE KEY uniq_user_notification (user_id, notification_type_code),
  INDEX idx_notification_settings_user (user_id)
) ENGINE=InnoDB;

-- Журнал уведомлений
CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  notification_type_code VARCHAR(50) NOT NULL,
  
  -- Содержание
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSON NULL,
  
  -- Приоритет
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  
  -- Статусы доставки
  email_status ENUM('pending', 'sent', 'failed', 'skipped') NULL,
  email_sent_at DATETIME NULL,
  email_error TEXT NULL,
  
  sms_status ENUM('pending', 'sent', 'failed', 'skipped') NULL,
  sms_sent_at DATETIME NULL,
  sms_error TEXT NULL,
  
  push_status ENUM('pending', 'sent', 'failed', 'skipped') NULL,
  push_sent_at DATETIME NULL,
  push_error TEXT NULL,
  
  -- Прочитано пользователем
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at DATETIME NULL,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  
  INDEX idx_notifications_user (user_id),
  INDEX idx_notifications_created (created_at),
  INDEX idx_notifications_read (user_id, is_read),
  INDEX idx_notifications_type (notification_type_code)
) ENGINE=InnoDB;

-- Устройства для push-уведомлений
CREATE TABLE IF NOT EXISTS user_devices (
  device_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  
  device_token VARCHAR(255) NOT NULL,
  device_type ENUM('ios', 'android', 'web') NOT NULL,
  device_name VARCHAR(100) NULL,
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_active_at DATETIME NULL,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_devices_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  
  UNIQUE KEY uniq_device_token (device_token),
  INDEX idx_devices_user (user_id)
) ENGINE=InnoDB;

-- Шаблоны уведомлений
CREATE TABLE IF NOT EXISTS notification_templates (
  template_id INT PRIMARY KEY AUTO_INCREMENT,
  notification_type_code VARCHAR(50) NOT NULL,
  channel ENUM('email', 'sms', 'push') NOT NULL,
  language CHAR(2) NOT NULL DEFAULT 'ru',
  
  subject VARCHAR(255) NULL,
  body_template TEXT NOT NULL,
  
  -- Переменные шаблона в формате JSON
  variables JSON NULL,
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uniq_template (notification_type_code, channel, language)
) ENGINE=InnoDB;

-- ============================================
-- НАЧАЛЬНЫЕ ДАННЫЕ
-- ============================================

-- Типы уведомлений
INSERT INTO notification_types (type_code, type_name, description, category, default_enabled, requires_confirmation)
VALUES
  ('TRANSACTION_COMPLETED', 'Транзакция выполнена', 'Уведомление о завершении транзакции', 'transaction', TRUE, FALSE),
  ('TRANSACTION_FAILED', 'Ошибка транзакции', 'Уведомление о неудачной транзакции', 'transaction', TRUE, FALSE),
  ('LARGE_TRANSACTION', 'Крупная транзакция', 'Уведомление о крупной сумме', 'security', TRUE, FALSE),
  ('LOW_BALANCE', 'Низкий баланс', 'Баланс счета ниже порога', 'transaction', TRUE, FALSE),
  
  ('LOGIN_SUCCESS', 'Успешный вход', 'Вход в систему выполнен', 'security', TRUE, FALSE),
  ('LOGIN_FAILED', 'Неудачная попытка входа', 'Несколько неудачных попыток входа', 'security', TRUE, FALSE),
  ('PASSWORD_CHANGED', 'Пароль изменен', 'Пароль учетной записи изменен', 'security', TRUE, TRUE),
  ('NEW_DEVICE', 'Новое устройство', 'Вход с нового устройства', 'security', TRUE, FALSE),
  
  ('ACCOUNT_FROZEN', 'Счет заморожен', 'Счет был заморожен', 'security', TRUE, TRUE),
  ('ACCOUNT_UNFROZEN', 'Счет разморожен', 'Счет был разморожен', 'security', TRUE, FALSE),
  ('CARD_BLOCKED', 'Карта заблокирована', 'Карта была заблокирована', 'security', TRUE, TRUE),
  
  ('SERVICE_UPDATE', 'Обновление сервиса', 'Изменения в условиях предоставления услуг', 'service', TRUE, FALSE),
  ('SCHEDULED_MAINTENANCE', 'Плановые работы', 'Плановое техническое обслуживание', 'service', TRUE, FALSE),
  
  ('PROMOTIONAL_OFFER', 'Специальное предложение', 'Акции и специальные предложения', 'marketing', FALSE, FALSE),
  ('NEWS_UPDATE', 'Новости банка', 'Новости и обновления', 'marketing', FALSE, FALSE)
ON DUPLICATE KEY UPDATE type_name = VALUES(type_name);

-- Шаблоны email
INSERT INTO notification_templates (notification_type_code, channel, language, subject, body_template, variables)
VALUES
  ('TRANSACTION_COMPLETED', 'email', 'ru', 'Транзакция выполнена', 
   'Здравствуйте, {{user_name}}!\n\nВаша транзакция успешно выполнена:\n\nСумма: {{amount}} {{currency}}\nТип: {{transaction_type}}\nОписание: {{description}}\nДата: {{date}}\n\nС уважением,\nКоманда Online Banking',
   '{"user_name": "string", "amount": "number", "currency": "string", "transaction_type": "string", "description": "string", "date": "string"}'),
  
  ('LOW_BALANCE', 'email', 'ru', 'Низкий баланс счета',
   'Здравствуйте, {{user_name}}!\n\nБаланс вашего счета {{account_number}} опустился ниже установленного порога.\n\nТекущий баланс: {{balance}} {{currency}}\n\nПожалуйста, пополните счет, чтобы избежать проблем с платежами.\n\nС уважением,\nКоманда Online Banking',
   '{"user_name": "string", "account_number": "string", "balance": "number", "currency": "string"}'),
  
  ('PASSWORD_CHANGED', 'email', 'ru', 'Пароль изменен',
   'Здравствуйте, {{user_name}}!\n\nПароль вашей учетной записи был изменен {{date}}.\n\nЕсли это были не вы, немедленно свяжитесь с нами по телефону горячей линии.\n\nС уважением,\nКоманда Online Banking',
   '{"user_name": "string", "date": "string"}'),
   
  ('NEW_DEVICE', 'email', 'ru', 'Вход с нового устройства',
   'Здравствуйте, {{user_name}}!\n\nЗафиксирован вход в вашу учетную запись с нового устройства:\n\nУстройство: {{device_name}}\nIP-адрес: {{ip_address}}\nДата: {{date}}\n\nЕсли это были не вы, немедленно измените пароль и свяжитесь с нами.\n\nС уважением,\nКоманда Online Banking',
   '{"user_name": "string", "device_name": "string", "ip_address": "string", "date": "string"}')
ON DUPLICATE KEY UPDATE body_template = VALUES(body_template);

-- Шаблоны SMS
INSERT INTO notification_templates (notification_type_code, channel, language, subject, body_template, variables)
VALUES
  ('TRANSACTION_COMPLETED', 'sms', 'ru', NULL,
   'Транзакция {{amount}} {{currency}} выполнена. {{description}}. Online Banking',
   '{"amount": "number", "currency": "string", "description": "string"}'),
  
  ('LOW_BALANCE', 'sms', 'ru', NULL,
   'Низкий баланс счета {{account_number}}: {{balance}} {{currency}}. Пополните счет. Online Banking',
   '{"account_number": "string", "balance": "number", "currency": "string"}'),
  
  ('PASSWORD_CHANGED', 'sms', 'ru', NULL,
   'Пароль изменен. Если это не вы, срочно свяжитесь с нами. Online Banking',
   '{}')
ON DUPLICATE KEY UPDATE body_template = VALUES(body_template);

-- Шаблоны push
INSERT INTO notification_templates (notification_type_code, channel, language, subject, body_template, variables)
VALUES
  ('TRANSACTION_COMPLETED', 'push', 'ru', 'Транзакция выполнена',
   'Транзакция {{amount}} {{currency}} успешно выполнена',
   '{"amount": "number", "currency": "string"}'),
  
  ('LOW_BALANCE', 'push', 'ru', 'Низкий баланс',
   'Баланс счета {{account_number}}: {{balance}} {{currency}}',
   '{"account_number": "string", "balance": "number", "currency": "string"}'),
  
  ('NEW_DEVICE', 'push', 'ru', 'Новое устройство',
   'Зафиксирован вход с нового устройства',
   '{}')
ON DUPLICATE KEY UPDATE body_template = VALUES(body_template);

SELECT '✅ Таблицы модуля уведомлений созданы' AS status;
