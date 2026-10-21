import json,pathlib,re,html
root=pathlib.Path(__file__).resolve().parent
plan=json.loads((root/'V1_UI_Screen_Plan.json').read_text(encoding='utf-8'))
versions={};notes=[]
for p in sorted((root/'stitch-results').glob('*.json')):
 d=json.loads(p.read_text(encoding='utf-8'))
 if d.get('isError'):continue
 d=d.get('structuredContent') or json.loads(d['content'][0]['text'])
 for c in d.get('outputComponents',[]):
  for s in c.get('design',{}).get('screens',[]):
   m=re.match(r'^(\d{2})\s*[—–-]',s.get('title',''))
   if m:
    sid=s.get('id') or s['name'].split('/')[-1]
    versions.setdefault(m[1],{})[sid]={'id':sid,'title':s['title'],'source':p.name,'screenshot':s.get('screenshot',{}).get('downloadUrl'),'htmlUrl':s.get('htmlCode',{}).get('downloadUrl')}
selected={k:list(v.values())[-1] for k,v in versions.items()}
canvas_note='Stitch returned the generated boards, but its project canvas inventory is not consistently showing the new screens. Use this gallery and the numbered preview links as the complete review set; canvas organization remains unresolved.'
manifest={'projectUrl':'https://stitch.withgoogle.com/projects/'+plan['projectId'],'status':'DESIGN_REVIEW_DRAFT','screens':selected,'versions':versions}
(root/'Mineral_Signal_V1_UI_Manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
md=['# Mineral Signal — V1 screen review','', 'Design review draft. Implementation has not started.','', '[Open the Stitch project]('+manifest['projectUrl']+')','', 'Numbered boards include full pages, paired mobile views, dialogs and alternate states. They are not all separate product routes. Older iterations remain on the canvas; the IDs below identify the review versions.','', '## Review order','', '| Board | Included design | Reference |','|---|---|---|']
cards=[]
for g in plan['groups']:
 for title,desc in g['screens']:
  n=title[:2];s=selected.get(n)
  if not s:
   md.append('| '+n+' | '+title[5:]+' | Awaiting generation |');continue
  img=s['screenshot'];sid=s['id']
  md.append('| '+n+' | '+title[5:]+' | [Preview]('+img+'=s0) · `'+sid+'` |')
  cards.append('<article data-title="'+html.escape(title.lower(),quote=True)+'"><h2>'+html.escape(title)+'</h2><p>'+html.escape(desc)+'</p><a href="'+html.escape(img+'=s0',quote=True)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+html.escape(img+'=w900',quote=True)+'" alt="'+html.escape(title,quote=True)+'"></a><footer><a href="'+html.escape(img+'=s0',quote=True)+'" target="_blank" rel="noopener">Open full preview</a><code>'+sid+'</code></footer></article>')
md+=['','## Review notes','','- Check the main journey first: Home → Plan → Storyboard → Generate → Preview → Publish/Schedule.','- Then review account, empty, loading, error and conflict states.','- All sample accounts, dates, video frames and status values are illustrative. The designs do not create real accounts, generate media or publish posts.','- Legal pages are layout drafts with placeholder content, not approved legal policies.','- Screen designs and representative screenshot reviews are not a live application or a full responsive/accessibility certification. Implementation must follow the API and DB specifications when visual copy differs.','- Dedicated mobile boards cover the core review and publishing flows. Responsive behavior across every intermediate viewport still needs implementation testing.','']
md+=['## Delivery and remaining polish','',canvas_note,'','- Review board 33 account-setting copy before implementation: generated references to watermarks, per-scene voices and custom presets are outside the approved V1 scope.','- Boards 17–20 still need copy review: availability explanations, notification promises, per-scene resume claims and internal policy wording must match the system/API specifications before implementation. These illustrations do not add product requirements.','- Treat suggested timings, example progress values and pedagogical claims as illustrative copy to refine during review.','- Remote preview images require internet access. The manifest retains the generated screen IDs and export links.','']
(root/'Mineral_Signal_V1_UI_Review.md').write_text('\n'.join(md),encoding='utf-8')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mineral Signal — Screen review</title><style>*{box-sizing:border-box}body{margin:0;background:#F6F4EE;color:#183832;font:16px/1.55 system-ui}header{padding:48px max(24px,5vw);border-bottom:1px solid #D6DED5}h1{font-size:36px;margin:0 0 12px}a{color:#087F75}input{display:block;width:min(480px,100%);margin-top:24px;padding:14px;border:1px solid #74867D;border-radius:8px;background:#FFFEFA;font:inherit}main{padding:32px max(24px,5vw);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:28px}article{background:#FFFEFA;border:1px solid #D6DED5;border-radius:12px;overflow:hidden}article h2{font-size:22px;margin:22px 24px 10px}article p{margin:0 24px 20px;color:#52655F;font-size:14px}img{display:block;width:100%;height:440px;object-fit:contain;object-position:top;background:#eceee8}footer{padding:18px 24px;display:grid;gap:8px}code{font-size:11px;overflow-wrap:anywhere}a:focus,input:focus{outline:2px solid #087F75;outline-offset:3px}[hidden]{display:none}</style><header><h1>Mineral Signal · V1 screen review</h1><p>Review drafts for Educational Video Studio. Select any preview to inspect the full board.</p><a href="https://stitch.withgoogle.com/projects/4650166871878780934" target="_blank" rel="noopener">Open in Stitch</a><label for="search"><input id="search" type="search" placeholder="Filter by screen number or name" aria-label="Filter screens"></label></header><main>'''+''.join(cards)+'''</main><script>document.getElementById('search').addEventListener('input',e=>{for(const card of document.querySelectorAll('article'))card.hidden=!card.dataset.title.includes(e.target.value.toLowerCase())})</script></html>'''
page=page.replace('<label for="search">','<p>'+html.escape(canvas_note)+'</p><p>40 boards covering desktop pages, dialogs, alternate states and core mobile flows. Legal copy remains placeholder text.</p><label for="search">')
(root/'Mineral_Signal_V1_UI_Gallery.html').write_text(page,encoding='utf-8')
print(json.dumps({'selectedBoards':len(selected),'missing':[str(i).zfill(2) for i in range(1,41) if str(i).zfill(2) not in selected]}))
