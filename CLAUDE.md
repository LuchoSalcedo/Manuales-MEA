# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sistema de gestión de manuales GSE con procesamiento de PDFs mediante IA.

## Project Structure

```
/backend    - API REST con FastAPI
/frontend   - Aplicación web con Next.js
/scripts    - Scripts de procesamiento de PDFs
/venv       - Entorno virtual Python
```

## Setup Commands

```bash
# Activar entorno virtual
source venv/bin/activate

# Instalar dependencias Python
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env

# Ejecutar backend (desde /backend)
uvicorn main:app --reload --port 8000

# Ejecutar frontend (desde /frontend)
npm run dev
```

## Environment

- Python 3.13
- Node.js (para frontend Next.js)
- Supabase (base de datos y autenticación)

## Key Dependencies

- **FastAPI**: Framework backend
- **Supabase**: Base de datos PostgreSQL, autenticación y storage
- **pypdf2, pdfplumber, pymupdf**: Procesamiento de PDFs
- **OpenAI/Anthropic + LangChain**: Procesamiento con IA
- **ChromaDB**: Base de datos vectorial para búsqueda semántica
