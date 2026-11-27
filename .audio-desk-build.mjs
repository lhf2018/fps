import { build } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=process.cwd();
const result=await build({
  configFile:false,
  logLevel:'error',
  build:{
    write:false,
    minify:true,
    lib:{entry:resolve(root,'src/audio-desk.js'),name:'AudioDesk',formats:['iife']},
  },
});
const js=result[0].output.find(item=>item.type==='chunk').code.replace(/<\/script/gi,'<\\/script');
const page=readFileSync(resolve(root,'scripts/audio-desk-layout.html'),'utf8')
  .replace('/* BUNDLE */','/* Procedural synthesis only. */\n'+js);
writeFileSync(resolve(root,'public/audio-desk.html'),page);
