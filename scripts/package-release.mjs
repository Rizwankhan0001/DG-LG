import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.deploy','dhampur-green-grow-source.tar.gz');
mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
// Explicit source allowlist. Never package .env, SQLite files, session data or credentials.
const source=['package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html','Dockerfile','compose.yaml','Caddyfile','railway.json','render.yaml','.env.example','.gitignore','.dockerignore','README.md','DEPLOYMENT.md','BUSINESS_ANALYSIS.md','BACKEND_SETUP.md','DATA_SETUP.md','src','server','shared','public','scripts','tests','data/catalog.json','data/researched-leads.json','data/RESEARCH.md','data/research-refresh-report.json'];
execFileSync('tar',['-czf',output,'--',...source],{cwd:root});
const entries=execFileSync('tar',['-tzf',output],{encoding:'utf8'}).split('\n').filter(Boolean);
if(entries.some(name=>/(^|\/)\.env($|\.(?!example$))|\.db($|-)|\.sqlite($|\.)|(^|\/)\.git\//.test(name)))throw new Error('Unexpected private data in release archive.');
console.log(JSON.stringify({archive:output,files:entries.length,bytes:statSync(output).size,sha256:createHash('sha256').update(readFileSync(output)).digest('hex')},null,2));
