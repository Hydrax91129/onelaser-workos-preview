'use strict';
// PREVIEW ONLY: a fake in-browser API with sample data, so the changed frontend can be clicked
// through without touching craftos.app. Nothing here is sent anywhere.
window.WORKOS_CONFIG = Object.freeze({ mode: 'live', apiBase: '/api' });
(() => {
  const now = new Date(), iso = d => new Date(d).toISOString(), day = n => iso(now.getTime() + n * 864e5);
  const me = { id:'u1', display_name:'Elian', display_name_zh:'袁勇', display_name_en:'Elian', role:'manager', isAdmin:true, department_id:'d1', grants:[], email:'elian@example.com', active:true };
  const kc = { id:'u2', display_name:'KC', display_name_zh:'KC', display_name_en:'KC', role:'manager', isAdmin:true, department_id:'d1', active:true };
  const amy = { id:'u3', display_name:'Amy', display_name_zh:'Amy', display_name_en:'Amy', role:'member', department_id:'d1', manager_id:'u1', active:true };
  const config = {
    groups:[{id:'todo',en:'To-Do',zh:'待办任务',color:'#579bfc'},{id:'completed',en:'Completed',zh:'已完成',color:'#00c875'}],
    priority:[['urgent','紧急','Urgent','#df2f4a'],['high','高','High','#6846a5'],['medium','中','Medium','#8581df'],['low','低','Low','#8eb8f9'],['','未设','Unassigned','#797e95']].map(([id,zh,en,color])=>({id,zh,en,color})),
    status:[['working','进行中','Working on it','#fdab3d'],['hold','暂停','On hold','#e2445c'],['review','待验收','In review','#579bfc'],['done','完成','Done','#00c875'],['not_started','未开始','Not started','#c4c4c4']].map(([id,zh,en,color])=>({id,zh,en,color})),
    category:[]
  };
  let seq = 10;
  // Sample deliverable images (drawn here) and any images uploaded during the preview; nothing leaves the browser.
  const pic = (bg, label) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420"><rect width="600" height="420" fill="' + bg + '"/><text x="300" y="220" font-size="44" fill="#fff" text-anchor="middle" font-family="sans-serif">' + label + '</text></svg>');
  const files = new Map([['a1', pic('#3b82f6', 'v1 配件主图 1')], ['a2', pic('#0ea5e9', 'v1 配件主图 2')], ['a3', pic('#f59e0b', 'v2 补图 1')], ['a4', pic('#10b981', 'v2 补图 2')]]);
  const att = (id, name) => ({ id, name, mime:'image/svg+xml', size:48000, uploader_id:'u1' });
  const fixImages = root => {
    for (const el of root.querySelectorAll?.('[data-src*="/attachments/"]') || []) { const id = el.dataset.src.split('/').pop(); if (files.has(id)) el.dataset.src = files.get(id); }
    for (const el of root.querySelectorAll?.('img[src*="/attachments/"]') || []) { const id = el.getAttribute('src').split('/').pop(); if (files.has(id)) el.src = files.get(id); }
  };
  new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && fixImages(n)))).observe(document.documentElement, { childList:true, subtree:true });
  const base = (id, title, extra = {}) => ({ id, title, version:1, created_at:day(-3), updated_at:day(-1), last_update_at:day(-1), owner_id:'u1', created_by:'u1', reviewer_id:'u2', source:'self', due_at:day(4), baseline_due_at:day(4), board_group_id:'todo', effective_group_id:'todo', board_status:'working', board_priority:'high', board_category:'', board_notes:'', status:'planned', submission_version:0, submissions:[], reviews:[], update_count:0, ...extra });
  const tasks = [
    base('t1','Black Fridya 活动页面',{ description:'制作一个 Black Friday 活动页面设计，目的是承接 Black Friday Sale 流量', criteria:['制作一个 Black Friday 活动页面设计，目的是承接 Black Friday Sale 流量'], board_priority:'urgent', due_at:day(2) }),
    base('t2','十一月邮件营销排期',{ description:'整理 11 月的邮件营销计划，覆盖黑五和网一两个节点。', criteria:['给出每封邮件的主题和发送日期','KC 确认排期'], board_priority:'medium', due_at:day(6), board_status:'not_started' }),
    base('t3','整理 X 系列产品图',{ description:'把 X 系列的新产品图整理到共享盘，按型号分好文件夹。', criteria:['每个型号至少 5 张图','文件命名统一'], board_priority:'low', due_at:day(9), source:'direct', created_by:'u2', assigned_by:'u2' }),
  ];
  const uploads = new Map();
  Object.assign(tasks[0], { status:'submitted', board_status:'review', version:3, submission_version:2, reviews:[], submissions:[
    { id:'s1', version:1, title:'网站配件页，大图加 logo', description:'1、网站配件页，大图加 logo', created_at:day(-1), attachments:[att('a1','配件主图-1.png'), att('a2','配件主图-2.png')] },
    { id:'s2', version:2, title:'补图', description:'补图', created_at:iso(now), attachments:[att('a3','补图-1.png'), att('a4','补图-2.png')] } ] });
  for (const t of tasks.slice(1)) Object.assign(t, { submission_version:0, submissions:[], reviews:[] });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers:{ 'Content-Type':'application/json' } });
  const view = { sort:[{field:'priority',direction:'asc'},{field:'due',direction:'asc'}], groupBy:'group', hidden:[], collapsed:[] };
  const board = () => ({ config, version:1, items:structuredClone(tasks), view:structuredClone(view), serverNow:iso(now), personalGroups:[] });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.pathname.endsWith('/build-info.json')) return json({ frontendCommit:'' });
    if (!url.pathname.startsWith('/api/') && !url.pathname.includes('/api/')) return realFetch(input, init);
    const path = url.pathname.slice(url.pathname.indexOf('/api/') + 4), method = (init.method || 'GET').toUpperCase(), body = init.body ? JSON.parse(init.body) : null;
    await new Promise(r => setTimeout(r, 120));
    let m;
    if ((m = path.match(/^\/tasks\/([^/]+)\/attachments$/)) && method === 'POST') { const id = 'up' + (++seq); files.set(id, 'data:' + body.mime + ';base64,' + body.dataBase64); uploads.set(id, { id, name:body.name, mime:body.mime, size:Math.round(body.dataBase64.length * .75), uploader_id:'u1' }); return json(uploads.get(id), 201); }
    if ((m = path.match(/^\/tasks\/([^/]+)\/submissions$/)) && method === 'POST') { const t = tasks.find(x => x.id === m[1]); const version = t.submission_version + 1; t.submissions.push({ id:'s' + (++seq), version, title:body.description.split('\n')[0].slice(0, 60), description:body.description, created_at:iso(Date.now()), attachments:(body.attachmentIds || []).map(id => uploads.get(id)) }); t.submission_version = version; t.version += 1; t.status = 'submitted'; return json({ submission:t.submissions.at(-1), taskVersion:t.version }, 201); }
    if (path === '/auth/csrf') return json({ csrfToken:'preview' });
    if (path === '/capabilities') return json({ assignTasks:true, taskCompletion:true, orgProfiles:true, feedback:true, projects:false });
    if (path === '/me') { return json(me); } 
    if (path === '/directory') return json({ items:[me, kc, amy], reviewers:[], former:[] });
    if (path === '/tasks' && method === 'GET') return json({ items:structuredClone(tasks) });
    if (path === '/tasks' && method === 'POST') { const t = base('t' + (++seq), body.title, { description:body.description, criteria:body.criteria, board_priority:body.boardPriority, due_at:body.dueAt, baseline_due_at:body.dueAt, board_status:'not_started', board_group_id:body.boardGroupId || 'todo', effective_group_id:body.boardGroupId || 'todo', parent_task_id:body.parentTaskId, created_at:iso(Date.now()), last_update_at:iso(Date.now()) }); tasks.unshift(t); return json(t, 201); }
    if (path.startsWith('/task-board') && method === 'GET') return json(board());
    if (path.startsWith('/task-board')) return json({ saved:true, config, version:1 });
    if ((m = path.match(/^\/tasks\/([^/]+)\/board$/))) { const t = tasks.find(x => x.id === m[1]); const map = { priority:'board_priority', status:'board_status', dueAt:'due_at', ownerId:'owner_id', notes:'board_notes', groupId:'board_group_id' }; for (const [k, v] of Object.entries(body)) if (k !== 'expectedVersion') t[map[k] || k] = v; t.version++; t.updated_at = t.last_update_at = iso(Date.now()); return json(structuredClone(t)); }
    if ((m = path.match(/^\/tasks\/([^/]+)\/(evaluations|analysis-jobs|updates)$/))) return json({ items:[] });
    if ((m = path.match(/^\/tasks\/([^/]+)$/))) { const t = tasks.find(x => x.id === m[1]); return t ? json(structuredClone(t)) : json({ error:{ code:'NOT_FOUND', message:'任务不存在' } }, 404); }
    if (['/objectives', '/key-results', '/projects', '/notifications/preview', '/feedback'].includes(path)) return json({ items:[] });
    if (path === '/org/chart') return json({ items:[me, kc, amy] });
    if (method !== 'GET') return json({ saved:true });
    return json({ items:[] });
  };
})();
