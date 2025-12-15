const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

// ============================================
// МОДУЛЬ ПЛАТЕЖЕЙ И ПЕРЕВОДОВ
// ============================================

/**
 * POST /api/payments/internal-transfer
 * Внутренний перевод между счетами в системе
 */
router.post('/internal-transfer', authenticateToken, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { fromAccountId, toAccountNumber, amount, description } = req.body;
    const userId = req.user.userId;
    const sum = parseFloat(amount);

    if (!fromAccountId || !toAccountNumber || !sum || sum <= 0) {
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Некорректные данные перевода'
      });
    }

    await conn.beginTransaction();

    // Проверяем счет отправителя
    const [fromRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ? FOR UPDATE',
      [fromAccountId, userId]
    );

    if (!fromRows.length) {
      await conn.rollback();
      await conn.release();
      return res.status(404).json({
        success: false,
        message: 'Счёт отправителя не найден'
      });
    }

    const fromAccount = fromRows[0];

    if (!fromAccount.is_active) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Счёт отправителя закрыт'
      });
    }

    if (fromAccount.is_frozen) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Счёт отправителя заморожен'
      });
    }

    // Проверяем дневной лимит
    if (fromAccount.daily_limit) {
      const today = new Date().toISOString().split('T')[0];
      const [limitCheck] = await conn.query(
        `SELECT SUM(amount) as today_total 
         FROM transactions 
         WHERE from_account_id = ? 
         AND DATE(created_at) = ? 
         AND status = 'completed'`,
        [fromAccountId, today]
      );
      
      const todayTotal = parseFloat(limitCheck[0].today_total || 0);
      if (todayTotal + sum > parseFloat(fromAccount.daily_limit)) {
        await conn.rollback();
        await conn.release();
        return res.status(400).json({
          success: false,
          message: `Превышен дневной лимит. Доступно: ${parseFloat(fromAccount.daily_limit) - todayTotal}`
        });
      }
    }

    // Проверяем баланс
    if (fromAccount.balance < sum) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Недостаточно средств'
      });
    }

    // Находим счет получателя по номеру
    const [toRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_number = ? FOR UPDATE',
      [toAccountNumber]
    );

    if (!toRows.length) {
      await conn.rollback();
      await conn.release();
      return res.status(404).json({
        success: false,
        message: 'Счёт получателя не найден'
      });
    }

    const toAccount = toRows[0];

    if (!toAccount.is_active) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Счёт получателя закрыт'
      });
    }

    // Выполняем перевод
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
      [fromAccountId, toAccount.account_id, sum, 'internal_transfer', description || 'Внутренний перевод', 'completed']
    );

    await conn.commit();
    await conn.release();

    res.json({
      success: true,
      message: 'Перевод выполнен успешно',
      transaction: {
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
    console.error('Internal transfer error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при выполнении перевода'
    });
  }
});

/**
 * POST /api/payments/external-transfer
 * Внешний перевод (имитация перевода в другой банк)
 */
router.post('/external-transfer', authenticateToken, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { fromAccountId, bankName, accountNumber, recipientName, amount, description } = req.body;
    const userId = req.user.userId;
    const sum = parseFloat(amount);

    if (!fromAccountId || !bankName || !accountNumber || !recipientName || !sum || sum <= 0) {
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Некорректные данные перевода'
      });
    }

    await conn.beginTransaction();

    const [fromRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ? FOR UPDATE',
      [fromAccountId, userId]
    );

    if (!fromRows.length || !fromRows[0].is_active || fromRows[0].is_frozen) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Проблема со счётом отправителя'
      });
    }

    const fromAccount = fromRows[0];

    // Комиссия за внешний перевод (например, 1% или минимум 10 руб)
    const commission = Math.max(sum * 0.01, 10);
    const totalAmount = sum + commission;

    if (fromAccount.balance < totalAmount) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        message: `Недостаточно средств. Требуется ${totalAmount} (сумма ${sum} + комиссия ${commission})`
      });
    }

    // Списываем деньги
    await conn.query(
      'UPDATE accounts SET balance = balance - ? WHERE account_id = ?',
      [totalAmount, fromAccountId]
    );

    // Создаем транзакцию
    const fullDescription = `Внешний перевод в ${bankName} на счет ${accountNumber} (${recipientName}). ${description || ''}`;
    
    const [result] = await conn.query(
      `INSERT INTO transactions
         (from_account_id, to_account_id, amount, transaction_type, description, status)
       VALUES (?, NULL, ?, ?, ?, ?)`,
      [fromAccountId, sum, 'external_transfer', fullDescription, 'completed']
    );

    // Записываем комиссию как отдельную транзакцию
    await conn.query(
      `INSERT INTO transactions
         (from_account_id, to_account_id, amount, transaction_type, description, status)
       VALUES (?, NULL, ?, ?, ?, ?)`,
      [fromAccountId, commission, 'commission', 'Комиссия за внешний перевод', 'completed']
    );

    await conn.commit();
    await conn.release();

    res.json({
      success: true,
      message: 'Внешний перевод выполнен успешно',
      transaction: {
        transactionId: result.insertId,
        amount: sum,
        commission: commission,
        totalAmount: totalAmount,
        recipientBank: bankName,
        recipientAccount: accountNumber,
        recipientName: recipientName,
        status: 'completed'
      }
    });
  } catch (error) {
    await conn.rollback();
    await conn.release();
    console.error('External transfer error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при выполнении внешнего перевода'
    });
  }
});

/**
 * POST /api/payments/service-payment
 * Оплата услуг (коммунальные, мобильная связь, интернет и т.д.)
 */
router.post('/service-payment', authenticateToken, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { fromAccountId, serviceType, serviceProvider, accountNumber, amount, description } = req.body;
    const userId = req.user.userId;
    const sum = parseFloat(amount);

    if (!fromAccountId || !serviceType || !serviceProvider || !accountNumber || !sum || sum <= 0) {
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Некорректные данные платежа'
      });
    }

    await conn.beginTransaction();

    const [fromRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ? FOR UPDATE',
      [fromAccountId, userId]
    );

    if (!fromRows.length || !fromRows[0].is_active || fromRows[0].is_frozen) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Проблема со счётом'
      });
    }

    const fromAccount = fromRows[0];

    if (fromAccount.balance < sum) {
      await conn.rollback();
      await conn.release();
      return res.status(400).json({
        success: false,
        message: 'Недостаточно средств'
      });
    }

    await conn.query(
      'UPDATE accounts SET balance = balance - ? WHERE account_id = ?',
      [sum, fromAccountId]
    );

    const fullDescription = `Оплата услуг: ${serviceType} (${serviceProvider}), лицевой счет: ${accountNumber}. ${description || ''}`;
    
    const [result] = await conn.query(
      `INSERT INTO transactions
         (from_account_id, to_account_id, amount, transaction_type, description, status)
       VALUES (?, NULL, ?, ?, ?, ?)`,
      [fromAccountId, sum, 'service_payment', fullDescription, 'completed']
    );

    await conn.commit();
    await conn.release();

    res.json({
      success: true,
      message: 'Платёж выполнен успешно',
      transaction: {
        transactionId: result.insertId,
        amount: sum,
        serviceType: serviceType,
        serviceProvider: serviceProvider,
        accountNumber: accountNumber,
        status: 'completed'
      }
    });
  } catch (error) {
    await conn.rollback();
    await conn.release();
    console.error('Service payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при выполнении платежа'
    });
  }
});

/**
 * POST /api/payments/templates
 * Создать шаблон платежа
 */
router.post('/templates', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, paymentType, fromAccountId, toAccountNumber, amount, description, serviceType, serviceProvider } = req.body;

    if (!name || !paymentType || !fromAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Некорректные данные шаблона'
      });
    }

    const templateData = {
      payment_type: paymentType,
      from_account_id: fromAccountId,
      to_account_number: toAccountNumber || null,
      amount: amount || null,
      description: description || null,
      service_type: serviceType || null,
      service_provider: serviceProvider || null
    };

    const [result] = await db.query(
      `INSERT INTO payment_templates
         (user_id, template_name, template_data, created_at)
       VALUES (?, ?, ?, NOW())`,
      [userId, name, JSON.stringify(templateData)]
    );

    res.status(201).json({
      success: true,
      message: 'Шаблон создан успешно',
      template: {
        templateId: result.insertId,
        name: name,
        paymentType: paymentType
      }
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при создании шаблона'
    });
  }
});

/**
 * GET /api/payments/templates
 * Получить все шаблоны пользователя
 */
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [templates] = await db.query(
      'SELECT * FROM payment_templates WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    const parsedTemplates = templates.map(template => ({
      templateId: template.template_id,
      name: template.template_name,
      data: JSON.parse(template.template_data),
      createdAt: template.created_at,
      lastUsed: template.last_used
    }));

    res.json({
      success: true,
      count: parsedTemplates.length,
      templates: parsedTemplates
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении шаблонов'
    });
  }
});

/**
 * POST /api/payments/templates/:id/execute
 * Выполнить платеж по шаблону
 */
router.post('/templates/:id/execute', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const templateId = req.params.id;

    const [templates] = await db.query(
      'SELECT * FROM payment_templates WHERE template_id = ? AND user_id = ?',
      [templateId, userId]
    );

    if (templates.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не найден'
      });
    }

    const template = templates[0];
    const templateData = JSON.parse(template.template_data);

    // Обновляем время последнего использования
    await db.query(
      'UPDATE payment_templates SET last_used = NOW() WHERE template_id = ?',
      [templateId]
    );

    // Перенаправляем на соответствующий эндпоинт
    req.body = {
      fromAccountId: templateData.from_account_id,
      toAccountNumber: templateData.to_account_number,
      amount: req.body.amount || templateData.amount,
      description: templateData.description,
      serviceType: templateData.service_type,
      serviceProvider: templateData.service_provider
    };

    // В зависимости от типа вызываем нужный обработчик
    if (templateData.payment_type === 'internal_transfer') {
      return router.handle({
        ...req,
        method: 'POST',
        url: '/internal-transfer'
      }, res);
    } else if (templateData.payment_type === 'service_payment') {
      return router.handle({
        ...req,
        method: 'POST',
        url: '/service-payment'
      }, res);
    }

    res.json({
      success: true,
      message: 'Платеж по шаблону выполнен'
    });
  } catch (error) {
    console.error('Execute template error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при выполнении платежа по шаблону'
    });
  }
});

/**
 * DELETE /api/payments/templates/:id
 * Удалить шаблон
 */
router.delete('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const templateId = req.params.id;

    const [result] = await db.query(
      'DELETE FROM payment_templates WHERE template_id = ? AND user_id = ?',
      [templateId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не найден'
      });
    }

    res.json({
      success: true,
      message: 'Шаблон удалён'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении шаблона'
    });
  }
});

/**
 * POST /api/payments/auto-payments
 * Создать автоплатеж (регулярный платеж)
 */
router.post('/auto-payments', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { templateId, frequency, nextExecutionDate, isActive } = req.body;

    if (!templateId || !frequency || !nextExecutionDate) {
      return res.status(400).json({
        success: false,
        message: 'Некорректные данные автоплатежа'
      });
    }

    // Проверяем существование шаблона
    const [templates] = await db.query(
      'SELECT * FROM payment_templates WHERE template_id = ? AND user_id = ?',
      [templateId, userId]
    );

    if (templates.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не найден'
      });
    }

    const [result] = await db.query(
      `INSERT INTO auto_payments
         (user_id, template_id, frequency, next_execution_date, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, templateId, frequency, nextExecutionDate, isActive !== false]
    );

    res.status(201).json({
      success: true,
      message: 'Автоплатеж создан',
      autoPayment: {
        autoPaymentId: result.insertId,
        templateId: templateId,
        frequency: frequency,
        nextExecutionDate: nextExecutionDate,
        isActive: isActive !== false
      }
    });
  } catch (error) {
    console.error('Create auto-payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при создании автоплатежа'
    });
  }
});

/**
 * GET /api/payments/auto-payments
 * Получить все автоплатежи пользователя
 */
router.get('/auto-payments', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [autoPayments] = await db.query(
      `SELECT ap.*, pt.template_name, pt.template_data
       FROM auto_payments ap
       JOIN payment_templates pt ON ap.template_id = pt.template_id
       WHERE ap.user_id = ?
       ORDER BY ap.next_execution_date ASC`,
      [userId]
    );

    const parsedAutoPayments = autoPayments.map(ap => ({
      autoPaymentId: ap.auto_payment_id,
      templateId: ap.template_id,
      templateName: ap.template_name,
      templateData: JSON.parse(ap.template_data),
      frequency: ap.frequency,
      nextExecutionDate: ap.next_execution_date,
      lastExecutionDate: ap.last_execution_date,
      isActive: ap.is_active,
      createdAt: ap.created_at
    }));

    res.json({
      success: true,
      count: parsedAutoPayments.length,
      autoPayments: parsedAutoPayments
    });
  } catch (error) {
    console.error('Get auto-payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении автоплатежей'
    });
  }
});

/**
 * PATCH /api/payments/auto-payments/:id
 * Обновить автоплатеж (включить/выключить)
 */
router.patch('/auto-payments/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const autoPaymentId = req.params.id;
    const { isActive, nextExecutionDate, frequency } = req.body;

    const updates = [];
    const params = [];

    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive);
    }

    if (nextExecutionDate) {
      updates.push('next_execution_date = ?');
      params.push(nextExecutionDate);
    }

    if (frequency) {
      updates.push('frequency = ?');
      params.push(frequency);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Нет данных для обновления'
      });
    }

    params.push(autoPaymentId, userId);

    const [result] = await db.query(
      `UPDATE auto_payments SET ${updates.join(', ')} WHERE auto_payment_id = ? AND user_id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Автоплатеж не найден'
      });
    }

    res.json({
      success: true,
      message: 'Автоплатеж обновлён'
    });
  } catch (error) {
    console.error('Update auto-payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении автоплатежа'
    });
  }
});

/**
 * DELETE /api/payments/auto-payments/:id
 * Удалить автоплатеж
 */
router.delete('/auto-payments/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const autoPaymentId = req.params.id;

    const [result] = await db.query(
      'DELETE FROM auto_payments WHERE auto_payment_id = ? AND user_id = ?',
      [autoPaymentId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Автоплатеж не найден'
      });
    }

    res.json({
      success: true,
      message: 'Автоплатеж удалён'
    });
  } catch (error) {
    console.error('Delete auto-payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении автоплатежа'
    });
  }
});

module.exports = router;
