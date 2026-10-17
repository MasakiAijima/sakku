export type PreviewBrowser = {base: string; photoUrl: (id: string) => string};
declare global { interface Window { sakkuPreview?: PreviewBrowser } }
export function browserAsset(path: string) { return `${(typeof window==='undefined'?undefined:window.sakkuPreview)?.base ?? '/'}${path.replace(/^\//, '')}`; }
export function browserPhoto(id: string) { return (typeof window==='undefined'?undefined:window.sakkuPreview)?.photoUrl(id) ?? `/api/photos/${id}`; }
