"""Telegram-бот — админка сайта poetry_site.

Позволяет автору добавлять, править и удалять стихотворения, а также
редактировать сведения «О себе» прямо из Telegram. Каждое изменение
сохраняется в data/poems.js (или data/author.js), коммитится в git и
отправляется на GitHub — сайт обновляется автоматически.

Запуск:
    pip install -r requirements.txt
    BOT_TOKEN=... ADMIN_IDS=... python3 bot/bot.py
Подробнее — в bot_instructions.txt в корне репозитория.
"""

import functools
import json
import os
from datetime import datetime
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from publisher import Publisher
from store import Store

# --------------------------------------------------------------------- config

BOT_DIR = Path(__file__).resolve().parent
REPO_DIR = Path(os.environ.get("REPO_DIR", BOT_DIR.parent)).resolve()
ADMINS_FILE = BOT_DIR / "admins.json"
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
AUTO_PUSH = os.environ.get("AUTO_PUSH", "1").lower() not in ("0", "false", "no")

PAGE_SIZE = 10
MAX_COLLECTED = 30_000  # максимальная длина текста стиха при вводе по частям

store = Store(REPO_DIR)
publisher = Publisher(REPO_DIR, auto_push=AUTO_PUSH)

# --------------------------------------------------------------------- admins

def load_admins():
    admins = set()
    for part in os.environ.get("ADMIN_IDS", "").replace(";", ",").split(","):
        part = part.strip()
        if part.isdigit():
            admins.add(int(part))
    if ADMINS_FILE.exists():
        try:
            admins.update(json.loads(ADMINS_FILE.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass
    return admins


def save_admin_id(user_id):
    admins = set()
    if ADMINS_FILE.exists():
        try:
            admins.update(json.loads(ADMINS_FILE.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass
    admins.add(user_id)
    ADMINS_FILE.write_text(json.dumps(sorted(admins)), encoding="utf-8")


ADMINS = load_admins()


def grant_access(update: Update, context: ContextTypes.DEFAULT_TYPE, code: str) -> bool:
    """Проверяет пароль из /start <пароль> и выдаёт доступ."""
    global ADMINS
    if not ADMIN_PASSWORD or code != ADMIN_PASSWORD:
        return False
    user_id = update.effective_user.id
    save_admin_id(user_id)
    ADMINS = load_admins()
    return True


def admin_only(func):
    @functools.wraps(func)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user = update.effective_user
        if user is None or user.id not in ADMINS:
            text = "⛔ Доступ только для автора."
            if ADMIN_PASSWORD:
                text += "\nПервый вход: /start <пароль> (пароль задан в ADMIN_PASSWORD)."
            if update.callback_query:
                await update.callback_query.answer(text[:200], show_alert=True)
            elif update.effective_message:
                await update.effective_message.reply_text(text)
            return ConversationHandler.END
        return await func(update, context)

    return wrapper

# -------------------------------------------------------------------- helpers

def poem_card(poem, changes=None):
    changes = changes or {}
    text = changes.get("text", poem.get("text", ""))
    if len(text) > 700:
        text = text[:700] + " …"
    lines = [
        f"📖 {changes.get('title', poem.get('title', '(без названия)'))}",
        f"Рубрика: {changes.get('genre', poem.get('genre', '—'))}",
        f"Дата: {changes.get('date', poem.get('date', '—'))}",
    ]
    url = changes.get("url", poem.get("url", ""))
    if url:
        lines.append(f"Источник: {url}")
    lines.append(f"id: {poem.get('id', '—')}")
    lines.append("")
    lines.append(text or "(текст пуст)")
    return "\n".join(lines)


def list_keyboard(poems, offset, pick_prefix, nav_prefix):
    rows = []
    for poem in poems[offset:offset + PAGE_SIZE]:
        title = poem.get("title") or "(без названия)"
        if len(title) > 40:
            title = title[:39] + "…"
        rows.append([InlineKeyboardButton(title, callback_data=pick_prefix + poem["id"])])
    nav = []
    if offset > 0:
        nav.append(InlineKeyboardButton("⬅️", callback_data=f"{nav_prefix}{max(offset - PAGE_SIZE, 0)}"))
    nav.append(InlineKeyboardButton(
        f"{offset + 1}–{min(offset + PAGE_SIZE, len(poems))} из {len(poems)}",
        callback_data="noop",
    ))
    if offset + PAGE_SIZE < len(poems):
        nav.append(InlineKeyboardButton("➡️", callback_data=f"{nav_prefix}{offset + PAGE_SIZE}"))
    rows.append(nav)
    rows.append([InlineKeyboardButton("✖️ Закрыть", callback_data="close")])
    return InlineKeyboardMarkup(rows)


def genre_keyboard(prefix):
    rows = []
    row = []
    for genre in store.genres(store.load_poems()):
        row.append(InlineKeyboardButton(genre, callback_data=prefix + genre))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([InlineKeyboardButton("✍️ Своя рубрика", callback_data=prefix + "__custom__")])
    return InlineKeyboardMarkup(rows)


def parse_date(value):
    """ДД.ММ.ГГГГ [ЧЧ:ММ] или ГГГГ-ММ-ДД [ЧЧ:ММ] -> 'ДД.ММ.ГГГГ ЧЧ:ММ'."""
    value = value.strip()
    for fmt in ("%d.%m.%Y %H:%M", "%d.%m.%Y", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(value, fmt)
        except ValueError:
            continue
        if "%H" not in fmt:
            parsed = parsed.replace(hour=datetime.now().hour, minute=datetime.now().minute)
        return parsed.strftime("%d.%m.%Y %H:%M")
    return None


async def show_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(
        "Я — админка сайта стихов. Управляю содержимым data/poems.js и data/author.js.\n\n"
        "Команды:\n"
        "/add — добавить стихотворение\n"
        "/edit — отредактировать стих\n"
        "/delete — удалить стих\n"
        "/list — список стихов\n"
        "/find <текст> — поиск по названиям и тексту\n"
        "/author — редактировать сведения об авторе\n"
        "/id — мой Telegram ID\n"
        "/cancel — отменить текущее действие"
    )

# ------------------------------------------------------------------- commands

@admin_only
async def cmd_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    poems = store.load_poems()
    if not poems:
        await update.effective_message.reply_text("Список пуст.")
        return
    await update.effective_message.reply_text(
        "📖 Стихи (сначала новые):",
        reply_markup=list_keyboard(poems, 0, "lp:", "lpn:"),
    )


@admin_only
async def cmd_find(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = " ".join(context.args).strip()
    if not query:
        await update.effective_message.reply_text("Использование: /find <фрагмент названия или текста>")
        return
    poems = store.search(store.load_poems(), query)
    if not poems:
        await update.effective_message.reply_text(f"По запросу «{query}» ничего не найдено.")
        return
    await update.effective_message.reply_text(
        f"🔎 Найдено: {len(poems)}",
        reply_markup=list_keyboard(poems, 0, "lp:", "lpn:"),
    )


async def cb_noop(update: Update, _context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()


async def cb_close(update: Update, _context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    await update.callback_query.edit_message_text("Закрыто.")


async def cb_list_page(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    offset = int(update.callback_query.data[4:])
    poems = store.load_poems()
    await update.callback_query.edit_message_reply_markup(
        reply_markup=list_keyboard(poems, offset, "lp:", "lpn:")
    )


async def cmd_id(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    status = "админ ✅" if user.id in ADMINS else "не админ ⛔"
    await update.effective_message.reply_text(f"Ваш Telegram ID: {user.id} ({status})")

# --------------------------------------------------------- /add — новый стих

TITLE, GENRE, DATE, URL, TEXT, CONFIRM = range(6)


@admin_only
async def add_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.effective_message.reply_text(
        "➕ Новый стих.\nШаг 1/5 — отправьте название (или /skip, чтобы задать позже)."
    )
    return TITLE


async def add_title(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["title"] = update.message.text.strip()
    await update.message.reply_text(
        "Шаг 2/5 — выберите рубрику (или пришлите свою):",
        reply_markup=genre_keyboard("ag:"),
    )
    return GENRE


async def add_title_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(
        "Шаг 2/5 — выберите рубрику (или пришлите свою):",
        reply_markup=genre_keyboard("ag:"),
    )
    return GENRE


async def add_genre_cb(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    genre = update.callback_query.data[3:]
    if genre == "__custom__":
        await update.callback_query.message.reply_text("Напишите название рубрики:")
        return GENRE
    context.user_data["genre"] = genre
    await update.callback_query.message.reply_text("Шаг 3/5 — дата стиха в формате ДД.ММ.ГГГГ (или /skip — сейчас):")
    return DATE


async def add_genre_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["genre"] = update.message.text.strip()
    await update.message.reply_text("Шаг 3/5 — дата стиха в формате ДД.ММ.ГГГГ (или /skip — сейчас):")
    return DATE


async def add_date(update: Update, context: ContextTypes.DEFAULT_TYPE):
    parsed = parse_date(update.message.text)
    if not parsed:
        await update.message.reply_text("Не понял дату. Формат: ДД.ММ.ГГГГ или ДД.ММ.ГГГГ ЧЧ:ММ. Попробуйте ещё раз:")
        return DATE
    context.user_data["date"] = parsed
    await update.message.reply_text("Шаг 4/5 — ссылка на источник (stihi.ru), или /skip:")
    return URL


async def add_date_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["date"] = datetime.now().strftime("%d.%m.%Y %H:%M")
    await update.effective_message.reply_text("Шаг 4/5 — ссылка на источник (stihi.ru), или /skip:")
    return URL


async def add_url(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["url"] = update.message.text.strip()
    await update.message.reply_text(
        "Шаг 5/5 — отправьте текст стиха. Можно несколькими сообщениями; "
        "когда закончите — отправьте /done."
    )
    context.user_data["text_buf"] = []
    return TEXT


async def add_url_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(
        "Шаг 5/5 — отправьте текст стиха. Можно несколькими сообщениями; "
        "когда закончите — отправьте /done."
    )
    context.user_data["text_buf"] = []
    return TEXT


async def add_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    buf = context.user_data.setdefault("text_buf", [])
    buf.append(update.message.text)
    if sum(len(p) for p in buf) > MAX_COLLECTED:
        await update.message.reply_text("Текст слишком длинный, начинаем заново. Отправьте текст стиха:")
        context.user_data["text_buf"] = []
        return TEXT
    await update.message.reply_text(f"Принято ({len(buf)} сообщ.). Ещё — присылайте, конец — /done.")
    return TEXT


async def add_text_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = "\n\n".join(context.user_data.get("text_buf", [])).strip()
    if not text:
        await update.message.reply_text("Текст пуст. Отправьте текст стиха или /cancel.")
        return TEXT
    context.user_data["text"] = text
    poem = {
        "id": "(будет присвоен при публикации)",
        "title": context.user_data.get("title", "(без названия)"),
        "genre": context.user_data.get("genre", ""),
        "date": context.user_data.get("date", datetime.now().strftime("%d.%m.%Y %H:%M")),
        "url": context.user_data.get("url", ""),
        "text": text,
    }
    await update.message.reply_text(
        "Проверьте черновик:\n\n" + poem_card(poem),
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("✅ Опубликовать", callback_data="ac:yes"),
            InlineKeyboardButton("❌ Отменить", callback_data="ac:no"),
        ]]),
    )
    return CONFIRM


async def add_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    if update.callback_query.data != "ac:yes":
        context.user_data.clear()
        await update.callback_query.edit_message_text("Добавление отменено.")
        return ConversationHandler.END

    poems = store.load_poems()
    now = datetime.now()
    poem = {
        "id": store.make_poem_id(poems, now),
        "title": context.user_data.get("title", "(без названия)"),
        "genre": context.user_data.get("genre", ""),
        "date": context.user_data.get("date", now.strftime("%d.%m.%Y %H:%M")),
        "url": context.user_data.get("url", ""),
        "text": context.user_data.get("text", ""),
    }
    if not poem["url"]:
        poem.pop("url", None)
    poems.insert(0, poem)  # список на сайте — сначала новые
    store.save_poems(poems)
    title = poem["title"]
    status = publisher.publish(f"Бот: добавлен стих «{title}»")
    context.user_data.clear()
    await update.callback_query.edit_message_text(f"Стих «{title}» добавлен.\n{status}")
    return ConversationHandler.END


async def add_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.effective_message.reply_text("Отменено.")
    return ConversationHandler.END

# ---------------------------------------------------------- /edit — правка

E_PICK, E_FIELD, E_VALUE = range(3)


@admin_only
async def edit_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    poems = store.load_poems()
    await update.effective_message.reply_text(
        "✏️ Выберите стих (⬅️➡️ — листать) или отправьте текст для поиска:",
        reply_markup=list_keyboard(poems, 0, "ep:", "epn:"),
    )
    return E_PICK


async def edit_page(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    offset = int(update.callback_query.data[4:])
    if context.user_data.get("found") is not None:
        poems = context.user_data["found"]
    else:
        poems = store.load_poems()
    await update.callback_query.edit_message_reply_markup(
        reply_markup=list_keyboard(poems, offset, "ep:", "epn:")
    )
    return E_PICK


async def edit_search(update: Update, context: ContextTypes.DEFAULT_TYPE):
    found = store.search(store.load_poems(), update.message.text)
    if not found:
        await update.message.reply_text("Ничего не найдено, попробуйте другой запрос:")
        return E_PICK
    context.user_data["found"] = found
    await update.message.reply_text(f"🔎 Найдено: {len(found)}", reply_markup=list_keyboard(found, 0, "ep:", "epn:"))
    return E_PICK


def field_keyboard():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("Название", callback_data="ef:title"),
         InlineKeyboardButton("Рубрика", callback_data="ef:genre")],
        [InlineKeyboardButton("Дата", callback_data="ef:date"),
         InlineKeyboardButton("Текст", callback_data="ef:text")],
        [InlineKeyboardButton("Ссылка", callback_data="ef:url"),
         InlineKeyboardButton("✅ Готово", callback_data="ef:done")],
    ])


async def edit_pick(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    poem_id = update.callback_query.data[3:]
    _, poem = store.find(store.load_poems(), poem_id)
    if poem is None:
        await update.callback_query.edit_message_text("Стих не найден (уже удалён?).")
        return ConversationHandler.END
    context.user_data["poem_id"] = poem_id
    await update.callback_query.edit_message_text(poem_card(poem), reply_markup=field_keyboard())
    return E_FIELD


async def edit_field_cb(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    field = update.callback_query.data[3:]
    if field == "done":
        context.user_data.clear()
        await update.callback_query.edit_message_text("Правка завершена.")
        return ConversationHandler.END
    context.user_data["field"] = field
    prompts = {
        "title": "Отправьте новое название:",
        "date": "Отправьте новую дату (ДД.ММ.ГГГГ или ДД.ММ.ГГГГ ЧЧ:ММ):",
        "url": "Отправьте новую ссылку (или /skip — удалить ссылку):",
        "text": "Отправьте новый текст стиха (можно несколькими сообщениями), затем /done.",
    }
    if field == "genre":
        await update.callback_query.message.reply_text("Выберите рубрику:", reply_markup=genre_keyboard("eg:"))
        return E_VALUE
    await update.callback_query.message.reply_text(prompts[field])
    return E_VALUE


async def edit_genre_cb(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    genre = update.callback_query.data[3:]
    if genre == "__custom__":
        await update.callback_query.message.reply_text("Напишите название рубрики:")
        return E_VALUE
    context.user_data["new_value"] = genre
    return await apply_edit(update, context)


async def edit_value(update: Update, context: ContextTypes.DEFAULT_TYPE):
    field = context.user_data.get("field")
    value = update.message.text.strip()
    if field == "date":
        parsed = parse_date(value)
        if not parsed:
            await update.message.reply_text("Не понял дату. Формат: ДД.ММ.ГГГГ [ЧЧ:ММ]:")
            return E_VALUE
        value = parsed
    if field == "text":
        buf = context.user_data.setdefault("text_buf", [])
        buf.append(update.message.text)
        if sum(len(p) for p in buf) > MAX_COLLECTED:
            await update.message.reply_text("Текст слишком длинный, начинаем заново:")
            context.user_data["text_buf"] = []
            return E_VALUE
        await update.message.reply_text(f"Принято ({len(buf)} сообщ.). Ещё — присылайте, конец — /done.")
        return E_VALUE
    context.user_data["new_value"] = value
    return await apply_edit(update, context)


async def edit_value_done(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = "\n\n".join(context.user_data.get("text_buf", [])).strip()
    if not text:
        await update.message.reply_text("Текст пуст. Отправьте текст или /cancel.")
        return E_VALUE
    context.user_data["new_value"] = text
    return await apply_edit(update, context)


async def edit_value_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Целиком относится к полю «Ссылка» — /skip удаляет её."""
    field = context.user_data.get("field")
    if field != "url":
        await update.message.reply_text("/skip здесь не работает. Отправьте значение:")
        return E_VALUE
    context.user_data["new_value"] = None  # удалить поле
    return await apply_edit(update, context)


async def apply_edit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    poems = store.load_poems()
    _, poem = store.find(poems, context.user_data["poem_id"])
    if poem is None:
        await update.effective_message.reply_text("Стих не найден (уже удалён?).")
        return ConversationHandler.END
    field = context.user_data["field"]
    value = context.user_data["new_value"]
    if value is None:
        poem.pop(field, None)
        verb = f"удалено поле {field}"
    else:
        poem[field] = value
        verb = f"обновлено поле {field}"
    store.save_poems(poems)
    status = publisher.publish(f"Бот: в стихе «{poem.get('title', poem['id'])}» {verb}")
    context.user_data.pop("field", None)
    context.user_data.pop("new_value", None)
    context.user_data.pop("text_buf", None)
    if update.callback_query:
        await update.callback_query.message.reply_text(f"Сохранено. {status}")
    else:
        await update.effective_message.reply_text(f"Сохранено. {status}")
    await update.effective_message.reply_text("Что правим дальше?", reply_markup=field_keyboard())
    return E_FIELD


async def edit_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.effective_message.reply_text("Отменено.")
    return ConversationHandler.END

# --------------------------------------------------------- /delete — удаление

D_PICK, D_CONFIRM = range(2)


@admin_only
async def delete_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.effective_message.reply_text(
        "🗑 Выберите стих для удаления или отправьте текст для поиска:",
        reply_markup=list_keyboard(store.load_poems(), 0, "dp:", "dpn:"),
    )
    return D_PICK


async def delete_page(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    offset = int(update.callback_query.data[4:])
    poems = context.user_data.get("found") or store.load_poems()
    await update.callback_query.edit_message_reply_markup(
        reply_markup=list_keyboard(poems, offset, "dp:", "dpn:")
    )
    return D_PICK


async def delete_search(update: Update, context: ContextTypes.DEFAULT_TYPE):
    found = store.search(store.load_poems(), update.message.text)
    if not found:
        await update.message.reply_text("Ничего не найдено, попробуйте другой запрос:")
        return D_PICK
    context.user_data["found"] = found
    await update.message.reply_text(f"🔎 Найдено: {len(found)}", reply_markup=list_keyboard(found, 0, "dp:", "dpn:"))
    return D_PICK


async def delete_pick(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    poem_id = update.callback_query.data[3:]
    _, poem = store.find(store.load_poems(), poem_id)
    if poem is None:
        await update.callback_query.edit_message_text("Стих не найден (уже удалён?).")
        return ConversationHandler.END
    context.user_data["poem_id"] = poem_id
    await update.callback_query.edit_message_text(
        poem_card(poem),
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("🗑 Удалить", callback_data="dc:yes"),
            InlineKeyboardButton("Отмена", callback_data="dc:no"),
        ]]),
    )
    return D_CONFIRM


async def delete_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    poem_id = context.user_data.get("poem_id")
    context.user_data.clear()
    if update.callback_query.data != "dc:yes":
        await update.callback_query.edit_message_text("Удаление отменено.")
        return ConversationHandler.END
    poems = store.load_poems()
    index, poem = store.find(poems, poem_id)
    if poem is None:
        await update.callback_query.edit_message_text("Стих не найден (уже удалён?).")
        return ConversationHandler.END
    poems.pop(index)
    store.save_poems(poems)
    status = publisher.publish(f"Бот: удалён стих «{poem.get('title', poem['id'])}»")
    await update.callback_query.edit_message_text(f"Стих «{poem.get('title', poem['id'])}» удалён.\n{status}")
    return ConversationHandler.END


async def simple_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.effective_message.reply_text("Отменено.")
    return ConversationHandler.END

# ------------------------------------------------- /author — сведения об авторе

A_MENU, A_VALUE = range(2)

AUTHOR_FIELDS = {"name": "Имя", "bio": "О себе"}


@admin_only
async def author_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    author = store.load_author()
    keyboard = [
        [InlineKeyboardButton("Имя", callback_data="af:name")],
        [InlineKeyboardButton("О себе", callback_data="af:bio")],
    ]
    keyboard += [
        [InlineKeyboardButton(f"Ссылка: {key}", callback_data=f"af:link:{key}")]
        for key in author.get("links", {})
    ]
    keyboard.append([InlineKeyboardButton("✖️ Закрыть", callback_data="close")])
    await update.effective_message.reply_text(
        "👤 Текущие сведения об авторе:\n\n"
        f"Имя: {author.get('name', '—')}\n"
        f"О себе: {author.get('bio', '—')}\n"
        + "\n".join(f"Ссылка {k}: {v}" for k, v in author.get("links", {}).items())
        + "\n\nЧто меняем?",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return A_MENU


async def author_field_cb(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    field = update.callback_query.data[3:]  # name | bio | link:<key>
    context.user_data["author_field"] = field
    if field in AUTHOR_FIELDS:
        label = AUTHOR_FIELDS[field]
    else:
        key = field.split(":", 1)
        label = f"Ссылка «{key[1]}»" if len(key) == 2 else field
    await update.callback_query.message.reply_text(f"Отправьте новое значение для «{label}»:")
    return A_VALUE


async def author_value(update: Update, context: ContextTypes.DEFAULT_TYPE):
    value = update.message.text.strip()
    field = context.user_data.pop("author_field", None)
    if not field:
        await update.message.reply_text("Неизвестное поле, начните заново: /author")
        return ConversationHandler.END
    author = store.load_author()
    if field.startswith("link:"):
        author.setdefault("links", {})[field.split(":", 1)[1]] = value
    else:
        author[field] = value
    store.save_author(author)
    status = publisher.publish(f"Бот: обновлены сведения об авторе ({field.replace(':', ' ')})")
    await update.message.reply_text(f"Сохранено. {status}")
    return ConversationHandler.END

# ---------------------------------------------------------------------- common

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if user and user.id not in ADMINS and context.args and grant_access(update, context, context.args[0]):
        await update.effective_message.reply_text(
            f"✅ Доступ выдан (ID {user.id}). Добро пожаловать!\n\n/help — список команд."
        )
        return
    if user is None or user.id not in ADMINS:
        text = "⛔ Доступ только для автора."
        if ADMIN_PASSWORD:
            text += "\nПервый вход: /start <пароль>."
        await update.effective_message.reply_text(text)
        return
    await show_help(update, context)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if user is None or user.id not in ADMINS:
        await update.effective_message.reply_text("⛔ Доступ только для автора.")
        return
    await show_help(update, context)


async def unknown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text("Не понимаю команду. /help — список команд.")

# ------------------------------------------------------------------------ main

def build_conversations():
    filter_text = filters.TEXT & ~filters.COMMAND

    add_conv = ConversationHandler(
        entry_points=[CommandHandler("add", add_start)],
        states={
            TITLE: [
                CommandHandler("skip", add_title_skip),
                MessageHandler(filter_text, add_title),
            ],
            GENRE: [
                CallbackQueryHandler(add_genre_cb, pattern=r"^ag:"),
                MessageHandler(filter_text, add_genre_text),
            ],
            DATE: [CommandHandler("skip", add_date_skip), MessageHandler(filter_text, add_date)],
            URL: [CommandHandler("skip", add_url_skip), MessageHandler(filter_text, add_url)],
            TEXT: [
                CommandHandler("done", add_text_done),
                MessageHandler(filter_text, add_text),
            ],
            CONFIRM: [CallbackQueryHandler(add_confirm, pattern=r"^ac:")],
        },
        fallbacks=[CommandHandler("cancel", add_cancel)],
        per_message=False,
    )

    edit_conv = ConversationHandler(
        entry_points=[CommandHandler("edit", edit_start)],
        states={
            E_PICK: [
                CallbackQueryHandler(edit_page, pattern=r"^epn:\d+$"),
                CallbackQueryHandler(edit_pick, pattern=r"^ep:"),
                MessageHandler(filter_text, edit_search),
            ],
            E_FIELD: [
                CallbackQueryHandler(edit_field_cb, pattern=r"^ef:"),
                CallbackQueryHandler(edit_genre_cb, pattern=r"^eg:"),
            ],
            E_VALUE: [
                CommandHandler("done", edit_value_done),
                CommandHandler("skip", edit_value_skip),
                MessageHandler(filter_text, edit_value),
            ],
        },
        fallbacks=[CommandHandler("cancel", edit_cancel)],
        per_message=False,
    )

    delete_conv = ConversationHandler(
        entry_points=[CommandHandler("delete", delete_start)],
        states={
            D_PICK: [
                CallbackQueryHandler(delete_page, pattern=r"^dpn:\d+$"),
                CallbackQueryHandler(delete_pick, pattern=r"^dp:"),
                MessageHandler(filter_text, delete_search),
            ],
            D_CONFIRM: [CallbackQueryHandler(delete_confirm, pattern=r"^dc:")],
        },
        fallbacks=[CommandHandler("cancel", simple_cancel)],
        per_message=False,
    )

    author_conv = ConversationHandler(
        entry_points=[CommandHandler("author", author_start)],
        states={
            A_MENU: [CallbackQueryHandler(author_field_cb, pattern=r"^af:")],
            A_VALUE: [MessageHandler(filter_text, author_value)],
        },
        fallbacks=[CommandHandler("cancel", simple_cancel)],
        per_message=False,
    )

    return add_conv, edit_conv, delete_conv, author_conv


async def set_commands(app):
    await app.bot.set_my_commands([
        ("start", "Начало работы / вход по паролю"),
        ("add", "Добавить стихотворение"),
        ("edit", "Отредактировать стих"),
        ("delete", "Удалить стих"),
        ("list", "Список стихов"),
        ("find", "Поиск стихов"),
        ("author", "Сведения об авторе"),
        ("cancel", "Отменить действие"),
    ])


def main():
    if not BOT_TOKEN:
        raise SystemExit("Не задан BOT_TOKEN (переменная окружения). См. bot_instructions.txt")

    app = Application.builder().token(BOT_TOKEN).post_init(set_commands).build()
    add_conv, edit_conv, delete_conv, author_conv = build_conversations()
    app.add_handler(CommandHandler(["start"], cmd_start))
    app.add_handler(CommandHandler(["help"], cmd_help))
    app.add_handler(CommandHandler(["id"], cmd_id))
    app.add_handler(CommandHandler(["list"], cmd_list))
    app.add_handler(CommandHandler(["find"], cmd_find))
    app.add_handler(add_conv)
    app.add_handler(edit_conv)
    app.add_handler(delete_conv)
    app.add_handler(author_conv)
    app.add_handler(CallbackQueryHandler(cb_list_page, pattern=r"^lpn:\d+$"))
    app.add_handler(CallbackQueryHandler(cb_noop, pattern=r"^(lp:|noop$)"))
    app.add_handler(CallbackQueryHandler(cb_close, pattern=r"^close$"))
    app.add_handler(MessageHandler(filters.COMMAND, unknown))

    print(f"Бот запущен. Репозиторий: {REPO_DIR}, админы: {sorted(ADMINS)}, auto_push={AUTO_PUSH}")
    app.run_polling()


if __name__ == "__main__":
    main()
