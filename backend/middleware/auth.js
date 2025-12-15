const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Требуется аутентификация'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Получаем информацию о пользователе и его роли
    const [users] = await db.query(
      `SELECT u.user_id, u.username, u.email, u.role_id, r.role_name 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.role_id 
       WHERE u.user_id = ?`,
      [decoded.userId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }
    
    const user = users[0];
    
    req.user = {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      roleId: user.role_id,
      roleName: user.role_name
    };
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({
      success: false,
      message: 'Недействительный токен'
    });
  }
}

module.exports = authenticateToken;
