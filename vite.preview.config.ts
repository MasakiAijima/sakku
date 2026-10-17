import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const base=process.env.PREVIEW_BASE_PATH??'/sakku/';
if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))throw Error('PREVIEW_BASE_PATH must be an absolute directory path with a trailing slash');
export default defineConfig({root:fileURLToPath(new URL('./preview',import.meta.url)),base,publicDir:fileURLToPath(new URL('./.preview-public',import.meta.url)),plugins:[react()],resolve:{alias:{'next/image':fileURLToPath(new URL('./preview/image.tsx',import.meta.url))}},build:{outDir:fileURLToPath(new URL('./dist-preview',import.meta.url)),emptyOutDir:true}});
