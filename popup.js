const enabled = document.getElementById('enabled');
const sponsor = document.getElementById('sponsor');
const update = document.getElementById('update');
const status = document.getElementById('status');
function call(msg){return new Promise(resolve=>chrome.runtime.sendMessage(msg,r=>resolve(r||{})));}
function fmt(ts){if(!ts)return 'ещё не было';try{return new Date(ts).toLocaleString();}catch(_){return String(ts);}}
function refresh(){chrome.storage.local.get({enabled:true,sponsorBlock:true,remoteRuleCount:0,lastFilterUpdate:0,lastFilterError:''},s=>{
  enabled.checked=s.enabled!==false; sponsor.checked=s.sponsorBlock!==false;
  status.innerHTML=`<b class="${s.enabled!==false?'ok':'bad'}">${s.enabled!==false?'Защита включена':'Защита выключена'}</b><br>Динамических правил: <b>${s.remoteRuleCount||0}</b><br>Обновление: ${fmt(s.lastFilterUpdate)}${s.lastFilterError?'<br><span class="bad">Часть источников недоступна</span>':''}`;
});}
enabled.addEventListener('change',async()=>{enabled.disabled=true;status.textContent='Переключаю защиту…';await call({type:'setEnabled',enabled:enabled.checked});enabled.disabled=false;refresh();});
sponsor.addEventListener('change',async()=>{await chrome.storage.local.set({sponsorBlock:sponsor.checked});refresh();});
update.addEventListener('click',async()=>{update.disabled=true;status.textContent='Загружаю и компилирую свежие списки…';await call({type:'updateFilters'});update.disabled=false;refresh();});
refresh();