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
const catalogLists = [
  { status: "planned", id: "watchlist", title: "Хочу посмотреть", action: "Уже посмотрел", target: "watched" },
  { status: "watched", id: "watched", title: "Просмотрено", action: "Хочу пересмотреть", target: "planned" },
];
const catalogStatus = document.querySelector("#catalog-status");
let searchFilms = [];

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
  if (year !== null && !Number.isInteger(year)) throw new Error("Invalid year");
  if (rating !== null && (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 10)) throw new Error("Invalid rating");
  let poster = text(film.poster);
  if (poster !== null) {
    const url = new URL(poster);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid poster");
    poster = url.href;
  }
  return { id: film.id, nameRu: text(film.nameRu), nameOriginal: text(film.nameOriginal), year, rating, poster, status: film.status };
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
    if (!data || data.version !== 1 || !Array.isArray(data.films)) throw new Error("Invalid catalog");
    const restored = new Map();
    let duplicates = false;
    for (const value of data.films) {
      const film = normalizeFilm(value);
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
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, films: Array.from(next.values()).map(normalizeFilm) }));
  } catch {
    catalogStatus.textContent = "";
    storageStatus.textContent = "Не удалось сохранить изменения. Проверьте доступ к хранилищу браузера и попробуйте снова";
    return false;
  }
  catalog = next;
  storageStatus.textContent = "";
  return true;
}

function renderCatalog(focusId) {
  let focusTarget;
  for (const list of catalogLists) {
    const films = Array.from(catalog.values()).filter((film) => film.status === list.status).reverse();
    document.querySelector(`#${list.id}`).replaceChildren(...films.map((film) => {
      const card = createCard(film);
      const move = document.createElement("button");
      move.type = "button";
      move.className = "film-action";
      move.textContent = list.action;
      move.disabled = catalogLocked;
      move.addEventListener("click", () => moveFilm(film.id, list.target));
      card.append(move);
      if (film.id === focusId) focusTarget = move;
      return card;
    }));
    document.querySelector(`#${list.id}-count`).textContent = String(films.length);
    document.querySelector(`#${list.id}-empty`).hidden = films.length > 0;
  }
  focusTarget?.focus();
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
  if (catalogLocked) return;
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
    const data = await response.json();
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
