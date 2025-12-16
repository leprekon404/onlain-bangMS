// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { writeAuditLog } = require('../utils/audit');

// вспомогательная функция выдачи токена и объекта пользователя
function buildAuthResponse(userRow, roleRow) {
  const token = jwt.sign(
    { userId: userRow.user_id, username: userRow.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  return {
    success: true,
    token,
    user: {
      id: userRow.user_id,
      username: userRow.username,
      email: userRow.email,
      fullName: userRow.full_name,
      phoneNumber: userRow.phone_number,
      roleId: userRow.role_id,
      roleName: roleRow ? roleRow.role_name : 'user'
    },
  };
}

// ----- ВХОД -----
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  try {
    if (!username || !password) {
      logger.warn({ username, ip }, 'Login attempt: missing credentials');
      await writeAuditLog({
        actionType: 'LOGIN',
        actionStatus: 'failure',
        ipAddress: ip,
        userAgent: ua,
        details: { reason: 'missing_credentials', username },
      });
      return res
        .status(400)
        .json({ success: false, message: 'Укажите логин и пароль' });
    }

    const [rows] = await db.query(
      `SELECT u.*, r.role_name 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.role_id 
       WHERE u.username = ?`,
      [username]
    );

    if (!rows.length) {
      logger.warn({ username, ip }, 'Login failed: user not found');
      await writeAuditLog({
        actionType: 'LOGIN',
        actionStatus: 'failure',
        ipAddress: ip,
        userAgent: ua,
        details: { reason: 'user_not_found', username },
      });
      return res
        .status(401)
        .json({ success: false, message: 'Неверный логин или пароль' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      logger.warn({ userId: user.user_id, username, ip }, 'Login failed: invalid password');
      await writeAuditLog({
        userId: user.user_id,
        actionType: 'LOGIN',
        actionStatus: 'failure',
        ipAddress: ip,
        userAgent: ua,
        details: { reason: 'invalid_password', username },
      });
      
      // Увеличиваем счётчик неудачных попыток
      await db.query(
        'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE user_id = ?',
        [user.user_id]
      );
      
      return res
        .status(401)
        .json({ success: false, message: 'Неверный логин или пароль' });
    }

    // Успешный вход
    user.last_login = new Date();
    await db.query(
      'UPDATE users SET last_login = NOW(), failed_login_attempts = 0 WHERE user_id = ?',
      [user.user_id]
    );

    logger.info({ userId: user.user_id, username, ip }, 'Login successful');
    await writeAuditLog({
      userId: user.user_id,
      actionType: 'LOGIN',
      actionStatus: 'success',
      ipAddress: ip,
      userAgent: ua,
      details: { username },
    });

    res.json(buildAuthResponse(user, { role_name: user.role_name }));
  } catch (e) {
    logger.error({ e, username, ip }, 'Login error');
    await writeAuditLog({
      actionType: 'LOGIN',
      actionStatus: 'failure',
      ipAddress: ip,
      userAgent: ua,
      details: { reason: 'server_error', username, error: e.message },
    });
    res
      .status(500)
      .json({ success: false, message: 'Ошибка сервера при входе' });
  }
});

// ----- РЕГИСТРАЦИЯ -----
router.post('/register', async (req, res) => {
  const { username, email, fullName, phoneNumber, password } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  try {
    if (!username || !email || !password) {
      logger.warn({ username, email, ip }, 'Register attempt: missing fields');
      await writeAuditLog({
        actionType: 'REGISTER',
        actionStatus: 'failure',
        ipAddress: ip,
        userAgent: ua,
        details: { reason: 'missing_fields', username, email },
      });
      return res.status(400).json({
        success: false,
        message: 'Логин, e‑mail и пароль обязательны',
      });
    }

    // проверка уникальности
    const [exists] = await db.query(
      'SELECT user_id, username, email FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (exists.length) {
      const conflict = exists[0];
      if (conflict.username === username) {
        logger.warn({ username, ip }, 'Register failed: username exists');
        await writeAuditLog({
          actionType: 'REGISTER',
          actionStatus: 'failure',
          ipAddress: ip,
          userAgent: ua,
          details: { reason: 'username_exists', username },
        });
        return res
          .status(400)
          .json({ success: false, message: 'Такой логин уже используется' });
      }
      if (conflict.email === email) {
        logger.warn({ email, ip }, 'Register failed: email exists');
        await writeAuditLog({
          actionType: 'REGISTER',
          actionStatus: 'failure',
          ipAddress: ip,
          userAgent: ua,
          details: { reason: 'email_exists', email },
        });
        return res
          .status(400)
          .json({ success: false, message: 'Такой e‑mail уже зарегистрирован' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // По умолчанию новый пользователь получает role_id = 1 (user)
    const [result] = await db.query(
      'INSERT INTO users (username, email, password_hash, full_name, phone_number, is_active, role_id, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, TRUE, 1, NOW())',
      [username, email, passwordHash, fullName || null, phoneNumber || null]
    );

    const [rows] = await db.query(
      `SELECT u.*, r.role_name 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.role_id 
       WHERE u.user_id = ?`,
      [result.insertId]
    );
    const newUser = rows[0];

    logger.info({ userId: newUser.user_id, username, email, ip }, 'Registration successful');
    await writeAuditLog({
      userId: newUser.user_id,
      actionType: 'REGISTER',
      actionStatus: 'success',
      ipAddress: ip,
      userAgent: ua,
      details: { username, email },
    });

    res.status(201).json(buildAuthResponse(newUser, { role_name: newUser.role_name }));
  } catch (e) {
    logger.error({ e, username, email, ip }, 'Register error');
    await writeAuditLog({
      actionType: 'REGISTER',
      actionStatus: 'failure',
      ipAddress: ip,
      userAgent: ua,
      details: { reason: 'server_error', username, email, error: e.message },
    });
    res
      .status(500)
      .json({ success: false, message: 'Ошибка сервера при регистрации' });
  }
});

module.exports = router;
