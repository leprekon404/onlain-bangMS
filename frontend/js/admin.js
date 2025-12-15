const API_URL = 'http://localhost:3000/api';

let currentSection = 'dashboard';
let currentUserId = null;

// Проверка прав администратора
function checkAdminAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    
    if (!token || !user) {
        window.location.href = 'login.html';
        return false;
    }
    
    // Проверяем роль администратора
    if (user.roleId !== 2 && user.roleName !== 'admin') {
        alert('Доступ запрещен. Требуются права администратора.');
        window.location.href = 'dashboard.html';
        return false;
    }
    
    return true;
}

// Загрузка статистики
async function loadDashboard() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load stats');
        
        const data = await response.json();
        const stats = data.stats;
        
        document.getElementById('totalUsers').textContent = stats.totalUsers;
        document.getElementById('totalAccounts').textContent = stats.totalAccounts;
        document.getElementById('totalBalance').textContent = formatMoney(stats.totalBalance) + ' ₽';
        document.getElementById('todayTransactions').textContent = stats.todayTransactions.count;
        document.getElementById('monthTransactions').textContent = stats.monthTransactions.count + ' транзакций';
        document.getElementById('monthVolume').textContent = formatMoney(stats.monthTransactions.volume) + ' ₽';
        document.getElementById('activeUsers').textContent = stats.activeUsers + ' пользователей';
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Ошибка загрузки статистики');
    }
}

// Загрузка списка пользователей
async function loadUsers(page = 1, search = '') {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(
            `${API_URL}/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (!response.ok) throw new Error('Failed to load users');
        
        const data = await response.json();
        const tbody = document.getElementById('usersTableBody');
        
        if (data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Пользователи не найдены</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.users.map(user => `
            <tr>
                <td>${user.user_id}</td>
                <td>
                    <strong>${user.full_name || user.username}</strong><br>
                    <small class="text-muted">@${user.username}</small>
                </td>
                <td>${user.email}</td>
                <td>
                    <span class="badge badge-${user.role_name === 'admin' ? 'admin' : 'user'}">
                        ${user.role_name === 'admin' ? 'Администратор' : 'Пользователь'}
                    </span>
                </td>
                <td>${user.accounts_count || 0}</td>
                <td>${formatMoney(user.total_balance || 0)} ₽</td>
                <td>
                    <button class="btn btn-sm btn-primary btn-action" onclick="viewUser(${user.user_id})">
                        Просмотр
                    </button>
                    <button class="btn btn-sm btn-success btn-action" onclick="showAddBalance(${user.user_id})">
                        + Баланс
                    </button>
                    ${user.is_verified ? 
                        `<button class="btn btn-sm btn-warning btn-action" onclick="blockUser(${user.user_id}, true)">
                            Блокировать
                        </button>` :
                        `<button class="btn btn-sm btn-info btn-action" onclick="blockUser(${user.user_id}, false)">
                            Разблокировать
                        </button>`
                    }
                </td>
            </tr>
        `).join('');
        
        // Пагинация
        renderPagination('usersPagination', data.pagination, (p) => loadUsers(p, search));
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Ошибка загрузки пользователей');
    }
}

// Просмотр пользователя
async function viewUser(userId) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load user');
        
        const data = await response.json();
        const user = data.user;
        
        const modalBody = document.getElementById('userModalBody');
        modalBody.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Основная информация</h6>
                    <p><strong>ID:</strong> ${user.user_id}</p>
                    <p><strong>Username:</strong> ${user.username}</p>
                    <p><strong>Email:</strong> ${user.email}</p>
                    <p><strong>Телефон:</strong> ${user.phone_number || 'Не указан'}</p>
                    <p><strong>Роль:</strong> ${user.role_name}</p>
                    <p><strong>Дата регистрации:</strong> ${new Date(user.created_at).toLocaleString('ru-RU')}</p>
                </div>
                <div class="col-md-6">
                    <h6>Счета</h6>
                    ${data.accounts.map(acc => `
                        <div class="mb-2 p-2 border rounded">
                            <strong>**** ${String(acc.account_number).slice(-4)}</strong><br>
                            <small>Баланс: ${formatMoney(acc.balance)} ₽</small><br>
                            <small class="text-muted">${acc.account_type}</small>
                        </div>
                    `).join('')}
                </div>
            </div>
            <hr>
            <h6>Последние транзакции</h6>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Дата</th>
                            <th>Описание</th>
                            <th>Сумма</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.recentTransactions.map(tx => `
                            <tr>
                                <td>${new Date(tx.created_at).toLocaleDateString('ru-RU')}</td>
                                <td>${tx.description || tx.transaction_type}</td>
                                <td>${formatMoney(tx.amount)} ₽</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        new bootstrap.Modal(document.getElementById('userModal')).show();
    } catch (error) {
        console.error('Error viewing user:', error);
        showError('Ошибка загрузки информации о пользователе');
    }
}

// Блокировка/разблокировка пользователя
async function blockUser(userId, block) {
    const token = localStorage.getItem('token');
    const reason = prompt(block ? 'Причина блокировки:' : 'Причина разблокировки:');
    
    if (reason === null) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/block`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ blocked: block, reason })
        });
        
        if (!response.ok) throw new Error('Failed');
        
        const data = await response.json();
        alert(data.message);
        loadUsers();
    } catch (error) {
        console.error('Error blocking user:', error);
        showError('Ошибка изменения статуса пользователя');
    }
}

// Показать форму пополнения
async function showAddBalance(userId) {
    currentUserId = userId;
    const token = localStorage.getItem('token');
    
    try {
        // Загружаем счета пользователя
        const response = await fetch(`${API_URL}/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed');
        
        const data = await response.json();
        const select = document.getElementById('balanceAccountId');
        
        select.innerHTML = data.accounts.map(acc => 
            `<option value="${acc.account_id}">**** ${String(acc.account_number).slice(-4)} (${formatMoney(acc.balance)} ₽)</option>`
        ).join('');
        
        document.getElementById('balanceUserId').value = userId;
        document.getElementById('balanceAmount').value = '';
        document.getElementById('balanceDescription').value = '';
        
        new bootstrap.Modal(document.getElementById('balanceModal')).show();
    } catch (error) {
        console.error('Error loading accounts:', error);
        showError('Ошибка загрузки счетов');
    }
}

// Отправка пополнения
async function submitAddBalance() {
    const token = localStorage.getItem('token');
    const userId = document.getElementById('balanceUserId').value;
    const accountId = document.getElementById('balanceAccountId').value;
    const amount = parseFloat(document.getElementById('balanceAmount').value);
    const description = document.getElementById('balanceDescription').value;
    
    if (!amount || amount <= 0) {
        alert('Введите корректную сумму');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/add-balance`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ accountId, amount, description })
        });
        
        if (!response.ok) throw new Error('Failed');
        
        const data = await response.json();
        alert(data.message);
        bootstrap.Modal.getInstance(document.getElementById('balanceModal')).hide();
        loadUsers();
    } catch (error) {
        console.error('Error adding balance:', error);
        showError('Ошибка пополнения баланса');
    }
}

// Загрузка транзакций
async function loadTransactions(page = 1) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(
            `${API_URL}/admin/transactions?page=${page}&limit=50`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (!response.ok) throw new Error('Failed');
        
        const data = await response.json();
        const tbody = document.getElementById('transactionsTableBody');
        
        tbody.innerHTML = data.transactions.map(tx => `
            <tr>
                <td>${tx.transaction_id}</td>
                <td>${new Date(tx.created_at).toLocaleString('ru-RU')}</td>
                <td>${tx.from_username || 'Внешний'}</td>
                <td>${tx.to_username || 'Внешний'}</td>
                <td>${formatMoney(tx.amount)} ₽</td>
                <td><small>${tx.transaction_type}</small></td>
                <td><span class="badge bg-${tx.status === 'completed' ? 'success' : 'warning'}">${tx.status}</span></td>
            </tr>
        `).join('');
        
        renderPagination('transactionsPagination', data.pagination, loadTransactions);
    } catch (error) {
        console.error('Error loading transactions:', error);
        showError('Ошибка загрузки транзакций');
    }
}

// Загрузка логов
async function loadLogs(page = 1) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(
            `${API_URL}/admin/logs?page=${page}&limit=50`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (!response.ok) throw new Error('Failed');
        
        const data = await response.json();
        const tbody = document.getElementById('logsTableBody');
        
        tbody.innerHTML = data.logs.map(log => `
            <tr>
                <td>${new Date(log.created_at).toLocaleString('ru-RU')}</td>
                <td>${log.admin_username}</td>
                <td><code>${log.action_type}</code></td>
                <td>${log.description || '-'}</td>
            </tr>
        `).join('');
        
        renderPagination('logsPagination', data.pagination, loadLogs);
    } catch (error) {
        console.error('Error loading logs:', error);
        showError('Ошибка загрузки логов');
    }
}

// Пагинация
function renderPagination(containerId, pagination, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const { page, totalPages } = pagination;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<ul class="pagination">';
    
    for (let i = 1; i <= Math.min(totalPages, 10); i++) {
        html += `<li class="page-item ${i === page ? 'active' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); ${callback.name}(${i})">${i}</a>
        </li>`;
    }
    
    html += '</ul>';
    container.innerHTML = html;
}

// Переключение разделов
function switchSection(section) {
    // Скрываем все секции
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
    
    // Показываем нужную
    document.getElementById(`${section}-section`).style.display = 'block';
    
    // Обновляем навигацию
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-section') === section) {
            link.classList.add('active');
        }
    });
    
    currentSection = section;
    
    // Загружаем данные
    switch(section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'users':
            loadUsers();
            break;
        case 'transactions':
            loadTransactions();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

// Утилиты
function formatMoney(amount) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

function showError(message) {
    alert(message);
}

// Инициализация
window.addEventListener('DOMContentLoaded', () => {
    if (!checkAdminAuth()) return;
    
    // Навигация
    document.querySelectorAll('.sidebar .nav-link[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('data-section');
            switchSection(section);
        });
    });
    
    // Поиск пользователей
    let searchTimeout;
    document.getElementById('userSearch')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadUsers(1, e.target.value);
        }, 500);
    });
    
    // Выход
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    });
    
    // Загружаем дашборд
    loadDashboard();
});
