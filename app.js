/* =========================================================
   Einkaufsplaner – Anwendungslogik
   Datenhaltung: localStorage (offline-fähig, pro Gerät getrennt).
   ========================================================= */

const STORAGE_KEY = 'einkaufsplaner_data_v1';

const CATS = [
  {id:'discounter', name:'Discounter', color:'#ea580c'},
  {id:'supermarkt', name:'Supermarkt', color:'#059669'},
  {id:'drogerie', name:'Drogerie', color:'#db2777'},
  {id:'baeckerei', name:'Bäckerei', color:'#b45309'},
  {id:'getraenke', name:'Getränkemarkt', color:'#2563eb'},
  {id:'metzgerei', name:'Metzgerei', color:'#dc2626'},
  {id:'sonstiges', name:'Sonstiges', color:'#7c3aed'},
];

const WARENGRUPPEN = [
  'Alkoholische Getränke','Backwaren','Fisch','Fleisch & Wurst','Geflügel',
  'Gemüse','Getränke','Hygiene & Körperpflege','Kaffee & Tee',
  'Konserven & Trockenware','Milchprodukte','Obst','Reinigung & Waschen',
  'Süßwaren','Sonstiges'
];

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

/* ---------- Persistenz ---------- */

function loadStore(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){ console.warn('Konnte gespeicherte Daten nicht lesen, starte mit leerem Bestand.', e); }
  return { weeks:{}, protocol:[], ui:{} };
}
function saveStore(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(STORE));
}

let STORE = loadStore();

/* ---------- Kalenderwochen-Hilfsfunktionen (ISO 8601) ---------- */

function mondayOf(date){
  const d = new Date(date);
  const dayNum = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - dayNum);
  d.setHours(0,0,0,0);
  return d;
}

function isoWeekInfo(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nächster Donnerstag
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7*24*3600*1000));
  return { year: d.getUTCFullYear(), week };
}

function weekKeyOf(monday){
  const info = isoWeekInfo(monday);
  return `${info.year}-W${String(info.week).padStart(2,'0')}`;
}

function formatRange(monday){
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  if(monday.getMonth() === sunday.getMonth()){
    return `${monday.getDate()}.–${sunday.getDate()}. ${MONTHS[monday.getMonth()]}`;
  }
  return `${monday.getDate()}. ${MONTHS[monday.getMonth()]} – ${sunday.getDate()}. ${MONTHS[sunday.getMonth()]}`;
}

function uid(){
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

/* ---------- Wochen-Verwaltung ---------- */

/* Legt die Struktur einer Woche an, falls sie noch nicht existiert.
   Enthält KEINE Übernahme-Logik mehr: Artikel werden beim Klick auf ⏭
   sofort in die Folgewoche verschoben (siehe carryToNextWeek). */
function ensureWeek(weekKey){
  if(!STORE.weeks[weekKey]){
    STORE.weeks[weekKey] = {};
    CATS.forEach(c => STORE.weeks[weekKey][c.id] = []);
    saveStore();
  }
  return STORE.weeks[weekKey];
}

/* Montag einer ISO-Kalenderwoche, ausgehend von Jahr und Wochennummer. */
function mondayOfIsoWeek(year, week){
  const monday = mondayOf(new Date(year, 0, 4));
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}

/* Einmalige Bereinigung alter Daten:
   Artikel, die mit der früheren Logik als "carry" markiert wurden, aber nie
   in der Folgewoche angekommen sind, werden jetzt dorthin verschoben.
   Bereits übernommene Artikel (movedOn) werden nur noch aus der alten Woche entfernt. */
function migrateCarryItems(){
  let changed = false;
  Object.keys(STORE.weeks).forEach(weekKey => {
    const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
    if(!m) return;
    const nextMonday = mondayOfIsoWeek(Number(m[1]), Number(m[2]));
    nextMonday.setDate(nextMonday.getDate() + 7);
    const nextKey = weekKeyOf(nextMonday);

    CATS.forEach(c => {
      const list = STORE.weeks[weekKey][c.id] || [];
      for(let i = list.length - 1; i >= 0; i--){
        const it = list[i];
        if(it.status !== 'carry') continue;
        if(!it.movedOn){
          ensureWeek(nextKey)[c.id].push({ id: uid(), g: it.g, n: it.n, status: 'open' });
        }
        list.splice(i, 1);
        changed = true;
      }
    });
  });
  if(changed) saveStore();
}

/* ---------- Anwendungs-Zustand ---------- */

let active = (STORE.ui && STORE.ui.active) || 'supermarkt';
let currentMonday = (STORE.ui && STORE.ui.mondayISO) ? mondayOf(new Date(STORE.ui.mondayISO)) : mondayOf(new Date());
let currentWeekKey = weekKeyOf(currentMonday);
migrateCarryItems();
ensureWeek(currentWeekKey);

function persistUiState(){
  STORE.ui = { active, mondayISO: currentMonday.toISOString() };
  saveStore();
}

/* ---------- Navigation ---------- */

function goPrevWeek(){ currentMonday.setDate(currentMonday.getDate() - 7); afterWeekChange(); }
function goNextWeek(){ currentMonday.setDate(currentMonday.getDate() + 7); afterWeekChange(); }
function goToday(){ currentMonday = mondayOf(new Date()); afterWeekChange(); }

function afterWeekChange(){
  currentWeekKey = weekKeyOf(currentMonday);
  ensureWeek(currentWeekKey);
  persistUiState();
  renderAll();
}

function selectCat(id){
  active = id;
  persistUiState();
  renderList();
}

/* ---------- Artikel-Aktionen ---------- */

function currentItems(){
  return STORE.weeks[currentWeekKey][active];
}

function currentStoreName(){
  return CATS.find(c => c.id === active).name;
}

function logToProtocol(it){
  const now = new Date();
  STORE.protocol.push({
    datum: now.toISOString().slice(0,10),
    kw: currentWeekKey,
    ort: currentStoreName(),
    warengruppe: it.g,
    artikel: it.n,
    status: 'erledigt',
    ts: now.getTime()
  });
}

function removeLastProtocolEntry(it){
  for(let i = STORE.protocol.length - 1; i >= 0; i--){
    const p = STORE.protocol[i];
    if(p.kw === currentWeekKey && p.ort === currentStoreName() && p.warengruppe === it.g && p.artikel === it.n){
      STORE.protocol.splice(i,1);
      break;
    }
  }
}

function toggleDone(itemId){
  const it = currentItems().find(i => i.id === itemId);
  if(!it) return;
  if(it.status === 'done'){
    removeLastProtocolEntry(it);
    it.status = 'open';
  } else {
    it.status = 'done';
    logToProtocol(it);
  }
  saveStore();
  renderList();
}

/* ⏭ – Artikel nicht gefunden/erhalten:
   Der Artikel wird SOFORT in die Folgewoche derselben Einkaufsort-Liste
   verschoben und verschwindet aus der aktuellen Woche. */
function carryToNextWeek(itemId){
  const items = currentItems();
  const idx = items.findIndex(i => i.id === itemId);
  if(idx === -1) return;
  const it = items[idx];

  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(currentMonday.getDate() + 7);
  const nextKey = weekKeyOf(nextMonday);

  ensureWeek(nextKey)[active].push({ id: uid(), g: it.g, n: it.n, status: 'open' });
  items.splice(idx, 1);

  saveStore();
  renderList();

  const info = isoWeekInfo(nextMonday);
  showToast(`„${it.n}“ in KW ${info.week} verschoben.`);
}

function delItem(itemId){
  STORE.weeks[currentWeekKey][active] = currentItems().filter(i => i.id !== itemId);
  saveStore();
  renderList();
}

function addItem(){
  const input = document.getElementById('new-item');
  const grp = document.getElementById('new-group').value;
  const val = input.value.trim();
  if(!val) return;
  currentItems().push({ id: uid(), g: grp, n: val, status: 'open' });
  input.value = '';
  saveStore();
  renderList();
  input.focus();
}

/* ---------- Rendering ---------- */

function populateSelect(){
  const sel = document.getElementById('cat-select');
  sel.innerHTML = CATS.map(c => {
    const items = STORE.weeks[currentWeekKey][c.id] || [];
    const open = items.filter(i => i.status !== 'done').length;
    return `<option value="${c.id}" ${c.id === active ? 'selected' : ''}>${c.name} (${open} offen)</option>`;
  }).join('');
  const cat = CATS.find(c => c.id === active);
  sel.style.borderLeftColor = cat.color;
}

function renderHeader(){
  const info = isoWeekInfo(currentMonday);
  document.getElementById('kw-num').textContent = `KW ${info.week} · ${info.year}`;
  document.getElementById('kw-range').textContent = formatRange(currentMonday);
  const isCurrentWeek = weekKeyOf(mondayOf(new Date())) === currentWeekKey;
  document.getElementById('today-link').style.display = isCurrentWeek ? 'none' : 'block';
}

function renderList(){
  populateSelect();

  const items = currentItems();
  const done = items.filter(i => i.status === 'done').length;
  document.getElementById('progress-pill').textContent = `${done} von ${items.length} erledigt`;

  if(!items.length){
    document.getElementById('list-body').innerHTML = '<div class="empty-hint">Noch keine Artikel in dieser Liste.</div>';
    return;
  }

  const groups = {};
  items.forEach(i => { (groups[i.g] = groups[i.g] || []).push(i); });
  const groupNames = Object.keys(groups).sort((a,b) => a.localeCompare(b,'de'));
  const rank = i => i.status === 'done' ? 1 : 0;

  let html = '';
  groupNames.forEach(g => {
    const list = groups[g].slice().sort((a,b) => {
      if(rank(a) !== rank(b)) return rank(a) - rank(b);
      return a.n.localeCompare(b.n, 'de');
    });
    html += `<div class="group"><div class="group-title">${escapeHtml(g)}</div>`;
    list.forEach(i => {
      const done = i.status === 'done';
      html += `<div class="item ${done ? 'done' : ''}">
        <input type="checkbox" ${done ? 'checked' : ''} onchange="toggleDone('${i.id}')">
        <span class="name">${escapeHtml(i.n)}</span>
        ${!done ? `<button class="carry-btn" title="Nicht gefunden/erhalten – in nächste Woche verschieben" onclick="carryToNextWeek('${i.id}')">⏭</button>` : ''}
        <button class="del" title="Entfernen" onclick="delItem('${i.id}')">✕</button>
      </div>`;
    });
    html += `</div>`;
  });
  document.getElementById('list-body').innerHTML = html;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function renderAll(){
  renderHeader();
  renderList();
}

/* ---------- Excel-Jahresprotokoll-Export ---------- */

function exportExcel(){
  if(typeof XLSX === 'undefined'){
    showToast('Export-Bibliothek konnte nicht geladen werden.');
    return;
  }
  const year = new Date().getFullYear();
  const rows = STORE.protocol
    .filter(p => p.datum.slice(0,4) === String(year))
    .sort((a,b) => a.ts - b.ts)
    .map(p => ({
      Datum: p.datum,
      Kalenderwoche: p.kw,
      Einkaufsort: p.ort,
      Warengruppe: p.warengruppe,
      Artikel: p.artikel,
      Status: p.status
    }));
  if(!rows.length){
    showToast(`Für ${year} liegen noch keine erledigten Einkäufe vor.`);
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:12},{wch:10},{wch:16},{wch:22},{wch:26},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Protokoll ' + year);
  XLSX.writeFile(wb, `Einkaufsprotokoll_${year}.xlsx`);
  showToast(`Export gestartet: Einkaufsprotokoll_${year}.xlsx`);
}

let toastTimer = null;
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- Init ---------- */

document.getElementById('new-group').innerHTML = WARENGRUPPEN.map(g => `<option>${escapeHtml(g)}</option>`).join('');
document.getElementById('new-item').addEventListener('keydown', e => { if(e.key === 'Enter') addItem(); });

renderAll();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.warn('Service Worker konnte nicht registriert werden:', err);
    });
  });
}
