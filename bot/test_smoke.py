"""Смоук-тест диалогов бота без Telegram: подменяем Update/Context и
прогоняем сценарии добавления, правки, удаления и правки автора
на временной копии репозитория.

Запуск:  python3 bot/test_smoke.py
"""

import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bot  # noqa: E402
from telegram.ext import ConversationHandler  # noqa: E402

END = ConversationHandler.END
REPO = Path(__file__).resolve().parent.parent


class FakeMessage:
    def __init__(self, text=None):
        self.text = text
        self.replies = []

    async def reply_text(self, text, reply_markup=None, **kwargs):
        self.replies.append(text)
        return FakeMessage()


class FakeQuery:
    def __init__(self, data, message):
        self.data = data
        self.message = message
        self.answered = False
        self.edits = []

    async def answer(self, text=None, show_alert=False):
        self.answered = True

    async def edit_message_text(self, text, reply_markup=None, **kwargs):
        self.edits.append(text)
        return FakeMessage()


class FakeUpdate:
    def __init__(self, text=None, user_id=1, query=None):
        self.message = FakeMessage(text) if query is None else None
        self.effective_message = self.message or query.message
        self.callback_query = query
        self.effective_user = SimpleNamespace(id=user_id)


def ctx(**data):
    return SimpleNamespace(user_data=dict(data), args=[])


def last(update):
    src = update.effective_message.replies or update.callback_query.edits
    return src[-1]


async def test_add(tmp):
    bot.store = bot.Store(tmp)
    bot.publisher = bot.Publisher(tmp, auto_push=False)
    poems_before = len(bot.store.load_poems())

    u = FakeUpdate()
    c = ctx()
    assert await bot.add_start(u, c) == bot.TITLE
    u = FakeUpdate("Тестовый стих")
    assert await bot.add_title(u, c) == bot.GENRE
    u = FakeUpdate("тестовая рубрика")
    assert await bot.add_genre_text(u, c) == bot.DATE
    u = FakeUpdate("07.11.2026")
    assert await bot.add_date(u, c) == bot.URL
    u = FakeUpdate()
    assert await bot.add_url_skip(u, c) == bot.TEXT
    u = FakeUpdate("Первая строфа.")
    assert await bot.add_text(u, c) == bot.TEXT
    u = FakeUpdate("Вторая строфа.")
    assert await bot.add_text(u, c) == bot.TEXT
    u = FakeUpdate()
    assert await bot.add_text_done(u, c) == bot.CONFIRM
    u = FakeUpdate(query=FakeQuery("ac:yes", u.effective_message))
    assert await bot.add_confirm(u, c) == END

    poems = bot.store.load_poems()
    assert len(poems) == poems_before + 1
    new = poems[0]
    assert new["title"] == "Тестовый стих"
    assert new["genre"] == "тестовая рубрика"
    assert new["text"] == "Первая строфа.\n\nВторая строфа."
    assert "url" not in new
    # файл остаётся валидным JS/JSON и коммит создан
    assert bot.store.poems_path.read_text(encoding="utf-8").startswith("window.POEMS = ")
    import subprocess
    log = subprocess.run(["git", "-C", str(tmp), "log", "--oneline", "-1"],
                         capture_output=True, text=True).stdout
    assert "Тестовый стих" in log, log
    print("add: OK —", log.strip())


async def test_edit(tmp):
    bot.store = bot.Store(tmp)
    bot.publisher = bot.Publisher(tmp, auto_push=False)
    poems = bot.store.load_poems()
    target = poems[5]["id"]

    c = ctx()
    u = FakeUpdate(query=FakeQuery("ep:" + target, FakeMessage()))
    assert await bot.edit_pick(u, c) == bot.E_FIELD
    u = FakeUpdate(query=FakeQuery("ef:title", FakeMessage()))
    assert await bot.edit_field_cb(u, c) == bot.E_VALUE
    u = FakeUpdate("Обновлённое название")
    assert await bot.edit_value(u, c) == bot.E_FIELD

    _, poem = bot.Store(tmp).find(bot.Store(tmp).load_poems(), target)
    assert poem["title"] == "Обновлённое название"

    # замена текста несколькими сообщениями
    c = ctx(poem_id=target, field="text")
    u = FakeUpdate("Новый текст, часть 1.")
    assert await bot.edit_value(u, c) == bot.E_VALUE
    u = FakeUpdate()
    assert await bot.edit_value_done(u, c) == bot.E_FIELD
    _, poem = bot.Store(tmp).find(bot.Store(tmp).load_poems(), target)
    assert poem["text"] == "Новый текст, часть 1."
    print("edit: OK")


async def test_edit_bad_date(tmp):
    bot.store = bot.Store(tmp)
    poems = bot.store.load_poems()
    target = poems[0]["id"]
    c = ctx(poem_id=target, field="date")
    u = FakeUpdate("когда-нибудь")
    assert await bot.edit_value(u, c) == bot.E_VALUE
    _, poem = bot.Store(tmp).find(bot.Store(tmp).load_poems(), target)
    assert poem["date"] == poems[0]["date"]  # не изменился
    print("edit bad date: OK")


async def test_delete(tmp):
    bot.store = bot.Store(tmp)
    bot.publisher = bot.Publisher(tmp, auto_push=False)
    poems = bot.store.load_poems()
    target = poems[3]["id"]
    count = len(poems)

    c = ctx()
    u = FakeUpdate(query=FakeQuery("dp:" + target, FakeMessage()))
    assert await bot.delete_pick(u, c) == bot.D_CONFIRM
    u = FakeUpdate(query=FakeQuery("dc:yes", FakeMessage()))
    assert await bot.delete_confirm(u, c) == END
    assert len(bot.Store(tmp).load_poems()) == count - 1
    print("delete: OK")


async def test_author(tmp):
    bot.store = bot.Store(tmp)
    bot.publisher = bot.Publisher(tmp, auto_push=False)
    c = ctx(author_field="bio")
    u = FakeUpdate("Новый текст о себе.")
    assert await bot.author_value(u, c) == END
    assert bot.Store(tmp).load_author()["bio"] == "Новый текст о себе."

    c = ctx(author_field="link:vk")
    u = FakeUpdate("https://vk.ru/test")
    await bot.author_value(u, c)
    assert bot.Store(tmp).load_author()["links"]["vk"] == "https://vk.ru/test"
    # author.js остаётся валидным JS
    text = (tmp / "data" / "author.js").read_text(encoding="utf-8")
    assert text.startswith("window.AUTHOR = {") and text.rstrip().endswith("};")
    # регрессия: нажатие кнопок «Имя»/«О себе»/ссылки не должно падать (IndexError)
    for data in ("af:name", "af:bio", "af:link:vk"):
        c = ctx()
        u = FakeUpdate(query=FakeQuery(data, FakeMessage()))
        assert await bot.author_field_cb(u, c) == bot.A_VALUE
    print("author: OK")


async def main():
    bot.ADMINS = {1}  # тестовый администратор
    for name, fn in [("add", test_add), ("edit", test_edit), ("bad date", test_edit_bad_date),
                     ("delete", test_delete), ("author", test_author)]:
        tmp = Path(tempfile.mkdtemp(prefix="poetry_bot_test_"))
        try:
            # полная копия репозитория без .git, затем своя история для коммитов
            shutil.copytree(REPO, tmp / "repo", ignore=shutil.ignore_patterns(".git", "__pycache__", "bot"))
            (tmp / "repo" / "data").mkdir(exist_ok=True)
            shutil.copy(REPO / "data" / "poems.js", tmp / "repo" / "data" / "poems.js")
            shutil.copy(REPO / "data" / "author.js", tmp / "repo" / "data" / "author.js")
            import subprocess
            subprocess.run(["git", "init", "-q", str(tmp / "repo")], check=True)
            subprocess.run(["git", "-C", str(tmp / "repo"), "add", "--", "data"], check=True)
            commit_env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                          "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t",
                          "PATH": "/usr/bin:/bin"}
            subprocess.run(["git", "-C", str(tmp / "repo"), "commit", "-q", "-m", "init"], check=True,
                           env=commit_env)
            await fn(tmp / "repo")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    print("\nВсе смоук-тесты прошли.")


if __name__ == "__main__":
    asyncio.run(main())
