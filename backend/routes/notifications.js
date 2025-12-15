const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

// ============================================
// МОДУЛЬ УВЕДОМЛЕНИЙ
// ============================================

/**
 * GET /api/notifications
 * Получить список уведомлений пользователя
 */
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const unreadOnly = req.query.unreadOnly === 'true';
  const category = req.query.category;
  
  try {
    let whereConditions = ['n.user_id = ?'];
    let params = [userId];
    
    if (unreadOnly) {
      whereConditions.push('n.is_read = FALSE');
    }
    
    if (category) {
      whereConditions.push('nt.category = ?');
      params.push(category);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Получаем общее количество
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total
       FROM notifications n
       LEFT JOIN notification_types nt ON n.notification_type_code = nt.type_code
       WHERE ${whereClause}`,
      params
    );
    
    const total = countResult[0].total;
    
    // Получаем уведомления
    const [notifications] = await db.query(
      `SELECT 
         n.notification_id,
         n.notification_type_code,
         nt.type_name,
         nt.category,
         n.title,
         n.message,
         n.data,
         n.priority,
         n.is_read,
         n.read_at,
         n.created_at,
         n.email_status,
         n.sms_status,
         n.push_status
       FROM notifications n
       LEFT JOIN notification_types nt ON n.notification_type_code = nt.type_code
       WHERE ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    res.json({
      success: true,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit)
      },
      notifications: notifications.map(n => ({
        ...n,
        data: n.data ? JSON.parse(n.data) : null
      }))
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении уведомлений'
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Получить количество непрочитанных уведомлений
 */
router.get('/unread-count', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const [result] = await db.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent
       FROM notifications
       WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );
    
    res.json({
      success: true,
      unreadCount: result[0].total,
      urgentCount: result[0].urgent
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении количества непрочитанных'
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Отметить уведомление как прочитанное
 */
router.patch('/:id/read', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const notificationId = req.params.id;
  
  try {
    const [result] = await db.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW()
       WHERE notification_id = ? AND user_id = ?`,
      [notificationId, userId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Уведомление не найдено'
      });
    }
    
    res.json({
      success: true,
      message: 'Уведомление отмечено как прочитанное'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении статуса'
    });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Отметить все уведомления как прочитанные
 */
router.post('/mark-all-read', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    await db.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW()
       WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );
    
    res.json({
      success: true,
      message: 'Все уведомления отмечены как прочитанные'
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении статусов'
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Удалить уведомление
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const notificationId = req.params.id;
  
  try {
    const [result] = await db.query(
      'DELETE FROM notifications WHERE notification_id = ? AND user_id = ?',
      [notificationId, userId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Уведомление не найдено'
      });
    }
    
    res.json({
      success: true,
      message: 'Уведомление удалено'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении уведомления'
    });
  }
});

/**
 * GET /api/notifications/settings
 * Получить настройки уведомлений
 */
router.get('/settings', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    // Получаем все типы уведомлений
    const [types] = await db.query(
      'SELECT type_code, type_name, description, category, default_enabled FROM notification_types ORDER BY category, type_name'
    );
    
    // Получаем настройки пользователя
    const [settings] = await db.query(
      'SELECT notification_type_code, email_enabled, sms_enabled, push_enabled, min_amount FROM user_notification_settings WHERE user_id = ?',
      [userId]
    );
    
    // Объединяем данные
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.notification_type_code] = {
        emailEnabled: s.email_enabled,
        smsEnabled: s.sms_enabled,
        pushEnabled: s.push_enabled,
        minAmount: s.min_amount ? parseFloat(s.min_amount) : null
      };
    });
    
    const result = types.map(type => ({
      typeCode: type.type_code,
      typeName: type.type_name,
      description: type.description,
      category: type.category,
      settings: settingsMap[type.type_code] || {
        emailEnabled: type.default_enabled,
        smsEnabled: false,
        pushEnabled: type.default_enabled,
        minAmount: null
      }
    }));
    
    res.json({
      success: true,
      notificationTypes: result
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении настроек'
    });
  }
});

/**
 * PUT /api/notifications/settings
 * Обновить настройки уведомлений
 */
router.put('/settings', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { typeCode, emailEnabled, smsEnabled, pushEnabled, minAmount } = req.body;
  
  if (!typeCode) {
    return res.status(400).json({
      success: false,
      message: 'typeCode обязателен'
    });
  }
  
  try {
    // Проверяем существование типа
    const [typeCheck] = await db.query(
      'SELECT type_code FROM notification_types WHERE type_code = ?',
      [typeCode]
    );
    
    if (typeCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Тип уведомления не найден'
      });
    }
    
    // Вставляем или обновляем настройки
    await db.query(
      `INSERT INTO user_notification_settings 
         (user_id, notification_type_code, email_enabled, sms_enabled, push_enabled, min_amount)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         email_enabled = VALUES(email_enabled),
         sms_enabled = VALUES(sms_enabled),
         push_enabled = VALUES(push_enabled),
         min_amount = VALUES(min_amount),
         updated_at = NOW()`,
      [
        userId,
        typeCode,
        emailEnabled !== undefined ? emailEnabled : true,
        smsEnabled !== undefined ? smsEnabled : false,
        pushEnabled !== undefined ? pushEnabled : true,
        minAmount || null
      ]
    );
    
    res.json({
      success: true,
      message: 'Настройки обновлены'
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении настроек'
    });
  }
});

/**
 * POST /api/notifications/devices
 * Зарегистрировать устройство для push-уведомлений
 */
router.post('/devices', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { deviceToken, deviceType, deviceName } = req.body;
  
  if (!deviceToken || !deviceType) {
    return res.status(400).json({
      success: false,
      message: 'deviceToken и deviceType обязательны'
    });
  }
  
  if (!['ios', 'android', 'web'].includes(deviceType)) {
    return res.status(400).json({
      success: false,
      message: 'deviceType должен быть ios, android или web'
    });
  }
  
  try {
    await db.query(
      `INSERT INTO user_devices (user_id, device_token, device_type, device_name, last_active_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         device_type = VALUES(device_type),
         device_name = VALUES(device_name),
         is_active = TRUE,
         last_active_at = NOW()`,
      [userId, deviceToken, deviceType, deviceName || null]
    );
    
    res.status(201).json({
      success: true,
      message: 'Устройство зарегистрировано'
    });
  } catch (error) {
    console.error('Register device error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при регистрации устройства'
    });
  }
});

/**
 * GET /api/notifications/devices
 * Получить список зарегистрированных устройств
 */
router.get('/devices', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const [devices] = await db.query(
      `SELECT device_id, device_type, device_name, is_active, last_active_at, created_at
       FROM user_devices
       WHERE user_id = ?
       ORDER BY last_active_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      devices: devices
    });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении списка устройств'
    });
  }
});

/**
 * DELETE /api/notifications/devices/:id
 * Удалить устройство
 */
router.delete('/devices/:id', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const deviceId = req.params.id;
  
  try {
    const [result] = await db.query(
      'DELETE FROM user_devices WHERE device_id = ? AND user_id = ?',
      [deviceId, userId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Устройство не найдено'
      });
    }
    
    res.json({
      success: true,
      message: 'Устройство удалено'
    });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении устройства'
    });
  }
});

module.exports = router;
