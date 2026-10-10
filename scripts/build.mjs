import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
await build({entryPoints:['src/app.js'],bundle:true,format:'iife',minify:true,legalComments:'inline',outfile:'assets/app.js'});
const model=await readFile('assets/camera-v3-studio.glb');
const environment=await readFile('assets/camid-studio.hdr');
await writeFile('assets/model-data.js',`window.CAMID_GLTF=${JSON.stringify(model.toString('base64'))};\nwindow.CAMID_HDR=${JSON.stringify(environment.toString('base64'))};\n`);
