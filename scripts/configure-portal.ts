import {readFileSync,writeFileSync} from 'node:fs';
import {loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import {portalConfig} from '../apps/web/portal-config.ts';
import {portalSecurityHeaders} from '../apps/web/security-headers.ts';
// Run locally before deploying; writes the public origin policy only, never the publishable key.
const env={...loadEnv('production',fileURLToPath(new URL('../',import.meta.url)),'VITE_PORTAL_'),...process.env};
const config=portalConfig(env.VITE_PORTAL_SUPABASE_URL,env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY);
const target=new URL('../vercel.json',import.meta.url);
const settings=JSON.parse(readFileSync(target,'utf8'));
const route=settings.headers.find((item:{source:string})=>item.source==='/portal.html');
if(!route)throw new Error('Expected the separate portal header rule.');
route.headers=Object.entries(portalSecurityHeaders(config?.url)).map(([key,value])=>({key,value}));
writeFileSync(target,JSON.stringify(settings,null,2)+'\n');
console.log(config?'Portal CSP allows its one configured public service origin. Review vercel.json before deployment.':'Portal CSP is set for the local demonstration.');
