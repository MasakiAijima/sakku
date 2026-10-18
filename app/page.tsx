import ElaborationView from "./elaboration-view";
import SeasonalOrbitView from "./seasonal-orbit";
import {loadSeasonalArt} from "../lib/seasonal-art";
import {orbitCalendarProps} from "../lib/orbit-calendar";
import Script from "next/script";
import {requireChatGPTUser} from "./chatgpt-auth";
export const dynamic="force-dynamic";
export default async function Home(){await requireChatGPTUser("/");return <><header className="app-header"><button className="logo" data-go="home">sakku<small>A TRACE OF YOU</small></button><nav aria-label="メインメニュー"><button className="settings-gear" data-go="setting" aria-label="設定"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg></button></nav></header><SeasonalOrbitView {...orbitCalendarProps} art={await loadSeasonalArt()}/><ElaborationView/><main id="app"><p role="status">記録を読み込んでいます…</p></main><footer><span>自分らしいペースで、自分の痕跡を。</span><span>SAKKU · DEVELOPMENT</span></footer><div id="toast" role="status"/><Script src="/screen.js" strategy="afterInteractive"/></>;}
