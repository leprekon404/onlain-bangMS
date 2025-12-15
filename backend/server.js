const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

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

// Статика фронтенда
app.use(express.static(path.join(__dirname, '../frontend')));

// Внутренние API
app.use('/api/auth', authRoutes);
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

app.listen(PORT, () => {
  console.log('==============================');
  console.log(`🏦 Online banking: http://localhost:${PORT}`);
  console.log(`🔑 API Docs: http://localhost:${PORT}/api/external/status`);
  console.log(`🛡️ Admin Panel: http://localhost:${PORT}/admin.html`);
  console.log(`📧 Notifications: Active`);
  console.log(`📊 Analytics: Active`);
  console.log('==============================');
});
