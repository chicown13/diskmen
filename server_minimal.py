from flask import Flask, request, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return jsonify({
        'status': 'ok',
        'message': 'YouTube Downloader API - Minimal Test Version',
        'version': '1.0.0'
    })

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

@app.route('/search', methods=['POST'])
def search_videos():
    """Busca simulada para teste da interface"""
    data = request.get_json() or {}
    query = data.get('query', '')
    
    # Retorna dados simulados para testar a interface
    results = [
        {
            'id': 'dQw4w9WgXcQ',
            'title': f'[TESTE] Resultado para: {query}',
            'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'duration': 212,
            'thumbnail': 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg'
        },
        {
            'id': '9bZkp7q19f0',
            'title': f'[TESTE] Outro resultado para: {query}',
            'url': 'https://www.youtube.com/watch?v=9bZkp7q19f0',
            'duration': 180,
            'thumbnail': 'https://img.youtube.com/vi/9bZkp7q19f0/default.jpg'
        }
    ]
    
    return jsonify({'results': results, 'cached': False})

@app.route('/info', methods=['POST'])
def info_video():
    """Info simulada"""
    data = request.get_json() or {}
    link = data.get('link', '')
    
    return jsonify({
        'title': f'[TESTE] Título simulado para: {link}',
        'is_playlist': False
    })

@app.route('/stream/<video_id>')
def stream_video_audio(video_id):
    """Stream de teste"""
    return jsonify({
        'message': 'Stream será implementado na versão completa',
        'video_id': video_id,
        'status': 'test'
    })

@app.route('/baixar', methods=['POST'])
def baixar_audio():
    """Download de teste"""
    data = request.get_json() or {}
    link = data.get('link', '')
    
    return jsonify({
        'task_id': 'test-123',
        'title': '[TESTE] Download simulado',
        'message': 'Esta é uma versão de teste. Downloads serão implementados na versão completa.'
    })

@app.route('/progress/<task_id>')
def get_progress(task_id):
    return jsonify({'progress': 100, 'filename': 'test.mp3'})

@app.route('/offline', methods=['GET'])
def list_offline():
    return jsonify({'files': []})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    host = "0.0.0.0"
    
    print(f"=== YouTube Downloader API - Versão de Teste ===")
    print(f"Servidor iniciando na porta {port}")
    print(f"Esta é uma versão minimalista para testar deploy")
    
    app.run(host=host, port=port, debug=False)