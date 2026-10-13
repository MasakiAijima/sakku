const states = ['initial', 'completed', 'transition', 'idle'];

export function parseManifest(value, manifestUrl) {
  const production=value?.schemaVersion===2;
  if (production) validateReleaseMetadata(value);
  else if (!value || value.version !== 'poc-v1' || value.status !== 'draft' || !Array.isArray(value.assets) || !value.assets.length) throw new Error('未対応のmanifestです');
  const ids = new Set();
  const base = new URL(manifestUrl);
  return value.assets.map(asset => {
    if (!asset || !/^kou-(0[1-9]|[1-6][0-9]|7[0-2])$/.test(asset.kouId) || ids.has(asset.kouId) || typeof asset.name !== 'string' || !asset.name.trim()) throw new Error('候IDまたは候名が不正です');
    if (asset.width !== 512 || asset.height !== 512 || asset.anchor?.x !== 0.5 || asset.anchor?.y !== 0.5) throw new Error('画像寸法またはアンカーが不正です');
    ids.add(asset.kouId);
    if (production) validateAssetMetadata(asset);
    const urls = {};
    for (const state of states) {
      const path = asset[state];
      if (!production && (state === 'transition' || state === 'idle') && (path === undefined || path === null)) continue;
      if (typeof path !== 'string' || !path || path.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.includes('\\')) throw new Error('画像パスが不正です');
      const url = new URL(path, base);
      if (url.origin !== base.origin || !url.href.startsWith(new URL('.', base).href) || !/\.(png|webp)$/.test(url.pathname) || url.search || url.hash) throw new Error('画像パスが保存先の外です');
      urls[state] = url.href;
    }
    return {...asset, urls};
  });
}


function finite(value){return typeof value==='number'&&Number.isFinite(value);}
function bounds(value){return Array.isArray(value)&&value.length===4&&value.every(finite)&&value[0]>=0&&value[1]>=0&&value[0]<value[2]&&value[1]<value[3]&&value[2]<=512&&value[3]<=512;}
function validateReleaseMetadata(value){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value.version)||!['review','approved'].includes(value.status)||value.assets?.length!==72||value.assets.some((a,i)=>a?.kouId!==`kou-${String(i+1).padStart(2,'0')}`))throw Error('正式版は72候のmanifestが必要です');
 const layout=value.layout,a=value.animation;
 if(JSON.stringify(layout?.viewBox)!=='[0,0,700,700]'||!finite(layout.commonVisibleLongEdge)||layout.commonVisibleLongEdge<=0||layout.commonVisibleLongEdge>55.31||a?.kind!=='organic-growth'||a.durationMs!==720||a.staggerMs!==45||a.idle!=='static')throw Error('配置またはアニメーション仕様が不正です');
}
function validateAssetMetadata(asset){
 const p=asset.placement,a=asset.animation,b=asset.visibleBounds,seed=asset.precursorBounds;
 if(asset.transparent!==true||asset.colorSpace!=='sRGB'||!bounds(b)||!bounds(seed)||!finite(p?.x)||!finite(p?.y)||p.x<0||p.y<0||p.x>700||p.y>700||p.visibleLongEdge!==306||!Array.isArray(p.visibleCenter)||p.visibleCenter.length!==2||p.visibleCenter[0]!==((b[0]+b[2])/2)||p.visibleCenter[1]!==((b[1]+b[3])/2))throw Error('アセットの配置が不正です');
 if(seed[0]<b[0]||seed[1]<b[1]||seed[2]>b[2]||seed[3]>b[3]||a?.durationMs!==720||a.idle!=='static'||a.loop!==false||!Number.isInteger(a.frames)||a.frames<2||!Array.isArray(a.seed)||a.seed.length!==2||a.seed[0]!==((seed[0]+seed[2])/2)||a.seed[1]!==((seed[1]+seed[3])/2))throw Error('成長の開始点が不正です');
 const motion=asset.motionBounds;
 if(motion?.x!==b[0]||motion.y!==b[1]||motion.width!==b[2]-b[0]||motion.height!==b[3]-b[1])throw Error('可動範囲が不正です');
 for(const [state,file]of Object.entries({initial:'initial.png',completed:'completed.png',transition:'transition.webp',idle:'idle.png',provenance:'provenance.json'}))if(asset[state]!==`${asset.kouId}/${file}`||!/^[a-f0-9]{64}$/.test(asset.hashes?.[state]||''))throw Error('正式アセットの参照またはハッシュが不正です');
}

export function sourceFor({asset, state, selected, reducedMotion}) {
  if (!states.includes(state)) throw new Error('未対応の状態です');
  const animated = state === 'transition' || state === 'idle';
  return animated && (!selected || reducedMotion) ? asset.urls.completed : asset.urls[state] ?? asset.urls.completed;
}

export async function mountPoc({document, manifestUrl, fetch: fetchManifest = fetch, motion = matchMedia('(prefers-reduced-motion: reduce)')}) {
  const status = document.querySelector('#status');
  try {
    const response = await fetchManifest(manifestUrl);
    if (!response.ok) throw new Error(`manifest取得失敗 (${response.status})`);
    const assets = parseManifest(await response.json(), manifestUrl);
    const root = document.querySelector('#assets');
    const state = document.querySelector('#state');
    let selected = assets[0].kouId;
    const cards = assets.map(asset => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'asset';
      const image = document.createElement('img');
      button.dataset.kouId=asset.kouId;
      image.width = asset.width;
      image.height = asset.height;
      image.alt = asset.name;
      const label = document.createElement('span');
      label.textContent = `${asset.kouId} ${asset.name}`;
      button.append(image, label);
      root.append(button);
      button.addEventListener('click', () => { selected = asset.kouId; render(); });
      image.addEventListener('error', () => {
        if (image.src !== asset.urls.completed) {
          image.src = asset.urls.completed;
          status.textContent = `${asset.name}は完成静止画に切り替えました`;
        } else {
          status.textContent = `${asset.name}の完成静止画を読み込めません`;
        }
      });
      return {asset, button, image};
    });
    function render() {
      for (const {asset, button, image} of cards) {
        const active = asset.kouId === selected;
        button.setAttribute('aria-pressed', String(active));
        const src = sourceFor({asset, state: state.value, selected: active, reducedMotion: motion.matches});
        if (image.src !== src) image.src = src;
      }
      status.textContent = motion.matches ? '動きを減らす設定。完成静止画を表示します。' : 'アニメーションは選択中の候だけ読み込みます。';
    }
    state.addEventListener('change', render);
    motion.addEventListener('change', render);
    render();
    return {assets, dispose() { state.removeEventListener('change', render); motion.removeEventListener('change', render); root.replaceChildren(); }};
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : '読み込みに失敗しました';
    return null;
  }
}
