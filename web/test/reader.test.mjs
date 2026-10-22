import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, blobSHA, renderBody } from '../build.mjs';
import { settings, progress, readJSON, writeJSON } from '../assets/state.js';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture(t, approved = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starship-reader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'web'), { recursive: true });
  fs.mkdirSync(path.join(root, 'manuscript/zh'), { recursive: true });
  fs.cpSync(path.join(web, 'assets'), path.join(root, 'web/assets'), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(web, 'content-manifest.json'), 'utf8'));
  for (const chapter of manifest.chapters) {
    const source = `# ${chapter.title['zh-CN']}\n\n一段保留的正文。\n\n***\n\n一段新的正文。\n`;
    fs.writeFileSync(path.join(root, chapter.content['zh-CN']), source);
    if (approved) {
      chapter.editorial['zh-CN'] = 'author_approved';
      chapter.publish_approved['zh-CN'] = true;
      chapter.approved_source_zh_sha = blobSHA(source);
    }
  }
  const save = () => fs.writeFileSync(path.join(root, 'web/content-manifest.json'), JSON.stringify(manifest));
  save();
  return { root, manifest, save };
}

test('unapproved release is refused and cannot leave stale publication output', t => {
  const { root } = fixture(t);
  fs.mkdirSync(path.join(root, 'web/dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'web/dist/stale.html'), 'stale');
  assert.throws(() => build({ root }), /拒绝正式构建/);
  assert.equal(fs.existsSync(path.join(root, 'web/dist')), false);
  const result = build({ root, preview: true });
  assert.equal(result.chapters, 23);
  assert.equal(result.mode, 'preview');
  assert.match(fs.readFileSync(path.join(result.out, 'zh/22.html'), 'utf8'), /作者审阅预览/);
});

test('approved release requires the exact current source, not just a boolean', t => {
  const { root, manifest, save } = fixture(t, true);
  const result = build({ root });
  assert.equal(result.mode, 'release');
  assert.doesNotMatch(fs.readFileSync(path.join(result.out, 'index.html'), 'utf8'), /class="edition-note"/);
  fs.appendFileSync(path.join(root, manifest.chapters[9].content['zh-CN']), '\n后来修改的正文。\n');
  assert.throws(() => build({ root }), /09未获作者发布批准/);
  assert.equal(fs.existsSync(path.join(root, 'web/dist')), false);
  manifest.chapters[9].approved_source_zh_sha = blobSHA(fs.readFileSync(path.join(root, manifest.chapters[9].content['zh-CN']), 'utf8'));
  manifest.chapters[9].editorial['zh-CN'] = 'draft_under_review'; save();
  assert.throws(() => build({ root }), /09未获作者发布批准/);
});

test('23-page navigation resolves to local assets and never exposes an absent English route', t => {
  const { root } = fixture(t);
  const { out } = build({ root, preview: true });
  const files = ['index.html', ...fs.readdirSync(path.join(out, 'zh')).map(f => 'zh/' + f)];
  assert.equal(files.length, 24);
  for (const file of files) {
    const html = fs.readFileSync(path.join(out, file), 'utf8');
    assert.match(html, /<html lang="zh-CN">/);
    for (const [, reference] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const pathname = reference.split('#')[0];
      if (pathname) assert.ok(fs.existsSync(path.resolve(out, path.dirname(file), pathname)), `${file}: ${reference}`);
    }
  }
  assert.equal(fs.existsSync(path.join(out, 'en')), false);
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'zh/00.html'), 'utf8'), /rel="prev"/);
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'zh/22.html'), 'utf8'), /rel="next"/);
});

test('chapter mappings cannot select paths outside the manuscript', t => {
  const { root, manifest, save } = fixture(t);
  manifest.chapters[0].content['zh-CN'] = '../../private.txt'; save();
  assert.throws(() => build({ root, preview: true }), /内容路径不合法/);
});

test('prose is escaped, scene breaks preserved and anchors survive preceding edits', () => {
  const original = renderBody('# 标题\n\n第一段。\n\n***\n\n第二段。\n\n<script>alert("x")</script>\n');
  const revised = renderBody('# 标题\n\n插入的段落。\n\n第一段。\n\n***\n\n第二段。\n');
  const anchors = [...original.matchAll(/id="(p-[^"]+)"/g)].map(m => m[1]);
  assert.ok(revised.includes(anchors[0]));
  assert.ok(revised.includes(anchors[1]));
  assert.match(original, /<hr aria-label="场景转换">/);
  assert.doesNotMatch(original, /<script>/);
  assert.match(original, /&lt;script&gt;/);
  const duplicate = renderBody('# 标题\n\n同一段。\n\n同一段。');
  assert.equal(new Set([...duplicate.matchAll(/id="([^"]+)"/g)].map(m => m[1])).size, 2);
});

test('settings/progress survive corrupt or unavailable storage without an unsafe redirect', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, val) => map.set(key, val) };
  const prefs = settings({ font: 100, line: 'bad', width: 3, theme: 'dark' });
  assert.deepEqual(prefs, { font: 30, line: 2, width: 560, theme: 'dark' });
  assert.equal(writeJSON(storage, 'prefs', prefs), true);
  assert.deepEqual(readJSON(storage, 'prefs'), prefs);
  storage.setItem('broken', '{'); assert.equal(readJSON(storage, 'broken'), null);
  assert.equal(writeJSON(null, 'prefs', prefs), false);
  assert.equal(readJSON(null, 'prefs'), null);
  assert.equal(progress({ id: '//example.com' }, [{ id: '00' }]), null);
  assert.deepEqual(progress({ id: '00', ratio: 5, anchor: '<script>' }, [{ id: '00' }]),
    { id: '00', ratio: 1, anchor: null, offset: 0 });
});

test('heading positions survive save/load without being rewritten as the first paragraph', () => {
  const chapters = [{ id: '00' }];
  const saved = progress({ id: '00', ratio: 0, anchor: null, offset: 0, heading: 0 }, chapters);
  assert.equal(progress(JSON.parse(JSON.stringify(saved)), chapters).heading, 0);
  assert.equal(progress({ ...saved, heading: 0.5 }, chapters).heading, 0.5);
  assert.equal(progress({ ...saved, heading: 8 }, chapters).heading, 1);
  assert.equal('heading' in progress({ ...saved, heading: 'not a position' }, chapters), false);
  assert.equal('heading' in progress({ id: '00', ratio: 0.3 }, chapters), false);
});

test('reader renders manuscript emphasis and exposes explicit slider labels and an empty-search status', t => {
  assert.match(renderBody('# 标题\n\n*也许那里真的有东西。*\n'), /<em>也许那里真的有东西。<\/em>/);
  assert.match(renderBody('# 标题\n\n**重点**与*斜体*和<script>\n'), /<strong>重点<\/strong>与<em>斜体<\/em>和&lt;script&gt;/);
  const { root } = fixture(t);
  const { out } = build({ root, preview: true });
  const html = fs.readFileSync(path.join(out, 'zh/00.html'), 'utf8');
  for (const name of ['font', 'line', 'width']) assert.match(html, new RegExp(`<label for="${name}">`));
  assert.match(html, /id="toc-status"[^>]*role="status"/);
});
