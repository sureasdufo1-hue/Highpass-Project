from copy import deepcopy
from pathlib import Path
from docx import Document
from docx.enum.text import WD_BREAK, WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.shared import Pt, Cm
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

SOURCE = Path(r"C:\Users\user\Downloads\모바일분석 보고서.docx")
OUTPUT = Path(r"C:\Users\user\Documents\New project\모바일분석_보고서_종합보안권고_시큐어코딩_보강본.docx")

ITEMS = [
    dict(code="MOB-FIN-011", title="[전자금융] OS 변조 탐지 기능 적용", risk="5", priority="P1",
         problem="단일 Root 파일이나 su 명령 확인만으로는 우회에 취약하며, 현재 앱에서 다중 신호 기반 단말 무결성 통제가 확인되지 않았다.",
         impact="변조 단말에서 후킹·메모리 조작·인증정보 탈취 및 금융 기능 변조 가능성이 증가한다.",
         goal="로컬 변조 신호, 플랫폼 무결성 결과와 서버 위험평가를 결합하여 고위험 기능을 제한한다.",
         method="Build 태그, su 경로, 알려진 Root 관리 앱 등 복수 신호를 수집하고 Play Integrity 토큰은 서버에서 검증한다. 클라이언트 결과만으로 최종 신뢰를 부여하지 않는다.",
         done="Nox Root 활성·비활성 환경과 정상 단말에서 오탐·미탐을 기록하고, 서버 정책이 고위험 변조 단말의 민감 기능을 제한한다.",
         lang="Kotlin", code_text='''fun localRootSignals(pm: PackageManager): Set<String> = buildSet {
    if (Build.TAGS?.contains("test-keys") == true) add("TEST_KEYS")
    listOf("/system/bin/su", "/system/xbin/su", "/sbin/su")
        .filter { File(it).exists() }.forEach { add("SU_BINARY") }
    runCatching { pm.getPackageInfo("<ROOT_MANAGER_PACKAGE>", 0) }
        .onSuccess { add("ROOT_MANAGER") }
}
// Play Integrity token은 서버로 전송하여 nonce·app/device verdict를 검증한다.''',
         commands='''adb shell id
adb shell which su
adb shell getprop
adb shell pm list packages''',
         expected="정상 단말은 허용되고, Root 신호 또는 서버에서 검증된 무결성 실패가 있는 단말은 정책에 따라 로그인·거래 등 민감 기능이 제한되며 이벤트가 서버에 기록되어야 한다."),
    dict(code="MOB-FIN-012", title="[전자금융] 악성코드 방지", risk="5", priority="P1",
         problem="Frida·후킹 도구·위험 앱·비정상 프로세스에 대한 탐지 및 서버 연계 통제가 확인되지 않았다.",
         impact="공격자가 런타임 함수를 후킹하여 인증·검증 로직을 우회하거나 민감정보를 탈취할 수 있다.",
         goal="여러 후킹·위험 신호를 조합하고 탐지 결과를 서버 위험평가 및 기능 제한 정책에 연계한다.",
         method="프로세스명 하나에 의존하지 않고 로드된 maps, 알려진 후킹 패키지, 무결성 결과와 보안모듈 신호를 종합한다. 탐지 이벤트에는 원문 민감정보를 포함하지 않는다.",
         done="Frida Server 실행, 후킹 패키지 설치 및 정상 환경에서 각각 재시험하여 탐지·정책·서버 이벤트 기록이 의도대로 동작한다.",
         lang="Kotlin", code_text='''fun runtimeHookSignals(): Set<String> = buildSet {
    val maps = runCatching { File("/proc/self/maps").readText() }.getOrDefault("")
    if (listOf("frida", "xposed", "substrate").any { maps.contains(it, true) })
        add("HOOK_LIBRARY")
}
// 결과는 단말 무결성 verdict와 함께 서버 위험평가 API로 전송한다.''',
         commands='''adb shell ps -A
adb shell ps -A | grep -i frida
frida-ps -U''',
         expected="Frida 또는 승인되지 않은 후킹 환경에서 위험 신호와 서버 이벤트가 생성되고 민감 기능이 제한되어야 한다. 정상 환경의 오탐 여부도 함께 확인한다."),
    dict(code="MOB-FIN-018", title="[전자금융] 프로그램 무결성 검증", risk="5", priority="P1",
         problem="APK 재서명·리패키징과 DEX/Native/Resource 변조를 식별하는 검증 근거가 확인되지 않았다.",
         impact="변조 APK에 악성 로직이 삽입되어 정상 앱으로 위장·재배포될 수 있다.",
         goal="배포 서명 인증서와 아티팩트 해시를 기준화하고 런타임·서버·CI 단계에서 무결성을 교차 검증한다.",
         method="SigningInfo에서 현재 인증서 SHA-256을 계산해 승인값과 비교하고, CI에서 APK hash와 apksigner 결과를 배포 승인 증적으로 보존한다.",
         done="정상 Release APK는 검증에 성공하고, 재서명 또는 1 byte 변조 APK는 설치·실행 또는 서버 민감 기능 단계에서 거부된다.",
         lang="Kotlin", code_text='''val info = packageManager.getPackageInfo(
    packageName, PackageManager.GET_SIGNING_CERTIFICATES)
val cert = info.signingInfo.apkContentsSigners.first().toByteArray()
val actual = MessageDigest.getInstance("SHA-256")
    .digest(cert).joinToString("") { "%02X".format(it) }
check(actual == "<EXPECTED_CERT_SHA256>") { "Untrusted app signature" }''',
         commands='''apksigner verify --verbose app-release.apk
apksigner verify --print-certs app-release.apk
Get-FileHash .\\app-release.apk -Algorithm SHA256''',
         expected="apksigner 검증이 성공하고 인증서 digest와 승인된 값이 일치해야 한다. 재서명·변조본은 무결성 검증에서 실패해야 한다."),
    dict(code="MOB-FIN-020", title="[전자금융] 소스코드 난독화 적용", risk="4", priority="P2",
         problem="Release APK에서 클래스·메서드·제어흐름이 쉽게 식별되어 역공학 난이도가 낮다.",
         impact="공격자가 중요 로직, 엔드포인트 및 취약 지점을 빠르게 식별할 수 있다.",
         goal="Release 빌드에 R8·리소스 축소를 적용하고 중요 로직과 Secret은 서버로 이전한다.",
         method="Release buildType에서 minify와 shrinkResources를 활성화하고 최소 keep rule만 유지한다. mapping.txt는 접근 통제된 CI 산출물로 관리한다.",
         done="Release 기능 회귀 테스트를 통과하고 JADX에서 내부 클래스·메서드 의미가 축약되며 장기 Secret이 발견되지 않는다.",
         lang="build.gradle", code_text='''android {
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile(
                'proguard-android-optimize.txt'), 'proguard-rules.pro'
            debuggable false
        }
    }
}''',
         commands='''./gradlew clean assembleRelease
jadx -d output app-release.apk
jadx --show-bad-code app-release.apk''',
         expected="Release 빌드가 정상 동작하고 JADX 결과에서 식별자와 구조 파악 난이도가 증가해야 한다. 난독화는 Secret 보호 수단으로 간주하지 않는다."),
    dict(code="MOB-FIN-021", title="[전자금융] 디버깅 탐지기능 적용", risk="4", priority="P2",
         problem="Release 디버그 비활성화와 런타임 debugger/JDWP/TracerPid 탐지 근거가 확인되지 않았다.",
         impact="공격자가 실행 흐름·변수·인증 상태를 조작하거나 민감정보를 관찰할 수 있다.",
         goal="Release 디버깅을 차단하고 복수의 런타임 신호를 서버 위험평가와 결합한다.",
         method="Manifest/Gradle에서 debuggable=false를 강제하고 Debug API와 /proc/self/status의 TracerPid를 확인한다. Client-side 탐지 단독으로 보안을 보장하지 않는다.",
         done="Release APK가 debuggable=false이고 adb jdwp/JDB 연결이 불가능하며 탐지 이벤트가 서버 정책에 반영된다.",
         lang="AndroidManifest.xml / Kotlin", code_text='''<application android:debuggable="false" ... />

fun debuggerDetected(): Boolean {
    if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return true
    val status = File("/proc/self/status").readLines()
    return status.firstOrNull { it.startsWith("TracerPid:") }
        ?.substringAfter(':')?.trim() != "0"
}''',
         commands='''adb shell pidof jakhar.aseem.diva
adb jdwp
apkanalyzer manifest application-id app-release.apk''',
         expected="Release 프로세스가 JDWP 목록에 노출되지 않고 JDB 연결이 성립하지 않아야 한다. 탐지 로직은 우회 가능성을 전제로 서버 정책과 병행한다."),
    dict(code="MOB-SER-008", title="단말기 내 중요정보 저장 방지", risk="5", priority="P1",
         problem="SharedPreferences·SQLite·파일·External Storage에 Password, PIN, Token 등 중요정보가 평문으로 남을 수 있다.",
         impact="단말 탈취, 백업, Root 또는 취약 컴포넌트를 통해 인증정보가 유출될 수 있다.",
         goal="Password/PIN은 저장하지 않고 필요한 최소 데이터만 앱 전용 저장소와 Keystore 기반 키로 보호한다.",
         method="장기 Credential 저장을 금지하고, 불가피한 단기 토큰은 짧은 수명·철회 정책과 Keystore 보호를 적용한다. External Storage 사용을 금지한다.",
         done="앱 데이터 디렉터리·DB·Preference·외부 저장소 재점검에서 보호 대상 평문이 발견되지 않는다.",
         lang="Kotlin", code_text='''// 금지: prefs.edit().putString("password", password).apply()
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
val prefs = EncryptedSharedPreferences.create(
    context, "secure_session", masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
// Password/PIN은 저장하지 않고, 불가피한 단기 세션 값만 저장한다.''',
         commands='''adb shell run-as jakhar.aseem.diva ls -la
adb shell run-as jakhar.aseem.diva find . -type f
adb shell find /sdcard -iname "*diva*"''',
         expected="앱 전용·외부 저장소에서 Password/PIN/카드번호/장기 Token의 평문이 발견되지 않아야 한다. run-as 불가 시 debuggable=false 상태도 함께 기록한다."),
    dict(code="MOB-SER-009", title="메모리 내 중요정보 노출 방지", risk="5", priority="P1",
         problem="민감 문자열이 immutable String 또는 불필요한 객체 복사로 메모리에 장시간 잔존할 수 있다.",
         impact="Root·후킹·메모리 덤프 권한을 획득한 공격자가 인증정보와 개인·금융정보를 복구할 수 있다.",
         goal="민감 데이터의 메모리 수명과 복사를 최소화하고 키는 Android Keystore에서 사용한다.",
         method="가능한 경우 CharArray/ByteArray로 처리하고 사용 직후 덮어쓴다. 장기 Secret을 앱 메모리에 상주시거나 로그·캐시에 복제하지 않는다.",
         done="동일 테스트 데이터를 사용해 FridaDump3로 재수집한 메모리에서 불필요한 평문 잔존이 확인되지 않는다.",
         lang="Kotlin", code_text='''fun authenticate(pin: CharArray) {
    try {
        val request = buildAuthRequest(pin) // 복사와 수명을 최소화
        sendOverTls(request)
    } finally {
        pin.fill('\\u0000')
    }
}
// Keystore 키는 export하지 않고 Cipher 연산에 직접 사용한다.''',
         commands='''frida-ps -U
python frida-dump.py -U -n <PROCESS_NAME>
rg -a "<TEST_SECRET>" .\\dump''',
         expected="동일 입력 후 재수집한 dump에서 보호 대상 데이터의 불필요한 평문 잔존이 확인되지 않아야 한다. OS·VM 특성상 완전 제거를 보장한다고 표현하지 않는다."),
    dict(code="MOB-SER-020", title="화면 내 중요정보 평문노출 방지", risk="5", priority="P1",
         problem="카드번호·계좌번호·Password·PIN이 화면에 전체 평문으로 표시될 수 있다.",
         impact="Shoulder Surfing, 화면 공유·캡처 및 악성 접근성 서비스로 중요정보가 노출될 수 있다.",
         goal="업무에 필요한 최소 자리만 표시하고 인증 입력과 재표시를 제한한다.",
         method="카드·계좌번호는 앞/뒤 최소 자리만 남겨 마스킹하고 Password/PIN 입력은 보안 inputType을 적용한다. 상세보기는 재인증과 시간 제한을 적용한다.",
         done="입력·확인·오류·복귀 화면 전체에서 원문이 불필요하게 표시되지 않고 예: 4111 **** **** 1111 형태로 표시된다.",
         lang="Kotlin / XML", code_text='''fun maskCard(value: String): String =
    value.filter(Char::isDigit).let { digits ->
        if (digits.length < 8) "****" else
            "${digits.take(4)} **** **** ${digits.takeLast(4)}"
    }

<EditText
    android:inputType="textPassword"
    android:importantForAutofill="noExcludeDescendants" />''',
         commands='''adb shell am force-stop jakhar.aseem.diva
adb shell monkey -p jakhar.aseem.diva 1
adb exec-out screencap -p > screen-after.png''',
         expected="화면과 캡처 이미지에서 전체 카드번호·계좌번호·Password·PIN이 식별되지 않아야 하며, 필요한 최소 정보만 마스킹 표시된다."),
    dict(code="MOB-SER-025", title="앱 소스코드 내 운영정보 노출 방지", risk="5", priority="P1",
         problem="APK는 역분석 가능하므로 하드코딩된 API Secret, Master Key, Credential은 회수될 수 있다.",
         impact="운영 API 오용, 위조 요청, 계정 탈취 또는 추가 시스템 침해로 이어질 수 있다.",
         goal="장기 Secret과 권한 판단을 서버로 이전하고 빌드·저장소 Secret Scanning을 적용한다.",
         method="APK에는 공개되어도 되는 endpoint와 식별자만 둔다. 사용자별 단기 토큰을 사용하고 노출 Credential은 즉시 폐기·재발급한다.",
         done="JADX·문자열 검색과 CI Secret Scan에서 운영 Secret·개인키·Credential이 발견되지 않는다.",
         lang="Kotlin", code_text='''// 금지: const val API_SECRET = "hard-coded-secret"
interface ApiService {
    @POST("session") suspend fun createSession(
        @Body request: LoginRequest
    ): SessionResponse // 서버가 단기 토큰을 발급
}
// 기기 고유키가 필요하면 Android Keystore에서 생성하고 export하지 않는다.''',
         commands='''jadx -d output app.apk
rg -i "password|secret|token|apikey|api_key|private_key" output
git grep -n -i -E "password|secret|api[_-]?key|private[_-]?key"''',
         expected="APK와 저장소에서 실제 운영 Secret이나 개인키가 발견되지 않아야 한다. 발견 시 삭제만 하지 말고 기존 Credential을 폐기·재발급한다."),
    dict(code="MOB-SER-026", title="화면 강제실행에 의한 인증단계 우회 방지", risk="5", priority="P1",
         problem="외부 노출 Activity가 화면 도달 자체를 인증 성공으로 간주하면 ADB/Intent로 정상 인증 흐름을 우회할 수 있다.",
         impact="비인가 사용자가 민감 화면·기능을 직접 실행하거나 후속 API를 호출할 수 있다.",
         goal="불필요한 컴포넌트 외부 노출을 차단하고 민감 화면마다 세션·권한·서버 Authorization을 재검증한다.",
         method="외부 접근이 필요 없는 Activity는 exported=false로 설정한다. 화면 진입과 API 호출 모두 서버가 세션과 사용자 권한을 확인한다.",
         done="비로그인 상태의 직접 Activity 호출이 차단되고, 세션 만료·권한 부족 상태에서 화면과 API 모두 접근이 거부된다.",
         lang="AndroidManifest.xml / Kotlin", code_text='''<activity
    android:name=".APICredsActivity"
    android:exported="false" />

override fun onStart() {
    super.onStart()
    if (!session.isAuthenticated() || !session.hasRole("AUTHORIZED_USER")) {
        finish(); return
    }
    viewModel.loadData() // 서버 API도 Authorization을 재검증
}''',
         commands='''adb shell am start -n jakhar.aseem.diva/.APICredsActivity
adb shell dumpsys package jakhar.aseem.diva | grep -i exported''',
         expected="외부 직접 호출은 Permission Denial 또는 Activity not exported로 실패해야 한다. 앱 내부 호출도 유효한 세션과 서버 권한이 없으면 민감정보를 반환하지 않아야 한다."),
    dict(code="MOB-SER-042", title="디버그 로그 내 중요정보 노출 방지", risk="5", priority="P1",
         problem="카드번호 등 중요정보가 Logcat에 평문으로 기록되는 취약 코드와 동작이 확인되었다.",
         impact="로그 접근 권한이나 디버깅 권한을 획득한 공격자가 인증·개인정보를 수집할 수 있다.",
         goal="민감 데이터 원문 로그를 금지하고 Release Debug/Verbose 로그를 제거한다.",
         method="로그에는 비민감 이벤트 ID와 마스킹 값만 기록한다. BuildConfig.DEBUG 조건도 민감정보 기록을 허용하는 근거로 사용하지 않는다.",
         done="테스트 카드·토큰·Password를 입력한 뒤 PID 기반 Logcat 검색에서 원문이 발견되지 않는다.",
         lang="Kotlin", code_text='''// 금지: Log.d("AUTH", "token=$accessToken")
if (BuildConfig.DEBUG) {
    Log.d("AUTH", "session request completed; requestId=$requestId")
}
// 운영 오류 로그에도 카드번호·Token·Session ID 원문을 전달하지 않는다.''',
         commands='''adb shell pidof jakhar.aseem.diva
adb logcat --pid=<PID> -c
adb logcat --pid=<PID> | grep -E "<TEST_CARD>|<TEST_TOKEN>"''',
         expected="보호 대상 테스트 값이 Logcat에 나타나지 않아야 하며 운영상 필요한 로그는 비민감 ID 또는 마스킹 값만 포함해야 한다."),
    dict(code="MOB-SER-043", title="백그라운드 화면 보호", risk="3", priority="P1",
         problem="Recent Apps 미리보기에 교육용 중요정보가 남고 FLAG_SECURE 계열 보호 호출이 확인되지 않았다.",
         impact="최근 앱 스냅샷, 화면 캡처·녹화 또는 Shoulder Surfing으로 중요정보가 노출될 수 있다.",
         goal="민감 Activity의 캡처·Recent Apps 노출을 제한하고 백그라운드에서 민감 View를 비운다.",
         method="FLAG_SECURE를 적용하고 onStop에서 비민감 placeholder로 교체한다. 복귀 시 세션·재인증 조건을 다시 확인한다.",
         done="스크린샷과 Recent Apps 미리보기에서 민감정보가 보이지 않고 복귀 후 세션 정책이 정상 동작한다.",
         lang="Kotlin", code_text='''override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
}
override fun onStop() {
    binding.sensitiveContainer.isVisible = false
    binding.privacyPlaceholder.isVisible = true
    super.onStop()
}''',
         commands='''adb shell am start -n jakhar.aseem.diva/<SENSITIVE_ACTIVITY>
adb exec-out screencap -p > secure-screen.png
adb shell input keyevent KEYCODE_APP_SWITCH''',
         expected="캡처가 차단되거나 비민감 화면만 저장되고, Recent Apps 미리보기에 카드번호·계좌·Credential이 식별되지 않아야 한다."),
    dict(code="MOB-SER-050", title="모바일 DeepLink 도용 제한여부", risk="5", priority="P1",
         problem="diva://app/web Custom Scheme이 외부 호출 가능하고 URI 소유권·파라미터 검증이 제한적이다.",
         impact="동일 Scheme 선점, 조작 URI, 피싱 및 비의도 WebView·민감 기능 실행으로 이어질 수 있다.",
         goal="HTTPS App Links와 도메인 검증을 사용하고 URI 구성요소·redirect를 Allowlist로 제한한다.",
         method="autoVerify App Link를 우선 적용하고 scheme/host/path/query를 모두 검증한다. DeepLink 수신 후에도 세션과 서버 권한을 재확인한다.",
         done="정상 App Link만 승인 Activity로 연결되고 변조 host/path/query/redirect, Custom Scheme 선점 및 미인증 호출이 차단된다.",
         lang="AndroidManifest.xml / Kotlin", code_text='''<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="<APP_DOMAIN>"
        android:pathPrefix="/app" />
</intent-filter>

val uri = intent.data ?: return finish()
if (uri.scheme != "https" || uri.host != "<APP_DOMAIN>" ||
    !uri.path.orEmpty().startsWith("/app")) finish()''',
         commands='''adb shell am start -a android.intent.action.VIEW -d "https://<APP_DOMAIN>/app"
adb shell am start -a android.intent.action.VIEW -d "https://evil.example/app"
adb shell pm get-app-links jakhar.aseem.diva''',
         expected="검증된 도메인의 허용 경로만 앱으로 연결되고 잘못된 host/path/query·미인증 민감 기능 호출은 안전하게 거부되어야 한다."),
]

def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)

def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(v)); node.set(qn("w:type"), "dxa")

def format_runs(paragraph, size=9.5, bold=False, font="맑은 고딕"):
    for run in paragraph.runs:
        run.font.name = font
        run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), font)
        run.font.size = Pt(size)
        run.font.bold = bold

def add_run_before(doc, anchor, paragraph):
    anchor.addprevious(paragraph._p)

def add_table_before(doc, anchor, rows):
    table = doc.add_table(rows=0, cols=2)
    table.autofit = False
    table.style = "Table Grid"
    widths = [Cm(3.1), Cm(13.0)]
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].width, cells[1].width = widths
        cells[0].vertical_alignment = cells[1].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        cells[0].text = label; cells[1].text = value
        set_cell_shading(cells[0], "D9D9D9")
        for cell in cells:
            set_cell_margins(cell)
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.05
                format_runs(p, 9, bold=(cell is cells[0]))
    anchor.addprevious(table._tbl)
    return table

def add_paragraph_before(doc, anchor, text="", style=None, code=False):
    p = doc.add_paragraph(style=style)
    p.add_run(text)
    p.paragraph_format.space_after = Pt(5 if not code else 0)
    p.paragraph_format.line_spacing = 1.08 if not code else 1.0
    if code:
        p.paragraph_format.left_indent = Cm(0.35)
        p.paragraph_format.right_indent = Cm(0.35)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.keep_together = True
        p_pr = p._p.get_or_add_pPr()
        shd = OxmlElement("w:shd"); shd.set(qn("w:fill"), "F2F2F2"); p_pr.append(shd)
        format_runs(p, 8.2, font="Consolas")
    else:
        format_runs(p, 9.5)
    anchor.addprevious(p._p)
    return p

def remove_between(start, end):
    node = start.getnext()
    while node is not None and node is not end:
        nxt = node.getnext()
        node.getparent().remove(node)
        node = nxt

doc = Document(SOURCE)
body = doc._element.body
heading6 = next(p for p in doc.paragraphs if p.text.strip() == "6. 종합 보안 권고")
heading7 = next(p for p in doc.paragraphs if p.text.strip() == "7. 최종 결론")
remove_between(heading6._p, heading7._p)

intro = add_paragraph_before(doc, heading7._p,
    "본 장은 상세 진단에서 확인한 취약점을 실제 개발·재점검 작업으로 전환하기 위한 실행 권고이다. 클라이언트 통제는 우회 가능성을 전제로 하며, 플랫폼 무결성 신호와 서버 측 인증·인가·위험평가를 병행한다.")

for idx, item in enumerate(ITEMS, start=1):
    if idx > 1:
        br = doc.add_paragraph(); br.add_run().add_break(WD_BREAK.PAGE); heading7._p.addprevious(br._p)
    h = add_paragraph_before(doc, heading7._p, f"6.{idx} {item['code']} {item['title']}", "Heading 2")
    h.paragraph_format.keep_with_next = True
    add_paragraph_before(doc, heading7._p, "보안 권고", "Heading 3").paragraph_format.keep_with_next = True
    add_table_before(doc, heading7._p, [
        ("진단 결과", "취약"), ("기준 위험도", item["risk"]), ("현재 문제", item["problem"]),
        ("보안상 영향", item["impact"]), ("개선 목표", item["goal"]), ("적용 방법", item["method"]),
        ("완료 기준", item["done"]), ("우선순위", item["priority"]),
    ])
    add_paragraph_before(doc, heading7._p, f"시큐어 코딩 / 설정 예시 ({item['lang']})", "Heading 3").paragraph_format.keep_with_next = True
    add_paragraph_before(doc, heading7._p, item["code_text"], code=True)
    add_paragraph_before(doc, heading7._p, "예시는 핵심 통제를 설명하기 위한 최소 구현이다. 실제 패키지·도메인·서명값은 승인된 배포 구성으로 치환하고 서버 검증과 함께 적용한다.")
    add_paragraph_before(doc, heading7._p, "재점검 명령어", "Heading 3").paragraph_format.keep_with_next = True
    add_paragraph_before(doc, heading7._p, item["commands"], code=True)
    add_paragraph_before(doc, heading7._p, "기대 결과: " + item["expected"])

br = doc.add_paragraph(); br.add_run().add_break(WD_BREAK.PAGE); heading7._p.addprevious(br._p)
h = add_paragraph_before(doc, heading7._p, "6.14 종합 개선 실행계획", "Heading 2")
h.paragraph_format.keep_with_next = True
table = doc.add_table(rows=1, cols=5)
table.style = "Table Grid"; table.autofit = False
headers = ["우선순위", "진단코드", "핵심 개선통제", "담당 영역", "완료 기준"]
for i, text in enumerate(headers):
    table.rows[0].cells[i].text = text; set_cell_shading(table.rows[0].cells[i], "BFBFBF")
controls = {
    "MOB-FIN-011":"단말 무결성·Root 위험평가", "MOB-FIN-012":"악성·후킹 환경 탐지", "MOB-FIN-018":"서명·APK 무결성",
    "MOB-FIN-020":"R8·리소스 축소", "MOB-FIN-021":"Release Anti-Debug", "MOB-SER-008":"로컬 중요정보 최소화",
    "MOB-SER-009":"메모리 평문 수명 최소화", "MOB-SER-020":"화면 마스킹", "MOB-SER-025":"Secret 서버 이전",
    "MOB-SER-026":"컴포넌트·서버 권한 검증", "MOB-SER-042":"민감 로그 제거", "MOB-SER-043":"FLAG_SECURE·Snapshot 보호",
    "MOB-SER-050":"검증된 App Links·URI Allowlist",
}
for item in ITEMS:
    cells = table.add_row().cells
    values = [item["priority"], item["code"], controls[item["code"]], "앱 개발 / 서버 / 보안", item["done"]]
    for i, value in enumerate(values):
        cells[i].text = value; set_cell_margins(cells[i], 80, 90, 80, 90)
        cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for p in cells[i].paragraphs:
            p.paragraph_format.space_after = Pt(0); p.paragraph_format.line_spacing = 1.0; format_runs(p, 7.8)
    cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
heading7._p.addprevious(table._tbl)

# 정적 목차 캐시를 최종 Word 렌더 결과에 맞춰 갱신한다.
toc6 = next(p for p in doc.paragraphs if p.style.name.lower().startswith("toc") and p.text.startswith("6. 종합 보안 권고"))
toc7 = next(p for p in doc.paragraphs if p.style.name.lower().startswith("toc") and p.text.startswith("7. 최종 결론"))
remove_between(toc6._p, toc7._p)
for idx, item in enumerate(ITEMS, 1):
    page = 39 + idx
    p = doc.add_paragraph(style="toc 2"); p.add_run(f"6.{idx} {item['code']} {item['title']}\t{page}")
    toc7._p.addprevious(p._p)
p = doc.add_paragraph(style="toc 2"); p.add_run("6.14 종합 개선 실행계획\t53"); toc7._p.addprevious(p._p)
toc7.text = "7. 최종 결론\t54"

# 문서 전체의 제목 고립을 줄이고 새 코드 블록 글꼴을 명시한다.
for p in doc.paragraphs:
    if p.style.name.startswith("Heading"):
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.keep_together = True

doc.core_properties.title = "모바일 애플리케이션 보안 취약점 분석 보고서 - 종합 보안 권고 보강본"
doc.core_properties.subject = "MOBILE 13개 취약점 시큐어 코딩 및 재점검 절차"
doc.save(OUTPUT)
print(OUTPUT)
