/* Аудиозаписи чтений. VK не даёт встроить свой аудиоплеер на сторонние
   сайты, поэтому mp3 лежат в репозитории прода (assets/audio) и играют
   родным плеером сайта — и песочница, и прод ссылаются на них по
   абсолютному адресу yakovshakhov.ru.
   Поля: reader — кто читает (строка-подзаголовок в карточке); date и
   desc (описание) заполняются вручную; vk — ссылка на запись во
   ВКонтакте (если пусто, ссылка в карточке не показывается);
   poem — id стихотворения (связь по названию установлена вручную).
   Сортировка списка — по дате, свежие сверху (как у стихов). */
window.AUDIOS = [
  {
    id: "vershina-snezhnaya",
    title: "«Вершина снежная»",
    reader: "читает автор",
    date: "03.11.2017",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/vershina-snezhnaya.mp3",
    poem: "2017_11_03_4224"
  },
  {
    id: "ieroglif-obnovlenya",
    title: "«Иероглиф обновленья»",
    reader: "читает автор",
    date: "29.11.2016",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/ieroglif-obnovlenya.mp3",
    poem: "2016_11_29_7394"
  },
  {
    id: "tsarstvuy",
    title: "«Царствуй»",
    reader: "читает автор",
    date: "21.11.2016",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/tsarstvuy.mp3",
    poem: "2016_11_21_3562"
  },
  {
    id: "itog-dorog",
    title: "«Итог дорог»",
    reader: "читает автор",
    date: "01.11.2016",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/itog-dorog.mp3",
    poem: "2016_11_01_3078"
  },
  {
    id: "ya-s-dona-ona-s-volgi",
    title: "«Я - с Дона, она - с Волги»",
    reader: "читает автор",
    date: "17.09.2016",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/ya-s-dona-ona-s-volgi.mp3",
    poem: "2016_09_17_5548"
  },
  {
    id: "odinochestvo",
    title: "«Одиночество»",
    reader: "читает автор",
    date: "18.08.2016",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/odinochestvo.mp3",
    poem: "2016_08_18_5482"
  },
  {
    id: "ta-kotoraya-rodila",
    title: "«Та, которая родила...»",
    reader: "читает автор",
    date: "24.03.2015",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/ta-kotoraya-rodila.mp3",
    poem: "2015_03_24_783"
  },
  {
    id: "u-izborskoy-kreposti",
    title: "«У Изборской крепости…»",
    reader: "читает автор",
    date: "22.06.2015",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/u-izborskoy-kreposti.mp3",
    poem: "2015_06_22_4193"
  },
  {
    id: "peterburgskaya-latina",
    title: "«Петербургская латина»",
    reader: "читает автор",
    date: "21.04.2015",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/peterburgskaya-latina.mp3",
    poem: "2015_04_21_3297"
  },
  {
    id: "ldinki",
    title: "«Льдинки»",
    reader: "читает автор",
    date: "18.03.2015",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/ldinki.mp3",
    poem: "2015_03_18_4499"
  },
  {
    id: "elchik",
    title: "«Ельчик»",
    reader: "читает автор",
    date: "06.11.2014",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/elchik.mp3",
    poem: "2014_11_06_4728"
  },
  {
    id: "russkiy-tsar",
    title: "«Русский царь»",
    reader: "читает автор",
    date: "04.03.2014",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/russkiy-tsar.mp3",
    poem: "2014_03_04_11055"
  },
  {
    id: "ot-primy-do-ryby",
    title: "«От Примы до Рыбы…»",
    reader: "читает автор",
    date: "18.02.2014",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/ot-primy-do-ryby.mp3",
    poem: "2014_02_18_1197"
  },
  {
    id: "kazachya-zarisovka",
    title: "«Казачья зарисовка»",
    reader: "читает автор",
    date: "12.03.2011",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/kazachya-zarisovka.mp3",
    poem: "2011_03_12_3760"
  },
  {
    id: "muha",
    title: "«Муха»",
    reader: "читает автор",
    date: "20.11.2010",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.ru/assets/audio/muha.mp3",
    poem: "2010_11_20_8243"
  }
];
