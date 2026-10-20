import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readAttributes } from './build-catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensions = new Map([
  ['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/gif','gif'],
  ['audio/wav','wav'],['audio/x-wav','wav'],['audio/mpeg','mp3'],['audio/ogg','ogg'],
  ['application/pdf','pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'],
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const relative = (file, target) => path.relative(path.dirname(file), target).split(path.sep).join('/');

export async function externalizeMedia(html, relativePath, write) {
  const normalized = relativePath.replaceAll('\\','/');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error('Lesson path must stay inside the site.');
  const pattern = /data:([\w+.-]+\/[\w+.-]+);base64,([^"'`\s<>)]+)/g;
  const replacements = new Map();
  let removed = 0;
  for (const match of html.matchAll(pattern)) {
    const extension = extensions.get(match[1].toLowerCase());
    if (!extension || match[0].length < 8192 || replacements.has(match[0]) || !/^[A-Za-z0-9+/]+={0,2}$/.test(match[2])) continue;
    const bytes = Buffer.from(match[2], 'base64');
    // Invalid or truncated base64 is not rewritten into a broken resource.
    if (!bytes.length || bytes.toString('base64').replace(/=+$/,'') !== match[2].replace(/=+$/,'')) continue;
    const name = `${hash(bytes)}.${extension}`;
    await write(name, bytes);
    const url = path.posix.relative(path.posix.dirname(normalized), `assets/media/${name}`);
    replacements.set(match[0],url);
  }
  html = html.replace(pattern, match => {
    const replacement = replacements.get(match);
    if (!replacement) return match;
    removed += Buffer.byteLength(match) - Buffer.byteLength(replacement);
    return replacement;
  });
  return {html, files:replacements.size, removed};
}

function viewport(html) {
  let found=false;
  html=html.replace(/<meta\b[^>]*>/gi,meta=>{
    const attrs=readAttributes(meta.replace(/^<meta\b|>$/gi,''));
    if(found || attrs.name?.toLowerCase()!=='viewport')return meta;
    found=true;
    const content=attrs.content || 'width=device-width,initial-scale=1';
    const value=/viewport-fit\s*=/i.test(content)?content:content+',viewport-fit=cover';
    const attribute=`content="${value.replace(/"/g,'&quot;')}"`;
    return /\bcontent\s*=/i.test(meta)?meta.replace(/\bcontent\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,attribute):meta.replace(/\s*\/?>$/,` ${attribute}>`);
  });
  return found?html:html.replace(/<\/head>/i,'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>');
}

async function walk(directory) {
  const files = [];
  for (const item of await fs.readdir(directory,{withFileTypes:true})) {
    const file = path.join(directory,item.name);
    if (item.isDirectory()) files.push(...await walk(file));
    else if (item.isFile() && file.endsWith('.html')) files.push(file);
  }
  return files;
}

export async function buildMobile(root = ROOT) {
  const output = path.join(root,'_site');
  await fs.access(path.join(output,'index.html'));
  const versions = {};
  for (const file of ['mobile-common.css','mobile-lessons.css','mobile-board.css','mobile-yds.css','mobile-tools.js']) {
    const bytes = await fs.readFile(path.join(root,'assets',file));
    versions[file] = hash(bytes).slice(0,12);
    await fs.writeFile(path.join(output,'assets',file),bytes);
  }
  const written = new Set();
  const report = [];
  for (const file of await walk(output)) {
    const name = path.relative(output,file).split(path.sep).join('/');
    if (['offline.html','privacy.html','404.html'].includes(name)) continue;
    let html = await fs.readFile(file,'utf8');
    const originalBytes = Buffer.byteLength(html);
    const lesson = name.startsWith('lessons/');
    const family = !lesson ? 'portal' : name.startsWith('lessons/yds/') ? 'yds'
      : /class=["']?[^>]*\bboard-shell\b/.test(html) || /id=["']board-root["']/.test(html) || /const DATA=/.test(html) ? 'board' : 'lesson';
    html = html.replace(/<body\b([^>]*)>/i,(whole,attrs) => {
      const classAttr = /\bclass\s*=\s*(?:(["'])(.*?)\1|([^\s"'=<>`]+))/i;
      if (classAttr.test(attrs)) return `<body${attrs.replace(classAttr,(_,quote,classes,unquoted) => `class="${[...new Set([...(classes??unquoted).split(/\s+/).filter(Boolean),`mobile-${family}`])].join(' ')}"`)}>`;
      return `<body${attrs} class="mobile-${family}">`;
    });
    html = viewport(html);
    const css = ['mobile-common.css',...(lesson ? [`mobile-${family==='lesson'?'lessons':family}.css`] : [])];
    const links = css.map(asset=>`<link rel="stylesheet" href="${relative(file,path.join(output,'assets',asset))}?v=${versions[asset]}">`).join('\n');
    const tools = lesson ? `\n<script defer src="${relative(file,path.join(output,'assets/mobile-tools.js'))}?v=${versions['mobile-tools.js']}"></script>` : '';
    html = html.replace(/\s*<!-- english-mobile:start -->[\s\S]*?<!-- english-mobile:end -->/g,'')
      .replace(/<\/head>/i,`\n<!-- english-mobile:start -->\n${links}${tools}\n<!-- english-mobile:end -->\n</head>`);
    if (lesson) {
      const transformed = await externalizeMedia(html,name,async (mediaName,bytes)=>{
        if (written.has(mediaName)) return;
        const directory = path.join(output,'assets','media');
        await fs.mkdir(directory,{recursive:true});
        await fs.writeFile(path.join(directory,mediaName),bytes);
        written.add(mediaName);
      });
      html = transformed.html;
      report.push({lesson:name,family,before:originalBytes,after:Buffer.byteLength(html),media:transformed.files});
    }
    await fs.writeFile(file,html);
  }
  console.log(`Mobil düzen: ${report.length} ders; ${written.size} ayrı medya dosyası; HTML ${(report.reduce((n,r)=>n+r.before,0)/1048576).toFixed(1)} → ${(report.reduce((n,r)=>n+r.after,0)/1048576).toFixed(1)} MB.`);
  return report;
}
