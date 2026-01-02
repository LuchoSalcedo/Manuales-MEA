const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Manual {
  id: string
  name: string
  description: string | null
  equipment_type: string | null
  total_pages: number | null
  processed: boolean
  created_at: string | null
}

export interface ChunkReference {
  page_number: number
  section: string | null
  similarity: number
  excerpt: string
}

export interface ChatResponse {
  answer: string
  references: ChunkReference[]
  manual_id: string
}

export async function getManuals(): Promise<Manual[]> {
  const response = await fetch(`${API_URL}/api/manuals/`)
  if (!response.ok) {
    throw new Error('Error al obtener manuales')
  }
  return response.json()
}

export async function sendMessage(
  question: string,
  manualId: string
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/api/chat/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question,
      manual_id: manualId,
    }),
  })

  if (!response.ok) {
    throw new Error('Error al enviar mensaje')
  }

  return response.json()
}
