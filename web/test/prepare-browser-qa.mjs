// Development-only responsive harness. Never copied into a production build.
import fs from 'node:fs';
import path from 'node:path';
import { build } from '../build.mjs';
const result = build({ preview: true });
fs.writeFileSync(path.join(result.out, 'qa.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>阅读器内部验收</title>
<link rel="stylesheet" href="qa.css"><script type="module" src="qa.js"></script>
<header><h1>阅读器内部验收</h1><p>同一云端Chrome中的不同宽度视口；不模拟真实手机硬件或Safari。</p>
<div class="controls"><label>视口宽度 <select id="viewport"><option value="320">320px</option><option value="390">390px</option><option value="768">768px</option><option value="1280" selected>1280px</option></select></label>
<label>测试页面 <select id="page"><option value="index.html">首页</option><option value="zh/00.html">引言</option><option value="zh/12.html">第十二章</option><option value="zh/21.html">第二十一章</option><option value="zh/22.html">第二十二章</option></select></label>
<button id="clear">清空本预览测试记录</button><button id="corrupt">写入损坏测试记录</button><button id="reload">重载测试页</button></div><p id="status" role="status"></p><pre id="observation" aria-label="排版位置检查"></pre></header>
<iframe id="reader-frame" title="阅读器测试页面" src="index.html"></iframe></html>`);
fs.writeFileSync(path.join(result.out, 'qa.css'), `body{margin:0;padding:16px;background:#e4e8e9;font:14px system-ui;color:#1c3037}h1{font-size:20px;margin:0}header{margin-bottom:12px}header p{margin:8px 0}.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:center}select,button{font:inherit;min-height:36px}iframe{display:block;border:1px solid #74818a;background:white;width:1280px;height:780px}`);
fs.writeFileSync(path.join(result.out, 'qa.js'), `const frame=document.querySelector('#reader-frame');
const page=document.querySelector('#page');const width=document.querySelector('#viewport');
const prefix='reader:return-to-starship:zh-CN:preview';
const status=document.querySelector('#status');
function info(message=''){status.textContent=message+' 视口 '+frame.contentWindow.innerWidth+'px';}
width.addEventListener('change',()=>{frame.style.width=width.value+'px';info();});
page.addEventListener('change',()=>{frame.src=page.value;});
frame.addEventListener('load',()=>{
 info();
 const doc=frame.contentDocument;
 const snapshot=()=>{
  let p=doc.querySelector('#prose p');if(!p)return null;
  for(const item of doc.querySelectorAll('#prose p')){if(item.getBoundingClientRect().top>110)break;p=item;}
  return {id:p.id,top:p.getBoundingClientRect().top,y:frame.contentWindow.scrollY,font:frame.contentWindow.getComputedStyle(doc.querySelector('#prose')).fontSize,line:frame.contentWindow.getComputedStyle(doc.querySelector('#prose')).lineHeight};
 };
 doc.addEventListener('input',event=>{
  if(!['font','line','width'].includes(event.target.id))return;
  const before=snapshot();
  frame.contentWindow.requestAnimationFrame(()=>{const after=snapshot();document.querySelector('#observation').textContent=JSON.stringify({control:event.target.id,before,after,sameParagraph:before?.id===after?.id});});
 },true);
});
document.querySelector('#reload').addEventListener('click',()=>frame.contentWindow.location.reload());
document.querySelector('#clear').addEventListener('click',()=>{
 for(const key of Object.keys(localStorage))if(key.startsWith(prefix+':'))localStorage.removeItem(key);
 frame.contentWindow.location.reload();info('已清空本预览测试记录');
});
document.querySelector('#corrupt').addEventListener('click',()=>{
 for(const suffix of [':settings',':last',':chapter:00'])localStorage.setItem(prefix+suffix,'{');
 frame.src='zh/00.html';info('已写入损坏测试记录');
});`);
console.log(JSON.stringify({ out: result.out, entry: 'qa.html', widths: [320, 390, 768, 1280], deployment: false }));
