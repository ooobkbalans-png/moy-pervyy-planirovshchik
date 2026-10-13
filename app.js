/* Финалогика · локальный прототип. К1: завершенный режим просмотра.
   Сроки и календарь демо не являются проверенным налоговым календарем.
   Никакие данные не передаются на внешние серверы. */
(() => {
  'use strict';
  const DATA_KEY = 'finalogika.scheduler.v2';
  const SESSION_KEY = 'finalogika.scheduler.session';
  const PAGE_SIZE = 25;
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const POSITIONS = ['Главный бухгалтер', 'Зарплатник', 'Администратор', 'МатСтол'];
  const ROLES = { owner: 'Руководитель', admin: 'Администратор', employee: 'Сотрудник' };
  const NAMES = ['Демо Руководитель', 'Демо Менеджер', 'Анна Демова', 'Мария Примерова', 'Ирина Макетова', 'Ольга Тестова', 'Елена Учебная', 'Наталья Демина', 'Светлана Примерная', 'Татьяна Макетная', 'Юлия Тестовая', 'Вера Учебнова', 'Дарья Демовская', 'Алина Примерская', 'Ксения Макетская', 'Полина Тестовская', 'Лидия Учебникова', 'Нина Демонова', 'Евгения Примерникова', 'Валентина Макетникова'];
  const app = document.getElementById('app');
  const dialog = document.getElementById('detail-dialog');
  let data, user, index, fatalRaw = null;
  let taskCache = new Map();
  let rendering = false;
  let ui = { view: 'plan', mode: 'month', year: 0, month: 0, employee: 'all', search: '', type: 'all', status: 'all', waiting: false, overdue: false, page: 1, clientFocus: '' };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
  const pad = (number, length = 2) => String(number).padStart(length, '0');
  const iso = date => date.toISOString().slice(0, 10);
  const utc = value => new Date(value + 'T12:00:00Z');
  const addDays = (value, days) => { const d = utc(value); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
  const monthStart = (year, month) => { const d = new Date(Date.UTC(2000, 0, 1, 12)); d.setUTCFullYear(year, month, 1); return iso(d); };
  const moveMonth = (value, count) => { const d = utc(value); const number = Math.max(12, Math.min(119999, d.getUTCFullYear() * 12 + d.getUTCMonth() + count)); return monthStart(Math.floor(number / 12), number % 12); };
  const monthEnd = value => addDays(moveMonth(value, 1), -1);
  const realToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const today = () => data.settings.testToday || realToday();
  const displayDate = value => value ? value.split('-').reverse().join('.') : '—';
  const shortDate = value => value.slice(8, 10) + '.' + value.slice(5, 7);
  const daysBetween = (first, second) => Math.round((utc(second) - utc(first)) / 86400000);
  const isManager = () => user && ['owner', 'admin'].includes(user.role);
  const canSee = assignment => !!user && (isManager() || assignment.assigneeId === user.id);
  const selectedEmployee = () => isManager() ? ui.employee : user.id;

  function makeDemo(baseDate) {
    const baseMonth = baseDate.slice(0, 7) + '-01';
    const baseYear = Number(baseDate.slice(0, 4));
    const qMonth = Math.floor((Number(baseDate.slice(5, 7)) - 1) / 3) * 3;
    const users = NAMES.map((name, n) => ({ id: `u${pad(n + 1)}`, name, email: `demo${pad(n + 1)}@example.com`, role: n === 0 ? 'owner' : n === 1 ? 'admin' : 'employee', positions: n === 0 ? [POSITIONS[0]] : n === 1 ? [POSITIONS[2]] : n === 2 ? [POSITIONS[0], POSITIONS[1]] : [POSITIONS[(n - 2) % 4]], active: true }));
    const clients = Array.from({ length: 380 }, (_, n) => ({ id: `c${pad(n + 1, 3)}`, name: `Демо Компания ${pad(n + 1, 3)}`, normalizedName: `демо компания ${pad(n + 1, 3)}`, sno: ['ОСНО', 'УСН доходы', 'УСН доходы-расходы', 'Патент'][n % 4], status: n < 375 ? 'active' : 'removed', createdAt: baseDate }));
    const template = (id, name, type, family, frequency, position, slots, extra = {}) => ({ id, name, type, family, frequency, defaultPosition: position, slots, rules: { invalidDay: 'error' }, exceptions: [], shiftToWorkingDay: true, calendarId: 'demo', datesVerified: false, active: true, ...extra });
    const slot = (id, offsetMonths, day) => ({ id, offsetMonths, day });
    const templates = [
      template('t01', 'НДС — отчет', 'report', 'НДС', 'quarterly', POSITIONS[0], [slot('main', 1, 25)]),
      template('t02', 'Налог на прибыль — отчет', 'report', 'Налог на прибыль', 'quarterly', POSITIONS[0], [slot('main', 1, 25)]),
      template('t03', 'Налог на имущество — отчет', 'report', 'Налог на имущество', 'annual', POSITIONS[0], [slot('main', 3, 25)]),
      template('t04', 'Транспортный налог — информация', 'payment', 'Транспортный налог', 'quarterly', POSITIONS[0], [slot('main', 1, 28)]),
      template('t05', 'РСВ', 'report', 'РСВ', 'quarterly', POSITIONS[1], [slot('main', 1, 25)]),
      template('t06', '6-НДФЛ', 'report', '6-НДФЛ', 'quarterly', POSITIONS[1], [slot('main', 1, 25)]),
      template('t07', 'ЕФС-1 — учебный пример', 'report', 'ЕФС-1', 'monthly', POSITIONS[1], [slot('main', 1, 25)]),
      template('t08', 'Перс. сведения', 'report', 'Перс. сведения', 'monthly', POSITIONS[1], [slot('main', 1, 25)]),
      template('t09', 'УСН — отчет', 'report', 'УСН', 'annual', POSITIONS[0], [slot('main', 3, 25)]),
      template('t10', 'Патент — информация', 'payment', 'Патент', 'explicit', POSITIONS[0], [], { entries: [0, 1, 2].map(n => ({ id: `pat${n + 1}`, periodKey: `${baseYear}-Q${qMonth / 3 + 1}`, periodLabel: `${qMonth / 3 + 1} квартал ${baseYear}`, date: monthStart(baseYear, qMonth + n).slice(0, 8) + '28' })) }),
      template('t11', 'НДС — информация по уплате', 'payment', 'НДС', 'quarterly', POSITIONS[0], [slot('pay1', 1, 28), slot('pay2', 2, 28), slot('pay3', 3, 28)]),
      template('t12', 'Демо-напоминание', 'report', 'Демонстрация', 'explicit', POSITIONS[2], [], { shiftToWorkingDay: false, entries: [{ id: 'main', periodKey: baseDate, periodLabel: 'Демонстрационный пример', date: addDays(baseDate, 2) }] })
    ];
    const assignments = [];
    const add = (client, t) => {
      const people = users.filter(u => u.active && u.role === 'employee' && u.positions.includes(t.defaultPosition));
      const number = Number(client.id.slice(1));
      assignments.push({ id: `a_${client.id}_${t.id}`, clientId: client.id, templateId: t.id, assigneeId: people[(number - 1) % people.length].id, position: t.defaultPosition, generationStartMonth: moveMonth(baseMonth, -2), active: true });
    };
    const cost = t => t.frequency === 'monthly' ? 3 : t.frequency === 'explicit' ? t.entries.length : t.frequency === 'annual' ? 1 : t.slots.length;
    for (const client of clients.filter(c => c.status === 'active')) {
      const i = Number(client.id.slice(1));
      const ids = ['t01', 't05', 't08', 't11', ...(i % 2 === 0 ? ['t02', 't06'] : []), ...(i % 3 === 0 ? ['t03', 't04'] : []), ...(i % 5 === 0 ? ['t07', 't09', 't10'] : [])];
      let count = 0;
      for (const id of ids) { const t = templates.find(t => t.id === id); if (count + cost(t) <= 15) { add(client, t); count += cost(t); } }
    }
    add(clients[0], templates.find(t => t.id === 't12'));
    const result = { schemaVersion: 2, createdAt: new Date().toISOString(), baseDate, settings: { timezone: 'Asia/Yekaterinburg', testToday: null, acceptanceWaitDays: 3, retentionMonths: 24, demo: true }, users, clients, templates, assignments, workCalendars: [{ id: 'demo', scope: 'Тестовая пятидневка', verified: false, exceptions: [{ date: `${baseYear}-10-25`, isWorking: false }, { date: `${baseYear}-10-26`, isWorking: false }, { date: `${baseYear}-10-27`, isWorking: true }] }], taskStates: {}, audit: [] };
    const tasks = computeTasks(result, moveMonth(baseMonth, -2), monthEnd(baseMonth)).sort((a, b) => a.taskKey.localeCompare(b.taskKey));
    tasks.forEach((task, k) => {
      if (task.templateId === 't12') return;
      const cycle = k % 6;
      const status = task.type === 'report' ? (cycle === 2 || cycle === 5 ? 'submitted' : cycle === 3 ? 'accepted' : 'pending') : (cycle === 2 || cycle === 3 ? 'sent' : 'pending');
      const actionDate = task.dueDate < baseDate ? task.dueDate : baseDate;
      result.taskStates[task.taskKey] = { taskKey: task.taskKey, assignmentId: task.assignmentId, periodKey: task.periodKey, slotId: task.slotId, status, waitingDocuments: cycle === 1, comment: cycle === 1 ? 'Ожидаем документы от клиента.' : '', submittedDate: ['submitted', 'accepted'].includes(status) ? actionDate : null, acceptedDate: status === 'accepted' ? (addDays(actionDate, 1) < baseDate ? addDays(actionDate, 1) : baseDate) : null, sentDate: status === 'sent' ? actionDate : null, actionDueDate: status !== 'pending' ? task.dueDate : null, ...(['accepted', 'sent'].includes(status) ? { closedAt: new Date().toISOString(), snapshot: { dueDate: task.dueDate, clientName: task.clientName, templateName: task.templateName, assigneeId: task.assigneeId } } : {}) };
    });
    for (const client of clients.filter(c => c.status === 'removed')) {
      const key = `archive:${client.id}`;
      result.taskStates[key] = { taskKey: key, status: 'pending', canceledAt: new Date().toISOString(), cancelReason: 'Клиент снят с обслуживания', snapshot: { clientId: client.id, clientName: client.name, dueDate: baseDate, assigneeId: 'u03', templateName: 'Демонстрационная история' } };
    }
    return result;
  }

  // Минимальный расчет для просмотра демографиков. Редактирование и полный
  // проверяемый цикл календаря реализуются на следующем шаге, без смены ключей задач.
  function computeTasks(source, start, end) {
    const clients = new Map(source.clients.map(c => [c.id, c]));
    const templates = new Map(source.templates.map(t => [t.id, t]));
    const users = new Map(source.users.map(u => [u.id, u]));
    const result = [];
    function emit(a, t, key, label, repeat, date) {
      const taskKey = `${a.id}:${key}:${repeat}`;
      const saved = source.taskStates[taskKey];
      if (saved?.canceledAt) return;
      let dueDate = date;
      if (t.shiftToWorkingDay) {
        const calendar = source.workCalendars.find(c => c.id === t.calendarId);
        for (let n = 0; n < 370; n++) {
          const exception = calendar?.exceptions.find(e => e.date === dueDate);
          const weekday = utc(dueDate).getUTCDay();
          if (exception ? exception.isWorking : weekday !== 0 && weekday !== 6) break;
          dueDate = addDays(dueDate, 1);
        }
      }
      if (saved?.snapshot?.dueDate && ['accepted', 'sent'].includes(saved.status)) dueDate = saved.snapshot.dueDate;
      if (dueDate < a.generationStartMonth || dueDate < start || dueDate > end) return;
      const client = clients.get(a.clientId);
      result.push({ taskKey, assignmentId: a.id, clientId: client.id, clientName: client.name, sno: client.sno, templateId: t.id, templateName: t.name, family: t.family, type: t.type, datesVerified: t.datesVerified, assigneeId: a.assigneeId, assigneeName: users.get(a.assigneeId).name, position: a.position, periodKey: key, periodLabel: label, slotId: repeat, dueDate, status: 'pending', waitingDocuments: false, comment: '', ...saved });
    }
    for (const a of source.assignments) {
      const t = templates.get(a.templateId);
      if (!a.active || clients.get(a.clientId)?.status !== 'active' || !t?.active) continue;
      if (t.frequency === 'explicit') { for (const e of t.entries) emit(a, t, e.periodKey, e.periodLabel, e.id, e.date); continue; }
      for (let cursor = moveMonth(start, -15); cursor <= end; cursor = moveMonth(cursor, 1)) {
        const year = Number(cursor.slice(0, 4)), month = Number(cursor.slice(5, 7)) - 1;
        if (t.frequency === 'quarterly' && month % 3 !== 2) continue;
        if (t.frequency === 'annual' && month !== 11) continue;
        let key = cursor.slice(0, 7), label = `${MONTHS[month]} ${year}`;
        if (t.frequency === 'quarterly') { const q = Math.floor(month / 3) + 1; key = `${year}-Q${q}`; label = t.id === 't05' ? [`I квартал ${year}`, `Полугодие ${year}`, `9 месяцев ${year}`, `Год ${year}`][q - 1] : `${q} квартал ${year}`; }
        if (t.frequency === 'annual') { key = String(year); label = `Год ${year}`; }
        for (const slot of t.slots) { const target = moveMonth(cursor, slot.offsetMonths); emit(a, t, key, label, slot.id, target.slice(0, 8) + pad(slot.day)); }
      }
    }
    return result;
  }

  function validate(source) {
    if (source.schemaVersion !== 2 || !source.settings || !source.taskStates || !Array.isArray(source.workCalendars)) throw new Error('Формат сохраненных данных не поддерживается.');
    for (const field of ['users', 'clients', 'templates', 'assignments']) {
      if (!Array.isArray(source[field]) || new Set(source[field].map(x => x.id)).size !== source[field].length) throw new Error('Нарушена структура справочника: ' + field);
    }
    const has = (field, id) => source[field].some(x => x.id === id);
    if (!source.users.every(u => ROLES[u.role] && Array.isArray(u.positions)) || !source.users.some(u => u.role === 'owner' && u.active)) throw new Error('Нарушены данные пользователей.');
    if (!source.assignments.every(a => has('users', a.assigneeId) && has('clients', a.clientId) && has('templates', a.templateId))) throw new Error('В назначениях есть неизвестные записи.');
  }

  function getTasks(start, end) {
    const key = start + ':' + end;
    if (!taskCache.has(key)) taskCache.set(key, computeTasks(data, start, end));
    const person = selectedEmployee();
    return taskCache.get(key).filter(task => canSee(index.assignments.get(task.assignmentId)) && (person === 'all' || task.assigneeId === person));
  }
  const isClosed = task => ['accepted', 'sent'].includes(task.status);
  const isOverdue = task => task.status === 'pending' && task.dueDate < today();
  const statusText = task => ({ pending: task.type === 'report' ? 'Не сдано' : 'Не отправлено', submitted: 'Сдано', accepted: 'Принято', sent: 'Отправлено' })[task.status];
  const period = () => {
    const m = ui.mode === 'quarter' ? Math.floor(ui.month / 3) * 3 : ui.month;
    const start = monthStart(ui.year, m);
    return { start, end: addDays(moveMonth(start, ui.mode === 'quarter' ? 3 : 1), -1), label: ui.mode === 'quarter' ? `${Math.floor(m / 3) + 1} квартал ${ui.year}` : `${MONTHS[m]} ${ui.year}` };
  };
  const filtered = task => (!ui.search || norm(task.clientName).includes(norm(ui.search))) && (!ui.clientFocus || task.clientId === ui.clientFocus) && (ui.type === 'all' || task.type === ui.type) && (ui.status === 'all' || task.status === ui.status) && (!ui.waiting || task.waitingDocuments) && (!ui.overdue || isOverdue(task));
  function resetFilters() { Object.assign(ui, { search: '', type: 'all', status: 'all', waiting: false, overdue: false, clientFocus: '', page: 1 }); }
  function announce(message) { document.getElementById('announcement').textContent = message; }

  function login(error = '', email = '') {
    user = null;
    app.innerHTML = `<div class="login"><aside class="login-aside"><div><div class="brand">Финалогика</div><div class="brand-caption">Планировщик отчетности</div></div><div><div class="overline">Рабочее пространство команды</div><h1>Всё по плану.<br>Каждый срок<br>под контролем.</h1><p>Клиенты, отчетность и ответственность — в одной понятной таблице.</p></div><div class="login-index"><div><strong>380</strong><span>клиентов в демо</span></div><div><strong>20</strong><span>участников команды</span></div></div></aside><main class="login-main" id="main"><div class="login-box"><span class="local-pill"><span class="dot"></span> Локальный прототип</span><h2>Вход в планировщик</h2><p class="intro muted">Выберите демонстрационный аккаунт<br>или укажите его рабочую почту.</p><form id="login-form"><div class="field"><label for="email">Рабочая почта</label><input id="email" name="email" type="email" autocomplete="username" placeholder="demo01@example.com" value="${esc(email)}" required></div>${error ? `<p class="login-error" role="alert">${esc(error)}</p>` : ''}<button class="primary-button" type="submit">Войти в прототип <span aria-hidden="true">→</span></button></form><details class="demo-accounts" ${error ? 'open' : ''}><summary>Демонстрационные аккаунты</summary><label for="demo-account" class="sr-only">Выбрать демонстрационный аккаунт</label><select id="demo-account"><option value="">Выберите пользователя</option>${data.users.filter(u => u.active).map(u => `<option value="${esc(u.email)}">${esc(u.name)} · ${ROLES[u.role]}</option>`).join('')}</select></details><p class="privacy-note">Данные хранятся в этом браузере. Вход и права демонстрационные; между компьютерами данные не передаются. Пароль и подтверждение почты не требуются.</p></div></main></div>`;
    app.setAttribute('aria-busy', 'false');
  }

  function filterBar() {
    const hasFilters = ui.search || ui.type !== 'all' || ui.status !== 'all' || ui.waiting || ui.overdue || ui.clientFocus;
    return `<div class="filters"><label class="sr-only" for="filter-type">Тип обязательства</label><select id="filter-type"><option value="all">Отчеты и платежи</option><option value="report" ${ui.type === 'report' ? 'selected' : ''}>Только отчеты</option><option value="payment" ${ui.type === 'payment' ? 'selected' : ''}>Только платежи</option></select><label class="sr-only" for="filter-status">Статус задачи</label><select id="filter-status">${[['all', 'Все статусы'], ['pending', 'Не сдано / не отправлено'], ['submitted', 'Сдано'], ['accepted', 'Принято'], ['sent', 'Отправлено']].map(([v, l]) => `<option value="${v}" ${ui.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select><label class="checkbox-filter"><input id="filter-waiting" type="checkbox" ${ui.waiting ? 'checked' : ''}>Ждем документов</label><label class="checkbox-filter"><input id="filter-overdue" type="checkbox" ${ui.overdue ? 'checked' : ''}>Просрочено</label>${hasFilters ? '<button class="link-button" data-action="reset">Сбросить фильтры</button>' : ''}${ui.clientFocus ? '<button class="link-button" data-action="clear-client">Показать всех клиентов</button>' : ''}</div>`;
  }
  function employeeControl() {
    return `<div class="field employee-control"><label for="employee">${isManager() ? 'Ответственный сотрудник' : 'Ваши задачи'}</label>${isManager() ? `<select id="employee"><option value="all">Все сотрудники</option>${data.users.filter(u => u.active).map(u => `<option value="${u.id}" ${ui.employee === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : `<div class="fixed-employee" id="own-employee">${esc(user.name)}</div>`}</div>`;
  }
  function searchControl() {
    return `<div class="field search-field"><label for="search">Поиск клиента</label><input type="search" id="search" placeholder="Наименование компании" value="${esc(ui.search)}" autocomplete="off"></div>`;
  }
  function toolbar() {
    const month = ui.mode === 'quarter' ? Math.floor(ui.month / 3) : ui.month;
    return `<div class="toolbar">${ui.view === 'plan' ? `<div class="segmented" role="group" aria-label="Режим периода"><button data-action="mode" data-mode="month" aria-pressed="${ui.mode === 'month'}">Месяц</button><button data-action="mode" data-mode="quarter" aria-pressed="${ui.mode === 'quarter'}">Квартал</button></div><div class="field"><label for="period">Период</label><div class="period-controls"><button class="icon-button" data-action="previous-period" aria-label="Предыдущий период">‹</button><select id="period">${(ui.mode === 'month' ? MONTHS : ['I квартал', 'II квартал', 'III квартал', 'IV квартал']).map((label, n) => `<option value="${n}" ${n === month ? 'selected' : ''}>${label}</option>`).join('')}</select><label class="sr-only" for="year">Год</label><input id="year" type="number" min="1" max="9998" step="1" value="${ui.year}"><button class="icon-button" data-action="next-period" aria-label="Следующий период">›</button></div></div><button class="secondary-button" data-action="current-period">Текущий период</button>` : ''}${employeeControl()}${ui.view === 'clients' ? searchControl() : ''}</div>${ui.view === 'plan' ? `<div class="filter-row">${searchControl()}${filterBar()}</div>` : ''}`;
  }
  function taskCard(task) {
    const active = task.dueDate.slice(0, 7) <= today().slice(0, 7);
    const left = daysBetween(today(), task.dueDate);
    return `<button class="task ${task.status === 'pending' && active ? 'active-pending' : ''} ${isOverdue(task) ? 'overdue' : ''}" data-action="task" data-task="${esc(task.taskKey)}" data-assignee="${task.assigneeId}" data-client="${task.clientId}" data-status="${task.status}" aria-label="${esc(task.templateName + ', ' + task.clientName + ', срок ' + displayDate(task.dueDate) + ', ' + statusText(task))}"><div class="task-date">${task.type === 'payment' ? 'Уплата до ' : 'До '}${shortDate(task.dueDate)}</div><div class="task-period">${esc(task.periodLabel)}</div><span class="badge ${task.status === 'pending' && !active ? 'future' : task.status}">${statusText(task)}</span>${task.waitingDocuments ? '<br><span class="badge waiting">Ждем документов</span>' : ''}${task.status === 'submitted' ? '<div class="task-person">Ожидает принятия</div>' : ''}${isManager() && ui.employee === 'all' ? `<div class="task-person">${esc(task.assigneeName)}</div>` : ''}${isOverdue(task) ? `<div class="task-warning">! ${task.type === 'report' ? 'Просрочена сдача' : 'Не отправлено к сроку'}</div>` : task.status === 'pending' && left >= 0 && left <= 2 ? `<div class="task-warning">${left === 0 ? 'Срок сегодня' : left === 1 ? 'Остался 1 день' : 'Осталось 2 дня'}</div>` : ''}</button>`;
  }
  function pagination(count) {
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    ui.page = Math.min(Math.max(1, ui.page), pages);
    return `<div class="table-footer"><span>${count ? `${(ui.page - 1) * PAGE_SIZE + 1}–${Math.min(ui.page * PAGE_SIZE, count)} из ${count} клиентов` : '0 клиентов'}</span><div class="pagination"><button class="icon-button" data-action="previous-page" aria-label="Предыдущая страница" ${ui.page === 1 ? 'disabled' : ''}>‹</button><span>Страница ${ui.page} из ${pages}</span><button class="icon-button" data-action="next-page" aria-label="Следующая страница" ${ui.page === pages ? 'disabled' : ''}>›</button></div></div>`;
  }
  function planTable() {
    const range = period();
    const available = getTasks(range.start, range.end);
    const tasks = available.filter(filtered);
    const clients = [...new Set(tasks.map(t => t.clientId))].map(id => index.clients.get(id)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const footer = pagination(clients.length);
    const visible = clients.slice((ui.page - 1) * PAGE_SIZE, ui.page * PAGE_SIZE);
    const relevantTemplates = [...new Set(available.filter(t => ui.type === 'all' || t.type === ui.type).map(t => t.templateId))].map(id => index.templates.get(id)).sort((a, b) => a.type.localeCompare(b.type) * -1 || a.name.localeCompare(b.name, 'ru'));
    const groups = [];
    for (let cursor = range.start; cursor <= range.end; cursor = moveMonth(cursor, 1)) {
      const ts = relevantTemplates.filter(t => available.some(task => task.templateId === t.id && task.dueDate.slice(0, 7) === cursor.slice(0, 7)));
      if (ts.length) groups.push({ month: cursor.slice(0, 7), templates: ts });
    }
    const columns = groups.flatMap(g => g.templates.map(t => ({ month: g.month, template: t })));
    const byCell = new Map();
    for (const task of tasks) { const key = `${task.clientId}:${task.dueDate.slice(0, 7)}:${task.templateId}`; if (!byCell.has(key)) byCell.set(key, []); byCell.get(key).push(task); }
    const header = ui.mode === 'quarter' ? `<tr><th scope="col" rowspan="2" class="client-head">Клиенты</th>${groups.map(g => `<th scope="colgroup" class="month-group" colspan="${g.templates.length}">${MONTHS[Number(g.month.slice(5)) - 1]} ${ui.year}</th>`).join('')}</tr><tr>${columns.map(c => `<th scope="col">${esc(c.template.name)}<div class="client-sub">${c.template.type === 'report' ? 'Сдача отчета' : 'Срок уплаты'}</div></th>`).join('')}</tr>` : `<tr><th scope="col" class="client-head">Клиенты</th>${columns.map(c => `<th scope="col">${esc(c.template.name)}<div class="client-sub">${c.template.type === 'report' ? 'Сдача отчета' : 'Срок уплаты'}</div></th>`).join('')}</tr>`;
    const body = visible.map(client => `<tr data-row-client="${client.id}"><th scope="row">${esc(client.name)}<div class="client-sub">${esc(client.sno)}</div></th>${columns.map(c => `<td>${(byCell.get(`${client.id}:${c.month}:${c.template.id}`) || []).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(taskCard).join('') || '<span class="empty-cell">—</span>'}</td>`).join('')}</tr>`).join('');
    return `<div class="legend"><span class="legend-item"><i class="legend-swatch" style="background:var(--red)"></i>Не сдано / не отправлено</span><span class="legend-item"><i class="legend-swatch" style="background:var(--green)"></i>Сдано / принято</span><span class="legend-item"><i class="legend-swatch" style="background:var(--blue)"></i>Отправлено по налогу</span><span class="legend-item"><i class="legend-swatch" style="background:#b28a3c"></i>Ждем документов</span></div><section class="table-panel" aria-label="План задач"><div class="table-heading"><strong>${range.label}</strong><span id="found-count">Найдено ${tasks.length} задач · ${clients.length} клиентов</span></div>${tasks.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица отчетности с прокруткой"><table class="${ui.mode === 'quarter' ? 'quarter-table' : ''}"><caption class="sr-only">${range.label}. План отчетности по клиентам. Все сроки демонстрационные.</caption><thead>${header}</thead><tbody>${body}</tbody></table></div>` : `<div class="empty-state"><h2>Задач не найдено</h2><p>${ui.search || ui.status !== 'all' || ui.type !== 'all' || ui.waiting || ui.overdue || ui.clientFocus ? 'Попробуйте изменить период или сбросить фильтры.' : 'В этом периоде нет задач по выбранным назначениям.'}</p><button class="secondary-button" data-action="reset">Сбросить фильтры</button></div>`}${footer}</section>`;
  }
  function myClients() {
    const person = selectedEmployee();
    const assignments = data.assignments.filter(a => a.active && canSee(a) && (person === 'all' || a.assigneeId === person) && index.clients.get(a.clientId).status === 'active');
    const clientIds = [...new Set(assignments.map(a => a.clientId))];
    const clients = clientIds.map(id => index.clients.get(id)).filter(c => norm(c.name).includes(norm(ui.search))).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const footer = pagination(clients.length);
    const start = data.assignments.reduce((min, a) => a.generationStartMonth < min ? a.generationStartMonth : min, today());
    const tasks = getTasks(start, monthEnd(today().slice(0, 7) + '-01'));
    const rows = clients.slice((ui.page - 1) * PAGE_SIZE, ui.page * PAGE_SIZE).map(client => {
      const ids = [...new Set(assignments.filter(a => a.clientId === client.id).map(a => a.templateId))];
      const own = tasks.filter(t => t.clientId === client.id);
      return `<tr data-row-client="${client.id}"><th scope="row">${esc(client.name)}<div class="client-sub">${esc(client.sno)}</div></th><td><div class="template-tags">${ids.map(id => `<span class="template-tag">${esc(index.templates.get(id).name)}</span>`).join('')}</div></td><td class="client-count">${own.filter(t => !isClosed(t)).length}</td><td class="client-count">${own.filter(isOverdue).length}</td><td><button class="secondary-button" data-action="client-plan" data-client="${client.id}">Открыть план →</button></td></tr>`;
    }).join('');
    return `<section class="table-panel"><div class="table-heading"><strong>${isManager() && person === 'all' ? 'Клиенты команды' : 'Закрепленные клиенты'}</strong><span>${clients.length} клиентов</span></div>${clients.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Список клиентов"><table class="client-list"><caption class="sr-only">Доступные назначения. Количество задач рассчитано до конца текущего месяца, независимо от выбранного периода плана.</caption><thead><tr><th scope="col" class="client-head">Клиент</th><th scope="col">${isManager() && person === 'all' ? 'Обязательства команды' : 'Назначенные обязательства'}</th><th scope="col">Не закрыто</th><th scope="col">Просрочено</th><th scope="col">План</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty-state"><h2>Клиентов не найдено</h2><p>Измените поиск или выбранного сотрудника.</p></div>'}${footer}</section><p class="footnote">Незакрытые задачи и просрочки — до конца текущего месяца, включая предыдущие периоды. В списке только доступные вам назначения.</p>`;
  }

  function render(preserveFocus = false) {
    if (rendering) return;
    rendering = true;
    try { renderContent(preserveFocus); }
    finally { rendering = false; }
  }
  function renderContent(preserveFocus = false) {
    if (!user) return login();
    const active = preserveFocus ? document.activeElement : null;
    const focusId = active?.id;
    const selection = active && ['search', 'email'].includes(focusId) ? [active.selectionStart, active.selectionEnd] : null;
    const title = ui.view === 'plan' ? 'План отчетности' : 'Мои клиенты';
    const initials = user.name.split(' ').slice(0, 2).map(n => n[0]).join('');
    app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand">Финалогика</div><div class="brand-caption">Планировщик отчетности</div><div class="sidebar-label">Рабочее пространство</div><nav aria-label="Основная навигация"><button class="nav-item" data-action="nav" data-view="plan" ${ui.view === 'plan' ? 'aria-current="page"' : ''}><span class="nav-symbol" aria-hidden="true">▦</span>План отчетности</button><button class="nav-item" data-action="nav" data-view="clients" ${ui.view === 'clients' ? 'aria-current="page"' : ''}><span class="nav-symbol" aria-hidden="true">≡</span>Мои клиенты</button></nav><div class="sidebar-bottom"><div class="sidebar-note"><strong><span class="dot"></span> Локальный прототип</strong><p>Данные в этом браузере.<br>Сроки демонстрационные.</p></div><button class="nav-item" data-action="about"><span class="nav-symbol" aria-hidden="true">ⓘ</span>О прототипе</button></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb">Рабочее пространство<span>/</span>${title}</div><div class="profile"><span class="avatar" aria-hidden="true">${esc(initials)}</span><div><div class="profile-name">${esc(user.name)}</div><div class="profile-role">${ROLES[user.role]}</div></div><button class="logout" data-action="logout">Выйти</button></div></header><main class="content" id="main"><div class="page-heading"><div><div class="overline muted" style="margin-bottom:9px">${ui.view === 'plan' ? 'Клиенты и обязательства' : 'Ответственность и назначения'}</div><h1>${title}</h1><p>${ui.view === 'plan' ? 'Отчетность и сроки уплаты по закрепленным клиентам.' : 'Все ваши клиенты и назначенные обязательства — независимо от периода.'}</p></div><div class="heading-meta">Режим просмотра · К1</div></div>${data.settings.testToday ? `<div class="info-box">ТЕСТОВАЯ ДАТА: ${displayDate(today())}</div>` : ''}${toolbar()}${ui.view === 'plan' ? planTable() : myClients()}<p class="footnote">Сроки в демо не являются проверенным налоговым календарем. Сейчас доступен просмотр; редактирование задач и справочников — на следующем этапе.</p></main></div></div>`;
    app.setAttribute('aria-busy', 'false');
    if (focusId) { const target = document.getElementById(focusId); if (target) { target.focus({ preventScroll: true }); if (selection) target.setSelectionRange(...selection); } }
  }

  function openDialog(title, html) {
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-content').innerHTML = html;
    dialog.showModal();
    document.getElementById('dialog-close').focus();
  }
  function showTask(key) {
    const range = period();
    const task = getTasks(range.start, range.end).find(t => t.taskKey === key && filtered(t));
    if (!task) return;
    const pairs = [['Клиент', task.clientName], ['Тип', task.type === 'report' ? 'Сдача отчета' : 'Информация по уплате'], ['Отчетный период', task.periodLabel], ['Ответственный', task.assigneeName], ['Должность', task.position], [task.type === 'report' ? 'Сдать до' : 'Уплатить до', displayDate(task.dueDate)], ['Статус', statusText(task)], ['Ждем документов', task.waitingDocuments ? 'Да' : 'Нет'], ['Фактическая сдача', displayDate(task.submittedDate)], ['Фактическое принятие', displayDate(task.acceptedDate)], ['Отправка информации', displayDate(task.sentDate)], ['Комментарий', task.comment || 'Нет комментария']];
    openDialog(task.templateName, `<span class="local-pill">Демонстрационный срок</span><dl class="detail-grid">${pairs.map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')}</dl><div class="info-box">Режим просмотра. Изменение статуса и комментария появится на следующем этапе.${task.type === 'payment' ? ' «Отправлено» означает отправку информации клиенту, а не подтверждение оплаты.' : ' «Сдано» означает отправку отчета, «Принято» — завершение приема.'}</div>`);
  }
  function showAbout() {
    openDialog('О прототипе', `<span class="local-pill">Первый этап · просмотр</span><p style="margin-top:17px">Выберите месяц или квартал и найдите клиента по наименованию. Руководитель и администратор могут посмотреть всю команду или отдельного сотрудника. Остальным доступны только собственные задачи.</p><p>Нажмите на задачу, чтобы открыть сведения о сроке, исполнителе, статусе и комментарии. В «Мои клиенты» видны закрепленные обязательства независимо от периода.</p><div class="info-box">Данные хранятся в этом браузере. Вход и права демонстрационные; между компьютерами данные не передаются. Перемещение файлов и очистка браузера могут привести к потере доступа к локальным данным.</div><p class="muted">Сроки и рабочий календарь тестовые. Изменение задач, справочники и управляемая тестовая дата появятся на втором этапе; импорт и выгрузка — на третьем. Письма и уведомления MAX не отправляются.</p>`);
  }
  function fatal(message, raw = null) {
    fatalRaw = raw;
    user = null;
    app.innerHTML = `<main class="fatal" id="main"><span class="local-pill">Финалогика · локальный прототип</span><h1 style="margin-top:22px">Не удалось открыть данные</h1><p role="alert">${esc(message)}</p><p>Сохраненные данные не заменены демонстрационными. Проверьте доступ браузера к локальному хранению и используйте обычное окно Chrome. При поврежденном наборе сохраните исходный текст; восстановление резервной копии будет доступно на третьем этапе.</p>${raw !== null ? '<button class="secondary-button" data-action="download-raw">Скачать исходные данные</button>' : ''}<button class="primary-button" data-action="reload">Повторить открытие</button></main>`;
    app.setAttribute('aria-busy', 'false');
  }
  function initialize() {
    let raw = null;
    try {
      const probe = DATA_KEY + '.probe';
      localStorage.setItem(probe, '1'); localStorage.removeItem(probe);
      sessionStorage.setItem(SESSION_KEY + '.probe', '1'); sessionStorage.removeItem(SESSION_KEY + '.probe');
      raw = localStorage.getItem(DATA_KEY);
      if (raw === null) { const created = makeDemo(realToday()); validate(created); localStorage.setItem(DATA_KEY, JSON.stringify(created)); data = created; }
      else { data = JSON.parse(raw); validate(data); }
      index = { clients: new Map(data.clients.map(c => [c.id, c])), templates: new Map(data.templates.map(t => [t.id, t])), assignments: new Map(data.assignments.map(a => [a.id, a])) };
      const date = today(); ui.year = Number(date.slice(0, 4)); ui.month = Number(date.slice(5, 7)) - 1;
      const userId = sessionStorage.getItem(SESSION_KEY);
      user = data.users.find(u => u.id === userId && u.active);
      if (user) render(); else { sessionStorage.removeItem(SESSION_KEY); login(); }
    } catch (error) { fatal(error instanceof SyntaxError ? 'Сохраненный JSON поврежден. Исходный текст можно скачать, он не перезаписан.' : error.message, raw); }
  }

  app.addEventListener('submit', event => {
    if (event.target.id !== 'login-form') return;
    event.preventDefault();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const found = data.users.find(u => u.active && u.email.trim().toLowerCase() === email);
    if (!found) return login('Активный сотрудник с такой почтой не найден.', email);
    try { sessionStorage.setItem(SESSION_KEY, found.id); user = found; resetFilters(); ui.employee = 'all'; ui.view = 'plan'; render(); announce('Выполнен вход: ' + found.name); }
    catch { login('Браузер не разрешил сохранить сессию. Проверьте настройки хранения.', email); }
  });
  app.addEventListener('change', event => {
    const target = event.target;
    if (target.id === 'demo-account') { document.getElementById('email').value = target.value; document.getElementById('email').focus(); return; }
    if (!user) return;
    if (!['employee', 'period', 'year', 'filter-type', 'filter-status', 'filter-waiting', 'filter-overdue'].includes(target.id)) return;
    if (target.id === 'employee' && isManager()) ui.employee = target.value;
    if (target.id === 'period') ui.month = Number(target.value) * (ui.mode === 'quarter' ? 3 : 1);
    if (target.id === 'year') { const year = Number(target.value); if (!Number.isInteger(year) || year < 1 || year > 9998) { target.value = ui.year; announce('Укажите допустимый год.'); return; } ui.year = year; }
    if (target.id === 'filter-type') ui.type = target.value;
    if (target.id === 'filter-status') ui.status = target.value;
    if (target.id === 'filter-waiting') ui.waiting = target.checked;
    if (target.id === 'filter-overdue') ui.overdue = target.checked;
    ui.page = 1;
    render(true);
  });
  let searchTimer;
  app.addEventListener('input', event => {
    if (event.target.id !== 'search' || !user) return;
    ui.search = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { ui.page = 1; render(true); announce('Поиск обновлен.'); }, 180);
  });
  app.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'reload') return location.reload();
    if (action === 'download-raw' && fatalRaw !== null) {
      const url = URL.createObjectURL(new Blob([fatalRaw], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'finalogika_original.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    if (!user) return;
    clearTimeout(searchTimer);
    if (action === 'logout') { try { sessionStorage.removeItem(SESSION_KEY); login(); } catch { announce('Не удалось завершить сессию.'); } return; }
    if (action === 'about') return showAbout();
    if (action === 'task') return showTask(button.dataset.task);
    if (action === 'nav') { ui.view = button.dataset.view; resetFilters(); }
    if (action === 'mode') { ui.mode = button.dataset.mode; ui.page = 1; }
    if (action === 'previous-period' || action === 'next-period') {
      const count = (action === 'next-period' ? 1 : -1) * (ui.mode === 'quarter' ? 3 : 1);
      const next = moveMonth(monthStart(ui.year, ui.month), count);
      const year = Number(next.slice(0, 4));
      if (year < 1 || year > 9998) return;
      ui.year = year; ui.month = Number(next.slice(5, 7)) - 1; ui.page = 1;
    }
    if (action === 'current-period') { ui.year = Number(today().slice(0, 4)); ui.month = Number(today().slice(5, 7)) - 1; ui.page = 1; }
    if (action === 'reset') resetFilters();
    if (action === 'clear-client') { ui.clientFocus = ''; ui.page = 1; }
    if (action === 'previous-page') ui.page--;
    if (action === 'next-page') ui.page++;
    if (action === 'client-plan') { resetFilters(); ui.clientFocus = button.dataset.client; ui.view = 'plan'; }
    render();
  });
  document.getElementById('dialog-close').addEventListener('click', () => dialog.close());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && user && !dialog.open) render(true); });
  initialize();
})();
