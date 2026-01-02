# Proyecto: Sistema de Consulta de Manuales Técnicos GSE

## Resumen del Proyecto

Aplicación web para consultar manuales técnicos de equipos de ground handling en aeropuertos. Los usuarios pueden subir manuales en PDF (digitales o escaneados), y hacer preguntas sobre el contenido a través de un chat con IA.

**Requisito crítico:** Las respuestas deben ser altamente precisas porque los técnicos usarán esta información para mantenimiento de equipos. Errores pueden causar accidentes.

---

## Decisiones de Arquitectura

### Stack Tecnológico

| Componente | Tecnología | Razón |
|------------|------------|-------|
| Frontend | Next.js | React + routing + SSR integrado |
| Backend | FastAPI (Python) | Rápido, async, fácil de aprender |
| Auth | Supabase Auth | Simple, integrado con DB |
| Base de datos | Supabase PostgreSQL | Incluye pgvector para embeddings |
| OCR | Claude Vision API | Alta calidad, probado con manuales escaneados |
| Embeddings | OpenAI ada-002 | Estándar de industria |
| LLM para chat | Claude API | Mejor razonamiento |
| Storage PDFs | Supabase Storage | Todo en un lugar |

### ¿Por qué Supabase?
- Plataforma todo-en-uno (auth + database + vector + storage)
- Simplifica el desarrollo inicial
- Incluye pgvector para búsqueda de embeddings
- Tier gratuito suficiente para ~20 usuarios

### ¿Por qué Claude para OCR en lugar de Mistral?
- Probamos ambos. Claude Vision extrae texto con alta precisión
- El OCR original del PDF de Hobart tenía errores como `@asic&nerqtsr` en lugar de "Basic Generator"
- Claude extrajo el texto perfectamente, incluyendo tablas de especificaciones

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│                    (React / Next.js)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Login     │  │  Selector   │  │      Chat Interface     │  │
│  │   Page      │  │  Manuales   │  │   (pregunta/respuesta)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                 │
│                    (Python / FastAPI)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    Auth     │  │   Upload    │  │      RAG Engine         │  │
│  │   Service   │  │   Service   │  │  (búsqueda + respuesta) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │ Supabase  │   │  Supabase │   │  Claude   │
       │ PostgreSQL│   │  pgvector │   │    API    │
       └───────────┘   └───────────┘   └───────────┘
```

### Pipeline de Procesamiento de PDFs

```
PDF Upload → Extraer páginas como imágenes → OCR (Claude) → Chunking → Embeddings → Supabase pgvector
```

### Flujo del Chat (RAG)

```
Usuario pregunta → Embedding de pregunta → Buscar chunks similares (solo del manual seleccionado) → Enviar a Claude con contexto → Respuesta con cita de página
```

---

## Esquema de Base de Datos (Supabase)

### Tabla: profiles
- id (uuid, PK, references auth.users)
- email (text)
- role (text: 'admin' | 'user')
- created_at (timestamp)

### Tabla: manuals
- id (uuid, PK)
- name (text)
- description (text)
- equipment_type (text)
- file_path (text)
- total_pages (integer)
- processed (boolean)
- created_at (timestamp)
- created_by (uuid, FK → profiles)

### Tabla: chunks
- id (uuid, PK)
- manual_id (uuid, FK → manuals)
- content (text)
- page_number (integer)
- section (text)
- embedding (vector(1536))
- created_at (timestamp)

---

## Progreso Actual

### ✅ Completado

1. **Indicador Global de Procesamiento** (Enero 2026)
   - `ProcessingProvider.tsx` - Contexto global para tracking de jobs
   - `ProcessingIndicator.tsx` - UI compacta en header durante procesamiento
   - Polling automático cada 2s cuando hay job activo
   - Visible en toda la app (navegar a Chat sin perder progreso)
   - Funciones: pause, resume, cancel desde cualquier página

2. **Panel de Administración Mejorado** (Enero 2026)
   - Gestión de usuarios: `/admin/users`
   - Upload de PDFs con progreso en tiempo real
   - Control de jobs: pausar, reanudar, cancelar
   - Lista de jobs pausados con opción de reanudar/cancelar
   - Backend con endpoints para gestión de processing jobs

3. **Mejoras al Sistema RAG** (Enero 2026)
   - `max_tokens` aumentado de 1024 a 4096 (respuestas más largas)
   - `rag_top_k` aumentado de 5 a 12 (más chunks recuperados)
   - `rag_similarity_threshold` bajado de 0.65 a 0.60 (mejor cobertura)
   - Prompt mejorado para respuestas completas con estructura del manual
   - Referencias muestran TODAS las páginas fuente usadas
   - Soporte para procedimientos multi-página

4. **Setup de Supabase**
   - Proyecto creado: "ManualesMEA"
   - Tablas creadas: profiles, manuals, chunks
   - Extensión pgvector habilitada
   - Row Level Security configurado

5. **Estructura del proyecto local**
   ```
   manuales-gse/
   ├── backend/
   ├── frontend/
   ├── scripts/
   ├── uploads/
   ├── venv/
   ├── .env
   ├── .env.example
   ├── requirements.txt
   └── CLAUDE.md
   ```

6. **Conexión a Supabase verificada**
   - Script de prueba ejecutado exitosamente

7. **Pipeline de OCR funcionando**
   - `scripts/process_pdf.py` creado y probado
   - Usa Claude Vision API para extraer texto
   - Soporta rango de páginas (--pages 25-30)
   - Genera JSON con estructura: {manual_name, pages: [{page_number, content, section}]}
   - Probado con manual Hobart (274 páginas) - calidad excelente

8. **Script de Chunking y Embeddings**
   - `scripts/generate_embeddings.py` creado
   - Lee JSON de process_pdf.py
   - Divide texto en chunks de ~800 tokens con 100 tokens de overlap
   - Genera embeddings con OpenAI ada-002
   - Guarda en tabla chunks de Supabase
   - Opciones: --manual-id, --create-manual, --dry-run
   - Probado con manual Hobart

9. **Backend FastAPI con Sistema RAG**
   - Estructura: `backend/app/` con config, models, services, api
   - `app/services/rag_service.py` - Pipeline RAG completo:
     - Genera embedding de pregunta (OpenAI ada-002)
     - Busca chunks similares (pgvector)
     - Genera respuesta con citas (Claude)
   - `app/api/chat.py` - Endpoint POST /api/chat/
   - `app/api/manuals.py` - Endpoints GET /api/manuals/
   - Función SQL `search_chunks` para búsqueda vectorial
   - Script de prueba: `scripts/test_rag.py`

10. **Frontend Next.js**
    - Proyecto configurado con TypeScript y Tailwind
    - Componentes: ManualSelector, Chat, ChatMessage, ChatInput
    - Integración con API backend
    - UI responsive con selector de manuales y chat
    - Puerto: http://localhost:3000

11. **Autenticación con Supabase Auth**
    - Página de login/registro: `/login`
    - AuthProvider con contexto global
    - Middleware para proteger rutas
    - Header con usuario y logout
    - Callback OAuth: `/auth/callback`

12. **Panel de Administración Base**
    - Página `/admin` para gestionar manuales
    - Upload de PDFs al servidor
    - Lista de manuales con opción de eliminar
    - Endpoint POST `/api/admin/upload`
    - Endpoint DELETE `/api/admin/manuals/{id}`
    - Navegación en Header (Chat / Admin)

### ⬜ Pendiente / Mejoras Futuras

1. **Ejecutar función SQL en Supabase** (opcional, hay fallback)
   - Archivo: `scripts/setup_supabase_functions.sql`
   - Mejora rendimiento de búsqueda vectorial

2. **Notificaciones toast** (opcional)
   - Mostrar toast al completar/error de procesamiento
   - Feedback visual más claro para acciones

3. **Historial de chat**
   - Guardar conversaciones por usuario/manual
   - Poder retomar conversaciones anteriores

---

## Variables de Entorno Necesarias

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# APIs de IA
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
MISTRAL_API_KEY=  # opcional, backup para OCR

# Backend
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
DEBUG=true

# Frontend
FRONTEND_URL=http://localhost:3000

# PDF Processing
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50
```

---

## Especificaciones del Producto

### Usuarios
- ~20 usuarios totales
- 2 roles: admin (sube manuales) y user (consulta)

### Manuales
- ~20 manuales de 300-400 páginas cada uno
- PDFs mixtos: digitales y escaneados
- Contenido: texto, tablas, diagramas con piezas numeradas

### Chat
- Un manual a la vez (no búsqueda cruzada)
- Respuestas deben incluir cita con número de página
- Precisión crítica (safety-critical)

### Ejemplo de uso
Usuario pregunta: "¿A qué voltaje se resetea el relay de sobrevoltaje?"
Sistema responde: "El relay de sobrevoltaje se resetea a 125V. (Ver página 27, sección Specifications and Capabilities)"

---

## Estado Actual

**Sistema en producción local.** Funcionalidades principales completas:
- ✅ Subida y procesamiento de PDFs con OCR (Claude Vision)
- ✅ Chat RAG con citas de páginas
- ✅ Autenticación con roles admin/user
- ✅ Panel admin para gestionar manuales y usuarios
- ✅ Indicador global de procesamiento visible en toda la app
- ✅ Control de jobs: pausar, reanudar, cancelar

**Para probar:**
```bash
# Backend
cd backend && source ../venv/bin/activate && uvicorn main:app --reload

# Frontend
cd frontend && npm run dev
```

---

## Notas Adicionales

- El manual de prueba es: HOBART 90G20P SPEC 5359C123 (274 páginas)
- Costo estimado de OCR para todos los manuales: ~$60 USD (6,000 páginas × $0.01)
- El proyecto se llama "ManualesMEA" en Supabase
