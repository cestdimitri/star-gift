#!/usr/bin/env node
// Забирает дневные гороскопы с ignio.com и дописывает в forecast.json.
// Текст берётся как есть: никакой обработки, кроме склейки переносов строк.
// Зависимостей нет: только встроенный fetch из Node 20+.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SOURCE = 'https://ignio.com/r/export/utf/xml/daily/com.xml';
const SIGN = process.env.FORECAST_SIGN || 'virgo';   // Солнце Тани — в Деве
const OUT = process.env.FORECAST_OUT || 'forecast.json';
const KEEP_DAYS = 150;                                // скользящее окно, чтобы файл не рос вечно

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
}

main().catch((e) => { console.error('ошибка:', e.message); process.exit(1); });
