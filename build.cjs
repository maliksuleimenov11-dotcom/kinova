"use strict";

const { copyFile, lstat, mkdir, readdir } = require("node:fs/promises");
const path = require("node:path");

const publicFiles = ["index.html", "styles.css", "script.js"];

async function build(root = __dirname) {
  const output = path.join(root, "dist");
  // Проверяем файлы до копирования. Секреты и серверный код не читаются.
  for (const name of publicFiles) {
    const info = await lstat(path.join(root, name));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Invalid source");
  }
  try {
    const info = await lstat(output);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Invalid output");
    for (const entry of await readdir(output, { withFileTypes: true })) {
      if (!publicFiles.includes(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
        throw new Error("Unexpected output file");
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(output, { recursive: true });
  for (const name of publicFiles) await copyFile(path.join(root, name), path.join(output, name));
  return publicFiles.slice();
}

if (require.main === module) {
  build().then((files) => console.log(`Сборка готова: dist (${files.join(", ")}).`)).catch(() => {
    console.error("Сборка остановлена. Проверьте исходные файлы и папку dist: допустимы только index.html, styles.css и script.js, без ссылок и вложенных папок. Файлы автоматически не удаляются.");
    process.exitCode = 1;
  });
}

module.exports = build;
