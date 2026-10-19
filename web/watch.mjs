import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const web = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(web);
let timer;
function rebuild() {
  try { console.log(new Date().toISOString(), execFileSync(process.execPath,
    [path.join(web, 'build.mjs'), '--preview'], { cwd: root, encoding: 'utf8' }).trim()); }
  catch (error) { console.error('构建失败：', error.message); }
}
for (const dir of [path.join(root, 'manuscript/zh'), web, path.join(web, 'assets')]) {
  fs.watch(dir, (_event, name) => {
    if (!name || (!String(name).endsWith('.md') && !String(name).endsWith('.json') && !String(name).endsWith('.js') && !String(name).endsWith('.mjs') && !String(name).endsWith('.css'))) return;
    clearTimeout(timer); timer = setTimeout(rebuild, 180);
  });
}
rebuild();
console.log('仅自动重建本地审阅预览；未启动服务器或部署。Ctrl+C 结束。');
