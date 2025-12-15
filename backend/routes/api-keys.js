const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const crypto = require('crypto');

// ============================================
// УПРАВЛЕНИЕ API КЛЮЧАМИ
// ============================================

/**
 * POST /api/api-keys
 * Создать новый API ключ
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, permissions, expiresInDays } = req.body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Некорректные данные'
      });
    }

    // Генерируем уникальный API ключ
    const apiKey = crypto.randomBytes(32).toString('hex');

    let expiresAt = null;
    if (expiresInDays) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expiresInDays);
      expiresAt = expiryDate.toISOString().slice(0, 19).replace('T', ' ');
    }

    const [result] = await db.query(
      `INSERT INTO external_api_keys
         (user_id, api_key, api_name, permissions, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, apiKey, name, JSON.stringify(permissions), expiresAt]
    );

    res.status(201).json({
      success: true,
      message: 'API ключ создан',
      apiKey: {
        apiKeyId: result.insertId,
        apiKey: apiKey,
        name: name,
        permissions: permissions,
        expiresAt: expiresAt
      },
      warning: 'Сохраните этот ключ! Он не будет отображаться снова.'
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при создании API ключа'
    });
  }
});

/**
 * GET /api/api-keys
 * Получить все API ключи пользователя
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [keys] = await db.query(
      `SELECT api_key_id, api_name, permissions, is_active, 
              created_at, expires_at, last_used,
              CONCAT(LEFT(api_key, 8), '...', RIGHT(api_key, 4)) as masked_key
       FROM external_api_keys 
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    const parsedKeys = keys.map(key => ({
      apiKeyId: key.api_key_id,
      name: key.api_name,
      maskedKey: key.masked_key,
      permissions: JSON.parse(key.permissions),
      isActive: key.is_active,
      createdAt: key.created_at,
      expiresAt: key.expires_at,
      lastUsed: key.last_used
    }));

    res.json({
      success: true,
      count: parsedKeys.length,
      apiKeys: parsedKeys
    });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении API ключей'
    });
  }
});

/**
 * PATCH /api/api-keys/:id
 * Обновить API ключ (активировать/деактивировать)
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const apiKeyId = req.params.id;
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Не указан статус'
      });
    }

    const [result] = await db.query(
      'UPDATE external_api_keys SET is_active = ? WHERE api_key_id = ? AND user_id = ?',
      [isActive, apiKeyId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'API ключ не найден'
      });
    }

    res.json({
      success: true,
      message: `API ключ ${isActive ? 'активирован' : 'деактивирован'}`
    });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении API ключа'
    });
  }
});

/**
 * DELETE /api/api-keys/:id
 * Удалить API ключ
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const apiKeyId = req.params.id;

    const [result] = await db.query(
      'DELETE FROM external_api_keys WHERE api_key_id = ? AND user_id = ?',
      [apiKeyId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'API ключ не найден'
      });
    }

    res.json({
      success: true,
      message: 'API ключ удалён'
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении API ключа'
    });
  }
});

/**
 * GET /api/api-keys/:id/logs
 * Получить логи использования API ключа
 */
router.get('/:id/logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const apiKeyId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    // Проверяем принадлежность ключа
    const [keys] = await db.query(
      'SELECT api_key_id FROM external_api_keys WHERE api_key_id = ? AND user_id = ?',
      [apiKeyId, userId]
    );

    if (keys.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API ключ не найден'
      });
    }

    const [logs] = await db.query(
      `SELECT log_id, endpoint, method, response_status, ip_address, created_at
       FROM api_request_logs
       WHERE api_key_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [apiKeyId, limit]
    );

    res.json({
      success: true,
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('Get API logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении логов'
    });
  }
});

module.exports = router;
