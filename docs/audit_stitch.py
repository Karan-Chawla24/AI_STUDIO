import json,pathlib,urllib.request,concurrent.futures,re
from html.parser import HTMLParser
root=pathlib.Path(__file__).resolve().parent
out=root.parent/'design-exports'/'v1';out.mkdir(parents=True,exist_ok=True)
class Text(HTMLParser):
 def __init__(self):super().__init__();self.bits=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ('style','script'):self.skip+=1
 def handle_endtag(self,t):
  if t in ('style','script'):self.skip=max(0,self.skip-1)
 def handle_data(self,d):
  if not self.skip and d.strip():self.bits.append(d.strip())
screens=[]
for p in sorted((root/'stitch-results').glob('*.json')):
 d=json.loads(p.read_text(encoding='utf-8'))
 if d.get('isError'):continue
 d=d.get('structuredContent') or json.loads(d['content'][0]['text'])
 for c in d.get('outputComponents',[]):
  for s in c.get('design',{}).get('screens',[]):screens.append(s)
def fetch(s):
 sid=s.get('id') or s['name'].split('/')[-1];f=out/(sid+'.html')
 if not f.exists():f.write_bytes(urllib.request.urlopen(s['htmlCode']['downloadUrl'],timeout=60).read())
 h=f.read_text(encoding='utf-8');p=Text();p.feed(h)
 txt=' | '.join(p.bits);(out/(sid+'.txt')).write_text(txt,encoding='utf-8')
 return {'id':sid,'title':s['title'],'html':str(f),'text':txt,'screenshot':s.get('screenshot',{}).get('downloadUrl'),'width':s.get('width'),'height':s.get('height')}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:res=list(pool.map(fetch,screens))
(out/'audit.json').write_text(json.dumps(res,ensure_ascii=False,indent=2),encoding='utf-8')
for s in res:print(json.dumps({'id':s['id'],'title':s['title'],'text':s['text']},ensure_ascii=True))
