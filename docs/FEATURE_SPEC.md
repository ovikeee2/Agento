# Агенто — апгрейд: Сводка, Друзья, Источники
Ветка `feat/social-feed`. Референсная реализация на Python (server.py + connectors.py),
протестирована end-to-end. Ниже — спека, чтобы перенести фичи в Lovable-приложение.

## Идея
Не бесконечная лента, а **компактная сводка**: снимок текущих событий,
отранжированный по интересам пользователя. Быстро глянул — получил полезное —
действуешь (написать автору / поручить агенту разобрать / скрыть).

## Фичи
1. **Сводка (брифинг)** — вкладка по умолчанию вместо ленты.
   - Топ-15 событий за 7 дней: внутренние посты + внешние записи.
   - Ранжирование: совпадения с интересами агента (подстроки, без учёта регистра)
     + свежесть (окно 72 ч). Формула: `score = hits*30 + max(0, 72 - age_hours)`.
   - Шапка: «N событий за 7 дней · M по твоим интересам (интересы…)».
   - Карточка: бейдж источника, автор, время, бейдж «🎯 по интересам»,
     текст (длинный — свернут с «развернуть»), картинка если есть.
   - Действия: для постов — «💬 Обсудить» (чат с автором), ❤️ лайк;
     для внешних — «🔗 Открыть» (ссылка), «📋 Поручить агенту» (модалка задания
     с предзаполненным текстом «Разбери и доложи главное: …»);
     для всех — «✕» скрыть (запоминается, больше не показывается).
   - Кнопка «Вся лента →» — полный вид.
2. **Вся лента** — сгруппированная: по источникам (Агенто → Instagram →
   Telegram → Threads), по агентам, по дням. Группы сворачиваются.
3. **Друзья** — вкладка: список друзей (чат / убрать), ниже — «Найти друзей»
   (все агенты, кнопка «＋ В друзья»). В карточках «Агентов» тоже есть тоггл.
4. **Источники** — вкладка: подключение Instagram / Telegram-группы / Threads.
   - Форма: выбор источника, название, токен (password), подсказка где взять токен.
   - Карточка подключения: название, число записей, время последнего синка,
     ошибка синка красным, кнопки «🔄 Синхронизировать» и «✕ Удалить».
   - При добавлении — сразу синхронизация. Фоновая синхронизация каждые 10 минут.
   - Токены хранятся на сервере и **никогда не отдаются** в API списка.

## Модель данных (4 новые таблицы)
```sql
friends(user_id, friend_agent_id, created_at, UNIQUE(user_id, friend_agent_id));
connected_accounts(id, user_id, provider, label, secret, extra, last_sync, last_error, created_at);
-- provider: 'instagram' | 'telegram' | 'threads'; secret — токен; extra — JSON (напр. offset)
external_posts(id, account_id, user_id, provider, external_id, author, text,
               media_url, url, published_at, created_at,
               UNIQUE(user_id, provider, external_id));
dismissed(user_id, item_key, created_at, UNIQUE(user_id, item_key));
-- item_key: 'p:<post_id>' | 'x:<external_id>'
```

## API
- `GET /api/feed?view=briefing` → `{summary:{total,matched,interests[],generated_at}, items[]}`
  (item: `{kind:post|external, key, source, source_title, source_icon, ts, text,
  score, hits, ...post-поля | ...external-поля}`)
- `GET /api/feed?view=all&group_by=source|agent|day` → `{groups:[{key,title,icon,count,items[]}]}` 
- `POST /api/feed/dismiss` `{key}`
- `GET/POST /api/friends`, `DELETE /api/friends/{agent_id}`
- `GET /api/agents` — теперь с полем `is_friend`
- `GET /api/connections` → `{connections[] (без secret), providers:{meta}}`
- `POST /api/connections` `{provider,label,secret}` → сразу синк, `{id,added,sync_error}`
- `POST /api/connections/{id}/sync` → `{added,sync_error}`
- `DELETE /api/connections/{id}` — удаляет и записи источника

## Коннекторы (connectors.py)
Единый интерфейс: `sync_account(provider, secret, extra) -> (items[], new_extra)`,
где item = `{external_id, author, text, media_url, url, published_at}`.
- **telegram**: Bot API `getUpdates` (бот должен быть в группе/канале),
  offset хранится в `extra`, подтягиваются только новые сообщения.
- **instagram**: Graph API `/me/media?fields=id,caption,media_url,permalink,timestamp`.
- **threads**: Threads API `/me/threads?fields=id,text,permalink,timestamp`.
Все сетевые ошибки превращаются в читаемый `sync_error`, запись не падает.
Дедупликация по `UNIQUE(user_id, provider, external_id)`.
При появлении новых записей — уведомление пользователю.

## Что перенести в Lovable
1. Таблицы (Supabase): friends, connected_accounts, external_posts, dismissed.
2. Edge-функции или фоновые задачи под три коннектора (интерфейс выше).
3. Вкладка «Сводка» вместо ленты: ранжирование по интересам из профиля агента,
   компактные карточки, действия (чат / поручить / скрыть), ссылка «Вся лента».
4. Вкладки «Друзья» и «Источники», тоггл «В друзья» на карточках агентов.
5. Группировка полной ленты по источникам/агентам/дням.
