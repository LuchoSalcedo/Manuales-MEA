# Registro de Incidentes y Soluciones - Manuales MEA

Este documento registra los problemas encontrados en producción y sus soluciones para referencia futura.

---

## Tabla de Contenidos

1. [INC-001: HTTP/2 causa fallo en primera petición del chat](#inc-001-http2-causa-fallo-en-primera-petición-del-chat)
2. [INC-002: Worker Timeout de Gunicorn](#inc-002-worker-timeout-de-gunicorn)
3. [INC-003: Visor de páginas falla intermitentemente](#inc-003-visor-de-páginas-falla-intermitentemente)
4. [INC-004: Dropdown de manuales no muestra todos los items](#inc-004-dropdown-de-manuales-no-muestra-todos-los-items)
5. [INC-005: Chat timeout del frontend muy corto](#inc-005-chat-timeout-del-frontend-muy-corto)

---

## INC-001: HTTP/2 causa fallo en primera petición del chat

**Fecha:** 2026-01-07
**Severidad:** Alta
**Estado:** Resuelto

### Síntomas
- La **primera** petición al endpoint `/api/chat/` fallaba con error "Failed to fetch"
- El error ocurría consistentemente después de ~18-19 segundos
- La **segunda** petición (inmediatamente después) funcionaba correctamente
- En los logs de nginx aparecía status 499 (client closed request)

### Diagnóstico
- El problema solo ocurría con HTTP/2 habilitado
- HTTP/2 tiene timeouts de stream agresivos (~15-20 segundos)
- Las consultas RAG tardan 20-30 segundos (embedding + búsqueda + Claude API)
- El stream HTTP/2 se cerraba antes de que el servidor terminara de procesar

### Solución
Desactivar HTTP/2 en nginx. Con HTTP/1.1 las peticiones largas funcionan correctamente.

**Archivo:** `nginx/nginx.conf`
```nginx
# Antes
listen 443 ssl;
http2 on;

# Después
listen 443 ssl;
# HTTP/2 desactivado - causa errores en requests largos (RAG ~20-30s)
```

### Commits relacionados
- `277f9cb` - Fix: desactivar HTTP/2 para evitar errores en requests largos

### Notas para el futuro
- Si se necesita HTTP/2 por rendimiento, investigar configuraciones como:
  - `grpc_read_timeout` / `grpc_send_timeout`
  - HTTP/2 keepalive settings
  - Implementar streaming de respuestas en lugar de request/response tradicional
- El impacto en rendimiento de usar HTTP/1.1 es mínimo para el tráfico actual

---

## INC-002: Worker Timeout de Gunicorn

**Fecha:** 2026-01-07
**Severidad:** Alta
**Estado:** Resuelto

### Síntomas
- Error 502 Bad Gateway intermitente en el chat
- En logs del backend: `[CRITICAL] WORKER TIMEOUT (pid:X)`
- El worker era terminado con código 134

### Diagnóstico
- Gunicorn tiene un timeout por defecto de 30 segundos
- Las consultas RAG pueden tardar 20-30 segundos
- Cuando el worker estaba ocupado procesando y pasaba el timeout, gunicorn lo mataba

### Solución
Aumentar el timeout de gunicorn a 120 segundos.

**Archivo:** `backend/Dockerfile`
```dockerfile
# Antes
CMD ["gunicorn", "app.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000"]

# Después
CMD ["gunicorn", "app.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "--timeout", "120"]
```

### Commits relacionados
- `79b6e29` - Fix: aumentar timeout de gunicorn a 120s para consultas RAG

---

## INC-003: Visor de páginas falla intermitentemente

**Fecha:** 2026-01-07
**Severidad:** Media
**Estado:** Resuelto

### Síntomas
- Al hacer clic en una referencia de página, aparecía "No se pudo cargar la página"
- El error era intermitente - a veces funcionaba, a veces no
- En logs de nginx: status 499

### Diagnóstico
- El navegador cancelaba la petición de imagen antes de que llegara
- Posiblemente relacionado con HTTP/2 stream issues
- También podía ser cache del navegador corrupto

### Solución
Agregar funcionalidad de retry con cache bypass.

**Archivo:** `frontend/src/components/PageViewerModal.tsx`
```tsx
const [retryCount, setRetryCount] = useState(0)

// Query parameter para forzar recarga
const imageUrl = `${API_URL}/api/pages/${manualId}/${pageNumber}${retryCount > 0 ? `?retry=${retryCount}` : ''}`

// Reset al abrir modal
useEffect(() => {
  if (isOpen) {
    setRetryCount(0)
    // ...
  }
}, [isOpen, ...])

// Botón de retry incrementa contador
onClick={() => {
  setRetryCount(c => c + 1)
}}
```

### Commits relacionados
- `a23aed4` - Fix: visor de páginas con retry para evitar errores de carga

---

## INC-004: Dropdown de manuales no muestra todos los items

**Fecha:** 2026-01-07
**Severidad:** Baja
**Estado:** Resuelto

### Síntomas
- El dropdown de selección de manual solo mostraba 5 manuales
- Había 8 manuales cargados en el sistema
- Los otros 3 estaban ocultos por scroll

### Diagnóstico
- El CSS `max-h-60` limitaba la altura a ~240px
- No era suficiente para mostrar todos los manuales

### Solución
Aumentar la altura máxima del dropdown a 70% del viewport.

**Archivo:** `frontend/src/components/ManualSelector.tsx`
```tsx
// Antes
<ul className="... max-h-60 overflow-y-auto">

// Después
<ul className="... max-h-[70vh] overflow-y-auto">
```

### Commits relacionados
- (Incluido en commits anteriores de la sesión)

---

## INC-005: Chat timeout del frontend muy corto

**Fecha:** 2026-01-07
**Severidad:** Media
**Estado:** Resuelto

### Síntomas
- El chat mostraba error de timeout antes de que el servidor terminara
- Mensaje: "La consulta tardó demasiado"

### Diagnóstico
- El fetch del browser no tiene timeout por defecto
- Se necesitaba un AbortController con timeout adecuado
- Las consultas RAG pueden tardar hasta 30 segundos normalmente

### Solución
Agregar AbortController con timeout de 120 segundos.

**Archivo:** `frontend/src/lib/api.ts`
```typescript
export async function sendMessage(question: string, manualId: string): Promise<ChatResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000) // 120 segundos

  try {
    const response = await fetch(`${API_URL}/api/chat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, manual_id: manualId }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    // ...
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('La consulta tardó demasiado. Intenta con una pregunta más específica.')
    }
    throw error
  }
}
```

### Commits relacionados
- (Incluido en commits anteriores de la sesión)

---

## Configuración de Nginx Optimizada

Después de todos los fixes, la configuración de nginx para el backend quedó así:

```nginx
upstream backend {
    server backend:8000;
    keepalive 32;
    keepalive_timeout 120s;
}

location /api {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    # Timeouts para consultas RAG que tardan
    proxy_connect_timeout 60s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;

    # Desactivar buffering para requests largos
    proxy_buffering off;
    proxy_request_buffering off;
}
```

---

## Lecciones Aprendidas

1. **HTTP/2 y requests largos no se llevan bien** - Para aplicaciones con requests que tardan más de 15-20 segundos, considerar usar HTTP/1.1 o implementar streaming.

2. **Timeouts deben ser consistentes** - El timeout debe configurarse en toda la cadena: frontend → nginx → gunicorn → aplicación.

3. **Siempre tener retry/fallback** - Para operaciones que pueden fallar intermitentemente, implementar mecanismos de retry mejora mucho la UX.

4. **Los logs de nginx son tu amigo** - El status 499 indica que el cliente cerró la conexión, lo cual ayuda a distinguir entre problemas del servidor vs cliente.

5. **Probar en producción con herramientas de debug** - El panel de Network de Chrome DevTools fue crucial para diagnosticar estos problemas.

---

## Monitoreo Recomendado

Para detectar estos problemas tempranamente en el futuro:

1. **Alertas en status 499/502** - Configurar alertas si hay muchos errores 499 o 502
2. **Monitorear latencia de /api/chat/** - Alertar si el p95 supera 60 segundos
3. **Logs de gunicorn** - Monitorear mensajes de WORKER TIMEOUT
4. **Health checks** - El endpoint `/api/health` debe responder en < 1 segundo

---

*Última actualización: 2026-01-07*
