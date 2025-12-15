const API_URL = 'http://localhost:3000/api';

let trendChart = null;
let pieChart = null;
let currentPeriod = 'month';

// Проверка аутентификации
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    return token;
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

// Загрузка данных
async function loadAnalytics() {
    const token = checkAuth();
    if (!token) return;

    try {
        await Promise.all([
            loadSummary(),
            loadCategoryBreakdown(),
            loadIncomExpenseTrend(),
            loadBudgets(),
            loadGoals(),
            loadCategories()
        ]);
    } catch (error) {
        console.error('Error loading analytics:', error);
        alert('Ошибка при загрузке данных');
    }
}

// Общая сводка
async function loadSummary() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/summary?period=${currentPeriod}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load summary');
    
    const data = await response.json();
    const summary = data.summary;
    
    document.getElementById('totalBalance').textContent = `${formatMoney(summary.totalBalance)} ₽`;
    document.getElementById('totalIncome').textContent = `${formatMoney(summary.totalIncome)} ₽`;
    document.getElementById('totalExpense').textContent = `${formatMoney(summary.totalExpense)} ₽`;
    document.getElementById('netSavings').textContent = `${formatMoney(summary.netSavings)} ₽`;
    document.getElementById('savingsRate').textContent = `${summary.savingsRate}% от доходов`;
}

// Расходы по категориям
async function loadCategoryBreakdown() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/spending-by-category?period=${currentPeriod}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load category breakdown');
    
    const data = await response.json();
    const categories = data.categories;
    
    // Обновляем список
    const container = document.getElementById('categoryBreakdown');
    container.innerHTML = categories.map(cat => `
        <div class="category-item">
            <div class="category-info">
                <span class="category-icon">${cat.icon}</span>
                <span class="category-name">${cat.category}</span>
                <span class="category-count">${cat.count} транз.</span>
            </div>
            <div class="category-amount">
                <span class="amount">${formatMoney(cat.total)} ₽</span>
                <span class="percentage">${cat.percentage}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${cat.percentage}%; background-color: ${cat.color};"></div>
            </div>
        </div>
    `).join('');
    
    // Обновляем круговую диаграмму
    updatePieChart(categories);
}

// Тренд доходов и расходов
async function loadIncomExpenseTrend() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/income-expense-trend?months=12`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load trend');
    
    const data = await response.json();
    updateTrendChart(data.trend);
}

// Обновление графика трендов
function updateTrendChart(trend) {
    const ctx = document.getElementById('incomExpenseTrendChart').getContext('2d');
    
    if (trendChart) {
        trendChart.destroy();
    }
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.map(t => t.month),
            datasets: [
                {
                    label: 'Доходы',
                    data: trend.map(t => t.income),
                    borderColor: '#00B894',
                    backgroundColor: 'rgba(0, 184, 148, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Расходы',
                    data: trend.map(t => t.expense),
                    borderColor: '#FF6B6B',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Баланс',
                    data: trend.map(t => t.balance),
                    borderColor: '#6C5CE7',
                    backgroundColor: 'rgba(108, 92, 231, 0.1)',
                    tension: 0.4,
                    fill: false,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatMoney(value) + ' ₽';
                        }
                    }
                }
            }
        }
    });
}

// Обновление круговой диаграммы
function updatePieChart(categories) {
    const ctx = document.getElementById('categoryPieChart').getContext('2d');
    
    if (pieChart) {
        pieChart.destroy();
    }
    
    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories.map(c => c.category),
            datasets: [{
                data: categories.map(c => c.total),
                backgroundColor: categories.map(c => c.color),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = formatMoney(context.parsed);
                            return `${label}: ${value} ₽`;
                        }
                    }
                }
            }
        }
    });
}

// Загрузка бюджетов
async function loadBudgets() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/budgets`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load budgets');
    
    const data = await response.json();
    const budgets = data.budgets;
    
    const container = document.getElementById('budgetsList');
    if (budgets.length === 0) {
        container.innerHTML = '<p class="empty-state">У вас пока нет бюджетов</p>';
        return;
    }
    
    container.innerHTML = budgets.map(budget => {
        const percentage = parseFloat(budget.percentage);
        const isOverBudget = percentage > 100;
        const status = isOverBudget ? 'over-budget' : percentage > 80 ? 'warning' : 'ok';
        
        return `
            <div class="budget-item ${status}">
                <div class="budget-header">
                    <span class="budget-icon">${budget.icon || '🎯'}</span>
                    <div class="budget-info">
                        <strong>${budget.budget_name}</strong>
                        <span class="budget-period">${formatPeriod(budget.period_type)}</span>
                    </div>
                    <button onclick="deleteBudget(${budget.budget_id})" class="btn-delete">×</button>
                </div>
                <div class="budget-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(percentage, 100)}%"></div>
                    </div>
                    <div class="budget-amounts">
                        <span>Потрачено: ${formatMoney(budget.spent)} ₽</span>
                        <span>Бюджет: ${formatMoney(budget.budget_amount)} ₽</span>
                    </div>
                    <div class="budget-status">
                        ${isOverBudget ? 
                            `<span class="error">Превышено на ${formatMoney(Math.abs(budget.remaining))} ₽</span>` :
                            `<span>Осталось: ${formatMoney(budget.remaining)} ₽</span>`
                        }
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Загрузка целей
async function loadGoals() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/analytics/goals`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load goals');
    
    const data = await response.json();
    const goals = data.goals;
    
    const container = document.getElementById('goalsList');
    if (goals.length === 0) {
        container.innerHTML = '<p class="empty-state">У вас пока нет финансовых целей</p>';
        return;
    }
    
    container.innerHTML = goals.map(goal => {
        const progress = parseFloat(goal.progress);
        const isCompleted = goal.is_completed;
        
        return `
            <div class="goal-item ${isCompleted ? 'completed' : ''}">
                <div class="goal-header">
                    <strong>${goal.goal_name}</strong>
                    <span class="goal-priority priority-${goal.priority}">${formatPriority(goal.priority)}</span>
                </div>
                ${goal.goal_description ? `<p class="goal-description">${goal.goal_description}</p>` : ''}
                <div class="goal-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
                    </div>
                    <div class="goal-amounts">
                        <span>${formatMoney(goal.current_amount)} / ${formatMoney(goal.target_amount)} ₽</span>
                        <span>${progress}%</span>
                    </div>
                </div>
                ${goal.target_date ? `<p class="goal-date">Цель: ${formatDate(goal.target_date)}</p>` : ''}
            </div>
        `;
    }).join('');
}

// Загрузка категорий для выбора
async function loadCategories() {
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

// Создание бюджета
function showCreateBudgetModal() {
    document.getElementById('budgetModal').style.display = 'block';
    document.getElementById('budgetStartDate').valueAsDate = new Date();
}

function closeBudgetModal() {
    document.getElementById('budgetModal').style.display = 'none';
    document.getElementById('budgetForm').reset();
}

document.getElementById('budgetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    const formData = {
        budgetName: document.getElementById('budgetName').value,
        budgetAmount: parseFloat(document.getElementById('budgetAmount').value),
        categoryId: document.getElementById('budgetCategory').value || null,
        periodType: document.getElementById('budgetPeriod').value,
        startDate: document.getElementById('budgetStartDate').value,
        alertThreshold: document.getElementById('alertThreshold').value || null
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
        
        if (!response.ok) throw new Error('Failed to create budget');
        
        closeBudgetModal();
        await loadBudgets();
        alert('Бюджет успешно создан!');
    } catch (error) {
        console.error('Error creating budget:', error);
        alert('Ошибка при создании бюджета');
    }
});

// Удаление бюджета
async function deleteBudget(budgetId) {
    if (!confirm('Удалить этот бюджет?')) return;
    
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_URL}/analytics/budgets/${budgetId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete budget');
        
        await loadBudgets();
    } catch (error) {
        console.error('Error deleting budget:', error);
        alert('Ошибка при удалении бюджета');
    }
}

// Создание цели
function showCreateGoalModal() {
    document.getElementById('goalModal').style.display = 'block';
}

function closeGoalModal() {
    document.getElementById('goalModal').style.display = 'none';
    document.getElementById('goalForm').reset();
}

document.getElementById('goalForm').addEventListener('submit', async (e) => {
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
        
        if (!response.ok) throw new Error('Failed to create goal');
        
        closeGoalModal();
        await loadGoals();
        alert('Цель успешно добавлена!');
    } catch (error) {
        console.error('Error creating goal:', error);
        alert('Ошибка при создании цели');
    }
});

// Фильтр по периоду
document.getElementById('periodFilter').addEventListener('change', (e) => {
    currentPeriod = e.target.value;
    loadSummary();
    loadCategoryBreakdown();
});

// Вспомогательные функции
function formatMoney(amount) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ru-RU');
}

function formatPeriod(period) {
    const periods = {
        'daily': 'Ежедневно',
        'weekly': 'Еженедельно',
        'monthly': 'Ежемесячно',
        'yearly': 'Ежегодно'
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

// Запуск при загрузке страницы
window.addEventListener('DOMContentLoaded', loadAnalytics);
