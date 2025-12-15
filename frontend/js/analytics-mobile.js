const API_URL = 'http://localhost:3000/api';

let trendChart = null;
let currentPeriod = 'month';

// Глобальное хранилище данных
window.analyticsData = {
    summary: {},
    categories: [],
    trend: [],
    budgets: [],
    goals: [],
    transactions: []
};

// Проверка аутентификации
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    return token;
}

function goBack() {
    window.history.back();
}

// Загрузка всех данных
async function loadAnalytics() {
    const token = checkAuth();
    if (!token) return;

    try {
        await Promise.all([
            loadSummary(),
            loadCategories(),
            loadTrend(),
            loadTransactions(),
            loadBudgets(),
            loadGoals(),
            loadCategoryOptions()
        ]);
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

// Общая сводка
async function loadSummary() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/summary?period=${currentPeriod}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    window.analyticsData.summary = data.summary;
    
    const { totalBalance, totalIncome, totalExpense, netSavings, savingsRate } = data.summary;
    
    document.getElementById('totalBalance').textContent = formatMoney(totalBalance) + ' ₽';
    document.getElementById('totalIncome').textContent = formatMoney(totalIncome) + ' ₽';
    document.getElementById('totalExpense').textContent = formatMoney(totalExpense) + ' ₽';
}

// Категории
async function loadCategories() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/spending-by-category?period=${currentPeriod}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    window.analyticsData.categories = data.categories;
    
    const container = document.getElementById('categoriesList');
    if (data.categories.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет данных</div>';
        return;
    }
    
    container.innerHTML = data.categories.slice(0, 5).map(cat => `
        <div class="category-card">
            <div class="category-icon" style="background: ${cat.color}20;">${cat.icon}</div>
            <div class="category-info">
                <div class="category-name">${cat.category}</div>
                <div class="category-count">${cat.count} транзакций</div>
                <div class="category-bar">
                    <div class="category-bar-fill" style="width: ${cat.percentage}%; background: ${cat.color};"></div>
                </div>
            </div>
            <div class="category-amount">
                <div class="amount-value">${formatMoney(cat.total)} ₽</div>
                <div class="amount-percent">${cat.percentage}%</div>
            </div>
        </div>
    `).join('');
}

// Транзакции
async function loadTransactions(limit = 10) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/transactions/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    window.analyticsData.transactions = data.transactions || [];
    
    const container = document.getElementById('transactionsList');
    const transactions = data.transactions.slice(0, limit);
    
    if (transactions.length === 0) {
        container.innerHTML = '<div class="empty-state">Операций пока нет</div>';
        return;
    }
    
    container.innerHTML = transactions.map(tx => {
        // Определяем тип транзакции
        const isIncome = tx.from_account_id === null;
        const isExpense = tx.to_account_id === null;
        const isTransfer = !isIncome && !isExpense;
        
        let amountClass = 'transaction-amount';
        let sign = '';
        
        if (isIncome) {
            amountClass = 'transaction-amount income';
            sign = '+';
        } else if (isExpense) {
            amountClass = 'transaction-amount expense';
            sign = '-';
        } else {
            amountClass = 'transaction-amount transfer';
        }
        
        const title = tx.description || 
                     (tx.transaction_type === 'transfer' ? 'Перевод' : 
                      tx.transaction_type === 'self-transfer' ? 'Перевод между своими' : 
                      tx.transaction_type);
        
        const date = new Date(tx.created_at).toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-title">${title}</div>
                    <div class="transaction-date">${date}</div>
                </div>
                <div class="${amountClass}">${sign}${formatMoney(tx.amount)} ₽</div>
            </div>
        `;
    }).join('');
}

function showAllTransactions() {
    loadTransactions(100);
    document.querySelector('.transactions-section')?.scrollIntoView({ behavior: 'smooth' });
}

// Тренд
async function loadTrend() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/income-expense-trend?months=12`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    window.analyticsData.trend = data.trend;
    updateTrendChart(data.trend);
}

// График
function updateTrendChart(trend) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    if (trendChart) trendChart.destroy();
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.map(t => {
                const [year, month] = t.month.split('-');
                return new Date(year, month - 1).toLocaleDateString('ru-RU', { month: 'short' });
            }),
            datasets: [
                {
                    label: 'Доходы',
                    data: trend.map(t => t.income),
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Расходы',
                    data: trend.map(t => t.expense),
                    borderColor: '#f56565',
                    backgroundColor: 'rgba(245, 101, 101, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => formatMoney(value / 1000) + 'K'
                    }
                }
            }
        }
    });
}

// Бюджеты
async function loadBudgets() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/budgets`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    window.analyticsData.budgets = data.budgets;
    
    const container = document.getElementById('budgetsList');
    if (data.budgets.length === 0) {
        container.innerHTML = '<div class="empty-state">Добавьте свой первый бюджет</div>';
        return;
    }
    
    container.innerHTML = data.budgets.map(budget => {
        const percentage = parseFloat(budget.percentage);
        const status = percentage > 100 ? 'danger' : percentage > 80 ? 'warning' : '';
        
        return `
            <div class="budget-card">
                <div class="budget-header">
                    <span class="budget-name">${budget.icon || '🎯'} ${budget.budget_name}</span>
                    <span class="budget-period">${formatPeriod(budget.period_type)}</span>
                </div>
                <div class="progress-wrapper">
                    <div class="progress-bar">
                        <div class="progress-fill ${status}" style="width: ${Math.min(percentage, 100)}%"></div>
                    </div>
                    <div class="progress-info">
                        <span>${formatMoney(budget.spent)} / ${formatMoney(budget.budget_amount)} ₽</span>
                        <span>${percentage.toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Цели
async function loadGoals() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/goals`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    window.analyticsData.goals = data.goals;
    
    const container = document.getElementById('goalsList');
    if (data.goals.length === 0) {
        container.innerHTML = '<div class="empty-state">Добавьте свою первую цель</div>';
        return;
    }
    
    container.innerHTML = data.goals.map(goal => {
        const progress = parseFloat(goal.progress);
        
        return `
            <div class="goal-card">
                <div class="budget-header">
                    <span class="budget-name">${goal.goal_name}</span>
                    <span class="budget-period">${formatPriority(goal.priority)}</span>
                </div>
                <div class="progress-wrapper">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
                    </div>
                    <div class="progress-info">
                        <span>${formatMoney(goal.current_amount)} / ${formatMoney(goal.target_amount)} ₽</span>
                        <span>${progress.toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Категории для выбора
async function loadCategoryOptions() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/categories`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    const expenseCategories = data.categories.filter(c => c.category_type === 'expense');
    
    const select = document.getElementById('budgetCategory');
    select.innerHTML = '<option value="">Все категории</option>' +
        expenseCategories.map(cat => 
            `<option value="${cat.category_id}">${cat.icon} ${cat.category_name}</option>`
        ).join('');
}

// Модальные окна
function showBudgetModal() {
    document.getElementById('budgetModal').classList.add('active');
    document.getElementById('budgetStartDate').valueAsDate = new Date();
}

function closeBudgetModal() {
    document.getElementById('budgetModal').classList.remove('active');
    document.getElementById('budgetForm').reset();
}

function showGoalModal() {
    document.getElementById('goalModal').classList.add('active');
}

function closeGoalModal() {
    document.getElementById('goalModal').classList.remove('active');
    document.getElementById('goalForm').reset();
}

function showAllCategories() {
    alert('Показать все категории');
}

// Формы
document.getElementById('budgetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    const formData = {
        budgetName: document.getElementById('budgetName').value,
        budgetAmount: parseFloat(document.getElementById('budgetAmount').value),
        categoryId: document.getElementById('budgetCategory').value || null,
        periodType: document.getElementById('budgetPeriod').value,
        startDate: document.getElementById('budgetStartDate').value,
        alertThreshold: 80
    };
    
    try {
        const response = await fetch(`${API_URL}/analytics/budgets`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) throw new Error('Failed');
        
        closeBudgetModal();
        await loadBudgets();
        showToast('Бюджет успешно создан!');
    } catch (error) {
        showToast('Ошибка при создании бюджета', 'error');
    }
});

document.getElementById('goalForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    const formData = {
        goalName: document.getElementById('goalName').value,
        goalDescription: document.getElementById('goalDescription').value || null,
        targetAmount: parseFloat(document.getElementById('goalAmount').value),
        targetDate: document.getElementById('goalDate').value || null,
        priority: document.getElementById('goalPriority').value
    };
    
    try {
        const response = await fetch(`${API_URL}/analytics/goals`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) throw new Error('Failed');
        
        closeGoalModal();
        await loadGoals();
        showToast('Цель успешно добавлена!');
    } catch (error) {
        showToast('Ошибка при создании цели', 'error');
    }
});

// Фильтр периода
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentPeriod = e.target.dataset.period;
        updatePeriodLabel();
        loadSummary();
        loadCategories();
    });
});

function updatePeriodLabel() {
    const labels = {
        'day': 'Сегодня',
        'week': 'Эта неделя',
        'month': 'Текущий месяц',
        'year': 'Текущий год'
    };
    document.getElementById('periodLabel').textContent = labels[currentPeriod];
}

// Toast
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 70px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: ${type === 'success' ? '#48bb78' : '#f56565'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Вспомогательные функции
function formatMoney(amount) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

function formatPeriod(period) {
    const periods = {
        'daily': 'День',
        'weekly': 'Неделя',
        'monthly': 'Месяц',
        'yearly': 'Год'
    };
    return periods[period] || period;
}

function formatPriority(priority) {
    const priorities = {
        'low': 'Низкий',
        'medium': 'Средний',
        'high': 'Высокий'
    };
    return priorities[priority] || priority;
}

// Запуск
window.addEventListener('DOMContentLoaded', loadAnalytics);
