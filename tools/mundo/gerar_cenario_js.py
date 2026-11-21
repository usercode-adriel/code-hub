"""Gera public/js/drive/cenario.js a partir de public/assets/mundo/cenario.json (tamanho de cada peça)."""
import json
m = json.load(open('public/assets/mundo/cenario.json'))
linhas = ',\n  '.join(f"'{k}': [{w}, {h}]" for k, (w, h) in m.items())
open('public/js/drive/cenario.js', 'w').write(f"""// CENÁRIO NOVO (gerado por tools/mundo/gerar_cenario_js.py — não editar à mão): [largura, altura] em pixels da arte
// de cada peça em public/assets/mundo/<pasta>/<nome>.png.
export const PECA = {{
  {linhas},
}};
""")
print('cenario.js', len(m))
