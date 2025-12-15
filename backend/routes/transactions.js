// backend/routes/transactions.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

// POST /api/transactions/transfer – общий перевод (как было)
router.post('/transfer', authenticateToken, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { fromAccountId, toAccountId, amount, description } = req.body;
    const sum = parseFloat(amount);

    if (!fromAccountId || !toAccountId || !sum || sum <= 0) {
      await conn.release();
      return res
        .status(400)
        .json({ success: false, message: 'Некорректные данные перевода' });
    }

    await conn.beginTransaction();

    const [fromRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ? FOR UPDATE',
      [fromAccountId, req.user.userId]
    );
    if (!fromRows.length) {
      await conn.rollback();
      return res
        .status(404)
        .json({ success: false, message: 'Счёт отправителя не найден' });
    }
    const from = fromRows[0];

    if (from.is_frozen) {
      await conn.rollback();
      return res
        .status(400)
        .json({ success: false, message: 'Карта отправителя заблокирована' });
    }

    const [toRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_id = ? FOR UPDATE',
      [toAccountId]
    );
    if (!toRows.length) {
      await conn.rollback();
      return res
        .status(404)
        .json({ success: false, message: 'Счёт получателя не найден' });
    }

    if (from.balance < sum) {
      await conn.rollback();
      return res
        .status(400)
        .json({ success: false, message: 'Недостаточно средств' });
    }

    await conn.query(
      'UPDATE accounts SET balance = balance - ? WHERE account_id = ?',
      [sum, fromAccountId]
    );
    await conn.query(
      'UPDATE accounts SET balance = balance + ? WHERE account_id = ?',
      [sum, toAccountId]
    );
    await conn.query(
      `INSERT INTO transactions
         (from_account_id, to_account_id, amount, transaction_type, description)
       VALUES (?, ?, ?, ?, ?)`,
      [fromAccountId, toAccountId, sum, 'transfer', description || null]
    );

    await conn.commit();
    res.json({ success: true, message: 'Перевод выполнен' });
  } catch (e) {
    await conn.rollback();
    console.error('Transfer error:', e);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  } finally {
    conn.release();
  }
});

// POST /api/transactions/transfer-self – между своими счетами
router.post('/transfer-self', authenticateToken, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { fromAccountId, toAccountId, amount, description } = req.body;
    const sum = parseFloat(amount);

    if (!fromAccountId || !toAccountId || !sum || sum <= 0) {
      await conn.release();
      return res
        .status(400)
        .json({ success: false, message: 'Некорректные данные перевода' });
    }
    if (fromAccountId === toAccountId) {
      await conn.release();
      return res
        .status(400)
        .json({ success: false, message: 'Нельзя перевести на тот же счёт' });
    }

    await conn.beginTransaction();

    const [fromRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ? FOR UPDATE',
      [fromAccountId, req.user.userId]
    );
    const [toRows] = await conn.query(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ? FOR UPDATE',
      [toAccountId, req.user.userId]
    );

    if (!fromRows.length || !toRows.length) {
      await conn.rollback();
      return res
        .status(404)
        .json({ success: false, message: 'Один из счетов не найден' });
    }

    const from = fromRows[0];
    if (from.is_frozen) {
      await conn.rollback();
      return res
        .status(400)
        .json({ success: false, message: 'Карта отправителя заблокирована' });
    }

    if (from.balance < sum) {
      await conn.rollback();
      return res
        .status(400)
        .json({ success: false, message: 'Недостаточно средств' });
    }

    await conn.query(
      'UPDATE accounts SET balance = balance - ? WHERE account_id = ?',
      [sum, fromAccountId]
    );
    await conn.query(
      'UPDATE accounts SET balance = balance + ? WHERE account_id = ?',
      [sum, toAccountId]
    );
    await conn.query(
      `INSERT INTO transactions
         (from_account_id, to_account_id, amount, transaction_type, description)
       VALUES (?, ?, ?, ?, ?)`,
      [fromAccountId, toAccountId, sum, 'self-transfer', description || null]
    );

    await conn.commit();
    res.json({ success: true, message: 'Перевод между своими счетами выполнен' });
  } catch (e) {
    await conn.rollback();
    console.error('Self transfer error:', e);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  } finally {
    conn.release();
  }
});

// GET /api/transactions/history – общая история по всем счетам пользователя
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*,
              fa.account_number AS from_number,
              ta.account_number AS to_number
       FROM transactions t
       LEFT JOIN accounts fa ON t.from_account_id = fa.account_id
       LEFT JOIN accounts ta ON t.to_account_id = ta.account_id
       WHERE fa.user_id = ? OR ta.user_id = ?
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [req.user.userId, req.user.userId]
    );
    res.json({ success: true, transactions: rows });
  } catch (e) {
    console.error('History error:', e);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// GET /api/transactions/by-account/:id – история по конкретному счёту
router.get('/by-account/:id', authenticateToken, async (req, res) => {
  try {
    const accountId = Number(req.params.id);

    const [accRows] = await db.query(
      'SELECT account_id FROM accounts WHERE account_id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );
    if (!accRows.length) {
      return res.status(404).json({ success: false, message: 'Счёт не найден' });
    }

    const [rows] = await db.query(
      `SELECT t.*,
              fa.account_number AS from_number,
              ta.account_number AS to_number
       FROM transactions t
       LEFT JOIN accounts fa ON t.from_account_id = fa.account_id
       LEFT JOIN accounts ta ON t.to_account_id = ta.account_id
       WHERE t.from_account_id = ? OR t.to_account_id = ?
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [accountId, accountId]
    );

    res.json({ success: true, transactions: rows });
  } catch (e) {
    console.error('History by account error:', e);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

module.exports = router;
