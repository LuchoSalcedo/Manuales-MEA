Ready to code?

 Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Plan de Despliegue a Producción - Hostinger VPS

 Resumen

 Desplegar la aplicación Manuales GSE (FastAPI + Next.js) en un VPS de Hostinger con Docker,
 Nginx como reverse proxy, y SSL con Let's Encrypt.

 ---
 Arquitectura de Producción

 Internet
     │
     ▼
 ┌─────────────────────────────────────────────────┐
 │              Hostinger VPS                       │
 │  ┌─────────────────────────────────────────┐    │
 │  │              Nginx (puerto 80/443)       │    │
 │  │     - SSL termination (Let's Encrypt)   │    │
 │  │     - Reverse proxy                      │    │
 │  └───────────────┬─────────────────────────┘    │
 │                  │                               │
 │    ┌─────────────┴─────────────┐                │
 │    ▼                           ▼                │
 │  ┌──────────────┐    ┌──────────────────┐       │
 │  │   Frontend   │    │     Backend      │       │
 │  │  (Next.js)   │    │   (FastAPI)      │       │
 │  │  puerto 3000 │    │   puerto 8000    │       │
 │  └──────────────┘    └──────────────────┘       │
 │                              │                   │
 │                              ▼                   │
 │                     ┌──────────────────┐        │
 │                     │   /uploads       │        │
 │                     │  (PDFs locales)  │        │
 │                     └──────────────────┘        │
 └─────────────────────────────────────────────────┘
            │
            ▼
     Servicios Externos:
     - Supabase (BD + Auth + Storage)
     - OpenAI API (embeddings)
     - Anthropic API (chat)

 ---
 Requisitos del VPS

 Plan seleccionado: Hostinger KVM 2 (8GB RAM) ✓

 | Recurso        | KVM 2 Specs            | Estado       |
 |----------------|------------------------|--------------|
 | RAM            | 8 GB                   | ✓ Suficiente |
 | CPU            | 4 cores                | ✓ Suficiente |
 | Disco          | 100 GB NVMe            | ✓ Suficiente |
 | OS             | Ubuntu 22.04/24.04 LTS | Instalar     |
 | Ancho de banda | 8 TB/mes               | ✓ Suficiente |

 El plan KVM 2 es ideal para esta aplicación. Permite procesar PDFs pesados y manejar múltiples
  usuarios concurrentes sin problemas.

 ---
 Archivos a Crear

 1. /backend/Dockerfile

 FROM python:3.13-slim

 WORKDIR /app

 # Instalar dependencias del sistema
 RUN apt-get update && apt-get install -y \
     gcc \
     libpq-dev \
     && rm -rf /var/lib/apt/lists/*

 # Copiar requirements e instalar
 COPY requirements.txt .
 RUN pip install --no-cache-dir -r requirements.txt

 # Copiar código
 COPY app ./app

 # Crear directorio de uploads
 RUN mkdir -p /app/uploads

 # Variables de entorno
 ENV PYTHONPATH=/app
 ENV PYTHONUNBUFFERED=1

 # Puerto
 EXPOSE 8000

 # Comando de inicio con Gunicorn
 CMD ["gunicorn", "app.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b",
 "0.0.0.0:8000"]

 2. /frontend/Dockerfile

 FROM node:20-alpine AS builder

 WORKDIR /app

 COPY package*.json ./
 RUN npm ci

 COPY . .

 # Build args para variables de entorno
 ARG NEXT_PUBLIC_SUPABASE_URL
 ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
 ARG NEXT_PUBLIC_API_URL

 ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
 ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
 ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

 RUN npm run build

 # Production stage
 FROM node:20-alpine AS runner

 WORKDIR /app

 ENV NODE_ENV=production

 COPY --from=builder /app/.next/standalone ./
 COPY --from=builder /app/.next/static ./.next/static
 COPY --from=builder /app/public ./public

 EXPOSE 3000

 CMD ["node", "server.js"]

 3. /frontend/next.config.ts (modificar)

 Agregar output standalone para Docker:
 const nextConfig = {
   output: 'standalone',
   // ... resto de config
 };

 4. /docker-compose.yml

 version: '3.8'

 services:
   backend:
     build:
       context: ./backend
       dockerfile: Dockerfile
     container_name: manuales-backend
     restart: unless-stopped
     env_file:
       - .env.production
     volumes:
       - ./uploads:/app/uploads
     ports:
       - "8000:8000"
     healthcheck:
       test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
       interval: 30s
       timeout: 10s
       retries: 3

   frontend:
     build:
       context: ./frontend
       dockerfile: Dockerfile
       args:
         - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
         - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
         - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
     container_name: manuales-frontend
     restart: unless-stopped
     ports:
       - "3000:3000"
     depends_on:
       - backend

   nginx:
     image: nginx:alpine
     container_name: manuales-nginx
     restart: unless-stopped
     ports:
       - "80:80"
       - "443:443"
     volumes:
       - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
       - ./nginx/ssl:/etc/nginx/ssl:ro
       - ./certbot/www:/var/www/certbot:ro
       - ./certbot/conf:/etc/letsencrypt:ro
     depends_on:
       - frontend
       - backend

   certbot:
     image: certbot/certbot
     container_name: manuales-certbot
     volumes:
       - ./certbot/www:/var/www/certbot
       - ./certbot/conf:/etc/letsencrypt
     entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait 
 $${!}; done;'"

 5. /nginx/nginx.conf

 events {
     worker_connections 1024;
 }

 http {
     upstream frontend {
         server frontend:3000;
     }

     upstream backend {
         server backend:8000;
     }

     # Redirect HTTP to HTTPS
     server {
         listen 80;
         server_name tu-dominio.com www.tu-dominio.com;

         location /.well-known/acme-challenge/ {
             root /var/www/certbot;
         }

         location / {
             return 301 https://$host$request_uri;
         }
     }

     # HTTPS server
     server {
         listen 443 ssl http2;
         server_name tu-dominio.com www.tu-dominio.com;

         ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
         ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

         ssl_protocols TLSv1.2 TLSv1.3;
         ssl_ciphers HIGH:!aNULL:!MD5;

         client_max_body_size 100M;

         # Backend API
         location /api {
             proxy_pass http://backend;
             proxy_http_version 1.1;
             proxy_set_header Upgrade $http_upgrade;
             proxy_set_header Connection 'upgrade';
             proxy_set_header Host $host;
             proxy_set_header X-Real-IP $remote_addr;
             proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
             proxy_set_header X-Forwarded-Proto $scheme;
             proxy_read_timeout 300s;
         }

         # Frontend
         location / {
             proxy_pass http://frontend;
             proxy_http_version 1.1;
             proxy_set_header Upgrade $http_upgrade;
             proxy_set_header Connection 'upgrade';
             proxy_set_header Host $host;
             proxy_cache_bypass $http_upgrade;
         }
     }
 }

 6. /.env.production

 # Backend
 DEBUG=false
 BACKEND_HOST=0.0.0.0
 BACKEND_PORT=8000

 # Supabase
 SUPABASE_URL=https://xxxxx.supabase.co
 SUPABASE_ANON_KEY=eyJhbG...
 SUPABASE_SERVICE_KEY=eyJhbG...

 # APIs de IA
 OPENAI_API_KEY=sk-proj-...
 ANTHROPIC_API_KEY=sk-ant-api03-...

 # Frontend URL (para CORS)
 FRONTEND_URL=https://tu-dominio.com
 ALLOWED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com

 # Frontend (para build)
 NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
 NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
 NEXT_PUBLIC_API_URL=https://tu-dominio.com

 # Uploads
 UPLOAD_DIR=/app/uploads
 MAX_FILE_SIZE_MB=50

 ---
 Pasos de Despliegue

 Fase 1: Preparar VPS (en Hostinger)

 # 1. Conectar por SSH
 ssh root@IP_DEL_VPS

 # 2. Actualizar sistema
 apt update && apt upgrade -y

 # 3. Instalar Docker
 curl -fsSL https://get.docker.com -o get-docker.sh
 sh get-docker.sh

 # 4. Instalar Docker Compose
 apt install docker-compose-plugin -y

 # 5. Crear usuario para la app (no usar root)
 adduser appuser
 usermod -aG docker appuser

 # 6. Configurar firewall
 ufw allow OpenSSH
 ufw allow 80/tcp
 ufw allow 443/tcp
 ufw enable

 # 7. Crear directorio del proyecto
 mkdir -p /opt/manuales-gse
 chown appuser:appuser /opt/manuales-gse

 Fase 2: Comprar y Configurar Dominio

 Paso A: Comprar dominio en Hostinger
 1. Ir a hostinger.com → Dominios → Buscar dominio
 2. Elegir extensión (.com, .mx, .app, etc.)
 3. Completar compra (si ya tienes hosting, puede tener descuento)

 Paso B: Configurar DNS en Hostinger
 1. Panel de Hostinger → hPanel → Dominios → tu-dominio.com
 2. Ir a "Zona DNS"
 3. Crear registros A:
   - Tipo: A | Nombre: @ | Apunta a: IP_DEL_VPS | TTL: 14400
   - Tipo: A | Nombre: www | Apunta a: IP_DEL_VPS | TTL: 14400
 4. Eliminar cualquier registro A existente que apunte a otra IP

 Paso C: Verificar propagación
 # Verificar desde terminal
 dig tu-dominio.com +short
 # Debe mostrar la IP de tu VPS

 # O usar https://dnschecker.org
 Esperar propagación DNS (usualmente 15-30 min, máximo 48h)

 Fase 3: Subir Código

 # Opción 1: Git (recomendado)
 cd /opt/manuales-gse
 git clone https://github.com/tu-usuario/manuales-gse.git .

 # Opción 2: SCP desde local
 scp -r ./backend ./frontend ./docker-compose.yml root@IP_VPS:/opt/manuales-gse/

 Fase 4: Configurar Variables de Entorno

 # Crear archivo de producción
 nano /opt/manuales-gse/.env.production
 # (pegar contenido con valores reales)

 # Asegurar permisos
 chmod 600 /opt/manuales-gse/.env.production

 Fase 5: Obtener Certificado SSL

 cd /opt/manuales-gse

 # Crear directorios para certbot
 mkdir -p certbot/www certbot/conf nginx/ssl

 # Iniciar nginx temporalmente para validación
 docker compose up -d nginx

 # Obtener certificado
 docker compose run --rm certbot certonly \
   --webroot --webroot-path=/var/www/certbot \
   -d tu-dominio.com -d www.tu-dominio.com \
   --email tu@email.com --agree-tos --no-eff-email

 Fase 6: Desplegar Aplicación

 cd /opt/manuales-gse

 # Construir imágenes
 docker compose build

 # Iniciar servicios
 docker compose up -d

 # Verificar estado
 docker compose ps
 docker compose logs -f

 Fase 7: Verificar Funcionamiento

 1. Abrir https://tu-dominio.com en navegador
 2. Probar login
 3. Verificar API: curl https://tu-dominio.com/api/health
 4. Probar carga de PDF (como admin)

 ---
 Comandos Útiles de Mantenimiento

 # Ver logs
 docker compose logs -f backend
 docker compose logs -f frontend

 # Reiniciar servicios
 docker compose restart

 # Actualizar código y redesplegar
 git pull
 docker compose build
 docker compose up -d

 # Ver uso de recursos
 docker stats

 # Limpiar imágenes antiguas
 docker system prune -a

 # Backup de uploads
 tar -czvf uploads-backup-$(date +%Y%m%d).tar.gz uploads/

 # Renovar certificado SSL (automático con certbot container)
 docker compose run --rm certbot renew

 ---
 Costos Estimados

 | Servicio                      | Costo                             |
 |-------------------------------|-----------------------------------|
 | Hostinger VPS KVM 2 (8GB RAM) | ~$13-18 USD/mes                   |
 | Dominio .com (en Hostinger)   | $10-15 USD/año ($1/mes)           |
 | Supabase Free Tier            | $0 (hasta 500MB BD, 1GB storage)  |
 | OpenAI API (embeddings)       | ~$5-20/mes según cantidad de PDFs |
 | Anthropic API (chat)          | ~$10-50/mes según consultas       |
 | Total estimado                | ~$30-90 USD/mes                   |

 Tip: Hostinger suele tener promociones. El primer año puede salir más barato.

 ---
 Consideraciones de Seguridad

 1. No exponer puertos innecesarios - Solo 80/443 públicos
 2. Usar secrets management - No subir .env a git
 3. Actualizar regularmente - apt update && apt upgrade
 4. Fail2ban para proteger SSH: apt install fail2ban
 5. Backups automáticos de uploads y configuración
 6. Monitoreo - Configurar alertas si el servidor cae

 ---
 Archivos Críticos a Crear/Modificar

 | Archivo                  | Acción    | Descripción                   |
 |--------------------------|-----------|-------------------------------|
 | /backend/Dockerfile      | Crear     | Dockerfile para FastAPI       |
 | /frontend/Dockerfile     | Crear     | Dockerfile para Next.js       |
 | /frontend/next.config.ts | Modificar | Agregar output: 'standalone'  |
 | /docker-compose.yml      | Crear     | Orquestación de servicios     |
 | /nginx/nginx.conf        | Crear     | Configuración reverse proxy   |
 | /.env.production         | Crear     | Variables de producción       |
 | /.dockerignore           | Crear     | Excluir archivos innecesarios |
 | /backend/.dockerignore   | Crear     | Excluir venv, pycache         |
 | /frontend/.dockerignore  | Crear     | Excluir node_modules, .next   |
