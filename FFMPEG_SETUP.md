# FFmpeg Setup para Render Deploy

O arquivo `ffmpeg.exe` foi removido do repositório por ser muito grande (185MB).

## Para Deploy no Render:

O Render irá automaticamente instalar o FFmpeg no container Linux. Não é necessário incluir o executável.

## Para Desenvolvimento Local:

Se você está rodando localmente no Windows, baixe o FFmpeg:

1. Acesse: https://github.com/BtbN/FFmpeg-Builds/releases
2. Baixe a versão: `ffmpeg-master-latest-win64-gpl.zip`
3. Extraia e copie `ffmpeg.exe` para a pasta do projeto
4. Ou instale via Chocolatey: `choco install ffmpeg`

## Verificação Automática:

O código já verifica automaticamente a presença do FFmpeg:
- Linux/Render: usa `ffmpeg` do PATH
- Windows Local: usa `ffmpeg.exe` local ou do PATH