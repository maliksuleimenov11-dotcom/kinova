"use strict";

const form = document.querySelector("#search-form");
const input = document.querySelector("#query");
const button = form.querySelector("button");
const error = document.querySelector("#input-error");
const status = document.querySelector("#search-status");
const results = document.querySelector("#results");
const count = document.querySelector("#result-count");
let searching = false;

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
    results.replaceChildren(...data.films.map(createCard));
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
