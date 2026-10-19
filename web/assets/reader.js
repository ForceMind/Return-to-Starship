import { defaults, settings, progress, readJSON, writeJSON } from './state.js';

const $ = selector => document.querySelector(selector);
const book = JSON.parse($('#book-data').textContent);
const id = document.body.dataset.chapter;
const prefix = document.body.dataset.prefix;
const key = `reader:${book.project}:zh-CN:${book.mode}`;
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let prefs = settings(readJSON(storage, key + ':settings'));
let ready = false;
const paragraphs = [...document.querySelectorAll('#prose p')];
const prose = $('#prose');
const media = window.matchMedia('(prefers-color-scheme: dark)');
function bounds() {
  const start = prose.getBoundingClientRect().top + window.scrollY - 100;
  const span = Math.max(1, prose.offsetHeight - window.innerHeight + 150);
  return { start, span };
}
function capture() {
  if (!prose) return null;
  const { start, span } = bounds();
  let para = paragraphs[0];
  for (const p of paragraphs) {
    if (p.getBoundingClientRect().top > 110) break;
    para = p;
  }
  const rect = para.getBoundingClientRect();
  return progress({ id, ratio: (window.scrollY - start) / span,
    anchor: para.id, offset: (100 - rect.top) / Math.max(1, rect.height) }, book.chapters);
}
function restore(saved) {
  if (!saved || saved.id !== id || !prose) return;
  const anchor = saved.anchor && document.getElementById(saved.anchor);
  const { start, span } = bounds();
  const y = anchor ? anchor.getBoundingClientRect().top + window.scrollY
    + anchor.getBoundingClientRect().height * saved.offset - 100 : start + span * saved.ratio;
  window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
}
function theme() {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme').setAttribute('aria-pressed', String(dark));
  $('#theme').textContent = dark ? '浅色' : '深色';
}
function apply() {
  const before = ready ? capture() : null;
  const root = document.documentElement;
  root.style.setProperty('--font-size', prefs.font + 'px');
  root.style.setProperty('--line-height', prefs.line);
  root.style.setProperty('--reading-width', prefs.width + 'px');
  for (const name of ['font', 'line', 'width']) {
    $('#' + name).value = prefs[name];
    $('#' + name + '-value').value = prefs[name];
  }
  theme();
  writeJSON(storage, key + ':settings', prefs);
  if (before) requestAnimationFrame(() => { restore(before); save(); });
}
$('#theme').addEventListener('click', () => {
  prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; apply();
});
media.addEventListener('change', theme);
for (const name of ['font', 'line', 'width']) {
  $('#' + name).addEventListener('input', event => {
    prefs = settings({ ...prefs, [name]: event.target.value }); apply();
  });
}
$('#reset-settings').addEventListener('click', () => { prefs = { ...defaults }; apply(); });
apply();

const toc = $('#toc');
$('#toc-open').addEventListener('click', () => { toc.showModal(); $('#toc-search').focus(); });
$('#toc-search').addEventListener('input', event => {
  const query = event.target.value.trim().toLocaleLowerCase();
  for (const row of toc.querySelectorAll('li')) row.hidden = !row.textContent.toLocaleLowerCase().includes(query);
});
toc.addEventListener('click', event => { if (event.target === toc) toc.close(); });
document.addEventListener('keydown', event => {
  if (!event.altKey || event.ctrlKey || event.metaKey || toc.open ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) ||
      document.activeElement?.isContentEditable) return;
  const direction = event.key === 'ArrowLeft' ? 'prev' : event.key === 'ArrowRight' ? 'next' : null;
  const link = direction && $(`a[rel="${direction}"]`);
  if (link) { event.preventDefault(); save(); window.location.assign(link.href); }
});

function save() {
  if (!ready || !prose) return;
  const current = capture();
  writeJSON(storage, key + ':chapter:' + id, current);
  writeJSON(storage, key + ':last', current);
  const value = Math.round(current.ratio * 100);
  $('#chapter-progress').value = value;
  $('#chapter-percent').textContent = value + '%';
}
if (prose) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!window.location.hash) restore(progress(readJSON(storage, key + ':chapter:' + id), book.chapters));
    ready = true; save();
  }));
  let timer;
  window.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(save, 180); }, { passive: true });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
} else {
  ready = true;
  const last = progress(readJSON(storage, key + ':last'), book.chapters);
  if (last) {
    const index = book.chapters.findIndex(c => c.id === last.id);
    const chapter = book.chapters[index];
    const done = book.chapters.slice(0, index).reduce((sum, c) => sum + c.hanzi, 0) + chapter.hanzi * last.ratio;
    $('#continue').href = `${prefix}zh/${last.id}.html`;
    $('#continue').textContent = '继续阅读';
    $('#last-read').textContent = `${chapter.title} · 本章 ${Math.round(last.ratio * 100)}% · 全书约 ${Math.round(done / book.total * 100)}%`;
  }
}
