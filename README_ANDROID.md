# YouTube Downloader - App Android

Este aplicativo foi convertido de React Web para Android usando Capacitor.

## Estrutura do Projeto

- **Frontend**: React + Vite (pasta `src/`)
- **Backend**: Python Flask (arquivo `server.py`)
- **Mobile**: Capacitor Android (pasta `android/`)

## Desenvolvimento

### Pré-requisitos

1. **Node.js** (v16+)
2. **Python 3.8+**
3. **Android Studio** (para desenvolvimento Android)
4. **Java 17** (para builds Android)

### Configuração Inicial

1. **Instalar dependências Node.js:**
   ```bash
   npm install
   ```

2. **Instalar dependências Python:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configurar Android Studio:**
   - Instale Android Studio
   - Configure o Android SDK
   - Crie um emulador Android

### Desenvolvimento Local

1. **Iniciar o backend:**
   ```bash
   python server.py
   ```

2. **Iniciar o frontend (desenvolvimento web):**
   ```bash
   npm run dev
   ```

3. **Para desenvolvimento mobile:**
   ```bash
   # Build do frontend
   npm run build
   
   # Sincronizar com Android
   npx cap sync android
   
   # Abrir no Android Studio
   npx cap open android
   ```

## Deploy

### Backend (Server.py)

#### Opção 1: Heroku
```bash
# Instalar Heroku CLI
# Criar arquivo Procfile (já incluído)
heroku create your-app-name
git add .
git commit -m "Deploy backend"
git push heroku main
```

#### Opção 2: Railway
1. Conecte seu repositório ao Railway
2. Configure as variáveis de ambiente
3. Deploy automático

#### Opção 3: Render
1. Conecte seu repositório ao Render
2. Configure comando: `python server.py`
3. Configure variáveis de ambiente

### Configuração do App para Produção

1. **Atualizar URL da API:**
   - Edite `src/App.jsx`
   - Altere `API_BASE` para sua URL de produção
   ```javascript
   const API_BASE = 'https://your-backend-url.herokuapp.com';
   ```

2. **Build e sincronização:**
   ```bash
   npm run build
   npx cap sync android
   ```

3. **Gerar APK:**
   ```bash
   npx cap open android
   # No Android Studio: Build > Generate Signed Bundle/APK
   ```

## Build para Produção

### Gerar APK de Debug
```bash
cd android
./gradlew assembleDebug
```

### Gerar APK de Release
1. Crie um keystore:
   ```bash
   keytool -genkey -v -keystore my-release-key.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
   ```

2. Configure `android/app/build.gradle` com as informações do keystore

3. Build:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

## Estrutura de Arquivos

```
projetoyt/
├── src/                    # Código React
├── android/               # Projeto Android (gerado pelo Capacitor)
├── dist/                  # Build de produção
├── server.py              # Backend Python/Flask
├── capacitor.config.json  # Configuração do Capacitor
├── package.json           # Dependências Node.js
├── requirements.txt       # Dependências Python
└── Procfile              # Configuração para deploy
```

## Recursos do App

- ✅ Download de vídeos individuais do YouTube
- ✅ Download de playlists (até 20 músicas)
- ✅ Player de música integrado
- ✅ Biblioteca offline
- ✅ Sistema de playlists
- ✅ Busca de vídeos
- ✅ Visualizador de áudio

## Plugins Capacitor Incluídos

- `@capacitor/app` - Funcionalidades do app
- `@capacitor/filesystem` - Acesso ao sistema de arquivos
- `@capacitor/network` - Status de rede
- `@capacitor/share` - Compartilhamento
- `@capacitor/toast` - Notificações toast

## Troubleshooting

### Problemas de CORS
- Verifique se o backend está configurado com CORS
- Verifique a URL da API no frontend

### Problemas de Rede no Android
- Verifique `network_security_config.xml`
- Certifique-se de que as permissões estão corretas no AndroidManifest.xml

### Problemas de Build
- Limpe o cache: `npx cap clean android`
- Resinchronize: `npx cap sync android`
- Verifique a versão do Java (deve ser 17)

## Próximos Passos

1. Fazer deploy do backend em uma plataforma cloud
2. Atualizar API_BASE no frontend
3. Testar no dispositivo físico
4. Gerar APK de release
5. Publicar na Google Play Store (opcional)