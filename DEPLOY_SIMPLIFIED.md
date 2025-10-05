# 🔧 Versão Simplificada para Deploy no Render

## ⚠️ Problemas Identificados no Deploy Original:

1. **FFmpeg não disponível** no ambiente gratuito do Render
2. **Dependências complexas** causando conflitos
3. **Scripts de build** incompatíveis
4. **Timeout** em operações pesadas

## ✅ Solução: Versão Simplificada

Criamos uma versão simplificada (`server.py`) que funciona no plano gratuito do Render:

### **Funcionalidades Mantidas:**
- ✅ Busca de vídeos (`/search`)
- ✅ Informações do vídeo (`/info`) 
- ✅ Stream de áudio básico (`/stream/<video_id>`)
- ✅ Health checks (`/`, `/health`)

### **Funcionalidades Removidas (temporariamente):**
- ❌ Download com FFmpeg (requer plano pago)
- ❌ Conversão para MP3 (requer FFmpeg)
- ❌ Downloads de playlist (complexo demais)

## 📁 **Arquivos Alterados:**

- `server.py` → Versão simplificada
- `server_full.py` → Backup da versão completa
- `requirements.txt` → Dependências mínimas
- `render.yaml` → Configuração simplificada

## 🚀 **Deploy Manual (se git push falhar):**

1. **Conecte ao Render Dashboard**
2. **Manual Deploy:**
   - Acesse seu serviço no Render
   - Clique em "Manual Deploy"
   - Selecione branch `main`
   - Deploy será feito automaticamente

## 📱 **Como usar no App:**

A API simplificada ainda permite:

1. **Buscar músicas**
2. **Obter informações** do vídeo
3. **Stream básico** (sem conversão)

### **Para desenvolvimento local (versão completa):**

```bash
# Usar a versão completa localmente
cp server_full.py server.py
python server.py
```

### **Para produção (versão simplificada):**

A versão atual já está configurada para o Render.

## 🔄 **Próximos Passos:**

1. **Deploy da versão simplificada** primeiro
2. **Testar funcionalidades básicas**
3. **Upgrade para plano pago** se precisar de downloads
4. **Restaurar funcionalidades completas** com FFmpeg

## 💡 **Alternativas para Downloads:**

- **YouTube Music API** (requer API key)
- **Serviços externos** de conversão
- **Client-side downloads** (limitado)
- **Plano pago do Render** (FFmpeg disponível)

**A versão simplificada permite testar toda a interface e funcionalidades básicas! 🎉**