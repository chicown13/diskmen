import { useEffect, useState, useRef } from 'react';

// Utilitário para obter a URL base da API
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
import './App.css';
import idb, { getObjectURL, saveFromFetch, remove as idbRemove } from './idb';

function App(){
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [offlineFiles, setOfflineFiles] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [cachedURLs, setCachedURLs] = useState({}); // id -> objectURL

  // Player state
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const [visualizerData, setVisualizerData] = useState(new Uint8Array(128));
  const [averageVolume, setAverageVolume] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(null); // {id,title,thumbnail,url}
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1); // index in queue of current track
  const [playlists, setPlaylists] = useState([]); // { name, items }
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [position, setPosition] = useState(0); // seconds
  const [duration, setDuration] = useState(0);
  const [page, setPage] = useState('home'); // home | player | library | queue
  const [sidebarVisible, setSidebarVisible] = useState(true); // Control sidebar visibility
  const [recentSearches, setRecentSearches] = useState([]); // Store last 5 searches
  const [savingItems, setSavingItems] = useState(new Set()); // Track items being saved

  useEffect(()=>{ fetchOffline();
    // restaurar queue, current e queueIndex do localStorage
    try{
      const rawQ = localStorage.getItem('mystream_queue');
      const rawC = localStorage.getItem('mystream_current');
      const rawQi = localStorage.getItem('mystream_queueIndex');
  if(rawQ){ setQueue(JSON.parse(rawQ)); }
  if(rawC){ setCurrent(JSON.parse(rawC)); }
  if(rawQi){ setQueueIndex(parseInt(rawQi,10)); }
  const rawPl = localStorage.getItem('mystream_playlists');
  if(rawPl){ try{ setPlaylists(JSON.parse(rawPl)); }catch(e){} }
  const rawRecent = localStorage.getItem('mystream_recent_searches');
  if(rawRecent){ try{ setRecentSearches(JSON.parse(rawRecent)); }catch(e){} }
    }catch(e){ console.warn('Erro ao restaurar dados', e) }
  },[])

  // cached list state
  const [cachedList, setCachedList] = useState([]);

  // offline search state
  const [offlineSearch, setOfflineSearch] = useState('');

  // filtered cached list based on search
  const filteredCachedList = cachedList.filter(item => {
    if (!offlineSearch.trim()) return true;
    const searchTerm = offlineSearch.toLowerCase();
    const title = item.meta?.title?.toLowerCase() || '';
    const id = item.id.toLowerCase();
    return title.includes(searchTerm) || id.includes(searchTerm);
  });

  // prefetch state: avoid duplicate prefetches
  const prefetchingRef = useRef(new Set()); // holds ids being prefetched

  const isCached = (id)=> cachedList.some(i=> i.id === id);

  const refreshCachedList = async ()=>{
    try{
      const items = await idb.listAll();
      setCachedList(items || []);
    }catch(e){ console.warn('Erro ao listar cache', e); setCachedList([]); }
  }

  // Prefetch the next `count` tracks from the queue (default 3)
  const prefetchNext = async (count = 3) => {
    console.log('🔄 prefetchNext chamado com count:', count, 'queueIndex:', queueIndex, 'queue.length:', queue?.length);
    try{
      if(!queue || queue.length===0) {
        console.log('❌ prefetchNext: queue vazia ou inexistente');
        return;
      }
      const start = (queueIndex >= 0) ? queueIndex + 1 : 0;
      console.log('📋 prefetchNext: processando de', start, 'até', Math.min(queue.length, start + count));

      for(let i = start; i < Math.min(queue.length, start + count); i++){
        const it = queue[i];
        if(!it) {
          console.log('⚠️ prefetchNext: item', i, 'é null/undefined');
          continue;
        }
        console.log('🎵 prefetchNext: verificando item', i, '-', it.title, '(ID:', it.id + ')');

        // already cached? (checa diretamente no IDB para evitar estado desatualizado)
        try{
          const existing = await idb.getBlob(it.id);
          if(existing) {
            console.log('✅ prefetchNext: item já em cache', it.id);
            continue;
          }
        }catch(e){ /* ignore and continue */ }

        // already being prefetched?
        if(prefetchingRef.current.has(it.id)) {
          console.log('⏳ prefetchNext: item já sendo prefetched', it.id);
          continue;
        }

        // need a source URL to fetch
        if(!it.url) {
          console.log('❌ prefetchNext: item sem URL', it.id);
          continue;
        }

        prefetchingRef.current.add(it.id);
        console.info('🚀 Prefetch: INICIANDO', it.id, it.title);
  const streamUrl = `${API_BASE}/  con  const API_BASE = 'https://diskmen.onrender.com';tream/${it.id}?url=${encodeURIComponent(it.url)}`;

        // start save in background; don't await to avoid blocking
        saveFromFetch(it.id, streamUrl, { 
          title: it.title,
          thumbnail: it.thumbnail || buildYouTubeThumb(it)
        }).then(async ()=>{
          try{ const obj = await getObjectURL(it.id); if(obj){ setCachedURLs(prev=>({ ...prev, [it.id]: obj })); } }catch(e){}
          try{ await refreshCachedList(); }catch(e){}
          console.info('✅ Prefetch: CONCLUÍDO', it.id);
        }).catch((err)=>{
          console.warn('❌ Prefetch: FALHOU', it.id, err);
        }).finally(()=>{
          prefetchingRef.current.delete(it.id);
          console.log('🧹 prefetchNext: removido da lista de prefetching', it.id);
        });
      }
    }catch(e){ console.warn('❌ Erro em prefetchNext', e); }
  }

  const fetchOffline = async ()=>{
  try{ const res = await fetch(`${API_BASE}/offline`); const data = await res.json(); if(data.files) setOfflineFiles(data.files); }catch(e){ console.warn(e) }
  }

  // load cached list on mount
  useEffect(()=>{ refreshCachedList(); },[]);

  // set audio volume on mount
  useEffect(() => {
    // Pequeno delay para garantir que o audio element esteja pronto
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.volume = 1.0;
        console.log('Volume definido:', audioRef.current.volume);
      }
    }, 100);
  }, []);

  // helper: tentar construir thumbnail do YouTube a partir de id ou url
  const buildYouTubeThumb = (item)=>{
    console.log('buildYouTubeThumb chamado com:', item);
    if(!item) return null;
    let videoId = null;
    // se já tiver id com tamanho típico
    if(item.id && /^[A-Za-z0-9_-]{6,}$/.test(item.id)) {
      videoId = item.id;
      console.log('Usando ID direto:', videoId);
    } else if(item.url){
      // tentar extrair do url
      const m = item.url.match(/(?:v=|v\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
      if(m) videoId = m[1];
      console.log('Extraindo ID da URL:', videoId);
    }

    if(videoId) {
      // Retornar a melhor qualidade disponível (maxresdefault)
      const thumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      console.log('Thumbnail URL gerada:', thumbUrl);
      return thumbUrl;
    }
    console.log('Não foi possível gerar thumbnail');
    return null;
  }

  const onImgError = (e, item)=>{
    try{
      const el = e.target;
      if(!el) return;
      
      // Tentar diferentes qualidades de thumbnail
      if(!el.dataset.qualityTried) {
        el.dataset.qualityTried = '0';
      }
      
      const qualityIndex = parseInt(el.dataset.qualityTried) || 0;
      const qualities = ['maxresdefault', 'hqdefault', 'mqdefault', 'default'];
      
      if(qualityIndex < qualities.length - 1) {
        // Tentar próxima qualidade
        let videoId = null;
        if(item.id && /^[A-Za-z0-9_-]{6,}$/.test(item.id)) {
          videoId = item.id;
        } else if(item.url){
          const m = item.url.match(/(?:v=|v\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
          if(m) videoId = m[1];
        }
        
        if(videoId) {
          const nextQuality = qualities[qualityIndex + 1];
          el.dataset.qualityTried = (qualityIndex + 1).toString();
          el.src = `https://i.ytimg.com/vi/${videoId}/${nextQuality}.jpg`;
          return;
        }
      }
      
      // Se todas as qualidades falharam, usar fallback
      el.src = '/vite.svg';
    }catch(e){ 
      // Em caso de erro, usar fallback
      e.target.src = '/vite.svg';
    }
  }

  const handleSearch = async (e)=>{
    e && e.preventDefault();
    if(!query || !query.trim()) return;
    setLoading(true); setStatus('Buscando...');
    try{
      const res = await fetch(`${API_BASE}/search`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query}) });
      const data = await res.json();
      if(data.results){
        // Processar thumbnails para garantir que sejam válidos
        const processedResults = data.results.map(result => ({
          ...result,
          thumbnail: result.thumbnail || buildYouTubeThumb(result)
        }));

        setResults(processedResults);
        setStatus('');
        checkCacheForResults(processedResults);

        // Add to recent searches
        const trimmedQuery = query.trim();
        const updatedSearches = [trimmedQuery, ...recentSearches.filter(s => s !== trimmedQuery)].slice(0, 5);
        setRecentSearches(updatedSearches);
        try{ localStorage.setItem('mystream_recent_searches', JSON.stringify(updatedSearches)); }catch(e){}
      }
      else setStatus(data.error || 'Nenhum resultado')
    }catch(err){ setStatus('Erro ao buscar') }
    setLoading(false)
  }

  const checkCacheForResults = async (items)=>{
    try{
      const pairs = await Promise.all(items.map(async (it)=>{
        try{
          const url = await getObjectURL(it.id);
          return [it.id, url];
        }catch(e){ return [it.id, null]; }
      }));
      const map = {};
      pairs.forEach(([id,url])=>{ if(url) map[id]=url });
      setCachedURLs(prev => ({...prev, ...map}));
    }catch(e){ /* ignore */ }
  }

  // debounce helper
  useEffect(()=>{
    const id = setTimeout(()=>{
      if(query && query.trim().length>0){ handleSearch(); }
    }, 400);
    return ()=> clearTimeout(id);
    // intentionally not including handleSearch in deps to avoid re-creating
  },[query]);

  const enqueueAndPlay = (item)=>{
    // item: {id,title,thumbnail,url}
    // Garantir que o thumbnail seja válido
    const processedItem = {
      ...item,
      thumbnail: item.thumbnail || buildYouTubeThumb(item)
    };

    setQueue(q=>{ const next = [...q, processedItem]; try{ localStorage.setItem('mystream_queue', JSON.stringify(next)) }catch(e){}; return next });
        if(!current){
          const idx = queue.length; // new item will be at previous queue.length
          setQueueIndex(idx); try{ localStorage.setItem('mystream_queueIndex', String(idx)); }catch(e){}
          playCachedOrStream(processedItem, idx);
        }
  }

  // Playlists management
  const persistPlaylists = (pls)=>{ try{ localStorage.setItem('mystream_playlists', JSON.stringify(pls)) }catch(e){} }
  const createPlaylist = (name)=>{
    if(!name || !name.trim()) return;
    const p = { name: name.trim(), items: [] };
    setPlaylists(prev=>{ const next=[...prev, p]; persistPlaylists(next); return next });
    setNewPlaylistName('');
  }
  const deletePlaylist = (idx)=>{
    setPlaylists(prev=>{ const copy=[...prev]; copy.splice(idx,1); persistPlaylists(copy); return copy });
  }
  const addToPlaylist = (idx, item)=>{
    setPlaylists(prev=>{ const copy=[...prev]; copy[idx].items.push(item); persistPlaylists(copy); return copy });
  }
  const loadPlaylist = (idx, append=false)=>{
    const pl = playlists[idx]; if(!pl) return;
    if(append){ const newQ = [...queue, ...pl.items]; setQueue(newQ); try{ localStorage.setItem('mystream_queue', JSON.stringify(newQ)) }catch(e){}; }
    else { setQueue(pl.items); try{ localStorage.setItem('mystream_queue', JSON.stringify(pl.items)) }catch(e){}; setQueueIndex(-1); try{ localStorage.setItem('mystream_queueIndex','-1') }catch(e){} }
  }

  const removeFromQueue = (idx)=>{
    setQueue(q=>{
      const copy=[...q];
      const removed=copy.splice(idx,1);
      // adjust queueIndex
      setQueueIndex(curr=>{
        if(curr === -1) return -1;
        if(idx < curr) return curr - 1;
        if(idx === curr){
          // removed currently playing
      if(curr < copy.length){
        // play the item that moved into this index
        playCachedOrStream(copy[curr], curr);
            try{ localStorage.setItem('mystream_queueIndex', String(curr)); }catch(e){}
            return curr;
          } else {
            // no more items
            if(audioRef.current) audioRef.current.pause(); setPlaying(false); setCurrent(null);
            try{ localStorage.setItem('mystream_queueIndex', String(-1)); }catch(e){}
            return -1;
          }
        }
        return curr;
      });
      try{ localStorage.setItem('mystream_queue', JSON.stringify(copy)) }catch(e){};
      return copy;
    });
  }

  const playItem = (item, replace=false) =>{
    // delegate to playCachedOrStream to avoid duplication
    playCachedOrStream(item);
  }

  const playCachedOrStream = async (item, idx=null)=>{
    // item: {id,title,thumbnail,url}
    setCurrent(item);
    try{ localStorage.setItem('mystream_current', JSON.stringify(item)) }catch(e){}
    if(typeof idx === 'number'){ setQueueIndex(idx); try{ localStorage.setItem('mystream_queueIndex', String(idx)) }catch(e){} }
    // Try priority cache sources in this order:
    // 1) cachedURLs map (fast, objectURL already created)
    // 2) IndexedDB blob -> createObjectURL
    try{
      // 1) cachedURLs
      if(cachedURLs && cachedURLs[item.id]){
        const url = cachedURLs[item.id];
        console.info('Play from cache (cachedURLs):', item.id);
        if(audioRef.current){ 
          audioRef.current.src = url; 
          audioRef.current.volume = 1.0;
          await audioRef.current.play(); 
          setPlaying(true); 
        }
        return;
      }
      // 2) idb blob
      try{
        const blob = await idb.getBlob(item.id);
        if(blob){
          const obj = URL.createObjectURL(blob);
          setCachedURLs(prev=>({ ...prev, [item.id]: obj }));
          console.info('Play from cache (IDB):', item.id);
          if(audioRef.current){ 
            audioRef.current.src = obj; 
            audioRef.current.volume = 1.0;
            await audioRef.current.play(); 
            setPlaying(true); 
          }
          return;
        }
      }catch(e){ /* ignore idb failures */ }
    }catch(e){ console.warn('Erro ao tentar tocar do cache', e); }

    // not cached: stream and save in background
    if(!item.url){
      console.warn('Sem URL de stream para item e também não estava em cache:', item.id);
      setStatus('Não foi possível reproduzir: URL ausente e não está em cache');
      return;
    }

  const streamUrl = `${API_BASE}/stream/${item.id}?url=${encodeURIComponent(item.url)}`;
    console.info('Play from stream:', item.id, streamUrl);
    if(audioRef.current){ 
      audioRef.current.src = streamUrl; 
      audioRef.current.volume = 1.0; // Define volume antes de tocar
      audioRef.current.play().then(()=>{ 
        setPlaying(true);
        // Garante volume novamente após começar a tocar
        if(audioRef.current) audioRef.current.volume = 1.0;
      }).catch(()=>setPlaying(false)); 
    }
    // salvar em background (não bloquear o player)
    saveFromFetch(item.id, streamUrl, { 
      title: item.title,
      thumbnail: item.thumbnail || buildYouTubeThumb(item)
    }).then(async ()=>{
      try{ const obj = await getObjectURL(item.id); if(obj){ setCachedURLs(prev=>({ ...prev, [item.id]: obj })); }
      }catch(e){}
      // Atualiza lista de cache visível
      try{ refreshCachedList(); }catch(e){}
      setStatus('Salvo no cache');
    }).catch(()=>{/* ignore save errors */});

    // start prefetching the next items (do not await)
    try{ prefetchNext(3); }catch(e){ /* ignore */ }
  }

  const handlePlayPause = ()=>{
    if(!audioRef.current) return;
    if(playing){ audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }

  const prevTrack = ()=>{
    if(queue.length===0) return;
    setQueueIndex(curr=>{
      // Sempre determinar o índice atual baseado no item tocando
      const currentIndex = queue.findIndex(it=>it.id===current?.id);
      console.log('prevTrack: currentIndex encontrado =', currentIndex, 'current.id =', current?.id);

      let prevIndex;
      if(currentIndex >= 0) {
        prevIndex = (currentIndex > 0) ? currentIndex - 1 : queue.length - 1;
      } else {
        // Se não encontrou, assume que está no início e vai para o final
        prevIndex = queue.length - 1;
      }

      console.log('prevTrack: prevIndex =', prevIndex, 'queue.length =', queue.length);

      if(prevIndex >= 0 && prevIndex < queue.length){
        const prev = queue[prevIndex];
        console.info('prevTrack: tocando', prev?.title, 'índice', prevIndex);
        try{ localStorage.setItem('mystream_queueIndex', String(prevIndex)); }catch(e){}
        playCachedOrStream(prev, prevIndex);
        return prevIndex;
      }
      return curr; // fallback: mantém o índice atual
    })
  }

  const nextTrack = ()=>{
    if(queue.length===0) return;
    setQueueIndex(curr=>{
      // Sempre determinar o índice atual baseado no item tocando
      const currentIndex = queue.findIndex(it=>it.id===current?.id);
      console.log('nextTrack: currentIndex encontrado =', currentIndex, 'current.id =', current?.id);

      let nextIndex;
      if(currentIndex >= 0) {
        nextIndex = (currentIndex + 1) % queue.length;
      } else {
        // Se não encontrou, assume que deve começar do início
        nextIndex = 0;
      }

      console.log('nextTrack: nextIndex =', nextIndex, 'queue.length =', queue.length);

      if(nextIndex >= 0 && nextIndex < queue.length){
        const next = queue[nextIndex];
        console.info('nextTrack: tocando', next?.title, 'índice', nextIndex);
        try{ localStorage.setItem('mystream_queueIndex', String(nextIndex)); }catch(e){}
        playCachedOrStream(next, nextIndex);
        return nextIndex;
      }
      return curr; // fallback: mantém o índice atual
    });
  }

  const saveOffline = async (videoUrl, itemId)=>{
    if(itemId) setSavingItems(prev => new Set([...prev, itemId]));
    setStatus('Salvando offline...'); setLoading(true);
    try{
      const res = await fetch(`${API_BASE}/baixar`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({link:videoUrl}) });
      if(!res.ok){ const e = await res.json(); setStatus(e.error||'Erro'); setLoading(false); if(itemId) setSavingItems(prev => { const next = new Set(prev); next.delete(itemId); return next; }); return }
      const { task_id } = await res.json();
      // polling
  let it=0; while(it<300){ it++; await new Promise(r=>setTimeout(r,1000)); const p = await (await fetch(`${API_BASE}/progress/${task_id}`)).json(); if(p.filename){ setStatus('Salvo: '+p.filename); fetchOffline(); break } if(p.progress===-1) { setStatus('Erro no processamento'); break } }
    }catch(e){ setStatus('Erro') }
    setLoading(false);
    if(itemId) setSavingItems(prev => { const next = new Set(prev); next.delete(itemId); return next; });
  }

  // audio events
  useEffect(()=>{
    const a = audioRef.current; if(!a) return;
    const onTime = ()=> setPosition(Math.floor(a.currentTime||0));
    const onDur = ()=> setDuration(Math.floor(a.duration||0));
    const onEnd = ()=> nextTrack();
    a.addEventListener('timeupdate', onTime); a.addEventListener('durationchange', onDur); a.addEventListener('ended', onEnd);
    return ()=>{ a.removeEventListener('timeupdate', onTime); a.removeEventListener('durationchange', onDur); a.removeEventListener('ended', onEnd); }
  },[audioRef, queue])

  // whenever the queue or queueIndex changes, try to prefetch next items
  useEffect(()=>{
    try{ prefetchNext(3); }catch(e){}
  }, [queue, queueIndex]);

  const seekTo = (pct)=>{
    if(!audioRef.current || !duration) return; audioRef.current.currentTime = Math.floor(duration * pct / 100);
  }

  // Audio Visualizer functions
  const initAudioVisualizer = async ()=>{
    try{
      if(!audioRef.current) return;

      // TEMPORARIAMENTE DESABILITADO: Web Audio API causando problemas de áudio
      /*
      // If AudioContext doesn't exist, create it
      if(!audioContextRef.current){
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;

        const source = audioContextRef.current.createMediaElementSource(audioRef.current);
        // Conecta source diretamente ao destination para garantir áudio
        source.connect(audioContextRef.current.destination);
        // Conecta analyser em paralelo para visualizer
        source.connect(analyserRef.current);
        // analyser NÃO conecta ao destination para não interferir
      }

      // Always try to resume if suspended
      if(audioContextRef.current.state === 'suspended'){
        await audioContextRef.current.resume();
      }

      // Additional check: if analyser is not connected, try to reconnect
      if(audioContextRef.current && analyserRef.current && !analyserRef.current.context){
        try{
          const source = audioContextRef.current.createMediaElementSource(audioRef.current);
          // Conecta source diretamente ao destination para garantir áudio
          source.connect(audioContextRef.current.destination);
          // Conecta analyser em paralelo para visualizer
          source.connect(analyserRef.current);
        }catch(e){
          console.warn('Erro ao reconectar analyser:', e);
        }
      }
      */

    }catch(e){
      console.warn('Erro ao inicializar visualizer:', e);
    }
  }

  const drawVisualizer = ()=>{
    if(!analyserRef.current || !canvasRef.current || !audioContextRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;
    
    // Calculate average volume for responsive effects
    let sum = 0;
    for(let i = 0; i < bufferLength; i++){
      sum += dataArray[i];
    }
    const avg = sum / bufferLength;
    setAverageVolume(avg / 255); // Normalize to 0-1
    
    for(let i = 0; i < bufferLength; i++){
      barHeight = (dataArray[i] / 255) * canvas.height;
      const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
      gradient.addColorStop(0, '#1db954');
      gradient.addColorStop(1, '#1ed760');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
    
    setVisualizerData(dataArray);
    animationRef.current = requestAnimationFrame(drawVisualizer);
  }

  const startVisualizer = ()=>{
    // TEMPORARIAMENTE DESABILITADO: Web Audio API causando problemas de áudio
    return;
    /*
    if(!animationRef.current && analyserRef.current && audioContextRef.current){
      drawVisualizer();
    }
    */
  }

  const stopVisualizer = ()=>{
    if(animationRef.current){
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }

  // Initialize visualizer when audio loads
  useEffect(()=>{
    const audio = audioRef.current;
    if(audio){
      const handleLoadStart = async ()=>{
        await initAudioVisualizer();
      };
      const handlePlay = async ()=>{
        await initAudioVisualizer(); // Ensure visualizer is ready
        startVisualizer();
      };
      const handlePause = ()=> stopVisualizer();
      audio.addEventListener('loadstart', handleLoadStart);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handlePause);
      return ()=>{
        audio.removeEventListener('loadstart', handleLoadStart);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handlePause);
      }
    }
  },[])

  // Reinitialize visualizer when returning to player page
  useEffect(()=>{
    if(page === 'player' && audioRef.current){
      // Small delay to ensure DOM is ready
      setTimeout(async ()=>{
        try{
          await initAudioVisualizer();
          // Check if audio is actually playing using audio element properties
          const audio = audioRef.current;
          if(audio && !audio.paused && audio.currentTime > 0 && !audio.ended){
            startVisualizer();
          }
        }catch(e){
          console.warn('Erro ao reinicializar visualizer na volta para player:', e);
        }
      }, 100);
    } else if(page !== 'player'){
      // Stop visualizer when leaving player page
      stopVisualizer();
    }
  }, [page]); // Only depend on page changes

  return (
    <div className="app-shell" style={{'--average-volume': averageVolume}}>
      {sidebarVisible && (
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-icon">🎵</span>
            Diskmen
          </div>
          <nav className="sidebar-nav">
            <button className={`nav-btn ${page==='home'?'active':''}`} onClick={()=>setPage('home')}>
              <span className="nav-icon">🏠</span>
              Início
            </button>
            <button className={`nav-btn ${page==='discover'?'active':''}`} onClick={()=>setPage('discover')}>
              <span className="nav-icon">✨</span>
              Descobrir
            </button>
            <button className={`nav-btn ${page==='library'?'active':''}`} onClick={()=>setPage('library')}>
              <span className="nav-icon">📚</span>
              Sua Biblioteca
            </button>
          </nav>
          
          {/* <div className="sidebar-footer">
            <button className={`nav-btn ${page==='cached'?'active':''}`} onClick={()=>{ setPage('cached'); refreshCachedList(); }}>
              <span className="nav-icon">💾</span>
              Downloads
            </button>
          </div> */}
        </aside>
      )}

      <div className="main-area">
        <header className="topbar">
          <button className="hamburger-btn" onClick={() => setSidebarVisible(!sidebarVisible)}>
            <span className="hamburger-icon">☰</span>
          </button>
          <div className="search-inline">
            <input placeholder="Pesquisar no YouTube" value={query} onChange={e=>setQuery(e.target.value)} />
          </div>
        </header>

        <div className={`page-content ${page === 'player' ? 'player-page' : ''}`}>
          {page==='home' && (
            <section className="panel home-panel">
              <div className="home-header">
                <h1>Boas-vindas ao Diskmen</h1>
                <p>Descubra e ouça suas músicas favoritas do YouTube</p>
              </div>
              <div className="home-recent">
                <h2>Buscas Recentes</h2>
                <div className="recent-searches">
                  {recentSearches.length > 0 ? recentSearches.map(term => (
                    <div key={term} style={{display:'flex',alignItems:'center',gap:4}}>
                      <button className="recent-search-btn" onClick={()=>{setQuery(term); handleSearch();}}>
                        {term}
                      </button>
                      <button
                        style={{background:'none',border:'none',color:'#b3b3b3',cursor:'pointer',fontSize:18,padding:0,marginLeft:2}}
                        title="Remover busca"
                        onClick={() => {
                          const updated = recentSearches.filter(t => t !== term);
                          setRecentSearches(updated);
                          try { localStorage.setItem('mystream_recent_searches', JSON.stringify(updated)); } catch(e){}
                        }}
                        aria-label={`Remover busca por ${term}`}
                      >✕</button>
                    </div>
                  )) : (
                    <p className="no-recent-searches">Nenhuma busca recente</p>
                  )}
                </div>
              </div>
              {results.length > 0 && (
                <div className="home-results">
                  <h2>Resultados da Busca</h2>
                  <div className="results-grid">
                    {results.slice(0, 8).map(r=> (
                      <div key={r.id} className="result-card">
                        <img src={r.thumbnail || '/vite.svg'} onError={(e)=>onImgError(e, r)} />
                        {isCached(r.id) && (<div className="cached-badge" title="Salvo no cache">💾</div>)}
                        <div className="meta">
                          <div className="title">{r.title}</div>
                          <div className="subtitle">{r.duration? `${Math.floor(r.duration/60)}:${String(r.duration%60).padStart(2,'0')}` : ''}</div>
                        </div>
                        <div className="card-actions">
                          <button 
                            className="btn btn-play" 
                            onClick={()=>{
                              const processedItem = {
                                ...r,
                                thumbnail: r.thumbnail || buildYouTubeThumb(r)
                              };
                              const newQ = [processedItem, ...queue]; setQueue(newQ); try{ localStorage.setItem('mystream_queue', JSON.stringify(newQ)) }catch(e){}
                              setQueueIndex(0); try{ localStorage.setItem('mystream_queueIndex', '0') }catch(e){}
                              playCachedOrStream(processedItem,0);
                            }}
                            title="Tocar agora"
                          >
                            <span className="btn-icon">▶️</span>
                          </button>
                          <button 
                            className="btn btn-add" 
                            onClick={()=>{ enqueueAndPlay(r); }}
                            title="Adicionar à fila"
                          >
                            <span className="btn-icon">➕</span>
                          </button>
                          <button 
                            className={`btn btn-save ${savingItems.has(r.id) ? 'loading' : ''}`} 
                            onClick={()=>saveOffline(r.url, r.id)}
                            disabled={savingItems.has(r.id)}
                            title="Salvar offline"
                          >
                            <span className="btn-icon">{savingItems.has(r.id) ? '⏳' : '💾'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {page==='discover' && (
            <section className="panel discover-panel">
              <div className="discover-header">
                <h1>Descobrir</h1>
                <p>Explore novas músicas, playlists e artistas do YouTube Music</p>
              </div>
              <div className="discover-featured">
                <h2>Em Destaque do YouTube Music</h2>
                <div className="featured-grid">
                  {/* Sugestões reais do YouTube Music */}
                  {[ 
                    { title: 'Hits do Sertanejo', description: 'Marília Mendonça, Maiara & Maraisa, Jorge & Mateus', icon: '🎸', query: 'Hits do Sertanejo' },
                    { title: 'Hits Pagode', description: 'Grupo Menos É Mais, Ferrugem, Ludmilla', icon: '🥁', query: 'Hits Pagode' },
                    { title: 'Sambas Imortais', description: 'Clara Nunes, Beth Carvalho, Alcione', icon: '🎤', query: 'Sambas Imortais' },
                    { title: 'Hits Gospel', description: 'Gabriela Rocha, Isadora Pompeo', icon: '🙏', query: 'Hits Gospel' },
                    { title: 'The Hit List', description: 'Luan Pereira, MC Tuto, Zé Felipe', icon: '🔥', query: 'The Hit List' },
                    { title: 'Tremidão', description: 'Zé Felipe, MC Tuto, Felipe Amorim', icon: '🚂', query: 'Tremidão' },
                  ].map((item, idx) => (
                    <div key={idx} className="featured-card" onClick={() => {
                      setQuery('Musicas ' + item.query);
                      setTimeout(()=>{ handleSearch(); setPage('home'); }, 0);
                    }}>
                      <div className="featured-icon">{item.icon}</div>
                      <div className="featured-info">
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                      </div>
                    </div>
                  ))}
                  {/* Mantém sugestões customizadas antigas */}
                  {[
                    { title: 'Clássicos', description: 'Músicas que nunca saem de moda', icon: '🎼' },
                    { title: 'Descobertas', description: 'Novos artistas para conhecer', icon: '🆕' },
                    { title: 'Para Relaxar', description: 'Músicas calmas e suaves', icon: '🌙' }
                  ].map((item, idx) => (
                    <div key={'custom'+idx} className="featured-card" onClick={() => {
                      setQuery(item.title);
                      handleSearch();
                      setPage('home');
                    }}>
                      <div className="featured-icon">{item.icon}</div>
                      <div className="featured-info">
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* buscas recentes removidas da página Descobrir */}
            </section>
          )}

          {page==='library' && (
            <section className="panel library-panel">
              <div className="library-header">
                <h1>Sua Biblioteca</h1>
                <p>Suas músicas salvas offline</p>
              </div>
              
              <div className="library-content">
                <div className="library-search">
                  <input
                    type="text"
                    placeholder="Buscar em sua biblioteca"
                    value={offlineSearch}
                    onChange={(e) => setOfflineSearch(e.target.value)}
                    className="library-search-input"
                  />
                  {offlineSearch && (
                    <button
                      onClick={() => setOfflineSearch('')}
                      className="clear-search-btn"
                      title="Limpar busca"
                    >
                      ✕
                    </button>
                  )}
                </div>
                
                <div className="library-stats">
                  <span>{cachedList.length} músicas salvas</span>
                </div>
                
                <div className="library-tracks">
                  {filteredCachedList.length === 0 && cachedList.length > 0 && (
                    <div className="empty-state">
                      <p>Nenhuma música encontrada para "{offlineSearch}".</p>
                    </div>
                  )}
                  {cachedList.length === 0 && (
                    <div className="empty-state">
                      <p>Você ainda não salvou nenhuma música.</p>
                      <p>Busque por músicas e clique em "Salvar" para adicioná-las à sua biblioteca.</p>
                    </div>
                  )}
                  {filteredCachedList.map((c, i) => (
                    <div key={c.id + i} className="library-track-item">
                      <div className="track-info">
                        <img 
                          src={c.meta?.thumbnail || buildYouTubeThumb({id: c.id}) || '/vite.svg'} 
                          onError={(e) => onImgError(e, {id: c.id})} 
                          alt="thumbnail" 
                          className="track-thumbnail"
                        />
                        <div className="track-details">
                          <div className="track-title">{c.meta?.title || c.id}</div>
                          <div className="track-meta">
                            <span className="track-size">{(c.size / 1024 / 1024).toFixed(1)} MB</span>
                          </div>
                        </div>
                      </div>
                      <div className="track-actions">
                        <button 
                          className="btn primary"
                          onClick={async () => {
                            try {
                              const url = await idb.getObjectURL(c.id);
                              if (url) {
                                if (audioRef.current) {
                                  audioRef.current.src = url;
                                  audioRef.current.play();
                                  setPlaying(true);
                                  setCurrent({ id: c.id, title: c.meta?.title || c.id, thumbnail: c.meta?.thumbnail || buildYouTubeThumb({id: c.id}) });
                                }
                              }
                            } catch (e) {
                              console.warn(e);
                            }
                          }}
                        >
                          Tocar
                        </button>
                        <button 
                          className="btn"
                          onClick={async () => {
                            try {
                              setQueue(q => {
                                const next = [...q, { id: c.id, title: c.meta?.title || c.id, thumbnail: c.meta?.thumbnail }];
                                try { localStorage.setItem('mystream_queue', JSON.stringify(next)) } catch (e) {};
                                return next;
                              });
                              refreshCachedList();
                            } catch (e) {
                              console.warn(e);
                            }
                          }}
                        >
                          Adicionar à fila
                        </button>
                        <button 
                          className="btn"
                          onClick={async () => {
                            try {
                              const blob = await idb.getBlob(c.id);
                              if (!blob) return;
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              const name = (c.meta && c.meta.title) ? c.meta.title.replace(/[^a-z0-9\-_\. ]/gi, '_') + '.mp3' : c.id + '.mp3';
                              a.download = name;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              setTimeout(() => URL.revokeObjectURL(url), 10000);
                            } catch (e) {
                              console.warn(e);
                            }
                          }}
                        >
                          Baixar
                        </button>
                        <button 
                          className="btn danger"
                          onClick={async () => {
                            if (confirm('Tem certeza que deseja remover esta música da biblioteca?')) {
                              try {
                                await idb.remove(c.id);
                                refreshCachedList();
                                setCachedURLs(prev => {
                                  const copy = { ...prev };
                                  delete copy[c.id];
                                  return copy;
                                });
                              } catch (e) {
                                console.warn(e);
                              }
                            }
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {page==='player' && (
            <section className="panel player-panel two-column">
              <div className="player-column">
                <div className={`player-main ${playing ? 'playing' : ''}`}>
                  <div className="player-artwork">
                    <img className="player-large-thumb" src={(current && (current.thumbnail || buildYouTubeThumb(current))) || '/vite.svg'} alt="current track" onError={(e)=>onImgError(e, current)} />
                    <div className="player-overlay">
                      <div className="play-overlay-btn" onClick={handlePlayPause}>
                        {playing ? '⏸️' : '▶️'}
                      </div>
                    </div>
                  </div>
                  <div className="player-details">
                    <h2 className="player-title">{current?.title || 'Nenhuma faixa selecionada'}</h2>
                    <p className="player-artist">YouTube Audio</p>
                  </div>
                  <div className={`player-progress ${playing ? 'playing' : ''}`}>
                    <div className="seekbar-large" onClick={(e)=>{ const rect=e.currentTarget.getBoundingClientRect(); const pct = ((e.clientX - rect.left)/rect.width)*100; seekTo(pct); }}>
                      <div className="seekfill-large" style={{width: duration? `${Math.floor((position/duration)*100)}%` : '0%'}}></div>
                    </div>
                    <div className="progress-times">
                      <span className="time-current">{new Date(position*1000).toISOString().substr(14,5)}</span>
                      <span className="time-total">{new Date(duration*1000).toISOString().substr(14,5)}</span>
                    </div>
                  </div>
                  <div className="player-controls-large">
                    <button className="control-large-btn" onClick={prevTrack} title="Música anterior">
                      ⏮️
                    </button>
                    <button className={`control-large-btn play-large-btn ${playing ? 'playing' : ''}`} onClick={handlePlayPause} title={playing ? 'Pausar' : 'Tocar'}>
                      {playing ? '⏸️' : '▶️'}
                    </button>
                    <button className="control-large-btn" onClick={nextTrack} title="Próxima música">
                      ⏭️
                    </button>
                  </div>
                </div>
              </div>
              <aside className="queue-column">
                <div className="queue-header">
                  <h4>Fila de Reprodução</h4>
                  <span className="queue-count">{queue.length} músicas</span>
                </div>
                <div className="queue-list-enhanced">
                  {queue.length === 0 ? (
                    <div className="queue-empty">
                      <div className="empty-icon">�</div>
                      <p>Sua fila está vazia</p>
                      <small>Adicione músicas da página inicial</small>
                    </div>
                  ) : (
                    queue.map((q,i)=> (
                      <div key={q.id+i} className={`queue-item-enhanced ${queueIndex===i? 'playing':''}`}>
                        <div className="queue-item-number">
                          {queueIndex===i ? '🎶' : (i+1)}
                        </div>
                        <img src={q.thumbnail || buildYouTubeThumb(q) || '/vite.svg'} onError={(e)=>onImgError(e, q)} alt="track" />
                        <div className="queue-item-info">
                          <div className="queue-item-title">{q.title}</div>
                          <div className="queue-item-meta">
                            {isCached(q.id) && <span className="cached-badge-small" title="Salvo no cache">💾</span>}
                          </div>
                        </div>
                        <div className="queue-item-actions">
                          <button className="queue-action-btn" onClick={()=>{ setQueueIndex(i); try{ localStorage.setItem('mystream_queueIndex', String(i)) }catch(e){}; playCachedOrStream(q,i); }} title="Tocar">
                            🎵
                          </button>
                          <button className="queue-action-btn" onClick={()=>removeFromQueue(i)} title="Remover">
                            ✖️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </aside>
            </section>
          )}

            {page==='cached' && (
              <section className="panel cached-panel">
                <div className="cached-header">
                  <h3>Salvos no cache ({cachedList.length})</h3>
                  <div className="offline-search">
                    <input
                      type="text"
                      placeholder="Buscar músicas offline..."
                      value={offlineSearch}
                      onChange={(e) => setOfflineSearch(e.target.value)}
                      className="offline-search-input"
                    />
                    {offlineSearch && (
                      <button
                        onClick={() => setOfflineSearch('')}
                        className="clear-search-btn"
                        title="Limpar busca"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="cached-list">
                  {filteredCachedList.length === 0 && cachedList.length > 0 && (
                    <div className="muted">Nenhuma música encontrada para "{offlineSearch}".</div>
                  )}
                  {cachedList.length === 0 && <div className="muted">Nenhuma música salva.</div>}
                  {filteredCachedList.map((c,i)=> (
                    <div key={c.id+i} className="cached-row">
                      <div className="cached-meta">
                        <div className="cached-id">{c.id}</div>
                        <div className="cached-info">{c.meta && c.meta.title ? c.meta.title : ''} <span className="muted">({(c.size/1024).toFixed(1)} KB)</span></div>
                      </div>
                      <div className="cached-actions">
                        <button onClick={async ()=>{ try{ const url = await idb.getObjectURL(c.id); if(url){ if(audioRef.current){ audioRef.current.src = url; audioRef.current.play(); setPlaying(true); setCurrent({ id: c.id, title: c.meta?.title || c.id, thumbnail: c.meta?.thumbnail || buildYouTubeThumb({id: c.id}) }); } } }catch(e){ console.warn(e) } }}>Tocar</button>
                        <button onClick={async ()=>{ try{ setQueue(q=>{ const next=[...q, { id:c.id, title: c.meta?.title || c.id, thumbnail: buildYouTubeThumb({id: c.id}) }]; try{ localStorage.setItem('mystream_queue', JSON.stringify(next)) }catch(e){}; return next }); refreshCachedList(); }catch(e){}}}>Adicionar</button>
                        <button onClick={async ()=>{ // baixar: gerar link para download
                          try{
                            const blob = await idb.getBlob(c.id);
                            if(!blob) return;
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            const name = (c.meta && c.meta.title) ? c.meta.title.replace(/[^a-z0-9\-_\. ]/gi,'_') + '.mp3' : c.id + '.mp3';
                            a.download = name;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            setTimeout(()=> URL.revokeObjectURL(url), 10000);
                          }catch(e){ console.warn(e) }
                        }}>Baixar</button>
                        <button onClick={async ()=>{ try{ await idb.remove(c.id); refreshCachedList(); setCachedURLs(prev=>{ const copy={...prev}; delete copy[c.id]; return copy }); }catch(e){ console.warn(e) } }}>Remover</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

        </div>

        <footer className="app-footer">
          <div className="status">{status}</div>
        </footer>
      </div>

      {/* Player fixo na parte inferior */}
      {current && (
        <div className={`bottom-player ${playing ? 'playing' : ''}`}>
          <div className="bottom-player-content">
            <div className="bottom-left">
              <img className="bottom-thumb" src={current.thumbnail || '/vite.svg'} onError={(e)=>onImgError(e, current)} alt="current track" />
              <div className="bottom-meta">
                <div className="bottom-title">{current.title}</div>
                <div className="bottom-artist">YouTube Audio</div>
              </div>
            </div>
            <div className="bottom-center">
              <div className="bottom-controls">
                <button className="control-btn" onClick={prevTrack} title="Anterior">⏮️</button>
                <button className="control-btn play-btn" onClick={handlePlayPause} title={playing ? 'Pausar' : 'Tocar'}>
                  {playing ? '⏸️' : '▶️'}
                </button>
                <button className="control-btn" onClick={nextTrack} title="Próxima">⏭️</button>
              </div>
              <div className="bottom-seek">
                <span className="time">{new Date(position*1000).toISOString().substr(14,5)}</span>
                <div className="seekbar-mini" onClick={(e)=>{ const rect=e.currentTarget.getBoundingClientRect(); const pct = ((e.clientX - rect.left)/rect.width)*100; seekTo(pct); }}>
                  <div className="seekfill-mini" style={{width: duration? `${Math.floor((position/duration)*100)}%` : '0%'}}></div>
                </div>
                <span className="time">{new Date(duration*1000).toISOString().substr(14,5)}</span>
              </div>
            </div>
            <div className="bottom-right">
              <button className="control-btn" onClick={()=>setPage('player')} title="Expandir player">⬆️</button>
            </div>
          </div>
        </div>
      )}

      <audio ref={audioRef} style={{display:'none'}} defaultValue="1" />
      
      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <div className="loading-text">Carregando...</div>
          </div>
        </div>
      )}
      
    </div>
  )
}

export default App;
