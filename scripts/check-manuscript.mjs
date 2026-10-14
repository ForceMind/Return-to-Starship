#!/usr/bin/env node
/**
 * Verify the current Chinese manuscript and its editorial manifest.
 * No dependencies, network calls, publishing, or file modifications.
 * Usage: node scripts/check-manuscript.mjs [--json]
 *
 * Passing these structural checks is NOT author approval, scientific
 * review, or publication permission.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const chapters = [];

function read(relative) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) {
    throw new Error('Outside repository: ' + relative);
  }
  return fs.readFileSync(absolute, 'utf8');
}

function count(text, char) {
  return text.split(char).length - 1;
}

function format(num) {
  return num.toLocaleString('en-US');
}

function gitBlobSha(text) {
  const data = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1')
    .update('blob ' + data.length + '\0')
    .update(data)
    .digest('hex');
}

function checkIndex(relative, expected) {
  let source;
  try {
    source = read(relative);
  } catch (error) {
    errors.push(relative + ': ' + error.message);
    return;
  }
  let checked = 0;
  const seen = new Set();
  for (const line of source.split(/\r?\n/)) {
    const row = line.match(/^\|\s*(\d{2})\s*\|/);
    if (!row) continue;
    const id = row[1];
    if (seen.has(id)) errors.push(relative + ': duplicate chapter ID ' + id);
    seen.add(id);
    const found = expected.find(item => item.id === id);
    if (!found) {
      errors.push(relative + ': unexpected chapter ID ' + id);
      continue;
    }
    const cells = line.split('|').slice(1, -1).map(item => item.trim());
    const displayed = cells[cells.length - 1].replace(/\*\*/g, '');
    const number = Number(displayed.replace(/,/g, ''));
    if (!Number.isFinite(number) || number !== found.hanzi) {
      errors.push(relative + ': count mismatch at ' + id
        + ' (displayed ' + displayed + ', actual ' + found.hanzi + ')');
    }
    checked += 1;
  }
  if (checked !== expected.length) {
    errors.push(relative + ': listed ' + checked
      + ' chapters; expected ' + expected.length);
  }
}

let manifest;
try {
  manifest = JSON.parse(read('web/content-manifest.json'));
} catch (error) {
  console.error('Cannot read chapter manifest: ' + error.message);
  process.exit(1);
}

if (!Array.isArray(manifest.chapters) || manifest.chapters.length !== 23
    || manifest.chapter_count !== 23) {
  errors.push('Manifest must contain exactly 23 ordered chapters.');
}

const expectedIds = Array.from({ length: 23 }, (_, i) =>
  String(i).padStart(2, '0'));

for (let index = 0; index < 23; index += 1) {
  const id = expectedIds[index];
  const meta = manifest.chapters?.[index];
  if (!meta || meta.id !== id || meta.order !== index) {
    errors.push('Missing/misordered manifest chapter ' + id);
    continue;
  }

  const relative = 'manuscript/zh/' + id
    + (id === '00' ? '-introduction.md' : '-chapter.md');
  if (meta.content?.['zh-CN'] !== relative) {
    errors.push(id + ': manuscript mapping differs from ' + relative);
  }

  let source;
  try {
    source = read(relative);
  } catch (error) {
    errors.push(id + ': cannot read Chinese manuscript: ' + error.message);
    continue;
  }

  const titleLine = source.split(/\r?\n/, 1)[0];
  if (!titleLine.startsWith('# ')
      || !titleLine.includes(meta.title?.['zh-CN'] || '\u0000')) {
    errors.push(id + ': chapter heading differs from manifest title');
  }

  const body = source.replace(/^#[^\r\n]*\r?\n+/, '');
  const hanzi = (body.match(/\p{Script=Han}/gu) || []).length;
  const stray = (body.match(/^\s*\*\s*$/gm) || []).length;
  const curlyDouble = [count(body, '“'), count(body, '”')];
  const curlySingle = [count(body, '‘'), count(body, '’')];

  if (hanzi < 8000 || hanzi > 15000) {
    errors.push(id + ': chapter length ' + hanzi + ' Hanzi is out of range');
  }
  if (stray) errors.push(id + ': ' + stray + ' isolated Markdown * lines');
  if (curlyDouble[0] !== curlyDouble[1]) {
    errors.push(id + ': unbalanced Chinese double quotation marks');
  }
  if (curlySingle[0] !== curlySingle[1]) {
    errors.push(id + ': unbalanced Chinese single quotation marks');
  }
  if (/作者原稿|本章|上一章|作品书名/u.test(body)) {
    warnings.push(id + ': inspect possible metanarration in novel text');
  }

  const workingSha = gitBlobSha(source);
  if (meta.editorial?.['zh-CN'] === 'author_approved'
      && meta.approved_source_zh_sha !== workingSha) {
    errors.push(id + ': approved Chinese source SHA no longer matches manuscript');
  }
  if (meta.editorial?.['zh-CN'] === 'draft_under_review'
      && meta.approved_source_zh_sha !== null) {
    errors.push(id + ': unapproved draft must not have approved source SHA');
  }
  if (meta.publish_approved?.['zh-CN'] === true
      && meta.editorial?.['zh-CN'] !== 'author_approved') {
    errors.push(id + ': Chinese public release flag lacks author approval');
  }
  if (meta.editorial?.en === 'not_started' && meta.content?.en !== null) {
    errors.push(id + ': English marked not started but content path exists');
  }
  if (meta.publish_approved?.en === true
      && (meta.content?.en === null || meta.translation_review !== 'approved')) {
    errors.push(id + ': English release flag lacks reviewed English content');
  }

  chapters.push({ id, title: meta.title['zh-CN'], hanzi, path: relative,
    working_blob_sha: workingSha });
}

const totalHanzi = chapters.reduce((sum, chapter) => sum + chapter.hanzi, 0);
if (chapters.length === 23) {
  checkIndex('README.md', chapters);
  checkIndex('manuscript/zh/README.md', chapters);

  const rootReadme = read('README.md');
  const match = rootReadme.match(/共23篇正文、([\d,]+)个汉字/u);
  if (!match || Number(match[1].replace(/,/g, '')) !== totalHanzi) {
    errors.push('README.md top-level total does not match ' + totalHanzi);
  }
  const progress = read('docs/progress.md').slice(0, 2200);
  if (!progress.includes(format(totalHanzi))) {
    errors.push('docs/progress.md latest summary does not match ' + totalHanzi);
  }
}

const report = {
  project: manifest.project_id,
  chapter_count: chapters.length,
  total_hanzi: totalHanzi,
  chapters,
  errors,
  warnings,
  editorial_only: true,
  author_approved: chapters.length === 23 && manifest.chapters.every(item =>
    item.editorial?.['zh-CN'] === 'author_approved')
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Return to Starship Chinese manuscript check');
  console.log('Chapters: ' + chapters.length + '/23');
  console.log('Hanzi: ' + format(totalHanzi));
  console.log('Errors: ' + errors.length + '; Warnings: ' + warnings.length);
  for (const message of errors) console.error('ERROR ' + message);
  for (const message of warnings) console.warn('WARN  ' + message);
  if (!errors.length) {
    console.log('Structural checks passed. Publication still requires explicit release permission.');
  }
}

if (errors.length) process.exitCode = 1;
