import pathlib,json,hashlib,zipfile,datetime
out=pathlib.Path.home()/'Downloads'/'MediQ_관제증적_20261020'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
plan=json.loads((out/'capture-plan.json').read_text(encoding='utf8'))
renders=json.loads((out/'render-results.json').read_text(encoding='utf8'))
assert len(renders)==32 and not any(x['horizontalOverflow'] for x in renders)
for p in plan:
 for part in ('original','annotated'):assert (out/part/(p['slug']+'.png')).stat().st_size>10000
files=[{'file':p.relative_to(out).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='manifest.json']
manifest={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'LIVE_QUERY_REPORT_SCREENSHOTS_WITH_EXPLANATORY_ANNOTATIONS','actualPortalDashboardScreenshots':False,'screenshots':32,'publicationNotes':'Original report screenshots, not Portal UI; query-stage minimization and request pseudonyms applied.','files':files}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
with zipfile.ZipFile(out.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.rglob('*')):
  if p.is_file():z.write(p,p.relative_to(out))
assert all(sha(out/x['file'])==x['sha256'] for x in files)
print(json.dumps({'zip':str(out.with_suffix('.zip')),'files':len(files)+1,'screenshots':32,'sha256Verification':'PASS'},ensure_ascii=False))
