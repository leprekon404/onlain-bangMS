const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const { requireAdmin, requireManager } = require('../middleware/adminAuth');
const bcrypt = require('bcrypt');

// ============================================
// АДМИН-ПАНЕЛЬ API
// ============================================

/**
 * GET /api/admin/stats
 * Общая статистика банка
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Общее количество пользователей
    const [usersCount] = await db.query('SELECT COUNT(*) as count FROM users WHERE role_id = 1');
    
    // Общее количество счетов
    const [accountsCount] = await db.query('SELECT COUNT(*) as count FROM accounts WHERE is_active = TRUE');
    
    // Общий баланс в системе
    const [totalBalance] = await db.query('SELECT SUM(balance) as total FROM accounts WHERE is_active = TRUE');
    
    // Транзакции за сегодня
    const [todayTransactions] = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as volume 
       FROM transactions 
       WHERE DATE(created_at) = CURDATE() AND status = 'completed'`
    );
    
    // Транзакции за месяц
    const [monthTransactions] = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as volume 
       FROM transactions 
       WHERE YEAR(created_at) = YEAR(CURDATE()) 
       AND MONTH(created_at) = MONTH(CURDATE())
       AND status = 'completed'`
    );
    
    // Активные пользователи (вошли за последние 7 дней)
    const [activeUsers] = await db.query(
      `SELECT COUNT(DISTINCT user_id) as count 
       FROM user_sessions 
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );
    
    res.json({
      success: true,
      stats: {
        totalUsers: usersCount[0].count,
        totalAccounts: accountsCount[0].count,
        totalBalance: parseFloat(totalBalance[0].total || 0),
        todayTransactions: {
          count: todayTransactions[0].count,
          volume: parseFloat(todayTransactions[0].volume || 0)
        },
        monthTransactions: {
          count: monthTransactions[0].count,
          volume: parseFloat(monthTransactions[0].volume || 0)
        },
        activeUsers: activeUsers[0].count
      }
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении статистики'
    });
  }
});

/**
 * GET /api/admin/users
 * Список всех пользователей
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  
  try {
    let searchCondition = '';
    let params = [];
    
    if (search) {
      searchCondition = `WHERE u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?`;
      const searchPattern = `%${search}%`;
      params = [searchPattern, searchPattern, searchPattern];
    }
    
    const [users] = await db.query(
      `SELECT 
         u.user_id,
         u.username,
         u.email,
         u.full_name,
         u.phone_number,
         u.created_at,
         u.is_verified,
         r.role_name,
         COUNT(a.account_id) as accounts_count,
         SUM(a.balance) as total_balance
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN accounts a ON u.user_id = a.user_id AND a.is_active = TRUE
       ${searchCondition}
       GROUP BY u.user_id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    // Общее количество пользователей
    const [totalCount] = await db.query(
      `SELECT COUNT(*) as count FROM users u ${searchCondition}`,
      params
    );
    
    res.json({
      success: true,
      users: users,
      pagination: {
        page,
        limit,
        total: totalCount[0].count,
        totalPages: Math.ceil(totalCount[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении пользователей'
    });
  }
});

/**
 * GET /api/admin/users/:id
 * Детальная информация о пользователе
 */
router.get('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  
  try {
    // Информация о пользователе
    const [users] = await db.query(
      `SELECT 
         u.*,
         r.role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       WHERE u.user_id = ?`,
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }
    
    const user = users[0];
    delete user.password_hash; // Удаляем хеш пароля
    
    // Счета пользователя
    const [accounts] = await db.query(
      `SELECT * FROM accounts WHERE user_id = ?`,
      [userId]
    );
    
    // Последние транзакции
    const [transactions] = await db.query(
      `SELECT * FROM transactions 
       WHERE from_account_id IN (SELECT account_id FROM accounts WHERE user_id = ?)
       OR to_account_id IN (SELECT account_id FROM accounts WHERE user_id = ?)
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId, userId]
    );
    
    res.json({
      success: true,
      user: user,
      accounts: accounts,
      recentTransactions: transactions
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении данных пользователя'
    });
  }
});

/**
 * PATCH /api/admin/users/:id/block
 * Блокировка/разблокировка пользователя
 */
router.patch('/users/:id/block', authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { blocked, reason } = req.body;
  
  try {
    // Проверяем что это не попытка заблокировать самого себя
    if (parseInt(userId) === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: 'Нельзя заблокировать себя'
      });
    }
    
    // Обновляем статус
    await db.query(
      `UPDATE users SET is_verified = ? WHERE user_id = ?`,
      [!blocked, userId]
    );
    
    // Логируем действие
    await db.query(
      `INSERT INTO admin_logs (admin_id, action_type, target_type, target_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.userId, blocked ? 'USER_BLOCKED' : 'USER_UNBLOCKED', 'user', userId, reason || '']
    );
    
    res.json({
      success: true,
      message: blocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован'
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при изменении статуса пользователя'
    });
  }
});

/**
 * POST /api/admin/users/:id/add-balance
 * Пополнение счета пользователя администратором
 */
router.post('/users/:id/add-balance', authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { accountId, amount, description } = req.body;
  
  if (!accountId || !amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Некорректные параметры'
    });
  }
  
  try {
    // Проверяем что счет принадлежит пользователю
    const [accounts] = await db.query(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ?',
      [accountId, userId]
    );
    
    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Счет не найден'
      });
    }
    
    // Начинаем транзакцию
    await db.query('START TRANSACTION');
    
    // Обновляем баланс
    await db.query(
      'UPDATE accounts SET balance = balance + ? WHERE account_id = ?',
      [amount, accountId]
    );
    
    // Создаем транзакцию
    const [result] = await db.query(
      `INSERT INTO transactions 
       (to_account_id, amount, transaction_type, description, status)
       VALUES (?, ?, ?, ?, ?)`,
      [accountId, amount, 'admin_deposit', description || 'Пополнение администратором', 'completed']
    );
    
    // Логируем действие
    await db.query(
      `INSERT INTO admin_logs (admin_id, action_type, target_type, target_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.userId, 'ADD_BALANCE', 'account', accountId, `Добавлено ${amount} руб.`]
    );
    
    await db.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Баланс успешно пополнен',
      transactionId: result.insertId
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Add balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при пополнении баланса'
    });
  }
});

/**
 * GET /api/admin/transactions
 * Список всех транзакций
 */
router.get('/transactions', authenticateToken, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  
  try {
    const [transactions] = await db.query(
      `SELECT 
         t.*,
         u_from.username as from_username,
         u_to.username as to_username
       FROM transactions t
       LEFT JOIN accounts a_from ON t.from_account_id = a_from.account_id
       LEFT JOIN accounts a_to ON t.to_account_id = a_to.account_id
       LEFT JOIN users u_from ON a_from.user_id = u_from.user_id
       LEFT JOIN users u_to ON a_to.user_id = u_to.user_id
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    const [totalCount] = await db.query('SELECT COUNT(*) as count FROM transactions');
    
    res.json({
      success: true,
      transactions: transactions,
      pagination: {
        page,
        limit,
        total: totalCount[0].count,
        totalPages: Math.ceil(totalCount[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении транзакций'
    });
  }
});

/**
 * GET /api/admin/logs
 * Логи действий администраторов
 */
router.get('/logs', authenticateToken, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  
  try {
    const [logs] = await db.query(
      `SELECT 
         l.*,
         u.username as admin_username
       FROM admin_logs l
       LEFT JOIN users u ON l.admin_id = u.user_id
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    const [totalCount] = await db.query('SELECT COUNT(*) as count FROM admin_logs');
    
    res.json({
      success: true,
      logs: logs,
      pagination: {
        page,
        limit,
        total: totalCount[0].count,
        totalPages: Math.ceil(totalCount[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении логов'
    });
  }
});

module.exports = router;
