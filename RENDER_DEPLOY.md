# 🚀 Deploy no Render - Guia Completo

## Pré-requisitos
- ✅ Conta no GitHub (se ainda não tiver)
- ✅ Conta no Render (render.com) - é GRATUITA!

## Passo 1: Subir o código para o GitHub

### Se você ainda não tem um repositório:

```bash
# Na pasta do projeto
git init
git add .
git commit -m "Initial commit - YouTube Downloader API"

# Criar repositório no GitHub.com e depois:
git remote add origin https://github.com/SEU_USUARIO/youtube-downloader.git
git branch -M main
git push -u origin main
```

### Se já tem um repositório:
```bash
git add .
git commit -m "Add Render deployment config"
git push
```

## Passo 2: Deploy no Render

1. **Acesse render.com e faça login**

2. **Clique em "New +" → "Web Service"**

3. **Conecte seu repositório GitHub:**
   - Autorize o Render a acessar seus repositórios
   - Selecione o repositório do projeto

4. **Configure o serviço:**
   ```
   Name: youtube-downloader-api
   Environment: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: gunicorn server:app
   ```

5. **Configurações avançadas:**
   - **Auto-Deploy**: Yes (para deploy automático)
   - **Branch**: main
   - **Environment Variables**:
     ```
     PRODUCTION = true
     PYTHON_VERSION = 3.11
     ```

6. **Clique em "Create Web Service"**

## Passo 3: Aguardar o Deploy

- O Render vai automaticamente:
  - ✅ Fazer o build da aplicação
  - ✅ Instalar as dependências
  - ✅ Iniciar o servidor
  - ✅ Fornecer uma URL pública

## Passo 4: Obter a URL da API

Após o deploy, você receberá uma URL como:
```
https://youtube-downloader-api-xxxx.onrender.com
```

## Passo 5: Atualizar o Frontend

Edite o arquivo `src/App.jsx` e atualize a URL da API:

```javascript
// Trocar esta linha:
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Por esta (com sua URL do Render):
const API_BASE = import.meta.env.VITE_API_URL || 'https://sua-url-do-render.onrender.com';
```

## Passo 6: Rebuild do App Android

```bash
# Build do frontend com nova API
npm run build

# Sincronizar com Android
npx cap sync android

# Abrir no Android Studio
npx cap open android
```

## ⚠️ Limitações do Plano Gratuito do Render

- **Sleep Mode**: O serviço "dorme" após 15 minutos de inatividade
- **Build Time**: 500 horas de build por mês
- **Bandwidth**: 100GB por mês
- **Cold Start**: Pode demorar 30-60s para "acordar"

## 🔧 Solução para Cold Start

Para evitar que o serviço durma, você pode usar um serviço de ping como:
- **UptimeRobot** (gratuito)
- **Pingdom**
- **StatusCake**

Configure para fazer ping na sua URL a cada 10-14 minutos.

## 🐛 Troubleshooting

### Erro de Build:
```bash
# Verificar logs no Render Dashboard
# Geralmente relacionado a dependências
```

### Erro 503/504:
```bash
# Servidor provavelmente dormindo
# Aguarde 30-60s para reativação
```

### CORS Error:
```bash
# Verificar se CORS está configurado no server.py
# Já está configurado neste projeto
```

## 📱 Resultado Final

Após o deploy:
- ✅ **Web App**: Funciona no navegador
- ✅ **Android App**: Funciona conectado à API na nuvem
- ✅ **API Pública**: Disponível 24/7 (com limitações gratuitas)

## 💡 Dicas Extras

1. **Monitoramento**: Use o dashboard do Render para ver logs
2. **Custom Domain**: No plano pago, você pode usar seu próprio domínio
3. **Environment Variables**: Adicione chaves de API se necessário
4. **Database**: O Render oferece PostgreSQL gratuito também

## 🔄 Deploy Automático

Agora, sempre que você fizer `git push`, o Render automaticamente:
1. Detecta mudanças
2. Faz rebuild
3. Redeploy automático

**Sua API estará online em poucos minutos! 🎉**