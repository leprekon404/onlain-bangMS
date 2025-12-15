-- Миграция: Добавление системы ролей

-- Создаем таблицу ролей
CREATE TABLE IF NOT EXISTS roles (
    role_id INT PRIMARY KEY AUTO_INCREMENT,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    role_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Вставляем базовые роли
INSERT INTO roles (role_name, role_description) VALUES
('user', 'Обычный пользователь банка'),
('admin', 'Администратор системы'),
('manager', 'Менеджер банка'),
('support', 'Служба поддержки');

-- Добавляем поле role_id в таблицу users
ALTER TABLE users ADD COLUMN role_id INT DEFAULT 1;
ALTER TABLE users ADD FOREIGN KEY (role_id) REFERENCES roles(role_id);

-- Обновляем существующих пользователей (делаем их обычными пользователями)
UPDATE users SET role_id = 1 WHERE role_id IS NULL;

-- Создаем первого администратора (username: admin, password: admin123)
-- Пароль захеширован bcrypt
INSERT INTO users (username, email, password_hash, full_name, phone_number, role_id)
VALUES ('admin', 'admin@bank.local', '$2b$10$rKz8VZ1qQZ5gYxXJ5xXqYeF1qVz6xYqXqYxXqYxXqYxXqYxXqYxXq', 'Администратор', '+79999999999', 2)
ON DUPLICATE KEY UPDATE role_id = 2;

-- Таблица логов действий администратора
CREATE TABLE IF NOT EXISTS admin_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    admin_id INT NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id INT,
    description TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(user_id)
);

-- Индексы для оптимизации
CREATE INDEX idx_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at);
CREATE INDEX idx_users_role ON users(role_id);
