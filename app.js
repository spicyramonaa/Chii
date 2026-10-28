const categories = [
  ['Team & communication','◌'],['Work environment','⌂'],['Supervisor','♙'],
  ['Workload & scheduling','◷'],['Safety concern','◇'],['Other','···']
];
const $ = id => document.getElementById(id);
if (location.protocol === 'http:' || location.protocol === 'https:') {
  document.querySelector('.footer a')?.setAttribute('href', '/admin');
}
const toast = message => { const el=$('toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3500); };
async function api(url, options={}) {
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const payload=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
  return payload;
}

const categoryBox=$('categories');
if(categoryBox){
  for(const [name,glyph] of categories){
    const button=document.createElement('button'); button.type='button'; button.className='choice';
    button.innerHTML=`<span class="choice-icon">${glyph}</span><span>${name}</span>`;
    button.addEventListener('click',()=>{document.querySelectorAll('.choice').forEach(b=>b.classList.remove('active'));button.classList.add('active');$('category').value=name;});
    categoryBox.append(button);
  }
  $('details').addEventListener('input',e=>$('count').textContent=e.target.value.length);
  $('reportForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!$('category').value){toast('Choose a topic before sending your report.');return;}
    const button=$('submitBtn');button.disabled=true;
    try{const result=await api('/api/complaints',{method:'POST',body:JSON.stringify({category:$('category').value,details:$('details').value,impact:$('impact').value})});
      $('reportForm').innerHTML=`<div style="padding:30px 4px 38px;text-align:center"><div style="width:48px;height:48px;border-radius:50%;background:#f5e6e9;color:#b51326;display:grid;place-items:center;margin:0 auto 17px;font-size:24px">✓</div><div class="eyebrow" style="justify-content:center">Report received</div><h2 style="font:700 30px Manrope,Arial,sans-serif;margin:14px 0 9px">Thank you for speaking up.</h2><p style="font-size:12px;color:#6b6666;line-height:1.7">Your report is in the Operations inbox. Save this receipt number for your records.</p><div style="display:inline-block;background:#fff7e2;padding:11px 14px;border-radius:8px;font:500 11px 'DM Mono',monospace;color:#b51326;margin:10px 0 20px">RECEIPT · ${result.receipt}</div><br><button class="subtle-btn" id="another">Send another report</button></div>`;
      $('another').addEventListener('click',()=>location.reload());
    }catch(error){button.disabled=false;toast(error.message);}
  });
}

if(location.pathname==='/admin'){
  $('publicView').hidden=true;$('adminView').hidden=false;$('adminFoot').hidden=false;
  document.querySelector('.footer').hidden=true;
  bootAdmin();
}
async function bootAdmin(){
  const root=$('adminView');
  try{await api('/api/admin/complaints');renderInbox();}catch{renderLogin();}
  function renderLogin(message=''){
    root.innerHTML=`<section class="card login"><div class="eyebrow">GOODY · secure access</div><h1>Team lead sign in</h1><p>Enter your 6-digit PIN to review reports.</p><form id="loginForm"><div class="field"><label for="pinInput">6-digit PIN</label><input class="input" id="pinInput" type="password" inputmode="numeric" pattern="[0-9]{6}" autocomplete="current-password" required maxlength="6" placeholder="Enter PIN"></div><button class="submit" type="submit">Open inbox <span>→</span></button>${message?`<div class="error">${message}</div>`:''}</form></section>`;
    $('loginForm').addEventListener('submit',async e=>{e.preventDefault();const submit=e.currentTarget.querySelector('button');submit.disabled=true;try{await api('/api/login',{method:'POST',body:JSON.stringify({pin:$('pinInput').value})});renderInbox();}catch(err){submit.disabled=false;renderLogin(err.message);}});
  }
  async function renderInbox(){
    let complaints=[];try{complaints=(await api('/api/admin/complaints')).complaints;}catch{renderLogin('Your session expired. Please sign in again.');return;}
    root.innerHTML=`<div class="admin-top"><div><div class="eyebrow">Operations voice · private inbox</div><h1>Team concerns</h1><p>Read each report, track follow-up, and close the loop with your team.</p></div><div class="admin-actions"><button class="subtle-btn" id="refresh">↻ Refresh</button><button class="subtle-btn" id="logout">Sign out</button></div></div><section class="card admin-panel"><div class="toolbar"><input id="search" class="input" placeholder="Search reports…"><select id="filter" class="input"><option value="All">All statuses</option><option>New</option><option>Reviewing</option><option>Resolved</option></select><select id="topicFilter" class="input"><option value="All">All topics</option>${categories.map(([n])=>`<option>${n}</option>`).join('')}</select></div><div id="stats" class="stats"></div><div id="list" class="complaint-list"></div></section>`;
    const list=$('list');
    function paint(){
      const q=$('search').value.toLowerCase();const status=$('filter').value;const topic=$('topicFilter').value;
      const visible=complaints.filter(c=>(status==='All'||c.status===status)&&(topic==='All'||c.category===topic)&&(!q||`${c.details} ${c.impact||''} ${c.category} ${c.id}`.toLowerCase().includes(q)));
      $('stats').innerHTML=`<span><strong>${complaints.length}</strong> TOTAL</span><span><strong>${complaints.filter(c=>c.status==='New').length}</strong> NEW</span><span><strong>${complaints.filter(c=>c.status==='Reviewing').length}</strong> IN REVIEW</span><span><strong>${complaints.filter(c=>c.status==='Resolved').length}</strong> RESOLVED</span>`;
      list.replaceChildren();
      if(!visible.length){list.innerHTML='<div class="empty"><b>No reports to show</b>New reports will appear here as they come in.</div>';return;}
      for(const c of visible){
        const article=document.createElement('article');article.className='complaint';
        const date=new Date(c.createdAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
        article.innerHTML=`<div class="complaint-top"><div><span class="pill"></span> <span class="complaint-meta"></span></div><span class="complaint-meta"></span></div><div class="complaint-text"></div><div class="impact" hidden></div><div class="complaint-bottom"><select class="input status-select"><option>New</option><option>Reviewing</option><option>Resolved</option></select><button class="danger">Delete report</button></div>`;
        article.querySelector('.pill').textContent=c.category;article.querySelectorAll('.complaint-meta')[0].textContent=`Report ${c.id}`;article.querySelectorAll('.complaint-meta')[1].textContent=date;
        article.querySelector('.complaint-text').textContent=c.details;
        if(c.impact){const impact=article.querySelector('.impact');impact.hidden=false;impact.textContent=`What would help: ${c.impact}`;}
        const select=article.querySelector('select');select.value=c.status;select.addEventListener('change',async()=>{try{await api(`/api/admin/complaints/${c.id}`,{method:'PATCH',body:JSON.stringify({status:select.value})});c.status=select.value;paint();}catch(e){toast(e.message);}});
        article.querySelector('.danger').addEventListener('click',async()=>{if(!confirm('Permanently delete this report?'))return;try{await api(`/api/admin/complaints/${c.id}`,{method:'DELETE'});complaints=complaints.filter(x=>x.id!==c.id);paint();}catch(e){toast(e.message);}});
        list.append(article);
      }
    }
    $('search').addEventListener('input',paint);$('filter').addEventListener('change',paint);$('topicFilter').addEventListener('change',paint);$('refresh').addEventListener('click',renderInbox);
    $('logout').addEventListener('click',async()=>{await api('/api/logout',{method:'POST',body:'{}'});renderLogin();});paint();
  }
}
