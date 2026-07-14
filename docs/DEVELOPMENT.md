# Разработка и эксплуатация

## Требования

- браузер с `fetch`, `localStorage`, Canvas и поддержкой Google Identity Services; проверенная browser support matrix в репозитории отсутствует;
- локальный HTTP-сервер;
- Node.js только для статической проверки синтаксиса;
- Google Cloud OAuth Client типа Web application;
- Google-аккаунт, допущенный текущей конфигурацией приложения;
- доступ этого аккаунта к legacy spreadsheet и используемым spreadsheets объектов.

Проект не требует `npm install` и не имеет этапа сборки.

## Локальный запуск

Из корня репозитория запустите любой статический HTTP-сервер. Например, если установлен Python:

```powershell
python -m http.server 8000
```

Откройте:

```text
http://localhost:8000/
```

Не используйте прямое открытие `index.html` через `file://`: origin OAuth и поведение браузерных API будут отличаться от опубликованного сайта.

Если порт или hostname отличается, его origin должен быть разрешён в Google Cloud Console.

## Конфигурация OAuth

Текущая публичная конфигурация находится в `js/auth.js`:

- `CLIENT_ID` — OAuth 2.0 Web Client ID;
- `ALLOWED_EMAIL` — аккаунт, допускаемый клиентской проверкой;
- `SCOPES` — запрашиваемые разрешения.

Для работы token flow фактический origin должен присутствовать в Authorized JavaScript Origins OAuth Client ID. Репозиторий не содержит текущий список настроенных origins. Типичные значения для описанного запуска и заявленного hosting:

```text
http://localhost:8000
https://<owner>.github.io
```

Если Pages публикуется как project site, origin всё равно содержит только scheme, host и port, без `/repository-name`.

Не добавляйте client secret в клиентское приложение. GIS token client для статического приложения использует публичный Client ID.

Текущие scopes:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

После получения токена приложение запрашивает `https://www.googleapis.com/oauth2/v3/userinfo` и сравнивает email с `ALLOWED_EMAIL`.

## Настройка Google Sheets

### Legacy spreadsheet

`js/sheets.js` содержит `LEGACY_SPREADSHEET_ID`. Эта таблица используется:

- как первоначальный «Основной объект» при миграции пустого browser profile;
- как место хранения листа `_registry` для синхронизации объектов.

Для успешных операций используемый аккаунт должен иметь доступ к этой таблице. Фактические ACL из репозитория неизвестны.

### Новый объект

При выборе «Создать объект» приложение вызывает Sheets API и создаёт spreadsheet с листами:

```text
work_log
finance
tasks
tags
purchases
workers
settings
```

Листы создаются пустыми, без строки заголовков.

### Существующая таблица

Можно указать Google Sheet ID вручную. Код не выполняет полную предварительную валидацию схемы. До подключения убедитесь, что обязательные листы и порядок колонок соответствуют `DATA_MODEL.md`.

`workers` и `settings` могут быть созданы позже при первой записи. Для остальных базовых листов автоматического ensure сейчас нет.

## Проверки перед сдачей изменения

### Синтаксис JavaScript

```powershell
Get-ChildItem js\*.js | ForEach-Object { node --check $_.FullName }
```

### Git и whitespace

```powershell
git status --short --branch
git diff --check
git diff --stat
```

`git diff --check` и `git diff --stat` по умолчанию не включают неотслеживаемые файлы. Их наличие проверяется `git status --short --branch`. Дополнительные проверки без проектных зависимостей:

```powershell
rg -n "[ \t]+$" AGENTS.md README.md docs css js
rg -n '<script src=' index.html app.html
rg -n '768|@media|innerWidth' css js
rg -n 'Columns:|_BACKUP_SHEETS|ALL_SHEETS|DATA_SHEETS' js/sheets.js
```

В репозитории нет настроенных HTML/CSS validators, linter, formatter, test runner или Markdown link checker.

### Ручной smoke test

Проверяйте только на отдельном тестовом объекте:

1. Вход и повторный вход после reload.
2. Выход через настройки.
3. Загрузку каждого модуля.
4. Создание, редактирование и удаление затронутой сущности.
5. Reload страницы после записи, чтобы исключить ошибку memory cache.
6. Переключение на другой объект и обратно.
7. Mobile viewport меньше `768px` и desktop viewport от `768px`.
8. Ошибку Google API: пользователь должен получить понятное уведомление.

Для изменений календаря дополнительно проверяйте соответствующую строку finance. Для изменений задач — ссылки на календарь, закупки, теги и исполнителей.

## Публикация

README исходной версии указывал GitHub Pages как hosting. Репозиторий содержит готовые статические файлы, но не содержит workflow или другой зафиксированной конфигурации Pages. Активность опубликованного сайта в рамках репозитория не проверена.

Один из поддерживаемых GitHub Pages способов публикации статического корня выглядит так; неизвестно, совпадает ли он с текущей внешней настройкой проекта:

1. В GitHub repository settings открыть Pages.
2. Выбрать публикацию из ветки, содержащей проект, и каталога `/ (root)`.
3. Дождаться доступности `index.html`.
4. Добавить production origin в OAuth Authorized JavaScript Origins.
5. Проверить вход и доступ к таблицам на опубликованном URL.

Не переносите статические файлы так, чтобы ломались относительные ссылки `css/...`, `js/...`, `favicon.svg` и переходы между `index.html`/`app.html`.

Точный branch/source текущего GitHub Pages — внешняя настройка и из файлов репозитория не определяется.

## Диагностика

### Кнопка входа не активируется или остаётся загрузка

- Проверьте загрузку `https://accounts.google.com/gsi/client` в Network.
- Проверьте блокировщики контента и third-party restrictions.
- Подождите fallback silent auth: текущий timeout равен 4 секундам.
- Удалите только auth-ключи из `localStorage` или используйте выход, затем выберите аккаунт явно.
- Проверьте JavaScript console на ошибку GIS.

### `origin_mismatch` или OAuth popup error

- Сверьте фактический `location.origin` с Authorized JavaScript Origins.
- Не добавляйте path вместо origin.
- Для локальной разработки используйте тот же hostname и порт, которые зарегистрированы.

### «Доступ запрещён» после Google login

Профиль успешно получен, но email не совпал с `CONFIG.ALLOWED_EMAIL`. Это отдельная проверка от прав доступа к spreadsheet.

### `401 Unauthorized`

`sheets.js` удаляет token и expiry и переводит на `index.html`. Выполните вход снова. Access token не имеет refresh token; продление происходит новым token request через GIS.

### `403` от Google Sheets

Код показывает сообщение Google API, но не определяет причину `403`. Внешне нужно проверить права аккаунта, выданные scopes, OAuth configuration и доступность Sheets API; их фактическое состояние репозиторием не подтверждается.

### `Unable to parse range` / лист не найден

- Проверьте точное имя листа из `DATA_MODEL.md`.
- Проверьте, что выбран правильный объект и Sheet ID.
- Для подключённой существующей таблицы создайте отсутствующий базовый лист вручную или через поддерживаемый migration workflow.

### Данные не обновились после переключения объекта

- Проверьте `localStorage.activeObjectId` и `localStorage.objects`.
- Убедитесь, что объект ссылается на правильный Sheet ID.
- Reload должен выполнить повторную registry sync и очистить in-memory state страницы.
- Полная очистка кэша обязательна, потому что его ключи содержат имя листа, но не Sheet ID.

### Объекты различаются на устройствах

- Проверьте лист `_registry` legacy spreadsheet.
- В настройках используйте принудительную синхронизацию объектов.
- Помните, что registry записывается целиком; избегайте одновременного редактирования списка объектов на разных устройствах.

### Баланс в колонке Sheets выглядит устаревшим

UI рассчитывает текущий итог из операций, но сохранённое поле `finance.balance` не всегда пересчитывается после удаления. Это известный технический долг; не исправляйте таблицу вручную без резервной копии и понимания порядка операций.

### Авто-бэкап не появился для второго объекта

Отметка `last_auto_backup` сейчас глобальна для browser profile, а не для объекта. После успешного backup первого объекта другие объекты в тот же день автоматически не копируются. Ручной backup доступен в настройках.

## Работа с production-данными

- Перед массовым изменением создайте ручной бэкап и проверьте его наличие.
- Для экспериментов создавайте отдельный объект/spreadsheet.
- Удаление строк физическое и не имеет server-side undo приложения.
- Restore заменяет не все листы: подробности приведены в `DATA_MODEL.md`.
- JSON export является выгрузкой, но UI импорта JSON не реализован.

Точный состав листов, связи и ограничения restore не повторяются здесь; источником является [DATA_MODEL.md](DATA_MODEL.md).
