#!/usr/bin/env python3
"""Genera la vista previa navegable a partir de los mismos archivos que usa Apps Script.

    python3 build-preview.py

Produce preview/asistente-prompts.html: el HTML real de la app con un backend
falso (preview/mock.html) en lugar de google.script.run. Sin etiquetas
<html>/<head>/<body>, para poder publicarlo como Artifact.
"""
import pathlib
import re
import sys

BASE = pathlib.Path(__file__).parent
SALIDA = BASE / "preview" / "asistente-prompts.html"


def leer(nombre: str) -> str:
    return (BASE / nombre).read_text(encoding="utf-8")


def main() -> int:
    index = leer("Index.html")

    cuerpo = re.search(r"<body>(.*?)</body>", index, re.S)
    if not cuerpo:
        print("No encuentro <body> en Index.html", file=sys.stderr)
        return 1

    markup = cuerpo.group(1)
    markup = re.sub(r"<\?!=\s*include\('App'\);\s*\?>", "", markup)
    markup = re.sub(r"<\?!=.*?\?>", "", markup, flags=re.S)

    partes = [
        "<title>Asistente de Prompts</title>",
        leer("Estilos.html").strip(),
        markup.strip(),
        leer("preview/mock.html").strip(),
        leer("App.html").strip(),
    ]

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text("\n\n".join(partes) + "\n", encoding="utf-8")
    print(f"Escrito {SALIDA} ({SALIDA.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
