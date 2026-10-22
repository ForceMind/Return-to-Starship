#!/usr/bin/env node
// Assemble an author-review copy from an immutable commit; no publication step.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--date'
    || !/^[a-f0-9]{40}$/.test(args[1]) || !/^\d{4}-\d{2}-\d{2}$/.test(args[3])) {
  throw new Error('Usage: node scripts/build-review-edition.mjs --source <40-character commit SHA> --date YYYY-MM-DD');
}
const sha = args[1], date = args[3];
const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (git('rev-parse', `${sha}^{commit}`).trim() !== sha) throw new Error('Source must be a commit.');
const at = relative => git('show', `${sha}:${relative}`);
const manifest = JSON.parse(at('web/content-manifest.json'));
if (manifest.chapter_count !== 23 || manifest.chapters.length !== 23) throw new Error('Expected 23 chapters.');
const chapters = manifest.chapters.map((meta, i) => {
  const id = String(i).padStart(2, '0');
  const relative = `manuscript/zh/${id}-${i === 0 ? 'introduction' : 'chapter'}.md`;
  if (meta.id !== id || meta.order !== i || meta.content['zh-CN'] !== relative) throw new Error('Invalid chapter mapping.');
  const content = at(relative);
  const title = content.split('\n')[0].replace(/^# /, '');
  const hanzi = (content.slice(content.indexOf('\n') + 1).match(/\p{Script=Han}/gu) || []).length;
  if (!content.startsWith('# ') || hanzi < 8000 || hanzi > 15000) throw new Error('Invalid chapter ' + id);
  const bytes = Buffer.from(content);
  const blob = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blob !== git('rev-parse', `${sha}:${relative}`).trim()) throw new Error('Blob mismatch ' + id);
  return { id, title, path: relative, hanzi, blob_sha: blob, content };
});
const total = chapters.reduce((sum, c) => sum + c.hanzi, 0);
const base = 'https://github.com/ForceMind/Return-to-Starship';
const stem = `review-${date.replaceAll('-', '')}`;
const relative = `editions/zh/${stem}.md`;
let text = `# 重返星舰\n\nReturn to Starship\n\n**中文集中审阅候选 R1｜${date}｜待作者审定**\n\n引言至第二十二章，共23篇，正文${total.toLocaleString('en-US')}汉字（不计各篇标题、标点和空白）。本文件按下列不可变提交合并原章，未另改正文。\n\n来源提交：[${sha}](${base}/commit/${sha})。完整来源与每章字数、blob SHA见同目录的 ${stem}.sources.json。\n\n这是经过内部文学、连续性与科幻规则审校的D路线候选稿。作者原稿已确认的设定与D路线新增谜底分开管理；本稿不表示作者批准出版，也不包含现实物理可行性的外部认证。\n\n集中审阅需决定三组核心内容：白球为探索者五号及库克生还；海克关闭睿海的动机；米克事故与瑞娜责任结构。详见[路线登记](${base}/blob/${sha}/docs/d-route-ending-register.md)。\n\n## 目录\n\n`;
text += chapters.map(c => `- [${c.title}](#chapter-${c.id})`).join('\n') + '\n\n---\n\n';
for (const c of chapters) text += `<a id="chapter-${c.id}"></a>\n\n${c.content}\n\n---\n\n`;
const output = path.join(root, relative);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, text);
const index = {
  schema_version: 1, edition: 'R1', status: 'author_review_candidate', publish_approved: false,
  date, source_commit: sha, manuscript_hanzi: total, chapter_count: 23,
  compiled_path: relative, compiled_sha256: crypto.createHash('sha256').update(text).digest('hex'),
  chapters: chapters.map(({ content, ...meta }) => meta)
};
fs.writeFileSync(path.join(path.dirname(output), `${stem}.sources.json`), JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify({ output: relative, chapters: chapters.length, hanzi: total, sha256: index.compiled_sha256 }));
