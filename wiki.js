'use strict';
window.WorkOSWiki = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const imageHosts = new Set(['wiki.1laser.com','zohodesk.1laser.com','www.1laser.com','encrypted-tbn0.gstatic.com','weacrylic.com','images.openai.com','api2.mubu.com','document-image.mubu.com']);
  const topics = {'getting-started':['快速入门','Getting started'],troubleshooting:['故障排查','Troubleshooting'],downloads:['软件与下载','Software & downloads'],guides:['使用指南','Guides & everyday use']};
  const familyTranslations = {software:'软件与固件',accessories:'配件',materials:'材料',general:'通用帮助'};
  const allowedTags = new Set('a abbr b blockquote br caption code col colgroup dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img kbd li mark ol p pre s small span strong sub summary sup table tbody td th thead tfoot tr u ul'.split(' '));
  const dropTags = new Set(['script','style','template','svg','math','noscript','base','link','meta']);
  const embedTags = new Set(['iframe','object','embed','video','audio']);
  let language='zh', changed=()=>{}, active=false, canViewArchive=true, onNavigate=()=>{}, epoch=0;
  let library=null, searchIndex=null, libraryPromise=null, failure=null;
  const articles=new Map(), articlePromises=new Map(), articleErrors=new Set(), sourceIds=new Map();
  const tr=(zh,en)=>language==='en'?en:zh;
  const validId=id=>typeof id==='string'&&/^en-\d+$/.test(id);
  const familyName=id=>language==='zh'&&familyTranslations[id]||library?.families.find(f=>f.id===id)?.name||'OneLaser';
  const topicName=id=>topics[id]?tr(...topics[id]):tr('指南','Guide');
  const hasArticle=id=>library?.articles.some(a=>a.id===id);
  const isKnowledge=hash=>/^#knowledge(?:\/|$)/.test(hash||'');
  function route(){
    const hash=isKnowledge(window.location.hash)?window.location.hash:'#knowledge/';
    const [path,query='']=hash.slice('#knowledge'.length).replace(/^\//,'').split('?');
    return {path:path||'',params:new URLSearchParams(query)};
  }
  function href(path='',values={}){
    const params=new URLSearchParams();
    Object.entries(values).forEach(([key,value])=>{if(value!==undefined&&value!==null&&value!=='')params.set(key,String(value));});
    return '#knowledge/'+path+(params.size?'?'+params:'');
  }
  function returnRoute(){
    const current=route(),from=current.params.get('from');
    if(from&&from.length<1500&&/^#knowledge\/(?:search|downloads|family\/[a-z0-9-]+)?(?:\?|$)/.test(from))return from;
    return !current.path.startsWith('article/')&&current.path!=='archive'?href(current.path,Object.fromEntries(current.params)):'';
  }
  const articleHref=(id,anchor='',from=returnRoute())=>href('article/'+id,{anchor,from});
  const link=(url,label,classes='',extra='')=>`<a class="${esc(classes)}" href="${esc(url)}" ${extra}>${label}</a>`;
  function safeUrl(value,base,kind='link'){
    if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))return null;
    try{
      const url=new URL(value.trim(),base||window.location.href);
      if((url.protocol!=='https:'&&!(url.origin===window.location.origin&&url.protocol==='http:'))||url.username||url.password)return null;
      if(kind==='image'&&!imageHosts.has(url.hostname)&&!(url.origin===window.location.origin&&url.pathname.startsWith('/wiki/assets/')))return null;
      return url;
    }catch{return null;}
  }
  function assetUrl(value){
    if(typeof value!=='string')return '';
    if(value.startsWith('/assets/'))value='/wiki'+value;
    const url=safeUrl(value,window.location.href,'image');
    return url?(url.origin===window.location.origin?url.pathname+url.search:url.href):'';
  }
  function internalLink(value,article){
    const url=safeUrl(value,article.source_url);if(!url)return '';
    const isOldSite=url.origin==='https://yonge6.github.io'&&url.pathname.startsWith('/onelaser-support-center/');
    if(url.origin===window.location.origin||url.origin==='https://wiki.1laser.com'||isOldSite){
      const match=url.hash.match(/^#\/?article\/(en-\d+)(?:#(.*))?$/);
      if(match)return hasArticle(match[1])?articleHref(match[1],decodeSafe(match[2]||'')):'';
      if(value.startsWith('#')&&!value.startsWith('#/'))return articleHref(article.id,decodeSafe(value.slice(1)));
      if(isKnowledge(url.hash))return url.hash;
    }
    const mapped=sourceIds.get(url.origin+url.pathname.replace(/\/$/,''));
    if(mapped)return articleHref(mapped,decodeSafe(url.hash.slice(1)));
    return url.href;
  }
  function decodeSafe(value){try{return decodeURIComponent(value);}catch{return value;}}
  const headingId=(articleId,original)=>'wiki-source-'+articleId+'-'+encodeURIComponent(original);
  function sanitizeArticle(article){
    const template=document.createElement('template');template.innerHTML=article.body_html;
    const output=document.createElement('div'),seenIds=new Set();
    function copy(node,parent){
      if(node.nodeType===3){parent.appendChild(document.createTextNode(node.textContent));return;}
      if(node.nodeType!==1)return;
      const tag=node.localName.toLowerCase();
      if(dropTags.has(tag))return;
      if(embedTags.has(tag)){
        const original=node.getAttribute('src')||node.getAttribute('data');
        const url=safeUrl(original,article.source_url);
        if(url){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.className='wiki-embed-link';a.textContent=node.getAttribute('title')||url.href;parent.appendChild(a);}
        for(const child of Array.from(node.childNodes))copy(child,parent);
        return;
      }
      if(!allowedTags.has(tag)){for(const child of Array.from(node.childNodes))copy(child,parent);return;}
      const element=document.createElement(tag);
      const originalId=node.getAttribute('id');
      if(originalId&&!seenIds.has(originalId)){element.id=headingId(article.id,originalId);seenIds.add(originalId);}
      if(node.hasAttribute('title'))element.title=node.getAttribute('title');
      if(tag==='a'){
        const destination=node.hasAttribute('href')&&node.getAttribute('href')?internalLink(node.getAttribute('href'),article):'';
        if(destination){element.setAttribute('href',destination);if(!destination.startsWith('#knowledge/')){element.target='_blank';element.rel='noopener noreferrer';}}
      }
      if(tag==='img'){
        let value=node.getAttribute('src')||'';
        const localAsset=value.startsWith('/wiki/assets/')||value.startsWith('/assets/');
        if(localAsset)value=assetUrl(value);
        const url=value?safeUrl(value,localAsset?window.location.href:article.source_url,'image'):null;
        if(!url){const alt=node.getAttribute('alt');if(alt)parent.appendChild(document.createTextNode(alt));return;}
        element.src=url.href;element.alt=node.getAttribute('alt')||'';element.loading='lazy';element.referrerPolicy='no-referrer';
      }
      if(tag==='td'||tag==='th')for(const name of ['colspan','rowspan']){
        const value=node.getAttribute(name);if(value&&/^[1-9]\d{0,3}$/.test(value)&&Number(value)<=1000)element.setAttribute(name,value);
      }
      if(tag==='ol'&&/^-?\d+$/.test(node.getAttribute('start')||''))element.setAttribute('start',node.getAttribute('start'));
      for(const child of Array.from(node.childNodes))copy(child,element);
      parent.appendChild(element);
    }
    for(const child of Array.from(template.content.childNodes))copy(child,output);
    return {html:output.innerHTML,headings:(article.headings||[]).filter(h=>typeof h.id==='string'&&seenIds.has(h.id))};
  }
  async function getJson(path){
    const response=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('wiki_unavailable');return response.json();
  }
  function validateLibrary(value,index){
    if(!Array.isArray(value?.families)||!Array.isArray(value?.articles)||!Array.isArray(index))throw new Error('wiki_invalid_library');
    const ids=new Set(value.articles.map(a=>a.id));
    if(ids.size!==value.articles.length||value.articles.some(a=>!validId(a.id))||index.length!==ids.size||new Set(index.map(a=>a.id)).size!==ids.size||index.some(a=>!ids.has(a.id)||typeof a.body_text!=='string'))throw new Error('wiki_invalid_index');
    if(value.families.some(f=>!/^[-a-z0-9]+$/.test(f.id))||new Set(value.families.map(f=>f.id)).size!==value.families.length)throw new Error('wiki_invalid_families');
  }
  function notify(){if(active)changed();}
  function loadLibrary(){
    if(library)return Promise.resolve();if(libraryPromise)return libraryPromise;
    const current=epoch;failure=null;
    const pending=Promise.all([getJson('/wiki/data/library.json'),getJson('/wiki/data/search-index.json')]).then(([value,index])=>{
      if(current!==epoch)return;validateLibrary(value,index);library=value;searchIndex=index;sourceIds.clear();
      for(const item of value.articles){const url=safeUrl(item.source_url);if(url?.origin==='https://wiki.1laser.com')sourceIds.set(url.origin+url.pathname.replace(/\/$/,''),item.id);}
    }).catch(()=>{if(current===epoch)failure='library';}).finally(()=>{if(current===epoch){libraryPromise=null;notify();}});
    libraryPromise=pending;return pending;
  }
  async function ensureLoaded(){
    if(!active)return;
    const current=epoch;
    if(!library&&!failure)await loadLibrary();
    if(current!==epoch||!active||!library)return;
    const path=route().path;if(!path.startsWith('article/'))return;
    const id=path.slice(8);if(!validId(id)||!hasArticle(id)||articles.has(id)||articleErrors.has(id))return;
    if(articlePromises.has(id))return articlePromises.get(id);
    const pending=getJson('/wiki/data/articles/'+id+'.json').then(value=>{
      if(current!==epoch)return;
      if(value?.id!==id||typeof value.body_html!=='string'||!Array.isArray(value.headings))throw new Error('wiki_invalid_article');
      articles.set(id,value);
    }).catch(()=>{if(current===epoch)articleErrors.add(id);}).finally(()=>{if(current===epoch){articlePromises.delete(id);notify();scrollAnchor();}});
    articlePromises.set(id,pending);return pending;
  }
  function renderNav(){
    const path=route().path;
    return `<nav class="wiki-nav" aria-label="${tr('知识中心导航','Knowledge navigation')}">${[['','概览','Overview'],['search','全部指南','All guides'],['downloads','下载中心','Downloads'],...(canViewArchive?[['archive','档案与核对','Archive & review']]:[])].map(([id,zh,en])=>link(href(id),tr(zh,en),'wiki-nav-link'+(path===id?' wiki-active':''),path===id?'aria-current="page"':'')).join('')}</nav>`;
  }
  function searchForm(q='',family='',topic='',path='search'){
    return `<form class="wiki-search" data-wiki-search data-wiki-path="${esc(path)}"><label class="wiki-search-label" for="wiki-search-input">${tr('搜索文档全文','Search all documentation')}</label><div class="wiki-search-controls"><input id="wiki-search-input" class="wiki-search-input" name="q" value="${esc(q)}" maxlength="300" placeholder="${tr('搜索机型、问题或关键词…','Search a model, issue or keyword…')}"><input type="hidden" name="family" value="${esc(family)}"><input type="hidden" name="topic" value="${esc(topic)}"><button class="wiki-button" type="submit">${tr('搜索','Search')}</button></div></form>`;
  }
  function guideCard(article){
    return link(articleHref(article.id),`<span class="wiki-guide-category">${esc(familyName(article.family))} · ${esc(topicName(article.topic))}</span><h3 class="wiki-guide-title">${esc(article.title)}</h3><p class="wiki-guide-excerpt">${esc(article.excerpt||'')}</p><span class="wiki-guide-meta">${esc(tr('约 '+(article.read_minutes||1)+' 分钟阅读',(article.read_minutes||1)+' min read'))} <span aria-hidden="true">→</span></span>`,'wiki-guide-card');
  }
  const helperLinks=()=>`<div class="wiki-help-links">${[['https://forum.1laser.com','用户社区','Community'],['https://www.1laser.com/pages/contact-us','联系支持','Contact support'],['https://www.1laser.com','OneLaser 官网','OneLaser website']].map(([url,zh,en])=>link(url,tr(zh,en)+' ↗','wiki-help-link','target="_blank" rel="noopener noreferrer"')).join('')}</div>`;
  function contactPanel(){return `<section class="wiki-contact"><div><h2>${tr('有需要，我们来帮你。','Need a hand? We’re here to help.')}</h2><p>${tr('没有找到需要的内容？联系支持团队。','Can’t find what you need? Contact our support team.')}</p></div>${link('https://www.1laser.com/pages/contact-us',tr('联系 OneLaser','Contact OneLaser')+' <span aria-hidden="true">→</span>','wiki-contact-button','target="_blank" rel="noopener noreferrer"')}</section>`;}
  function home(){
    const downloads=library.articles.filter(a=>a.topic==='downloads').length;
    const picks=['firmware','air assist','autofocus'].map(term=>library.articles.find(a=>String(a.title).toLowerCase().includes(term))).filter(Boolean);
    return `<div class="wiki-heading"><h2>${tr('浏览指南','Explore guides')}</h2></div><div class="wiki-stats"><span>${library.articles.length} ${tr('篇指南','guides')}</span><span>${library.families.length} ${tr('个系列','families')}</span><span>${downloads} ${tr('篇下载资料','download guides')}</span></div>${searchForm()}<div class="wiki-popular"><span>${tr('常用搜索','Popular searches')}</span>${[['firmware','固件更新','Firmware'],['air assist','气辅','Air assist'],['autofocus','自动对焦','Autofocus']].map(([q,zh,en])=>link(href('search',{q}),tr(zh,en),'wiki-chip')).join('')}</div><div class="wiki-quick-links">${Object.entries(topics).map(([id,n])=>link(href(id==='downloads'?'downloads':'search',id==='downloads'?{}:{topic:id}),tr(...n),'wiki-quick-link')).join('')}</div><section class="wiki-section"><h2>${tr('产品与资料分类','Product and resource families')}</h2><div class="wiki-family-grid">${library.families.map(f=>{const image=assetUrl(f.image);return link(href('family/'+f.id),`${image?`<div class="wiki-family-image"><img src="${esc(image)}" alt="${esc(f.name)}" loading="lazy"></div>`:''}<div class="wiki-family-info"><h3>${esc(familyName(f.id))}</h3><span>${library.articles.filter(a=>a.family===f.id).length} ${tr('篇指南','guides')}</span><span aria-hidden="true">→</span></div>`,'wiki-family-card');}).join('')}</div></section><section class="wiki-section"><h2>${tr('常用指南','Useful starting points')}</h2><div class="wiki-guide-grid">${picks.map(guideCard).join('')}</div></section>${contactPanel()}${helperLinks()}`;
  }
  function catalog(current){
    const requested=current.path.startsWith('family/')?decodeSafe(current.path.slice(7)):current.params.get('family')||'';
    const family=library.families.some(f=>f.id===requested)?requested:'';
    const downloads=current.path==='downloads',q=(current.params.get('q')||'').slice(0,300);
    const requestedTopic=downloads?'downloads':current.params.get('topic')||'',topic=Object.hasOwn(topics,requestedTopic)?requestedTopic:'';
    const converted=q.replace(/自动对焦/g,'autofocus').replace(/固件/g,'firmware').replace(/气辅/g,'air assist').replace(/连接/g,'connect');
    const terms=converted.toLowerCase().split(/\s+/).filter(Boolean).slice(0,10);
    const items=searchIndex.filter(a=>(!family||a.family===family)&&(!topic||a.topic===topic)&&terms.every(term=>(a.title+' '+a.body_text).toLowerCase().includes(term))).map(a=>({a,score:terms.reduce((n,term)=>n+(a.title.toLowerCase().includes(term)?10:0)+(a.body_text.toLowerCase().split(term).length-1),0)})).sort((a,b)=>b.score-a.score||a.a.title.localeCompare(b.a.title)).map(x=>x.a);
    const path=downloads?'downloads':family?'family/'+family:'search';
    return `<div class="wiki-heading"><h2>${downloads?tr('下载中心','Downloads'):family?esc(familyName(family)):tr('全部指南','All guides')}</h2><p>${downloads?tr('软件、固件与说明书；下载前请核对原文中的机型和版本。','Software, firmware and manuals. Check model and version compatibility in the original guide.'):tr('搜索原始技术正文，或按产品与主题筛选。','Search the original technical text, or filter by product and topic.')}</p></div>${searchForm(q,family,topic,path)}<div class="wiki-filters" aria-label="${tr('产品系列','Product family')}">${link(href(downloads?'downloads':'search',{q,topic}),tr('全部产品','All products'),'wiki-chip'+(!family?' wiki-active':''))}${library.families.map(f=>link(href(downloads?'downloads':'family/'+f.id,{q,topic,...(downloads?{family:f.id}:{})}),esc(familyName(f.id)),'wiki-chip'+(family===f.id?' wiki-active':''))).join('')}</div>${downloads?'':`<div class="wiki-filters" aria-label="${tr('主题','Topic')}">${link(href(path,{q}),tr('全部主题','All topics'),'wiki-chip'+(!topic?' wiki-active':''))}${Object.entries(topics).map(([id,n])=>link(href(path,{q,topic:id}),tr(...n),'wiki-chip'+(topic===id?' wiki-active':''))).join('')}</div>`}<div class="wiki-results-meta" role="status"><span>${items.length} ${tr('篇指南','guides')}${q?' · “'+esc(q)+'”':''}</span><span>${tr('保留原文与来源','Original text and sources retained')}</span></div>${items.length?`<div class="wiki-guide-grid">${items.map(guideCard).join('')}</div>`:`<div class="wiki-empty"><h2>${tr('没有匹配的指南','No matching guides')}</h2><p>${tr('尝试更短的关键词，或调整产品和主题筛选。','Try a shorter phrase, or change the product and topic filters.')}</p>${link(href('search'),tr('浏览全部指南','Browse all guides'),'wiki-button')}</div>`}`;
  }
  function articleView(id){
    if(!validId(id)||!hasArticle(id))return errorView(tr('没有找到这篇指南','Guide not found'),false);
    if(articleErrors.has(id))return errorView(tr('暂时无法读取这篇指南','This guide is temporarily unavailable'));
    const article=articles.get(id);if(!article)return loading();
    const clean=sanitizeArticle(article),source=safeUrl(article.source_url),back=returnRoute()||href('family/'+article.family);
    const neighbors=library.articles.filter(a=>a.family===article.family&&a.id!==id).slice(0,9);
    const updated=new Date(article.source_updated_at),date=Number.isNaN(updated.getTime())?'—':updated.toLocaleDateString(language==='en'?'en-US':'zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'short',day:'numeric'});
    return `<div class="wiki-breadcrumb">${link(back,'← '+tr('返回列表','Back to guides'),'wiki-back')}${link(href('family/'+article.family),esc(familyName(article.family)),'wiki-breadcrumb-link')}<span>${esc(topicName(article.topic))}</span></div><div class="wiki-article-layout" data-wiki-article="${id}"><aside class="wiki-article-sidebar"><h2>${esc(familyName(article.family))}</h2>${link(href('family/'+article.family),tr('浏览本系列全部指南','All guides in this family'),'wiki-related-link')}${neighbors.map(a=>link(articleHref(a.id),esc(a.title),'wiki-related-link')).join('')}</aside><article class="wiki-article-main"><div class="wiki-heading"><h2>${esc(article.title)}</h2></div><div class="wiki-article-meta"><span>${esc(tr('约 '+article.read_minutes+' 分钟阅读',article.read_minutes+' min read'))}</span><span>${tr('来源更新：','Source updated: ')}${esc(date)}</span><button type="button" class="wiki-ask-inline" data-wiki-assistant-open>${tr('询问这篇指南','Ask about this guide')} →</button></div><p class="wiki-source-note">${tr('原 Wiki 内容仍待审核，请核对适用机型与固件版本。','Existing Wiki content is awaiting review. Check model and firmware applicability in the original source.')}</p><p class="wiki-original-note">${tr('技术正文保留英文原文；界面语言切换不会改写技术内容。','Technical text remains in its English original; changing the interface language does not rewrite it.')}</p><div class="wiki-article-body" lang="en">${clean.html}</div><div class="wiki-article-end">${link(back,'← '+tr('返回列表','Back to guides'),'wiki-back')}${link('https://www.1laser.com/pages/contact-us',tr('联系支持 ↗','Contact support ↗'),'wiki-help-link','target="_blank" rel="noopener noreferrer"')}</div></article><aside class="wiki-article-toc" aria-label="${tr('本页目录','On this page')}"><h2>${tr('本页目录','On this page')}</h2>${clean.headings.map(h=>link(articleHref(id,h.id),esc(h.text),'wiki-toc-link wiki-level-'+Math.min(6,Math.max(1,Number(h.level)||2)))).join('')}</aside></div>`;
  }
  const loading=()=>`<div class="wiki-loading" role="status">${tr('正在加载知识资料…','Loading documentation…')}</div>`;
  const errorView=(message,retry=true)=>`<div class="wiki-error" role="alert"><h2>${esc(message)}</h2>${retry?`<button type="button" class="wiki-button" data-wiki-retry>${tr('重试','Retry')}</button>`:''}${link(href('search'),tr('返回全部指南','Back to all guides'),'wiki-back')}</div>`;
  function render(){
    void ensureLoaded();
    const current=route();let content;
    if(failure)content=errorView(tr('暂时无法读取知识中心','Knowledge center is temporarily unavailable'));
    else if(!library)content=loading();
    else if(current.path.startsWith('article/'))content=articleView(current.path.slice(8));
    else if(current.path==='search'||current.path==='downloads'||current.path.startsWith('family/'))content=catalog(current);
    else content=home();
    return `<section class="wiki-root">${renderNav()}${content}</section>`;
  }
  function scrollAnchor(){
    if(!active)return;const current=route(),anchor=current.params.get('anchor'),id=current.path.slice(8);
    if(!anchor||!current.path.startsWith('article/'))return;
    const run=()=>{if(active&&route().path===current.path)document.getElementById(headingId(id,anchor))?.scrollIntoView?.({block:'start'});};
    if(window.requestAnimationFrame)window.requestAnimationFrame(run);else setTimeout(run,0);
  }
  function configure(options={}){
    if('language'in options)language=options.language==='en'?'en':'zh';
    if(typeof options.changed==='function')changed=options.changed;
    if('active'in options)active=!!options.active;
    if('canViewArchive'in options)canViewArchive=options.canViewArchive===true;
    if(typeof options.onNavigate==='function')onNavigate=options.onNavigate;
  }
  function reset(){epoch++;library=null;searchIndex=null;libraryPromise=null;failure=null;articles.clear();articlePromises.clear();articleErrors.clear();sourceIds.clear();active=false;}
  document.addEventListener('submit',event=>{
    const form=event.target;if(!active||!form.matches?.('[data-wiki-search]'))return;event.preventDefault();
    const values=new FormData(form),path=form.dataset.wikiPath||'search';
    window.location.hash=href(path,{q:String(values.get('q')||'').slice(0,300),family:values.get('family')||'',topic:values.get('topic')||''});
  });
  document.addEventListener('click',event=>{
    if(!active||!event.target.closest?.('[data-wiki-retry]'))return;
    failure=null;articleErrors.clear();void ensureLoaded();notify();
  });
  window.addEventListener?.('hashchange',()=>{
    if(!isKnowledge(window.location.hash))return;
    onNavigate(route().path==='archive'?'archive':'knowledge');
    if(active){void ensureLoaded();notify();scrollAnchor();}
  });
  return {configure,render,renderNav,reset,ensureLoaded,preload:()=>loadLibrary()};
})();
