const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

// ============================================
// МОДУЛЬ АНАЛИТИКИ
// ============================================

/**
 * GET /api/analytics/summary
 * Общая сводка по финансам
 */
router.get('/summary', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const period = req.query.period || 'month';
  
  try {
    let dateCondition = '';
    
    switch (period) {
      case 'day':
        dateCondition = "AND DATE(t.created_at) = CURDATE()";
        break;
      case 'week':
        dateCondition = "AND YEARWEEK(t.created_at, 1) = YEARWEEK(CURDATE(), 1)";
        break;
      case 'month':
        dateCondition = "AND YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())";
        break;
      case 'year':
        dateCondition = "AND YEAR(t.created_at) = YEAR(CURDATE())";
        break;
      default:
        dateCondition = '';
    }
    
    // Получаем текущий баланс по всем счетам
    const [balance] = await db.query(
      'SELECT SUM(balance) as total_balance FROM accounts WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );
    
    // Получаем ID всех счетов пользователя
    const [userAccounts] = await db.query(
      'SELECT account_id FROM accounts WHERE user_id = ?',
      [userId]
    );
    const accountIds = userAccounts.map(a => a.account_id);
    
    if (accountIds.length === 0) {
      return res.json({
        success: true,
        period: period,
        summary: {
          totalBalance: 0,
          totalIncome: 0,
          totalExpense: 0,
          netSavings: 0,
          savingsRate: 0,
          totalTransactions: 0,
          avgExpense: 0
        }
      });
    }
    
    // Рассчитываем доходы и расходы
    // Доходы - транзакции, где to_account - счет пользователя, а from_account - не его
    // Расходы - транзакции, где from_account - счет пользователя, а to_account - не его
    const [summary] = await db.query(
      `SELECT 
         SUM(CASE 
           WHEN t.to_account_id IN (?) AND 
                (t.from_account_id IS NULL OR t.from_account_id NOT IN (?))
           THEN t.amount 
           ELSE 0 
         END) as total_income,
         SUM(CASE 
           WHEN t.from_account_id IN (?) AND 
                (t.to_account_id IS NULL OR t.to_account_id NOT IN (?))
           THEN t.amount 
           ELSE 0 
         END) as total_expense,
         COUNT(DISTINCT CASE 
           WHEN (t.from_account_id IN (?) OR t.to_account_id IN (?))
           THEN t.transaction_id 
           ELSE NULL 
         END) as total_transactions
       FROM transactions t
       WHERE t.status = 'completed'
       ${dateCondition}`,
      [accountIds, accountIds, accountIds, accountIds, accountIds, accountIds]
    );
    
    const totalIncome = parseFloat(summary[0].total_income || 0);
    const totalExpense = parseFloat(summary[0].total_expense || 0);
    const netSavings = totalIncome - totalExpense;
    
    res.json({
      success: true,
      period: period,
      summary: {
        totalBalance: parseFloat(balance[0].total_balance || 0),
        totalIncome: totalIncome,
        totalExpense: totalExpense,
        netSavings: netSavings,
        savingsRate: totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(2) : 0,
        totalTransactions: summary[0].total_transactions || 0,
        avgExpense: totalExpense > 0 ? (totalExpense / (summary[0].total_transactions || 1)).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении сводки'
    });
  }
});

/**
 * GET /api/analytics/spending-by-category
 * Расходы по категориям
 */
router.get('/spending-by-category', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const period = req.query.period || 'month';
  
  try {
    let dateCondition = '';
    
    switch (period) {
      case 'day':
        dateCondition = "AND DATE(t.created_at) = CURDATE()";
        break;
      case 'week':
        dateCondition = "AND YEARWEEK(t.created_at, 1) = YEARWEEK(CURDATE(), 1)";
        break;
      case 'month':
        dateCondition = "AND YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())";
        break;
      case 'year':
        dateCondition = "AND YEAR(t.created_at) = YEAR(CURDATE())";
        break;
    }
    
    // Получаем ID счетов пользователя
    const [userAccounts] = await db.query(
      'SELECT account_id FROM accounts WHERE user_id = ?',
      [userId]
    );
    const accountIds = userAccounts.map(a => a.account_id);
    
    if (accountIds.length === 0) {
      return res.json({
        success: true,
        period: period,
        categories: [],
        totalSpent: 0
      });
    }
    
    const [categories] = await db.query(
      `SELECT 
         COALESCE(tc.category_name, 'Без категории') as category,
         COALESCE(tc.icon, '📦') as icon,
         COALESCE(tc.color, '#B2BEC3') as color,
         SUM(t.amount) as total,
         COUNT(t.transaction_id) as count
       FROM transactions t
       LEFT JOIN transaction_category_mapping tcm ON t.transaction_id = tcm.transaction_id
       LEFT JOIN transaction_categories tc ON tcm.category_id = tc.category_id
       WHERE t.from_account_id IN (?) 
       AND (t.to_account_id IS NULL OR t.to_account_id NOT IN (?))
       AND t.status = 'completed' 
       ${dateCondition}
       GROUP BY tc.category_id, tc.category_name, tc.icon, tc.color
       ORDER BY total DESC
       LIMIT 20`,
      [accountIds, accountIds]
    );
    
    const total = categories.reduce((sum, cat) => sum + parseFloat(cat.total), 0);
    
    res.json({
      success: true,
      period: period,
      categories: categories.map(cat => ({
        category: cat.category,
        icon: cat.icon,
        color: cat.color,
        total: parseFloat(cat.total),
        count: cat.count,
        percentage: total > 0 ? ((parseFloat(cat.total) / total) * 100).toFixed(1) : 0
      })),
      totalSpent: total
    });
  } catch (error) {
    console.error('Get spending by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении расходов по категориям'
    });
  }
});

/**
 * GET /api/analytics/income-expense-trend
 * Тренд доходов и расходов по месяцам
 */
router.get('/income-expense-trend', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const months = parseInt(req.query.months) || 12;
  
  try {
    // Получаем ID счетов
    const [userAccounts] = await db.query(
      'SELECT account_id FROM accounts WHERE user_id = ?',
      [userId]
    );
    const accountIds = userAccounts.map(a => a.account_id);
    
    if (accountIds.length === 0) {
      return res.json({
        success: true,
        trend: []
      });
    }
    
    const [trend] = await db.query(
      `SELECT 
         DATE_FORMAT(t.created_at, '%Y-%m') as month,
         SUM(CASE 
           WHEN t.to_account_id IN (?) AND 
                (t.from_account_id IS NULL OR t.from_account_id NOT IN (?))
           THEN t.amount 
           ELSE 0 
         END) as income,
         SUM(CASE 
           WHEN t.from_account_id IN (?) AND 
                (t.to_account_id IS NULL OR t.to_account_id NOT IN (?))
           THEN t.amount 
           ELSE 0 
         END) as expense
       FROM transactions t
       WHERE t.status = 'completed'
       AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month
       ORDER BY month ASC`,
      [accountIds, accountIds, accountIds, accountIds, months]
    );
    
    res.json({
      success: true,
      trend: trend.map(item => ({
        month: item.month,
        income: parseFloat(item.income || 0),
        expense: parseFloat(item.expense || 0),
        balance: parseFloat(item.income || 0) - parseFloat(item.expense || 0)
      }))
    });
  } catch (error) {
    console.error('Get income-expense trend error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении трендов'
    });
  }
});

/**
 * GET /api/analytics/categories
 * Список категорий транзакций
 */
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const [categories] = await db.query(
      `SELECT category_id, category_name, category_type, icon, color, parent_category_id, is_system
       FROM transaction_categories
       WHERE is_active = TRUE
       ORDER BY category_type, category_name`
    );
    
    res.json({
      success: true,
      categories: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении категорий'
    });
  }
});

/**
 * POST /api/analytics/categories
 * Создать пользовательскую категорию
 */
router.post('/categories', authenticateToken, async (req, res) => {
  const { categoryName, categoryType, icon, color, parentCategoryId } = req.body;
  
  if (!categoryName || !categoryType) {
    return res.status(400).json({
      success: false,
      message: 'categoryName и categoryType обязательны'
    });
  }
  
  if (!['income', 'expense'].includes(categoryType)) {
    return res.status(400).json({
      success: false,
      message: 'categoryType должен быть income или expense'
    });
  }
  
  try {
    const [result] = await db.query(
      `INSERT INTO transaction_categories (category_name, category_type, icon, color, parent_category_id, is_system)
       VALUES (?, ?, ?, ?, ?, FALSE)`,
      [categoryName, categoryType, icon || null, color || null, parentCategoryId || null]
    );
    
    res.status(201).json({
      success: true,
      categoryId: result.insertId,
      message: 'Категория создана'
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при создании категории'
    });
  }
});

/**
 * POST /api/analytics/assign-category
 * Назначить категорию транзакции
 */
router.post('/assign-category', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { transactionId, categoryId } = req.body;
  
  if (!transactionId || !categoryId) {
    return res.status(400).json({
      success: false,
      message: 'transactionId и categoryId обязательны'
    });
  }
  
  try {
    // Проверяем что транзакция принадлежит пользователю
    const [transactions] = await db.query(
      `SELECT t.transaction_id
       FROM transactions t
       INNER JOIN accounts a ON (t.from_account_id = a.account_id OR t.to_account_id = a.account_id)
       WHERE t.transaction_id = ? AND a.user_id = ?
       LIMIT 1`,
      [transactionId, userId]
    );
    
    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Транзакция не найдена'
      });
    }
    
    await db.query(
      `INSERT INTO transaction_category_mapping (transaction_id, category_id, assigned_by)
       VALUES (?, ?, 'user')
       ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), assigned_by = 'user'`,
      [transactionId, categoryId]
    );
    
    res.json({
      success: true,
      message: 'Категория назначена'
    });
  } catch (error) {
    console.error('Assign category error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при назначении категории'
    });
  }
});

/**
 * GET /api/analytics/budgets
 * Получить бюджеты пользователя
 */
router.get('/budgets', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const [budgets] = await db.query(
      `SELECT 
         b.*,
         tc.category_name,
         tc.icon,
         tc.color
       FROM budgets b
       LEFT JOIN transaction_categories tc ON b.category_id = tc.category_id
       WHERE b.user_id = ? AND b.is_active = TRUE
       ORDER BY b.created_at DESC`,
      [userId]
    );
    
    // Получаем ID счетов
    const [userAccounts] = await db.query(
      'SELECT account_id FROM accounts WHERE user_id = ?',
      [userId]
    );
    const accountIds = userAccounts.map(a => a.account_id);
    
    // Для каждого бюджета вычисляем текущие расходы
    for (let budget of budgets) {
      if (accountIds.length > 0) {
        const [spending] = await db.query(
          `SELECT COALESCE(SUM(t.amount), 0) as spent
           FROM transactions t
           LEFT JOIN transaction_category_mapping tcm ON t.transaction_id = tcm.transaction_id
           WHERE t.from_account_id IN (?)
           AND (t.to_account_id IS NULL OR t.to_account_id NOT IN (?))
           AND t.status = 'completed'
           AND t.created_at >= ?
           AND (? IS NULL OR t.created_at <= ?)
           AND (? IS NULL OR tcm.category_id = ?)`,
          [
            accountIds,
            accountIds,
            budget.start_date,
            budget.end_date,
            budget.end_date,
            budget.category_id,
            budget.category_id
          ]
        );
        
        budget.spent = parseFloat(spending[0].spent || 0);
      } else {
        budget.spent = 0;
      }
      
      budget.remaining = parseFloat(budget.budget_amount) - budget.spent;
      budget.percentage = ((budget.spent / parseFloat(budget.budget_amount)) * 100).toFixed(1);
    }
    
    res.json({
      success: true,
      budgets: budgets
    });
  } catch (error) {
    console.error('Get budgets error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении бюджетов'
    });
  }
});

/**
 * POST /api/analytics/budgets
 * Создать бюджет
 */
router.post('/budgets', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { budgetName, budgetAmount, categoryId, periodType, startDate, endDate, alertThreshold } = req.body;
  
  if (!budgetName || !budgetAmount || !periodType || !startDate) {
    return res.status(400).json({
      success: false,
      message: 'budgetName, budgetAmount, periodType и startDate обязательны'
    });
  }
  
  try {
    const [result] = await db.query(
      `INSERT INTO budgets 
         (user_id, category_id, budget_name, budget_amount, period_type, start_date, end_date, alert_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, categoryId || null, budgetName, budgetAmount, periodType, startDate, endDate || null, alertThreshold || null]
    );
    
    res.status(201).json({
      success: true,
      budgetId: result.insertId,
      message: 'Бюджет создан'
    });
  } catch (error) {
    console.error('Create budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при создании бюджета'
    });
  }
});

/**
 * DELETE /api/analytics/budgets/:id
 * Удалить бюджет
 */
router.delete('/budgets/:id', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const budgetId = req.params.id;
  
  try {
    const [result] = await db.query(
      'DELETE FROM budgets WHERE budget_id = ? AND user_id = ?',
      [budgetId, userId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Бюджет не найден'
      });
    }
    
    res.json({
      success: true,
      message: 'Бюджет удален'
    });
  } catch (error) {
    console.error('Delete budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении бюджета'
    });
  }
});

/**
 * GET /api/analytics/goals
 * Получить финансовые цели
 */
router.get('/goals', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const [goals] = await db.query(
      `SELECT *
       FROM financial_goals
       WHERE user_id = ?
       ORDER BY priority DESC, target_date ASC`,
      [userId]
    );
    
    res.json({
      success: true,
      goals: goals.map(goal => ({
        ...goal,
        progress: ((parseFloat(goal.current_amount) / parseFloat(goal.target_amount)) * 100).toFixed(1)
      }))
    });
  } catch (error) {
    console.error('Get goals error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении целей'
    });
  }
});

/**
 * POST /api/analytics/goals
 * Создать финансовую цель
 */
router.post('/goals', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { goalName, goalDescription, targetAmount, targetDate, priority } = req.body;
  
  if (!goalName || !targetAmount) {
    return res.status(400).json({
      success: false,
      message: 'goalName и targetAmount обязательны'
    });
  }
  
  try {
    const [result] = await db.query(
      `INSERT INTO financial_goals 
         (user_id, goal_name, goal_description, target_amount, target_date, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, goalName, goalDescription || null, targetAmount, targetDate || null, priority || 'medium']
    );
    
    res.status(201).json({
      success: true,
      goalId: result.insertId,
      message: 'Цель создана'
    });
  } catch (error) {
    console.error('Create goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при создании цели'
    });
  }
});

/**
 * PATCH /api/analytics/goals/:id
 * Обновить прогресс цели
 */
router.patch('/goals/:id', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const goalId = req.params.id;
  const { currentAmount } = req.body;
  
  if (currentAmount === undefined) {
    return res.status(400).json({
      success: false,
      message: 'currentAmount обязателен'
    });
  }
  
  try {
    const [result] = await db.query(
      'UPDATE financial_goals SET current_amount = ? WHERE goal_id = ? AND user_id = ?',
      [currentAmount, goalId, userId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Цель не найдена'
      });
    }
    
    res.json({
      success: true,
      message: 'Прогресс обновлен'
    });
  } catch (error) {
    console.error('Update goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении цели'
    });
  }
});

module.exports = router;
