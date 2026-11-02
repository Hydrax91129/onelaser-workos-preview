(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels=[[0,'未开展','Not started'],[20,'严重滞后','Seriously behind'],[40,'部分完成','Partly complete'],[60,'接近完成','Nearly complete'],[80,'完成','Complete'],[100,'卓越完成','Exceptional']];
 const t=(lang,zh,en)=>lang==='en'?en:zh;
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 function orderImported(items){
  const ordered=items.slice(),groups=new Map();
  items.forEach((item,index)=>{
   const source=item.importSource,label=/^(O|KR)([1-9]\d*)$/.exec(source?.itemLabel||'');
   if(source?.provider!=='dingtalk'||!label||!Number.isSafeInteger(Number(label[2])))return;
   const key=JSON.stringify([item.org_id,item.department_id,item.owner_id,item.objective_id,source.period,label[1]]);
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push({item,index,ordinal:Number(label[2])});
  });
  for(const group of groups.values()){
   const sorted=group.slice().sort((a,b)=>a.ordinal-b.ordinal||a.index-b.index);
   group.forEach((slot,index)=>{ordered[slot.index]=sorted[index].item;});
  }
  return ordered;
 }
 function metric(kr={}){
  const distance=kr.direction==='decrease'?kr.baseline-kr.target:kr.target-kr.baseline;
  const quantified=finite(kr.baseline)&&finite(kr.target)&&['increase','decrease'].includes(kr.direction)&&Number.isFinite(distance)&&distance>0;
  const hasActual=finite(kr.actual);
  const done=quantified&&hasActual?(kr.direction==='decrease'?kr.baseline-kr.actual:kr.actual-kr.baseline):null;
  const ratio=quantified&&hasActual?(finite(kr.progress)?kr.progress:done/distance):null;
  return {quantified,hasActual,progress:ratio===null?null:Math.round(Math.max(0,Math.min(1,ratio))*100)};
 }
 function metricView(kr,lang='zh'){
  const m=metric(kr),tr=(zh,en)=>t(lang,zh,en);
  if(!m.quantified)return `<strong>${tr('未设量化指标','No quantitative metric set')}</strong><span>${tr('业务进度尚未定义','Business progress is not defined')}</span>`;
  return `<strong>${m.hasActual?esc(kr.actual):'—'} / ${esc(kr.target)} ${esc(kr.unit)}</strong><span>${m.progress===null?tr('未填实际值','No actual value entered'):m.progress+'%'}</span>${m.progress===null?'':`<div class="progress"><span style="width:${m.progress}%"></span></div>`}`;
 }
 function sourceDate(value,lang){
  if(!value)return '—';const text=String(value);if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const date=new Date(text);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(lang==='en'?'en-GB':'zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(date):text.replace('T',' ');
 }
 function importSourceView(source,lang='zh'){
  if(!source)return '';
  const tr=(zh,en)=>t(lang,zh,en);let url='';
  try{const parsed=new URL(source.sourceUrl);if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password)url=parsed.href;}catch{}
  const row=(label,value)=>`<div><dt>${label}</dt><dd>${esc(value||'—')}</dd></div>`;
  return `<details class="okr-import-source fine"><summary>${tr('钉钉原表','DingTalk source')}${source.itemLabel?' · '+esc(source.itemLabel):''}${source.deadlinePeriodMismatch===true?' · '+tr('日期待核对','Check dates'):''}</summary><dl class="okr-plan">${row(tr('源评分周期','Source review period'),source.period)}${row(tr('原截止日期','Original deadline'),sourceDate(source.originalScoringDueDate,lang))}${row(tr('导入时间','Imported at'),sourceDate(source.importedAt,lang))}${row(tr('原表导出时间','Source exported at'),sourceDate(source.sourceExportedAt,lang))}</dl>${url?`<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${tr('查看原表 ↗','Open source table ↗')}</a></p>`:''}${source.deadlinePeriodMismatch===true?`<p><strong>${tr('原截止日期月份与评分周期不同。原值已保留，请按原表核对评分安排。','The original deadline is in a different month from the review period. The source value is preserved; confirm the intended schedule.')}</strong></p>`:''}</details>`;
 }
 function legacySourceView(legacy,lang='zh'){
  if(legacy?.classification!=='legacy_source')return '';
  const tr=(zh,en)=>t(lang,zh,en),raw=value=>value===null||value===undefined||value===''?tr('空白','Blank'):typeof value==='string'?value:JSON.stringify(value,null,2);
  return `<section class="drawer-section okr-legacy-source"><h3>${tr('历史原始记录（未核定成绩）','Historical source record (not confirmed scores)')}</h3><p class="fine">${tr('以下为旧表原始字段，仅供核对。历史综合公式尚未核实，不计入新版主管核定成绩或加权贡献。','These are original fields from the legacy table for reference. The historical formula is unverified; these values do not contribute to current manager-confirmed scores or weighted contributions.')}</p>${importSourceView(legacy.importSource,lang)}<dl class="okr-plan">${(Array.isArray(legacy.rawFields)?legacy.rawFields:[]).map(field=>`<div><dt>${esc(field.name)}</dt><dd class="okr-evidence">${esc(raw(field.value))}</dd></div>`).join('')}</dl></section>`;
 }
 function rubric(lang){return `<div class="okr-rubric">${labels.map(([n,zh,en])=>`<span><strong>${n}</strong> ${esc(t(lang,zh,en))}</span>`).join('')}</div>`;}
 function plan(p={},lang='zh',title='') {const tr=(zh,en)=>t(lang,zh,en);return `<dl class="okr-plan"><div><dt>${tr('评分周期','Review period')}</dt><dd>${esc(p.period||'—')}</dd></div><div><dt>${tr('目标权重','Objective weight')}</dt><dd>${p.weight==null?'—':esc(p.weight)+'%'}</dd></div><div><dt>${tr('工作地点','Work location')}</dt><dd>${esc(p.location||'—')}</dd></div><div><dt>${tr('O 类型','Objective type')}</dt><dd>${p.type?tr(p.type==='bonus'?'奖励任务':'基础任务',p.type==='bonus'?'Bonus':'Mandatory'):'—'}</dd></div><div><dt>${tr('奖励任务参与评分','Include bonus in scoring')}</dt><dd>${p.type==='bonus'?(p.bonusIncluded===true?tr('是','Yes'):p.bonusIncluded===false?tr('否','No'):'—'):'—'}</dd></div><div><dt>${tr('打分截止日期','Scoring deadline')}</dt><dd>${esc(p.scoringDueDate||'—')}</dd></div></dl>${p.description&&p.description.trim()!==String(title).trim()?`<p class="fine">${esc(p.description)}</p>`:''}`;}
 function planningFields(lang,kr=false){const tr=(zh,en)=>t(lang,zh,en);return `${kr?'':`<label class="field"><span>${tr('评分周期','Review period')}</span><input name="period" type="month" required></label>`}<label class="field"><span>${tr(kr?'KR 权重（占周期总分）':'目标权重（占周期总分）',kr?'KR weight (% of period)':'Objective weight (% of period)')}</span><input name="weight" type="number" min="0.01" max="100" step="0.01" required></label>${kr?'':`<label class="field"><span>${tr('工作地点','Work location')}</span><input name="location" maxlength="100"></label><label class="field"><span>${tr('O 类型','Objective type')}</span><select name="objectiveType"><option value="mandatory">${tr('基础任务','Mandatory')}</option><option value="bonus">${tr('奖励任务','Bonus')}</option></select></label><label class="field"><span>${tr('打分截止日期','Scoring deadline')}</span><input name="scoringDueDate" type="date" required></label><label class="field"><span><input type="checkbox" name="bonusIncluded"> ${tr('奖励任务参与评分','Include bonus in scoring')}</span></label>`}<label class="field full"><span>${tr('补充描述','Additional description')}</span><textarea name="planDescription" maxlength="4000"></textarea></label>`;}
 function readPlanning(values,kr=false){return {weight:Number(values.weight),description:values.planDescription.trim(),...(kr?{}:{period:values.period,location:values.location.trim(),type:values.objectiveType,bonusIncluded:values.bonusIncluded==='on',scoringDueDate:values.scoringDueDate})};}
 function scoreOptions(lang,value){return `<option value="">${t(lang,'未评分','Not scored')}</option>`+labels.map(([n,zh,en])=>`<option value="${n}" ${value===n?'selected':''}>${n} · ${esc(t(lang,zh,en))}</option>`).join('');}
 function summary(planning,krs,appraisals){
  const p=planning||{};const included=p.type!=='bonus'||p.bonusIncluded===true,inclusionKnown=p.type!=='bonus'||typeof p.bonusIncluded==='boolean';
  const weights=krs.map(k=>k.planning?.weight); const sum=weights.reduce((s,v)=>s+(Number.isFinite(v)?v:0),0);
  const valid=Number.isFinite(p.weight)&&p.weight>0&&krs.length>0&&weights.every(v=>Number.isFinite(v)&&v>0)&&Math.abs(sum-p.weight)<0.001;
  const current=krs.map(k=>{const a=appraisals[k.id];return a?.version===k.version&&a?.manager?.metric_version===k.version?a.manager.score:null;});
  const loaded=krs.filter(k=>appraisals[k.id]?.version===k.version).length;
  const complete=current.length>0&&current.every(v=>Number.isFinite(v));
  return {included,inclusionKnown,valid,loaded,weightSum:sum,reviewed:current.filter(v=>v!==null).length,total:krs.length,
    contribution:included&&valid&&complete?Math.round(krs.reduce((s,k,i)=>s+current[i]*k.planning.weight/100,0)*100)/100:null};
 }
 function summaryHtml(result,lang){const tr=(zh,en)=>t(lang,zh,en);return `<div class="okr-score-summary"><strong>${tr('主管核定加权贡献','Manager-confirmed weighted contribution')}: ${result.contribution===null?'—':result.contribution}</strong><span>${tr('已核定','Reviewed')} ${result.reviewed}/${result.total} · ${tr('KR 权重合计','KR weight total')} ${result.weightSum}%</span><span>${!result.included?(result.inclusionKnown===false?tr('奖励项是否纳入评分尚未确认','Bonus scoring inclusion is unconfirmed'):tr('奖励项未纳入评分','Bonus excluded from scoring')):!result.valid?tr('KR 权重合计须等于目标权重','KR weights must total the objective weight'):result.loaded<result.total?tr('评分记录尚未全部读取','Not all score records have been loaded'):result.contribution===null?tr('等待当前版本的主管评价','Awaiting current-version manager reviews'):tr('仅 KR 计分，父目标不重复累计','Only KRs contribute; the parent is not counted again')}</span></div>`;}
 function evaluationForm(lang,kind,a={}){const tr=(zh,en)=>t(lang,zh,en);const self=kind==='self';return `<label class="field full"><span>${self?tr('员工自评','Self evaluation'):tr('主管评分','Manager evaluation')}</span><select name="score" required>${scoreOptions(lang,self?a.self?.score:a.manager?.score)}</select></label>${self?`<label class="field full"><span>${tr('KR 成果展示','KR deliverables')}</span><textarea name="evidence" required minlength="10" maxlength="20000" placeholder="${tr('填写成果内容、可核对的记录及链接','Describe deliverables, verifiable records and links')}">${esc(a.self?.evidence||'')}</textarea></label>`:''}<label class="field full"><span>${self?tr('自评阐述','Self comment'):tr('主管评价说明','Manager comment')}</span><textarea name="note" required minlength="5" maxlength="4000">${esc(self?a.self?.note||'':a.manager?.note||'')}</textarea></label>${self?'':`<label class="field full"><span><input name="verified" type="checkbox" required> ${tr('我已实际核对本次成果与自评；AI 检查仅作参考。','I inspected this deliverable and self evaluation. AI findings are advisory.')}</span></label>`}`;}
 function evaluationView(lang,a,kr){const tr=(zh,en)=>t(lang,zh,en);const row=(label,value)=>`<div><dt>${label}</dt><dd>${esc(value??tr('未评分','Not scored'))}</dd></div>`;return `${rubric(lang)}<dl class="okr-plan">${row(tr('员工自评','Self evaluation'),a.self?.score)}${row(tr('主管评分','Manager evaluation'),a.manager?.score)}${row(tr('KR 权重','KR weight'),kr.planning?.weight==null?'—':kr.planning.weight+'%')}</dl><h3>${tr('KR 成果展示','KR deliverables')}</h3><p class="okr-evidence">${esc(a.self?.evidence||tr('尚未提交','Not submitted'))}</p><h3>${tr('自评阐述','Self comment')}</h3><p class="okr-evidence">${esc(a.self?.note||'—')}</p><h3>${tr('主管评价说明','Manager comment')}</h3><p class="okr-evidence">${esc(a.manager?.note||'—')}</p><p class="fine">${tr('新版口径：主管核定分 × KR 周期权重；自评不自动混入总分。原钉钉综合公式尚未核实。补交或修改实际值后，需重新自评和核定。','New rule: manager-confirmed score × KR period weight. Self scores are not blended automatically. The legacy DingTalk formula is unverified. New evidence or measurements require renewed evaluation.')}</p>${legacySourceView(a.legacySource,lang)}`;}
 root.WorkOSOkr={plan,rubric,planningFields,readPlanning,scoreOptions,summary,summaryHtml,evaluationForm,evaluationView,metric,metricView,importSourceView,legacySourceView,orderImported};
})(typeof window==='undefined'?globalThis:window);
