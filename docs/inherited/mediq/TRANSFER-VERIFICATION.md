# MediQ 기록 병합 검증

작업: MEDIQ-INHERIT-20261008 / 2026-10-08 (Asia/Seoul)
판정: **PASS — RECORD TRANSFER ONLY** / 하이패스 runtime port 및 전체 P0는 **NOT VERIFIED**.

## 수행 범위

MediQ 종료 기록 1개와 현재 상태 안내를 추가했다.
하이패스에 회고·선별 대응표·원문 발췌·manifest·이 증거를 추가하고 README/P0 계획에서 연결했다.
Git merge/cherry-pick/commit/push, 실행 코드 수정, migration, secret/영상/volume 복사는 수행하지 않았다.

## 실제 확인 결과

- 두 저장소 HEAD/status 및 AGENTS, 기존 기준선·최신 계획/시험 기록을 읽기 전용 확인.
- 원본 15개 파일 SHA-256·byte length 조회. manifest의 현재 source hash 15/15 일치.
- 원문 발췌 4개 marker·줄 수·원본 문장 비교: 오류 0.
  계획 문서의 Current heading을 Historical로 바꾼 부분만 원래 heading으로 복원하여 비교했다.
  발췌 줄 범위와 originalSourceSha256은 종료 안내 추가 **이전**, files hash는 안내 추가 **이후**다.
- MediQ/하이패스 종료 회고 파일 hash 동일: true.
- 시작/종료의 선택 원본 hash 비교: 13/15 불변.
  변경 2개는 의도한 MediQ README/계획 종료 안내. 후보 코드·시험 파일과 기존 시험 기록은 모두 불변.
- PowerShell manifest/hash/발췌/회고 검증 출력:
  `filesChecked=15, extractsChecked=4, closureCopiesEqual=true, failures=0, result=PASS_RECORD_TRANSFER`, exit0.
- 양쪽 저장소에서 `git -c core.safecrlf=false diff --check`: exit0.
- `git status --short -- <이번 문서 경로>`로 수정·추가 문서를 확인.
- SOURCE-MANIFEST.json JSON parse 성공.

재검증 핵심 명령 (PowerShell, MediQ 루트):

~~~powershell
$taskArchive = 'C:\Users\user\Documents\New project\docs\inherited\mediq'
$taskManifest = Get-Content -Raw -LiteralPath (Join-Path $taskArchive 'SOURCE-MANIFEST.json') | ConvertFrom-Json
foreach ($taskFile in $taskManifest.files) {
  $taskHash = (Get-FileHash -LiteralPath $taskFile.path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($taskHash -ne $taskFile.sha256) { throw 'SOURCE_HASH_MISMATCH' }
}
git -c core.safecrlf=false diff --check
git -C 'C:\Users\user\Documents\New project' -c core.safecrlf=false diff --check
~~~

## 편집 중 실패와 보완

manifest 교정 첫 patch는 동일 경로 delete/add 중복 때문에 거부되어 적용되지 않았다.
두 번째 patch는 shallow-copy 배열 변경으로 예상 원문이 달라져 거부되었다.
deep-copy 및 단일 Update File patch로 교정했고 최종 JSON/hash 검증을 통과했다.
원본 코드·시험 또는 역사적 실패 증거를 삭제한 것은 아니다.

## 미실행·한계

커밋 준비에서 신규 문서의 Markdown 강제 줄바꿈 공백이 staged diff 검사에 검출되어 제거했다.
공유 문서는 이번 종료·계승 안내 hunk만 index에 등록했다. 기존 미커밋 코드·시험·문서와
하이패스의 기존 미추적 P0 계획 전체는 이 기록 커밋에 포함하지 않는다.

- API/Web/unit/Orthanc/browser/full regression은 문서 정리 작업이므로 새로 실행하지 않았다.
- runtime port, 다중 Study, destination readback, 실제 deploy, 사람 검토 승인: NOT VERIFIED.
- 15개 hash는 전체 dirty worktree backup이 아니다. 원래 저장소/미커밋 자산은 그 위치에 보존한다.
- 기록된 과거 PASS를 이번 실행 또는 하이패스 PASS로 승격하지 않았다.
- Secret scan을 새로 수행한 것은 아니며 allowlist로 선택한 텍스트 기록만 가져왔다.
  .env·Token·개인키·DICOM·실행 artifact는 복사 대상에서 제외했다.
