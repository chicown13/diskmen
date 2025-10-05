# Instruções para Deploy do Backend

## Opções de Deploy:

### 1. Deploy Local (para desenvolvimento)
- Certifique-se de que o server.py está rodando na mesma rede
- Configure o IP local no app (ex: 192.168.1.100:5000)

### 2. Deploy em Cloud (Recomendado para produção)

#### Heroku:
1. Instale o Heroku CLI
2. Crie um arquivo `Procfile` na raiz:
   ```
   web: python server.py
   ```
3. Configure as variáveis de ambiente:
   ```
   heroku config:set PORT=5000
   ```
4. Deploy:
   ```
   git add .
   git commit -m "Deploy backend"
   heroku create your-app-name
   git push heroku main
   ```

#### Railway:
1. Conecte seu repositório
2. Configure as variáveis de ambiente
3. Deploy automático

#### Render:
1. Conecte seu repositório
2. Configure o comando de start: `python server.py`
3. Configure as variáveis de ambiente

### 3. Configuração no App Mobile:
- Atualize a variável `API_BASE` no App.jsx para apontar para sua URL de produção
- Para desenvolvimento local, use o IP da sua máquina na rede local

### 4. Considerações de Segurança:
- Adicione rate limiting
- Configure CORS apropriadamente
- Use HTTPS em produção
- Considere autenticação se necessário