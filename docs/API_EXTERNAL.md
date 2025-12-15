# Внешнее API - Документация для интеграций

## 🔑 Общие положения

### Базовый URL
```
http://localhost:3000/api/external
```

### Аутентификация

Все запросы требуют API ключ в заголовке:
```
X-API-Key: your_api_key_here
```

### Формат ответов

Все ответы в JSON формате:
```json
{
  "success": true|false,
  "data": {...},
  "error": "..."
}
```

---

## 🔐 Управление API ключами

### Создать API ключ

**Запрос:**
```http
POST /api/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My App Integration",
  "permissions": ["read:accounts", "read:balance", "read:transactions", "create:transfer"],
  "expiresInDays": 365
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "API ключ создан",
  "apiKey": {
    "apiKeyId": 1,
    "apiKey": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
    "name": "My App Integration",
    "permissions": ["read:accounts", "read:balance", "read:transactions", "create:transfer"],
    "expiresAt": "2026-12-14T18:00:00Z"
  },
  "warning": "Сохраните этот ключ! Он не будет отображаться снова."
}
```

### Доступные разрешения:
- `read:accounts` - чтение списка счетов
- `read:balance` - чтение баланса
- `read:transactions` - чтение транзакций
- `create:transfer` - создание переводов
- `all` - все разрешения

---

## 💳 Работа со счетами

### Получить список счетов

**Запрос:**
```http
GET /api/external/accounts
X-API-Key: your_api_key_here
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "account_id": 1,
      "account_number": "4276123456789012",
      "account_type": "debit",
      "balance": "150000.00",
      "currency": "RUB",
      "is_active": true
    },
    {
      "account_id": 2,
      "account_number": "4276555512349876",
      "account_type": "savings",
      "balance": "75000.00",
      "currency": "RUB",
      "is_active": true
    }
  ]
}
```

---

### Получить баланс счета

**Запрос:**
```http
GET /api/external/accounts/1/balance
X-API-Key: your_api_key_here
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "account_number": "4276123456789012",
    "balance": "150000.00",
    "currency": "RUB"
  }
}
```

---

### Получить историю транзакций

**Запрос:**
```http
GET /api/external/transactions?limit=20&offset=0
X-API-Key: your_api_key_here
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "transaction_id": 1,
      "amount": "1500.00",
      "transaction_type": "transfer",
      "description": "Перевод другу",
      "status": "completed",
      "created_at": "2025-12-14T18:30:00Z",
      "from_account": "4276123456789012",
      "to_account": "4276555512349876"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0
  }
}
```

---

## 💸 Создание перевода

**Запрос:**
```http
POST /api/external/transfer
X-API-Key: your_api_key_here
Content-Type: application/json

{
  "fromAccountId": 1,
  "toAccountNumber": "4276555512349876",
  "amount": 1500.00,
  "description": "API transfer"
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "transactionId": 123,
    "amount": 1500.00,
    "fromAccount": "4276123456789012",
    "toAccount": "4276555512349876",
    "status": "completed"
  }
}
```

---

## 📊 Статус API

**Запрос:**
```http
GET /api/external/status
```

**Ответ:**
```json
{
  "success": true,
  "message": "Online Banking API v1.0",
  "timestamp": "2025-12-14T18:00:00Z",
  "endpoints": [
    "GET /api/external/accounts",
    "GET /api/external/accounts/:id/balance",
    "GET /api/external/transactions",
    "POST /api/external/transfer"
  ]
}
```

---

## 💻 Примеры использования

### JavaScript/Node.js

```javascript
const API_KEY = 'your_api_key_here';
const BASE_URL = 'http://localhost:3000/api/external';

// Получить список счетов
async function getAccounts() {
  const response = await fetch(`${BASE_URL}/accounts`, {
    headers: {
      'X-API-Key': API_KEY
    }
  });
  return await response.json();
}

// Создать перевод
async function createTransfer(fromAccountId, toAccountNumber, amount) {
  const response = await fetch(`${BASE_URL}/transfer`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fromAccountId,
      toAccountNumber,
      amount,
      description: 'API transfer'
    })
  });
  return await response.json();
}
```

### Python

```python
import requests

API_KEY = 'your_api_key_here'
BASE_URL = 'http://localhost:3000/api/external'

# Получить список счетов
def get_accounts():
    response = requests.get(
        f'{BASE_URL}/accounts',
        headers={'X-API-Key': API_KEY}
    )
    return response.json()

# Создать перевод
def create_transfer(from_account_id, to_account_number, amount):
    response = requests.post(
        f'{BASE_URL}/transfer',
        headers={
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
        },
        json={
            'fromAccountId': from_account_id,
            'toAccountNumber': to_account_number,
            'amount': amount,
            'description': 'API transfer'
        }
    )
    return response.json()
```

### cURL

```bash
# Получить список счетов
curl -X GET http://localhost:3000/api/external/accounts \
  -H "X-API-Key: your_api_key_here"

# Создать перевод
curl -X POST http://localhost:3000/api/external/transfer \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "fromAccountId": 1,
    "toAccountNumber": "4276555512349876",
    "amount": 1500.00,
    "description": "API transfer"
  }'
```

---

## ⚠️ Ограничения и безопасность

1. **Rate Limiting**: Рекомендуется не более 100 запросов в минуту
2. **Хранение ключей**: Храните API ключи в безопасном месте
3. **HTTPS**: В продакшене используйте только HTTPS
4. **Логирование**: Все запросы логируются
5. **Разрешения**: Используйте минимально необходимые разрешения

---

## 🐞 Коды ошибок

| Код | Описание |
|------|-------------|
| 200  | Успешный запрос |
| 400  | Некорректный запрос |
| 401  | Неверный или отсутствующий API ключ |
| 403  | Недостаточно прав |
| 404  | Ресурс не найден |
| 500  | Внутренняя ошибка сервера |
