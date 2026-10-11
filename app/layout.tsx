import type {Metadata} from "next";import "./globals.css";
import type {CSSProperties} from "react";import {designTokens} from "../shared/design-tokens";
export const metadata:Metadata={title:"Sakku",description:"自分らしいペースで、自分の痕跡を残しましょう。"};
const variables=Object.fromEntries(Object.entries(designTokens.color).map(([name,value])=>["--"+name,value])) as CSSProperties;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body style={variables}>{children}</body></html>;}
