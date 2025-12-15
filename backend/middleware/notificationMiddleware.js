const notificationService = require('../services/notificationService');

/**
 * Middleware для автоматической отправки уведомлений после транзакций
 */
function notifyAfterTransaction(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Перехватываем ответ
    let responseData;
    try {
      responseData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      return originalSend.call(this, data);
    }
    
    // Проверяем, что это успешная транзакция
    if (responseData.success && responseData.transaction && req.user && req.user.userId) {
      // Отправляем уведомление асинхронно
      setImmediate(async () => {
        try {
          await notificationService.notifyTransactionCompleted(
            req.user.userId,
            responseData.transaction
          );
        } catch (error) {
          console.error('Ошибка отправки уведомления:', error);
        }
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

module.exports = { notifyAfterTransaction };
