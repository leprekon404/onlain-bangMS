// backend/utils/audit.js
const db = require('../config/database');
const logger = require('./logger');

/**
 * Запись в таблицу audit_logs
 * @param {Object} params
 * @param {number|null} params.userId - ID пользователя
 * @param {string} params.actionType - Тип действия (LOGIN, TRANSFER, ACCOUNT_CREATE, и т.д.)
 * @param {string} params.actionStatus - success или failure
 * @param {string} params.ipAddress - IP адрес
 * @param {string} params.userAgent - User-Agent
 * @param {Object|null} params.details - Дополнительные данные (JSON)
 */
async function writeAuditLog({
  userId = null,
  actionType,
  actionStatus,
  ipAddress,
  userAgent,
  details = null,
}) {
  try {
    await db.query(
      `INSERT INTO audit_logs 
       (user_id, action_type, action_status, ip_address, user_agent, details) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        actionType,
        actionStatus,
        ipAddress || null,
        userAgent || null,
        details ? JSON.stringify(details) : null,
      ]
    );
    logger.debug({ userId, actionType, actionStatus }, 'Audit log written');
  } catch (err) {
    logger.error({ err, userId, actionType }, 'Failed to write audit log');
  }
}

module.exports = { writeAuditLog };
