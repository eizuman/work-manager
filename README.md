# Work Manager

Мобильное веб-приложение для учёта рабочего времени, задач и закупок. Хостится на GitHub Pages, данные хранятся в Google Sheets.

## Настройка Google Sheets

Создайте 5 листов с заголовками в строке 1:

**work_log**: `id | дата | часы | описание | сумма | заметка | timestamp`

**finance**: `id | дата | тип | сумма | баланс | описание | timestamp`

**tasks**: `id | название | описание | исполнители | статус | погода | теги | порядок | дата создания | дата выполнения`

**purchases**: `id | название | цена | статус | task_id | дата создания | дата покупки`

**tags**: `id | название | дата создания`

## Google Cloud Console

В **OAuth 2.0 Client ID** → Authorized JavaScript Origins добавьте URL вашего GitHub Pages сайта.

## Ставка за час

Изменить в `js/sheets.js`: строка `const hourlyRate = 700;`
