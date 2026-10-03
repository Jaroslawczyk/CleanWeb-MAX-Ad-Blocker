const STATIC_RULESETS = ['core_rules', 'aggressive_rules', 'youtube_rules'];
const DYNAMIC_ID_MIN = 100000;
const MAX_DYNAMIC_RULES = 24000;
const FILTER_SOURCES = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://easylist-downloads.adblockplus.org/easylistpolish.txt',
  'https://raw.githubusercontent.com/easylist/ruadlist/master/RuAdList-uBO.txt'
];

const defaults = {
  enabled: true,
  sponsorBlock: true,
  autoUpdate: true,
  remoteRuleCount: 0,
  lastFilterUpdate: 0,
  lastFilterError: ''
};

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(defaults, async current => {
    await storageSet(current);
    chrome.alarms.create('cleanweb-filter-update', { delayInMinutes: 1, periodInMinutes: 720 });
    if (current.enabled !== false) updateRemoteFilters(false);
  });
});
chrome.runtime.onStartup.addListener(async () => {
  const s = await storageGet(defaults);
  chrome.alarms.create('cleanweb-filter-update', { periodInMinutes: 720 });
  if (s.enabled !== false && s.autoUpdate !== false) updateRemoteFilters(false);
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'cleanweb-filter-update') return;
  const s = await storageGet(defaults);
  if (s.enabled !== false && s.autoUpdate !== false) updateRemoteFilters(false);
});

function normalizeType(type) {
  const map = {
    script:'script', image:'image', stylesheet:'stylesheet', css:'stylesheet', font:'font', media:'media', object:'object',
    xhr:'xmlhttprequest', xmlhttprequest:'xmlhttprequest', ping:'ping', websocket:'websocket', subdocument:'sub_frame', sub_frame:'sub_frame', other:'other'
  };
  return map[type] || null;
}

function parseRuleLine(raw) {
  let line = raw.trim();
  if (!line || line.startsWith('!') || line.startsWith('[') || line.includes('##') || line.includes('#?#') || line.includes('#@#') || line.includes('#$#')) return null;
  if (line.startsWith('@@')) return null;
  if (line.startsWith('/') && line.endsWith('/')) return null;

  let body = line, opts = '';
  const dollar = line.indexOf('$');
  if (dollar >= 0) { body = line.slice(0, dollar); opts = line.slice(dollar + 1); }
  if (!body || body.length > 300) return null;

  const optionParts = opts ? opts.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
  if (optionParts.some(o => o.startsWith('domain=') || o.startsWith('denyallow=') || o.startsWith('redirect') || o.startsWith('removeparam') || o.startsWith('csp') || o.startsWith('header') || o.startsWith('permissions') || o.startsWith('method=') || o.startsWith('to=') || o.startsWith('match-case') || o.startsWith('important'))) return null;
  if (optionParts.some(o => o.startsWith('~'))) return null;

  const thirdParty = optionParts.includes('third-party') || optionParts.includes('3p');
  const firstParty = optionParts.includes('first-party') || optionParts.includes('1p');
  if (firstParty) return null; // safer to skip first-party blocking in the auto-converter

  const resourceTypes = [];
  for (const o of optionParts) {
    const t = normalizeType(o);
    if (t && !resourceTypes.includes(t)) resourceTypes.push(t);
    else if (!t && !['third-party','3p'].includes(o)) return null;
  }

  const pure = body.match(/^\|\|([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)\^$/i);
  if (pure && pure[1].includes('.')) {
    return { kind:'domain', domain:pure[1].toLowerCase(), thirdParty, resourceTypes };
  }

  // DNR urlFilter supports ABP-like |, ||, ^ and * syntax. Keep only conservative network filters.
  if (!body.startsWith('||') && !body.startsWith('|http') && !body.startsWith('http')) return null;
  if (/[^\x20-\x7E]/.test(body)) return null;
  if (body.includes('##') || body.includes('#@#')) return null;
  return { kind:'url', filter:body, thirdParty, resourceTypes };
}

function compileFilters(texts) {
  const groups = new Map();
  const urls = [];
  const seenUrl = new Set();

  for (const text of texts) {
    for (const line of text.split(/\r?\n/)) {
      const parsed = parseRuleLine(line);
      if (!parsed) continue;
      if (parsed.kind === 'domain') {
        const sig = `${parsed.thirdParty ? '3' : 'a'}|${parsed.resourceTypes.slice().sort().join(',')}`;
        if (!groups.has(sig)) groups.set(sig, { thirdParty: parsed.thirdParty, resourceTypes: parsed.resourceTypes.slice().sort(), domains: new Set() });
        groups.get(sig).domains.add(parsed.domain);
      } else if (urls.length < 18000 && !seenUrl.has(parsed.filter)) {
        seenUrl.add(parsed.filter); urls.push(parsed);
      }
    }
  }

  const rules = [];
  let id = DYNAMIC_ID_MIN;
  for (const g of groups.values()) {
    const arr = [...g.domains].sort();
    for (let i=0;i<arr.length;i+=80) {
      const condition = { requestDomains: arr.slice(i,i+80) };
      if (g.thirdParty) condition.domainType = 'thirdParty';
      if (g.resourceTypes.length) condition.resourceTypes = g.resourceTypes;
      else condition.excludedResourceTypes = ['main_frame'];
      rules.push({ id:id++, priority:5, action:{type:'block'}, condition });
      if (rules.length >= MAX_DYNAMIC_RULES) return rules;
    }
  }
  for (const u of urls) {
    if (rules.length >= MAX_DYNAMIC_RULES) break;
    const condition = { urlFilter:u.filter };
    if (u.thirdParty) condition.domainType = 'thirdParty';
    if (u.resourceTypes.length) condition.resourceTypes = u.resourceTypes;
    else condition.excludedResourceTypes = ['main_frame'];
    rules.push({ id:id++, priority:4, action:{type:'block'}, condition });
  }
  return rules;
}

async function removeCleanWebDynamicRules() {
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = current.filter(r => r.id >= DYNAMIC_ID_MIN).map(r => r.id);
  if (ids.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
}

let updatePromise = null;
async function updateRemoteFilters(force) {
  if (updatePromise) return updatePromise;
  updatePromise = (async () => {
    try {
      const s = await storageGet(defaults);
      if (s.enabled === false) return {ok:false, reason:'disabled'};
      if (!force && s.lastFilterUpdate && Date.now() - s.lastFilterUpdate < 6 * 60 * 60 * 1000) return {ok:true, cached:true, count:s.remoteRuleCount||0};

      const texts = [];
      const failures = [];
      for (const url of FILTER_SOURCES) {
        try {
          const res = await fetch(url, { cache:'no-store', credentials:'omit' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (text.length > 1000) texts.push(text); else failures.push(`${url}: too small`);
        } catch (e) { failures.push(`${url}: ${e.message}`); }
      }
      if (!texts.length) throw new Error('Не удалось загрузить ни один список фильтров');

      const rules = compileFilters(texts);
      const current = await chrome.declarativeNetRequest.getDynamicRules();
      const removeRuleIds = current.filter(r => r.id >= DYNAMIC_ID_MIN).map(r => r.id);
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });
      await storageSet({ remoteRuleCount: rules.length, lastFilterUpdate: Date.now(), lastFilterError: failures.join('\n') });
      return {ok:true, count:rules.length, partial:failures.length>0};
    } catch (e) {
      await storageSet({ lastFilterError: String(e && e.message || e) });
      return {ok:false, error:String(e && e.message || e)};
    } finally { updatePromise = null; }
  })();
  return updatePromise;
}

async function setEnabled(enabled) {
  await storageSet({ enabled });
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? STATIC_RULESETS : [],
    disableRulesetIds: enabled ? [] : STATIC_RULESETS
  });
  if (enabled) return updateRemoteFilters(true);
  await removeCleanWebDynamicRules();
  return {ok:true};
}

const sponsorCache = new Map();
async function sha256hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
}
async function getSponsorSegments(videoID) {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoID)) return [];
  const cached = sponsorCache.get(videoID);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const hash = await sha256hex(videoID);
    const cats = JSON.stringify(['sponsor','selfpromo','interaction']);
    const url = `https://sponsor.ajay.app/api/skipSegments/${hash.slice(0,4)}?service=YouTube&categories=${encodeURIComponent(cats)}&actionTypes=${encodeURIComponent(JSON.stringify(['skip']))}`;
    const res = await fetch(url, {credentials:'omit', cache:'no-store'});
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`SponsorBlock HTTP ${res.status}`);
    const list = await res.json();
    const exact = Array.isArray(list) ? list.find(x => x && x.videoID === videoID) : null;
    const data = (exact && Array.isArray(exact.segments) ? exact.segments : []).filter(s => Array.isArray(s.segment) && s.segment.length === 2);
    sponsorCache.set(videoID, {data, expires:Date.now()+6*60*60*1000});
    return data;
  } catch (_) { return []; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'setEnabled') { setEnabled(!!msg.enabled).then(sendResponse); return true; }
  if (msg.type === 'updateFilters') { updateRemoteFilters(true).then(sendResponse); return true; }
  if (msg.type === 'getSponsorSegments') {
    storageGet(defaults).then(s => s.enabled !== false && s.sponsorBlock !== false ? getSponsorSegments(msg.videoID) : []).then(data => sendResponse({segments:data}));
    return true;
  }
});
