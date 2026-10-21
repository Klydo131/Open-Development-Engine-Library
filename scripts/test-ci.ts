import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// CI must execute the database policies rather than silently skipping them.
const modulePath=fileURLToPath(import.meta.resolve('@electric-sql/pglite'));
const files=readdirSync('tests').filter(file=>file.endsWith('.test.ts')).sort().map(file=>`tests/${file}`);
const result=spawnSync(process.execPath,['--experimental-strip-types','--test',...files],{stdio:'inherit',env:{...process.env,OLR_PGLITE_MODULE:modulePath}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
