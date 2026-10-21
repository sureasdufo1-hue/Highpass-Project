"""Read-only artifact QA and real test execution; save machine-readable results."""
import pathlib, json, subprocess, re, datetime
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
from PIL import Image
import psutil

psutil.Process().nice(psutil.NORMAL_PRIORITY_CLASS)
psutil.Process().ionice(psutil.IOPRIO_NORMAL)
repo=pathlib.Path(__file__).resolve().parents[1]
root=pathlib.Path.home()/'Downloads/MediQ_통합관제증적_20261020'

class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[]
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key in ('href','src') and value:self.links.append(value)

broken=[];checked=0
# Only current galleries/annotation docs are ours to change; archived artifacts remain immutable.
for p in [root/'index.html',root/'latest/index.html',*list((root/'latest/editable').glob('*.html'))]:
    parser=Links();parser.feed(p.read_text(encoding='utf8'))
    for link in parser.links:
        u=urlsplit(link)
        if u.scheme or u.netloc or not u.path:continue
        checked+=1
        if not (p.parent/unquote(u.path)).is_file():broken.append(str(p.relative_to(root))+':'+link)
pngs=[p for d in ['latest','archive-linux-before','archive-helper-recovery','archive-query-reports'] for kind in ['original','annotated'] for p in (root/d/kind).glob('*.png')]
for p in pngs:
    with Image.open(p) as im:im.verify()
assert not broken,broken
render=json.loads((root/'latest/render-results.json').read_text(encoding='utf8'))
assert len(render)==12 and all(x['imagesLoaded'] and not x['horizontalOverflow'] for x in render)
cmd=['node','--test','test/helper-model-version.test.js','test/health-helper-candidate-generation.test.js','test/security-details.test.js','test/health-helper-rag.test.js']
test=subprocess.run(cmd,cwd=repo,capture_output=True,text=True,encoding='utf8',timeout=60)
out=test.stdout+test.stderr
assert test.returncode==0 and re.search(r'(?:tests|test[s]?)\s+36',out),out
result={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'artifactLinks':{'status':'PASS','checked':checked,'broken':broken},'pngDecode':{'status':'PASS','count':len(pngs)},'annotationRender':{'status':'PASS','count':len(render)},'nodeTests':{'status':'PASS','exit':test.returncode,'command':cmd,'output':out}}
(root/'observations/quality-and-tests.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
# Close only the dedicated evidence display loop. Keep the recovery supervisor and workers running.
(root/'latest/control.json').write_text(json.dumps({'stop':True}),encoding='utf8')
print(json.dumps({k:v if k!='nodeTests' else {'status':v['status'],'exit':v['exit'],'tests':36} for k,v in result.items()},ensure_ascii=False))
