const db = require('../config/database');
const nodemailer = require('nodemailer');

// ============================================
// СЕРВИС ОТПРАВКИ УВЕДОМЛЕНИЙ
// ============================================

/**
 * Конфигурация email транспорта
 */
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

/**
 * Заменяет переменные в шаблоне
 */
function replaceVariables(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Получает шаблон уведомления
 */
async function getTemplate(notificationType, channel, language = 'ru') {
  const [templates] = await db.query(
    `SELECT subject, body_template, variables
     FROM notification_templates
     WHERE notification_type_code = ? AND channel = ? AND language = ? AND is_active = TRUE
     LIMIT 1`,
    [notificationType, channel, language]
  );
  
  return templates.length > 0 ? templates[0] : null;
}

/**
 * Получает настройки пользователя для типа уведомления
 */
async function getUserSettings(userId, notificationType) {
  const [settings] = await db.query(
    `SELECT email_enabled, sms_enabled, push_enabled, min_amount
     FROM user_notification_settings
     WHERE user_id = ? AND notification_type_code = ?
     LIMIT 1`,
    [userId, notificationType]
  );
  
  if (settings.length > 0) {
    return settings[0];
  }
  
  // Используем значения по умолчанию
  const [defaultSettings] = await db.query(
    'SELECT default_enabled FROM notification_types WHERE type_code = ?',
    [notificationType]
  );
  
  return {
    email_enabled: defaultSettings.length > 0 ? defaultSettings[0].default_enabled : true,
    sms_enabled: false,
    push_enabled: defaultSettings.length > 0 ? defaultSettings[0].default_enabled : true,
    min_amount: null
  };
}

/**
 * Отправляет email уведомление
 */
async function sendEmail(to, subject, body) {
  try {
    if (!process.env.SMTP_USER) {
      console.log(`[EMAIL SIMULATION] To: ${to}, Subject: ${subject}`);
      console.log(`Body: ${body}`);
      return { success: true, simulated: true };
    }
    
    await emailTransporter.sendMail({
      from: `"Online Banking" <${process.env.SMTP_USER}>`,
      to: to,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>')
    });
    
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Отправляет SMS уведомление (заглушка)
 */
async function sendSMS(phone, message) {
  try {
    // Здесь будет интеграция с SMS-провайдером (Twilio, СМС.РУ и т.д.)
    console.log(`[SMS SIMULATION] To: ${phone}, Message: ${message}`);
    return { success: true, simulated: true };
  } catch (error) {
    console.error('SMS send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Отправляет Push уведомление
 */
async function sendPush(userId, title, body, data = {}) {
  try {
    // Получаем активные устройства пользователя
    const [devices] = await db.query(
      'SELECT device_token, device_type FROM user_devices WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );
    
    if (devices.length === 0) {
      return { success: true, sent: 0, message: 'Нет активных устройств' };
    }
    
    // Здесь будет интеграция с Firebase Cloud Messaging / Apple Push Notification
    console.log(`[PUSH SIMULATION] User: ${userId}, Devices: ${devices.length}, Title: ${title}`);
    console.log(`Body: ${body}, Data:`, data);
    
    return { success: true, sent: devices.length, simulated: true };
  } catch (error) {
    console.error('Push send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Главная функция: создает и отправляет уведомление
 */
async function createNotification({
  userId,
  notificationType,
  title,
  message,
  data = {},
  priority = 'normal',
  amount = null
}) {
  try {
    // Получаем настройки пользователя
    const settings = await getUserSettings(userId, notificationType);
    
    // Проверяем порог суммы (для транзакций)
    if (amount !== null && settings.min_amount !== null) {
      if (parseFloat(amount) < parseFloat(settings.min_amount)) {
        console.log(`Уведомление пропущено: сумма ${amount} ниже порога ${settings.min_amount}`);
        return { success: true, skipped: true, reason: 'below_threshold' };
      }
    }
    
    // Получаем данные пользователя
    const [users] = await db.query(
      'SELECT email, phone, full_name FROM users WHERE user_id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return { success: false, error: 'Пользователь не найден' };
    }
    
    const user = users[0];
    
    // Создаем запись уведомления
    const [notifResult] = await db.query(
      `INSERT INTO notifications
         (user_id, notification_type_code, title, message, data, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [userId, notificationType, title, message, JSON.stringify(data), priority]
    );
    
    const notificationId = notifResult.insertId;
    
    // Отправляем email
    if (settings.email_enabled && user.email) {
      const emailTemplate = await getTemplate(notificationType, 'email');
      if (emailTemplate) {
        const variables = {
          user_name: user.full_name,
          ...data
        };
        
        const emailSubject = emailTemplate.subject ? replaceVariables(emailTemplate.subject, variables) : title;
        const emailBody = replaceVariables(emailTemplate.body_template, variables);
        
        const emailResult = await sendEmail(user.email, emailSubject, emailBody);
        
        await db.query(
          `UPDATE notifications
           SET email_status = ?, email_sent_at = ?, email_error = ?
           WHERE notification_id = ?`,
          [
            emailResult.success ? 'sent' : 'failed',
            emailResult.success ? new Date() : null,
            emailResult.error || null,
            notificationId
          ]
        );
      } else {
        await db.query(
          'UPDATE notifications SET email_status = ? WHERE notification_id = ?',
          ['skipped', notificationId]
        );
      }
    }
    
    // Отправляем SMS
    if (settings.sms_enabled && user.phone) {
      const smsTemplate = await getTemplate(notificationType, 'sms');
      if (smsTemplate) {
        const smsBody = replaceVariables(smsTemplate.body_template, data);
        const smsResult = await sendSMS(user.phone, smsBody);
        
        await db.query(
          `UPDATE notifications
           SET sms_status = ?, sms_sent_at = ?, sms_error = ?
           WHERE notification_id = ?`,
          [
            smsResult.success ? 'sent' : 'failed',
            smsResult.success ? new Date() : null,
            smsResult.error || null,
            notificationId
          ]
        );
      } else {
        await db.query(
          'UPDATE notifications SET sms_status = ? WHERE notification_id = ?',
          ['skipped', notificationId]
        );
      }
    }
    
    // Отправляем Push
    if (settings.push_enabled) {
      const pushTemplate = await getTemplate(notificationType, 'push');
      if (pushTemplate) {
        const pushTitle = pushTemplate.subject ? replaceVariables(pushTemplate.subject, data) : title;
        const pushBody = replaceVariables(pushTemplate.body_template, data);
        
        const pushResult = await sendPush(userId, pushTitle, pushBody, data);
        
        await db.query(
          `UPDATE notifications
           SET push_status = ?, push_sent_at = ?, push_error = ?
           WHERE notification_id = ?`,
          [
            pushResult.success ? 'sent' : 'failed',
            pushResult.success ? new Date() : null,
            pushResult.error || null,
            notificationId
          ]
        );
      } else {
        await db.query(
          'UPDATE notifications SET push_status = ? WHERE notification_id = ?',
          ['skipped', notificationId]
        );
      }
    }
    
    return {
      success: true,
      notificationId: notificationId,
      channels: {
        email: settings.email_enabled,
        sms: settings.sms_enabled,
        push: settings.push_enabled
      }
    };
  } catch (error) {
    console.error('Create notification error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Уведомление о завершении транзакции
 */
async function notifyTransactionCompleted(userId, transaction) {
  return await createNotification({
    userId: userId,
    notificationType: 'TRANSACTION_COMPLETED',
    title: 'Транзакция выполнена',
    message: `Транзакция на сумму ${transaction.amount} ${transaction.currency} успешно выполнена`,
    data: {
      transaction_id: transaction.transactionId,
      amount: transaction.amount,
      currency: transaction.currency || 'RUB',
      transaction_type: transaction.type || 'transfer',
      description: transaction.description || '',
      date: new Date().toLocaleString('ru-RU')
    },
    priority: 'normal',
    amount: transaction.amount
  });
}

/**
 * Уведомление о низком балансе
 */
async function notifyLowBalance(userId, account) {
  return await createNotification({
    userId: userId,
    notificationType: 'LOW_BALANCE',
    title: 'Низкий баланс счета',
    message: `Баланс вашего счета ${account.accountNumber} опустился ниже установленного порога`,
    data: {
      account_number: account.accountNumber,
      balance: account.balance,
      currency: account.currency || 'RUB'
    },
    priority: 'high'
  });
}

/**
 * Уведомление об изменении пароля
 */
async function notifyPasswordChanged(userId) {
  return await createNotification({
    userId: userId,
    notificationType: 'PASSWORD_CHANGED',
    title: 'Пароль изменен',
    message: 'Пароль вашей учетной записи был изменен',
    data: {
      date: new Date().toLocaleString('ru-RU')
    },
    priority: 'urgent'
  });
}

/**
 * Уведомление о входе с нового устройства
 */
async function notifyNewDevice(userId, deviceInfo) {
  return await createNotification({
    userId: userId,
    notificationType: 'NEW_DEVICE',
    title: 'Вход с нового устройства',
    message: `Зафиксирован вход в вашу учетную запись с нового устройства`,
    data: {
      device_name: deviceInfo.deviceName || 'Неизвестное устройство',
      ip_address: deviceInfo.ipAddress || 'Неизвестно',
      date: new Date().toLocaleString('ru-RU')
    },
    priority: 'high'
  });
}

module.exports = {
  createNotification,
  notifyTransactionCompleted,
  notifyLowBalance,
  notifyPasswordChanged,
  notifyNewDevice
};
