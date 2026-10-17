import type {ComponentProps} from 'react';
export default function Image(props:ComponentProps<'img'>&{unoptimized?:boolean}){return <img src={props.src} alt={props.alt??''} width={props.width} height={props.height}/>;}
