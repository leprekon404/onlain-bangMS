# API документация - Модуль управления счетами

## Оглавление
1. [Получение списка счетов](#1-получение-списка-счетов)
2. [Получение информации о счете](#2-получение-информации-о-счете)
3. [Отслеживание баланса](#3-отслеживание-баланса)
4. [История транзакций](#4-история-транзакций)
5. [Создание нового счета](#5-создание-нового-счета)
6. [Обновление счета](#6-обновление-счета)
7. [Закрытие счета](#7-закрытие-счета)
8. [Сводка по счетам](#8-сводка-по-счетам)

---

## Общие положения

### Базовый URL
```
http://localhost:3000/api/accounts
```

### Аутентификация
Все запросы требуют JWT-токен в заголовке:
```
Authorization: Bearer <your_jwt_token>
```

### Формат ответов
Все ответы возвращаются в JSON формате с полем `success`:
```json
{
  "success": true|false,
  "message": "...",
  "data": {...}
}
```

---

## 1. Получение списка счетов

Получить все счета текущего пользователя.

### Запрос
```http
GET /api/accounts
Authorization: Bearer <token>
```

### Ответ
```json
{
  "success": true,
  "count": 2,
  "accounts": [
    {
      "account_id": 1,
      "account_number": "4276123456789012",
      "account_type": "debit",
      "balance": "150000.00",
      "currency": "RUB",
      "daily_limit": null,
      "is_active": true,
      "is_frozen": false,
      "created_at": "2025-12-14T10:30:00.000Z"
    },
    {
      "account_id": 2,
      "account_number": "4276555512349876",
      "account_type": "savings",
      "balance": "75000.00",
      "currency": "RUB",
      "daily_limit": "50000.00",
      "is_active": true,
      "is_frozen": false,
      "created_at": "2025-12-10T14:20:00.000Z"
    }
  ]
}
```

---

## 2. Получение информации о счете

Получить детальную информацию о конкретном счете.

### Запрос
```http
GET /api/accounts/:accountId
Authorization: Bearer <token>
```

### Параметры
- `accountId` (path) - ID счета

### Ответ
```json
{
  "success": true,
  "account": {
    "account_id": 1,
    "account_number": "4276123456789012",
    "account_type": "debit",
    "balance": "150000.00",
    "currency": "RUB",
    "daily_limit": null,
    "is_active": true,
    "is_frozen": false,
    "created_at": "2025-12-14T10:30:00.000Z",
    "full_name": "Иванов Иван Иванович",
    "email": "ivanov@bank.ru"
  }
}
```

---

## 3. Отслеживание баланса

Получить текущий баланс счета.

### Запрос
```http
GET /api/accounts/:accountId/balance
Authorization: Bearer <token>
```

### Параметры
- `accountId` (path) - ID счета

### Ответ
```json
{
  "success": true,
  "accountId": 1,
  "accountNumber": "4276123456789012",
  "balance": 150000.00,
  "currency": "RUB",
  "accountType": "debit"
}
```

### Ошибки
- `404` - Счет не найден
- `400` - Счет закрыт или заморожен

---

## 4. История транзакций

Получить историю транзакций по счету с поддержкой пагинации и фильтров.

### Запрос
```http
GET /api/accounts/:accountId/transactions?page=1&limit=20&startDate=2025-01-01&type=transfer
Authorization: Bearer <token>
```

### Параметры
- `accountId` (path, обязательный) - ID счета
- `page` (query, необязательный) - Номер страницы (по умолчанию: 1)
- `limit` (query, необязательный) - Количество записей на страницу (по умолчанию: 20)
- `startDate` (query, необязательный) - Начальная дата (YYYY-MM-DD)
- `endDate` (query, необязательный) - Конечная дата (YYYY-MM-DD)
- `type` (query, необязательный) - Тип транзакции (transfer, deposit, withdraw)
- `status` (query, необязательный) - Статус (pending, completed, failed)

### Ответ
```json
{
  "success": true,
  "accountId": 1,
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalTransactions": 93,
    "transactionsPerPage": 20
  },
  "transactions": [
    {
      "transactionId": 15,
      "amount": 1500.00,
      "type": "transfer",
      "direction": "debit",
      "description": "Перевод на карту",
      "status": "completed",
      "fromAccount": "4276123456789012",
      "toAccount": "4276555512349876",
      "createdAt": "2025-12-14T15:30:00.000Z"
    },
    {
      "transactionId": 14,
      "amount": 5000.00,
      "type": "deposit",
      "direction": "credit",
      "description": "Пополнение",
      "status": "completed",
      "fromAccount": null,
      "toAccount": "4276123456789012",
      "createdAt": "2025-12-13T10:15:00.000Z"
    }
  ]
}
```

---

## 5. Создание нового счета

Создать новый счет для текущего пользователя.

### Запрос
```http
POST /api/accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountType": "debit",
  "currency": "RUB",
  "dailyLimit": 100000,
  "pin": "1234"
}
```

### Параметры тела запроса
- `accountType` (обязательный) - Тип счета: `debit`, `credit`, `savings`
- `currency` (необязательный) - Валюта (по умолчанию: RUB)
- `dailyLimit` (необязательный) - Дневной лимит транзакций
- `pin` (необязательный) - PIN-код для счета

### Ответ
```json
{
  "success": true,
  "message": "Счет успешно создан",
  "account": {
    "accountId": 5,
    "accountNumber": "4276987654321098",
    "accountType": "debit",
    "balance": 0.00,
    "currency": "RUB",
    "dailyLimit": 100000.00,
    "isActive": true,
    "createdAt": "2025-12-14T18:00:00.000Z"
  }
}
```

### Ошибки
- `400` - Неверный тип счета
- `500` - Ошибка сервера

---

## 6. Обновление счета

Обновить параметры существующего счета.

### Запрос
```http
PATCH /api/accounts/:accountId
Authorization: Bearer <token>
Content-Type: application/json

{
  "dailyLimit": 50000,
  "isFrozen": false
}
```

### Параметры
- `accountId` (path) - ID счета
- `dailyLimit` (body, необязательный) - Новый дневной лимит
- `isFrozen` (body, необязательный) - Статус заморозки счета

### Ответ
```json
{
  "success": true,
  "message": "Счет успешно обновлен",
  "account": {
    "account_id": 1,
    "account_number": "4276123456789012",
    "account_type": "debit",
    "balance": "150000.00",
    "currency": "RUB",
    "daily_limit": "50000.00",
    "is_active": true,
    "is_frozen": false,
    "created_at": "2025-12-14T10:30:00.000Z"
  }
}
```

### Ошибки
- `404` - Счет не найден
- `400` - Невозможно изменить закрытый счет

---

## 7. Закрытие счета

Закрыть счет (мягкое удаление). Счет можно закрыть только с нулевым балансом.

### Запрос
```http
DELETE /api/accounts/:accountId
Authorization: Bearer <token>
```

### Параметры
- `accountId` (path) - ID счета

### Ответ
```json
{
  "success": true,
  "message": "Счет успешно закрыт",
  "accountId": 5
}
```

### Ошибки
- `404` - Счет не найден
- `400` - Счет уже закрыт
- `400` - Невозможно закрыть счет с ненулевым балансом

---

## 8. Сводка по счетам

Получить сводную информацию по всем счетам пользователя.

### Запрос
```http
GET /api/accounts/user/summary
Authorization: Bearer <token>
```

### Ответ
```json
{
  "success": true,
  "summary": {
    "totalAccounts": 3,
    "activeAccounts": 2,
    "frozenAccounts": 0,
    "totalBalance": 225000.00,
    "currencies": ["RUB", "USD"]
  }
}
```

---

## Примеры использования

### cURL

#### Получение всех счетов
```bash
curl -X GET http://localhost:3000/api/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Создание нового счета
```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountType": "savings",
    "currency": "RUB",
    "dailyLimit": 50000
  }'
```

#### Получение истории транзакций
```bash
curl -X GET "http://localhost:3000/api/accounts/1/transactions?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### JavaScript (Fetch API)

```javascript
// Получение списка счетов
const getAccounts = async () => {
  const response = await fetch('http://localhost:3000/api/accounts', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  const data = await response.json();
  return data;
};

// Создание счета
const createAccount = async (accountData) => {
  const response = await fetch('http://localhost:3000/api/accounts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(accountData)
  });
  const data = await response.json();
  return data;
};

// Получение транзакций
const getTransactions = async (accountId, page = 1, limit = 20) => {
  const response = await fetch(
    `http://localhost:3000/api/accounts/${accountId}/transactions?page=${page}&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }
  );
  const data = await response.json();
  return data;
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

---

## Примечания

1. **Безопасность**: Все запросы требуют валидный JWT-токен.
2. **Пагинация**: История транзакций поддерживает пагинацию для оптимальной производительности.
3. **Мягкое удаление**: Закрытие счета не удаляет данные, а только меняет статус `is_active`.
4. **Баланс**: Счет можно закрыть только при нулевом балансе.
5. **Фильтры**: История транзакций поддерживает фильтрацию по дате, типу и статусу.
