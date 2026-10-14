const NS = 'http://www.w3.org/2000/svg';
let nextMount = 0;

export function mountSeasonalArt({svg, manifest, assetBase, onSelect, onStatus = () => {}, label}) {
  const document = svg.ownerDocument;
  const window = document.defaultView;
  const prefix = `seasonal-art-${++nextMount}`;
  const nodes = [];
  const animations = new Map();
  const pendingLoads = new Set();
  const listeners = [];
  let disposed = false, loaded = false, frame = 0, selected = null, year, snapshot;
  let completed = new Set();
  const element = (tag, attributes = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const listen = (node, type, handler) => {
    node.addEventListener(type, handler);
    listeners.push(() => node.removeEventListener(type, handler));
  };
  const defs = element('defs');
  const filter = element('filter', {id: `${prefix}-soft`, x: '-10%', y: '-10%', width: '120%', height: '120%'});
  filter.append(element('feGaussianBlur', {stdDeviation: '.12'}));
  defs.append(filter);
  svg.replaceChildren(defs);
  svg.dataset.ready = 'false';

  function cancel() {
    window.cancelAnimationFrame(frame);
    frame = 0;
    animations.clear();
  }
  function prime(item) {
    animations.delete(item);
    item.full.setAttribute('mask', `url(#${item.maskId})`);
    item.path.setAttribute('d', 'M0 0');
    item.full.style.display = 'none';
    item.base.style.display = item.hasInitial ? '' : 'none';
    if (!item.hasInitial && item.hasCompleted) {
      item.full.removeAttribute('mask');
      item.full.style.display = '';
    }
    item.group.dataset.phase = 'prime';
  }
  function finish(item) {
    animations.delete(item);
    item.full.removeAttribute('mask');
    item.full.style.display = item.hasCompleted ? '' : 'none';
    item.base.style.display = !item.hasCompleted && item.hasInitial ? '' : 'none';
    item.group.dataset.phase = 'full';
  }
  function contour(item, t) {
    const radius = item.radius * t * t * (3 - 2 * t);
    let d = '';
    for (let k = 0; k < 48; k++) {
      const angle = k / 48 * Math.PI * 2;
      const wobble = 1 + .12 * Math.sin(3 * angle + t * 6 + item.index * .71)
        + .065 * Math.sin(7 * angle - t * 4 + item.index) + .025 * Math.sin(13 * angle + t * 9);
      const r = radius * wobble;
      d += `${k ? 'L' : 'M'}${(item.cx + Math.cos(angle) * r).toFixed(3)},${(item.cy + Math.sin(angle) * r).toFixed(3)}`;
    }
    return d + 'Z';
  }
  function tick(now) {
    frame = 0;
    if (disposed) return;
    for (const [item, start] of animations) {
      const t = (now - start) / manifest.animation.durationMs;
      if (t < 0) continue;
      if (t >= 1) finish(item);
      else {
        item.full.style.display = '';
        item.group.dataset.phase = 'growing';
        item.path.setAttribute('d', contour(item, t));
      }
    }
    svg.dataset.state = animations.size ? 'playing' : 'complete';
    if (animations.size) frame = window.requestAnimationFrame(tick);
  }
  function apply(state) {
    const changedYear = year !== state.year;
    year = state.year;
    const slots = new Map(state.slots.map(slot => [slot.id, slot]));
    const nextCompleted = new Set(state.slots.filter(slot => slot.completed).map(slot => slot.id));
    if (changedYear) {
      cancel();
      completed = new Set();
      for (const item of nodes) prime(item);
    }
    const now = window.performance.now();
    let nextStart = now;
    for (const start of animations.values()) nextStart = Math.max(nextStart, start + manifest.animation.staggerMs);
    for (const item of nodes) {
      const slot = slots.get(item.id);
      item.group.dataset.kind = slot?.kind || 'upcoming';
      if (item.group.dataset.kind === 'current') item.group.setAttribute('aria-current', 'step');
      else item.group.removeAttribute('aria-current');
      item.group.setAttribute('aria-label', label ? label(item.id, item.group.dataset.kind) : `${item.name} · ${item.group.dataset.kind}`);
      if (!nextCompleted.has(item.id)) prime(item);
      else if (state.reducedMotion || !state.visible || !item.hasInitial || !item.hasCompleted) finish(item);
      else if (!completed.has(item.id)) {
        animations.set(item, nextStart);
        nextStart += manifest.animation.staggerMs;
      }
    }
    completed = nextCompleted;
    if (state.reducedMotion || !state.visible) cancel();
    svg.dataset.state = animations.size ? 'playing' : 'complete';
    if (animations.size && !frame) frame = window.requestAnimationFrame(tick);
  }
  function select(id) {
    if (disposed) return;
    const focused = nodes.find(item => item.group === svg.ownerDocument.activeElement)?.group;
    selected = nodes.some(item => item.id === id) ? id : null;
    for (const item of nodes) {
      item.group.setAttribute('aria-pressed', String(item.id === selected));
      item.group.setAttribute('tabindex', String(item.id === (selected || nodes[0]?.id) ? 0 : -1));
      svg.append(item.group);
    }
    const chosen = nodes.find(item => item.id === selected);
    if (chosen) svg.append(chosen.group);
    focused?.focus({preventScroll:true});
  }
  function choose(item, focus = false) {
    select(item.id);
    if (focus) item.group.focus();
    onSelect(item.id);
  }
  function preload(url) {
    return new Promise(resolve => {
      const image = new window.Image();
      let settled = false;
      const done = ok => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        image.onload = image.onerror = null;
        pendingLoads.delete(abort);
        resolve(ok);
      };
      const abort = () => { done(false); image.src = ''; };
      const timer = window.setTimeout(abort, 15000);
      pendingLoads.add(abort);
      image.onerror = () => done(false);
      image.onload = () => {
        if (typeof image.decode === 'function') image.decode().then(() => done(true), () => done(false));
        else done(true);
      };
      image.src = url;
    });
  }

  for (const [index, asset] of manifest.assets.entries()) {
    const scale = manifest.layout.commonVisibleLongEdge / asset.placement.visibleLongEdge;
    const attributes = {
      x: asset.placement.x - asset.placement.visibleCenter[0] * scale,
      y: asset.placement.y - asset.placement.visibleCenter[1] * scale,
      width: asset.width * scale, height: asset.height * scale,
    };
    const [seedX, seedY] = asset.animation.seed;
    const cx = attributes.x + seedX * scale, cy = attributes.y + seedY * scale;
    const radius = Math.max(...[[0, 0], [asset.width, 0], [0, asset.height], [asset.width, asset.height]]
      .map(([x, y]) => Math.hypot(attributes.x + x * scale - cx, attributes.y + y * scale - cy))) * 1.35;
    const maskId = `${prefix}-${asset.kouId}`;
    const mask = element('mask', {id: maskId, maskUnits: 'userSpaceOnUse', ...attributes, 'mask-type': 'luminance'});
    const path = element('path', {fill: 'white', filter: `url(#${prefix}-soft)`, d: 'M0 0'});
    mask.append(path);
    defs.append(mask);
    const group = element('g', {
      'data-orbit-id': asset.kouId, 'data-kind': 'upcoming', 'data-phase': 'prime',
      'data-anchor': `${asset.placement.x},${asset.placement.y}`, 'data-z': index,
      role: 'button', 'aria-pressed': 'false', tabindex: index ? -1 : 0,
      'aria-label': label ? label(asset.kouId, 'upcoming') : asset.name,
    });
    const title = element('title');
    title.textContent = asset.name;
    const initialUrl = new URL(asset.initial, assetBase).href;
    const completedUrl = new URL(asset.completed, assetBase).href;
    const base = element('image', {...attributes, href: initialUrl, 'data-layer': 'prime'});
    const full = element('image', {...attributes, href: completedUrl, 'data-layer': 'full', mask: `url(#${maskId})`});
    base.style.display = full.style.display = 'none';
    group.append(title, base, full);
    svg.append(group);
    const item = {id: asset.kouId, name: asset.name, index, group, base, full, path, maskId, cx, cy, radius,
      initialUrl, completedUrl, hasInitial: false, hasCompleted: false};
    nodes.push(item);
    listen(group, 'click', () => choose(item));
    listen(group, 'keydown', event => {
      const movement = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key];
      if (movement !== undefined || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1
          : (item.index + movement + nodes.length) % nodes.length;
        choose(nodes[index], true);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose(item);
      }
    });
    listen(base, 'error', () => {
      if (disposed || !loaded) return;
      item.hasInitial = false;
      animations.delete(item);
      if (completed.has(item.id)) finish(item); else prime(item);
      onStatus(`${item.name}は利用できる静止画で表示しています。`);
    });
    listen(full, 'error', () => {
      if (disposed || !loaded) return;
      item.hasCompleted = false;
      animations.delete(item);
      if (completed.has(item.id)) finish(item); else prime(item);
      onStatus(`${item.name}は利用できる静止画で表示しています。`);
    });
  }
  const ready = Promise.all(nodes.map(async item => {
    [item.hasInitial, item.hasCompleted] = await Promise.all([preload(item.initialUrl), preload(item.completedUrl)]);
  })).then(() => {
    if (disposed) return;
    loaded = true;
    for (const item of nodes) {
      prime(item);
      if (!item.hasInitial || !item.hasCompleted) item.group.dataset.fallback = 'true';
    }
    svg.dataset.ready = 'true';
    const failed = nodes.filter(item => !item.hasInitial || !item.hasCompleted).length;
    onStatus(failed ? `${failed}候の画像を読み込めないため、利用できる静止画で表示しています。` : '七十二候の画像を読み込みました。');
    if (snapshot) apply(snapshot);
  });
  return {
    ready,
    update(state) {
      if (disposed) return;
      snapshot = {...state, slots: state.slots.map(slot => ({...slot}))};
      if (loaded) apply(snapshot);
    },
    select,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      for (const abort of [...pendingLoads]) abort();
      for (const remove of listeners) remove();
      svg.replaceChildren();
    },
  };
}
