// Google Sheets API module — single source of truth for all data operations

const LEGACY_SPREADSHEET_ID = '1_WLXdEY9-IH34QzvmV6UYWikv6lEqcUJQwLHm6CBQv0';

const SHEETS_CONFIG = {
    API_BASE: 'https://sheets.googleapis.com/v4/spreadsheets'
};

function getActiveSheetId() {
    const id = localStorage.getItem('activeObjectId');
    const objects = JSON.parse(localStorage.getItem('objects') || '[]');
    const obj = objects.find(o => o.id === id);
    return obj ? obj.sheetId : null;
}

function _requireSheetId() {
    const id = getActiveSheetId();
    if (!id) throw new Error('Объект не выбран');
    return id;
}

// In-memory cache: { sheetName: rowObjects[] }
const _cache = {};
// Sheet metadata: { sheetName: numericSheetId }
const _sheetIds = {};

async function _apiRequest(url, options = {}) {
    const token = sessionStorage.getItem('access_token');
    if (!token) {
        window.location.href = 'index.html';
        throw new Error('No token');
    }

    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    if (res.status === 401) {
        sessionStorage.clear();
        window.location.href = 'index.html';
        throw new Error('Unauthorized');
    }

    if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
            const errBody = await res.json();
            errMsg = errBody.error?.message || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

async function _loadSheetIds() {
    if (Object.keys(_sheetIds).length > 0) return;
    const sid = _requireSheetId();
    const url = `${SHEETS_CONFIG.API_BASE}/${sid}?fields=sheets(properties(sheetId,title))`;
    const data = await _apiRequest(url);
    (data.sheets || []).forEach(s => {
        _sheetIds[s.properties.title] = s.properties.sheetId;
    });
}

// Read all rows, return array of {values:[], rowIndex}
async function readSheet(sheetName, forceRefresh = false) {
    if (!forceRefresh && _cache[sheetName]) return _cache[sheetName];

    const sid = _requireSheetId();
    const range = encodeURIComponent(`${sheetName}!A:Z`);
    const url = `${SHEETS_CONFIG.API_BASE}/${sid}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
    const data = await _apiRequest(url);
    const allRows = data.values || [];

    // Skip row 1 only if it looks like a header (first cell is literally 'id')
    const hasHeader = allRows.length > 0 && String(allRows[0][0]).toLowerCase() === 'id';
    const dataRows = hasHeader ? allRows.slice(1) : allRows;
    const rowOffset = hasHeader ? 2 : 1;

    const result = dataRows.map((row, i) => ({
        values: row,
        rowIndex: rowOffset + i
    }));

    _cache[sheetName] = result;
    return result;
}

async function appendRow(sheetName, rowValues) {
    // Count all existing rows in column A to find the precise next empty row,
    // avoiding INSERT_ROWS table-detection quirks with the :append endpoint.
    const sid = _requireSheetId();
    const colRange = encodeURIComponent(`${sheetName}!A:A`);
    const colUrl = `${SHEETS_CONFIG.API_BASE}/${sid}/values/${colRange}`;
    const colData = await _apiRequest(colUrl);
    const nextRow = ((colData && colData.values) ? colData.values.length : 0) + 1;
    await updateRow(sheetName, nextRow, rowValues);
}

async function updateRow(sheetName, rowIndex, rowValues) {
    const sid = _requireSheetId();
    const range = encodeURIComponent(`${sheetName}!A${rowIndex}:Z${rowIndex}`);
    const url = `${SHEETS_CONFIG.API_BASE}/${sid}/values/${range}?valueInputOption=RAW`;
    await _apiRequest(url, {
        method: 'PUT',
        body: JSON.stringify({ values: [rowValues] })
    });
    delete _cache[sheetName];
}

async function deleteRow(sheetName, rowIndex) {
    await _loadSheetIds();
    const sid = _requireSheetId();
    const sheetId = _sheetIds[sheetName];
    if (sheetId === undefined) throw new Error(`Sheet not found: ${sheetName}`);

    const url = `${SHEETS_CONFIG.API_BASE}/${sid}:batchUpdate`;
    await _apiRequest(url, {
        method: 'POST',
        body: JSON.stringify({
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,  // 0-based
                        endIndex: rowIndex           // exclusive
                    }
                }
            }]
        })
    });
    delete _cache[sheetName];
}

function invalidateCache(sheetName) {
    if (sheetName) {
        delete _cache[sheetName];
    } else {
        Object.keys(_cache).forEach(k => delete _cache[k]);
        Object.keys(_sheetIds).forEach(k => delete _sheetIds[k]);
    }
}

// ===== Domain helpers =====

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function generatePrefixedId(type) {
    const code = (localStorage.getItem('object_code') || 'obj').slice(0, 8);
    return `${type}_${code}_${Math.random().toString(36).slice(2, 7)}`;
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function nowIso() {
    return new Date().toISOString();
}

// ===== work_log =====
// Columns: id(0) | date(1) | hours(2) | description(3) | amount(4) | note(5) | timestamp(6) | rate(7) | task_ids(8)
// task_ids: pipe-separated list, one entry per checklist item (empty string if not linked to a task)

function _rowToWorkLog(row) {
    const v = row.values;
    return {
        id: v[0] || '',
        date: v[1] || '',
        hours: parseFloat(v[2]) || 0,
        description: v[3] || '',
        amount: parseFloat(v[4]) || 0,
        note: v[5] || '',
        timestamp: v[6] || '',
        rate: parseFloat(v[7]) || 700,
        task_ids: v[8] ? String(v[8]).split('|') : [],
        _rowIndex: row.rowIndex
    };
}

function _workLogToRow(entry) {
    return [
        entry.id,
        entry.date,
        entry.hours,
        entry.description,
        entry.amount,
        entry.note,
        entry.timestamp,
        entry.rate || 700,
        (entry.task_ids || []).join('|')
    ];
}

async function getWorkLogs(forceRefresh) {
    const rows = await readSheet('work_log', forceRefresh);
    return rows.map(_rowToWorkLog).filter(r => r.id);
}

async function saveWorkLog(data) {
    const hourlyRate = parseFloat(data.rate) || 700;
    const existing = await getWorkLogs();
    const found = existing.find(r => r.date === data.date);

    const entry = {
        id: found ? found.id : generateId(),
        date: data.date,
        hours: parseFloat(data.hours) || 0,
        description: data.description || '',
        amount: (parseFloat(data.hours) || 0) * hourlyRate,
        note: data.note || '',
        timestamp: nowIso(),
        rate: hourlyRate,
        task_ids: data.task_ids || (found ? found.task_ids : []) || []
    };

    if (found) {
        await updateRow('work_log', found._rowIndex, _workLogToRow({ ...entry, _rowIndex: found._rowIndex }));
        if (entry.hours > 0) {
            await _syncWorkFinance(entry, found.amount);
        } else if (found.hours > 0) {
            // Was a done day, now a plan — remove its finance entry
            const finRows = await getFinanceEntries(true);
            const finEntry = finRows.find(f => f.type === 'work' && f.description === entry.date);
            if (finEntry) {
                await deleteRow('finance', finEntry._rowIndex);
                invalidateCache('finance');
                await _recalcAllBalances();
            }
        }
    } else {
        await appendRow('work_log', _workLogToRow(entry));
        if (entry.hours > 0) {
            await _syncWorkFinance(entry, 0);
        }
    }
    return entry;
}

async function deleteWorkLog(id) {
    const rows = await getWorkLogs();
    const found = rows.find(r => r.id === id);
    if (!found) return;
    await deleteRow('work_log', found._rowIndex);
    // Remove associated finance entry only if it was a done day
    if (found.hours > 0) {
        const finRows = await getFinanceEntries();
        const finEntry = finRows.find(f => f.type === 'work' && f.description === found.date);
        if (finEntry) await deleteRow('finance', finEntry._rowIndex);
        invalidateCache('finance');
    }
}

// ===== finance =====
// Columns: id(0) | date(1) | type(2) | amount(3) | balance(4) | description(5) | timestamp(6)

function _rowToFinance(row) {
    const v = row.values;
    return {
        id: v[0] || '',
        date: v[1] || '',
        type: v[2] || '',
        amount: parseFloat(v[3]) || 0,
        balance: parseFloat(v[4]) || 0,
        description: v[5] || '',
        timestamp: v[6] || '',
        _rowIndex: row.rowIndex
    };
}

function _financeToRow(entry) {
    return [entry.id, entry.date, entry.type, entry.amount, entry.balance, entry.description, entry.timestamp];
}

async function getFinanceEntries(forceRefresh) {
    const rows = await readSheet('finance', forceRefresh);
    return rows.map(_rowToFinance).filter(r => r.id);
}

async function _recalcBalances() {
    // Recalculate running balance for all finance rows
    const entries = await getFinanceEntries(true);
    entries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

    let runningBalance = 0;
    for (const entry of entries) {
        if (entry.type === 'work') {
            runningBalance += entry.amount;
        } else {
            runningBalance -= entry.amount;
        }
        entry.balance = runningBalance;
    }
    return entries;
}

async function addFinanceEntry(data) {
    const entries = await getFinanceEntries();
    // Calculate current balance
    let currentBalance = entries.length > 0
        ? entries.reduce((bal, e) => {
            return bal + (e.type === 'work' ? e.amount : -e.amount);
          }, 0)
        : 0;

    const newBalance = data.type === 'work'
        ? currentBalance + (parseFloat(data.amount) || 0)
        : currentBalance - (parseFloat(data.amount) || 0);

    const entry = {
        id: generateId(),
        date: data.date || today(),
        type: data.type,
        amount: parseFloat(data.amount) || 0,
        balance: newBalance,
        description: data.description || '',
        timestamp: nowIso()
    };
    await appendRow('finance', _financeToRow(entry));
    return entry;
}

async function updateFinanceEntry(id, data) {
    const entries = await getFinanceEntries(true);
    const found = entries.find(e => e.id === id);
    if (!found) throw new Error('Finance entry not found');

    const updated = {
        ...found,
        date: data.date || found.date,
        type: data.type || found.type,
        amount: parseFloat(data.amount) ?? found.amount,
        description: data.description ?? found.description,
        timestamp: nowIso()
    };

    await updateRow('finance', found._rowIndex, _financeToRow(updated));
    // Recalculate all balances
    await _recalcAllBalances();
}

async function _recalcAllBalances() {
    const entries = await getFinanceEntries(true);
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.timestamp < b.timestamp ? -1 : 1));
    let bal = 0;
    for (const e of entries) {
        bal += e.type === 'work' ? e.amount : -e.amount;
        e.balance = bal;
        await updateRow('finance', e._rowIndex, _financeToRow(e));
    }
    invalidateCache('finance');
}

async function deleteFinanceEntry(id) {
    const entries = await getFinanceEntries(true);
    const found = entries.find(e => e.id === id);
    if (!found) return;
    await deleteRow('finance', found._rowIndex);
}

async function _syncWorkFinance(workEntry, oldAmount) {
    const finEntries = await getFinanceEntries(true);
    // Look for existing finance row with this work log date
    const existing = finEntries.find(f => f.type === 'work' && f.description === workEntry.date);
    if (existing) {
        const updated = { ...existing, amount: workEntry.amount, timestamp: nowIso() };
        await updateRow('finance', existing._rowIndex, _financeToRow(updated));
    } else {
        await addFinanceEntry({
            type: 'work',
            amount: workEntry.amount,
            date: workEntry.date,
            description: workEntry.date
        });
    }
    await _recalcAllBalances();
}

// ===== tasks =====
// Columns: id(0)|title(1)|description(2)|assignees(3)|status(4)|weather(5)|tags(6)|order(7)|created_at(8)|completed_at(9)

function _rowToTask(row) {
    const v = row.values;
    return {
        id: v[0] || '',
        title: v[1] || '',
        description: v[2] || '',
        assignees: v[3] ? String(v[3]).split(',').map(s => s.trim()).filter(Boolean) : [],
        status: v[4] || 'new',
        weather: v[5] || 'any',
        tags: v[6] ? String(v[6]).split(',').map(s => s.trim()).filter(Boolean) : [],
        order: parseInt(v[7]) || 0,
        created_at: v[8] || '',
        completed_at: v[9] || '',
        _rowIndex: row.rowIndex
    };
}

function _taskToRow(task) {
    return [
        task.id,
        task.title,
        task.description || '',
        (task.assignees || []).join(','),
        task.status || 'new',
        task.weather || 'any',
        (task.tags || []).join(','),
        task.order || 0,
        task.created_at || nowIso(),
        task.completed_at || ''
    ];
}

async function getTasks(forceRefresh) {
    const rows = await readSheet('tasks', forceRefresh);
    return rows.map(_rowToTask).filter(r => r.id).sort((a, b) => a.order - b.order);
}

async function addTask(data) {
    const tasks = await getTasks();
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order)) : 0;
    const task = {
        id: generateId(),
        title: data.title,
        description: data.description || '',
        assignees: data.assignees || [],
        status: data.status || 'new',
        weather: data.weather || 'any',
        tags: data.tags || [],
        order: maxOrder + 10,
        created_at: nowIso(),
        completed_at: ''
    };
    await appendRow('tasks', _taskToRow(task));
    return task;
}

async function updateTask(id, data) {
    const tasks = await getTasks(true);
    const found = tasks.find(t => t.id === id);
    if (!found) throw new Error('Task not found');

    const updated = {
        ...found,
        ...data,
        id: found.id,
        _rowIndex: found._rowIndex,
        created_at: found.created_at
    };

    if (data.status === 'done' && found.status !== 'done') {
        updated.completed_at = nowIso();
    } else if (data.status && data.status !== 'done') {
        updated.completed_at = '';
    }

    await updateRow('tasks', found._rowIndex, _taskToRow(updated));
    return updated;
}

async function deleteTask(id) {
    const tasks = await getTasks(true);
    const found = tasks.find(t => t.id === id);
    if (!found) return;
    await deleteRow('tasks', found._rowIndex);
}

async function reorderTasks(orderedIds) {
    const tasks = await getTasks(true);
    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    for (let i = 0; i < orderedIds.length; i++) {
        const task = taskMap[orderedIds[i]];
        if (!task) continue;
        const newOrder = (i + 1) * 10;
        if (task.order !== newOrder) {
            await updateRow('tasks', task._rowIndex, _taskToRow({ ...task, order: newOrder }));
        }
    }
    invalidateCache('tasks');
}

// ===== tags =====
// Columns: id(0) | title(1) | created_at(2)

function _rowToTag(row) {
    const v = row.values;
    return {
        id: v[0] || '',
        title: v[1] || '',
        created_at: v[2] || '',
        _rowIndex: row.rowIndex
    };
}

function _tagToRow(tag) {
    return [tag.id, tag.title, tag.created_at || nowIso()];
}

async function getTags(forceRefresh) {
    const rows = await readSheet('tags', forceRefresh);
    return rows.map(_rowToTag).filter(r => r.id);
}

async function addTag(title) {
    const tag = {
        id: generateId(),
        title: title.trim(),
        created_at: nowIso()
    };
    await appendRow('tags', _tagToRow(tag));
    return tag;
}

async function updateTag(id, newTitle) {
    const tags = await getTags(true);
    const found = tags.find(t => t.id === id);
    if (!found) return;
    const updated = { ...found, title: newTitle.trim() };
    await updateRow('tags', found._rowIndex, _tagToRow(updated));
    return updated;
}

async function deleteTag(id) {
    const tags = await getTags(true);
    const found = tags.find(t => t.id === id);
    if (!found) return;
    await deleteRow('tags', found._rowIndex);
}

// ===== purchases =====
// Columns: id(0)|title(1)|price(2)|status(3)|task_id(4)|created_at(5)|bought_at(6)

function _rowToPurchase(row) {
    const v = row.values;
    return {
        id: v[0] || '',
        title: v[1] || '',
        price: parseFloat(v[2]) || 0,
        status: v[3] || 'pending',
        task_id: v[4] || '',
        created_at: v[5] || '',
        bought_at: v[6] || '',
        _rowIndex: row.rowIndex
    };
}

function _purchaseToRow(p) {
    return [p.id, p.title, p.price, p.status, p.task_id || '', p.created_at || nowIso(), p.bought_at || ''];
}

async function getPurchases(forceRefresh) {
    const rows = await readSheet('purchases', forceRefresh);
    return rows.map(_rowToPurchase).filter(r => r.id);
}

async function addPurchase(data) {
    const purchase = {
        id: generateId(),
        title: data.title,
        price: parseFloat(data.price) || 0,
        status: data.status || 'pending',
        task_id: data.task_id || '',
        created_at: nowIso(),
        bought_at: data.status === 'bought' ? nowIso() : ''
    };
    await appendRow('purchases', _purchaseToRow(purchase));
    return purchase;
}

async function updatePurchase(id, data) {
    const items = await getPurchases(true);
    const found = items.find(p => p.id === id);
    if (!found) throw new Error('Purchase not found');

    const updated = { ...found, ...data, id: found.id, _rowIndex: found._rowIndex };
    if (data.status === 'bought' && found.status !== 'bought') {
        updated.bought_at = nowIso();
    } else if (data.status === 'pending') {
        updated.bought_at = '';
    }

    await updateRow('purchases', found._rowIndex, _purchaseToRow(updated));
    return updated;
}

async function deletePurchase(id) {
    const items = await getPurchases(true);
    const found = items.find(p => p.id === id);
    if (!found) return;
    await deleteRow('purchases', found._rowIndex);
}

// ===== Backup =====
// Uses Sheets API only (no Drive scope). Creates a full copy as a new spreadsheet.

const _BACKUP_SHEETS = ['work_log', 'finance', 'tasks', 'tags', 'purchases', 'workers', 'settings'];

async function _readSheetRaw(spreadsheetId, sheetName) {
    try {
        const range = encodeURIComponent(`${sheetName}!A:Z`);
        const url = `${SHEETS_CONFIG.API_BASE}/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
        const data = await _apiRequest(url);
        return (data && data.values) ? data.values : [];
    } catch (_) { return []; }
}

async function createObjectSpreadsheet(name) {
    const ALL_SHEETS = ['work_log', 'finance', 'tasks', 'tags', 'purchases', 'workers', 'settings'];
    const newSS = await _apiRequest(SHEETS_CONFIG.API_BASE, {
        method: 'POST',
        body: JSON.stringify({
            properties: { title: `Work Manager — ${name}` },
            sheets: ALL_SHEETS.map(s => ({ properties: { title: s } }))
        })
    });
    return newSS.spreadsheetId;
}

async function createBackup() {
    const sid = _requireSheetId();
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const title = `WorkManager Backup ${dateStr} ${timeStr}`;

    // 1. Read all sheets from main spreadsheet
    const sheetData = {};
    for (const sheet of _BACKUP_SHEETS) {
        sheetData[sheet] = await _readSheetRaw(sid, sheet);
    }

    // 2. Create new spreadsheet with all sheet names
    const newSS = await _apiRequest(SHEETS_CONFIG.API_BASE, {
        method: 'POST',
        body: JSON.stringify({
            properties: { title },
            sheets: _BACKUP_SHEETS.map(name => ({ properties: { title: name } }))
        })
    });
    const newId = newSS.spreadsheetId;

    // 3. Write all data to new spreadsheet in one batch request
    const batchData = _BACKUP_SHEETS
        .filter(s => sheetData[s].length > 0)
        .map(s => ({ range: `${s}!A1`, values: sheetData[s] }));

    if (batchData.length > 0) {
        await _apiRequest(`${SHEETS_CONFIG.API_BASE}/${newId}/values:batchUpdate`, {
            method: 'POST',
            body: JSON.stringify({ valueInputOption: 'RAW', data: batchData })
        });
    }

    // 4. Save backup entry to settings (keep last 10)
    const settings = await getSettings();
    const list = JSON.parse(settings.backups || '[]');
    list.unshift({ id: newId, date: dateStr, time: timeStr, title });
    await saveSetting('backups', JSON.stringify(list.slice(0, 10)));

    return { id: newId, date: dateStr, time: timeStr, title };
}

async function listBackups() {
    try {
        const settings = await getSettings();
        return JSON.parse(settings.backups || '[]');
    } catch (_) { return []; }
}

async function restoreBackup(backupId) {
    const sid = _requireSheetId();
    const DATA_SHEETS = ['work_log', 'finance', 'tasks', 'tags', 'purchases'];

    // 1. Read all data from backup spreadsheet
    const sheetData = {};
    for (const sheet of DATA_SHEETS) {
        sheetData[sheet] = await _readSheetRaw(backupId, sheet);
    }

    // Also read hourly_rate from backup settings
    let backupRate = null;
    try {
        const settingsRows = await _readSheetRaw(backupId, 'settings');
        const rateRow = settingsRows.find(r => String(r[0]) === 'hourly_rate');
        if (rateRow) backupRate = rateRow[1];
    } catch (_) {}

    // 2. Clear and rewrite each data sheet
    for (const sheet of DATA_SHEETS) {
        const clearRange = encodeURIComponent(`${sheet}!A:Z`);
        await _apiRequest(
            `${SHEETS_CONFIG.API_BASE}/${sid}/values/${clearRange}:clear`,
            { method: 'POST', body: '{}' }
        );
        if (sheetData[sheet].length > 0) {
            const writeRange = encodeURIComponent(`${sheet}!A1`);
            await _apiRequest(
                `${SHEETS_CONFIG.API_BASE}/${sid}/values/${writeRange}?valueInputOption=RAW`,
                { method: 'PUT', body: JSON.stringify({ values: sheetData[sheet] }) }
            );
        }
    }

    // 3. Restore hourly_rate if found in backup (backups list stays untouched)
    if (backupRate != null) await saveSetting('hourly_rate', backupRate);

    invalidateCache();
}

async function exportToJson() {
    const sid = _requireSheetId();
    const data = {};
    for (const sheet of _BACKUP_SHEETS) {
        data[sheet] = await _readSheetRaw(sid, sheet);
    }
    return data;
}

// Returns Map<task_id, date[]> — which dates each task is scheduled on
async function getScheduledTaskIds() {
    const logs = await getWorkLogs();
    const map = new Map();
    logs.forEach(log => {
        (log.task_ids || []).forEach(tid => {
            if (!tid) return;
            if (!map.has(tid)) map.set(tid, []);
            map.get(tid).push(log.date);
        });
    });
    return map;
}

// ===== workers =====
// Columns: id(0) | name(1) | active(2) | created_at(3)

function _rowToWorker(row) {
    const v = row.values;
    return {
        id: v[0] || '',
        name: v[1] || '',
        active: String(v[2]) !== 'false',
        created_at: v[3] || '',
        _rowIndex: row.rowIndex
    };
}

function _workerToRow(w) {
    return [w.id, w.name, w.active !== false ? 'true' : 'false', w.created_at || nowIso()];
}

async function getWorkers(forceRefresh) {
    try {
        const rows = await readSheet('workers', forceRefresh);
        return rows.map(_rowToWorker).filter(r => r.id);
    } catch (_) { return []; }
}

async function addWorker(name) {
    await _ensureWorkersSheet();
    const worker = {
        id: generatePrefixedId('w'),
        name: name.trim(),
        active: true,
        created_at: nowIso()
    };
    await appendRow('workers', _workerToRow(worker));
    return worker;
}

async function updateWorker(id, data) {
    const list = await getWorkers(true);
    const found = list.find(w => w.id === id);
    if (!found) return;
    const updated = { ...found, ...data, id: found.id, _rowIndex: found._rowIndex };
    await updateRow('workers', found._rowIndex, _workerToRow(updated));
    return updated;
}

async function deleteWorker(id) {
    const list = await getWorkers(true);
    const found = list.find(w => w.id === id);
    if (!found) return;
    await deleteRow('workers', found._rowIndex);
}

async function _ensureWorkersSheet() {
    await _loadSheetIds();
    if (_sheetIds['workers'] !== undefined) return;
    const sid = _requireSheetId();
    const url = `${SHEETS_CONFIG.API_BASE}/${sid}:batchUpdate`;
    await _apiRequest(url, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'workers' } } }] })
    });
    Object.keys(_sheetIds).forEach(k => delete _sheetIds[k]);
    await _loadSheetIds();
}

// ===== settings =====
// Sheet: settings | Columns: key(0) | value(1)

async function _ensureSettingsSheet() {
    await _loadSheetIds();
    if (_sheetIds['settings'] !== undefined) return;
    const sid = _requireSheetId();
    const url = `${SHEETS_CONFIG.API_BASE}/${sid}:batchUpdate`;
    await _apiRequest(url, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'settings' } } }] })
    });
    Object.keys(_sheetIds).forEach(k => delete _sheetIds[k]);
    await _loadSheetIds();
}

async function getSettings() {
    try {
        const rows = await readSheet('settings', true);
        const obj = {};
        rows.forEach(r => { if (r.values[0] != null) obj[String(r.values[0])] = r.values[1]; });
        return obj;
    } catch (e) {
        console.error('getSettings failed:', e);
        return {};
    }
}

async function saveSetting(key, value) {
    await _ensureSettingsSheet();
    const rows = await readSheet('settings');
    const existing = rows.find(r => String(r.values[0]) === String(key));
    if (existing) {
        await updateRow('settings', existing.rowIndex, [key, value]);
    } else {
        await appendRow('settings', [key, value]);
    }
}

// Export to window
window.Sheets = {
    getWorkLogs, saveWorkLog, deleteWorkLog, getScheduledTaskIds,
    createBackup, listBackups, restoreBackup, exportToJson,
    getFinanceEntries, addFinanceEntry, updateFinanceEntry, deleteFinanceEntry,
    getTasks, addTask, updateTask, deleteTask, reorderTasks,
    getTags, addTag, updateTag, deleteTag,
    getPurchases, addPurchase, updatePurchase, deletePurchase,
    getWorkers, addWorker, updateWorker, deleteWorker,
    getSettings, saveSetting,
    invalidateCache, generateId, generatePrefixedId,
    getActiveSheetId, LEGACY_SPREADSHEET_ID,
    createObjectSpreadsheet
};
