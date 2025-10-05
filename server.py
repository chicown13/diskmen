from flask import Flask, request, send_file, jsonify, Response
import yt_dlp
import os
import uuid
from flask_cors import CORS
import threading
import time
import urllib.request as urllib_request
from flask import stream_with_context

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
DOWNLOAD_FOLDER = 'downloads'
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

progress = {}
# Simple in-memory search cache: { query_normalized: (timestamp, results) }
SEARCH_CACHE = {}
SEARCH_CACHE_TTL = 300  # seconds

@app.route('/info', methods=['POST'])
def info_video():
    data = request.get_json()
    link = data.get('link')
    if not link:
        return jsonify({'error': 'Link não fornecido'}), 400
    try:
        # Detecta playlist e monta link correto
        import re
        is_playlist = 'playlist' in link or 'list=' in link
        playlist_id = None
        if 'list=' in link:
            match = re.search(r'list=([A-Za-z0-9_-]+)', link)
            if match:
                playlist_id = match.group(1)
        if is_playlist and playlist_id:
            playlist_link = f'https://www.youtube.com/playlist?list={playlist_id}'
        else:
            playlist_link = link

        if is_playlist and playlist_id:
            # Para playlist: extração super rápida
            with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True, 'playlist_end': 10}) as ydl:
                info = ydl.extract_info(playlist_link, download=False)
            title = info.get('title', 'Playlist')
            entries = info.get('entries', [])[:10]
            entry_titles = [e.get('title', e.get('url', '')) for e in entries if e]
            return jsonify({'title': title, 'is_playlist': True, 'entries': entry_titles})
        else:
            # Para vídeo único: extração rápida sem download
            with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
                info = ydl.extract_info(link, download=False)
            title = info.get('title', '')
            return jsonify({'title': title, 'is_playlist': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/search', methods=['POST'])
def search_videos():
    data = request.get_json()
    query = data.get('query')
    if not query:
        return jsonify({'error': 'Query não fornecida'}), 400
    key = query.strip().lower()
    # check cache
    cached = SEARCH_CACHE.get(key)
    if cached:
        ts, results = cached
        if time.time() - ts < SEARCH_CACHE_TTL:
            return jsonify({'results': results, 'cached': True})
        else:
            del SEARCH_CACHE[key]
    try:
        # Usa yt_dlp para pesquisa
        # Reduce to 5 results and use a flatter, faster extraction when possible
        with yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True, 'extract_flat': True}) as ydl:
            search_url = f"ytsearch5:{query}"
            info = ydl.extract_info(search_url, download=False)
        entries = info.get('entries', []) if info else []
        results = []
        for e in entries[:5]:
            if not e:
                continue
            results.append({
                'id': e.get('id'),
                'title': e.get('title'),
                'url': f"https://www.youtube.com/watch?v={e.get('id')}",
                'duration': e.get('duration'),
                'thumbnail': e.get('thumbnail')
            })
        # store in cache
        try:
            SEARCH_CACHE[key] = (time.time(), results)
        except Exception:
            pass
        return jsonify({'results': results, 'cached': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/offline', methods=['GET'])
def list_offline():
    files = []
    try:
        for f in os.listdir(DOWNLOAD_FOLDER):
            if f.lower().endswith('.mp3') or f.lower().endswith('.zip'):
                files.append({'filename': f, 'path': os.path.join(DOWNLOAD_FOLDER, f)})
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/stream/<video_id>')
def stream_video_audio(video_id):
    """Proxy stream do áudio do YouTube para reprodução imediata.
    Aceita também parâmetro `url` para passar a URL completa.
    Suporta header Range para seek.
    Prioriza streaming direto sobre download completo.
    """
    try:
        url = request.args.get('url') or f'https://www.youtube.com/watch?v={video_id}'
        # Extrai formatos e escolhe melhor áudio
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
        formats = info.get('formats', [])
        # Filtra formatos de áudio
        audio_formats = [f for f in formats if f.get('acodec') and f.get('acodec') != 'none']
        if not audio_formats:
            return jsonify({'error': 'Formato de áudio não encontrado'}), 404

        # PRIORIDADE 1: Formatos que suportam streaming direto (não HLS/DASH)
        streamable_formats = []
        for fmt in audio_formats:
            proto = (fmt.get('protocol') or '').lower()
            has_url = fmt.get('url') is not None
            # Exclui HLS (m3u8) e DASH fragmentado
            if has_url and 'm3u8' not in proto and 'dash' not in proto and 'fragmented' not in proto:
                streamable_formats.append(fmt)

        # Se temos formatos streamáveis, usa o melhor deles
        if streamable_formats:
            # Ordena por qualidade (abr) e depois por preferência de codec
            streamable_formats.sort(key=lambda x: (
                x.get('abr') or 0,  # bitrate
                1 if x.get('ext') == 'webm' else 0,  # prefere não-webm
                1 if 'opus' in (x.get('acodec') or '') else 0  # prefere não-opus
            ), reverse=True)
            chosen = streamable_formats[0]
            print(f"Usando streaming direto: {chosen.get('format_id')} - {chosen.get('abr')}kbps {chosen.get('ext')}")
        else:
            # FALLBACK: usa o melhor formato disponível (incluindo HLS/DASH)
            audio_formats.sort(key=lambda x: (x.get('abr') or 0), reverse=True)
            chosen = audio_formats[0]
            print(f"Usando formato não-streaming (fallback): {chosen.get('format_id')} - {chosen.get('abr')}kbps {chosen.get('ext')}")

        stream_url = chosen.get('url')
        ext = chosen.get('ext', '').lower()
        content_type = 'audio/mpeg'
        if ext in ['m4a', 'mp4']:
            content_type = 'audio/mp4'
        elif ext in ['webm', 'opus']:
            content_type = 'audio/webm'

        # Verifica se pode fazer streaming direto
        use_temp_file = False
        proto = (chosen.get('protocol') or '').lower()
        if not stream_url or ('m3u8' in proto) or ('dash' in proto) or ('fragmented' in proto):
            use_temp_file = True
            print(f"Forçado download temporário devido ao protocolo: {proto}")

        # Se for para usar stream direto da URL
        if not use_temp_file:
            # Suporta Range header enviado pelo navegador
            headers = {}
            range_header = request.headers.get('Range')
            if range_header:
                headers['Range'] = range_header

            req_up = urllib_request.Request(stream_url, headers=headers)
            upstream = urllib_request.urlopen(req_up, timeout=15)

            # Copiar alguns headers úteis
            response_headers = {}
            content_range = upstream.getheader('Content-Range')
            if content_range:
                response_headers['Content-Range'] = content_range
            accept_ranges = upstream.getheader('Accept-Ranges')
            if accept_ranges:
                response_headers['Accept-Ranges'] = accept_ranges
            content_length = upstream.getheader('Content-Length')
            if content_length:
                response_headers['Content-Length'] = content_length

            def generate():
                try:
                    while True:
                        chunk = upstream.read(8192)
                        if not chunk:
                            break
                        yield chunk
                finally:
                    try:
                        upstream.close()
                    except Exception:
                        pass

            return Response(stream_with_context(generate()), headers=response_headers, status=upstream.getcode(), mimetype=content_type)
            # Suporta Range header enviado pelo navegador
            headers = {}
            range_header = request.headers.get('Range')
            if range_header:
                headers['Range'] = range_header

            req_up = urllib_request.Request(stream_url, headers=headers)
            upstream = urllib_request.urlopen(req_up, timeout=15)

            # Copiar alguns headers úteis
            response_headers = {}
            content_range = upstream.getheader('Content-Range')
            if content_range:
                response_headers['Content-Range'] = content_range
            accept_ranges = upstream.getheader('Accept-Ranges')
            if accept_ranges:
                response_headers['Accept-Ranges'] = accept_ranges
            content_length = upstream.getheader('Content-Length')
            if content_length:
                response_headers['Content-Length'] = content_length

            def generate():
                try:
                    while True:
                        chunk = upstream.read(8192)
                        if not chunk:
                            break
                        yield chunk
                finally:
                    try:
                        upstream.close()
                    except Exception:
                        pass

            return Response(stream_with_context(generate()), headers=response_headers, status=upstream.getcode(), mimetype=content_type)

        # Caso de fallback: usar yt-dlp para baixar para arquivo temporário e servir esse arquivo
        # Isso só deve acontecer para formatos muito específicos que não suportam streaming
        print(f"Iniciando download temporário para streaming: {chosen.get('format_id')}")
        try:
            temp_name = f'stream_{video_id}_{uuid.uuid4().hex[:8]}.mp3'
            temp_path = os.path.join(DOWNLOAD_FOLDER, temp_name)
            # Opções otimizadas para streaming rápido
            ydl_opts_dl = {
                'format': chosen.get('format_id'),  # Usa exatamente o formato escolhido
                'outtmpl': temp_path,
                'quiet': False,  # Mostra progresso para debug
                'noplaylist': True,
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '128',
                }] if ext != 'mp3' else [],  # Só converte se não for já mp3
            }

            print(f"Baixando para arquivo temporário: {temp_path}")
            with yt_dlp.YoutubeDL(ydl_opts_dl) as ydl:
                ydl.download([url])

            print(f"Download concluído, servindo arquivo: {temp_path}")
            # Agora servimos o arquivo com suporte a Range
            file_size = os.path.getsize(temp_path)
            range_header = request.headers.get('Range')
            start = 0
            end = file_size - 1
            status_code = 200
            response_headers = {'Accept-Ranges': 'bytes', 'Content-Type': content_type}
            if range_header:
                # Range: bytes=start-end
                try:
                    m = range_header.replace('bytes=', '').split('-')
                    if m[0]: start = int(m[0])
                    if m[1]: end = int(m[1])
                    status_code = 206
                    response_headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
                    response_headers['Content-Length'] = str(end - start + 1)
                except Exception:
                    start = 0; end = file_size - 1

            def generate_file():
                try:
                    with open(temp_path, 'rb') as f:
                        f.seek(start)
                        remaining = end - start + 1
                        chunk_size = 8192
                        while remaining > 0:
                            read_size = min(chunk_size, remaining)
                            data = f.read(read_size)
                            if not data:
                                break
                            remaining -= len(data)
                            yield data
                finally:
                    # remove temp file
                    try:
                        os.remove(temp_path)
                        print(f"Arquivo temporário removido: {temp_path}")
                    except Exception:
                        pass

            return Response(stream_with_context(generate_file()), headers=response_headers, status=status_code, mimetype=content_type)
        except Exception as e:
            print(f"Erro no fallback de download com yt-dlp: {e}")
            return jsonify({'error': 'Falha ao baixar o áudio via yt-dlp'}), 500
    except Exception as e:
        print(f"Erro no stream proxy: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/progress/<task_id>')
def get_progress(task_id):
    prog = progress.get(task_id, 0)
    filename = progress.get(f"{task_id}_filename", "")
    
    # Se for playlist, calcular progresso global dinamicamente
    if isinstance(prog, dict) and 'musicas' in prog and 'global' in prog:
        # Calcular progresso global baseado nas músicas individuais
        if prog['global'] != 100:  # Só recalcular se não estiver 100%
            total_musicas = len(prog['musicas'])
            total_percent = sum(musica['percent'] for musica in prog['musicas'])
            if total_musicas > 0:
                prog['global'] = total_percent // total_musicas
    
    # Log para debug
    print(f"[DEBUG] Progress request para {task_id}: prog={prog}, filename={filename}")
    
    # Se prog é um dicionário (playlist), retorna corretamente
    if isinstance(prog, dict):
        return jsonify({'progress': prog, 'filename': filename})
    else:
        return jsonify({'progress': prog, 'filename': filename})

@app.route('/baixar', methods=['POST'])
def baixar_audio():
    import concurrent.futures
    data = request.get_json()
    link = data.get('link')
    if not link:
        return jsonify({'error': 'Link não fornecido'}), 400
    
    # Resposta instantânea
    task_id = str(uuid.uuid4())
    progress[task_id] = 5
    
    def process():
        try:
            ffmpeg_path = os.path.join(os.path.dirname(__file__), 'ffmpeg.exe')
            if not os.path.isfile(ffmpeg_path):
                progress[task_id] = -1
                return

            progress[task_id] = 10

            # Detecta se é playlist e monta link correto
            import re
            is_playlist = 'playlist' in link or 'list=' in link
            playlist_id = None
            if 'list=' in link:
                match = re.search(r'list=([A-Za-z0-9_-]+)', link)
                if match:
                    playlist_id = match.group(1)
            if is_playlist and playlist_id:
                playlist_link = f'https://www.youtube.com/playlist?list={playlist_id}'
            else:
                playlist_link = link

            if is_playlist and playlist_id:
                # Extrai 20 músicas da playlist
                try:
                    print(f"[DEBUG] Iniciando extração da playlist: {playlist_link}")
                    with yt_dlp.YoutubeDL({'quiet': False, 'extract_flat': True, 'playlist_end': 20}) as ydl:
                        info = ydl.extract_info(playlist_link, download=False)
                    print(f"[DEBUG] Info extraído: {info}")
                    raw_entries = info.get('entries', [])[:20]
                    print(f"[DEBUG] Entradas encontradas: {raw_entries}")
                    entries = []
                    titles = []
                    for entry in raw_entries:
                        print(f"[DEBUG] Processando entrada: {entry}")
                        if entry and (entry.get('url') or entry.get('id')):
                            url = entry.get('url') or entry.get('id')
                            if not url.startswith('http'):
                                url = f"https://www.youtube.com/watch?v={url}"
                            entries.append(url)
                            titles.append(entry.get('title', url))
                    if not entries:
                        print("[ERRO] Nenhuma entrada válida encontrada na playlist. Info extraído:")
                        print(info)
                        progress[task_id] = -1
                        return
                    # Inicializa progresso individual
                    progress[task_id] = {'global': 0, 'musicas': [{'title': t, 'percent': 0} for t in titles]}
                except Exception as e:
                    print(f"[ERRO] Falha na análise da playlist: {e}")
                    import traceback
                    traceback.print_exc()
                    progress[task_id] = -1
                    return
            else:
                entries = [link]
                
            arquivos_mp3 = []
            total = len(entries)
            completed = 0

            def baixar_converter_playlist(idx, video_url, title):
                temp_id = str(uuid.uuid4())[:8]
                try:
                    def progress_hook(d):
                        if d['status'] == 'downloading':
                            percent = d.get('downloaded_bytes', 0) / max(d.get('total_bytes', d.get('total_bytes_estimate', 1)), 1)
                            progress[task_id]['musicas'][idx]['percent'] = int(percent * 80)
                        elif d['status'] == 'finished':
                            progress[task_id]['musicas'][idx]['percent'] = 80

                    ydl_opts = {
                        'format': 'bestaudio/best',
                        'outtmpl': os.path.join(DOWNLOAD_FOLDER, f'temp_{temp_id}.%(ext)s'),
                        'quiet': True,
                        'ffmpeg_location': ffmpeg_path,
                        'noplaylist': True,
                        'writeinfojson': False,
                        'writethumbnail': False,
                        'extract_flat': False,
                        'progress_hooks': [progress_hook],
                    }
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(video_url, download=True)
                    if not info:
                        print(f"Não foi possível extrair informações para: {video_url}")
                        return None
                    import re
                    safe_title = re.sub(r'[^\w\-_\. ]', '_', title)[:60]
                    temp_files = [f for f in os.listdir(DOWNLOAD_FOLDER) if f.startswith(f'temp_{temp_id}')]
                    if not temp_files:
                        print(f"Arquivo temporário não encontrado para: {temp_id}")
                        return None
                    audio_path = os.path.join(DOWNLOAD_FOLDER, temp_files[0])
                    mp3_path = os.path.join(DOWNLOAD_FOLDER, f"{safe_title}_{temp_id}.mp3")
                    import subprocess
                    def get_duration(path):
                        try:
                            result = subprocess.run([
                                ffmpeg_path, '-i', path
                            ], stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
                            match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', result.stderr)
                            if match:
                                h, m, s = match.groups()
                                return int(h) * 3600 + int(m) * 60 + float(s)
                        except Exception:
                            pass
                        return None
                    total_duration = get_duration(audio_path)
                    if not total_duration:
                        total_duration = 1
                    cmd = [
                        ffmpeg_path, '-i', audio_path, '-vn', '-ar', '44100', '-ac', '2', '-ab', '128k', mp3_path
                    ]
                    process = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
                    for line in process.stderr:
                        time_match = re.search(r'time=(\d+):(\d+):(\d+\.\d+)', line)
                        if time_match:
                            h, m, s = time_match.groups()
                            current = int(h) * 3600 + int(m) * 60 + float(s)
                            percent = min(1.0, current / total_duration)
                            progress[task_id]['musicas'][idx]['percent'] = 80 + int(percent * 19)
                    process.wait()
                    try:
                        os.remove(audio_path)
                    except Exception as cleanup_error:
                        print(f"Erro ao remover arquivo temporário: {cleanup_error}")
                    if process.returncode == 0 and os.path.isfile(mp3_path):
                        progress[task_id]['musicas'][idx]['percent'] = 100
                        progress[task_id]['musicas'][idx]['filename'] = os.path.basename(mp3_path)
                        return mp3_path
                    else:
                        print(f"Erro na conversão FFmpeg: {process.stderr}")
                        return None
                except Exception as e:
                    print(f"Erro ao processar {video_url}: {e}")
                    import traceback
                    traceback.print_exc()
                    return None

            # Funções definidas, agora executar lógica de download
            if is_playlist:
                # Download de vídeo único
                def baixar_converter_simples(video_url):
                    temp_id = str(uuid.uuid4())[:8]
                    try:
                        def progress_hook(d):
                            if d['status'] == 'downloading':
                                percent = d.get('downloaded_bytes', 0) / max(d.get('total_bytes', d.get('total_bytes_estimate', 1)), 1)
                                progress[task_id] = int(percent * 80)
                            elif d['status'] == 'finished':
                                progress[task_id] = 80
                        ydl_opts = {
                            'format': 'bestaudio/best',
                            'outtmpl': os.path.join(DOWNLOAD_FOLDER, f'temp_{temp_id}.%(ext)s'),
                            'quiet': True,
                            'ffmpeg_location': ffmpeg_path,
                            'noplaylist': True,
                            'writeinfojson': False,
                            'writethumbnail': False,
                            'extract_flat': False,
                            'progress_hooks': [progress_hook],
                        }
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = ydl.extract_info(video_url, download=True)
                        if not info:
                            print(f"Não foi possível extrair informações para: {video_url}")
                            return None
                        import re
                        safe_title = re.sub(r'[^\w\-_\. ]', '_', info.get('title', f'audio_{temp_id}'))[:60]
                        temp_files = [f for f in os.listdir(DOWNLOAD_FOLDER) if f.startswith(f'temp_{temp_id}')]
                        if not temp_files:
                            print(f"Arquivo temporário não encontrado para: {temp_id}")
                            return None
                        audio_path = os.path.join(DOWNLOAD_FOLDER, temp_files[0])
                        mp3_path = os.path.join(DOWNLOAD_FOLDER, f"{safe_title}_{temp_id}.mp3")
                        import subprocess
                        def get_duration(path):
                            try:
                                result = subprocess.run([
                                    ffmpeg_path, '-i', path
                                ], stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
                                match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', result.stderr)
                                if match:
                                    h, m, s = match.groups()
                                    return int(h) * 3600 + int(m) * 60 + float(s)
                            except Exception:
                                pass
                            return None
                        total_duration = get_duration(audio_path)
                        if not total_duration:
                            total_duration = 1
                        cmd = [
                            ffmpeg_path, '-i', audio_path, '-vn', '-ar', '44100', '-ac', '2', '-ab', '128k', mp3_path
                        ]
                        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
                        for line in process.stderr:
                            time_match = re.search(r'time=(\d+):(\d+):(\d+\.\d+)', line)
                            if time_match:
                                h, m, s = time_match.groups()
                                current = int(h) * 3600 + int(m) * 60 + float(s)
                                percent = min(1.0, current / total_duration)
                                progress[task_id] = 80 + int(percent * 19)
                        process.wait()
                        try:
                            os.remove(audio_path)
                        except Exception as cleanup_error:
                            print(f"Erro ao remover arquivo temporário: {cleanup_error}")
                        if process.returncode == 0 and os.path.isfile(mp3_path):
                            progress[task_id] = 100
                            return mp3_path
                        else:
                            print(f"Erro na conversão FFmpeg: {process.stderr}")
                            return None
                    except Exception as e:
                        print(f"Erro ao processar {video_url}: {e}")
                        import traceback
                        traceback.print_exc()
                        return None
            
            # Download de playlist com até 3 simultâneos
            if is_playlist:
                from concurrent.futures import ThreadPoolExecutor, as_completed
                with ThreadPoolExecutor(max_workers=3) as executor:
                    futures = [executor.submit(baixar_converter_playlist, idx, url, progress[task_id]['musicas'][idx]['title']) for idx, url in enumerate(entries)]
                    for future in as_completed(futures):
                        mp3 = future.result()
                        if mp3:
                            arquivos_mp3.append(mp3)
                # Só marca como 100% depois que TODAS as tarefas terminaram
                print(f"[DEBUG] Todas as tarefas concluídas. {len(arquivos_mp3)} arquivos processados.")
                progress[task_id]['global'] = 100
            else:
                # Download de vídeo único
                def baixar_converter_simples(video_url):
                    temp_id = str(uuid.uuid4())[:8]
                    try:
                        def progress_hook(d):
                            if d['status'] == 'downloading':
                                percent = d.get('downloaded_bytes', 0) / max(d.get('total_bytes', d.get('total_bytes_estimate', 1)), 1)
                                progress[task_id] = int(percent * 80)
                            elif d['status'] == 'finished':
                                progress[task_id] = 80
                        ydl_opts = {
                            'format': 'bestaudio/best',
                            'outtmpl': os.path.join(DOWNLOAD_FOLDER, f'temp_{temp_id}.%(ext)s'),
                            'quiet': True,
                            'ffmpeg_location': ffmpeg_path,
                            'noplaylist': True,
                            'writeinfojson': False,
                            'writethumbnail': False,
                            'extract_flat': False,
                            'progress_hooks': [progress_hook],
                        }
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = ydl.extract_info(video_url, download=True)
                        if not info:
                            print(f"Não foi possível extrair informações para: {video_url}")
                            return None
                        import re
                        safe_title = re.sub(r'[^\w\-_\. ]', '_', info.get('title', f'audio_{temp_id}'))[:60]
                        temp_files = [f for f in os.listdir(DOWNLOAD_FOLDER) if f.startswith(f'temp_{temp_id}')]
                        if not temp_files:
                            print(f"Arquivo temporário não encontrado para: {temp_id}")
                            return None
                        audio_path = os.path.join(DOWNLOAD_FOLDER, temp_files[0])
                        mp3_path = os.path.join(DOWNLOAD_FOLDER, f"{safe_title}_{temp_id}.mp3")
                        import subprocess
                        def get_duration(path):
                            try:
                                result = subprocess.run([
                                    ffmpeg_path, '-i', path
                                ], stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
                                match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', result.stderr)
                                if match:
                                    h, m, s = match.groups()
                                    return int(h) * 3600 + int(m) * 60 + float(s)
                            except Exception:
                                pass
                            return None
                        total_duration = get_duration(audio_path)
                        if not total_duration:
                            total_duration = 1
                        cmd = [
                            ffmpeg_path, '-i', audio_path, '-vn', '-ar', '44100', '-ac', '2', '-ab', '128k', mp3_path
                        ]
                        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
                        for line in process.stderr:
                            time_match = re.search(r'time=(\d+):(\d+):(\d+\.\d+)', line)
                            if time_match:
                                h, m, s = time_match.groups()
                                current = int(h) * 3600 + int(m) * 60 + float(s)
                                percent = min(1.0, current / total_duration)
                                progress[task_id] = 80 + int(percent * 19)
                        process.wait()
                        try:
                            os.remove(audio_path)
                        except Exception as cleanup_error:
                            print(f"Erro ao remover arquivo temporário: {cleanup_error}")
                        if process.returncode == 0 and os.path.isfile(mp3_path):
                            progress[task_id] = 100
                            return mp3_path
                        else:
                            print(f"Erro na conversão FFmpeg: {process.stderr}")
                            return None
                    except Exception as e:
                        print(f"Erro ao processar {video_url}: {e}")
                        import traceback
                        traceback.print_exc()
                        return None
                mp3 = baixar_converter_simples(entries[0])
                if mp3:
                    arquivos_mp3.append(mp3)
            
            # Finalização
            print(f"[DEBUG] is_playlist: {is_playlist}, arquivos_mp3: {len(arquivos_mp3) if arquivos_mp3 else 0}")
            if is_playlist and arquivos_mp3:
                import zipfile
                zip_name = f'playlist_{task_id[:8]}.zip'
                zip_path = os.path.join(DOWNLOAD_FOLDER, zip_name)
                print(f"[DEBUG] Criando ZIP: {zip_path}")
                print(f"[DEBUG] Arquivos MP3 para ZIP: {arquivos_mp3}")
                with zipfile.ZipFile(zip_path, 'w') as zipf:
                    for mp3 in arquivos_mp3:
                        if os.path.isfile(mp3):
                            zipf.write(mp3, os.path.basename(mp3))
                            print(f"[DEBUG] Adicionado ao ZIP: {os.path.basename(mp3)}")
                        else:
                            print(f"[DEBUG] Arquivo não encontrado: {mp3}")
                print(f"[DEBUG] ZIP criado com sucesso: {zip_path}")
                progress[task_id]['global'] = 100
                progress[f"{task_id}_filename"] = zip_name
                print(f"[DEBUG] Filename definido: {zip_name} para task_id: {task_id}")
            elif arquivos_mp3:
                progress[task_id] = 100
                progress[f"{task_id}_filename"] = os.path.basename(arquivos_mp3[0])
            else:
                print("[DEBUG] Nenhum arquivo MP3 foi gerado")
                if is_playlist:
                    progress[task_id]['global'] = -1
                else:
                    progress[task_id] = -1
                
        except Exception as e:
            print(f"Erro geral no processamento: {e}")
            import traceback
            traceback.print_exc()
            progress[task_id] = -1
    
    # Inicia processamento em background
    threading.Thread(target=process).start()
    
    # Resposta imediata
    return jsonify({'task_id': task_id})

@app.route('/download/<filename>')
def download_file(filename):
    filepath = os.path.join(DOWNLOAD_FOLDER, filename)
    if os.path.isfile(filepath):
        response = send_file(filepath, as_attachment=True, download_name=filename)
        # Agenda remoção do arquivo após download
        return response
    return jsonify({'error': 'Arquivo não encontrado'}), 404

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    host = "0.0.0.0" if os.environ.get("PRODUCTION") else "127.0.0.1"
    
    print(f"Iniciando servidor na porta {port}")
    print(f"Debug: {debug}")
    print(f"Host: {host}")
    
    app.run(host=host, port=port, debug=debug)
