# 🔒 Функции безопасности

## 📝 Логирование (Pino)

Система использует быстрый логгер Pino для отслеживания всех критичных операций.

### Уровни логирования

- `debug` - Отладочная информация
- `info` - Общая информация (по умолчанию)
- `warn` - Предупреждения
- `error` - Ошибки
- `fatal` - Критические ошибки

### Настройка

Добавьте в `.env`:

```env
LOG_LEVEL=info
NODE_ENV=development
```

### Примеры логов

**В режиме development** (цветной вывод):
```
[2025-12-16 22:41:16] INFO: Login successful
    userId: 1
    username: "ivanov"
    ip: "::1"
```

**В режиме production** (JSON):
```json
{"level":30,"time":1702764076,"userId":1,"username":"ivanov","ip":"::1","msg":"Login successful"}
```

### Что логируется

- Успешные и неудачные попытки входа
- Регистрация новых пользователей
- Превышение rate limit
- Ошибки сервера
- Запуск сервера

---

## 🛑 Rate Limiting

Защита от брутфорса и DDoS атак с помощью `express-rate-limit`.

### Лимиты

#### Общий лимит (для всех `/api/*`)
- **Окно:** 15 минут
- **Максимум:** 100 запросов с одного IP

#### Лимит аутентификации (`/api/auth/*`)
- **Окно:** 15 минут
- **Максимум:** 20 попыток с одного IP

### Ответ при превышении лимита

```json
{
  "success": false,
  "message": "Слишком много попыток аутентификации, попробуйте через 15 минут"
}
```

**HTTP статус:** `429 Too Many Requests`

### Headers

В ответе присутствуют:

```
RateLimit-Limit: 20
RateLimit-Remaining: 15
RateLimit-Reset: 1702765200
```

---

## 📊 Таблица аудита (audit_logs)

Все критические действия записываются в базу данных для последующего анализа.

### Структура таблицы

```sql
CREATE TABLE audit_logs (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NULL,
    action_type VARCHAR(50) NOT NULL,
    action_status VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    details JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Установка таблицы

```bash
mysql -u root -p online_banking_db < database_schema_audit.sql
```

### Типы действий (action_type)

- `LOGIN` - вход в систему
- `REGISTER` - регистрация
- `LOGOUT` - выход
- `TRANSFER` - перевод средств
- `DEPOSIT` - пополнение
- `WITHDRAW` - снятие
- `ACCOUNT_CREATE` - создание счёта
- `ACCOUNT_UPDATE` - изменение счёта
- `ACCOUNT_CLOSE` - закрытие счёта
- `PASSWORD_CHANGE` - смена пароля
- `API_KEY_CREATE` - создание API ключа
- `API_KEY_DELETE` - удаление API ключа

### Статусы (action_status)

- `success` - успешно
- `failure` - неудача

### Примеры записей

#### Успешный вход

```json
{
  "audit_id": 1,
  "user_id": 1,
  "action_type": "LOGIN",
  "action_status": "success",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "details": {
    "username": "ivanov"
  },
  "created_at": "2025-12-16 22:41:16"
}
```

#### Неудачный вход

```json
{
  "audit_id": 2,
  "user_id": 1,
  "action_type": "LOGIN",
  "action_status": "failure",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "details": {
    "reason": "invalid_password",
    "username": "ivanov"
  },
  "created_at": "2025-12-16 22:40:15"
}
```

#### Перевод средств

```json
{
  "audit_id": 3,
  "user_id": 1,
  "action_type": "TRANSFER",
  "action_status": "success",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "details": {
    "from_account": 1,
    "to_account": 2,
    "amount": 5000.00,
    "currency": "RUB",
    "transaction_id": 42
  },
  "created_at": "2025-12-16 22:45:30"
}
```

### SQL запросы для анализа

#### Неудачные попытки входа за последний час

```sql
SELECT user_id, ip_address, COUNT(*) as attempts
FROM audit_logs
WHERE action_type = 'LOGIN' 
  AND action_status = 'failure'
  AND created_at > NOW() - INTERVAL 1 HOUR
GROUP BY user_id, ip_address
ORDER BY attempts DESC;
```

#### Все действия конкретного пользователя

```sql
SELECT *
FROM audit_logs
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 50;
```

#### Подозрительные IP (много неудачных попыток)

```sql
SELECT ip_address, COUNT(*) as failed_attempts
FROM audit_logs
WHERE action_status = 'failure'
  AND created_at > NOW() - INTERVAL 24 HOUR
GROUP BY ip_address
HAVING failed_attempts > 10
ORDER BY failed_attempts DESC;
```

#### Все переводы за период

```sql
SELECT 
    user_id,
    details->>'$.from_account' as from_account,
    details->>'$.to_account' as to_account,
    details->>'$.amount' as amount,
    created_at
FROM audit_logs
WHERE action_type = 'TRANSFER'
  AND action_status = 'success'
  AND created_at BETWEEN '2025-12-01' AND '2025-12-31'
ORDER BY created_at DESC;
```

---

## 🛠️ Использование в коде

### Добавление аудита в новые эндпоинты

```javascript
const logger = require('../utils/logger');
const { writeAuditLog } = require('../utils/audit');

router.post('/transfer', authMiddleware, async (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;
  const userId = req.user.userId;
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  try {
    // Логика перевода...
    
    logger.info({ userId, fromAccount, toAccount, amount }, 'Transfer completed');
    await writeAuditLog({
      userId,
      actionType: 'TRANSFER',
      actionStatus: 'success',
      ipAddress: ip,
      userAgent: ua,
      details: { fromAccount, toAccount, amount, currency: 'RUB' },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err, userId }, 'Transfer failed');
    await writeAuditLog({
      userId,
      actionType: 'TRANSFER',
      actionStatus: 'failure',
      ipAddress: ip,
      userAgent: ua,
      details: { fromAccount, toAccount, amount, error: err.message },
    });
    res.status(500).json({ success: false });
  }
});
```

---

## 📝 Рекомендации

1. **Регулярно проверяйте логи** на подозрительную активность
2. **Настройте алерты** на множественные неудачные попытки
3. **Архивируйте старые логи** (более 6 месяцев) в отдельную таблицу
4. **Используйте индексы** для быстрого поиска по audit_logs
5. **Добавьте аудит** во все критичные эндпоинты

---

## ✅ Чек-лист установки

- [ ] Установлены зависимости (`npm install`)
- [ ] Создана таблица `audit_logs` (`database_schema_audit.sql`)
- [ ] Добавлен `LOG_LEVEL` в `.env`
- [ ] Сервер перезапущен
- [ ] Проверена работа rate limiting
- [ ] Проверена запись в audit_logs
