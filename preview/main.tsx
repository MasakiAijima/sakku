import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import SeasonalOrbitView from './ui/seasonal-orbit';
import {orbitCalendarProps} from '../lib/orbit-calendar';
import {loadSeasonalArt} from '../lib/seasonal-art';
import {designTokens} from '../shared/design-tokens';
import {installDemo,resetDemo} from './demo';
import './ui/globals.css';
import './preview.css';

installDemo(import.meta.env.BASE_URL);
for(const [name,value] of Object.entries(designTokens.color))document.body.style.setProperty('--'+name,value);
const root=document.getElementById('root');
if(!root)throw Error('Preview root missing');
const art=await loadSeasonalArt();
flushSync(()=>createRoot(root).render(<>
 <aside className="demo-banner" aria-label="デモのお知らせ"><span>UIデモ · サンプル生成 · この端末に保存</span><button onClick={resetDemo}>デモをリセット</button></aside>
 <header className="app-header"><button className="logo" data-go="home">sakku<small>A TRACE OF YOU</small></button><nav aria-label="メインメニュー"><button className="settings-gear" data-go="setting" aria-label="設定"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg></button><a href="#" id="signout" hidden>ログアウト</a></nav></header>
 <SeasonalOrbitView {...orbitCalendarProps} art={art}/><main id="app"><p role="status">記録を読み込んでいます…</p></main><footer><span>自分らしいペースで、自分の痕跡を。</span><span>SAKKU · UI DEMO</span></footer><div id="toast" role="status"/>
</>));
const script=document.createElement('script');script.type='module';script.src=import.meta.env.BASE_URL+'screen.js';document.body.appendChild(script);
