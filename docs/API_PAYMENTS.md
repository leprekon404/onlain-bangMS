# API документация - Модуль платежей и переводов

## 📋 Содержание

1. [Общие положения](#общие-положения)
2. [Переводы](#переводы)
3. [Оплата услуг](#оплата-услуг)
4. [Шаблоны платежей](#шаблоны-платежей)
5. [Автоплатежи](#автоплатежи)

---

## Общие положения

### Базовый URL
```
http://localhost:3000/api/payments
```

### Аутентификация
Все запросы требуют JWT-токен:
```
Authorization: Bearer <your_jwt_token>
```

---

## Переводы

### 1. Внутренний перевод

Перевод между счетами в системе.

**Запрос:**
```http
POST /api/payments/internal-transfer
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromAccountId": 1,
  "toAccountNumber": "4276555512349876",
  "amount": 1500.00,
  "description": "Перевод другу"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Перевод выполнен успешно",
  "transaction": {
    "transactionId": 123,
    "amount": 1500.00,
    "fromAccount": "4276123456789012",
    "toAccount": "4276555512349876",
    "status": "completed"
  }
}
```

**Особенности:**
- Проверяется баланс
- Проверяется дневной лимит
- Проверяется статус счетов (активность, заморозка)
- Транзакция выполняется атомарно

---

### 2. Внешний перевод

Перевод в другой банк.

**Запрос:**
```http
POST /api/payments/external-transfer
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromAccountId": 1,
  "bankName": "Сбербанк",
  "accountNumber": "40817810500001234567",
  "recipientName": "Иванов Иван",
  "amount": 5000.00,
  "description": "Оплата по договору"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Внешний перевод выполнен успешно",
  "transaction": {
    "transactionId": 124,
    "amount": 5000.00,
    "commission": 50.00,
    "totalAmount": 5050.00,
    "recipientBank": "Сбербанк",
    "recipientAccount": "40817810500001234567",
    "recipientName": "Иванов Иван",
    "status": "completed"
  }
}
```

**Комиссия:**
- 1% от суммы перевода
- Минимум 10 рублей

---

## Оплата услуг

### Оплата услуг

Оплата коммунальных услуг, мобильной связи, интернета и др.

**Запрос:**
```http
POST /api/payments/service-payment
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromAccountId": 1,
  "serviceType": "коммунальные",
  "serviceProvider": "Городские сети",
  "accountNumber": "123456789",
  "amount": 2500.00,
  "description": "Оплата за электроэнергию за ноябрь"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Платёж выполнен успешно",
  "transaction": {
    "transactionId": 125,
    "amount": 2500.00,
    "serviceType": "коммунальные",
    "serviceProvider": "Городские сети",
    "accountNumber": "123456789",
    "status": "completed"
  }
}
```

**Поддерживаемые типы услуг:**
- Коммунальные услуги
- Мобильная связь
- Интернет
- Телевидение
- Штрафы ГИБДД
- Налоги

---

## Шаблоны платежей

### 1. Создать шаблон

**Запрос:**
```http
POST /api/payments/templates
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Оплата электроэнергии",
  "paymentType": "service_payment",
  "fromAccountId": 1,
  "serviceType": "коммунальные",
  "serviceProvider": "Городские сети",
  "toAccountNumber": "123456789",
  "amount": 2500.00,
  "description": "Ежемесячная оплата"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Шаблон создан успешно",
  "template": {
    "templateId": 1,
    "name": "Оплата электроэнергии",
    "paymentType": "service_payment"
  }
}
```

---

### 2. Получить все шаблоны

**Запрос:**
```http
GET /api/payments/templates
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "count": 2,
  "templates": [
    {
      "templateId": 1,
      "name": "Оплата электроэнергии",
      "data": {
        "payment_type": "service_payment",
        "from_account_id": 1,
        "service_type": "коммунальные",
        "amount": 2500.00
      },
      "createdAt": "2025-12-14T18:00:00Z",
      "lastUsed": "2025-12-14T20:00:00Z"
    }
  ]
}
```

---

### 3. Выполнить платеж по шаблону

**Запрос:**
```http
POST /api/payments/templates/1/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 2800.00
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Платеж по шаблону выполнен"
}
```

---

### 4. Удалить шаблон

**Запрос:**
```http
DELETE /api/payments/templates/1
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "message": "Шаблон удалён"
}
```

---

## Автоплатежи

### 1. Создать автоплатеж

**Запрос:**
```http
POST /api/payments/auto-payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "templateId": 1,
  "frequency": "monthly",
  "nextExecutionDate": "2025-12-15",
  "isActive": true
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Автоплатеж создан",
  "autoPayment": {
    "autoPaymentId": 1,
    "templateId": 1,
    "frequency": "monthly",
    "nextExecutionDate": "2025-12-15",
    "isActive": true
  }
}
```

**Частота выполнения:**
- `daily` - ежедневно
- `weekly` - еженедельно
- `monthly` - ежемесячно
- `yearly` - ежегодно

---

### 2. Получить все автоплатежи

**Запрос:**
```http
GET /api/payments/auto-payments
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "count": 1,
  "autoPayments": [
    {
      "autoPaymentId": 1,
      "templateId": 1,
      "templateName": "Оплата электроэнергии",
      "templateData": {...},
      "frequency": "monthly",
      "nextExecutionDate": "2025-12-15",
      "lastExecutionDate": null,
      "isActive": true,
      "createdAt": "2025-12-14T18:00:00Z"
    }
  ]
}
```

---

### 3. Обновить автоплатеж

**Запрос:**
```http
PATCH /api/payments/auto-payments/1
Authorization: Bearer <token>
Content-Type: application/json

{
  "isActive": false
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Автоплатеж обновлён"
}
```

---

### 4. Удалить автоплатеж

**Запрос:**
```http
DELETE /api/payments/auto-payments/1
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "success": true,
  "message": "Автоплатеж удалён"
}
```

---

## Примеры использования

### JavaScript

```javascript
// Внутренний перевод
const internalTransfer = async () => {
  const response = await fetch('http://localhost:3000/api/payments/internal-transfer', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fromAccountId: 1,
      toAccountNumber: '4276555512349876',
      amount: 1500.00,
      description: 'Перевод другу'
    })
  });
  return await response.json();
};

// Создание шаблона
const createTemplate = async () => {
  const response = await fetch('http://localhost:3000/api/payments/templates', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Оплата коммуналки',
      paymentType: 'service_payment',
      fromAccountId: 1,
      serviceType: 'коммунальные',
      serviceProvider: 'Городские сети',
      toAccountNumber: '123456789',
      amount: 2500.00
    })
  });
  return await response.json();
};
```

---

## Коды ошибок

| Код | Описание |
|------|-------------|
| 200  | Успешный запрос |
| 201  | Ресурс успешно создан |
| 400  | Некорректный запрос |
| 401  | Неавторизован |
| 403  | Доступ запрещен |
| 404  | Ресурс не найден |
| 500  | Внутренняя ошибка сервера |
