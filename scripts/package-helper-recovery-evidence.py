"""Package post-recovery native captures without overwriting incident evidence."""
import pathlib,json,hashlib,zipfile,shutil
root=pathlib.Path.home()/'Downloads'/'MediQ_건강도우미_복구증적_20261020'
repo=pathlib.Path(__file__).resolve().parents[1]
report='''# 건강도우미 · WireGuard 복구 후 증적

## 목적 / 관련 요구사항
건강도우미 SSH 연결과 WireGuard 피어 복구, 실제 환자 웹 요청의 모델·근거
감사 메타데이터 저장 검증. FR-037~FR-041. 기존 인증·동의·토큰 경로는 유지했다.

## 확인한 원인과 조치
- Control VM에 Unix 소켓 파일은 남아 있었으나 SSH 리스너는 없었다.
- 모델 호스트 PC의 Ollama와 전용 loopback 중계가 중지돼 있었다.
- A 피어는 최근 통신했지만 B VM은 실행 목록에 없었다.
- 기존 Ollama qwen3.5:4b와 loopback 중계(127.0.0.1에만 바인딩)를 실행했다.
- 경로·파일 타입·inode와 리스너 부재를 확인한 뒤 끊어진 단일 Unix 소켓만
  제거했다. 환자 데이터 파일이나 컨테이너 볼륨은 삭제하지 않았다.
- 기존 호스트키 고정 SSH 연결과 비공개 소켓 전달을 재개하고 원래 소켓 권한을 복원했다.
- MAC/VMX 기준의 기존 B VM을 재개했다. 키·AllowedIPs·방화벽·NSG는 변경하지 않았다.
- 모델 최초 로드가 약 47초 걸렸다. 첫 환자 요청은 30초 제한으로 원문 안내에
  대체됐고 그 실패 이력은 보존했다. 이후 고정 모델을 미리 로드하고 재요청했다.

## 실제 요청 결과
Microsoft 환자 계정 로그인 후 Azure 환자 웹에서
“AFP 검사는 어떤 목적으로 하나요?”를 전송했다. 검사 수치·환자 식별정보는 모델에 보내지 않았다.

|항목|결과|근거|
|---|---|---|
|두 WireGuard 피어 최근 핸드셰이크|PASS|03-wireguard 실제 원본|
|비공개 SSH 전달·중계·모델 연결|PASS|11-helper-connection: REACHABLE / READY / AVAILABLE|
|실제 환자 웹 AI 답변 및 출처 표시|PASS|브라우저에서 답변·MedlinePlus 출처 확인, 같은 요청 DB 로그 대조|
|실제 요청 시작·완료 연결|PASS|19-request-pair, 요청 표시 별칭 9f8e738a00|
|실제 모델 생성·대체 안내 구분 저장|PASS|18: generationUsed=true, fallbackUsed=false, failureCode=null|
|모델·KB·근거 메타데이터|PASS|configuredModel=qwen3.5:4b, corpusVersion·medicalTestsVersion, sourceIds·sourceCount=1|
|요청별 가중치 버전 DB 저장|NOT VERIFIED|modelVersion=null. 설정 모델 태그와 혼동하지 않음|
|기존 DB·DR 유지|PASS|DB 시작 시각 유지, streaming 복제, 비TLS TCP 연결 0|
|비TLS TCP 접속 차단|PASS|14-plaintext-deny|
|병원 포털·CT·QR 전체 종단 흐름|NOT VERIFIED|이번 요청 범위 밖. 추가 TCP 탐색에서 B overlay 포트 연결은 확인하지 못함|
|실제 브라우저 UI PNG 촬영|NOT VERIFIED|브라우저 캡처 시간 초과. UI 성공 상태는 확인했고 서버 원본은 별도 촬영|

성공 요청의 시작은 2026-10-20T10:07:39.175Z, 완료는 10:08:00.661Z다.
21,486ms는 감사 이벤트 사이 간격이며 순수 모델 추론 시간과 다르다.
sourceIds=[school-demo-medical-test-afp-tumor-marker-AFP-DEF-01].
설정 모델 태그는 qwen3.5:4b다. 모델 호스트의 목록/로드 상태에서 관측한
다이제스트는 2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd이나,
그 값이 각 요청의 modelVersion 컬럼에 저장됐다고 주장하지 않는다.

## 증적과 제한
원본 터미널 PNG 10장 + 주석 PNG 10장 + 실제 명령 출력 + 편집용 HTML.
원본 이미지를 재작성하지 않았으며 설명은 별도 레이어다. 이전 장애 증적 폴더·ZIP은 유지했다.
시작·완료의 기록 존재 여부와 감사 해시 체인 전체 검증은 별개다.
질문 원문은 이 일반 검사명 시험 문장만 보고서에 쓰고 환자/계정/키/토큰 값은 제외했다.
SQL은 읽기 전용이다. DB에 성공 로그를 직접 삽입하거나 과거 실패 로그를 수정하지 않았다.
현재 모델은 이 PC에서 실행되므로 PC 종료·절전이나 터널 종료 시 이용할 수 없다.
자동 부팅 복구·장시간 안정성·30분 idle 이후 콜드 스타트는 별도 개선 대상이다.
이번 복구는 앱 재배포·DB 재기동·공개 포트 추가·Git 커밋/푸시를 하지 않았다.

## 파일
index.html: 원본·주석 갤러리 / transcripts: 실제 출력 / editable: 편집용 설명
queries: 실행한 조회 코드 / observations: 개인정보를 제외한 실제 관측 JSON
manifest.json: 파일별 SHA-256 / render-results.json: 이미지 로드·가로 넘침 검사
'''
(root/'README.md').write_text(report,encoding='utf8')
(root/'queries').mkdir(exist_ok=True);shutil.copyfile(repo/'scripts/linux-terminal-evidence.py',root/'queries/read-only.py')
(root/'observations').mkdir(exist_ok=True)
for name in ['diagnosis.json','latest-verification.json','model-warm.json']:
 p=repo/'artifacts/azure/helper-recovery-20261020'/name
 data=json.loads(p.read_text(encoding='utf8'))
 if name=='diagnosis.json':
  # Keep model facts, not infrastructure addresses/process IDs, in the presentation package.
  data={k:v for k,v in data.items() if k in ['observedAt','11434','11436']}
 (root/'observations'/name).write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf8')
files=[p for d in ['original','annotated','editable','transcripts','queries','observations'] for p in (root/d).rglob('*') if p.is_file()]
files += [root/n for n in ['README.md','index.html','capture-results.json','annotation-plan.json','render-results.json']]
manifest=[{'file':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)]
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
archive=root.with_suffix('.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files+[root/'manifest.json']:z.write(p,root.name+'/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for item in manifest:assert hashlib.sha256(z.read(root.name+'/'+item['file'])).hexdigest()==item['sha256']
print(json.dumps({'files':len(manifest),'zip':str(archive)},ensure_ascii=True))
