import {build,preview} from 'vite';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const lab=resolve(root,'.lab');
mkdirSync(lab,{recursive:true});
const outDir=mkdtempSync(join(lab,'provider-browser-'));
process.env.VITE_PORTAL_SUPABASE_URL='https://portal-fixture.example';
process.env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic_browser_fixture_00000000';
delete process.env.VERCEL;
const configFile=resolve(root,'apps/web/vite.config.ts');
await build({configFile,mode:'production',build:{outDir,emptyOutDir:false}});
await preview({configFile,mode:'production',build:{outDir},preview:{host:'127.0.0.1',port:4179,strictPort:true}});
