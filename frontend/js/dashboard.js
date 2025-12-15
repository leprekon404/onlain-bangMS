// frontend/js/dashboard.js

const API = '/api';

const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !user) {
  location.href = 'login.html';
}

// имя в приветствии
const firstName = (user.fullName || user.username || 'Клиент').split(' ')[0];
const userFirstNameEl = document.getElementById('userFirstName');
if (userFirstNameEl) userFirstNameEl.textContent = firstName;

// выход
function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.href = 'login.html';
}
document.getElementById('logoutBtn')?.addEventListener('click', doLogout);
document.getElementById('navLogoutBtn')?.addEventListener('click', doLogout);

// ----- вспомогательные функции API -----

async function apiGet(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (res.status === 401) {
    doLogout();
    return null;
  }
  return res.json();
}

async function apiRequest(path, method, bodyObj) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(bodyObj || {}),
  });
  if (res.status === 401) {
    doLogout();
    return null;
  }
  return res.json();
}

function formatMoney(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('ru-RU');
}

// ----- счета / карты -----

let accountsCache = [];
let activeAccountIndex = 0;

async function fetchAccounts() {
  try {
    const data = await apiGet('/accounts');
    if (!data || !data.success) return [];
    accountsCache = data.accounts || [];
    return accountsCache;
  } catch (e) {
    console.error('Ошибка загрузки счетов', e);
    return [];
  }
}

// рендер визуальной карусели карт
function renderCardCarousel(accounts) {
  const track = document.getElementById('cardTrack');
  const dotsWrap = document.getElementById('cardDots');
  const countLabel = document.getElementById('accountsCountLabel');

  if (!track || !dotsWrap) return;

  if (!accounts.length) {
    track.innerHTML = '';
    dotsWrap.innerHTML = '';
    if (countLabel) countLabel.textContent = '0 карт';
    return;
  }

  track.innerHTML = accounts
    .map((a, idx) => {
      const last4 = String(a.account_number || '').slice(-4);
      const typeLabel =
        a.account_type === 'credit'
          ? 'Кредитная карта'
          : a.account_type === 'savings'
          ? 'Накопительный счёт'
          : 'Дебетовая карта';

      return `
        <div class="md-card-slide">
          <div class="md-main-card">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <div class="md-card-label">${typeLabel}</div>
                <div class="md-card-balance">${formatMoney(a.balance)} ₽</div>
              </div>
              <div class="text-end" style="font-size: 0.75rem; opacity: .9;">
                <div>${a.currency || 'RUB'}</div>
                <div>ID ${a.account_id}</div>
              </div>
            </div>
            <div class="md-card-change">Изменение за месяц: +0%</div>
            <div class="md-card-row">
              <div class="md-card-details">
                <div class="md-card-label">Карта</div>
                <div class="md-card-number">**** ${last4}</div>
              </div>
              <div class="md-card-details text-end">
                <div class="md-card-label">Срок</div>
                <div class="md-card-exp">02/25</div>
              </div>
            </div>
            <button class="md-pill-btn" onclick="openManageFromCard(${idx})">
              Управлять картой
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  dotsWrap.innerHTML = accounts
    .map(
      (_a, idx) =>
        `<button class="md-card-dot" data-card-index="${idx}"></button>`
    )
    .join('');

  if (countLabel) {
    const n = accounts.length;
    countLabel.textContent = `${n} ${n === 1 ? 'карта' : n < 5 ? 'карты' : 'карт'}`;
  }

  dotsWrap.querySelectorAll('.md-card-dot').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-card-index'));
      setActiveAccount(idx);
    });
  });

  // начальное положение
  setActiveAccount(0);
}

// обновляет активный индекс и сдвигает трек
function setActiveAccount(index) {
  if (!accountsCache.length) return;
  if (index < 0) index = accountsCache.length - 1;
  if (index >= accountsCache.length) index = 0;
  activeAccountIndex = index;

  const track = document.getElementById('cardTrack');
  const dotsWrap = document.getElementById('cardDots');
  if (track) {
    track.style.transform = `translateX(-${activeAccountIndex * 100}%)`;
  }
  if (dotsWrap) {
    dotsWrap.querySelectorAll('.md-card-dot').forEach((btn, idx) => {
      if (idx === activeAccountIndex) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  }

  // подсветка в списке счетов
  highlightAccountInList();
}

// открыть управление выбранной картой по нажатию на самой карте
window.openManageFromCard = function (index) {
  if (!accountsCache.length) return;
  setActiveAccount(index);
  const acc = accountsCache[activeAccountIndex];
  openManageSheet(acc);
};

// список счетов под картой
function renderAccountsList(accounts) {
  const list = document.getElementById('accountsList');
  if (!list) return;

  if (!accounts.length) {
    list.textContent = 'Счета не найдены';
    return;
  }

  list.innerHTML = accounts
    .map((a, idx) => {
      const last4 = String(a.account_number).slice(-4);
      const typeLabel =
        a.account_type === 'credit'
          ? 'КРЕДИТНАЯ КАРТА'
          : a.account_type === 'savings'
          ? 'НАКОПИТЕЛЬНЫЙ СЧЁТ'
          : 'ДЕБЕТОВАЯ КАРТА';
      const status = !a.is_active
        ? 'Закрыт'
        : a.is_frozen
        ? 'Временно заблокирован'
        : 'Активен';

      return `
        <div class="account-item" data-account-index="${idx}">
          <div class="account-main">
            <div class="account-type">${typeLabel}</div>
            <div class="account-number">**** ${last4}</div>
          </div>
          <div class="text-end">
            <div class="account-balance">${formatMoney(a.balance)} ₽</div>
            <div class="account-status">${status}</div>
          </div>
          <div class="account-actions">
            <button class="account-btn" data-open-card="${idx}">Открыть</button>
            <button class="account-btn" data-manage-card="${idx}">Карта</button>
          </div>
        </div>
      `;
    })
    .join('');

  list.querySelectorAll('[data-open-card]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-open-card'));
      setActiveAccount(idx);
      // плавный скролл вверх к карте
      document
        .querySelector('.md-card-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  list.querySelectorAll('[data-manage-card]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-manage-card'));
      const acc = accountsCache[idx];
      setActiveAccount(idx);
      openManageSheet(acc);
    });
  });

  highlightAccountInList();
}

function highlightAccountInList() {
  const list = document.getElementById('accountsList');
  if (!list) return;
  list.querySelectorAll('.account-item').forEach((el, idx) => {
    if (idx === activeAccountIndex) el.classList.add('active');
    else el.classList.remove('active');
  });
}

// ----- операции -----

async function loadTransactions(limit = 5) {
  const container = document.getElementById('txList');
  if (!container) return;

  container.textContent = 'Загрузка...';

  try {
    const data = await apiGet('/transactions/history');
    if (!data || !data.success) {
      container.textContent = 'Не удалось загрузить операции';
      return;
    }

    const txs = (data.transactions || []).slice(0, limit);
    if (!txs.length) {
      container.textContent = 'Операций пока нет';
      return;
    }

    container.innerHTML = txs
      .map((t) => {
        const sign = t.to_account_id === null ? '-' : t.from_account_id === null ? '+' : '';
        const cls =
          sign === '-'
            ? 'transaction-amount neg'
            : sign === '+'
            ? 'transaction-amount pos'
            : 'transaction-amount';
        const amount = `${sign}${formatMoney(t.amount)} ₽`;
        const title =
          t.description ||
          (t.transaction_type === 'transfer'
            ? 'Перевод'
            : t.transaction_type === 'self-transfer'
            ? 'Перевод между своими'
            : t.transaction_type);
        const subtitle = `${t.created_at || ''}`;
        return `
          <div class="transaction-item">
            <div>
              <div class="transaction-merchant">${title}</div>
              <div class="transaction-meta">${subtitle}</div>
            </div>
            <div class="${cls}">${amount}</div>
          </div>
        `;
      })
      .join('');
  } catch (e) {
    console.error('History error', e);
    container.textContent = 'Ошибка при загрузке операций';
  }
}

// ----- перевод между своими -----

const transferSheet = document.getElementById('transferSheet');
const transferFromSel = document.getElementById('transferFrom');
const transferToSel = document.getElementById('transferTo');
const transferAmountInput = document.getElementById('transferAmount');
const transferCommentInput = document.getElementById('transferComment');
const transferErrorEl = document.getElementById('transferError');

function openTransferSheet() {
  if (!transferSheet) return;
  transferSheet.classList.add('open');

  // заполнить select'ы актуальными счетами
  const options = accountsCache
    .map(
      (a, idx) =>
        `<option value="${a.account_id}" ${idx === activeAccountIndex ? 'selected' : ''}>
          **** ${String(a.account_number).slice(-4)} — ${formatMoney(a.balance)} ₽
        </option>`
    )
    .join('');
  if (transferFromSel) transferFromSel.innerHTML = options;
  if (transferToSel) transferToSel.innerHTML = options;

  transferAmountInput.value = '';
  transferCommentInput.value = '';
  transferErrorEl.textContent = '';
}

function closeTransferSheet() {
  transferSheet?.classList.remove('open');
}

async function submitSelfTransfer() {
  if (!transferFromSel || !transferToSel) return;
  const fromAccountId = Number(transferFromSel.value);
  const toAccountId = Number(transferToSel.value);
  const amount = Number(transferAmountInput.value);
  const description = transferCommentInput.value.trim();

  if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
    transferErrorEl.textContent = 'Заполните все поля и укажите сумму больше нуля';
    return;
  }
  if (fromAccountId === toAccountId) {
    transferErrorEl.textContent = 'Нельзя перевести на тот же счёт';
    return;
  }

  transferErrorEl.textContent = 'Выполняем перевод...';

  const data = await apiRequest('/transactions/transfer-self', 'POST', {
    fromAccountId,
    toAccountId,
    amount,
    description,
  });
  if (!data) return;

  if (!data.success) {
    transferErrorEl.textContent = data.message || 'Ошибка перевода';
    return;
  }

  transferErrorEl.textContent = '';
  closeTransferSheet();

  // обновить баланс и историю
  await fetchAccounts().then((accs) => {
    renderCardCarousel(accs);
    renderAccountsList(accs);
  });
  await loadTransactions(5);
}

// ----- управление картой -----

const manageSheet = document.getElementById('manageSheet');
const manageTitle = document.getElementById('manageTitle');
const manageLimitInput = document.getElementById('manageLimit');
const manageFreezeChk = document.getElementById('manageFreeze');
const manageOldPin = document.getElementById('manageOldPin');
const manageNewPin = document.getElementById('manageNewPin');
const manageNewPin2 = document.getElementById('manageNewPin2');
const manageErrorEl = document.getElementById('manageError');

let manageAccountId = null;

function openManageSheet(account) {
  if (!account || !manageSheet) return;
  manageAccountId = account.account_id;

  if (manageTitle) {
    const last4 = String(account.account_number || '').slice(-4);
    manageTitle.textContent = `Карта **** ${last4}`;
  }
  if (manageLimitInput) {
    manageLimitInput.value =
      account.daily_limit == null ? '' : String(account.daily_limit);
  }
  if (manageFreezeChk) manageFreezeChk.checked = !!account.is_frozen;

  if (manageOldPin) manageOldPin.value = '';
  if (manageNewPin) manageNewPin.value = '';
  if (manageNewPin2) manageNewPin2.value = '';
  if (manageErrorEl) manageErrorEl.textContent = '';

  manageSheet.classList.add('open');
}

function closeManageSheet() {
  manageSheet?.classList.remove('open');
  manageAccountId = null;
}

async function saveManageSettings() {
  if (!manageAccountId) return;

  // лимит
  const dailyLimit =
    manageLimitInput && manageLimitInput.value !== ''
      ? Number(manageLimitInput.value)
      : null;
  const freeze = manageFreezeChk?.checked || false;

  const limitRes = await apiRequest(
    `/accounts/${manageAccountId}/limit`,
    'PATCH',
    { dailyLimit }
  );
  if (!limitRes || !limitRes.success) {
    manageErrorEl.textContent =
      (limitRes && limitRes.message) || 'Ошибка сохранения лимита';
    return;
  }

  const freezeRes = await apiRequest(
    `/accounts/${manageAccountId}/freeze`,
    'PATCH',
    { freeze }
  );
  if (!freezeRes || !freezeRes.success) {
    manageErrorEl.textContent =
      (freezeRes && freezeRes.message) || 'Ошибка блокировки карты';
    return;
  }

  manageErrorEl.textContent = 'Настройки сохранены';
  // обновить локальные данные
  await fetchAccounts().then((accs) => {
    renderCardCarousel(accs);
    renderAccountsList(accs);
  });
}

async function changePin() {
  if (!manageAccountId) return;
  const oldPin = manageOldPin?.value || '';
  const newPin = manageNewPin?.value || '';
  const newPin2 = manageNewPin2?.value || '';

  if (!newPin || newPin.length < 4) {
    manageErrorEl.textContent = 'PIN должен содержать минимум 4 цифры';
    return;
  }
  if (newPin !== newPin2) {
    manageErrorEl.textContent = 'Новые PIN не совпадают';
    return;
  }

  const res = await apiRequest(`/accounts/${manageAccountId}/pin`, 'PATCH', {
    oldPin: oldPin || null,
    newPin,
  });
  if (!res || !res.success) {
    manageErrorEl.textContent =
      (res && res.message) || 'Ошибка смены PIN';
    return;
  }

  manageErrorEl.textContent = 'PIN обновлён';
  manageOldPin.value = '';
  manageNewPin.value = '';
  manageNewPin2.value = '';
}

// ----- навигация и кнопки -----

document.getElementById('addMoneyBtn')?.addEventListener('click', () => {
  alert('Здесь может быть экран пополнения счёта.');
});
document.getElementById('selfTransferBtn')?.addEventListener('click', openTransferSheet);
document.getElementById('navTransferFab')?.addEventListener('click', openTransferSheet);
document.getElementById('sendBtn')?.addEventListener('click', () => {
  alert('Для учебного проекта реализован только перевод между своими счетами.');
});
document.getElementById('moreBtn')?.addEventListener('click', () => {
  alert('Здесь могут быть шаблоны платежей и другие функции.');
});

document.querySelector('[data-close-transfer]')?.addEventListener('click', closeTransferSheet);
transferSheet?.addEventListener('click', (e) => {
  if (e.target === transferSheet) closeTransferSheet();
});
document
  .getElementById('transferSubmitBtn')
  ?.addEventListener('click', submitSelfTransfer);

document.querySelector('[data-close-manage]')?.addEventListener('click', closeManageSheet);
manageSheet?.addEventListener('click', (e) => {
  if (e.target === manageSheet) closeManageSheet();
});
document
  .getElementById('manageSaveBtn')
  ?.addEventListener('click', saveManageSettings);
document
  .getElementById('managePinBtn')
  ?.addEventListener('click', changePin);

document.getElementById('seeAllTxBtn')?.addEventListener('click', () => {
  loadTransactions(50);
});

// простая навигация по «страницам» (пока весь контент один, просто подсветка)
document.getElementById('navOverviewBtn')?.addEventListener('click', () => {
  document
    .querySelectorAll('.md-bottom-nav > button')
    .forEach((b) => b.classList.remove('active'));
  document.getElementById('navOverviewBtn')?.classList.add('active');
});
document.getElementById('navCardsBtn')?.addEventListener('click', () => {
  document
    .querySelectorAll('.md-bottom-nav > button')
    .forEach((b) => b.classList.remove('active'));
  document.getElementById('navCardsBtn')?.classList.add('active');
  document
    .querySelector('.md-accounts-section')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Переход на страницу аналитики при нажатии на кнопку "История"
document.getElementById('navHistoryBtn')?.addEventListener('click', () => {
  location.href = 'analytics.html';
});

// ----- старт -----

async function loadOverview() {
  const accounts = await fetchAccounts();
  renderCardCarousel(accounts);
  renderAccountsList(accounts);
  await loadTransactions(5);
}

loadOverview();
