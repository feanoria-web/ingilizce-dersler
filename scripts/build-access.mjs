import {buildCatalog} from './build-catalog.mjs';
// Fast local build using existing self-contained lessons; standard npm build also rebuilds YDS.
await buildCatalog({output:'_site'});
