"""Работа с файлами данных сайта: data/poems.js и data/author.js.

Оба файла — JavaScript, но poems.js представляет собой чистый JSON
с префиксом «window.POEMS = » и суффиксом «;», поэтому читается и
пишется стандартным модулем json. author.js содержит именованные без
кавычек ключи, для него — простая конвертация в JSON при чтении.
"""

import json
import re
from datetime import datetime
from pathlib import Path


class Store:
    def __init__(self, repo_dir):
        self.repo_dir = Path(repo_dir)
        self.poems_path = self.repo_dir / "data" / "poems.js"
        self.author_path = self.repo_dir / "data" / "author.js"

    # ------------------------------------------------------------------ poems
    def load_poems(self):
        raw = self.poems_path.read_text(encoding="utf-8")
        start = raw.index("[")
        end = raw.rindex("]") + 1
        return json.loads(raw[start:end])

    def save_poems(self, poems):
        text = "window.POEMS = " + json.dumps(poems, ensure_ascii=False, indent=1) + ";\n"
        self.poems_path.write_text(text, encoding="utf-8")

    # ----------------------------------------------------------------- author
    def load_author(self):
        raw = self.author_path.read_text(encoding="utf-8")
        body = raw[raw.index("{"):raw.rindex("}") + 1]
        # Ключи без кавычек (name:, stihi:…) -> кавычки, чтобы получилось JSON.
        body = re.sub(r"(?m)^(\s*)([A-Za-z_]\w*)(\s*):", r'\1"\2"\3:', body)
        return json.loads(body)

    def save_author(self, author):
        def q(value):
            return json.dumps(value, ensure_ascii=False)

        lines = ["window.AUTHOR = {"]
        lines.append(f"  name: {q(author.get('name', ''))},")
        lines.append(f"  photo: {q(author.get('photo', 'assets/photo.jpg'))},")
        lines.append(f"  bio: {q(author.get('bio', ''))},")
        links = author.get("links", {})
        lines.append("  links: {")
        link_items = list(links.items())
        for i, (key, value) in enumerate(link_items):
            comma = "," if i < len(link_items) - 1 else ""
            lines.append(f"    {key}: {q(value)}{comma}")
        lines.append("  }")
        lines.append("};")
        self.author_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def genres(poems):
        seen = []
        for poem in poems:
            genre = poem.get("genre", "").strip()
            if genre and genre not in seen:
                seen.append(genre)
        return sorted(seen, key=str.lower)

    @staticmethod
    def make_poem_id(poems, when=None):
        when = when or datetime.now()
        base = when.strftime("%Y_%m_%d_%H%M")
        poem_id, n = base, 1
        while any(p.get("id") == poem_id for p in poems):
            n += 1
            poem_id = f"{base}_{n}"
        return poem_id

    @staticmethod
    def find(poems, poem_id):
        for i, poem in enumerate(poems):
            if poem.get("id") == poem_id:
                return i, poem
        return None, None

    @staticmethod
    def search(poems, query):
        query = query.strip().lower()
        return [
            p for p in poems
            if query in p.get("title", "").lower() or query in p.get("text", "").lower()
        ]
