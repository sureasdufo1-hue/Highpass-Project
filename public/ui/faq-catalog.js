// Public, versioned usage guidance only. No patient data or live-status inference.
export const FAQ_VERSION = '2026-10-10.1';
export const FAQ_ROUTES = Object.freeze({
  images: Object.freeze({web:'images',mobile:'studies',label:'내 의료영상으로 이동'}),
  share: Object.freeze({web:'consent',mobile:'share',label:'동의·공유 화면으로 이동'}),
  activity: Object.freeze({web:'activity',mobile:'share-manage',label:'공유 이력·관리로 이동'}),
  security: Object.freeze({web:'storage',mobile:'vault',label:'보관·보안 화면으로 이동'}),
});
const entry = (id, question, keywords, answer, route) => Object.freeze({id,question,keywords:Object.freeze(keywords),answer,route});
export const FAQS = Object.freeze([
  entry('images','내 CT·MRI는 어디에서 보나요?',['영상','ct','mri','검사','어디'], '내 의료영상(모바일: 영상검사)에서 검사를 선택한 뒤 영상 보기 또는 단면/Cine 보기를 누르세요. 열람 가능 여부는 서버가 확인합니다. 이 도우미는 영상 내용을 읽거나 판독하지 않습니다.','images'),
  entry('share','다른 병원에 영상을 공유하려면 어떻게 하나요?',['공유','다른 병원','전달','보내'], '동의·공유(모바일: 공유·QR)에서 영상을 선택하세요. 수신 병원, 목적, Study·Series 범위, 권한, 기간을 확인한 뒤 명시적으로 승인하세요. 도우미는 승인을 대신하지 않습니다.','share'),
  entry('scope','공유 범위는 어디서 확인하나요?',['범위','study','series','선택'], '승인 전 요청 내용에서 제공·수신 병원과 허용 Study·Series를 확인하세요. 선택하지 않은 영상까지 허용된 것으로 해석하지 마세요. 원하는 범위가 아니면 승인하지 말고 요청을 확인하세요.','share'),
  entry('permission','영상 보기와 다운로드 권한은 무엇이 다른가요?',['다운로드','view_only','권한','보기'], 'VIEW_ONLY는 승인된 영상 열람 권한입니다. 다운로드나 PACS 반입 권한을 뜻하지 않습니다. 화면에 버튼이 있더라도 서버 권한 검증을 통과해야 합니다. 현재 요청의 권한을 동의 내용에서 확인하세요.','share'),
  entry('qr','QR로 병원에 연결하려면 어떻게 하나요?',['qr','연결','인계'], '동의 내용을 확인하고 QR 공유를 생성한 뒤, 제공되는 수신 의료진 화면의 연결 방식으로 전달하세요. QR에는 접근 권한과 관련된 값이 있으므로 채팅·스크린샷으로 공개하지 마세요. 실제 카메라 스캔은 별도 검증 대상입니다.','share'),
  entry('qr-expired','QR이 사라지거나 만료되면 어떻게 하나요?',['qr 만료','qr 사라','사라졌','만료'], 'QR이 사용·철회·만료 상태인지 공유 관리에서 확인하세요. 화면에서 QR이 사라진 것만으로 서버 처리가 완료됐다고 판단하지 마세요. 다시 공유하려면 현재 상태와 동의 내용을 확인하고 화면의 정식 절차를 이용하세요.','activity'),
  entry('qr-reuse','사용한 QR을 다시 사용할 수 있나요?',['재사용','다시 사용','사용한 qr'], '1회용 QR은 이미 사용한 뒤 다시 사용할 수 없습니다. 재연결이 필요하면 기존 상태를 확인하고 새로운 공유 절차를 진행하세요. 이 도우미는 QR을 재발급하지 않습니다.','share'),
  entry('revoke','동의를 철회하려면 어떻게 하나요?',['철회','취소','중지'], '동의·공유 또는 공유 관리에서 해당 동의를 선택하고 철회를 요청하세요. 확인창의 내용을 읽고 직접 확인하세요. 서버의 철회 결과를 확인해야 하며, 이미 전달된 자료의 모든 사본을 회수했다는 뜻은 아닙니다.','activity'),
  entry('duration','열람 기간과 토큰 만료는 무엇이 다른가요?',['기간','유효시간','토큰','시간'], '동의 기간과 단기 접근토큰의 유효시간은 서로 다릅니다. 동의가 유효해도 토큰은 먼저 만료될 수 있습니다. 만료된 접근을 임의로 연장하지 말고 화면의 요청 절차를 다시 확인하세요.','share'),
  entry('denied','접근이 거부되면 무엇을 확인하나요?',['거부','접근 안','열리지','오류'], '로그인 상태, 수신 병원, 요청 목적, 영상 범위, 권한, 동의·토큰의 유효 상태를 확인하세요. 거부를 해결하려고 다른 사람의 토큰이나 QR을 사용하지 마세요. 계속되면 비밀정보 없이 화면의 안내 문구만 담당자에게 전달하세요.','share'),
  entry('offline','인터넷 연결이 끊기면 어떻게 하나요?',['인터넷','오프라인','연결 끊','네트워크'], '정적 도움말은 앱 캐시가 준비된 경우 오프라인에서도 볼 수 있습니다. 영상·동의·QR·키 발급의 실제 상태는 연결이 필요합니다. 온라인으로 돌아온 뒤 정식 화면에서 확인하세요. 오프라인 영상 보관 기능이 검증됐다는 뜻은 아닙니다.'),
  entry('synthetic','현재 영상은 실제 환자 영상인가요?',['합성','실제 환자','데이터','팬텀'], '이 캡스톤 환경은 합성 환자와 합성 DICOM을 사용합니다. 실제 환자정보를 입력하거나 업로드하지 마세요. 화면과 영상은 진단·임상 판단 또는 운영 승인을 위한 자료가 아닙니다.','images'),
  entry('login','개발용 인증과 실제 본인확인은 무엇이 다른가요?',['인증','로그인','본인확인','생체'], '현재 발표 환경의 로그인과 모바일 잠금 해제는 개발용 인증입니다. 실제 병원 IdP, 본인확인, FIDO2·생체인증이 완료됐다는 의미가 아닙니다. 시연 접근 키는 도우미에 입력하지 마세요.'),
  entry('encrypted','영상은 어떻게 보호되나요?',['암호화','보호','key vault','보안'], '기존 서비스는 접근정책, 단기 권한, TLS·mTLS, 암호화 및 Key Vault 키 처리 경로를 사용합니다. 도우미는 키·토큰을 읽지 않으며 현재 연결 상태를 확인하지 않습니다. 운영 보안이나 법률 적합성 인증을 의미하지 않습니다.','security'),
  entry('history','공유 이력은 어디에서 확인하나요?',['이력','기록','누가','활동'], '환자 웹의 공유 이력, 모바일의 공유 관리에서 본인에게 제공되는 정보를 확인하세요. 보안 관리자용 전체 감사로그와는 다릅니다. 이 도우미는 이력이나 현재 처리 결과를 조회하지 않습니다.','activity'),
  entry('lock','모바일 앱을 잠그려면 어떻게 하나요?',['잠금','분실','로그아웃'], '모바일 상단의 잠금 버튼을 이용하세요. 공유 기기에서는 사용을 마친 뒤 잠그고 화면을 닫으세요. 기기 분실 대응이나 원격 삭제 기능이 실제 운영 수준으로 검증됐다고 가정하지 마세요.','security'),
]);
export function findFaq(query) {
  if (typeof query !== 'string' || !query.trim()) return {kind:'empty'};
  if (query.length > 160) return {kind:'limit'};
  if (/Bearer\s|eyJ[A-Za-z0-9_-]+\.|PRIVATE KEY|\b\d{6}-?\d{7}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d+\.){5,}\d+/i.test(query)) return {kind:'private'};
  if (/진단해|판독해|암인가|암 인가|종양|치료법|증상|약 처방/.test(query)) return {kind:'medical'};
  const normalized=query.normalize('NFKC').toLowerCase().trim();
  const ranked=FAQS.map(faq=>({faq,score:faq.question.toLowerCase()===normalized?100:faq.keywords.reduce((n,k)=>n+(normalized.includes(k.toLowerCase())?k.length:0),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
  return ranked.length?{kind:'matches',items:ranked.slice(0,3).map(r=>r.faq)}:{kind:'unknown'};
}
