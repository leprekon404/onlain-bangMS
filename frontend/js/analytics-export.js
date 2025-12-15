// Добавление к основному файлу analytics.js

let analyticsData = {
    summary: {},
    categories: [],
    trend: [],
    budgets: [],
    goals: []
};

// Переопределение функций загрузки для сохранения данных
const originalLoadSummary = loadSummary;
loadSummary = async function() {
    await originalLoadSummary();
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/summary?period=${currentPeriod}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
        const data = await response.json();
        analyticsData.summary = data.summary;
    }
};

const originalLoadCategoryBreakdown = loadCategoryBreakdown;
loadCategoryBreakdown = async function() {
    await originalLoadCategoryBreakdown();
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/spending-by-category?period=${currentPeriod}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
        const data = await response.json();
        analyticsData.categories = data.categories;
    }
};

const originalLoadIncomExpenseTrend = loadIncomExpenseTrend;
loadIncomExpenseTrend = async function() {
    await originalLoadIncomExpenseTrend();
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/income-expense-trend?months=12`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
        const data = await response.json();
        analyticsData.trend = data.trend;
    }
};

const originalLoadBudgets = loadBudgets;
loadBudgets = async function() {
    await originalLoadBudgets();
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/budgets`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
        const data = await response.json();
        analyticsData.budgets = data.budgets;
    }
};

const originalLoadGoals = loadGoals;
loadGoals = async function() {
    await originalLoadGoals();
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/goals`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
        const data = await response.json();
        analyticsData.goals = data.goals;
    }
};

// Функция экспорта в JSON
function exportToJSON() {
    const exportData = {
        exportDate: new Date().toISOString(),
        period: currentPeriod,
        summary: analyticsData.summary || {},
        categories: analyticsData.categories || [],
        trend: analyticsData.trend || [],
        budgets: analyticsData.budgets || [],
        goals: analyticsData.goals || [],
        metadata: {
            version: '1.0',
            application: 'Online Banking Analytics',
            generatedBy: localStorage.getItem('username') || 'Unknown'
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `analytics_${currentPeriod}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Показываем уведомление
    showNotification('Данные экспортированы в JSON', 'success');
}

// Уведомления
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#00b894' : '#667eea'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// CSS анимации
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
