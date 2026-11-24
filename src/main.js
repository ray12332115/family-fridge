import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, where, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import { configured, auth, db } from './fb.js';
import { AI, aiOn, askText, askJSON, genImage, aiErrText } from './ai.js';

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
function el(tag, attrs, ...kids){
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs){
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'style') n.style.cssText = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') n[k] = !!v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const randCode = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let toastT;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800); }
function showNotice(t){ const n = $('#notice'); n.textContent = t || ''; n.hidden = !t; }

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = s ? new Date(s + 'T00:00:00') : new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const daysLeft = s => { if (!s) return null; const a = new Date(s + 'T00:00:00'), b = new Date(today() + 'T00:00:00'); return Math.round((a - b) / 864e5); };
const md = s => { if (!s) return '—'; const d = new Date(s + 'T00:00:00'); return `${d.getMonth()+1}/${d.getDate()}`; };
function ago(iso){ if (!iso) return ''; const m = (Date.now() - new Date(iso)) / 6e4; if (m < 1) return '剛剛'; if (m < 60) return Math.floor(m) + ' 分鐘前'; if (m < 1440) return Math.floor(m/60) + ' 小時前'; const d = Math.floor(m/1440); return d < 30 ? d + ' 天前' : md(iso.slice(0,10)); }
function dlText(n){ if (n == null) return '未設定'; if (n < 0) return `過期 ${-n} 天`; if (n === 0) return '今天到期'; return `剩 ${n} 天`; }

/* ---------- food knowledge (offline estimate, no AI needed) ---------- */
// [關鍵字, emoji, 分類, 冷藏天數, 冷凍天數]
const FOODS = [
 ['雞蛋|蛋','🥚','蛋奶',21,0],['鮮奶|牛奶|奶','🥛','蛋奶',7,30],['優格|優酪','🥣','蛋奶',10,60],['起司|乳酪','🧀','蛋奶',30,120],['奶油','🧈','蛋奶',30,180],
 ['豆腐|豆干|豆包|豆漿','🫘','豆製品',4,60],['雞|雞腿|雞胸|雞翅','🍗','肉類',2,180],['絞肉','🥩','肉類',1,90],['豬|排骨|五花','🥩','肉類',3,120],['牛|牛排','🥩','肉類',3,180],['羊','🥩','肉類',3,180],
 ['培根','🥓','肉類',7,30],['火腿','🥓','肉類',7,60],['香腸|熱狗','🌭','肉類',7,60],['魚|鮭|鯖|鱈','🐟','海鮮',2,90],['蝦','🦐','海鮮',2,120],['花枝|魷魚|章魚','🦑','海鮮',2,120],['蛤|蚵|貝|干貝','🦪','海鮮',2,60],['螃蟹|蟹','🦀','海鮮',1,90],
 ['水餃|餃|餛飩|湯圓','🥟','冷凍食品',1,90],['冰淇淋|冰棒','🍦','冷凍食品',0,60],['冰塊','🧊','冷凍食品',0,365],
 ['高麗菜|甘藍','🥬','蔬菜',14,30],['青菜|白菜|菠菜|空心菜|小白菜|地瓜葉|萵苣|生菜|青江','🥬','蔬菜',5,30],['番茄|蕃茄','🍅','蔬菜',7,60],['小黃瓜|黃瓜','🥒','蔬菜',7,0],['紅蘿蔔|胡蘿蔔','🥕','蔬菜',21,240],
 ['洋蔥','🧅','蔬菜',30,180],['馬鈴薯','🥔','蔬菜',30,0],['甜椒|青椒|辣椒','🫑','蔬菜',7,90],['花椰菜|青花菜','🥦','蔬菜',5,180],['菇|香菇|金針','🍄','蔬菜',5,90],['玉米','🌽','蔬菜',3,240],
 ['蔥|韭菜|香菜|九層塔','🌿','蔬菜',7,60],['蒜','🧄','蔬菜',30,180],['薑','🫚','蔬菜',21,180],['茄子','🍆','蔬菜',5,0],['地瓜|番薯','🍠','蔬菜',14,180],['酪梨','🥑','蔬菜',4,0],
 ['蘋果','🍎','水果',30,0],['香蕉','🍌','水果',5,60],['葡萄','🍇','水果',7,90],['草莓','🍓','水果',3,180],['橘|柳丁|柑','🍊','水果',14,0],['檸檬','🍋','水果',21,120],['西瓜','🍉','水果',3,0],
 ['芒果','🥭','水果',5,180],['鳳梨','🍍','水果',5,180],['奇異果','🥝','水果',14,0],['桃','🍑','水果',5,0],['梨','🍐','水果',14,0],['櫻桃','🍒','水果',5,0],['藍莓','🫐','水果',10,180],['哈密瓜|木瓜','🍈','水果',5,0],
 ['剩菜|剩飯|咖哩|滷','🍲','熟食',3,30],['便當','🍱','熟食',1,30],['飯','🍚','主食',3,30],['麵','🍜','主食',3,30],['吐司|麵包|貝果','🍞','主食',5,30],['披薩','🍕','熟食',3,60],
 ['蛋糕|甜點|布丁','🍰','甜點',3,30],['巧克力','🍫','甜點',90,180],['果汁','🧃','飲料',7,90],['啤酒','🍺','飲料',120,0],['可樂|汽水','🥤','飲料',90,0],['咖啡','☕','飲料',7,0],['茶','🍵','飲料',5,0],['酒','🍷','飲料',5,0],
 ['醬|醬油|味噌|美乃滋|番茄醬','🫙','調味',180,0],['果醬','🫙','調味',60,0]
];
const CATS = ['肉類','海鮮','蔬菜','水果','蛋奶','豆製品','熟食','主食','冷凍食品','甜點','飲料','調味','其他'];
const CAT_EMOJI = {肉類:'🥩',海鮮:'🐟',蔬菜:'🥬',水果:'🍎',蛋奶:'🥛',豆製品:'🫘',熟食:'🍲',主食:'🍚',冷凍食品:'🧊',甜點:'🍰',飲料:'🧃',調味:'🫙',其他:'🍽️'};
function lookup(name){ if (!name) return null; for (const f of FOODS){ if (new RegExp(f[0]).test(name)) return {emoji:f[1], category:f[2], chill:f[3], freeze:f[4]}; } return null; }
function estimateDays(name, kind, ai){
  const src = ai || lookup(name);
  if (!src) return kind === 'freeze' ? 60 : 5;
  const d = kind === 'freeze' ? (src.freeze || src.freezeDays) : (src.chill || src.chillDays);
  return d && d > 0 ? d : (kind === 'freeze' ? 30 : 3);
}

/* ================= state ================= */
const DEFAULT_SETTINGS = { provider:'gemini', model:'gemini-2.5-flash', chibi:'svg', imageModel:'gemini-2.5-flash-image', remind:3, popup:true, notify:false };
const S = {
  demo:false, canWrite:true, me:{id:null, name:'', photo:''}, user:null, userDoc:null, hid:null, house:null,
  fridges:[], items:[], shopping:[], activity:[], recipes:null, book:[], bookFilter:'all', bookQ:'',
  cur: lsGet('fr.cur', null), tab:'fridge', q:'', loaded:false,
  settings: Object.assign({}, DEFAULT_SETTINGS, safeJSON(lsGet('fr.settings', '{}')))
};
function safeJSON(t){ try { return JSON.parse(t) || {}; } catch { return {}; } }
function applySettings(){ Object.assign(AI, {provider:S.settings.provider, model:S.settings.model, chibi:S.settings.chibi, imageModel:S.settings.imageModel}); }
applySettings();
const remind = () => +S.settings.remind || 3;

/* ================= data layer ================= */
// 所有寫入只在使用者操作時發生；畫面更新（render）與資料監聽（onSnapshot）絕不寫入，避免無窮迴圈。
const hdoc = (c, id) => doc(db, 'households', S.hid, c, id);
const hcol = c => collection(db, 'households', S.hid, c);
const store = {
  set(c, id, d){ if (S.demo){ demoSet(c, id, d); return Promise.resolve(); } return setDoc(hdoc(c, id), d); },
  update(c, id, d){ if (S.demo){ demoSet(c, id, Object.assign({}, demoGet(c, id), d)); return Promise.resolve(); } return updateDoc(hdoc(c, id), d); },
  del(c, id){ if (S.demo){ demoDel(c, id); return Promise.resolve(); } return deleteDoc(hdoc(c, id)); }
};
// 離線時寫入會先存在本機、等連線才送出，所以最多等 0.7 秒就當作成功，畫面會先更新。
function guard(p){
  return new Promise(res => {
    let done = false;
    const fin = v => { if (!done){ done = true; res(v); } };
    p.then(() => fin(true)).catch(e => {
      console.error(e);
      toast(e && e.code === 'permission-denied' ? '沒有權限修改這個家庭的資料' : e && e.code === 'resource-exhausted' ? '今天的免費寫入額度用完了' : '儲存失敗，請稍後再試');
      fin(false);
    });
    setTimeout(() => fin(true), 700);
  });
}
function stamp(extra){ return Object.assign({updatedBy:S.me.id, updatedAt:new Date().toISOString()}, extra); }
function logAct(icon, text){ store.set('activity', uid(), {at:new Date().toISOString(), by:S.me.id, icon, text}).catch(() => {}); }

const dkey = c => c === 'recipes' ? 'book' : c;
function demoGet(c, id){ return (S[dkey(c)] || []).find(x => x.id === id); }
function demoSet(c, id, data){
  if (c === 'meta'){ if (id === 'suggestions') S.recipes = data; render(); return; }
  const arr = S[dkey(c)]; if (!arr) return;
  const i = arr.findIndex(x => x.id === id); const row = Object.assign({}, data, {id});
  if (i >= 0) arr[i] = row; else arr.push(row);
  if (c === 'activity') arr.sort((a,b) => a.at < b.at ? 1 : -1);
  render();
}
function demoDel(c, id){ const arr = S[dkey(c)]; if (!arr) return; const i = arr.findIndex(x => x.id === id); if (i >= 0) arr.splice(i, 1); render(); }

/* ---------- people (from household members) ---------- */
function member(id){ return (S.house && S.house.members && S.house.members[id]) || null; }
function who(id){
  if (!id) return '某人';
  if (S.demo) return id === 'demo-me' ? '我' : (id === 'demo-mom' ? '媽媽' : '家人');
  const m = member(id); const n = (m && m.name) || '';
  return id === S.me.id ? (n ? n + '（我）' : '我') : (n || '家人');
}
const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#9fb3ba"/><circle cx="14" cy="11" r="5" fill="#fff"/><path d="M5 24a9 7 0 0 1 18 0" fill="#fff"/></svg>');
function avatar(id){ const m = member(id); return (m && /^https:\/\//.test(m.photo || '') && m.photo) || DEFAULT_AVATAR; }

/* ---------- fridge model ---------- */
const KIND = { chill:{name:'冷藏', temp:'0–5°C'}, freeze:{name:'冷凍', temp:'−18°C'}, fresh:{name:'生鮮蔬果', temp:'3–7°C'} };
function templateFridge(name){
  return { name: name || '家裡的冰箱', order: S.fridges.length, door: 3,
    sections:[ {id:uid(), name:'冷藏室', kind:'chill', shelves:3, split:true}, {id:uid(), name:'生鮮蔬果室', kind:'fresh', shelves:1, split:true}, {id:uid(), name:'冷凍庫', kind:'freeze', shelves:2, split:false} ] };
}
const fridges = () => [...S.fridges].sort((a,b) => (a.order||0) - (b.order||0));
function curFridge(){ const fs = fridges(); return fs.find(f => f.id === S.cur) || fs[0] || null; }
function sectionOf(item){ const f = S.fridges.find(x => x.id === item.fridgeId); if (!f) return null; if (item.sectionId === 'door') return {id:'door', name:'門邊', kind:'chill'}; return (f.sections||[]).find(s => s.id === item.sectionId) || null; }
function kindOf(item){ const s = sectionOf(item); return s ? s.kind : 'chill'; }
function locText(item){
  const f = S.fridges.find(x => x.id === item.fridgeId); if (!f) return '未放置';
  const parts = [f.name];
  if (item.sectionId === 'door') parts.push(`門邊第 ${(item.shelf||0)+1} 格`);
  else { const s = (f.sections||[]).find(x => x.id === item.sectionId); if (!s) parts.push('未放置'); else { parts.push(s.name); if (s.shelves > 1) parts.push(`第 ${(item.shelf||0)+1} 層`); if (s.split) parts.push(item.side === 'R' ? '右' : '左'); } }
  return parts.join(' · ');
}
function spotOptions(f){
  const out = [];
  for (const s of (f.sections||[])) for (let i = 0; i < s.shelves; i++){
    const base = `${s.name}${s.shelves > 1 ? ` 第${i+1}層` : ''}`;
    if (s.split){ out.push({v:`${s.id}|${i}|L`, t:base+' 左'}); out.push({v:`${s.id}|${i}|R`, t:base+' 右'}); }
    else out.push({v:`${s.id}|${i}|A`, t:base});
  }
  for (let i = 0; i < (f.door||0); i++) out.push({v:`door|${i}|A`, t:`門邊 第${i+1}格`});
  return out;
}
function spotKey(item){
  const f = S.fridges.find(x => x.id === item.fridgeId); if (!f) return null;
  if (item.sectionId === 'door') return (item.shelf||0) < (f.door||0) ? `door|${item.shelf||0}|A` : null;
  const s = (f.sections||[]).find(x => x.id === item.sectionId); if (!s) return null;
  const sh = item.shelf || 0; if (sh >= s.shelves) return null;
  const side = s.split ? (item.side === 'R' ? 'R' : 'L') : 'A';
  return `${s.id}|${sh}|${side}`;
}
const active = () => S.items.filter(i => (i.status || 'in') === 'in');
function stateOf(item){ const n = daysLeft(item.expiresAt); if (n == null) return 'good'; if (n < 0) return 'bad'; if (n <= remind()) return 'warn'; return 'good'; }
const byExp = (a,b) => (a.expiresAt||'9999') < (b.expiresAt||'9999') ? -1 : (a.expiresAt||'9999') > (b.expiresAt||'9999') ? 1 : 0;

/* ---------- icons & images ---------- */
const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const isImgData = s => typeof s === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(s);
function iconNode(item, cls){
  const box = el('span', {class: cls});
  if (item.icon){ box.classList.add('svg'); box.append(el('img', {src: svgUrl(item.icon), alt:''})); }
  else if (isImgData(item.iconImg)){ box.classList.add('svg'); box.append(el('img', {src: item.iconImg, alt:''})); }
  else if (isImgData(item.thumb)){ box.append(el('img', {src: item.thumb, alt:''})); }
  else box.textContent = item.emoji || CAT_EMOJI[item.category] || '🍽️';
  return box;
}
function sanitizeSvg(t){
  if (!t) return null;
  const m = t.match(/<svg[\s\S]*<\/svg>/i); if (!m) return null;
  let s = m[0];
  if (s.length > 24000) return null;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '').replace(/\son\w+\s*=\s*(".*?"|'.*?')/gi, '').replace(/(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '');
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}
// 照片在前端壓縮：縮小尺寸並轉成 JPEG，上傳前就變小，省流量也省資料庫空間。
async function loadImg(src){ return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function shrink(srcBlobOrUrl, max, quality, type){
  const url = typeof srcBlobOrUrl === 'string' ? srcBlobOrUrl : URL.createObjectURL(srcBlobOrUrl);
  try {
    const img = await loadImg(url);
    const sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(type || 'image/jpeg', quality);
  } finally { if (typeof srcBlobOrUrl !== 'string') URL.revokeObjectURL(url); }
}
async function compressPhoto(file){
  // 依序嘗試，直到小於約 180KB（Firestore 單筆上限 1MB，留足空間）
  for (const [max, q] of [[1024, .72], [800, .65], [640, .6], [480, .55]]){
    const d = await shrink(file, max, q);
    if (d.length < 240000) return d;
  }
  return await shrink(file, 400, .5);
}
const dataUrlToBlob = d => fetch(d).then(r => r.blob());
const photoCache = new Map();
async function photoData(id){
  if (!id) return null;
  if (photoCache.has(id)) return photoCache.get(id);
  if (S.demo) return null;
  try { const s = await getDoc(hdoc('photos', id)); const d = s.exists() ? s.data().data : null; photoCache.set(id, d); return d; } catch { return null; }
}

/* ================= rendering ================= */
const TABS = [ ['fridge','🧊','冰箱'], ['alerts','⏰','提醒'], ['recipes','🍳','食譜'], ['shopping','🛒','購物'], ['log','📋','紀錄'], ['settings','⚙️','設定'] ];
function buildTabs(){
  for (const host of [$('#tabsTop'), $('#tabsBottom')]){
    host.replaceChildren(...TABS.map(([k, ic, t]) => el('button', {class:'tab', 'data-tab':k, onclick:() => go(k)}, el('span',{class:'ti','aria-hidden':'true'},ic), el('span',{},t), k === 'alerts' ? el('span',{class:'badge','data-badge':'1',hidden:true}) : null)));
  }
}
function go(tab){ if (!TABS.some(t => t[0] === tab)) tab = 'fridge'; S.tab = tab; if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab); render(); window.scrollTo({top:0}); }

function render(){
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'page' : 'false'));
  for (const [k] of TABS) $('#v-' + k).hidden = k !== S.tab;
  const n = active().filter(i => stateOf(i) !== 'good').length;
  document.querySelectorAll('[data-badge]').forEach(b => { b.textContent = n; b.hidden = !n; });
  $('#fab').hidden = !S.canWrite || !S.fridges.length || !(S.tab === 'fridge' || S.tab === 'alerts');
  ({fridge:renderFridge, alerts:renderAlerts, recipes:renderRecipes, shopping:renderShopping, log:renderLog, settings:renderSettings})[S.tab]();
  renderPeople();
}

function renderPeople(){
  const host = $('#people'); host.replaceChildren();
  if (S.demo){ host.append(el('span',{class:'lbl',text:'示範模式'})); return; }
  const ms = S.house && S.house.members ? Object.keys(S.house.members) : [];
  if (!ms.length) return;
  host.append(el('span', {class:'lbl', text: S.house.name || ''}));
  for (const id of ms.slice(0, 5)) host.append(el('img', {src:avatar(id), alt:who(id), title:who(id), referrerpolicy:'no-referrer'}));
}
$('#people').addEventListener('click', () => go('settings'));

function sticker(item){
  const st = stateOf(item), n = daysLeft(item.expiresAt);
  const q = S.q.trim();
  const hit = q && (item.name||'').includes(q);
  return el('button', {class:`stk st-${st}${q ? (hit ? ' hit' : ' dim') : ''}`, title:`${item.name}・${dlText(n)}`, draggable: S.canWrite ? 'true' : null,
    onclick:() => openDetail(item.id), ondragstart:e => { e.dataTransfer.setData('text/plain', item.id); }},
    iconNode(item, 'ic'), el('span',{class:'nm',text:item.name}),
    item.qty && item.qty !== 1 ? el('span',{class:'qt',text:`×${item.qty}`}) : null,
    el('span',{class:'dl',text: n == null ? '' : (n < 0 ? '過期' : n === 0 ? '今天' : n + '天')}));
}
function cell(f, key, items, label){
  const c = el('div', {class:'cell', 'data-key':key});
  items.forEach(it => c.append(sticker(it)));
  if (S.canWrite){
    c.append(el('button', {class:'addspot', 'aria-label':`新增到${label}`, title:`新增到${label}`, onclick:() => openEditor(null, {fridgeId:f.id, spot:key})}, '＋'));
    c.addEventListener('dragover', e => { e.preventDefault(); c.classList.add('dragover'); });
    c.addEventListener('dragleave', () => c.classList.remove('dragover'));
    c.addEventListener('drop', e => { e.preventDefault(); c.classList.remove('dragover'); moveItem(e.dataTransfer.getData('text/plain'), f.id, key); });
  }
  return c;
}
async function moveItem(id, fridgeId, key){
  const it = S.items.find(x => x.id === id); if (!it) return;
  const [sectionId, shelf, side] = key.split('|');
  if (it.fridgeId === fridgeId && spotKey(it) === key) return;
  if (await guard(store.update('items', id, stamp({fridgeId, sectionId, shelf:+shelf, side})))){
    logAct('↔️', `把「${it.name}」移到 ${locText(Object.assign({}, it, {fridgeId, sectionId, shelf:+shelf, side}))}`); toast('已移動');
  }
}

function renderFridge(){
  const chips = $('#fridgeChips'); chips.replaceChildren();
  const fs = fridges(); const f = curFridge();
  for (const x of fs) chips.append(el('button', {class:'chip', 'aria-pressed': String(!!f && x.id === f.id), onclick:() => { S.cur = x.id; lsSet('fr.cur', x.id); render(); }}, x.name));
  if (S.canWrite) chips.append(el('button', {class:'chip', onclick:() => openFridgeEditor(null)}, '＋ 冰箱'));
  const area = $('#fridgeArea'); area.replaceChildren();
  if (!S.loaded){ area.append(el('div',{class:'emptyhero'}, el('h2',{text:'正在打開冰箱…'}), el('p',{text:'讀取全家的冰箱資料中。'}))); return; }
  if (!f){
    area.append(el('div', {class:'emptyhero'}, el('div',{style:'font-size:48px',text:'🧊'}), el('h2',{text:'先建立你家的冰箱'}),
      el('p',{text:'可以自訂冰箱數量、每區的層數、左右分櫃和門邊層架。先套用常見配置，之後隨時能改。'}),
      el('div',{class:'row',style:'justify-content:center'},
        el('button',{class:'btn primary', onclick: async () => { const id = uid(); if (await guard(store.set('fridges', id, Object.assign(templateFridge(), {createdBy:S.me.id}, stamp())))){ S.cur = id; lsSet('fr.cur', id); logAct('🧊','建立了冰箱「家裡的冰箱」'); } }}, '套用常見配置'),
        el('button',{class:'btn', onclick:() => openFridgeEditor(null)}, '自己設定'))));
    return;
  }
  const items = active().filter(i => i.fridgeId === f.id);
  const byKey = {}; const stray = [];
  for (const it of items){ const k = spotKey(it); if (k) (byKey[k] = byKey[k] || []).push(it); else stray.push(it); }
  for (const k in byKey) byKey[k].sort(byExp);
  const wrap = el('div', {class:'fridgewrap'});
  const left = el('div', {});
  const bad = items.filter(i => stateOf(i) === 'bad').length, warn = items.filter(i => stateOf(i) === 'warn').length;
  left.append(el('div', {class:'cabhead'}, el('h2',{text:f.name}), el('span',{class:'meta',text:`${items.length} 樣食物${bad ? `・${bad} 樣已過期` : ''}${warn ? `・${warn} 樣快到期` : ''}`}),
    el('span',{class:'spacer'}), S.canWrite ? el('button',{class:'btn small ghost', onclick:() => openFridgeEditor(f.id)}, '⚙️ 設定這台冰箱') : null));
  const cab = el('div', {class:'cabinet' + (f.door ? '' : ' nodoor')});
  const body = el('div', {class:'body'});
  for (const s of (f.sections||[])){
    const sec = el('div', {class:`section k-${s.kind}`}, el('div',{class:'sechead'}, el('span',{text:s.name}), el('span',{class:'temp',text:KIND[s.kind] ? KIND[s.kind].temp : ''})));
    for (let i = 0; i < s.shelves; i++){
      const sh = el('div', {class:'shelf' + (s.split ? ' split' : '')});
      const lbl = `${s.name}${s.shelves > 1 ? `第${i+1}層` : ''}`;
      if (s.split){ sh.append(cell(f, `${s.id}|${i}|L`, byKey[`${s.id}|${i}|L`]||[], lbl+'左')); sh.append(cell(f, `${s.id}|${i}|R`, byKey[`${s.id}|${i}|R`]||[], lbl+'右')); }
      else sh.append(cell(f, `${s.id}|${i}|A`, byKey[`${s.id}|${i}|A`]||[], lbl));
      sec.append(sh);
    }
    body.append(sec);
  }
  cab.append(body);
  if (f.door){
    const door = el('div', {class:'door'}, el('div',{class:'sechead'}, el('span',{text:'門邊'})));
    for (let i = 0; i < f.door; i++) door.append(cell(f, `door|${i}|A`, byKey[`door|${i}|A`]||[], `門邊第${i+1}格`));
    cab.append(door);
  }
  left.append(cab);
  if (stray.length){ const sd = el('div',{class:'stray'}, el('h3',{text:'尚未放到層架（冰箱配置改過）'})); const c = el('div',{class:'row'}); stray.forEach(it => c.append(sticker(it))); sd.append(c); left.append(sd); }
  left.append(el('div',{class:'legend',style:'margin-top:10px'}, el('span',{},el('i',{style:'background:var(--bad)'}),'已過期'), el('span',{},el('i',{style:'background:var(--warn)'}),`${remind()} 天內到期`), el('span',{}, '電腦可直接拖曳食物換位置')));
  wrap.append(left);

  const side = el('div', {class:'side'});
  const q = S.q.trim();
  if (q){
    const res = active().filter(i => (i.name||'').includes(q));
    const p = el('div',{class:'panel'}, el('h3',{text:`搜尋「${q}」`}));
    p.append(res.length ? listOf(res, true) : el('div',{class:'empty',text:'所有冰箱裡都找不到。要加到購物清單嗎？'}));
    if (!res.length) p.append(el('button',{class:'btn small', onclick:() => addShop(q, '')}, `＋ 把「${q}」加入購物清單`));
    side.append(p);
  }
  const soon = active().filter(i => stateOf(i) !== 'good').sort(byExp);
  const p2 = el('div',{class:'panel'}, el('h3',{text:'快到期・全部冰箱'}));
  p2.append(soon.length ? listOf(soon.slice(0, 8), true) : el('div',{class:'empty',text:`沒有 ${remind()} 天內到期的食物，很棒。`}));
  if (soon.length > 8) p2.append(el('button',{class:'btn small ghost', onclick:() => go('alerts')}, `查看全部 ${soon.length} 樣`));
  side.append(p2);
  const recent = S.activity.slice(0, 5);
  side.append(el('div',{class:'panel'}, el('h3',{text:'最近誰動了冰箱'}), recent.length ? el('div',{}, recent.map(actRow)) : el('div',{class:'empty',text:'還沒有紀錄。'})));
  wrap.append(side);
  area.append(wrap);
}
function listOf(items, showLoc){
  return el('div', {class:'list'}, items.map(it => {
    const st = stateOf(it), n = daysLeft(it.expiresAt);
    return el('button', {class:'li', onclick:() => openDetail(it.id)}, iconNode(it, 'ic'),
      el('span',{class:'tx'}, el('div',{class:'t1',text:`${it.name}${it.qty && it.qty !== 1 ? ` ×${it.qty}${it.unit||''}` : ''}`}), el('div',{class:'t2',text: showLoc ? locText(it) : (it.category||'')})),
      el('span',{class:`pill p-${st}`,text:dlText(n)}));
  }));
}
function actRow(a){ return el('div',{class:'act'}, el('img',{src:avatar(a.by),alt:'',referrerpolicy:'no-referrer'}), el('div',{class:'tx'}, el('b',{text:who(a.by)}), ' ', a.text || ''), el('time',{text:ago(a.at)})); }

function renderAlerts(){
  $('#remindDays').value = String(remind());
  const area = $('#alertsArea'); area.replaceChildren();
  const all = active().sort(byExp);
  const groups = [ ['已過期', all.filter(i => stateOf(i) === 'bad'), '先檢查還能不能吃，不行就標記丟棄。'], [`${remind()} 天內到期`, all.filter(i => stateOf(i) === 'warn'), '安排這幾天吃掉，或到「食譜」找做法。'], ['還很新鮮', all.filter(i => stateOf(i) === 'good'), ''] ];
  for (const [t, arr, tip] of groups){
    const p = el('div', {class:'panel'}, el('h3',{text:`${t}（${arr.length}）`}));
    if (tip && arr.length) p.append(el('div',{class:'hint',text:tip}));
    p.append(arr.length ? listOf(arr, true) : el('div',{class:'empty',text:'沒有。'}));
    if (t !== '還很新鮮' && arr.length) p.append(el('button',{class:'btn small', onclick:() => go('recipes')}, '🍳 用這些食材找食譜'));
    area.append(p);
  }
}

/* ---------- recipe book (純程式比對，不用 AI) ---------- */
const PANTRY = /^(鹽|糖|砂糖|醬油|油|沙拉油|食用油|橄欖油|米酒|水|胡椒|胡椒粉|白胡椒|黑胡椒|太白粉|醋|香油|麻油|蠔油|味精)$/;
function haveItem(name){ const n = (name||'').trim(); if (!n) return null; return active().filter(i => i.name && (i.name.includes(n) || n.includes(i.name))).sort(byExp)[0] || null; }
function matchRecipe(r){
  const rows = (r.ingredients||[]).filter(g => g && g.name).map(g => ({g, pantry: PANTRY.test(String(g.name).trim()), item: haveItem(g.name)}));
  const need = rows.filter(x => !x.pantry); const have = need.filter(x => x.item);
  return {rows, need: need.length, have: have.length, missing: need.filter(x => !x.item), urgent: have.some(x => stateOf(x.item) !== 'good')};
}
const BOOK_FILTERS = [['all','全部'],['ready','現在就能做'],['urgent','用到快過期的'],['fav','最愛']];
function renderBook(){
  $('#bookFilters').replaceChildren(...BOOK_FILTERS.map(([k, t]) => el('button', {class:'chip', 'aria-pressed': String(S.bookFilter === k), onclick:() => { S.bookFilter = k; renderBook(); }}, t)));
  $('#bookImport').disabled = !aiOn();
  const area = $('#bookArea'); area.replaceChildren();
  const q = S.bookQ.trim();
  let list = S.book.map(r => ({r, m: matchRecipe(r)}));
  if (q) list = list.filter(({r}) => (r.name||'').includes(q) || (r.ingredients||[]).some(g => (g.name||'').includes(q)));
  if (S.bookFilter === 'ready') list = list.filter(({m}) => m.need > 0 && m.missing.length === 0);
  if (S.bookFilter === 'urgent') list = list.filter(({m}) => m.urgent);
  if (S.bookFilter === 'fav') list = list.filter(({r}) => r.fav);
  list.sort((a, b) => (b.m.urgent - a.m.urgent) || (a.m.missing.length - b.m.missing.length) || ((b.r.fav ? 1 : 0) - (a.r.fav ? 1 : 0)) || ((a.r.name||'') < (b.r.name||'') ? -1 : 1));
  if (!S.book.length){ area.append(el('div',{class:'panel'}, el('div',{class:'empty',text:'食譜本還是空的。可以自己新增、貼上網路上的食譜讓 AI 整理，或把下方的 AI 建議收藏進來。'}))); return; }
  if (!list.length){ area.append(el('div',{class:'empty',text:'沒有符合的食譜。'})); return; }
  area.append(el('div', {class:'grid2'}, list.map(({r, m}) => bookCard(r, m))));
}
function bookCard(r, m){
  const st = m.missing.length === 0 ? 'good' : m.have ? 'warn' : 'bad';
  const card = el('div', {class:'recipe'},
    el('h3', {}, el('span',{text:String(r.emoji||'🍽️').slice(0,4)}), el('span',{style:'flex:1;min-width:0',text:r.name||''}),
      el('button',{class:'btn small ghost', 'aria-label': r.fav ? '取消最愛' : '設為最愛', title: r.fav ? '取消最愛' : '設為最愛', onclick:() => guard(store.update('recipes', r.id, stamp({fav: !r.fav})))}, r.fav ? '★' : '☆')),
    el('div', {class:'row'}, el('span',{class:`pill p-${st}`, text: m.need ? `冰箱有 ${m.have}/${m.need} 樣` : '只需基本調味料'}), m.urgent ? el('span',{class:'pill p-warn',text:'可用掉快過期食材'}) : null,
      el('span',{class:'hint',text:[r.minutes ? `${r.minutes} 分鐘` : '', r.servings ? `${r.servings} 人份` : '', r.cooked ? `煮過 ${r.cooked} 次` : ''].filter(Boolean).join('・')})),
    el('div', {class:'tags'}, m.rows.map(x => el('span', {class: 'tagc' + (x.pantry ? '' : x.item ? ' use' : ' miss'), title: x.item ? `${locText(x.item)}・${dlText(daysLeft(x.item.expiresAt))}` : (x.pantry ? '基本調味料' : '冰箱沒有'), text: `${x.item ? '✓ ' : x.pantry ? '' : '缺 '}${x.g.name}${x.g.qty ? ' ' + x.g.qty : ''}`}))),
    (r.steps||[]).length ? el('details', {}, el('summary',{text:`作法（${r.steps.length} 步）`}), el('ol',{style:'margin-top:8px'}, r.steps.map(s => el('li',{text:String(s)})))) : null,
    r.note ? el('div',{class:'hint',text:'📝 ' + r.note}) : null,
    el('div', {class:'hint', text:`${who(r.createdBy)} 新增${r.lastCooked ? `・上次煮：${md(r.lastCooked)}` : ''}`}),
    el('div', {class:'row'},
      el('button',{class:'btn small primary', onclick:() => openCook(r)}, '🍳 煮這道'),
      m.missing.length ? el('button',{class:'btn small', onclick: async () => { for (const x of m.missing) await addShop(String(x.g.name), x.g.qty || '', true); toast(`已把 ${m.missing.length} 樣加入購物清單`); logAct('📝', `把「${r.name}」缺的食材加入購物清單`); }}, `🛒 缺的 ${m.missing.length} 樣加入清單`) : null,
      el('button',{class:'btn small ghost', onclick:() => openRecipeEditor(r.id)}, '✏️ 編輯')));
  return card;
}
function openCook(r){
  const m = matchRecipe(r);
  const rows = m.rows.filter(x => x.item);
  const picks = rows.map(x => {
    const it = x.item;
    const cb = el('input', {type:'checkbox', checked:true, 'aria-label':'扣掉這樣食材'});
    const amt = el('input', {class:'inp', type:'number', min:'0', step:'any', value: String(Math.min(1, it.qty || 1)), style:'width:80px', 'aria-label':'用掉的數量'});
    return {it, cb, amt, node: el('div', {class:'shop'}, cb, iconNode(it, 'ic'), el('div',{class:'tx'}, el('div',{class:'t1',text:`${it.name}（剩 ${it.qty ?? 1}${it.unit||''}）`}), el('div',{class:'t2',style:'font-size:12.5px;color:var(--muted)',text:`食譜用量：${x.g.qty || '未寫'}・${dlText(daysLeft(it.expiresAt))}`})), amt, el('button', {type:'button', class:'btn small ghost', onclick:() => { amt.value = String(it.qty || 1); }}, '全部'))};
  });
  openSheet(`煮「${r.name}」`, el('div', {style:'display:flex;flex-direction:column;gap:12px'},
    el('p', {style:'margin:0', text: rows.length ? '勾選要從冰箱扣掉的食材，數量歸零的會自動標記為吃完。' : '冰箱裡沒有這道菜用到的食材，會只記錄煮過一次。'}),
    picks.length ? el('div', {}, picks.map(p => p.node)) : null,
    m.missing.length ? el('div', {class:'hint', text:'冰箱沒有：' + m.missing.map(x => x.g.name).join('、')}) : null,
    el('div', {class:'row', style:'justify-content:flex-end'}, el('button',{class:'btn', onclick: closeSheet}, '取消'), el('button', {class:'btn primary', onclick: async e => {
      e.currentTarget.disabled = true;
      const usedNames = [];
      for (const p of picks){
        if (!p.cb.checked) continue;
        const a = Math.max(0, +p.amt.value || 0); if (!a) continue;
        const left = Math.round(((p.it.qty ?? 1) - a) * 100) / 100;
        usedNames.push(p.it.name);
        if (left <= 0) await guard(store.update('items', p.it.id, stamp({status:'used', removedAt:new Date().toISOString(), qty:0})));
        else await guard(store.update('items', p.it.id, stamp({qty:left})));
      }
      await guard(store.update('recipes', r.id, stamp({cooked:(r.cooked||0) + 1, lastCooked: today()})));
      logAct('🍳', `煮了「${r.name}」${usedNames.length ? '，用掉 ' + usedNames.join('、') : ''}`);
      closeSheet(); toast(`煮好了：${r.name}`);
    }}, '煮好了'))));
}
function parseIngLines(t){ return String(t||'').split(/\n|、|，|,/).map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/^(\S+?)\s+(.+)$/); return m ? {name:m[1], qty:m[2]} : {name:s, qty:''}; }); }
function cleanRecipe(x){
  return { name:String(x.name||'').slice(0,40), emoji:String(x.emoji||'🍽️').slice(0,4), minutes:+x.minutes || null, servings:+x.servings || null,
    ingredients:(Array.isArray(x.ingredients) ? x.ingredients : []).slice(0,30).map(g => typeof g === 'string' ? {name:g.slice(0,20), qty:''} : {name:String(g.name||'').slice(0,20), qty:String(g.qty||'').slice(0,20)}).filter(g => g.name),
    steps:(Array.isArray(x.steps) ? x.steps : []).slice(0,20).map(s => String(s).slice(0,300)), note:String(x.note||'').slice(0,200) };
}
function openRecipeEditor(id, preset){
  const old = id ? S.book.find(x => x.id === id) : null;
  const d = old ? Object.assign({}, old) : Object.assign({name:'', emoji:'', minutes:null, servings:2, ingredients:[], steps:[], note:''}, preset || {});
  const name = el('input', {class:'inp', id:'rcName', value:d.name, placeholder:'例如：番茄炒蛋'});
  const emoji = el('input', {class:'inp', id:'rcEmoji', value:d.emoji||'', placeholder:'🍳', maxlength:'4'});
  const minutes = el('input', {class:'inp', id:'rcMin', type:'number', min:'0', value: d.minutes ? String(d.minutes) : '', placeholder:'分鐘'});
  const servings = el('input', {class:'inp', id:'rcServ', type:'number', min:'1', value: d.servings ? String(d.servings) : ''});
  const ings = el('textarea', {class:'inp', id:'rcIng', rows:'5', placeholder:'一行一樣，名稱和份量用空白隔開\n雞蛋 3顆\n番茄 2顆\n蔥 1根'}, (d.ingredients||[]).map(g => g.name + (g.qty ? ' ' + g.qty : '')).join('\n'));
  const steps = el('textarea', {class:'inp', id:'rcSteps', rows:'6', placeholder:'一行一個步驟'}, (d.steps||[]).join('\n'));
  const note = el('input', {class:'inp', id:'rcNote', value:d.note||'', placeholder:'例如：爸爸最愛、少放鹽'});
  const err = el('div', {class:'err', hidden:true});
  const delBtn = old ? el('button', {type:'button', class:'btn danger ghost', onclick: async e => {
    if (e.currentTarget.dataset.armed !== '1'){ e.currentTarget.dataset.armed = '1'; e.currentTarget.textContent = '再按一次確認刪除'; return; }
    if (await guard(store.del('recipes', old.id))){ logAct('🗑️', `刪除了食譜「${old.name}」`); closeSheet(); }
  }}, '刪除食譜') : el('span');
  const form = el('form', {style:'display:flex;flex-direction:column;gap:14px', onsubmit: async e => {
    e.preventDefault();
    const nm = name.value.trim(); if (!nm){ err.textContent = '請填寫菜名。'; err.hidden = false; return; }
    const row = { name:nm, emoji: emoji.value.trim() || '🍽️', minutes: +minutes.value || null, servings: +servings.value || null,
      ingredients: parseIngLines(ings.value).slice(0,30), steps: steps.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0,20), note: note.value.trim(), source: d.source || 'manual' };
    const rid = old ? old.id : uid();
    const data = old ? Object.assign({}, old, row, stamp()) : Object.assign(row, {fav:false, cooked:0, createdBy:S.me.id, createdAt:new Date().toISOString()}, stamp());
    delete data.id;
    if (await guard(store.set('recipes', rid, data))){ logAct('📖', old ? `編輯了食譜「${nm}」` : `新增食譜「${nm}」`); closeSheet(); toast(old ? '已儲存' : `已加入食譜本：${nm}`); }
  }},
    el('div', {style:'display:grid;grid-template-columns:minmax(0,1fr) 72px;gap:10px'}, el('div',{class:'field'}, el('label',{for:'rcName',text:'菜名'}), name), el('div',{class:'field'}, el('label',{for:'rcEmoji',text:'圖示'}), emoji)),
    el('div', {class:'f2'}, el('div',{class:'field'}, el('label',{for:'rcMin',text:'時間（分鐘）'}), minutes), el('div',{class:'field'}, el('label',{for:'rcServ',text:'幾人份'}), servings)),
    el('div', {class:'field'}, el('label',{for:'rcIng',text:'食材'}), ings, el('div',{class:'hint',text:'鹽、糖、醬油、油、米酒等基本調味料不會算成缺少的食材。'})),
    el('div', {class:'field'}, el('label',{for:'rcSteps',text:'步驟'}), steps),
    el('div', {class:'field'}, el('label',{for:'rcNote',text:'備註'}), note),
    err,
    el('div', {class:'row', style:'justify-content:space-between'}, delBtn, el('div',{class:'row'}, el('button',{type:'button',class:'btn',onclick:closeSheet},'取消'), el('button',{class:'btn primary'}, old ? '儲存' : '加入食譜本'))));
  openSheet(old ? '編輯食譜' : '新增食譜', form);
  if (!old && !d.name) setTimeout(() => name.focus(), 50);
}
function openImport(){
  const ta = el('textarea', {class:'inp', id:'impText', rows:'9', placeholder:'把網路、App 或筆記裡的食譜文字整段貼上，AI 會整理成菜名、食材和步驟。'});
  const msg = el('div', {class:'hint'});
  let photo = null;
  const photoBtn = el('button', {type:'button', class:'btn small', onclick:() => { pickTarget = async f => { try { photo = await dataUrlToBlob(await shrink(f, 1400, .75)); photoBtn.textContent = '📷 已選照片（可再換）'; } catch { msg.textContent = '這張照片讀不到。'; } }; $('#photoPick').click(); }}, '📷 改用食譜照片');
  const go2 = el('button', {class:'btn primary', disabled: !aiOn(), onclick: async () => {
    const t = ta.value.trim();
    if (!t && !photo){ msg.textContent = '請先貼上食譜文字或選一張照片。'; return; }
    go2.disabled = true; msg.textContent = '整理中…';
    try {
      const x = await askJSON(`把下面${photo ? '照片中' : ''}的食譜整理成 JSON 物件，使用繁體中文：{"name":"菜名","emoji":"一個emoji","minutes":總時間分鐘數,"servings":幾人份,"ingredients":[{"name":"食材名稱，簡短，例如 雞蛋","qty":"份量，例如 3顆"}],"steps":["步驟1","步驟2"],"note":"一句補充，可空"}。只回覆 JSON。\n\n${t.slice(0, 12000)}`, photo ? [photo] : []);
      if (!x || typeof x !== 'object' || !x.name) throw new Error('bad');
      closeSheet(); openRecipeEditor(null, Object.assign(cleanRecipe(x), {source:'import'}));
    } catch (e){ msg.textContent = aiErrText(e); go2.disabled = false; }
  }}, '整理成食譜');
  openSheet('貼上文字整理成食譜', el('div', {style:'display:flex;flex-direction:column;gap:12px'}, ta, el('div',{class:'row'}, photoBtn), msg, aiOn() ? null : el('div',{class:'err',text:'AI 已在設定中關閉，請改用「新增食譜」手動輸入。'}), el('div',{class:'row',style:'justify-content:flex-end'}, el('button',{class:'btn',onclick:closeSheet},'取消'), go2)));
}
async function saveAiRecipe(x){
  if (S.book.some(r => r.name === x.name)){ toast('食譜本裡已經有這道了'); return; }
  const data = Object.assign({ name:x.name, emoji:x.emoji, minutes:x.minutes, servings: +$('#rPeople').value || null,
    ingredients: [...(x.uses||[]), ...(x.missing||[])].map(n => ({name:String(n), qty:''})), steps: x.steps || [], note: x.why || '', source:'ai', fav:false, cooked:0, createdBy:S.me.id, createdAt:new Date().toISOString()}, stamp());
  if (await guard(store.set('recipes', uid(), data))){ logAct('📖', `把「${x.name}」收進食譜本`); toast(`已收進食譜本：${x.name}`); }
}

function renderRecipes(){
  renderBook();
  const area = $('#recipesArea'); area.replaceChildren();
  $('#rGo').disabled = !aiOn() || !active().length;
  $('#rHint').textContent = !aiOn() ? 'AI 已在設定中關閉。' : (!active().length ? '冰箱還是空的。' : '');
  const r = S.recipes;
  if (!r || !Array.isArray(r.list) || !r.list.length){ area.append(el('div',{class:'empty',text:'按上方按鈕，依照目前的食材產生建議。'})); return; }
  area.append(el('div',{class:'hint',style:'margin-bottom:8px',text:`${who(r.by)} 於 ${ago(r.at)} 產生`}));
  area.append(el('div',{class:'grid2'}, r.list.map(x => el('div',{class:'recipe'},
    el('h3',{}, el('span',{text:String(x.emoji||'🍽️').slice(0,4)}), el('span',{text:String(x.name||'')})),
    el('div',{class:'hint',text:[x.minutes ? `約 ${x.minutes} 分鐘` : '', x.difficulty||'', x.why||''].filter(Boolean).join('・')}),
    el('div',{class:'tags'}, (x.uses||[]).map(u => el('span',{class:'tagc use',text:String(u)})), (x.missing||[]).map(u => el('span',{class:'tagc miss',text:'缺 ' + String(u)}))),
    el('ol',{}, (x.steps||[]).map(s => el('li',{text:String(s)}))),
    el('div',{class:'row'},
      el('button',{class:'btn small primary', onclick:() => saveAiRecipe(x)}, S.book.some(b => b.name === x.name) ? '✓ 已在食譜本' : '📖 收進食譜本'),
      (x.missing||[]).length ? el('button',{class:'btn small', onclick: async () => { for (const m of x.missing) await addShop(String(m), '', true); toast(`已把 ${x.missing.length} 樣加入購物清單`); }}, '🛒 缺的食材加入購物清單') : null)))));
}
async function suggestRecipes(){
  if (!aiOn()) return;
  const btn = $('#rGo'); btn.disabled = true; $('#rHint').textContent = '思考中…';
  const inv = active().sort(byExp).slice(0, 60).map(i => `${i.name}${i.qty ? ' ×' + i.qty + (i.unit||'') : ''}（${dlText(daysLeft(i.expiresAt))}，${KIND[kindOf(i)].name}）`).join('\n');
  const prompt = `你是台灣家庭料理顧問。根據冰箱現有食材建議 3 道家常菜，給 ${$('#rPeople').value} 人吃。優先使用快過期的食材。可假設家裡有基本調味料（鹽、糖、醬油、油、米酒、蒜）。${$('#rPref').value.trim() ? '偏好：' + $('#rPref').value.trim() : ''}
冰箱食材：
${inv}

只回覆 JSON 陣列，每道菜格式：{"name":"菜名","emoji":"一個emoji","minutes":20,"difficulty":"簡單","why":"一句話說明為什麼推薦","uses":["使用到的冰箱食材名稱"],"missing":["需要另外買的食材，沒有就空陣列"],"steps":["步驟1","步驟2"]}。步驟 3 到 6 步，使用繁體中文。`;
  try {
    const list = await askJSON(prompt);
    if (!Array.isArray(list)) throw new Error('bad');
    const clean = list.slice(0, 5).map(x => ({name:String(x.name||'').slice(0,40), emoji:String(x.emoji||'🍽️').slice(0,4), minutes:+x.minutes||null, difficulty:String(x.difficulty||'').slice(0,10), why:String(x.why||'').slice(0,80), uses:(x.uses||[]).slice(0,10).map(String), missing:(x.missing||[]).slice(0,10).map(String), steps:(x.steps||[]).slice(0,8).map(s => String(s).slice(0,200))}));
    await guard(store.set('meta', 'suggestions', {list:clean, at:new Date().toISOString(), by:S.me.id}));
    $('#rHint').textContent = '';
  } catch (e){ $('#rHint').textContent = aiErrText(e); }
  finally { btn.disabled = false; }
}

function renderShopping(){
  const host = $('#shopList'); host.replaceChildren();
  const list = [...S.shopping].sort((a,b) => (a.done === b.done ? (a.at < b.at ? 1 : -1) : a.done ? 1 : -1));
  if (!list.length){ host.append(el('div',{class:'empty',text:'清單是空的。可以從上方輸入，或在食譜、食物詳情裡一鍵加入。'})); return; }
  for (const s of list){
    host.append(el('div',{class:'shop' + (s.done ? ' done' : '')},
      el('input',{type:'checkbox', checked: !!s.done, 'aria-label':'已購買', onchange: async e => { await guard(store.update('shopping', s.id, {done:e.target.checked, doneBy:S.me.id})); if (e.target.checked) logAct('🛒', `買了「${s.name}」`); }}),
      el('div',{class:'tx'}, el('div',{class:'t1',text:`${s.name}${s.qty ? '  ' + s.qty : ''}`}), el('div',{class:'t2',style:'font-size:12.5px;color:var(--muted)',text:`${who(s.by)} 加入・${ago(s.at)}`})),
      s.done ? el('button',{class:'btn small', onclick:() => openEditor(null, {name:s.name, fromShop:s.id})}, '放進冰箱') : null,
      el('button',{class:'btn small ghost', 'aria-label':'刪除', onclick:() => guard(store.del('shopping', s.id))}, '✕')));
  }
}
async function addShop(name, qty, quiet){
  name = (name||'').trim(); if (!name) return;
  if (S.shopping.some(s => !s.done && s.name === name)){ if (!quiet) toast('清單裡已經有了'); return; }
  const ok = await guard(store.set('shopping', uid(), {name, qty: qty||'', done:false, by:S.me.id, at:new Date().toISOString()}));
  if (ok && !quiet){ toast(`已加入購物清單：${name}`); logAct('📝', `把「${name}」加入購物清單`); }
}

function renderLog(){
  const la = $('#logArea'); la.replaceChildren(S.activity.length ? el('div',{}, S.activity.slice(0, 60).map(actRow)) : el('div',{class:'empty',text:'還沒有紀錄。'}));
  const sa = $('#statsArea'); sa.replaceChildren(el('h3',{text:'最近 30 天'}));
  const since = addDays(today(), -30);
  const gone = S.items.filter(i => (i.status === 'used' || i.status === 'wasted') && (i.removedAt||'').slice(0,10) >= since);
  const used = gone.filter(i => i.status === 'used'), wasted = gone.filter(i => i.status === 'wasted');
  const rate = gone.length ? Math.round(wasted.length / gone.length * 100) : 0;
  sa.append(el('div',{class:'stats'}, el('div',{class:'stat'}, el('b',{text:used.length}), el('span',{text:'吃完'})), el('div',{class:'stat'}, el('b',{text:wasted.length}), el('span',{text:'丟棄'})), el('div',{class:'stat'}, el('b',{text: gone.length ? rate + '%' : '—'}), el('span',{text:'浪費比例'}))));
  const byCat = {};
  for (const i of gone){ const c = i.category || '其他'; byCat[c] = byCat[c] || {u:0,w:0}; byCat[c][i.status === 'used' ? 'u' : 'w']++; }
  const cats = Object.entries(byCat).sort((a,b) => (b[1].u+b[1].w) - (a[1].u+a[1].w));
  if (cats.length){
    const max = Math.max(...cats.map(([,v]) => v.u+v.w));
    sa.append(el('div',{class:'flabel',text:'各分類（綠：吃完，紅：丟棄）'}));
    sa.append(el('div',{class:'bars'}, cats.map(([c,v]) => el('div',{class:'bar'}, el('span',{text:c}), el('div',{class:'tr'}, el('span',{class:'u',style:`width:${v.u/max*100}%`}), el('span',{class:'w',style:`width:${v.w/max*100}%`})), el('span',{class:'n',text:`${v.u} / ${v.w}`})))));
    const wc = {}; wasted.forEach(i => wc[i.name] = (wc[i.name]||0) + 1);
    const top = Object.entries(wc).sort((a,b) => b[1]-a[1]).slice(0, 5);
    if (top.length) sa.append(el('div',{class:'hint',text:'最常丟掉：' + top.map(([n,c]) => `${n}（${c}）`).join('、') + '。下次可以少買一點。'}));
  } else sa.append(el('div',{class:'empty',text:'吃完或丟棄食物後，這裡會出現統計。'}));
  sa.append(el('div',{class:'hint',text:`目前冰箱裡共有 ${active().length} 樣食物。`}));
}

/* ---------- settings ---------- */
function saveSettings(patch){
  Object.assign(S.settings, patch); applySettings();
  lsSet('fr.settings', JSON.stringify(S.settings));
  if (!S.demo && S.me.id) setDoc(doc(db, 'users', S.me.id), {settings: S.settings}, {merge:true}).catch(e => console.warn(e));
  render();
}
function radioGroup(name, value, options, onPick){
  return el('div', {style:'display:flex;flex-direction:column;gap:8px'}, options.map(([v, t, d]) => el('label', {class:'radio'},
    el('input', {type:'radio', name, value:v, checked: value === v, onchange:() => onPick(v)}), el('span', {}, el('div',{text:t}), d ? el('div',{class:'t2',text:d}) : null))));
}
function renderSettings(){
  const area = $('#settingsArea'); area.replaceChildren();
  const st = S.settings;
  // account
  area.append(el('div', {class:'panel'}, el('h3',{text:'帳號'}),
    el('div', {class:'member'}, el('img',{src: S.me.photo || DEFAULT_AVATAR, alt:'', referrerpolicy:'no-referrer'}), el('div',{class:'tx'}, el('div',{text: S.me.name || (S.demo ? '示範使用者' : '')}), el('div',{class:'hint',text: S.user && S.user.email || ''}))),
    S.demo ? el('div',{class:'hint',text:'示範模式沒有登入。'}) : el('button',{class:'btn', onclick:() => signOut(auth)}, '登出')));
  // household
  if (S.house && !S.demo){
    const link = `${location.origin}${location.pathname}?join=${S.hid}_${S.house.joinCode || ''}`;
    const linkInp = el('input', {class:'inp', id:'inviteLink', value:link, readonly:true});
    const hp = el('div', {class:'panel'}, el('h3',{text:'家庭成員'}),
      el('div', {class:'field'}, el('label',{for:'houseName',text:'家庭名稱'}), el('input',{class:'inp', id:'houseName', value:S.house.name || '', onchange: e => { const v = e.target.value.trim(); if (v) guard(updateDoc(doc(db,'households',S.hid), {name:v})); }})),
      el('div', {}, Object.entries(S.house.members || {}).map(([id, m]) => el('div',{class:'member'}, el('img',{src:avatar(id),alt:'',referrerpolicy:'no-referrer'}), el('div',{class:'tx',style:'flex:1'}, who(id), id === S.house.owner ? el('span',{class:'hint',text:'　建立者'}) : null),
        S.me.id === S.house.owner && id !== S.me.id ? el('button',{class:'btn small ghost danger', onclick: e => { if (e.currentTarget.dataset.armed !== '1'){ e.currentTarget.dataset.armed = '1'; e.currentTarget.textContent = '確定移除？'; return; } guard(updateDoc(doc(db,'households',S.hid), {[`members.${id}`]: deleteField()})); }}, '移除') : null))),
      el('div', {class:'flabel', text:'邀請家人：把這個連結傳給他們，用 Google 登入後就會加入'}),
      el('div', {class:'copybox'}, linkInp, el('button',{class:'btn', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('已複製邀請連結'); } catch { linkInp.select(); toast('請長按或 Ctrl+C 複製'); } }}, '複製')),
      S.me.id === S.house.owner ? el('button',{class:'btn small ghost', onclick:() => guard(updateDoc(doc(db,'households',S.hid), {joinCode: randCode(10)})).then(() => toast('已換新連結，舊連結失效'))}, '換一個新連結（讓舊連結失效）') : null);
    const others = (S.userDoc && S.userDoc.households || []).filter(h => h !== S.hid);
    hp.append(el('div',{class:'row'},
      others.length ? el('button',{class:'btn small', onclick:() => switchHouse(others[0])}, '切換到另一個家庭') : null,
      el('button',{class:'btn small ghost', onclick:() => showOnboard(true)}, '建立或加入其他家庭')));
    area.append(hp);
  }
  // AI
  const modelSel = el('select', {class:'inp', id:'aiModel', onchange: e => { if (e.target.value === '__custom') { customM.hidden = false; customM.focus(); } else saveSettings({model:e.target.value}); }},
    [['gemini-2.5-flash','Gemini 2.5 Flash（推薦，快又準）'],['gemini-2.5-flash-lite','Gemini 2.5 Flash-Lite（最省額度）'],['gemini-2.5-pro','Gemini 2.5 Pro（最聰明，較慢、額度少）'],['__custom','自訂模型名稱…']].map(([v,t]) => el('option',{value:v,text:t})));
  const known = ['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.5-pro'];
  modelSel.value = known.includes(st.model) ? st.model : '__custom';
  const customM = el('input', {class:'inp', id:'aiModelCustom', value: known.includes(st.model) ? '' : st.model, placeholder:'例如 gemini-3-flash', hidden: known.includes(st.model), onchange: e => { const v = e.target.value.trim(); if (v) saveSettings({model:v}); }});
  const imgModel = el('input', {class:'inp', id:'aiImgModel', value: st.imageModel, onchange: e => { const v = e.target.value.trim(); if (v) saveSettings({imageModel:v}); }});
  const testMsg = el('div', {class:'hint'});
  area.append(el('div', {class:'panel'}, el('h3',{text:'AI 設定'}),
    el('div',{class:'hint',text:'AI 透過你的 Firebase 專案呼叫 Google Gemini，金鑰不會出現在網頁裡。效期提醒和食譜比對不需要 AI。'}),
    el('div',{class:'flabel',text:'AI 服務'}),
    radioGroup('aiProvider', st.provider, [['gemini','Google Gemini','拍照辨識、Q 版圖示、食譜建議、整理食譜'],['off','關閉 AI','全部手動輸入，用內建的常見保存天數表估算效期']], v => saveSettings({provider:v})),
    el('div',{class:'field'}, el('label',{for:'aiModel',text:'辨識與文字模型'}), modelSel, customM),
    el('div',{class:'flabel',text:'Q 版圖示'}),
    radioGroup('aiChibi', st.chibi, [['svg','AI 畫 SVG 貼紙','使用上面的文字模型，免費額度內可用'],['image','Gemini 生成圖片','畫得更細緻；圖片模型可能需要付費方案'],['off','不產生，直接用照片縮圖','最省額度']], v => saveSettings({chibi:v})),
    st.chibi === 'image' ? el('div',{class:'field'}, el('label',{for:'aiImgModel',text:'圖片模型'}), imgModel) : null,
    el('div',{class:'row'}, el('button',{class:'btn small', disabled: !aiOn(), onclick: async () => { testMsg.textContent = '測試中…'; try { const t = await askText('只回覆「連線成功」四個字。'); testMsg.textContent = '✅ ' + t.trim().slice(0, 40); } catch (e){ testMsg.textContent = '❌ ' + aiErrText(e); } }}, '測試 AI 連線'), testMsg)));
  // reminders
  const rd = el('select', {class:'inp', id:'setRemind', style:'width:auto', onchange: e => saveSettings({remind:+e.target.value})}, [1,2,3,5,7].map(n => el('option',{value:n,text:`${n} 天`})));
  rd.value = String(remind());
  const notifState = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  area.append(el('div', {class:'panel'}, el('h3',{text:'到期提醒'}),
    el('div',{class:'setrow'}, el('div',{class:'tx'}, el('div',{text:'提前幾天提醒'}), el('div',{class:'t2',text:'在這天數內到期的會標成橘色'})), rd),
    el('label',{class:'setrow'}, el('div',{class:'tx'}, el('div',{text:'打開 App 時跳出提醒'}), el('div',{class:'t2',text:'每天第一次打開時，列出已過期和快到期的食物'})), el('input',{type:'checkbox', id:'setPopup', checked: st.popup, onchange: e => saveSettings({popup:e.target.checked})})),
    el('label',{class:'setrow'}, el('div',{class:'tx'}, el('div',{text:'同時發出手機／電腦系統通知'}), el('div',{class:'t2',text: notifState === 'denied' ? '你之前拒絕了通知，要到瀏覽器設定裡重新允許。' : notifState === 'unsupported' ? '這個瀏覽器不支援通知。iPhone 需要先「加入主畫面」再開啟。' : '打開 App 時發出；App 完全關閉時不會通知'})),
      el('input',{type:'checkbox', id:'setNotify', checked: st.notify && notifState === 'granted', disabled: notifState === 'denied' || notifState === 'unsupported', onchange: async e => {
        if (e.target.checked && Notification.permission !== 'granted'){ const p = await Notification.requestPermission(); if (p !== 'granted'){ e.target.checked = false; toast('沒有取得通知權限'); return; } }
        saveSettings({notify:e.target.checked});
      }})),
    el('button',{class:'btn small', onclick:() => showDuePopup(true)}, '現在檢查一次')));
  area.append(el('div', {class:'panel'}, el('h3',{text:'安裝到手機'}),
    el('div',{class:'hint',text:'iPhone：用 Safari 打開，按分享 →「加入主畫面」。Android：Chrome 選單 →「安裝應用程式」。安裝後像 App 一樣開啟，沒網路也能看冰箱。'})));
}

/* ---------- sheet ---------- */
let sheetOnClose = null;
function openSheet(title, body, onClose){ $('#sheetTitle').textContent = title; $('#sheetBody').replaceChildren(body); $('#scrim').hidden = false; sheetOnClose = onClose || null; }
function closeSheet(){ $('#scrim').hidden = true; $('#sheetBody').replaceChildren(); const f = sheetOnClose; sheetOnClose = null; if (f) f(); }
$('#sheetClose').onclick = closeSheet;
$('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#scrim').hidden) closeSheet(); });

/* ---------- item detail ---------- */
function openDetail(id){
  const it = S.items.find(x => x.id === id); if (!it) return;
  const n = daysLeft(it.expiresAt), st = stateOf(it);
  const photoBox = el('div');
  if (it.photoId) photoData(it.photoId).then(d => { if (isImgData(d)) photoBox.append(el('img',{class:'photo-full', src:d, alt:'原始照片'})); });
  const confirmDel = el('button',{class:'btn small danger ghost', onclick: async e => {
    if (e.currentTarget.dataset.armed !== '1'){ e.currentTarget.dataset.armed = '1'; e.currentTarget.textContent = '確定刪除？（不列入統計）'; return; }
    if (await guard(store.del('items', it.id))){ if (it.photoId) store.del('photos', it.photoId).catch(() => {}); logAct('🗑️', `刪除了「${it.name}」`); closeSheet(); }
  }}, '刪除這筆');
  openSheet('食物詳情', el('div', {style:'display:flex;flex-direction:column;gap:14px'},
    el('div',{class:'detailtop'}, iconNode(it, 'bigic'), el('div',{}, el('h2',{style:'font-size:22px',text:it.name}), el('div',{class:'row',style:'margin-top:6px'}, el('span',{class:`pill p-${st}`,text:dlText(n)}), it.opened ? el('span',{class:'tagc',text:'已開封'}) : null, it.category ? el('span',{class:'tagc',text:it.category}) : null))),
    el('dl',{class:'kv'},
      el('dt',{text:'數量'}), el('dd',{text:`${it.qty ?? 1} ${it.unit||''}`}),
      el('dt',{text:'位置'}), el('dd',{text:locText(it)}),
      el('dt',{text:'放入日期'}), el('dd',{text:it.addedAt || '—'}),
      el('dt',{text:'過期日期'}), el('dd',{text:it.expiresAt || '未設定'}),
      it.note ? el('dt',{text:'備註'}) : null, it.note ? el('dd',{text:it.note}) : null,
      el('dt',{text:'放入的人'}), el('dd',{text:`${who(it.createdBy)}・${ago(it.createdAt)}`}),
      el('dt',{text:'最後編輯'}), el('dd',{text:`${who(it.updatedBy)}・${ago(it.updatedAt)}`})),
    photoBox,
    el('div',{class:'row'},
      (it.qty||1) > 1 ? el('button',{class:'btn', onclick: () => eatOne(it)}, '😋 吃掉 1' + (it.unit||'個')) : null,
      el('button',{class:'btn primary', onclick: () => finish(it, 'used')}, '✅ 吃完了'),
      el('button',{class:'btn danger', onclick: () => finish(it, 'wasted')}, '🗑️ 壞掉丟棄')),
    el('div',{class:'row'},
      el('button',{class:'btn', onclick: () => { closeSheet(); openEditor(it.id); }}, '✏️ 編輯／移動'),
      el('button',{class:'btn', onclick: () => guard(store.update('items', it.id, stamp({opened: !it.opened, openedAt: it.opened ? null : today()}))).then(() => { closeSheet(); toast(it.opened ? '已取消開封標記' : '已標記開封'); })}, it.opened ? '取消開封' : '🔓 標記已開封'),
      el('button',{class:'btn', onclick: () => addShop(it.name, '')}, '🛒 加入購物清單'),
      confirmDel)));
}
async function eatOne(it){
  const q = Math.max(0, (it.qty||1) - 1);
  if (q === 0) return finish(it, 'used');
  if (await guard(store.update('items', it.id, stamp({qty:q})))){ logAct('😋', `吃掉 1${it.unit||'個'}「${it.name}」，還剩 ${q}`); closeSheet(); toast(`還剩 ${q}${it.unit||''}`); }
}
async function finish(it, status){
  if (await guard(store.update('items', it.id, stamp({status, removedAt:new Date().toISOString()})))){
    logAct(status === 'used' ? '✅' : '🗑️', status === 'used' ? `吃完了「${it.name}」` : `丟掉了「${it.name}」`);
    closeSheet();
    openSheet('已更新', el('div',{style:'display:flex;flex-direction:column;gap:12px'}, el('p',{style:'margin:0',text:`「${it.name}」已${status === 'used' ? '吃完' : '丟棄'}。要再買嗎？`}),
      el('div',{class:'row'}, el('button',{class:'btn primary', onclick: async () => { await addShop(it.name, ''); closeSheet(); }}, '加入購物清單'), el('button',{class:'btn', onclick: closeSheet}, '不用'))));
  }
}

/* ---------- item editor ---------- */
function openEditor(id, preset){
  preset = preset || {};
  const old = id ? S.items.find(x => x.id === id) : null;
  const f0 = curFridge();
  const d = old ? Object.assign({}, old) : { name: preset.name || '', qty:1, unit:'', category:'', emoji:'', icon:null, iconImg:null, thumb:null, photoId:null, fridgeId: preset.fridgeId || (f0 && f0.id), addedAt: today(), expiresAt:'', opened:false, note:'' };
  let spot = preset.spot || (old ? spotKey(old) : null);
  let ai = null, photoUrl = null, photoBlob = null, busy = 0, expTouched = !!(old && old.expiresAt);
  const fridgeSel = el('select', {class:'inp', id:'edFridge'}, fridges().map(f => el('option',{value:f.id, text:f.name})));
  fridgeSel.value = d.fridgeId || '';
  const spotSel = el('select', {class:'inp', id:'edSpot'});
  function fillSpots(){ const f = S.fridges.find(x => x.id === fridgeSel.value); spotSel.replaceChildren(); if (!f) return; const opts = spotOptions(f); opts.forEach(o => spotSel.append(el('option',{value:o.v,text:o.t}))); if (spot && opts.some(o => o.v === spot)) spotSel.value = spot; else if (opts[0]) spotSel.value = opts[0].v; }
  fillSpots();
  fridgeSel.onchange = () => { spot = null; fillSpots(); autoExp(); };
  spotSel.onchange = () => { spot = spotSel.value; autoExp(); };
  const curKind = () => { const f = S.fridges.find(x => x.id === fridgeSel.value); const sid = spotSel.value.split('|')[0]; if (sid === 'door') return 'chill'; const s = f && (f.sections||[]).find(x => x.id === sid); return s ? s.kind : 'chill'; };

  const name = el('input', {class:'inp', id:'edName', value:d.name, placeholder:'例如：雞蛋、鮮奶、高麗菜', autocomplete:'off'});
  const qty = el('input', {class:'inp', id:'edQty', type:'number', min:'0', step:'any', value:String(d.qty ?? 1)});
  const unit = el('input', {class:'inp', id:'edUnit', value:d.unit||'', placeholder:'個、盒、g'});
  const cat = el('select', {class:'inp', id:'edCat'}, el('option',{value:'',text:'自動判斷'}), CATS.map(c => el('option',{value:c,text:c})));
  cat.value = d.category || '';
  const added = el('input', {class:'inp', id:'edAdded', type:'date', value:d.addedAt||today()});
  const exp = el('input', {class:'inp', id:'edExp', type:'date', value:d.expiresAt||''});
  const opened = el('input', {type:'checkbox', id:'edOpened', checked:!!d.opened});
  const note = el('textarea', {class:'inp', id:'edNote', placeholder:'例如：給小孩的、要先吃'}, d.note||'');
  const expHint = el('div', {class:'hint'});
  const aiBox = el('div', {class:'aibox', hidden:true});
  const err = el('div', {class:'err', hidden:true});
  const big = el('div', {class:'bigic'});
  function drawIcon(){
    big.replaceChildren(); big.classList.remove('photo');
    if (d.icon) big.append(el('img',{src:svgUrl(d.icon),alt:'Q版圖示'}));
    else if (isImgData(d.iconImg)) big.append(el('img',{src:d.iconImg,alt:'Q版圖示'}));
    else if (photoUrl || isImgData(d.thumb)){ big.classList.add('photo'); big.append(el('img',{src: photoUrl || d.thumb, alt:'照片'})); }
    else big.textContent = d.emoji || (lookup(name.value) || {}).emoji || CAT_EMOJI[cat.value] || '🍽️';
    if (busy) big.append(el('div',{class:'busy',text:'AI 處理中…'}));
  }
  function autoExp(force){
    if (expTouched && !force) return;
    const days = estimateDays(name.value, curKind(), ai);
    exp.value = addDays(added.value || today(), days);
    expHint.textContent = `${KIND[curKind()].name}約可放 ${days} 天（${ai ? 'AI 估計' : (lookup(name.value) ? '常見保存天數' : '預設值')}），可自行修改。`;
  }
  name.addEventListener('input', () => { if (!old){ const l = lookup(name.value); if (l && !d.icon && !photoUrl) d.emoji = l.emoji; } drawIcon(); autoExp(); });
  added.addEventListener('change', () => autoExp());
  exp.addEventListener('input', () => { expTouched = true; expHint.textContent = ''; });
  const quick = el('div', {class:'row'}, [['自動估算', 0], ['+3 天', 3], ['+1 週', 7], ['+1 個月', 30], ['+3 個月', 90]].map(([t, n]) => el('button', {type:'button', class:'btn small', onclick:() => { if (!n){ expTouched = false; autoExp(true); } else { exp.value = addDays(added.value || today(), n); expTouched = true; expHint.textContent = ''; } }}, t)));

  const aiBtn = el('button', {type:'button', class:'btn small', disabled: !aiOn() || AI.chibi === 'off', title: aiOn() ? '' : 'AI 已在設定中關閉', onclick:() => makeChibi()}, '✨ 產生 Q 版圖示');
  const photoBtn = el('button', {type:'button', class:'btn small', onclick:() => { pickTarget = handlePhoto; $('#photoPick').click(); }}, '📷 拍照／選照片');
  const clearIcon = el('button', {type:'button', class:'btn small ghost', onclick:() => { d.icon = null; d.iconImg = null; d.thumb = null; d.photoId = null; photoUrl = null; photoBlob = null; drawIcon(); }}, '改用表情符號');

  async function handlePhoto(file){
    if (!file) return;
    err.hidden = true;
    try { photoUrl = await compressPhoto(file); photoBlob = await dataUrlToBlob(photoUrl); }
    catch { err.textContent = '這張照片讀不到，請換一張。'; err.hidden = false; return; }
    d.icon = null; d.iconImg = null; d.photoId = null; drawIcon();
    if (aiOn()){ recognize(); if (AI.chibi !== 'off') makeChibi(); }
    else { aiBox.hidden = false; aiBox.textContent = 'AI 已關閉，照片會直接當作圖示，請手動填寫名稱。'; }
  }
  async function recognize(){
    busy++; drawIcon(); aiBox.hidden = false; aiBox.textContent = '🔎 正在辨識照片裡的食物…';
    try {
      const r = await askJSON(`辨識照片中的主要食物（台灣家庭冰箱情境）。只回覆一個 JSON 物件：{"name":"繁體中文名稱，簡短","emoji":"最接近的一個emoji","category":"從這些選一個：${CATS.join('、')}","qty":數量(數字，看不出來填1),"unit":"單位，例如 個、盒、顆、包","chillDays":冷藏可保存天數,"freezeDays":冷凍可保存天數(不適合冷凍填0),"bestZone":"chill 或 freeze 或 fresh","tip":"一句保存建議，繁體中文"}。如果看不出是食物，name 填 "未知"。`, [photoBlob]);
      if (!r || typeof r !== 'object') throw new Error('bad');
      ai = {name:String(r.name||'').slice(0,30), emoji:String(r.emoji||'').slice(0,4), category: CATS.includes(r.category) ? r.category : '', chillDays:+r.chillDays||0, freezeDays:+r.freezeDays||0, bestZone:['chill','freeze','fresh'].includes(r.bestZone) ? r.bestZone : 'chill', tip:String(r.tip||'').slice(0,120)};
      if (ai.name && ai.name !== '未知'){
        if (!name.value.trim()) name.value = ai.name;
        if (ai.emoji) d.emoji = ai.emoji;
        if (ai.category && !cat.value) cat.value = ai.category;
        if (r.qty && +qty.value === 1) qty.value = String(+r.qty || 1);
        if (r.unit && !unit.value) unit.value = String(r.unit).slice(0,6);
        if (!preset.spot && !old){ const f = S.fridges.find(x => x.id === fridgeSel.value); const s = f && (f.sections||[]).find(x => x.kind === ai.bestZone); if (s){ const v = `${s.id}|0|${s.split ? 'L' : 'A'}`; spotSel.value = v; spot = v; } }
        expTouched = false; autoExp();
        aiBox.textContent = `🔎 看起來是「${ai.name}」。冷藏約 ${ai.chillDays || '—'} 天、冷凍約 ${ai.freezeDays ? ai.freezeDays + ' 天' : '不建議'}。${ai.tip}`;
      } else aiBox.textContent = '🔎 看不太出來是什麼食物，請手動填寫名稱。';
    } catch (e){ aiBox.textContent = '辨識沒有成功：' + aiErrText(e) + ' 請手動填寫名稱。'; }
    finally { busy--; drawIcon(); }
  }
  async function makeChibi(){
    if (!aiOn() || AI.chibi === 'off') return;
    const nm = name.value.trim() || (ai && ai.name) || '';
    if (!nm && !photoBlob){ err.textContent = '先輸入名稱或拍一張照片，才能畫 Q 版圖示。'; err.hidden = false; return; }
    err.hidden = true; busy++; aiBtn.disabled = true; drawIcon();
    const subject = nm ? `「${nm}」` : '照片裡的食物';
    try {
      if (AI.chibi === 'image'){
        const img = await genImage(`畫一張可愛的 Q 版（chibi、kawaii）食物貼紙插畫，主角是${subject}${photoBlob ? '，外型和顏色參考照片' : ''}。擬人化、大眼睛、腮紅、微笑，圓潤造型，粗外框，白色貼紙描邊，純白背景，正方形構圖，畫面中不要有文字。`, photoBlob ? [photoBlob] : []);
        d.iconImg = await shrink(img, 192, .9, 'image/png'); d.icon = null;
      } else {
        const t = await askText(`畫一個可愛的 Q 版（chibi、kawaii）貼紙圖示，主角是${subject}${photoBlob ? '，顏色和外型參考照片' : ''}。
要求：SVG，viewBox="0 0 120 120"，寬高不要寫死；食物本身擬人化，有大大的閃亮眼睛、腮紅、微笑；圓潤造型、扁平配色、深棕色粗外框(#3b2a22, stroke-width 3)，外圍一圈白色貼紙描邊；背景透明；不要文字、不要 <script>、不要外部連結或圖片、不要 filter；總長度 4000 字元以內。只回覆 SVG 程式碼本身。`, photoBlob ? [photoBlob] : []);
        const svg = sanitizeSvg(t); if (!svg) throw new Error('nosvg');
        d.icon = svg; d.iconImg = null;
      }
      drawIcon();
    } catch (e){ err.textContent = 'Q 版圖示沒畫成功：' + aiErrText(e); err.hidden = false; }
    finally { busy--; aiBtn.disabled = !aiOn() || AI.chibi === 'off'; drawIcon(); }
  }

  const saveBtn = el('button', {class:'btn primary', type:'submit'}, old ? '儲存' : '放進冰箱');
  const form = el('form', {style:'display:flex;flex-direction:column;gap:14px', onsubmit: async e => {
    e.preventDefault();
    const nm = name.value.trim(); if (!nm){ err.textContent = '請填寫食物名稱。'; err.hidden = false; name.focus(); return; }
    if (!fridgeSel.value || !spotSel.value){ err.textContent = '請選擇要放的位置。'; err.hidden = false; return; }
    if (busy){ err.textContent = 'AI 還在處理，請稍等幾秒。'; err.hidden = false; return; }
    saveBtn.disabled = true;
    let photoId = d.photoId || null, thumb = d.thumb || null;
    if (photoUrl){
      photoId = uid();
      thumb = await shrink(photoUrl, 128, .7);
      if (!S.demo) store.set('photos', photoId, {data: photoUrl, by:S.me.id, at:new Date().toISOString()}).catch(e2 => console.warn(e2));
      photoCache.set(photoId, photoUrl);
      if (old && old.photoId && old.photoId !== photoId) store.del('photos', old.photoId).catch(() => {});
    }
    const [sectionId, shelf, side] = spotSel.value.split('|');
    const l = lookup(nm);
    const row = { name:nm, qty: Math.max(0, +qty.value || 1), unit: unit.value.trim(), category: cat.value || (ai && ai.category) || (l && l.category) || '其他',
      emoji: d.emoji || (l && l.emoji) || '', icon: d.icon || null, iconImg: d.iconImg || null, thumb, photoId, fridgeId: fridgeSel.value, sectionId, shelf:+shelf, side,
      addedAt: added.value || today(), expiresAt: exp.value || '', opened: opened.checked, note: note.value.trim(), status: old ? (old.status || 'in') : 'in' };
    const nid = old ? old.id : uid();
    const data = old ? Object.assign({}, old, row, stamp()) : Object.assign(row, {createdBy:S.me.id, createdAt:new Date().toISOString()}, stamp());
    delete data.id;
    const ok = await guard(store.set('items', nid, data));
    saveBtn.disabled = false;
    if (!ok) return;
    if (old){ const moved = spotKey(old) !== spotSel.value || old.fridgeId !== fridgeSel.value; logAct('✏️', `編輯了「${nm}」${moved ? '並移到 ' + locText(data) : ''}`); }
    else logAct('🧺', `放入「${nm}」${row.qty !== 1 ? ' ×' + row.qty + row.unit : ''} 到 ${locText(data)}`);
    if (preset.fromShop) guard(store.del('shopping', preset.fromShop));
    S.cur = fridgeSel.value; lsSet('fr.cur', S.cur);
    closeSheet(); toast(old ? '已儲存' : `已放進冰箱：${nm}`);
  }},
    el('div',{class:'iconedit'}, big, el('div',{style:'display:flex;flex-direction:column;gap:6px;min-width:0'}, el('div',{class:'row'}, photoBtn, aiBtn), el('div',{class:'row'}, clearIcon), el('div',{class:'hint',text: aiOn() ? '拍照會自動辨識食物、估算保存天數，並畫成 Q 版圖示。' : 'AI 已關閉，照片會直接當作圖示。'}))),
    aiBox,
    el('div',{class:'field'}, el('label',{for:'edName',text:'名稱'}), name),
    el('div',{class:'f2'}, el('div',{class:'field'}, el('label',{for:'edQty',text:'數量'}), qty), el('div',{class:'field'}, el('label',{for:'edUnit',text:'單位'}), unit)),
    el('div',{class:'f2'}, el('div',{class:'field'}, el('label',{for:'edFridge',text:'冰箱'}), fridgeSel), el('div',{class:'field'}, el('label',{for:'edSpot',text:'位置'}), spotSel)),
    el('div',{class:'field'}, el('label',{for:'edCat',text:'分類'}), cat),
    el('div',{class:'f2'}, el('div',{class:'field'}, el('label',{for:'edAdded',text:'放入日期'}), added), el('div',{class:'field'}, el('label',{for:'edExp',text:'過期日期'}), exp)),
    quick, expHint,
    el('label',{class:'row',style:'gap:8px'}, opened, '已開封'),
    el('div',{class:'field'}, el('label',{for:'edNote',text:'備註'}), note),
    err,
    el('div',{class:'row',style:'justify-content:flex-end'}, el('button',{type:'button', class:'btn', onclick:closeSheet}, '取消'), saveBtn));
  drawIcon();
  if (!old) autoExp();
  openSheet(old ? `編輯：${old.name}` : '新增食物', form);
  if (preset.photo) handlePhoto(preset.photo);
  else if (!old) setTimeout(() => name.focus(), 50);
}
let pickTarget = null;
$('#photoPick').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (pickTarget && f) pickTarget(f); });
$('#photoInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) openEditor(null, {photo:f}); });
$('#fabPhoto').onclick = () => $('#photoInput').click();
$('#fabAdd').onclick = () => openEditor(null);

/* ---------- fridge editor ---------- */
function openFridgeEditor(id){
  const old = id ? S.fridges.find(x => x.id === id) : null;
  const d = old ? JSON.parse(JSON.stringify(old)) : templateFridge('');
  if (!old) d.name = S.fridges.length ? `冰箱 ${S.fridges.length + 1}` : '家裡的冰箱';
  const name = el('input', {class:'inp', id:'frName', value:d.name});
  const door = el('select', {class:'inp', id:'frDoor'}, [0,1,2,3,4,5,6].map(n => el('option',{value:n,text: n ? `${n} 格` : '沒有門邊層架'})));
  door.value = String(d.door || 0);
  const secHost = el('div', {style:'display:flex;flex-direction:column;gap:8px'});
  const err = el('div', {class:'err', hidden:true});
  const used = s => active().some(i => i.fridgeId === (old && old.id) && i.sectionId === s.id);
  function drawSecs(){
    secHost.replaceChildren();
    d.sections.forEach((s, i) => {
      const kd = el('select', {class:'inp', 'aria-label':'溫層', onchange:e => s.kind = e.target.value}, Object.entries(KIND).map(([k, v]) => el('option',{value:k,text:v.name})));
      kd.value = s.kind;
      const sh = el('select', {class:'inp', 'aria-label':'層數', onchange:e => s.shelves = +e.target.value}, [1,2,3,4,5,6,7,8].map(n => el('option',{value:n,text:n + ' 層'})));
      sh.value = String(s.shelves);
      secHost.append(el('div', {class:'secrow'},
        el('input', {class:'inp', value:s.name, 'aria-label':'區域名稱', oninput:e => s.name = e.target.value}), kd, sh,
        el('label', {}, el('input',{type:'checkbox', checked:!!s.split, onchange:e => s.split = e.target.checked}), '左右分櫃'),
        el('div', {class:'row', style:'gap:4px;flex-wrap:nowrap'},
          el('button',{type:'button', class:'btn small ghost', 'aria-label':'上移', disabled: i === 0, onclick:() => { [d.sections[i-1], d.sections[i]] = [d.sections[i], d.sections[i-1]]; drawSecs(); }}, '↑'),
          el('button',{type:'button', class:'btn small ghost', 'aria-label':'下移', disabled: i === d.sections.length - 1, onclick:() => { [d.sections[i+1], d.sections[i]] = [d.sections[i], d.sections[i+1]]; drawSecs(); }}, '↓'),
          el('button',{type:'button', class:'btn small ghost danger', 'aria-label':'刪除區域', onclick:() => { if (used(s)){ err.textContent = `「${s.name}」裡還有食物，請先移走再刪除。`; err.hidden = false; return; } d.sections.splice(i, 1); drawSecs(); }}, '✕'))));
    });
  }
  drawSecs();
  const addSec = el('div', {class:'row'}, Object.entries(KIND).map(([k, v]) => el('button',{type:'button', class:'btn small', onclick:() => { d.sections.push({id:uid(), name: v.name + (k === 'freeze' ? '庫' : '室'), kind:k, shelves: k === 'fresh' ? 1 : 2, split: k !== 'freeze'}); drawSecs(); }}, '＋ ' + v.name)));
  const delBtn = old ? el('button', {type:'button', class:'btn danger ghost', onclick: async e => {
    if (active().some(i => i.fridgeId === old.id)){ err.textContent = '這台冰箱裡還有食物，請先移走或標記吃完。'; err.hidden = false; return; }
    if (e.currentTarget.dataset.armed !== '1'){ e.currentTarget.dataset.armed = '1'; e.currentTarget.textContent = '再按一次確認刪除'; return; }
    if (await guard(store.del('fridges', old.id))){ logAct('🧊', `刪除了冰箱「${old.name}」`); S.cur = null; closeSheet(); }
  }}, '刪除這台冰箱') : el('span');
  openSheet(old ? '冰箱設定' : '新增冰箱', el('form', {style:'display:flex;flex-direction:column;gap:14px', onsubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()){ err.textContent = '請幫冰箱取個名字。'; err.hidden = false; return; }
    if (!d.sections.length){ err.textContent = '至少要有一個區域。'; err.hidden = false; return; }
    const doorN = +door.value;
    if (old && doorN < (old.door||0) && active().some(i => i.fridgeId === old.id && i.sectionId === 'door' && (i.shelf||0) >= doorN)){ err.textContent = '減少的門邊格裡還有食物，請先移走。'; err.hidden = false; return; }
    const data = { name: name.value.trim(), door: doorN, order: old ? (old.order||0) : S.fridges.length, sections: d.sections.map(s => ({id:s.id, name:(s.name||'').trim() || KIND[s.kind].name, kind:s.kind, shelves:+s.shelves||1, split:!!s.split})) };
    const fid = old ? old.id : uid();
    const body = Object.assign({}, old || {createdBy:S.me.id}, data, stamp()); delete body.id;
    if (await guard(store.set('fridges', fid, body))){ logAct('🧊', old ? `調整了冰箱「${data.name}」的配置` : `建立了冰箱「${data.name}」`); S.cur = fid; lsSet('fr.cur', fid); closeSheet(); }
  }},
    el('div',{class:'f2'}, el('div',{class:'field'}, el('label',{for:'frName',text:'冰箱名稱'}), name), el('div',{class:'field'}, el('label',{for:'frDoor',text:'門邊層架'}), door)),
    el('div',{class:'flabel',text:'區域（由上到下）'}), secHost, addSec, err,
    el('div',{class:'row',style:'justify-content:space-between'}, delBtn, el('div',{class:'row'}, el('button',{type:'button',class:'btn',onclick:closeSheet},'取消'), el('button',{class:'btn primary'}, old ? '儲存配置' : '建立冰箱')))));
}

/* ---------- expiry check on open ---------- */
async function showDuePopup(force){
  const due = active().filter(i => stateOf(i) !== 'good').sort(byExp);
  const key = 'fr.popup.' + (S.hid || 'demo');
  if (!force){
    if (!S.settings.popup || lsGet(key, '') === today()) return;
    lsSet(key, today());
    if (!due.length) return;
  }
  const bad = due.filter(i => stateOf(i) === 'bad');
  if (S.settings.notify && !force && typeof Notification !== 'undefined' && Notification.permission === 'granted'){
    const body = `${bad.length ? `${bad.length} 樣已過期、` : ''}${due.length - bad.length} 樣 ${remind()} 天內到期：${due.slice(0, 4).map(i => i.name).join('、')}${due.length > 4 ? '…' : ''}`;
    try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) reg.showNotification('冰箱到期提醒', {body, icon:'./icon-192.png', tag:'due'}); else new Notification('冰箱到期提醒', {body}); } catch (e) { console.warn(e); }
  }
  if ($('#scrim').hidden === false && !force) return;
  openSheet('今日效期提醒', el('div', {style:'display:flex;flex-direction:column;gap:12px'},
    due.length ? el('p',{style:'margin:0',text: `${bad.length ? `有 ${bad.length} 樣已經過期，` : ''}${due.length - bad.length ? `${due.length - bad.length} 樣在 ${remind()} 天內到期。` : ''}點一下可以處理。`}) : el('p',{style:'margin:0',text:'目前沒有快到期的食物 👍'}),
    due.length ? listOf(due, true) : null,
    el('div',{class:'row',style:'justify-content:flex-end'}, due.length ? el('button',{class:'btn', onclick:() => { closeSheet(); go('recipes'); }}, '🍳 找食譜用掉它們') : null, el('button',{class:'btn primary', onclick: closeSheet}, '知道了'))));
}

/* ---------- misc wiring ---------- */
$('#q').addEventListener('input', e => { S.q = e.target.value; renderFridge(); });
$('#remindDays').addEventListener('change', e => saveSettings({remind:+e.target.value}));
$('#rGo').onclick = suggestRecipes;
$('#bookAdd').onclick = () => openRecipeEditor(null);
$('#bookImport').onclick = openImport;
$('#bookQ').addEventListener('input', e => { S.bookQ = e.target.value; renderBook(); });
$('#shopForm').addEventListener('submit', e => { e.preventDefault(); addShop($('#shopName').value, $('#shopQty').value.trim()); $('#shopName').value = ''; $('#shopQty').value = ''; $('#shopName').focus(); });
$('#clearDone').onclick = () => { const d = S.shopping.filter(s => s.done); d.forEach(s => guard(store.del('shopping', s.id))); if (d.length) toast(`清除了 ${d.length} 項`); };
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

/* ================= auth, households & subscriptions ================= */
const LOGO = $('.logo').outerHTML;
const G_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
function gate(nodes){ const g = $('#gate'); $('#gateCard').replaceChildren(...nodes.filter(Boolean)); g.hidden = false; }
function closeGate(){ $('#gate').hidden = true; }
function logoNode(){ const t = document.createElement('template'); t.innerHTML = LOGO; return t.content.firstChild; }

function showLogin(msg){
  const btn = el('button', {class:'gbtn', onclick: async () => {
    const provider = new GoogleAuthProvider();
    // 網站和登入頁同網域（Firebase Hosting）時才能安全使用 redirect；跨網域（github.io）在手機會出現 "missing initial state"
    const sameOrigin = location.hostname === auth.config.authDomain;
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    if (sameOrigin && standalone) return signInWithRedirect(auth, provider); // iPhone 主畫面 App 的彈出視窗不可靠
    try { await signInWithPopup(auth, provider); }
    catch (e){
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')
        return sameOrigin ? signInWithRedirect(auth, provider) : showLogin('登入視窗被擋住了。請改用 https://' + auth.config.authDomain + ' 開啟再登入。');
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') showLogin(e.code === 'auth/unauthorized-domain' ? '這個網址還沒加入 Firebase 的授權網域（Authentication → 設定 → 授權網域）。' : '登入沒有成功，請再試一次。');
    }
  }});
  btn.innerHTML = G_ICON + '<span>用 Google 帳號登入</span>';
  gate([logoNode(), el('h2',{text:'家庭冰箱管家'}), el('p',{text:'全家一起管理冰箱：拍照放入、到期提醒、食譜和購物清單。'}), btn, msg ? el('div',{class:'err',text:msg}) : null]);
}

function showOnboard(fromSettings){
  const name = el('input', {class:'inp', id:'newHouse', value: `${(S.me.name || '我').split(' ')[0]}的家`});
  const code = el('input', {class:'inp', id:'joinCode', placeholder:'貼上家人給你的邀請連結'});
  const msg = el('div', {class:'err', hidden:true});
  gate([logoNode(), el('h2',{text:'選擇你的家庭'}), el('p',{text:'建立一個新家庭，或用家人傳來的邀請連結加入。'}),
    el('div',{class:'field'}, el('label',{for:'newHouse',text:'新家庭名稱'}), name),
    el('button',{class:'btn primary', onclick: async e => { e.currentTarget.disabled = true; try { await createHouse(name.value.trim() || '我的家'); } catch (err){ console.error(err); msg.textContent = '建立失敗：' + (err.code === 'permission-denied' ? '請確認 Firestore 安全規則已經貼上。' : (err.code || '請檢查網路')); msg.hidden = false; e.currentTarget.disabled = false; } }}, '建立新家庭'),
    el('div',{class:'field'}, el('label',{for:'joinCode',text:'或加入家人的家庭'}), code),
    el('button',{class:'btn', onclick: async () => { const m = code.value.match(/join=([\w-]+)_([\w]+)/) || code.value.trim().match(/^([\w-]+)_([\w]+)$/); if (!m){ msg.textContent = '看不懂這個連結，請確認有完整貼上。'; msg.hidden = false; return; } try { await joinHouse(m[1], m[2]); } catch (err){ msg.textContent = '加入失敗，連結可能已經換新或過期，請向家人要新的連結。'; msg.hidden = false; } }}, '加入'),
    msg,
    fromSettings ? el('button',{class:'btn ghost', onclick: closeGate}, '返回') : el('button',{class:'btn ghost', onclick:() => signOut(auth)}, '登出')]);
}

async function createHouse(name){
  const hid = uid() + randCode(4);
  const me = {name:S.me.name || '', photo:S.me.photo || '', joinedAt:new Date().toISOString()};
  await setDoc(doc(db, 'households', hid), {name, owner:S.me.id, joinCode:randCode(10), members:{[S.me.id]: me}, createdAt:new Date().toISOString()});
  const fid = uid();
  await setDoc(doc(db, 'households', hid, 'fridges', fid), Object.assign(templateFridge(), {createdBy:S.me.id, updatedBy:S.me.id, updatedAt:new Date().toISOString()}));
  await setDoc(doc(db, 'users', S.me.id), {current:hid, households:arrayUnion(hid)}, {merge:true});
  S.cur = fid; lsSet('fr.cur', fid);
  openHouse(hid);
}
async function joinHouse(hid, code){
  await updateDoc(doc(db, 'households', hid), {[`members.${S.me.id}`]: {name:S.me.name || '', photo:S.me.photo || '', joinedAt:new Date().toISOString()}, joinWith: code});
  await setDoc(doc(db, 'users', S.me.id), {current:hid, households:arrayUnion(hid)}, {merge:true});
  history.replaceState(null, '', location.pathname + location.hash);
  toast('已加入家庭 🎉');
  openHouse(hid);
}
function switchHouse(hid){ setDoc(doc(db, 'users', S.me.id), {current:hid}, {merge:true}).catch(() => {}); openHouse(hid); }

// 每個家庭只建立一組監聽；切換家庭時先全部取消再重建，所以不會重複監聽。
let unsubs = [];
function stopSubs(){ unsubs.forEach(u => { try { u(); } catch {} }); unsubs = []; }
let popupTimer = null, profileSynced = false, pruned = false;
function openHouse(hid){
  stopSubs(); closeGate();
  S.hid = hid; S.house = null; S.fridges = []; S.items = []; S.shopping = []; S.activity = []; S.book = []; S.recipes = null; S.loaded = false;
  profileSynced = false; pruned = false;
  render();
  let firstItems = true;
  const timer = setTimeout(() => { if (!S.loaded){ S.loaded = true; showNotice('目前連不上網路，先顯示上次存在這台裝置的資料。'); render(); } }, 8000);
  const onErr = e => { console.error(e); if (e.code === 'permission-denied'){ stopSubs(); S.hid = null; showOnboard(false); } };
  const map = snap => snap.docs.map(d => Object.assign({}, d.data(), {id: d.id}));
  unsubs.push(onSnapshot(doc(db, 'households', hid), s => {
    if (!s.exists()){ stopSubs(); showOnboard(false); return; }
    S.house = s.data();
    if (!S.house.members || !S.house.members[S.me.id]){ stopSubs(); showOnboard(false); return; }
    // 名字或頭像變了才更新一次（不在每次快照都寫入）
    const m = S.house.members[S.me.id];
    if (!profileSynced && !s.metadata.fromCache){ profileSynced = true; if (m.name !== S.me.name || m.photo !== S.me.photo) updateDoc(doc(db, 'households', hid), {[`members.${S.me.id}.name`]: S.me.name || '', [`members.${S.me.id}.photo`]: S.me.photo || ''}).catch(() => {}); }
    render();
  }, onErr));
  unsubs.push(onSnapshot(hcol('fridges'), s => { S.fridges = map(s); render(); }, onErr));
  unsubs.push(onSnapshot(hcol('items'), s => {
    S.items = map(s);
    if (!S.loaded){ S.loaded = true; clearTimeout(timer); }
    if (!s.metadata.fromCache) showNotice('');
    render();
    if (firstItems){ firstItems = false; clearTimeout(popupTimer); popupTimer = setTimeout(() => showDuePopup(false), 900); }
    if (!s.metadata.fromCache) prune();
  }, onErr));
  unsubs.push(onSnapshot(hcol('shopping'), s => { S.shopping = map(s); if (S.tab === 'shopping') render(); }, onErr));
  unsubs.push(onSnapshot(query(hcol('activity'), orderBy('at', 'desc'), limit(80)), s => { S.activity = map(s); if (S.tab === 'fridge' || S.tab === 'log') render(); }, onErr));
  unsubs.push(onSnapshot(hcol('recipes'), s => { S.book = map(s); if (S.tab === 'recipes') render(); }, onErr));
  unsubs.push(onSnapshot(hdoc('meta', 'suggestions'), s => { S.recipes = s.exists() ? s.data() : null; if (S.tab === 'recipes') render(); }, () => {}));
}
// 開啟時清掉很舊的紀錄（每次開啟最多一次、最多 40 筆），避免資料無限增長
async function prune(){
  if (pruned || S.demo) return; pruned = true;
  try {
    const cut = new Date(Date.now() - 120 * 864e5).toISOString();
    const old = await getDocs(query(hcol('activity'), where('at', '<', cut), limit(40)));
    for (const d of old.docs) await deleteDoc(d.ref);
    const cutItems = new Date(Date.now() - 400 * 864e5).toISOString();
    for (const it of S.items.filter(i => i.status && i.status !== 'in' && (i.removedAt||'') < cutItems).slice(0, 40)){ await deleteDoc(hdoc('items', it.id)); if (it.photoId) await deleteDoc(hdoc('photos', it.photoId)); }
  } catch (e){ console.warn(e); }
}

/* ---------- demo (no Firebase config yet) ---------- */
function loadDemo(){
  S.demo = true; S.me = {id:'demo-me', name:'我', photo:''};
  const f = templateFridge('示範冰箱'); f.id = 'demo-f'; S.fridges = [f]; S.cur = 'demo-f';
  const [c, v, z] = f.sections;
  const mk = (name, emoji, cat, sec, shelf, side, addAgo, expIn, qty, unit, by) => ({id:uid(), name, emoji, category:cat, fridgeId:'demo-f', sectionId:sec, shelf, side, addedAt:addDays(today(), -addAgo), expiresAt:addDays(today(), expIn), qty, unit, status:'in', createdBy:by, updatedBy:by, createdAt:new Date(Date.now() - addAgo*864e5).toISOString(), updatedAt:new Date(Date.now() - addAgo*864e5).toISOString()});
  S.items = [ mk('鮮奶','🥛','蛋奶','door',0,'A',4,1,1,'瓶','demo-mom'), mk('雞蛋','🥚','蛋奶','door',1,'A',6,15,8,'顆','demo-me'), mk('番茄醬','🫙','調味','door',2,'A',30,150,1,'罐','demo-mom'),
    mk('滷肉','🍲','熟食',c.id,0,'L',3,-1,1,'盒','demo-mom'), mk('優格','🥣','蛋奶',c.id,0,'R',2,6,4,'杯','demo-me'), mk('豆腐','🫘','豆製品',c.id,1,'L',1,2,1,'盒','demo-me'), mk('雞腿','🍗','肉類',c.id,2,'L',1,1,2,'隻','demo-mom'),
    mk('高麗菜','🥬','蔬菜',v.id,0,'L',2,11,1,'顆','demo-mom'), mk('番茄','🍅','蔬菜',v.id,0,'R',3,4,3,'顆','demo-me'), mk('水餃','🥟','冷凍食品',z.id,0,'A',10,80,30,'顆','demo-mom'), mk('冰淇淋','🍦','冷凍食品',z.id,1,'A',5,55,1,'盒','demo-me') ];
  S.book = [ {id:uid(), name:'番茄炒蛋', emoji:'🍳', minutes:15, servings:2, ingredients:[{name:'番茄',qty:'2顆'},{name:'雞蛋',qty:'3顆'},{name:'蔥',qty:'1根'},{name:'糖',qty:'1小匙'}], steps:['番茄切塊，蛋打散','熱鍋炒蛋至半熟先盛起','炒番茄出汁，加糖調味','倒回蛋拌炒，撒蔥花'], fav:true, cooked:3, lastCooked:addDays(today(),-5), createdBy:'demo-mom'} ];
  S.shopping = [{id:uid(), name:'青蔥', qty:'1 把', done:false, by:'demo-mom', at:new Date().toISOString()}];
  S.activity = [{id:uid(), at:new Date(Date.now()-36e5).toISOString(), by:'demo-mom', icon:'🧺', text:'放入「雞腿」×2隻 到 示範冰箱 · 冷藏室 · 第 3 層 · 左'}];
  S.loaded = true; S.settings.provider = 'off'; applySettings();
  showNotice('示範模式：還沒填入 Firebase 設定（src/firebase-config.js），資料不會儲存。');
}

/* ---------- boot ---------- */
function boot(){
  // LINE 內建瀏覽器不能用 Google 登入：加上 openExternalBrowser=1 讓 LINE 改用手機預設瀏覽器開啟
  if (/\bLine\//i.test(navigator.userAgent) && !/[?&]openExternalBrowser=1/.test(location.search)){
    const u = new URL(location.href); u.searchParams.set('openExternalBrowser', '1'); location.replace(u.href); return;
  }
  buildTabs();
  const h = location.hash.slice(1); if (TABS.some(t => t[0] === h)) S.tab = h;
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (!configured){ loadDemo(); render(); return; }
  render();
  let userUnsub = null;
  onAuthStateChanged(auth, async user => {
    stopSubs(); if (userUnsub){ userUnsub(); userUnsub = null; }
    if (!user){ S.user = null; S.me = {id:null, name:'', photo:''}; showLogin(); return; }
    S.user = user; S.me = {id:user.uid, name:user.displayName || '', photo:user.photoURL || ''};
    gate([logoNode(), el('h2',{text:'登入中…'})]);
    const uref = doc(db, 'users', user.uid);
    setDoc(uref, {name:S.me.name, photo:S.me.photo, email:user.email || '', lastLogin:new Date().toISOString()}, {merge:true}).catch(() => {});
    const join = new URLSearchParams(location.search).get('join');
    let first = true;
    userUnsub = onSnapshot(uref, async s => {
      S.userDoc = s.exists() ? s.data() : {};
      if (S.userDoc.settings){ Object.assign(S.settings, S.userDoc.settings); applySettings(); lsSet('fr.settings', JSON.stringify(S.settings)); }
      if (!first) { if (S.tab === 'settings') render(); return; }
      first = false;
      if (join){ const m = join.match(/^([\w-]+)_([\w]+)$/); if (m){ try { await joinHouse(m[1], m[2]); return; } catch (e){ console.error(e); history.replaceState(null, '', location.pathname + location.hash); toast('邀請連結無效或已換新，請向家人要新的連結'); } } }
      const cur = S.userDoc.current || (S.userDoc.households || [])[0];
      if (cur) openHouse(cur); else showOnboard(false);
    }, e => { console.error(e); showLogin('讀取帳號資料失敗，請確認 Firestore 已建立並貼上安全規則。'); });
  });
}
boot();
