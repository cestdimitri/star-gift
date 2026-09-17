#!/usr/bin/env node
// Забирает дневные гороскопы с ignio.com и дописывает в forecast.json.
// Текст берётся как есть: никакой обработки, кроме склейки переносов строк.
// Страница показывает его отдельным блоком под собственным прогнозом.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SOURCE = 'https://ignio.com/r/export/utf/xml/daily/com.xml';
const SIGN = process.env.FORECAST_SIGN || 'virgo';   // Солнце Тани — в Деве
const OUT = process.env.FORECAST_OUT || 'forecast.json';
const KEEP_DAYS = 150;                                // скользящее окно, чтобы файл не рос вечно
const EMBED_DAYS = 10;                                // столько последних дней вшиваем в index.html

function parseIgnio(xml, sign) {
  const dates = {};
  const dm = xml.match(/<date([^>]*)\/>/);
  if (dm) {
    for (const [, key, val] of dm[1].matchAll(/(\w+)="([\d.]+)"/g)) {
      const [d, m, y] = val.split('.');
      dates[key] = `${y}-${m}-${d}`;
    }
  }
  const block = xml.match(new RegExp(`<${sign}>([\\s\\S]*?)</${sign}>`));
  if (!block) throw new Error(`в XML нет знака ${sign}`);
  const out = {};
  for (const key of ['today', 'tomorrow', 'tomorrow02']) {
    const m = block[1].match(new RegExp(`<${key}>([\\s\\S]*?)</${key}>`));
    // единственное, что делаем с текстом: убираем переносы строк из XML
    if (m && dates[key]) out[dates[key]] = m[1].replace(/\s+/g, ' ').trim();
  }
  return out;
}

async function main() {
  // --from-file <путь> — прогнать сохранённый XML без обращения к сети
  const fromFile = process.argv.includes('--from-file')
    ? process.argv[process.argv.indexOf('--from-file') + 1]
    : null;

  let xml;
  if (fromFile) {
    xml = await readFile(fromFile, 'utf8');
  } else {
    const res = await fetch(SOURCE, { headers: { 'User-Agent': 'birthday-page/1.0 (personal, once daily)' } });
    if (!res.ok) throw new Error(`ignio ответил ${res.status}`);
    xml = await res.text();
  }

  const raw = parseIgnio(xml, SIGN);

  let store = { sign: SIGN, source: 'ignio.com', updated: null, days: {} };
  if (existsSync(OUT)) {
    try { store = { ...store, ...JSON.parse(await readFile(OUT, 'utf8')) }; } catch {}
  }

  let added = 0;
  for (const [date, text] of Object.entries(raw)) {
    if (!text || store.days[date] === text) continue;
    store.days[date] = text;
    added++;
    console.log(`  ${date}: ${text}`);
  }

  const keys = Object.keys(store.days).sort();
  if (keys.length > KEEP_DAYS) {
    for (const k of keys.slice(0, keys.length - KEEP_DAYS)) delete store.days[k];
  }
  store.updated = new Date().toISOString();

  await writeFile(OUT, JSON.stringify(store, null, 1) + '\n', 'utf8');
  console.log(`\nготово: обновлено ${added}, всего дней в файле ${Object.keys(store.days).length}`);

  await embedIntoPage(store);
}

// Кладёт слепок последних дней прямо в index.html.
// Зачем: если страницу открыть файлом с диска (file://), браузер запрещает
// читать соседний forecast.json — и блок с гороскопом пропадает. Слепок
// внутри страницы работает всегда; на сайте его всё равно перебивает
// свежий forecast.json, который страница дочитывает по сети.
async function embedIntoPage(store) {
  const PAGE = process.env.FORECAST_PAGE || 'index.html';
  if (!existsSync(PAGE)) { console.log(`${PAGE} рядом нет — слепок не обновляю`); return; }

  const re = /(<script type="application\/json" id="forecast-embedded">\n)[\s\S]*?(\n<\/script>)/;
  const html = await readFile(PAGE, 'utf8');
  if (!re.test(html)) { console.log(`в ${PAGE} нет блока forecast-embedded — слепок не обновляю`); return; }

  // в слепок берём только ближайшие дни: страницу незачем раздувать всем архивом
  const keys = Object.keys(store.days).sort().slice(-EMBED_DAYS);
  const slim = { sign: store.sign, source: store.source, updated: store.updated, days: {} };
  for (const k of keys) slim.days[k] = store.days[k];

  // "</script>" внутри строки закрыл бы тег раньше времени — экранируем
  const json = JSON.stringify(slim).replace(/<\//g, '<\\/');
  const next = html.replace(re, `$1${json}$2`);
  if (next === html) { console.log('слепок в странице уже актуален'); return; }

  await writeFile(PAGE, next, 'utf8');
  console.log(`слепок в ${PAGE} обновлён: ${keys.length} дн. (${keys[0]} — ${keys[keys.length - 1]})`);
}

main().catch((e) => { console.error('ошибка:', e.message); process.exit(1); });
