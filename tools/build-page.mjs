#!/usr/bin/env node
// Собирает index.html из отредактированных файлов в phrases/.
// Запуск:  node tools/build-page.mjs
// Проверка без записи:  node tools/build-page.mjs --check

import { readFile, writeFile } from 'node:fs/promises';

const TONES = ['CONJ', 'SEXTILE', 'SQUARE', 'TRINE', 'OPPOSITION', 'NONE'];
const THEMES = {
  'Настроение': 'nastroenie', 'Мысли': 'mysli', 'Люди рядом': 'lyudi-ryadom',
  'Дела': 'dela', 'Тело': 'telo', 'Дом': 'dom',
  'Разговоры': 'razgovory', 'Тишина': 'tishina',
};
const MIN_PER_BUCKET = 3;     // меньше трёх — «делать/избегать» не наберёт три разных пункта

const problems = [];
const notes = [];

// Разбирает файл на разделы «## КЛЮЧ — пояснение».
function parseSections(text, file) {
  const sections = {};
  let current = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('##')) {
      const key = line.replace(/^##\s*/, '').split('—')[0].trim();
      current = key;
      if (sections[current]) problems.push(`${file}: раздел «${current}» встречается дважды`);
      sections[current] = [];
      return;
    }
    if (line.startsWith('#')) return;             // комментарий или заголовок файла
    if (!current) { problems.push(`${file}:${i + 1}: строка вне раздела — «${line.slice(0, 40)}»`); return; }
    sections[current].push(line);
  });
  return sections;
}

function checkBucket(file, key, list) {
  if (!list || list.length < MIN_PER_BUCKET) {
    problems.push(`${file}: в разделе «${key}» ${list ? list.length : 0} строк, нужно минимум ${MIN_PER_BUCKET}`);
    return;
  }
  const seen = new Map();
  list.forEach((s) => {
    const norm = s.toLowerCase().replace(/[.,—-]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(norm)) problems.push(`${file} / ${key}: повтор — «${s}»`);
    seen.set(norm, true);
  });
}

// ---------- фразы ----------
const phrases = {};
for (const [theme, slug] of Object.entries(THEMES)) {
  const file = `phrases/${slug}.txt`;
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch { problems.push(`нет файла ${file}`); continue; }
  const sections = parseSections(text, file);
  phrases[theme] = {};
  for (const tone of TONES) {
    checkBucket(file, tone, sections[tone]);
    phrases[theme][tone] = sections[tone] || [];
  }
  const extra = Object.keys(sections).filter((k) => !TONES.includes(k));
  if (extra.length) problems.push(`${file}: лишние разделы — ${extra.join(', ')}`);
  notes.push(`${theme}: ${TONES.map((t) => (sections[t] || []).length).join('/')}`);
}

// ---------- словари ----------
const doWords = {}, avoidWords = {};
{
  const file = 'phrases/slovari.txt';
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch { problems.push(`нет файла ${file}`); }
  if (text) {
    const sections = parseSections(text, file);
    for (const tone of TONES) {
      for (const [prefix, target] of [['DO', doWords], ['AVOID', avoidWords]]) {
        const key = `${prefix}:${tone}`;
        checkBucket(file, key, sections[key]);
        target[tone] = sections[key] || [];
      }
    }
  }
}

// ---------- поздравление ----------
let birthdayMessage = '';
try {
  birthdayMessage = (await readFile('phrases/pozdravlenie.txt', 'utf8'))
    .split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join(' ').trim();
} catch { problems.push('нет файла phrases/pozdravlenie.txt'); }
if (!birthdayMessage) problems.push('phrases/pozdravlenie.txt пуст');

// ---------- отчёт ----------
const total = Object.values(phrases).flatMap((b) => Object.values(b)).flat().length;
console.log(`фраз: ${total}`);
notes.forEach((n) => console.log('  ' + n + '   (CONJ/SEXTILE/SQUARE/TRINE/OPPOSITION/NONE)'));
console.log(`делать: ${Object.values(doWords).flat().length}, избегать: ${Object.values(avoidWords).flat().length}`);

if (problems.length) {
  console.error(`\nНЕ СОБРАНО, проблем: ${problems.length}`);
  problems.forEach((p) => console.error('  • ' + p));
  process.exit(1);
}

if (process.argv.includes('--check')) {
  console.log('\nпроверка пройдена, файл не трогал');
  process.exit(0);
}

// ---------- вклейка в index.html ----------
const html = await readFile('index.html', 'utf8');
const re = /const FORECAST = \{[\s\S]*?\};\n\nsafeInit\('forecast'/;
if (!re.test(html)) throw new Error('не нашёл блок FORECAST в index.html');

const block = 'const FORECAST = {\n' +
  `  phrases: ${JSON.stringify(phrases)},\n` +
  `  doWords: ${JSON.stringify(doWords)},\n` +
  `  avoidWords: ${JSON.stringify(avoidWords)},\n` +
  `  birthdayMessage: ${JSON.stringify(birthdayMessage)}\n` +
  "};\n\nsafeInit('forecast'";

await writeFile('index.html', html.replace(re, block), 'utf8');
console.log('\nindex.html собран');
