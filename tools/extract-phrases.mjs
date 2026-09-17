#!/usr/bin/env node
// Разовая операция: вынимает банк фраз из index.html в папку phrases/,
// по файлу на тему. Дальше правится руками, собирается build-page.mjs.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const TONES = [
  ['CONJ', 'начало, фокус на себе'],
  ['SEXTILE', 'лёгкость, можно просить'],
  ['SQUARE', 'сопротивление, день усилия'],
  ['TRINE', 'всё идёт само, не мешай'],
  ['OPPOSITION', 'про других людей, про зеркало'],
  ['NONE', 'ровный день, ничего не форсировать'],
];

const SLUG = {
  'Настроение': 'nastroenie', 'Мысли': 'mysli', 'Люди рядом': 'lyudi-ryadom',
  'Дела': 'dela', 'Тело': 'telo', 'Дом': 'dom',
  'Разговоры': 'razgovory', 'Тишина': 'tishina',
};

const html = await readFile('index.html', 'utf8');
const m = html.match(/const FORECAST = (\{[\s\S]*?\});\n\nsafeInit\('forecast'/);
if (!m) throw new Error('не нашёл FORECAST в index.html');
const F = eval('(' + m[1] + ')');

await mkdir('phrases', { recursive: true });

for (const [theme, buckets] of Object.entries(F.phrases)) {
  let out = `# ${theme}\n\n`;
  out += `# Одна фраза — одна строка. Пустые строки и строки с # игнорируются.\n`;
  out += `# Фраз в разделе может быть сколько угодно, но не меньше трёх.\n\n`;
  for (const [tone, hint] of TONES) {
    out += `## ${tone} — ${hint}\n\n`;
    out += buckets[tone].join('\n') + '\n\n';
  }
  await writeFile(`phrases/${SLUG[theme]}.txt`, out, 'utf8');
  console.log(`phrases/${SLUG[theme]}.txt — ${Object.values(buckets).flat().length} фраз`);
}

// словари «делать» и «избегать»
let dict = `# Делать и избегать\n\n`;
dict += `# Одна строка — один пункт. Короткие: одно-два слова или короткая фраза.\n`;
dict += `# В каждом разделе нужно не меньше трёх пунктов.\n\n`;
for (const [key, title] of [['doWords', 'ДЕЛАТЬ'], ['avoidWords', 'ИЗБЕГАТЬ']]) {
  dict += `# ======== ${title} ========\n\n`;
  for (const [tone, hint] of TONES) {
    dict += `## ${key === 'doWords' ? 'DO' : 'AVOID'}:${tone} — ${hint}\n\n`;
    dict += F[key][tone].join('\n') + '\n\n';
  }
}
await writeFile('phrases/slovari.txt', dict, 'utf8');
console.log('phrases/slovari.txt — ' +
  (Object.values(F.doWords).flat().length + Object.values(F.avoidWords).flat().length) + ' пунктов');

await writeFile('phrases/pozdravlenie.txt',
  '# Текст на 18 сентября. Показывается вместо прогноза. Одним абзацем.\n\n' +
  F.birthdayMessage + '\n', 'utf8');
console.log('phrases/pozdravlenie.txt');
