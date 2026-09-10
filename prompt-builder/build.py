#!/usr/bin/env python3
"""Genera lo derivado a partir de un único origen.

    python3 build.py

Entradas:  prompts-semilla.json, Index.html, Estilos.html, App.html, preview/mock.html
Salidas:   Semilla.gs                          (la biblioteca de prompts para Apps Script)
           preview/asistente-prompts.html      (la app entera con backend falso)

Así los 24 prompts viven en un solo sitio y no hay dos copias que se desincronicen.
"""
import json
import pathlib
import re
import sys

BASE = pathlib.Path(__file__).parent
COLUMNAS = ["activo", "categoria", "nombre", "descripcion", "destino", "plantilla", "orden"]


def leer(nombre: str) -> str:
    return (BASE / nombre).read_text(encoding="utf-8")


def semilla() -> list:
    return json.loads(leer("prompts-semilla.json"))


def generar_gs(prompts: list) -> None:
    filas = []
    for x in prompts:
        valores = []
        for col in COLUMNAS:
            v = x.get(col, "")
            valores.append("true" if v is True else "false" if v is False else json.dumps(v, ensure_ascii=False))
        filas.append("    [" + ", ".join(valores) + "]")

    destino = BASE / "Semilla.gs"
    destino.write_text(
        "/**\n"
        " * GENERADO POR build.py — no editar a mano.\n"
        " * El origen es prompts-semilla.json. Cambia ahí y vuelve a ejecutar build.py.\n"
        f" * Columnas: {', '.join(COLUMNAS)}\n"
        " */\n\n"
        "function plantillasDeEjemplo() {\n"
        "  return [\n" + ",\n".join(filas) + "\n  ];\n}\n",
        encoding="utf-8",
    )
    print(f"Semilla.gs — {len(prompts)} prompts")


def generar_preview(prompts: list) -> int:
    index = leer("Index.html")
    cuerpo = re.search(r"<body>(.*?)</body>", index, re.S)
    if not cuerpo:
        print("No encuentro <body> en Index.html", file=sys.stderr)
        return 1

    markup = re.sub(r"<\?!=.*?\?>", "", cuerpo.group(1), flags=re.S)

    datos = []
    for i, x in enumerate(prompts):
        if not x.get("activo", True):
            continue
        datos.append({
            "id": f"p{i + 1}",
            "categoria": x["categoria"],
            "nombre": x["nombre"],
            "descripcion": x["descripcion"],
            "destino": x["destino"],
            "plantilla": x["plantilla"],
            "orden": x["orden"],
        })

    inyectado = "<script>window.SEMILLA = " + json.dumps(datos, ensure_ascii=False) + ";</script>"

    partes = [
        "<title>Asistente de Prompts</title>",
        leer("Estilos.html").strip(),
        markup.strip(),
        inyectado,
        leer("preview/mock.html").strip(),
        leer("App.html").strip(),
    ]

    destino = BASE / "preview" / "asistente-prompts.html"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text("\n\n".join(partes) + "\n", encoding="utf-8")
    print(f"preview/asistente-prompts.html — {destino.stat().st_size // 1024} KB")
    return 0


def main() -> int:
    prompts = semilla()
    generar_gs(prompts)
    return generar_preview(prompts)


if __name__ == "__main__":
    raise SystemExit(main())
