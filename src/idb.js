// Helper melhorado para IndexedDB: salvar blobs de áudio para reprodução offline
const DB_NAME = 'mystream-db';
const STORE_NAME = 'audio';
const DB_VERSION = 2; // bump quando o schema mudar

// configurações
const MAX_ENTRIES = 150; // limite de itens em cache (LRU)
const OP_TIMEOUT = 15000; // ms

function withTimeout(promise, ms = OP_TIMEOUT){
  let id;
  const timeout = new Promise((_, rej)=> id = setTimeout(()=> rej(new Error('IDB operation timeout')), ms));
  return Promise.race([promise.then(r=>{ clearTimeout(id); return r }), timeout]);
}

function openDB(){
  if(typeof indexedDB === 'undefined') return Promise.reject(new Error('indexedDB not available in this environment'));
  return withTimeout(new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev)=>{
      const db = ev.target.result;
      if(!db.objectStoreNames.contains(STORE_NAME)){
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_date', 'created', { unique: false });
        store.createIndex('by_last', 'lastAccess', { unique: false });
      } else {
        const store = req.transaction.objectStore(STORE_NAME);
        try{ store.createIndex('by_last', 'lastAccess', { unique:false }); }catch(e){}
      }
    }
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error || new Error('Erro ao abrir IDB'));
  }))
}

async function trimOldEntries(){
  try{
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('by_last');
    // conta
    const countReq = store.count();
    const total = await new Promise((res, rej)=>{ countReq.onsuccess = ()=> res(countReq.result); countReq.onerror = ()=> rej(countReq.error); });
    if(total <= MAX_ENTRIES){ db.close(); return; }
    const toDelete = total - MAX_ENTRIES;
    const cur = idx.openCursor();
    let removed = 0;
    await new Promise((resolve, reject)=>{
      cur.onsuccess = (e)=>{
        const c = e.target.result;
        if(c && removed < toDelete){ store.delete(c.primaryKey); removed++; c.continue(); }
        else { resolve(); }
      }
      cur.onerror = ()=> reject(cur.error);
    })
    db.close();
  }catch(e){ /* não bloqueia a operação principal */ console.warn('trimOldEntries falhou', e); }
}

export async function saveBlob(id, blob, meta={}){
  // tenta salvar no IndexedDB; em falha, tenta CacheStorage como fallback
  try{
    const db = await openDB();
    return await withTimeout(new Promise((resolve, reject)=>{
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry = { id, blob, created: Date.now(), lastAccess: Date.now(), meta };
      const r = store.put(entry);
      r.onsuccess = async ()=> { resolve(entry); db.close(); await trimOldEntries(); };
      r.onerror = ()=> { reject(r.error); db.close(); };
    }));
  }catch(err){
    console.warn('IndexedDB save failed, tentando CacheStorage fallback', err);
    try{
      if('caches' in window){
        const cache = await caches.open('mystream-idb-fallback');
        const resp = new Response(blob, { headers: { 'Content-Type': (meta && meta.contentType) ? meta.contentType : 'audio/mpeg' } });
        await cache.put(`/idb-cache/${id}`, resp);
        return { id, blob: null, created: Date.now(), meta, fallback: true };
      }
    }catch(e){ console.warn('CacheStorage fallback failed', e); }
    throw err;
  }
}

export async function getBlob(id){
  try{
    const db = await openDB();
    return await withTimeout(new Promise((resolve, reject)=>{
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const r = store.get(id);
      r.onsuccess = ()=>{
        const val = r.result;
        if(!val){ db.close(); resolve(null); return; }
        // atualiza lastAccess para LRU
        try{
          val.lastAccess = Date.now();
          store.put(val);
        }catch(e){ /* ignore */ }
        db.close();
        resolve(val.blob || null);
      };
      r.onerror = ()=> { db.close(); reject(r.error); };
    }));
  }catch(err){
    console.warn('getBlob indexedDB falhou, tentando CacheStorage', err);
    try{
      if('caches' in window){
        const cache = await caches.open('mystream-idb-fallback');
        const res = await cache.match(`/idb-cache/${id}`);
        if(res) return await res.blob();
      }
    }catch(e){ console.warn('CacheStorage read falhou', e); }
    return null;
  }
}

export async function getObjectURL(id){
  const blob = await getBlob(id);
  if(!blob) return null;
  return URL.createObjectURL(blob);
}

export async function listAll(){
  // primeira tentativa: IndexedDB
  let idbItems = [];
  try{
    const db = await openDB();
    idbItems = await withTimeout(new Promise((resolve, reject)=>{
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const items = [];
      const cur = store.openCursor();
      cur.onsuccess = (e)=>{
        const c = e.target.result;
        if(c){
          const v = c.value;
          items.push({ id: v.id, created: v.created, meta: v.meta, size: v.blob ? v.blob.size : 0 });
          c.continue();
        } else { db.close(); resolve(items); }
      }
      cur.onerror = ()=> { db.close(); reject(cur.error); }
    }));
  }catch(e){
    console.warn('listAll: leitura do IDB falhou', e);
    idbItems = [];
  }

  // se encontrou itens em IDB, retorna-os
  if(idbItems && idbItems.length>0) return idbItems;

  // fallback: verificar CacheStorage também (pode ter sido salvo ali)
  try{
    if(typeof caches !== 'undefined'){
      const cache = await caches.open('mystream-idb-fallback');
      const keys = await cache.keys();
      const items = keys.filter(k=> k.url && k.url.includes('/idb-cache/')).map(k=> {
        const parts = k.url.split('/idb-cache/');
        const id = parts.length>1 ? parts.pop() : k.url;
        return { id, created: 0, meta: {}, size: 0 };
      });
      if(items.length>0) return items;
    }
  }catch(err){ console.warn('listAll: fallback CacheStorage falhou', err); }

  // nada encontrado
  return [];
}

// utilitário de diagnóstico simples
export async function cacheInfo(){
  const info = { indexedDBAvailable: true, idbError: null, idbCount: 0, cacheFallbackCount: 0 };
  if(typeof indexedDB === 'undefined'){ info.indexedDBAvailable = false; return info; }
  try{
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const countReq = store.count();
    info.idbCount = await new Promise((res, rej)=>{ countReq.onsuccess = ()=> res(countReq.result); countReq.onerror = ()=> rej(countReq.error); });
    db.close();
  }catch(e){ info.idbError = String(e); }
  try{
    if(typeof caches !== 'undefined'){
      const cache = await caches.open('mystream-idb-fallback');
      const keys = await cache.keys();
      info.cacheFallbackCount = keys.filter(k=> k.url && k.url.includes('/idb-cache/')).length;
    }
  }catch(e){ /* ignore */ }
  return info;
}

export async function remove(id){
  try{
    const db = await openDB();
    return await withTimeout(new Promise((resolve, reject)=>{
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const r = store.delete(id);
      r.onsuccess = ()=> { resolve(true); db.close(); };
      r.onerror = ()=> { reject(r.error); db.close(); };
    }));
  }catch(err){
    console.warn('remove IDB falhou, tentando CacheStorage', err);
    try{ if('caches' in window){ const cache = await caches.open('mystream-idb-fallback'); await cache.delete(`/idb-cache/${id}`); return true; } }catch(e){ console.warn('remove fallback falhou', e); }
    return false;
  }
}

export async function saveFromFetch(id, url, meta={}){
  // evita re-download se já existir
  try{
    const existing = await getBlob(id);
    if(existing){
      // já existe no IDB (ou no fallback), nada a fazer
      return existing;
    }
  }catch(e){ /* ignore and continue to fetch */ }

  // busca o recurso e salva como blob (usando a função saveBlob que já tem fallback)
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('Falha ao baixar para cache');
  const blob = await resp.blob();
  const contentType = resp.headers.get('Content-Type') || undefined;
  return saveBlob(id, blob, { ...meta, contentType });
}

export default { saveBlob, getBlob, getObjectURL, listAll, remove, saveFromFetch };

// Migra entradas do CacheStorage fallback para IndexedDB
export async function migrateFromFallback({ keepInCache = false } = {}){
  if(typeof caches === 'undefined') throw new Error('CacheStorage não disponível');
  const cache = await caches.open('mystream-idb-fallback');
  const keys = await cache.keys();
  const entries = keys.filter(k=> k.url && k.url.includes('/idb-cache/'));
  const results = { migrated: 0, errors: [] };
  for(const k of entries){
    try{
      const parts = k.url.split('/idb-cache/');
      const id = parts.length>1 ? parts.pop() : k.url;
      const res = await cache.match(k);
      if(!res) continue;
      const blob = await res.blob();
      await saveBlob(id, blob, { migratedFromFallback: true });
      results.migrated++;
      if(!keepInCache){ await cache.delete(k); }
    }catch(e){ results.errors.push(String(e)); }
  }
  return results;
}
