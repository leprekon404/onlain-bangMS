const express = require('express');
const router = express.Router();
const db = require('../config/database');
const crypto = require('crypto');

// ============================================
// ВНЕШНИЕ API ДЛЯ ИНТЕГРАЦИЙ
// ============================================

/**
 * Middleware для аутентификации по API ключу
 */
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API ключ не предоставлен',
      message: 'Укажите X-API-Key в заголовке запроса'
    });
  }

  try {
    const [keys] = await db.query(
      `SELECT ak.*, u.username 
       FROM external_api_keys ak
       JOIN users u ON ak.user_id = u.user_id
       WHERE ak.api_key = ? AND ak.is_active = TRUE`,
      [apiKey]
    );

    if (keys.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Неверный API ключ',
        message: 'API ключ не найден или неактивен'
      });
    }

    const keyData = keys[0];

    // Проверяем срок действия
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'API ключ просрочен',
        message: 'Срок действия API ключа истёк'
      });
    }

    // Сохраняем данные пользователя и разрешения
    req.apiUser = {
      userId: keyData.user_id,
      username: keyData.username,
      apiKeyId: keyData.api_key_id,
      permissions: JSON.parse(keyData.permissions)
    };

    // Обновляем время последнего использования
    await db.query(
      'UPDATE external_api_keys SET last_used = NOW() WHERE api_key_id = ?',
      [keyData.api_key_id]
    );

    // Логируем запрос
    await db.query(
      `INSERT INTO api_request_logs 
         (api_key_id, endpoint, method, ip_address, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [keyData.api_key_id, req.path, req.method, req.ip]
    );

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка аутентификации',
      message: 'Внутренняя ошибка сервера'
    });
  }
}

/**
 * Middleware для проверки разрешений
 */
function checkPermission(requiredPermission) {
  return (req, res, next) => {
    if (!req.apiUser.permissions.includes(requiredPermission) && 
        !req.apiUser.permissions.includes('all')) {
      return res.status(403).json({
        success: false,
        error: 'Недостаточно прав',
        message: `Требуется разрешение: ${requiredPermission}`
      });
    }
    next();
  };
}

/**
 * GET /api/external/accounts
 * Получить список счетов
 */
router.get('/accounts', authenticateApiKey, checkPermission('read:accounts'), async (req, res) => {
  try {
    const [accounts] = await db.query(
      `SELECT account_id, account_number, account_type, balance, currency, is_active
       FROM accounts 
       WHERE user_id = ? AND is_active = TRUE`,
      [req.apiUser.userId]
    );

    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('API get accounts error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

/**
 * GET /api/external/accounts/:id/balance
 * Получить баланс счета
 */
router.get('/accounts/:id/balance', authenticateApiKey, checkPermission('read:balance'), async (req, res) => {
  try {
    const [accounts] = await db.query(
      `SELECT account_number, balance, currency
       FROM accounts 
       WHERE account_id = ? AND user_id = ? AND is_active = TRUE`,
      [req.params.id, req.apiUser.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Счет не найден'
      });
    }

    res.json({
      success: true,
      data: accounts[0]
    });
  } catch (error) {
    console.error('API get balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

/**
 * GET /api/external/transactions
 * Получить историю транзакций
 */
router.get('/transactions', authenticateApiKey, checkPermission('read:transactions'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const [transactions] = await db.query(
      `SELECT t.transaction_id, t.amount, t.transaction_type, t.description, 
              t.status, t.created_at,
              fa.account_number as from_account,
              ta.account_number as to_account
       FROM transactions t
       LEFT JOIN accounts fa ON t.from_account_id = fa.account_id
       LEFT JOIN accounts ta ON t.to_account_id = ta.account_id
       WHERE fa.user_id = ? OR ta.user_id = ?
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.apiUser.userId, req.apiUser.userId, limit, offset]
    );

    res.json({
      success: true,
      data: transactions,
      pagination: {
        limit: limit,
        offset: offset
      }
    });
  } catch (error) {
    console.error('API get transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

/**
 * POST /api/external/transfer
 * Создать перевод
 */
router.post('/transfer', authenticateApiKey, checkPermission('create:transfer'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { fromAccountId, toAccountNumber, amount, description } = req.body;
    const sum = parseFloat(amount);

    if (!fromAccountId || !toAccountNumber || !sum || sum <= 0) {
      await conn.release();
      return res.status(400).json({
        success: false,
        error: 'Некорректные данные'
      });
    }

    await conn.beginTransaction();

    const [fromRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ? FOR UPDATE',
      [fromAccountId, req.apiUser.userId]
    );

    if (!fromRows.length || !fromRows[0].is_active || fromRows[0].is_frozen) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        error: 'Счет недоступен'
      });
    }

    const fromAccount = fromRows[0];

    if (fromAccount.balance < sum) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        error: 'Недостаточно средств'
      });
    }

    const [toRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_number = ? FOR UPDATE',
      [toAccountNumber]
    );

    if (!toRows.length || !toRows[0].is_active) {
      await conn.rollback();
      await conn.release();
      return res.status(404).json({
        success: false,
        error: 'Счет получателя не найден'
      });
    }

    const toAccount = toRows[0];

    await conn.query(
      'UPDATE accounts SET balance = balance - ? WHERE account_id = ?',
      [sum, fromAccountId]
    );

    await conn.query(
      'UPDATE accounts SET balance = balance + ? WHERE account_id = ?',
      [sum, toAccount.account_id]
    );

    const [result] = await conn.query(
      `INSERT INTO transactions
         (from_account_id, to_account_id, amount, transaction_type, description, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fromAccountId, toAccount.account_id, sum, 'api_transfer', description || 'API transfer', 'completed']
    );

    await conn.commit();
    await conn.release();

    res.json({
      success: true,
      data: {
        transactionId: result.insertId,
        amount: sum,
        fromAccount: fromAccount.account_number,
        toAccount: toAccount.account_number,
        status: 'completed'
      }
    });
  } catch (error) {
    await conn.rollback();
    await conn.release();
    console.error('API transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

/**
 * GET /api/external/status
 * Проверка статуса API
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Online Banking API v1.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/external/accounts',
      'GET /api/external/accounts/:id/balance',
      'GET /api/external/transactions',
      'POST /api/external/transfer'
    ]
  });
});

module.exports = router;
