/* Аудиозаписи чтений. VK не даёт встроить свой аудиоплеер на сторонние
   сайты, поэтому mp3 лежат в репозитории прода (assets/audio) и играют
   родным плеером сайта — и песочница, и прод ссылаются на них по
   абсолютному адресу yakovshakhov.com.
   Поля: reader — кто читает (строка-подзаголовок в карточке); date и
   desc (описание) заполняются вручную; vk — ссылка на запись во
   ВКонтакте (если пусто, ссылка в карточке не показывается);
   poem — id стихотворения (связь по названию установлена вручную).
   Сортировка списка — по дате, свежие сверху (как у стихов). */
window.AUDIOS = [
  {
    id: "u-izborskoy-kreposti",
    title: "«У Изборской крепости…»",
    reader: "читает автор",
    date: "22.06.2015",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.com/assets/audio/u-izborskoy-kreposti.mp3",
    poem: "2015_06_22_4193"
  },
  {
    id: "peterburgskaya-latina",
    title: "«Петербургская латина»",
    reader: "читает автор",
    date: "21.04.2015",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.com/assets/audio/peterburgskaya-latina.mp3",
    poem: "2015_04_21_3297"
  },
  {
    id: "ldinki",
    title: "«Льдинки»",
    reader: "читает автор",
    date: "18.03.2015",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.com/assets/audio/ldinki.mp3",
    poem: "2015_03_18_4499"
  },
  {
    id: "elchik",
    title: "«Ельчик»",
    reader: "читает автор",
    date: "06.11.2014",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.com/assets/audio/elchik.mp3",
    poem: "2014_11_06_4728"
  },
  {
    id: "russkiy-tsar",
    title: "«Русский царь»",
    reader: "читает автор",
    date: "04.03.2014",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.com/assets/audio/russkiy-tsar.mp3",
    poem: "2014_03_04_11055"
  },
  {
    id: "ot-primy-do-ryby",
    title: "«От Примы до Рыбы…»",
    reader: "читает автор",
    date: "18.02.2014",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.com/assets/audio/ot-primy-do-ryby.mp3",
    poem: "2014_02_18_1197"
  },
  {
    id: "kazachya-zarisovka",
    title: "«Казачья зарисовка»",
    reader: "читает автор",
    date: "12.03.2011",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.com/assets/audio/kazachya-zarisovka.mp3",
    poem: "2011_03_12_3760"
  },
  {
    id: "muha",
    title: "«Муха»",
    reader: "читает автор",
    date: "20.11.2010",
    desc: "",
    vk: "",
    src: "https://yakovshakhov.com/assets/audio/muha.mp3",
    poem: "2010_11_20_8243"
  }
];
