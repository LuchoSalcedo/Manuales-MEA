#!/usr/bin/env python3
"""
Benchmark de Modelos Anthropic para Chat RAG

Este script ejecuta un conjunto de preguntas de prueba contra los tres modelos
de Anthropic y genera un reporte comparativo con recomendaciones.

Uso:
    python scripts/benchmark_models.py

Requiere que el backend esté configurado con las credenciales de API.
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path
from uuid import UUID

# Agregar el directorio backend al path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.services.rag_service import get_rag_service


# Modelos a evaluar
MODELS = [
    {
        "id": "claude-3-5-haiku-20241022",
        "name": "Haiku 3.5",
        "input_cost_per_1m": 0.80,
        "output_cost_per_1m": 4.00,
    },
    {
        "id": "claude-sonnet-4-20250514",
        "name": "Sonnet 4",
        "input_cost_per_1m": 3.00,
        "output_cost_per_1m": 15.00,
    },
    {
        "id": "claude-opus-4-20250514",
        "name": "Opus 4",
        "input_cost_per_1m": 15.00,
        "output_cost_per_1m": 75.00,
    },
]


def calculate_cost(input_tokens: int, output_tokens: int, model_info: dict) -> float:
    """Calcula el costo en USD de una query."""
    input_cost = (input_tokens / 1_000_000) * model_info["input_cost_per_1m"]
    output_cost = (output_tokens / 1_000_000) * model_info["output_cost_per_1m"]
    return round(input_cost + output_cost, 6)


def load_questions(filepath: str) -> dict:
    """Carga las preguntas de prueba desde JSON."""
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def run_benchmark(questions_file: str, output_dir: str):
    """Ejecuta el benchmark completo."""
    print("=" * 60)
    print("BENCHMARK DE MODELOS ANTHROPIC")
    print("=" * 60)
    print()

    # Cargar preguntas
    data = load_questions(questions_file)
    manual_id = UUID(data["manual_id"])
    questions = data["questions"]

    print(f"Manual: {data.get('manual_name', manual_id)}")
    print(f"Preguntas: {len(questions)}")
    print(f"Modelos: {', '.join(m['name'] for m in MODELS)}")
    print()

    # Obtener servicio RAG
    rag_service = get_rag_service()

    # Resultados
    results = {
        "timestamp": datetime.now().isoformat(),
        "manual_id": str(manual_id),
        "manual_name": data.get("manual_name", ""),
        "models": [m["name"] for m in MODELS],
        "questions": [],
        "summary": {},
    }

    # Ejecutar cada pregunta contra cada modelo
    for q in questions:
        print(f"\n[{q['id']}] {q['category'].upper()}: {q['question'][:50]}...")

        question_result = {
            "id": q["id"],
            "category": q["category"],
            "question": q["question"],
            "description": q.get("description", ""),
            "responses": [],
        }

        for model_info in MODELS:
            model_id = model_info["id"]
            model_name = model_info["name"]

            print(f"  - {model_name}...", end=" ", flush=True)

            try:
                response, metrics = rag_service.query_with_model(
                    question=q["question"],
                    manual_id=manual_id,
                    model=model_id
                )

                cost = calculate_cost(
                    metrics["input_tokens"],
                    metrics["output_tokens"],
                    model_info
                )

                result = {
                    "model": model_name,
                    "model_id": model_id,
                    "answer": response.answer,
                    "references": [
                        {"page": r.page_number, "section": r.section}
                        for r in response.references
                    ],
                    "metrics": {
                        **metrics,
                        "cost_usd": cost,
                    },
                }

                question_result["responses"].append(result)
                print(f"{metrics['latency_ms']}ms, ${cost:.4f}")

            except Exception as e:
                print(f"ERROR: {e}")
                question_result["responses"].append({
                    "model": model_name,
                    "model_id": model_id,
                    "error": str(e),
                })

        results["questions"].append(question_result)

    # Calcular estadísticas
    print("\n" + "=" * 60)
    print("CALCULANDO ESTADÍSTICAS...")
    print("=" * 60)

    summary = calculate_summary(results)
    results["summary"] = summary

    # Guardar resultados
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results_file = Path(output_dir) / f"benchmark_{timestamp}.json"
    summary_file = Path(output_dir) / f"summary_{timestamp}.md"

    with open(results_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    generate_markdown_report(results, summary_file)

    print(f"\nResultados guardados en:")
    print(f"  - {results_file}")
    print(f"  - {summary_file}")

    # Imprimir resumen
    print_summary(summary)


def calculate_summary(results: dict) -> dict:
    """Calcula estadísticas agregadas por modelo y categoría."""
    summary = {
        "by_model": {},
        "by_category": {},
        "by_model_category": {},
    }

    # Inicializar estructuras
    for model in results["models"]:
        summary["by_model"][model] = {
            "total_queries": 0,
            "total_latency_ms": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_cost_usd": 0,
            "errors": 0,
        }

    categories = set(q["category"] for q in results["questions"])
    for cat in categories:
        summary["by_category"][cat] = {}
        for model in results["models"]:
            summary["by_category"][cat][model] = {
                "queries": 0,
                "avg_latency_ms": 0,
                "total_latency_ms": 0,
                "avg_cost_usd": 0,
                "total_cost_usd": 0,
            }

    # Agregar datos
    for question in results["questions"]:
        category = question["category"]
        for response in question["responses"]:
            model = response["model"]
            if "error" in response:
                summary["by_model"][model]["errors"] += 1
                continue

            metrics = response["metrics"]
            cost = metrics.get("cost_usd", 0)

            # Por modelo
            summary["by_model"][model]["total_queries"] += 1
            summary["by_model"][model]["total_latency_ms"] += metrics.get("latency_ms", 0)
            summary["by_model"][model]["total_input_tokens"] += metrics.get("input_tokens", 0)
            summary["by_model"][model]["total_output_tokens"] += metrics.get("output_tokens", 0)
            summary["by_model"][model]["total_cost_usd"] += cost

            # Por categoría y modelo
            summary["by_category"][category][model]["queries"] += 1
            summary["by_category"][category][model]["total_latency_ms"] += metrics.get("latency_ms", 0)
            summary["by_category"][category][model]["total_cost_usd"] += cost

    # Calcular promedios
    for model, data in summary["by_model"].items():
        if data["total_queries"] > 0:
            data["avg_latency_ms"] = data["total_latency_ms"] // data["total_queries"]
            data["avg_cost_usd"] = round(data["total_cost_usd"] / data["total_queries"], 6)

    for cat, models in summary["by_category"].items():
        for model, data in models.items():
            if data["queries"] > 0:
                data["avg_latency_ms"] = data["total_latency_ms"] // data["queries"]
                data["avg_cost_usd"] = round(data["total_cost_usd"] / data["queries"], 6)

    return summary


def generate_markdown_report(results: dict, filepath: Path):
    """Genera un reporte en Markdown."""
    summary = results["summary"]

    lines = [
        "# Benchmark de Modelos Anthropic - Manuales MEA",
        "",
        f"**Fecha:** {results['timestamp']}",
        f"**Manual:** {results.get('manual_name', results['manual_id'])}",
        f"**Total preguntas:** {len(results['questions'])}",
        "",
        "---",
        "",
        "## Resumen Ejecutivo",
        "",
        "| Modelo | Tiempo Prom | Costo Prom | Total Costo | Queries |",
        "|--------|-------------|------------|-------------|---------|",
    ]

    for model in results["models"]:
        data = summary["by_model"].get(model, {})
        avg_latency = data.get("avg_latency_ms", 0) / 1000  # a segundos
        avg_cost = data.get("avg_cost_usd", 0)
        total_cost = data.get("total_cost_usd", 0)
        queries = data.get("total_queries", 0)
        lines.append(f"| {model} | {avg_latency:.1f}s | ${avg_cost:.4f} | ${total_cost:.4f} | {queries} |")

    lines.extend([
        "",
        "---",
        "",
        "## Por Categoría",
        "",
    ])

    for category in summary["by_category"]:
        lines.append(f"### {category.capitalize()}")
        lines.append("")
        lines.append("| Modelo | Tiempo Prom | Costo Prom |")
        lines.append("|--------|-------------|------------|")

        for model in results["models"]:
            data = summary["by_category"][category].get(model, {})
            avg_latency = data.get("avg_latency_ms", 0) / 1000
            avg_cost = data.get("avg_cost_usd", 0)
            lines.append(f"| {model} | {avg_latency:.1f}s | ${avg_cost:.4f} |")

        lines.append("")

    # Recomendaciones
    lines.extend([
        "---",
        "",
        "## Recomendaciones",
        "",
        "Basado en los resultados del benchmark:",
        "",
    ])

    # Encontrar modelo más económico y más rápido
    models_data = summary["by_model"]
    if models_data:
        cheapest = min(models_data.items(), key=lambda x: x[1].get("avg_cost_usd", float("inf")))
        fastest = min(models_data.items(), key=lambda x: x[1].get("avg_latency_ms", float("inf")))

        lines.append(f"- **Más económico:** {cheapest[0]} (${cheapest[1].get('avg_cost_usd', 0):.4f}/query)")
        lines.append(f"- **Más rápido:** {fastest[0]} ({fastest[1].get('avg_latency_ms', 0)/1000:.1f}s/query)")
        lines.append("")
        lines.append("### Uso sugerido:")
        lines.append("")
        lines.append("- **Preguntas directas (simples):** Usar Haiku - suficiente calidad, más económico")
        lines.append("- **Preguntas sobre ilustraciones:** Usar Sonnet - mejor interpretación visual")
        lines.append("- **Preguntas complejas (troubleshooting, procedimientos largos):** Evaluar respuestas - si Sonnet es suficiente, evitar Opus")
        lines.append("")
        lines.append("> **Nota:** Revisa las respuestas en el archivo JSON para evaluar calidad manualmente.")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def print_summary(summary: dict):
    """Imprime resumen en consola."""
    print("\n" + "=" * 60)
    print("RESUMEN")
    print("=" * 60)

    print("\nPor Modelo:")
    print("-" * 50)
    print(f"{'Modelo':<15} {'Tiempo':<10} {'Costo/Q':<12} {'Total':<10}")
    print("-" * 50)

    for model, data in summary["by_model"].items():
        avg_latency = data.get("avg_latency_ms", 0) / 1000
        avg_cost = data.get("avg_cost_usd", 0)
        total_cost = data.get("total_cost_usd", 0)
        print(f"{model:<15} {avg_latency:.1f}s{'':<5} ${avg_cost:.4f}{'':<4} ${total_cost:.4f}")

    print("\nPor Categoría:")
    print("-" * 50)

    for category, models in summary["by_category"].items():
        print(f"\n  {category.upper()}:")
        for model, data in models.items():
            avg_latency = data.get("avg_latency_ms", 0) / 1000
            avg_cost = data.get("avg_cost_usd", 0)
            print(f"    {model:<12}: {avg_latency:.1f}s, ${avg_cost:.4f}")


if __name__ == "__main__":
    script_dir = Path(__file__).parent
    questions_file = script_dir / "benchmark_questions.json"
    output_dir = script_dir / "benchmark_results"

    if not questions_file.exists():
        print(f"Error: No se encontró {questions_file}")
        sys.exit(1)

    output_dir.mkdir(exist_ok=True)

    run_benchmark(str(questions_file), str(output_dir))
