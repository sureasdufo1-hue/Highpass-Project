import { createHash, randomUUID } from 'node:crypto';
import { toSecurityAuditView } from './security-observatory-view.js';
import {rememberSecurityReport} from './security-period-report.js';
import {summarizeHelper} from './security-helper-monitor.js';
import {helperRequestDetails,qrLifecycle} from './security-detail-data.js';

const BAD = new Set(['DENIED', 'FAIL', 'FAILED', 'ERROR', 'FAILURE']);
export function eventCategory(action = '') {
  if (/^HEALTH_HELPER_/u.test(action)) return '건강도우미';
  if (/SECURITY_|AUDIT_/u.test(action)) return '관제';
  if (/LOGIN|AUTHENTICAT/u.test(action)) return '로그인';
  if (/CONSENT|SHARE|TRANSFER_REQUEST|TICKET/u.test(action)) return '동의·공유';
  if (/TOKEN|ACCESS|POLICY|DPOP/u.test(action)) return '접근·토큰';
  if (/IMAGE|DICOM|GATEWAY|PACS|ARCHIVE|DATA_PLANE/u.test(action)) return '영상·Gateway';
  return '기타';
}
export function resultGroup(result) {
  const value = String(result ?? '').toUpperCase();
  return BAD.has(value) ? '거부·실패' : ['SUCCESS', 'ALLOWED', 'OK', 'SUCCEEDED'].includes(value) ? '허용·성공' : '기타·경보';
}
export function parseEventQuery(params, now = new Date()) {
  const allowed = ['q', 'source', 'result', 'category', 'action', 'hospital', 'review', 'session', 'hours', 'page', 'until', 'from'];
  if ([...params.keys()].some(key => !allowed.includes(key)) || allowed.some(key => params.getAll(key).length > 1)) throw new Error('SECURITY_QUERY_INVALID');
  const until = params.get('until') || now.toISOString();
  const timestamp = Date.parse(until);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 1000 || timestamp < now.getTime() - 366 * 86400000) throw new Error('SECURITY_QUERY_INVALID');
  const pageText = params.get('page') || '0';
  if (!/^\d{1,5}$/u.test(pageText)) throw new Error('SECURITY_QUERY_INVALID');
  const query = Object.fromEntries(allowed.map(key => [key, params.get(key) || '']));
  if (Object.values(query).some(value => value.length > 120 || /[\u0000-\u001f\u007f]/u.test(value))) throw new Error('SECURITY_QUERY_INVALID');
  if (query.source && !['APP', 'AZURE_KEYVAULT', 'WAF', 'ENTRA'].includes(query.source)) throw new Error('SECURITY_QUERY_INVALID');
  if (query.review && !['UNREVIEWED', 'REVIEWED', 'INVESTIGATING', 'ACTION_REQUIRED', 'FALSE_POSITIVE'].includes(query.review)) throw new Error('SECURITY_QUERY_INVALID');
  if (!['', '1', '6', '24', '168', '744'].includes(query.hours) || (query.from && query.hours)) throw new Error('SECURITY_QUERY_INVALID');
  const start=query.from?Date.parse(query.from):timestamp-Number(query.hours||24)*3600000;
  if(!Number.isFinite(start)||start>=timestamp||timestamp-start>31*86400000)throw new Error('SECURITY_QUERY_INVALID');
  const hours=(timestamp-start)/3600000;
  return { ...query, hours, page: Number(pageText), until: new Date(timestamp).toISOString(), from: new Date(start).toISOString() };
}

export function buildEventIndex(logs, azure, reviews, query, waf = {status:'not_configured',events:[]}, entra = {status:'not_configured',events:[]}) {
  const from = Date.parse(query.from), until = Date.parse(query.until);
  const latestReviews = new Map();
  for (const review of reviews) {
    const key = `${review.source}:${review.eventRef}`;
    if (!latestReviews.has(key)) latestReviews.set(key, review);
  }
  const app = logs.map(log => {
    const view = toSecurityAuditView(log);
    return { ...view, eventRef: view.auditId, source: 'APP', time: view.createdAt, category: eventCategory(view.action), resultGroup: resultGroup(view.result) };
  }).filter(event => Date.parse(event.time) >= from && Date.parse(event.time) <= until);
  const vault = azure.status === 'available' ? (azure.events || []).map(event => ({
    source: 'AZURE_KEYVAULT', eventRef: event.eventRef, time: event.timeGenerated, action: event.operationName,
    result: event.resultType, reasonCode: event.resultSignature || 'NOT_PROVIDED', hospitalId: event.resource,
    actorId: '비공개', actorType: 'AZURE', auditSessionId: null, category: '키 보호', resultGroup: resultGroup(event.resultType),
  })).filter(event => Date.parse(event.time) >= from && Date.parse(event.time) <= until) : [];
  const firewall = waf.status === 'available' ? (waf.events || []).map(event => ({source:'WAF',eventRef:event.eventRef,time:event.time,
    action:'WAF_RULE_MATCH',result:event.result,reasonCode:'CRS_'+event.ruleId,hospitalId:'PUBLIC_WEB_WAF',actorId:'비공개',actorType:'WAF',
    auditSessionId:null,category:'웹 방화벽',resultGroup:resultGroup(event.result)})).filter(event => Date.parse(event.time)>=from && Date.parse(event.time)<=until) : [];
  const identity=entra.status==='available'?(entra.events||[]).map(event=>({...event,source:'ENTRA',action:'ENTRA_SIGN_IN',hospitalId:event.application,
    actorId:'비공개',actorType:'ENTRA',auditSessionId:null,category:'로그인',resultGroup:resultGroup(event.result)})).filter(event=>Date.parse(event.time)>=from && Date.parse(event.time)<=until):[];
  const events = [...app, ...vault, ...firewall, ...identity].map(event => ({ ...event, review: latestReviews.get(`${event.source}:${event.eventRef}`) || null }))
    .sort((a, b) => b.time.localeCompare(a.time) || String(a.eventRef).localeCompare(String(b.eventRef)));
  const q = query.q.toLocaleLowerCase('ko-KR');
  const filtered = events.filter(event => (!query.source || event.source === query.source)
    && (!query.result || event.resultGroup === query.result || event.result === query.result)
    && (!query.category || event.category === query.category)
    && (!query.action || event.action === query.action)
    && (!query.hospital || event.hospitalId === query.hospital)
    && (!query.session || event.auditSessionId === query.session)
    && (!query.review || (event.review?.status || 'UNREVIEWED') === query.review)
    && (!q || [event.action, event.result, event.reasonCode, event.hospitalId, event.category, event.eventRef, event.actorType].some(value => String(value || '').toLocaleLowerCase('ko-KR').includes(q))));
  const countBy = (items, field) => Object.entries(items.reduce((acc, event) => { const key = event[field] || '미확인'; acc[key] = (acc[key] || 0) + 1; return acc; }, {}))
    .map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const bucketHours=query.hours>48?24:1;
  const hours = Array.from({ length: Math.max(1,Math.ceil(query.hours/bucketHours)) }, (_, i) => ({ time: new Date(from + i * bucketHours * 3600000).toISOString(), count: 0, denied: 0 }));
  for (const event of app) { const bucket = Math.min(hours.length - 1, Math.floor((Date.parse(event.time) - from) / (bucketHours*3600000))); hours[bucket].count++; if (BAD.has(event.result)) hours[bucket].denied++; }
  const chart = { population: 'APP_STORED_RANGE', periodHours: query.hours, total: app.length, results: countBy(app, 'resultGroup'),
    reasons: countBy(app.filter(event => BAD.has(event.result)), 'reasonCode').slice(0, 6), categories: countBy(app, 'category'), hours,
    denied: app.filter(event => BAD.has(event.result)).length, unreviewed: app.filter(event => BAD.has(event.result) && !latestReviews.has(`APP:${event.eventRef}`)).length,
    imageEvents: app.filter(event => event.category === '영상·Gateway').length, helper:summarizeHelper(app) };
  return { query, from: query.from, until: query.until, total: filtered.length, page: query.page, pageSize: 30,
    events: filtered.slice(query.page * 30, (query.page + 1) * 30), chart,
    sources: { app: { status: 'available', total: app.length, scope: `저장된 앱 감사 기록 전체 · 선택 시점 이전 ${query.hours}시간` },
      azure: { status: azure.status, reason: azure.reason, count: vault.length, observedAt: azure.observedAt, scope: '최근 24시간 · 최신 최대 100건 조회', truncatedPossible: (azure.events || []).length === 100 },
      gateway: { status: chart.imageEvents ? 'events_observed' : 'no_events_observed', count: chart.imageEvents },
      entra: { status:entra.status,reason:entra.reason,count:identity.length,observedAt:entra.observedAt,scope:entra.scope||'프로젝트 앱 로그인 기록 · 조회 미설정',results:countBy(identity,'resultGroup'),
        diagnostics:'NOT VERIFIED · 2026-10-14 설정 조회 권한 오류',license:'2026-10-14 AAD_BASIC_EDU 확인 · P1/P2 미확인',truncatedPossible:(entra.events||[]).length===100 },
      waf: {status:waf.status,reason:waf.reason,count:firewall.length,observedAt:waf.observedAt,scope:waf.scope,truncatedPossible:true,
        rules:countBy(firewall,'reasonCode').slice(0,6),results:countBy(firewall,'result'),denied:firewall.filter(event=>event.result==='DENIED').length} },
    facets: { categories: [...new Set(events.map(event => event.category))], hospitals: [...new Set(events.map(event => event.hospitalId))].filter(Boolean), actions: [...new Set(events.map(event => event.action))].filter(Boolean) },
    helperRequests:helperRequestDetails(app),qrLifecycle:qrLifecycle(app),
    allEvents: events, filteredEvents: filtered };
}

export function createSecurityReport(index, body, actorId) {
  if (!body || Object.keys(body).some(key => !['events', 'format'].includes(key)) || !Array.isArray(body.events)
    || body.events.length < 1 || body.events.length > 50 || !['JSON', 'CSV', 'PRINT'].includes(body.format)) throw new Error('SECURITY_REPORT_INVALID');
  const references = new Set();
  const events = body.events.map(ref => {
    if (!ref || Object.keys(ref).some(key => !['source', 'eventRef'].includes(key)) || typeof ref.eventRef !== 'string' || ref.eventRef.length > 128) throw new Error('SECURITY_REPORT_INVALID');
    const key = `${ref.source}:${ref.eventRef}`;
    if (references.has(key)) throw new Error('SECURITY_REPORT_INVALID');
    references.add(key);
    const event = index.allEvents.find(event => event.source === ref.source && event.eventRef === ref.eventRef);
    if (!event) throw new Error('SECURITY_REPORT_EVENT_UNAVAILABLE');
    return event;
  }).sort((a, b) => a.time.localeCompare(b.time));
  const report = { reportId: `SEC-${randomUUID()}`, status: 'DRAFT', generatedAt: new Date().toISOString(), generatedBy: actorId,
    requestedFormat: body.format, scope: { from: index.from, until: index.until, sources: index.sources, selectedCount: events.length },
    title: '보안 사건 검토 보고서', events,
    limitations: ['선택한 이벤트의 검토 전 초안입니다. 사건 전체 또는 로그 수집 완전성을 보증하지 않습니다.', 'Key Vault·Entra는 각 최근 최대 100건입니다. Entra는 지정 앱 로그인만 포함하며 진단 설정·수집 완전성은 미검증입니다. WAF는 제한된 로그 표본의 규칙 이벤트이며 전체 요청·공격 건수 또는 차단률이 아닙니다.', '보고서 지문은 문서 내용 비교용이며 전자서명 또는 로그 원본성 인증이 아닙니다.'] };
  return rememberSecurityReport({ ...report, fingerprint: createHash('sha256').update(JSON.stringify(report)).digest('hex') });
}
