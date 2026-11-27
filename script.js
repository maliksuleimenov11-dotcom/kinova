"use strict";

const form = document.querySelector("#search-form");
const input = document.querySelector("#query");
const button = form.querySelector("button");
const error = document.querySelector("#input-error");
const status = document.querySelector("#search-status");
const results = document.querySelector("#results");
const count = document.querySelector("#result-count");
let searching = false;
let catalog = new Map();
const storageKey = "kinova.catalog";
let catalogLocked = false;
const storageStatus = document.querySelector("#storage-status");
const exportButton = document.querySelector("#catalog-export");
const exportStatus = document.querySelector("#catalog-export-status");
const catalogLists = [
  { status: "planned", id: "watchlist", title: "Хочу посмотреть", action: "Уже посмотрел", target: "watched" },
  { status: "watched", id: "watched", title: "Просмотрено", action: "Хочу пересмотреть", target: "planned" },
];
const catalogStatus = document.querySelector("#catalog-status");
let searchFilms = [];
let ratingEditor = null;
const catalogSearchForm = document.querySelector("#catalog-search-form");
const catalogQueryInput = document.querySelector("#catalog-query");
const catalogSearchError = document.querySelector("#catalog-search-error");
const catalogSearchStatus = document.querySelector("#catalog-search-status");
let catalogQuery = "";

function applyCatalogSearch() {
  const query = catalogQuery.toLocaleLowerCase("ru");
  for (const list of catalogLists) {
    const cards = document.querySelector(`#${list.id}`).children;
    let visible = 0;
    for (const card of cards) {
      const film = catalog.get(Number(card.dataset.filmId));
      const title = film.nameRu || film.nameOriginal || "Без названия";
      card.hidden = !title.toLocaleLowerCase("ru").includes(query);
      if (!card.hidden) visible++;
    }
    document.querySelector(`#${list.id}-count`).textContent = query ? `Найдено: ${visible} из ${cards.length}` : String(cards.length);
    const empty = document.querySelector(`#${list.id}-empty`);
    empty.hidden = visible > 0;
    empty.textContent = cards.length > 0
      ? "В этом списке ничего не найдено. Измените запрос или нажмите „Показать все“"
      : "Пока нет фильмов. Добавьте фильм из поиска";
  }
}

function setCatalogQuery(value) {
  const query = value.trim();
  if (query.length > 200) {
    catalogSearchError.textContent = "Название должно быть не длиннее 200 символов";
    catalogQueryInput.setAttribute("aria-invalid", "true");
    catalogQueryInput.focus();
    return;
  }
  catalogSearchError.textContent = "";
  catalogQueryInput.removeAttribute("aria-invalid");
  catalogQuery = query;
  applyCatalogSearch();
  catalogSearchStatus.textContent = query ? `Поиск в каталоге: «${query}»` : "Показаны все сохранённые фильмы";
}

catalogSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setCatalogQuery(catalogQueryInput.value);
});
document.querySelector("#catalog-search-reset").addEventListener("click", () => {
  catalogQueryInput.value = "";
  setCatalogQuery("");
  catalogQueryInput.focus();
});

function normalizeFilm(film) {
  if (!film || !Number.isSafeInteger(film.id) || film.id <= 0
    || !["planned", "watched"].includes(film.status)) throw new Error("Invalid film");
  const text = (value) => {
    if (value == null) return null;
    if (typeof value !== "string") throw new Error("Invalid text");
    return value.trim() || null;
  };
  const year = film.year ?? null;
  const rating = film.rating ?? null;
  const personalRating = film.personalRating ?? null;
  const review = film.review ?? "";
  if (personalRating !== null && (!Number.isInteger(personalRating) || personalRating < 1 || personalRating > 10)) throw new Error("Invalid personal rating");
  if (typeof review !== "string" || Array.from(review.trim()).length > 500) throw new Error("Invalid review");
  if (year !== null && !Number.isInteger(year)) throw new Error("Invalid year");
  if (rating !== null && (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 10)) throw new Error("Invalid rating");
  let poster = text(film.poster);
  if (poster !== null) {
    const url = new URL(poster);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid poster");
    poster = url.href;
  }
  return { id: film.id, nameRu: text(film.nameRu), nameOriginal: text(film.nameOriginal), year, rating, poster, status: film.status, personalRating, review: review.trim() };
}

function restoreCatalog() {
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    catalogLocked = true;
    storageStatus.textContent = "Не удалось прочитать каталог. Проверьте доступ к хранилищу и перезагрузите страницу";
    return;
  }
  if (raw === null) return;
  try {
    const data = JSON.parse(raw);
    if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.films)) throw new Error("Invalid catalog");
    const restored = new Map();
    let duplicates = false;
    for (const value of data.films) {
      const film = normalizeFilm(data.version === 1 && value ? { ...value, personalRating: null, review: "" } : value);
      if (restored.has(film.id)) duplicates = true;
      else restored.set(film.id, film);
    }
    catalog = restored;
    if (duplicates) storageStatus.textContent = "Повторяющиеся фильмы объединены";
  } catch {
    catalogLocked = true;
    storageStatus.textContent = "Не удалось восстановить каталог. Сохранённые данные оставлены без изменений";
  }
}

function saveCatalog(next) {
  if (catalogLocked) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 2, films: Array.from(next.values()).map(normalizeFilm) }));
  } catch {
    catalogStatus.textContent = "";
    storageStatus.textContent = "Не удалось сохранить изменения. Проверьте доступ к хранилищу браузера и попробуйте снова";
    return false;
  }
  catalog = next;
  storageStatus.textContent = "";
  return true;
}

function exportCatalog() {
  if (catalogLocked) return;
  let objectUrl;
  let link;
  try {
    // Экспортируем сохранённые записи, а не видимые карточки или черновик формы.
    const data = { version: 2, films: Array.from(catalog.values()).map(normalizeFilm) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    objectUrl = URL.createObjectURL(blob);
    const date = new Date();
    const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    link = document.createElement("a");
    link.href = objectUrl;
    link.download = `kinova-catalog-${day}.json`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    exportStatus.textContent = "Файл подготовлен и передан браузеру для скачивания. Вы можете сохранить его или отменить скачивание.";
  } catch {
    exportStatus.textContent = "Не удалось подготовить файл. Попробуйте ещё раз";
  } finally {
    link?.remove();
    // Даём браузеру начать загрузку, затем освобождаем временный адрес файла.
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

exportButton.addEventListener("click", exportCatalog);

function renderCatalog(focusId) {
  const editorFocus = ratingEditor?.form.contains?.(document.activeElement) ? document.activeElement : null;
  let focusTarget;
  for (const list of catalogLists) {
    const films = Array.from(catalog.values()).filter((film) => film.status === list.status).reverse();
    document.querySelector(`#${list.id}`).replaceChildren(...films.map((film) => {
      const card = createCard(film);
      const move = document.createElement("button");
      move.type = "button";
      move.className = "film-action";
      move.textContent = list.action;
      move.disabled = catalogLocked || ratingEditor?.id === film.id;
      move.addEventListener("click", () => moveFilm(film.id, list.target));
      card.append(move);
      const personal = document.createElement("p");
      personal.className = "film-status";
      personal.textContent = film.personalRating == null ? "Моя оценка: не указана" : `Моя оценка: ${film.personalRating} из 10`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "film-action";
      edit.textContent = "Оценка и отзыв";
      edit.disabled = catalogLocked;
      edit.addEventListener("click", () => openRatingEditor(film.id));
      card.append(personal, edit);
      if (ratingEditor?.id === film.id) card.append(ratingEditor.form);
      if (film.review) {
        const review = document.createElement("p");
        review.className = "film-review";
        review.textContent = `Мой отзыв: ${film.review}`;
        card.append(review);
      }
      if (film.id === focusId) focusTarget = move;
      return card;
    }));
    document.querySelector(`#${list.id}-count`).textContent = String(films.length);
    document.querySelector(`#${list.id}-empty`).hidden = films.length > 0;
  }
  applyCatalogSearch();
  focusTarget?.focus();
  if (!focusTarget) editorFocus?.focus();
}

function closeRatingEditor(id) {
  ratingEditor = null;
  renderCatalog();
  const list = catalogLists.find((item) => item.status === catalog.get(id)?.status);
  if (!list) return;
  const cards = document.querySelector(`#${list.id}`).children;
  Array.from(cards).find((card) => String(card.dataset.filmId) === String(id))?.children[5]?.focus();
}

function openRatingEditor(id) {
  if (catalogLocked || !catalog.has(id)) return;
  if (ratingEditor?.id === id) {
    ratingEditor.select.focus();
    return;
  }
  const film = catalog.get(id);
  const editorForm = document.createElement("form");
  editorForm.className = "rating-form";
  editorForm.noValidate = true;
  const note = document.createElement("p");
  note.className = "demo-note";
  note.textContent = "Открытие формы другого фильма отменит несохранённый ввод.";
  const label = document.createElement("label");
  label.htmlFor = `personal-rating-${id}`;
  label.textContent = "Моя оценка";
  const select = document.createElement("select");
  select.id = label.htmlFor;
  for (let number = 0; number <= 10; number++) {
    const option = document.createElement("option");
    option.value = number ? String(number) : "";
    option.textContent = number ? String(number) : "Не указана";
    select.append(option);
  }
  select.value = film.personalRating == null ? "" : String(film.personalRating);
  const validation = document.createElement("p");
  validation.id = `rating-error-${id}`;
  validation.className = "error";
  validation.setAttribute("role", "alert");
  select.setAttribute("aria-describedby", validation.id);
  const reviewLabel = document.createElement("label");
  reviewLabel.htmlFor = `review-${id}`;
  reviewLabel.textContent = "Отзыв";
  const reviewInput = document.createElement("textarea");
  reviewInput.id = reviewLabel.htmlFor;
  reviewInput.rows = 5;
  reviewInput.value = film.review || "";
  const reviewCount = document.createElement("p");
  reviewCount.id = `review-count-${id}`;
  reviewCount.className = "demo-note";
  const reviewError = document.createElement("p");
  reviewError.id = `review-error-${id}`;
  reviewError.className = "error";
  reviewError.setAttribute("role", "alert");
  reviewInput.setAttribute("aria-describedby", `${reviewCount.id} ${reviewError.id}`);
  function updateReviewCount() {
    reviewCount.textContent = `${Array.from(reviewInput.value.trim()).length} / 500`;
    reviewError.textContent = "";
    reviewInput.removeAttribute("aria-invalid");
  }
  reviewInput.addEventListener("input", updateReviewCount);
  updateReviewCount();
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Сохранить";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Отмена";
  cancel.addEventListener("click", () => closeRatingEditor(id));
  editorForm.append(note, label, select, validation, reviewLabel, reviewInput, reviewCount, reviewError, save, cancel);
  editorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (catalogLocked || ratingEditor?.form !== editorForm) return;
    if (!/^(?:[1-9]|10)?$/.test(select.value)) {
      validation.textContent = "Выберите целую оценку от 1 до 10 или „Не указана“";
      select.setAttribute("aria-invalid", "true");
      select.focus();
      return;
    }
    validation.textContent = "";
    select.removeAttribute("aria-invalid");
    const review = reviewInput.value.trim();
    if (Array.from(review).length > 500) {
      reviewError.textContent = "Отзыв должен быть не длиннее 500 символов";
      reviewInput.setAttribute("aria-invalid", "true");
      reviewInput.focus();
      return;
    }
    reviewError.textContent = "";
    reviewInput.removeAttribute("aria-invalid");
    const next = new Map(catalog);
    next.set(id, { ...catalog.get(id), personalRating: select.value === "" ? null : Number(select.value), review });
    if (!saveCatalog(next)) return;
    closeRatingEditor(id);
    catalogStatus.textContent = "Оценка и отзыв сохранены";
  });
  ratingEditor = { id, form: editorForm, select };
  renderCatalog();
  select.focus();
}

function renderSearch(focusId) {
  let focusTarget;
  results.replaceChildren(...searchFilms.map((film) => {
    const card = createCard(film);
    if (catalog.has(film.id)) {
      const label = document.createElement("p");
      label.className = "film-status";
      label.textContent = `В списке „${catalogLists.find((list) => list.status === catalog.get(film.id).status).title}“`;
      label.tabIndex = -1;
      card.append(label);
      if (film.id === focusId && !focusTarget) focusTarget = label;
    } else if (Number.isSafeInteger(film.id) && film.id > 0) {
      for (const list of catalogLists) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "film-action";
        add.textContent = list.title;
        add.disabled = catalogLocked;
        add.addEventListener("click", () => addToCatalog(film, list.status));
        card.append(add);
      }
    }
    return card;
  }));
  focusTarget?.focus();
}

function addToCatalog(film, target) {
  if (catalogLocked) return;
  if (!Number.isSafeInteger(film.id) || film.id <= 0 || catalog.has(film.id)) return;
  const list = catalogLists.find((item) => item.status === target);
  if (!list) return;
  const next = new Map(catalog);
  next.set(film.id, { ...film, status: target });
  if (!saveCatalog(next)) return;
  renderCatalog();
  renderSearch(film.id);
  catalogStatus.textContent = `Фильм добавлен в „${list.title}“`;
}

function moveFilm(id, target) {
  if (catalogLocked || ratingEditor?.id === id) return;
  const film = catalog.get(id);
  const list = catalogLists.find((item) => item.status === target);
  if (!film || !list || film.status === target) return;
  // Повторная вставка ставит перенесённую запись в начало нового списка.
  const next = new Map(catalog);
  next.delete(id);
  next.set(id, { ...film, status: target });
  if (!saveCatalog(next)) return;
  renderSearch();
  renderCatalog(id);
  catalogStatus.textContent = `Фильм перенесён в „${list.title}“`;
}

function createCard(film) {
  const card = document.createElement("article");
  card.className = "film-card";
  card.dataset.filmId = film.id;
  const poster = document.createElement("div");
  poster.className = "poster";
  poster.textContent = "Нет постера";
  const title = film.nameRu || film.nameOriginal || "Без названия";
  if (film.poster) {
    const image = document.createElement("img");
    image.alt = `Постер: ${title}`;
    image.addEventListener("error", () => { poster.textContent = "Нет постера"; }, { once: true });
    image.src = film.poster;
    poster.replaceChildren(image);
  }
  const heading = document.createElement("h3");
  heading.textContent = title;
  const meta = document.createElement("p");
  meta.className = "film-meta";
  const year = document.createElement("span");
  year.textContent = film.year ?? "Год не указан";
  const rating = document.createElement("span");
  rating.textContent = film.rating == null ? "Нет рейтинга" : `Рейтинг API: ${film.rating}`;
  meta.append(year, rating);
  card.append(poster, heading, meta);
  return card;
}

restoreCatalog();
exportButton.disabled = catalogLocked;
renderCatalog();

input.addEventListener("input", () => {
  error.textContent = "";
  input.removeAttribute("aria-invalid");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (searching) return;
  const query = input.value.trim();
  if (!query || query.length > 200) {
    error.textContent = query ? "Название должно быть не длиннее 200 символов" : "Введите название фильма";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  error.textContent = "";
  input.removeAttribute("aria-invalid");
  searching = true;
  button.disabled = true;
  results.setAttribute("aria-busy", "true");
  results.replaceChildren();
  searchFilms = [];
  count.textContent = "";
  status.textContent = "Ищем фильмы…";
  try {
    if (location.protocol === "file:") {
      status.textContent = "Для поиска откройте сайт через http://localhost:3000. Инструкция запуска — в README.";
      return;
    }
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(12000),
    });
    // Vercel Firewall может вернуть 429 с HTML или обычным текстом вместо JSON.
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      if (response.status !== 429) throw parseError;
    }
    if (response.status === 429 && data?.error !== "API_LIMIT") {
      status.textContent = "Слишком много запросов к поиску. Подождите немного и попробуйте снова";
      return;
    }
    if (!response.ok) {
      const messages = {
        API_LIMIT: "Лимит API исчерпан. Попробуйте позже",
        UNAVAILABLE: "Поиск временно недоступен",
        INVALID_QUERY: "Введите название фильма длиной до 200 символов",
      };
      status.textContent = messages[data.error] || "Не удалось выполнить поиск. Проверьте соединение и попробуйте ещё раз";
      return;
    }
    if (!Array.isArray(data.films)) throw new Error("Invalid response");
    searchFilms = data.films;
    renderSearch();
    status.textContent = data.films.length ? "" : "Ничего не найдено. Попробуйте другое название";
    count.textContent = `На этой странице: ${data.films.length}`;
  } catch {
    status.textContent = "Не удалось выполнить поиск. Проверьте соединение и попробуйте ещё раз";
  } finally {
    results.setAttribute("aria-busy", "false");
    button.disabled = false;
    searching = false;
  }
});
