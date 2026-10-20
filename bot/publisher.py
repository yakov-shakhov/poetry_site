"""Публикация изменений: git commit (+ push) в репозитории сайта.

После сохранения data/poems.js или data/author.js бот коммитит изменения
и (если включён AUTO_PUSH) отправляет их на GitHub — GitHub Pages
обновляет сайт автоматически через 1–2 минуты.
"""

import os
import subprocess
from pathlib import Path

DATA_FILES = ["data/poems.js", "data/author.js"]


class PublishError(RuntimeError):
    pass


class Publisher:
    def __init__(self, repo_dir, auto_push=True):
        self.repo_dir = Path(repo_dir)
        self.auto_push = auto_push

    def _git(self, *args, env=None):
        result = subprocess.run(
            ["git", "-C", str(self.repo_dir), *args],
            capture_output=True, text=True, env=env,
        )
        if result.returncode != 0:
            raise PublishError(
                f"git {' '.join(args)}:\n{result.stderr.strip() or result.stdout.strip()}"
            )
        return result.stdout.strip()

    def publish(self, message):
        """Коммитит изменения файлов данных; возвращает человекочитаемый статус."""
        # Имя/почта коммитера — из переменных окружения, иначе подставим значения
        # по умолчанию, чтобы коммит не падал на машине без настроенного git.
        env = dict(
            GIT_AUTHOR_NAME=os.environ.get("BOT_GIT_NAME", "poetry-site-bot"),
            GIT_AUTHOR_EMAIL=os.environ.get("BOT_GIT_EMAIL", "bot@poetry-site.local"),
            GIT_COMMITTER_NAME=os.environ.get("BOT_GIT_NAME", "poetry-site-bot"),
            GIT_COMMITTER_EMAIL=os.environ.get("BOT_GIT_EMAIL", "bot@poetry-site.local"),
        )
        try:
            self._git("add", "--", *DATA_FILES)
            self._git("commit", "-m", message, "--allow-empty-message", env=env)
        except PublishError as exc:
            if "nothing to commit" in str(exc):
                return "ℹ️ Изменений для публикации нет."
            raise

        if not self.auto_push:
            return "💾 Изменения сохранены и закоммичены локально (автопуш отключён)."

        try:
            self._git("pull", "--rebase")
            self._git("push")
        except PublishError as exc:
            return (
                "💾 Изменения закоммичены локально, но push не удался:\n"
                f"{exc}\nВыполните «git push» вручную."
            )
        return "✅ Изменения опубликованы — сайт обновится через 1–2 минуты."
