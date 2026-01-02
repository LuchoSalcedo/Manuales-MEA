import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Cargar variables de entorno desde la raíz del proyecto
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Configuración de Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL y SUPABASE_ANON_KEY deben estar configurados en .env")
    exit(1)

# Conectar a Supabase
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
print(f"Conectado a: {SUPABASE_URL}")

# Consultar tabla manuals
try:
    response = supabase.table("manuals").select("*").limit(10).execute()
    print(f"\nRegistros encontrados: {len(response.data)}")
    for manual in response.data:
        print(f"  - {manual}")
except Exception as e:
    print(f"Error al consultar: {e}")
