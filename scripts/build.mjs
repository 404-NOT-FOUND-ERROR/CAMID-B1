import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
await build({entryPoints:['src/app.js'],bundle:true,format:'iife',minify:true,legalComments:'inline',outfile:'assets/app.js'});
const model=await readFile('assets/camera-v3.glb');
await writeFile('assets/model-data.js',`window.CAMID_GLTF=${JSON.stringify(model.toString('base64'))};\n`);
