// Middleware для проверки прав администратора

function requireAdmin(req, res, next) {
  // Проверяем что пользователь аутентифицирован
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Требуется аутентификация'
    });
  }
  
  // Проверяем роль администратора
  if (req.user.roleId !== 2 && req.user.roleName !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Доступ запрещен. Требуются права администратора'
    });
  }
  
  next();
}

function requireManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Требуется аутентификация'
    });
  }
  
  // Проверяем роль менеджера или админа
  const allowedRoles = [2, 3]; // admin, manager
  if (!allowedRoles.includes(req.user.roleId)) {
    return res.status(403).json({
      success: false,
      message: 'Доступ запрещен. Требуются права менеджера'
    });
  }
  
  next();
}

module.exports = {
  requireAdmin,
  requireManager
};
