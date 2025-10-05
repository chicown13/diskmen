#!/bin/bash

# Script de build para Render
echo "Instalando dependências de sistema..."

# Instalar FFmpeg
apt-get update && apt-get install -y ffmpeg

# Instalar dependências Python
echo "Instalando dependências Python..."
pip install -r requirements.txt

echo "Build concluído!"