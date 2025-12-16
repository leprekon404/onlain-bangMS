const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const transactionsRoutes = require('./routes/transactions');
const paymentsRoutes = require('./routes/payments');
const externalApiRoutes = require('./routes/external-api');
const apiKeysRoutes = require('./routes/api-keys');
const notificationsRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Общий rate limiter для всех запросов
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов с одного IP
  message: { success: false, message: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
    res.status(429).json({ success: false, message: 'Слишком много запросов, попробуйте позже' });
  },
});

// Жёсткий limiter для аутентификации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20, // 20 попыток за окно
  message: { success: false, message: 'Слишком много попыток аутентификации, попробуйте через 15 минут' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Auth rate limit exceeded');
    res.status(429).json({ success: false, message: 'Слишком много попыток аутентификации, попробуйте через 15 минут' });
  },
});

app.use('/api', generalLimiter);

// Статика фронтенда
app.use(express.static(path.join(__dirname, '../frontend')));

// Внутренние API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

// Внешние API для интеграций
app.use('/api/external', externalApiRoutes);

// Страница по умолчанию
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  logger.info(`Online banking started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('==============================');
  console.log(`🏬 Online banking: http://localhost:${PORT}`);
  console.log(`🔑 API Docs: http://localhost:${PORT}/api/external/status`);
  console.log(`🛡️ Admin Panel: http://localhost:${PORT}/admin.html`);
  console.log(`📧 Notifications: Active`);
  console.log(`📊 Analytics: Active`);
  console.log(`📝 Logging: Active (${process.env.LOG_LEVEL || 'info'})`);
  console.log(`🔒 Rate Limiting: Active`);
  console.log('==============================');
});
