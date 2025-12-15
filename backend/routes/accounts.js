const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

// ============================================
// МОДУЛЬ УПРАВЛЕНИЯ СЧЕТАМИ
// ============================================

/**
 * GET /api/accounts
 * Получить все счета текущего пользователя
 */
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const [accounts] = await db.query(
      `SELECT 
        account_id,
        account_number,
        account_type,
        balance,
        currency,
        daily_limit,
        is_active,
        is_frozen,
        created_at
      FROM accounts 
      WHERE user_id = ? 
      ORDER BY created_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      count: accounts.length,
      accounts: accounts
    });
  } catch (error) {
    console.error('Ошибка получения счетов:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении списка счетов'
    });
  }
});

/**
 * GET /api/accounts/user/summary
 * Получить сводку по всем счетам (общий баланс, количество счетов)
 * ВАЖНО: Этот маршрут должен быть ДО /:accountId
 */
router.get('/user/summary', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const [summary] = await db.query(
      `SELECT 
        COUNT(*) as total_accounts,
        COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_accounts,
        COUNT(CASE WHEN is_frozen = TRUE THEN 1 END) as frozen_accounts,
        SUM(CASE WHEN is_active = TRUE THEN balance ELSE 0 END) as total_balance,
        GROUP_CONCAT(DISTINCT currency) as currencies
      FROM accounts 
      WHERE user_id = ?`,
      [userId]
    );
    
    res.json({
      success: true,
      summary: {
        totalAccounts: summary[0].total_accounts,
        activeAccounts: summary[0].active_accounts,
        frozenAccounts: summary[0].frozen_accounts,
        totalBalance: parseFloat(summary[0].total_balance || 0),
        currencies: summary[0].currencies ? summary[0].currencies.split(',') : []
      }
    });
  } catch (error) {
    console.error('Ошибка получения сводки:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении сводки по счетам'
    });
  }
});

/**
 * GET /api/accounts/:accountId
 * Получить информацию о конкретном счете
 */
router.get('/:accountId', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const accountId = req.params.accountId;
  
  try {
    const [accounts] = await db.query(
      `SELECT 
        a.account_id,
        a.account_number,
        a.account_type,
        a.balance,
        a.currency,
        a.daily_limit,
        a.is_active,
        a.is_frozen,
        a.created_at,
        u.full_name,
        u.email
      FROM accounts a
      JOIN users u ON a.user_id = u.user_id
      WHERE a.account_id = ? AND a.user_id = ?`,
      [accountId, userId]
    );
    
    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Счет не найден'
      });
    }
    
    res.json({
      success: true,
      account: accounts[0]
    });
  } catch (error) {
    console.error('Ошибка получения счета:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении информации о счете'
    });
  }
});

/**
 * GET /api/accounts/:accountId/balance
 * Получить баланс конкретного счета
 */
router.get('/:accountId/balance', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const accountId = req.params.accountId;
  
  try {
    const [accounts] = await db.query(
      `SELECT 
        account_id,
        account_number,
        balance,
        currency,
        account_type,
        is_active,
        is_frozen
      FROM accounts 
      WHERE account_id = ? AND user_id = ?`,
      [accountId, userId]
    );
    
    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Счет не найден'
      });
    }
    
    const account = accounts[0];
    
    if (!account.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Счет закрыт'
      });
    }
    
    if (account.is_frozen) {
      return res.status(400).json({
        success: false,
        message: 'Счет заморожен',
        balance: account.balance,
        currency: account.currency
      });
    }
    
    res.json({
      success: true,
      accountId: account.account_id,
      accountNumber: account.account_number,
      balance: parseFloat(account.balance),
      currency: account.currency,
      accountType: account.account_type
    });
  } catch (error) {
    console.error('Ошибка получения баланса:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении баланса'
    });
  }
});

/**
 * GET /api/accounts/:accountId/transactions
 * Получить историю транзакций по счету с пагинацией
 */
router.get('/:accountId/transactions', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const accountId = req.params.accountId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;
  const transactionType = req.query.type;
  const status = req.query.status;
  
  try {
    const [accountCheck] = await db.query(
      'SELECT account_id FROM accounts WHERE account_id = ? AND user_id = ?',
      [accountId, userId]
    );
    
    if (accountCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Счет не найден'
      });
    }
    
    let whereConditions = ['(t.from_account_id = ? OR t.to_account_id = ?)'];
    let queryParams = [accountId, accountId];
    
    if (startDate) {
      whereConditions.push('t.created_at >= ?');
      queryParams.push(startDate);
    }
    
    if (endDate) {
      whereConditions.push('t.created_at <= ?');
      queryParams.push(endDate);
    }
    
    if (transactionType) {
      whereConditions.push('t.transaction_type = ?');
      queryParams.push(transactionType);
    }
    
    if (status) {
      whereConditions.push('t.status = ?');
      queryParams.push(status);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total 
       FROM transactions t 
       WHERE ${whereClause}`,
      queryParams
    );
    
    const totalTransactions = countResult[0].total;
    const totalPages = Math.ceil(totalTransactions / limit);
    
    const [transactions] = await db.query(
      `SELECT 
        t.transaction_id,
        t.from_account_id,
        t.to_account_id,
        t.amount,
        t.transaction_type,
        t.description,
        t.status,
        t.created_at,
        from_acc.account_number as from_account_number,
        to_acc.account_number as to_account_number,
        CASE 
          WHEN t.from_account_id = ? THEN 'debit'
          WHEN t.to_account_id = ? THEN 'credit'
          ELSE 'unknown'
        END as direction
      FROM transactions t
      LEFT JOIN accounts from_acc ON t.from_account_id = from_acc.account_id
      LEFT JOIN accounts to_acc ON t.to_account_id = to_acc.account_id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, accountId, accountId, ...queryParams, limit, offset]
    );
    
    res.json({
      success: true,
      accountId: parseInt(accountId),
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalTransactions: totalTransactions,
        transactionsPerPage: limit
      },
      transactions: transactions.map(tx => ({
        transactionId: tx.transaction_id,
        amount: parseFloat(tx.amount),
        type: tx.transaction_type,
        direction: tx.direction,
        description: tx.description,
        status: tx.status,
        fromAccount: tx.from_account_number,
        toAccount: tx.to_account_number,
        createdAt: tx.created_at
      }))
    });
  } catch (error) {
    console.error('Ошибка получения транзакций:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении истории транзакций'
    });
  }
});

/**
 * POST /api/accounts
 * Создать новый счет
 */
router.post('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { accountType, currency, dailyLimit, pin } = req.body;
  
  if (!accountType || !['debit', 'credit', 'savings'].includes(accountType)) {
    return res.status(400).json({
      success: false,
      message: 'Неверный тип счета. Доступны: debit, credit, savings'
    });
  }
  
  const accountCurrency = currency || 'RUB';
  
  try {
    const accountNumber = '4276' + Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
    
    let pinHash = null;
    if (pin) {
      const bcrypt = require('bcrypt');
      pinHash = await bcrypt.hash(pin, 10);
    }
    
    const [result] = await db.query(
      `INSERT INTO accounts 
        (user_id, account_number, account_type, balance, currency, daily_limit, pin_hash) 
       VALUES (?, ?, ?, 0.00, ?, ?, ?)`,
      [userId, accountNumber, accountType, accountCurrency, dailyLimit || null, pinHash]
    );
    
    const [newAccount] = await db.query(
      'SELECT * FROM accounts WHERE account_id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Счет успешно создан',
      account: {
        accountId: newAccount[0].account_id,
        accountNumber: newAccount[0].account_number,
        accountType: newAccount[0].account_type,
        balance: parseFloat(newAccount[0].balance),
        currency: newAccount[0].currency,
        dailyLimit: newAccount[0].daily_limit ? parseFloat(newAccount[0].daily_limit) : null,
        isActive: newAccount[0].is_active,
        createdAt: newAccount[0].created_at
      }
    });
  } catch (error) {
    console.error('Ошибка создания счета:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при создании счета'
    });
  }
});

/**
 * PATCH /api/accounts/:accountId
 * Обновить параметры счета
 */
router.patch('/:accountId', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const accountId = req.params.accountId;
  const { dailyLimit, isFrozen } = req.body;
  
  try {
    const [accountCheck] = await db.query(
      'SELECT account_id, is_active FROM accounts WHERE account_id = ? AND user_id = ?',
      [accountId, userId]
    );
    
    if (accountCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Счет не найден'
      });
    }
    
    if (!accountCheck[0].is_active) {
      return res.status(400).json({
        success: false,
        message: 'Невозможно изменить закрытый счет'
      });
    }
    
    const updates = [];
    const params = [];
    
    if (dailyLimit !== undefined) {
      updates.push('daily_limit = ?');
      params.push(dailyLimit);
    }
    
    if (isFrozen !== undefined) {
      updates.push('is_frozen = ?');
      params.push(isFrozen);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Нет данных для обновления'
      });
    }
    
    params.push(accountId, userId);
    
    await db.query(
      `UPDATE accounts SET ${updates.join(', ')} WHERE account_id = ? AND user_id = ?`,
      params
    );
    
    const [updatedAccount] = await db.query(
      'SELECT * FROM accounts WHERE account_id = ?',
      [accountId]
    );
    
    res.json({
      success: true,
      message: 'Счет успешно обновлен',
      account: updatedAccount[0]
    });
  } catch (error) {
    console.error('Ошибка обновления счета:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении счета'
    });
  }
});

/**
 * DELETE /api/accounts/:accountId
 * Закрыть счет
 */
router.delete('/:accountId', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const accountId = req.params.accountId;
  
  try {
    const [accounts] = await db.query(
      'SELECT account_id, balance, is_active FROM accounts WHERE account_id = ? AND user_id = ?',
      [accountId, userId]
    );
    
    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Счет не найден'
      });
    }
    
    const account = accounts[0];
    
    if (!account.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Счет уже закрыт'
      });
    }
    
    if (parseFloat(account.balance) !== 0) {
      return res.status(400).json({
        success: false,
        message: `Невозможно закрыть счет с ненулевым балансом. Текущий баланс: ${account.balance}`,
        balance: parseFloat(account.balance)
      });
    }
    
    await db.query(
      'UPDATE accounts SET is_active = FALSE WHERE account_id = ?',
      [accountId]
    );
    
    res.json({
      success: true,
      message: 'Счет успешно закрыт',
      accountId: parseInt(accountId)
    });
  } catch (error) {
    console.error('Ошибка закрытия счета:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при закрытии счета'
    });
  }
});

module.exports = router;
