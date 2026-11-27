"use strict";

// Общедоступные данные фильмов. Личный каталог здесь не читается.
module.exports = async function discover(req, res) {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", status === 200 ? "public, max-age=0, must-revalidate" : "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", status === 200 ? "public, s-maxage=3600" : "no-store");
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(405, { error: "METHOD_NOT_ALLOWED" });
  }
  const params = new URL(req.url, "http://localhost").searchParams;
  const kind = params.get("kind");
  const keys = Array.from(params.keys());
  const popular = kind === "popular";
  const shifted = new Date(Date.now() + 5 * 3600000);
  const year = shifted.getUTCFullYear();
  const monthIndex = shifted.getUTCMonth();
  const allowed = [0, 1].map((offset) => {
    const index = monthIndex - offset;
    return `${index < 0 ? year - 1 : year}-${String((index + 12) % 12 + 1).padStart(2, "0")}`;
  });
  const month = params.get("month");
  if (params.getAll("kind").length !== 1
    || (popular ? keys.length !== 1 : kind !== "premieres" || keys.length !== 2 || params.getAll("month").length !== 1 || !allowed.includes(month))) {
    return send(400, { error: "INVALID_SELECTION" });
  }
  const key = process.env.KINOPOISK_API_KEY?.trim();
  if (!key) return send(503, { error: "UNAVAILABLE" });
  const url = new URL(popular ? "https://kinopoiskapiunofficial.tech/api/v2.2/films/collections" : "https://kinopoiskapiunofficial.tech/api/v2.2/films/premieres");
  if (popular) {
    url.searchParams.set("type", "TOP_POPULAR_MOVIES");
    url.searchParams.set("page", "1");
  } else {
    const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    url.searchParams.set("year", month.slice(0, 4));
    url.searchParams.set("month", months[Number(month.slice(5)) - 1]);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { headers: { "X-API-KEY": key, Accept: "application/json" }, signal: controller.signal, redirect: "error" });
    if ([402, 429].includes(response.status)) return send(429, { error: "API_LIMIT" });
    if ([401, 403].includes(response.status)) return send(503, { error: "UNAVAILABLE" });
    if (!response.ok) return send(502, { error: "UPSTREAM_ERROR" });
    const data = await response.json();
    if (!Array.isArray(data.items)) return send(502, { error: "UPSTREAM_ERROR" });
    const text = (value) => typeof value === "string" ? value.trim() || null : null;
    const poster = (value) => {
      try { const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null; }
      catch { return null; }
    };
    const premiereDate = (value) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
    };
    const films = [];
    const seen = new Set();
    for (const film of data.items) {
      if (!film || !Number.isSafeInteger(film.kinopoiskId) || film.kinopoiskId <= 0 || seen.has(film.kinopoiskId)) continue;
      seen.add(film.kinopoiskId);
      films.push({
        id: film.kinopoiskId, nameRu: text(film.nameRu), nameOriginal: text(film.nameOriginal) || text(film.nameEn),
        year: Number.isInteger(film.year) ? film.year : null,
        rating: popular && typeof film.ratingKinopoisk === "number" && Number.isFinite(film.ratingKinopoisk) && film.ratingKinopoisk >= 0 && film.ratingKinopoisk <= 10 ? film.ratingKinopoisk : null,
        poster: poster(film.posterUrlPreview) || poster(film.posterUrl), premiereRu: popular ? null : premiereDate(film.premiereRu),
      });
      if (films.length === 20) break;
    }
    return send(200, { films });
  } catch {
    return send(502, { error: "UPSTREAM_ERROR" });
  } finally { clearTimeout(timer); }
};
