import SeasonalOrbitView from "./seasonal-orbit";
import {loadSeasonalArt} from "../lib/seasonal-art";
import {orbitCalendarProps} from "../lib/orbit-calendar";
import Script from "next/script";
import {requireChatGPTUser,chatGPTSignOutPath} from "./chatgpt-auth";
export const dynamic="force-dynamic";
export default async function Home(){await requireChatGPTUser("/");return <><header><button className="logo" data-go="home">sakku<small>A TRACE OF YOU</small></button><nav aria-label="メインメニュー"><button data-go="home">記録</button><button data-go="edit">書く ＋</button><button data-go="setting">設定</button><a href={chatGPTSignOutPath("/")} target="_top" id="signout">ログアウト</a></nav></header><SeasonalOrbitView {...orbitCalendarProps} art={await loadSeasonalArt()}/><main id="app"><p role="status">記録を読み込んでいます…</p></main><footer><span>自分らしいペースで、自分の痕跡を。</span><span>SAKKU · DEVELOPMENT</span></footer><div id="toast" role="status"/><Script src="/screen.js" strategy="afterInteractive"/></>;}
