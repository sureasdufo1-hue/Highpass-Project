import {FAQS,FAQ_ROUTES,FAQ_VERSION,findFaq} from './faq-catalog.js';

// Local FAQ only: never fetch, persist, read auth/clinical DOM or infer live state.
export function createFaqAssistant({root,navigate,available=()=>true,surface='web'}) {
  const doc=root.ownerDocument,dialog=doc.createElement('dialog');
  dialog.id='mediq-faq';dialog.className='mq-faq';dialog.dataset.uiTheme='quiet-teal';
  dialog.setAttribute('aria-labelledby','mediq-faq-title');
  const node=(tag,text,cls)=>{const el=doc.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
  const button=(text,fn)=>{const el=node('button',text);el.type='button';el.addEventListener('click',fn);return el;};
  const header=node('header',null,'mq-faq-header'),title=node('h2','Medi Q 이용 도우미');title.id='mediq-faq-title';
  const subtitle=node('p','등록된 FAQ · 외부 AI 전송 없음');
  let launcher=null;
  const close=()=>{if(dialog.open)dialog.close();};
  header.append(title,button('닫기',close));
  const warning=node('p','서비스 이용 안내용 · 의료 판단을 제공하지 않습니다. 이름·환자번호·QR·토큰·접근 키를 입력하지 마세요.','mq-faq-note');
  const status=node('p','', 'mq-faq-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const recommendations=node('div',null,'mq-faq-recommendations');recommendations.setAttribute('aria-label','추천 질문');
  const transcript=node('div',null,'mq-faq-transcript');transcript.setAttribute('role','region');transcript.setAttribute('aria-label','이번 도움말 대화');
  const form=node('form'),label=node('label','사용법 질문');label.htmlFor='mediq-faq-query';
  const input=node('input');input.id='mediq-faq-query';input.type='text';input.maxLength=160;input.autocomplete='off';input.setAttribute('spellcheck','false');input.placeholder='예: 동의를 철회하려면?';
  const submit=node('button','질문하기');submit.type='submit';
  const clear=button('대화 지우기',()=>{transcript.replaceChildren();input.value='';status.textContent='대화를 지웠습니다.';input.focus();});
  form.append(label,input,submit);
  const footer=node('footer');footer.append(clear,node('small',`정적 안내 ${FAQ_VERSION} · 현재 처리 상태는 해당 화면에서 확인하세요.`));
  dialog.append(header,subtitle,warning,recommendations,transcript,status,form,footer);root.append(dialog);
  function reply(faq) {
    if(!available()){reset();return;}
    const item=node('section',null,'mq-faq-answer');item.append(node('h3',faq.question),node('p',faq.answer));
    const route=FAQ_ROUTES[faq.route];
    if(route&&typeof navigate==='function')item.append(button(route.label,()=>{if(!available()){reset();return;}close();navigate(route[surface]);}));
    transcript.append(item);
    while(transcript.children.length>8)transcript.firstElementChild.remove();
    status.textContent=`${faq.question} 안내를 추가했습니다.`;
    item.scrollIntoView({block:'nearest',behavior:'instant'});
  }
  function suggestions(items=FAQS.slice(0,4)) {
    recommendations.replaceChildren();
    for(const faq of items)recommendations.append(button(faq.question,()=>reply(faq)));
  }
  suggestions();
  form.addEventListener('submit',event=>{
    event.preventDefault();const result=findFaq(input.value);input.value='';
    if(!available()){reset();return;}
    if(result.kind==='matches'){suggestions(result.items);reply(result.items[0]);}
    else status.textContent={empty:'사용법 질문을 입력하거나 추천 질문을 선택하세요.',limit:'질문은 160자 이내로 입력하세요.',private:'개인정보·비밀정보로 보이는 입력은 처리하지 않았습니다. 일반적인 사용법만 질문하세요.',medical:'영상 판독·진단·치료 안내는 제공하지 않습니다. 의료진에게 문의하세요.',unknown:'등록된 안내를 찾지 못했습니다. 추천 질문을 선택하세요.'}[result.kind];
  });
  function open(event) {
    const otherModal=[...doc.querySelectorAll('dialog[open]')].some(el=>el!==dialog);
    if(!available()||otherModal)return;
    launcher=event.currentTarget;suggestions();dialog.showModal();input.focus();
  }
  const launchers=[...root.querySelectorAll('[data-faq-open]')];
  for(const el of launchers){el.setAttribute('aria-haspopup','dialog');el.setAttribute('aria-controls',dialog.id);el.addEventListener('click',open);}
  dialog.addEventListener('close',()=>{input.value='';if(available()&&launcher?.isConnected&&!launcher.closest('[hidden]'))launcher.focus();});
  function reset(){launcher=null;close();input.value='';transcript.replaceChildren();status.textContent='';suggestions();}
  doc.defaultView.addEventListener('pagehide',reset);
  return Object.freeze({reset,close});
}
