/* Проверка data-файлов перед пушем: каждый должен распарситься как JS
   и положить свой массив в window. Ловит потерянные кавычки/запятые после
   ручного редактирования — ошибка в одном файле ломает весь сайт.
   Запуск: node scripts/check_data.js (вызывается из pre-push хука). */
"use strict";
const path = require("path");

// data-скрипты пишут в window, как в браузере — даём им заглушку
global.window = {};

const files = ["poems.js", "audio.js", "video.js", "author.js"];
let failed = false;

for (const f of files) {
  try {
    require(path.join(__dirname, "..", "data", f));
    console.log("OK   " + f);
  } catch (e) {
    failed = true;
    console.log("FAIL " + f + " → " + e.message);
  }
}

if (failed) {
  console.log("\nПуш отменён: исправь ошибки в data/ выше.");
  process.exit(1);
}
