#!/usr/bin/env python3
"""Агенто — коннекторы внешних источников для сводки.

Тянет свежие записи из Instagram, Telegram-групп и Threads и отдаёт их
единым списком. Только stdlib (urllib), без внешних зависимостей.

Каждый sync_* возвращает (items, new_extra):
  items — список dict(external_id, author, text, media_url, url, published_at)
  new_extra — dict, который надо сохранить в connected_accounts.extra
             (например, offset для Telegram getUpdates).
"""

import json
import time
import urllib.parse
import urllib.request


class ConnectorError(Exception):
    pass


def _get_json(url, params=None, headers=None, timeout=20):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url, headers=headers or {"User-Agent": "Agento/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                raise ConnectorError(f"HTTP {r.status}")
            return json.loads(r.read().decode("utf-8", "replace"))
    except ConnectorError:
        raise
    except Exception as e:  # сеть, DNS, таймаут, битый JSON
        raise ConnectorError(f"сеть: {e}")


def _ts(v, default=None):
    """ISO8601 / unix -> unix int."""
    if v is None:
        return default if default is not None else int(time.time())
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip()
    if s.isdigit():
        return int(s)
    try:
        # 2026-09-10T12:34:56+0000 или ...Z
        s2 = s.replace("Z", "+00:00")
        import datetime
        dt = datetime.datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return default if default is not None else int(time.time())


PROVIDERS = {
    "instagram": {
        "title": "Instagram",
        "icon": "📸",
        "secret_label": "Access Token",
        "help": ("Токен Instagram Graph API: создайте приложение на developers.facebook.com, "
                 "добавьте продукт Instagram, выпустите User Access Token "
                 "с правом instagram_graph_user_media."),
    },
    "telegram": {
        "title": "Telegram-группа",
        "icon": "✈️",
        "secret_label": "Токен бота",
        "help": ("1) Создайте бота через @BotFather и скопируйте токен. "
                 "2) Добавьте бота в группу/канал. "
                 "3) Новые сообщения будут подтягиваться в сводку при каждой синхронизации."),
    },
    "threads": {
        "title": "Threads",
        "icon": "🧵",
        "secret_label": "Access Token",
        "help": ("Токен Threads API: приложение на developers.facebook.com, "
                 "продукт Threads, User Access Token с правом threads_basic."),
    },
}


# ---------------- Telegram ----------------
def sync_telegram(secret, extra):
    """Читает новые сообщения через Bot API getUpdates.

    Работает для групп и каналов, куда добавлен бот. Возвращает только
    сообщения, пришедшие после прошлой синхронизации (offset храним в extra).
    """
    try:
        data = json.loads(extra or "{}")
    except Exception:
        data = {}
    offset = int(data.get("offset") or 0)
    res = _get_json(
        f"https://api.telegram.org/bot{secret}/getUpdates",
        {"offset": offset, "timeout": 0, "limit": 50,
         "allowed_updates": json.dumps(["message", "channel_post"])})
    if not res.get("ok"):
        raise ConnectorError(res.get("description") or "Telegram API error")
    items = []
    new_offset = offset
    for upd in res.get("result", []):
        try:
            new_offset = max(new_offset, int(upd.get("update_id", 0)) + 1)
            msg = upd.get("message") or upd.get("channel_post") or {}
            text = (msg.get("text") or msg.get("caption") or "").strip()
            if not text:
                continue
            chat = msg.get("chat") or {}
            frm = msg.get("from") or {}
            author = (chat.get("title")
                      or ("@" + frm.get("username") if frm.get("username") else None)
                      or frm.get("first_name") or "Telegram")
            items.append({
                "external_id": f"tg{upd.get('update_id')}",
                "author": str(author),
                "text": text[:2000],
                "media_url": "",
                "url": "",
                "published_at": int(msg.get("date") or time.time()),
            })
        except Exception:
            continue
    return items, {"offset": new_offset}


# ---------------- Instagram ----------------
def sync_instagram(secret, extra):
    res = _get_json(
        "https://graph.instagram.com/me/media",
        {"fields": "id,caption,media_url,permalink,timestamp",
         "access_token": secret, "limit": 25})
    if "error" in res:
        err = res["error"]
        raise ConnectorError(
            f"{err.get('message') or err} (code {err.get('code')})")
    items = []
    for m in res.get("data", []):
        items.append({
            "external_id": "ig" + str(m.get("id")),
            "author": "Instagram",
            "text": (m.get("caption") or "").strip()[:2000],
            "media_url": m.get("media_url") or "",
            "url": m.get("permalink") or "",
            "published_at": _ts(m.get("timestamp")),
        })
    return items, {}


# ---------------- Threads ----------------
def sync_threads(secret, extra):
    res = _get_json(
        "https://graph.threads.net/v1.0/me/threads",
        {"fields": "id,text,permalink,timestamp", "access_token": secret,
         "limit": 25})
    if "error" in res:
        err = res["error"]
        raise ConnectorError(
            f"{err.get('message') or err} (code {err.get('code')})")
    items = []
    for m in res.get("data", []):
        items.append({
            "external_id": "th" + str(m.get("id")),
            "author": "Threads",
            "text": (m.get("text") or "").strip()[:2000],
            "media_url": "",
            "url": m.get("permalink") or "",
            "published_at": _ts(m.get("timestamp")),
        })
    return items, {}


SYNCERS = {
    "instagram": sync_instagram,
    "telegram": sync_telegram,
    "threads": sync_threads,
}


def sync_account(provider, secret, extra):
    """Единая точка входа. Возвращает (items, new_extra_dict)."""
    fn = SYNCERS.get(provider)
    if not fn:
        raise ConnectorError(f"неизвестный провайдер: {provider}")
    if not (secret or "").strip():
        raise ConnectorError("нет токена — откройте подключение и вставьте токен")
    return fn(secret.strip(), extra or "{}")
