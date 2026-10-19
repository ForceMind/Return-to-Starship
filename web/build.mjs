import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const escapeHTML = value => String(value).replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const blobSHA = source => {
  const bytes = Buffer.from(source);
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};
const inline = text => escapeHTML(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

export function renderBody(source) {
  const occurrences = new Map();
  return source.replace(/^#[^\r\n]*\r?\n+/, '').trim().split(/\n\s*\n/).map(block => {
    if (/^\*{3}$/.test(block.trim())) return '<hr aria-label="场景转换">';
    const text = block.replace(/\r?\n/g, ' ').trim();
    const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
    const occurrence = (occurrences.get(hash) || 0) + 1;
    occurrences.set(hash, occurrence);
    return `<p id="p-${hash}-${occurrence}">${inline(text)}</p>`;
  }).join('\n');
}

export function build({ root = path.resolve(here, '..'), preview = false } = {}) {
  const web = path.join(root, 'web');
  const out = path.join(web, preview ? '.preview' : 'dist');
  // Never leave a previously built release available after a failed gate.
  fs.rmSync(out, { recursive: true, force: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(web, 'content-manifest.json'), 'utf8'));
  if (manifest.chapter_count !== 23 || manifest.chapters?.length !== 23) {
    throw Error('内容清单须含23篇有序章节');
  }
  const chapters = manifest.chapters.map((meta, i) => {
    const id = String(i).padStart(2, '0');
    const expected = `manuscript/zh/${id}${i === 0 ? '-introduction' : '-chapter'}.md`;
    if (meta.id !== id || meta.order !== i || meta.content?.['zh-CN'] !== expected) {
      throw Error(`章节顺序或内容路径不合法：${id}`);
    }
    const file = path.join(root, expected);
    const real = fs.realpathSync(file);
    if (!real.startsWith(fs.realpathSync(path.join(root, 'manuscript/zh')) + path.sep)) {
      throw Error(`正文路径越界：${id}`);
    }
    const source = fs.readFileSync(real, 'utf8');
    const sha = blobSHA(source);
    if (!source.split(/\r?\n/)[0].startsWith('# ') ||
        !source.split(/\r?\n/)[0].includes(meta.title?.['zh-CN'] || '\0')) {
      throw Error(`章节标题不匹配：${id}`);
    }
    if (!preview && (meta.publish_approved?.['zh-CN'] !== true ||
        meta.editorial?.['zh-CN'] !== 'author_approved' || meta.approved_source_zh_sha !== sha)) {
      throw Error(`拒绝正式构建：${id}未获作者发布批准，或批准源SHA已过期。内部审阅请显式使用 --preview`);
    }
    return { id, title: meta.title['zh-CN'], source, sha,
      heading: source.split(/\r?\n/)[0].slice(2).trim(),
      hanzi: (source.replace(/^#.*\n/, '').match(/\p{Script=Han}/gu) || []).length };
  });
  const total = chapters.reduce((n, c) => n + c.hanzi, 0);
  const summary = '秦岭山沟里，一颗来历不明的白球改变了五位研究者的生活。遥远的米克号上，一位舰长在寻找弟弟、追问父亲之死与守护全舰之间作出选择。两段各自孤独的航程，逐渐接近。';
  const metadata = { project: manifest.project_id, mode: preview ? 'preview' : 'release', total,
    chapters: chapters.map(({ id, title, sha, hanzi }) => ({ id, title, sha, hanzi })) };
  const json = JSON.stringify(metadata).replace(/</g, '\\u003c');
  const format = n => n.toLocaleString('en-US');
  function links(prefix, active = '') {
    return chapters.map(c => `<li><a href="${prefix}zh/${c.id}.html"${active === c.id ? ' aria-current="page"' : ''}><span>${c.id}</span>${escapeHTML(c.title)}<small>${format(c.hanzi)}字</small></a></li>`).join('\n');
  }
  function shell({ title, content, prefix = '', id = '' }) {
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHTML(title)} · 重返星舰</title><meta name="description" content="${escapeHTML(summary)}">
${preview ? '<meta name="robots" content="noindex,nofollow">' : ''}
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'">
<meta name="color-scheme" content="light dark"><link rel="stylesheet" href="${prefix}assets/reader.css">
<script src="${prefix}assets/reader.js" type="module"></script></head>
<body data-chapter="${id}" data-prefix="${prefix}" data-mode="${metadata.mode}">
<a class="skip" href="#main">跳到正文</a>
<header class="topbar"><a class="brand" href="${prefix}index.html">重返星舰<small>RETURN TO STARSHIP</small></a>
<nav aria-label="阅读工具"><button type="button" id="toc-open">目录</button><button type="button" id="theme" aria-pressed="false">深色</button><details class="settings"><summary>排版</summary><div class="settings-panel">
<label>字号 <output id="font-value">20</output><input id="font" type="range" min="16" max="30" step="1" value="20"></label>
<label>行距 <output id="line-value">2</output><input id="line" type="range" min="1.5" max="2.6" step="0.1" value="2"></label>
<label>宽度 <output id="width-value">720</output><input id="width" type="range" min="560" max="960" step="40" value="720"></label>
<button type="button" id="reset-settings">恢复默认</button></div></details></nav></header>
${preview ? '<aside class="edition-note">作者审阅预览 · 中文工作稿，尚未定稿</aside>' : ''}
${content}
<dialog id="toc" aria-labelledby="toc-heading"><div class="dialog-top"><h2 id="toc-heading">章节目录</h2><form method="dialog"><button aria-label="关闭目录">关闭</button></form></div><label class="search-label">查找章节<input id="toc-search" type="search" placeholder="编号或篇名"></label><ol class="chapter-list">${links(prefix, id)}</ol></dialog>
<footer class="site-footer">重返星舰 · Return to Starship <span>阅读设置与位置仅保存在此设备</span><button type="button" disabled title="英文文学译本尚未开始">English · 待译</button></footer>
<script type="application/json" id="book-data">${json}</script></body></html>`;
  }
  fs.mkdirSync(path.join(out, 'zh'), { recursive: true });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  for (const name of ['reader.css', 'reader.js', 'state.js']) fs.copyFileSync(path.join(web, 'assets', name), path.join(out, 'assets', name));
  const home = `<main id="main" class="home"><section class="hero"><div class="cover" aria-hidden="true"><span class="orbit"></span><span class="cover-kicker">RETURN TO STARSHIP</span><span class="cover-title">重返<br>星舰</span><span class="cover-bottom">一段向未知出发的航程</span></div><div class="hero-copy"><p class="eyebrow">原创科幻长篇 · 中文原著</p><h1>重返星舰</h1><p class="english-title">Return to Starship</p><p class="synopsis">${summary}</p><p class="book-stats">引言 + 二十二章 <span>·</span> ${format(total)} 汉字</p><div class="hero-actions"><a class="primary" id="continue" href="zh/00.html">开始阅读</a><a class="text-link" href="#chapters">浏览目录 ↓</a></div><p id="last-read" class="muted" aria-live="polite"></p></div></section><section id="chapters" class="home-contents"><div class="section-heading"><h2>目录</h2><span>CONTENTS / 23</span></div><ol class="chapter-list">${links('')}</ol></section></main>`;
  fs.writeFileSync(path.join(out, 'index.html'), shell({ title: '作品首页', content: home }));
  chapters.forEach((c, i) => {
    const prev = chapters[i - 1], next = chapters[i + 1];
    const nav = `<nav class="chapter-nav" aria-label="章节切换">${prev ? `<a rel="prev" href="${prev.id}.html">← ${escapeHTML(prev.title)}</a>` : '<span>全书起点</span>'}<a href="../index.html#chapters">回目录</a>${next ? `<a rel="next" href="${next.id}.html">${escapeHTML(next.title)} →</a>` : '<span>全书终</span>'}</nav>`;
    const content = `<main id="main" class="reading"><div class="chapter-heading"><p class="eyebrow">RETURN TO STARSHIP / ${c.id}</p><h1>${escapeHTML(c.heading)}</h1><p class="muted">${format(c.hanzi)} 汉字 <span>·</span> <span id="chapter-percent">0%</span></p><progress id="chapter-progress" aria-label="本章阅读进度" max="100" value="0"></progress></div><article id="prose" class="prose" aria-label="${escapeHTML(c.heading)}">${renderBody(c.source)}</article>${nav}</main>`;
    fs.writeFileSync(path.join(out, 'zh', `${c.id}.html`), shell({ title: c.heading, content, prefix: '../', id: c.id }));
  });
  fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(metadata, null, 2) + '\n');
  return { out, mode: metadata.mode, chapters: chapters.length, hanzi: total };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--preview')) throw Error('只接受 --preview 参数');
    console.log(JSON.stringify(build({ preview: process.argv.includes('--preview') }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
