import { defineConfig,loadEnv,type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import {readFileSync} from 'node:fs';
import { securityHeaders,portalSecurityHeaders } from './security-headers.ts';
import {portalConfig} from './portal-config.ts';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig(({mode})=>{
  const env={...loadEnv(mode,process.cwd(),'VITE_PORTAL_'),...process.env};
  const config=portalConfig(env.VITE_PORTAL_SUPABASE_URL,env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY);
  if(process.env.VERCEL){
    const settings=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'));
    const policy=settings.headers.find((item:{source:string})=>item.source==='/portal.html')?.headers.find((item:{key:string})=>item.key==='Content-Security-Policy')?.value;
    if(policy!==portalSecurityHeaders(config?.url)['Content-Security-Policy'])throw new Error('Portal CSP differs from public provider configuration. Run pnpm configure:portal locally and review vercel.json before deploying.');
  }
  const installHeaders=(server:{middlewares:{use:Function}})=>{server.middlewares.use((req:{url?:string},res:{setHeader:(key:string,value:string)=>void},next:()=>void)=>{
    const path=new URL(req.url??'/','http://localhost').pathname;
    const headers=path==='/portal.html'?portalSecurityHeaders(config?.url):securityHeaders;
    for(const [name,value]of Object.entries(headers))res.setHeader(name,value);next();
  });};
  const headers:Plugin={name:'room-privacy-headers',configureServer:installHeaders,configurePreviewServer:installHeaders};
  return {root,plugins:[headers],build:{target:'safari16',outDir:'dist',rollupOptions:{input:{rooms:fileURLToPath(new URL('./index.html',import.meta.url)),portal:fileURLToPath(new URL('./portal.html',import.meta.url))}}},server:{port:4178,strictPort:true},preview:{port:4178,strictPort:true}};
});
