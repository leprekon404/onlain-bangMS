# API документация - Модуль уведомлений

## 📢 Общие положения

### Базовый URL
```
http://localhost:3000/api/notifications
```

### Аутентификация
Все запросы требуют JWT-токен:
```
Authorization: Bearer <your_jwt_token>
```

---

## 📬 Список уведомлений

### Получить уведомления

**Запрос:**
```http
GET /api/notifications?page=1&limit=20&unreadOnly=false&category=transaction
Authorization: Bearer <token>
```

**Параметры:**
- `page` - номер страницы (по умолчанию 1)
- `limit` - количество на странице (по умолчанию 20, макс 100)
- `unreadOnly` - только непрочитанные (true/false)
- `category` - фильтр по категории (transaction, security, service, marketing, system)

**Ответ:**
```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "notifications": [
    {
      "notification_id": 1,
      "notification_type_code": "TRANSACTION_COMPLETED",
      "type_name": "Транзакция выполнена",
      "category": "transaction",
      "title": "Транзакция выполнена",
      "message": "Транзакция на сумму 1500 RUB успешно выполнена",
      "data": {
        "amount": 1500,
        "currency": "RUB",
        "transaction_type": "transfer"
      },
      "priority": "normal",
      "is_read": false,
      "read_at": null,
      "created_at": "2025-12-14T20:00:00Z",
      "email_status": "sent",
      "sms_status": "skipped",
      "push_status": "sent"
    }
  ]
}
```

---

### Количество непрочитанных

**Запрос:**
```http
GET /api/notifications/unread-count
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "unreadCount": 5,
  "urgentCount": 1
}
```

---

## ✅ Управление статусами

### Отметить как прочитанное

**Запрос:**
```http
PATCH /api/notifications/1/read
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "message": "Уведомление отмечено как прочитанное"
}
```

---

### Отметить все как прочитанные

**Запрос:**
```http
POST /api/notifications/mark-all-read
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "message": "Все уведомления отмечены как прочитанные"
}
```

---

### Удалить уведомление

**Запрос:**
```http
DELETE /api/notifications/1
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "message": "Уведомление удалено"
}
```

---

## ⚙️ Настройки уведомлений

### Получить настройки

**Запрос:**
```http
GET /api/notifications/settings
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "notificationTypes": [
    {
      "typeCode": "TRANSACTION_COMPLETED",
      "typeName": "Транзакция выполнена",
      "description": "Уведомление о завершении транзакции",
      "category": "transaction",
      "settings": {
        "emailEnabled": true,
        "smsEnabled": false,
        "pushEnabled": true,
        "minAmount": 1000
      }
    }
  ]
}
```

---

### Обновить настройки

**Запрос:**
```http
PUT /api/notifications/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "typeCode": "TRANSACTION_COMPLETED",
  "emailEnabled": true,
  "smsEnabled": true,
  "pushEnabled": true,
  "minAmount": 5000
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Настройки обновлены"
}
```

---

## 📱 Управление устройствами

### Зарегистрировать устройство

**Запрос:**
```http
POST /api/notifications/devices
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceToken": "fcm_token_here",
  "deviceType": "android",
  "deviceName": "Samsung Galaxy S21"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Устройство зарегистрировано"
}
```

---

### Получить список устройств

**Запрос:**
```http
GET /api/notifications/devices
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "devices": [
    {
      "device_id": 1,
      "device_type": "android",
      "device_name": "Samsung Galaxy S21",
      "is_active": true,
      "last_active_at": "2025-12-14T20:00:00Z",
      "created_at": "2025-12-01T10:00:00Z"
    }
  ]
}
```

---

### Удалить устройство

**Запрос:**
```http
DELETE /api/notifications/devices/1
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "message": "Устройство удалено"
}
```

---

## 📊 Типы уведомлений

### Транзакции
- `TRANSACTION_COMPLETED` - Транзакция выполнена
- `TRANSACTION_FAILED` - Ошибка транзакции
- `LARGE_TRANSACTION` - Крупная транзакция
- `LOW_BALANCE` - Низкий баланс

### Безопасность
- `LOGIN_SUCCESS` - Успешный вход
- `LOGIN_FAILED` - Неудачная попытка входа
- `PASSWORD_CHANGED` - Пароль изменен
- `NEW_DEVICE` - Новое устройство
- `ACCOUNT_FROZEN` - Счет заморожен
- `ACCOUNT_UNFROZEN` - Счет разморожен
- `CARD_BLOCKED` - Карта заблокирована

### Сервис
- `SERVICE_UPDATE` - Обновление сервиса
- `SCHEDULED_MAINTENANCE` - Плановые работы

### Маркетинг
- `PROMOTIONAL_OFFER` - Специальное предложение
- `NEWS_UPDATE` - Новости банка

---

## 💻 Примеры использования

### JavaScript

```javascript
// Получить список уведомлений
const getNotifications = async (page = 1, unreadOnly = false) => {
  const response = await fetch(
    `http://localhost:3000/api/notifications?page=${page}&unreadOnly=${unreadOnly}`,
    {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }
  );
  return await response.json();
};

// Отметить как прочитанное
const markAsRead = async (notificationId) => {
  const response = await fetch(
    `http://localhost:3000/api/notifications/${notificationId}/read`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }
  );
  return await response.json();
};

// Обновить настройки
const updateSettings = async (typeCode, settings) => {
  const response = await fetch(
    'http://localhost:3000/api/notifications/settings',
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        typeCode,
        ...settings
      })
    }
  );
  return await response.json();
};
```

---

## ⚠️ Приоритеты

- `low` - Низкий (информационные)
- `normal` - Обычный (транзакции)
- `high` - Высокий (безопасность)
- `urgent` - Срочный (критические события)
