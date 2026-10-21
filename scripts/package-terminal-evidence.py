import pathlib,json,hashlib,zipfile,shutil
root=pathlib.Path.home()/'Downloads'/'MediQ_리눅스터미널_증적_20261020'
report='''# Medi Q 리눅스 터미널 관제 증적 · 2026-10-20

## 작업 목적 / 관련 요구사항
실제 Azure Control VM에서 확인 가능한 관제 기록을 촬영하고 설명한다.
FR-037~FR-041. 기존 동의·토큰 경로(FR-001~005, FR-014~025)는 변경하지 않았다.

## 산출물
원본 PNG 17장, 주석 PNG 17장, 실제 출력 TXT 17개, 편집용 HTML 17개.
index.html에서 항목별 원본·주석·명령 출력에 접근할 수 있다.
원본은 Windows 콘솔 창의 실제 SSH 출력을 PrintWindow로 촬영했다.
새 터미널 화면을 그리거나 로그 내용을 이미지로 재구성하지 않았다.
주석은 원본 PNG를 그대로 포함하는 별도 HTML 레이어이며 원본 파일을 덮어쓰지 않았다.

## 검증 결과
|항목|결과|근거|
|---|---|---|
|실제 SSH 명령 실행·캡처|PASS|17개 모두 SSH exit 0, OBSERVATION COMPLETE, 쿼리 오류 없음|
|컨테이너·서비스 관측|PASS|01-runtime, 02-services 원본 및 출력|
|QR·동의·거부 감사기록 존재|PASS|05-qr, 06-consent, 07-denial 실제 DB 집계|
|DB 저장 위치 확인|PASS|12-storage: VM Docker 볼륨 / OS 파일시스템|
|현재 TCP DB 통신 TLS|PASS|13-db-tls: client backend 및 WAL sender TLSv1.3|
|비TLS TCP 차단|PASS|14-plaintext-deny: pg_hba 거부, 비밀번호 미사용|
|건강도우미 현재 SSH 연결 정상 여부|FAIL|11-helper-connection: UNAVAILABLE / relay·model UNKNOWN|
|모델·근거 메타데이터 저장 실적|NOT VERIFIED|10-helper-metadata: 컬럼 존재, 242개 로그 중 메타데이터 0개|
|A·B VM 양쪽 연결·CT·접수 종단 동작|NOT VERIFIED|Control 터널 관측만 수행. 피어 2의 최근 핸드셰이크 확인 필요|
|실제 환자 데이터 필드 암호화|NOT VERIFIED|15는 해시 건수만 확인. 암호문 저장 증거로 사용하지 않음|
|이번 작업 중 새 Azure 설정 조회|NOT VERIFIED|16은 이전 관측 시각이 붙은 서버 측 읽기 전용 스냅샷|
|WAF 수집 정상 여부|NOT VERIFIED|17의 제한된 최근 24h Docker 로그 출력 0행. 다른 보관 경로는 제외|

## 보안 검토 / 남아 있는 위험
- SQL은 BEGIN READ ONLY 및 5초 statement timeout을 사용했다.
- 토큰·개인키·환자/의료진 식별자·질문/답변 원문·해시 값은 조회하지 않았다.
- 감사 세션 ID는 표시용 해시 별칭으로만 노출했다. 이는 데이터 암호화를 뜻하지 않는다.
- WireGuard 피어 키와 주소, Docker 환경변수, WAF 요청 원문은 출력하지 않았다.
- 거부 건수는 공격 건수와 같지 않으며 과거 시연·시험을 포함한다.
- 서비스·DB·방화벽·권한·접근정책을 변경하거나 재기동하지 않았다.
- 서버에는 root 전용 읽기 전용 조회 스크립트만 추가했다. 업무 이벤트를 생성하지 않았다.
- 앱 권한에 Docker 소켓이나 관리자 권한을 새로 부여하지 않았다.
- Key Vault 설정은 디스크 SSE와 구분한다. 현재 DB 디스크는 플랫폼 관리 키 기반이다.
- 이번 범위는 Control VM 관측이다. B Gateway·A PACS 내부 로그 전체를 확인한 것으로 표현하지 않는다.
- 원본은 출력 단계에서 최소화된 실제 캡처이며, 제한 없는 로그 원본이 아니다.
- 캡처의 UTC와 capture-results.json의 KST를 구분한다.

## 재현 자료
queries/read-only.py에 실제 조회 명령과 출력 필터를 보관했다.
transcripts는 Windows PowerShell Tee-Object가 저장한 UTF-16 텍스트다.
manifest.json에 파일별 SHA-256을 기록했다. 해시는 증적 파일 무결성 확인용이다.
'''
(root/'README.md').write_text(report,encoding='utf8')
(root/'queries').mkdir(exist_ok=True)
shutil.copyfile('scripts/linux-terminal-evidence.py',root/'queries'/'read-only.py')
allowed=['original','annotated','editable','transcripts','queries']
files=[p for folder in allowed for p in (root/folder).rglob('*') if p.is_file()]
files += [root/name for name in ['index.html','README.md','capture-results.json','annotation-plan.json','render-results.json']]
manifest=[{'file':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)]
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
archive=root.with_suffix('.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files+[root/'manifest.json']:z.write(p,root.name+'/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for item in manifest:
  assert hashlib.sha256(z.read(root.name+'/'+item['file'])).hexdigest()==item['sha256']
print(json.dumps({'files':len(manifest),'originals':len(list((root/'original').glob('*.png'))),'annotated':len(list((root/'annotated').glob('*.png'))),'zip':str(archive)},ensure_ascii=False))
