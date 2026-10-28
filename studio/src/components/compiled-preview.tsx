import type {CompiledScene} from "@/shared/compiled-scene";
export function CompiledPreview({compiled}:{compiled:CompiledScene}){
 const p=compiled.preview;
 return <figure className="compiled-preview"><figcaption>Static layout preview · {p.type.toLowerCase().replaceAll("_"," ")}</figcaption><div className="compiled-frame"><div className="compiled-art">
 {p.type==="TITLE"?<><span className="compiled-mark" aria-hidden="true">✳</span><h4>{p.title}</h4>{p.subtitle&&<p>{p.subtitle}</p>}</>:p.type==="GENERIC_EDITORIAL"?<><h4>{p.headline}</h4><ul>{p.bullets.map((b,i)=><li key={i}>{b}</li>)}</ul></>:p.type==="PROCESS_FLOW"?<ol className="compiled-flow">{p.nodes.map((n,i)=><li key={n.id}><span>{n.label}</span>{i<p.nodes.length-1&&<b aria-hidden="true">↓</b>}</li>)}</ol>:<div className="compiled-hub"><strong>{p.nodes[0].label}</strong><span aria-hidden="true">↓</span><div>{p.nodes.slice(1).map(n=><span key={n.id}>{n.label}</span>)}</div></div>}
 </div><div className="compiled-caption">Caption-safe area</div></div></figure>;
}
