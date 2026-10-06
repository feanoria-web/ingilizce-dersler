import { buildYds } from './build-yds.mjs';
import { buildCatalog } from './build-catalog.mjs';
try {
  await buildYds();
  await buildCatalog({output:'_site'});
} catch(error) {
  console.error(`Site oluşturulamadı: ${error.message}`);
  process.exitCode=1;
}
