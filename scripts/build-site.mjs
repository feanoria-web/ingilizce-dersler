import { buildYds } from './build-yds.mjs';
import { buildCatalog } from './build-catalog.mjs';
import { buildPwa } from './build-pwa.mjs';
try {
  if(process.env.CI==='true'){
    const {readFile}=await import('node:fs/promises');
    const config=await readFile(new URL('../assets/access-config.js',import.meta.url),'utf8');
    if(!/apiBase\s*:\s*['"]https:\/\//.test(config))throw new Error('Canlı giriş servisi bağlanmadan yayın yapılmaz. assets/access-config.js apiBase alanını tamamlayın.');
  }
  await buildYds();
  await buildCatalog({output:'_site'});
  await buildPwa();
} catch(error) {
  console.error(`Site oluşturulamadı: ${error.message}`);
  process.exitCode=1;
}
