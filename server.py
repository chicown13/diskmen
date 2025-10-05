from flask import Flask, request, jsonify, Response
import yt_dlp
import os
import uuid
from flask_cors import CORS
import threading
import time

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Configuração básica
DOWNLOAD_FOLDER = 'downloads'
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

progress = {}
SEARCH_CACHE = {}
SEARCH_CACHE_TTL = 300

@app.route('/')
def home():
    return jsonify({
        'status': 'ok',
        'message': 'YouTube Downloader API',
        'version': '1.0.0'
    })

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

@app.route('/search', methods=['POST'])
def search_videos():
    data = request.get_json()
    query = data.get('query')
    if not query:
        return jsonify({'error': 'Query não fornecida'}), 400
    
    try:
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
        
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/info', methods=['POST'])
def info_video():
    data = request.get_json()
    link = data.get('link')
    if not link:
        return jsonify({'error': 'Link não fornecido'}), 400
    
    try:
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(link, download=False)
        title = info.get('title', '')
        return jsonify({'title': title, 'is_playlist': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stream/<video_id>')
def stream_video_audio(video_id):
    """Stream básico de áudio do YouTube"""
    try:
        url = f'https://www.youtube.com/watch?v={video_id}'
        
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
        
        formats = info.get('formats', [])
        audio_formats = [f for f in formats if f.get('acodec') and f.get('acodec') != 'none']
        
        if not audio_formats:
            return jsonify({'error': 'Formato de áudio não encontrado'}), 404
        
        # Pega o melhor formato de áudio
        audio_formats.sort(key=lambda x: (x.get('abr') or 0), reverse=True)
        chosen = audio_formats[0]
        stream_url = chosen.get('url')
        
        if not stream_url:
            return jsonify({'error': 'URL de stream não encontrada'}), 404
        
        # Redireciona para a URL do stream
        return jsonify({'stream_url': stream_url})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/baixar', methods=['POST'])
def baixar_audio():
    """Download simplificado - apenas retorna informações"""
    data = request.get_json()
    link = data.get('link')
    if not link:
        return jsonify({'error': 'Link não fornecido'}), 400
    
    task_id = str(uuid.uuid4())
    progress[task_id] = 100  # Simula conclusão imediata
    
    try:
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(link, download=False)
        
        return jsonify({
            'task_id': task_id,
            'title': info.get('title', ''),
            'message': 'Informações extraídas com sucesso (download não implementado no deploy gratuito)'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/progress/<task_id>')
def get_progress(task_id):
    prog = progress.get(task_id, 0)
    return jsonify({'progress': prog})

@app.route('/offline', methods=['GET'])
def list_offline():
    return jsonify({'files': []})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    host = "0.0.0.0"
    
    print(f"Iniciando servidor na porta {port}")
    app.run(host=host, port=port, debug=debug)