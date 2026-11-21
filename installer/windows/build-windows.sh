#!/usr/bin/env bash
# Gera o instalador do Codeniac para Windows (precisa de: makensis, python3, zip e o node.exe do Windows).
# Uso: installer/windows/build-windows.sh /caminho/para/node.exe /pasta/de/saida
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NODE_EXE="${1:?informe o caminho do node.exe (win-x64)}"
OUT="${2:-$ROOT/dist}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
WORK="$(mktemp -d)"
trap 'rm -rf -- "$WORK"' EXIT
APP="$WORK/app"
mkdir -p "$APP/node" "$OUT"

# 1) programa
cp -r "$ROOT/server" "$APP/"
cp "$ROOT/package.json" "$APP/"
# public e node_modules têm milhares de arquivos: vão em zips (sem compressão, para extrair rápido) e o instalador os extrai.
# Isso também contorna o limite do compilador NSIS com muitos arquivos numa mesma pasta.
(cd "$ROOT/public" && zip -q -0 -r "$APP/payload-public.zip" .)
(cd "$ROOT" && zip -q -0 -r "$APP/payload-node_modules.zip" node_modules)
cp "$NODE_EXE" "$APP/node/node.exe"
cp "$HERE/codeniac.ico" "$APP/"
python3 "$HERE/vbs-ascii.py" "$HERE/Codeniac.vbs" "$APP/Codeniac.vbs"
python3 "$HERE/vbs-ascii.py" "$HERE/Parar Codeniac.vbs" "$APP/Parar Codeniac.vbs"
sed 's/$/\r/' "$HERE/LEIA-ME.txt" | sed '1s/^/\xEF\xBB\xBF/' > "$APP/LEIA-ME.txt"

# 2) lançadores .exe (abrem o .vbs sem janela)
cp "$HERE/launcher.nsi" "$HERE/codeniac.ico" "$WORK/"
(cd "$WORK" && makensis -V2 -DOUT=Codeniac.exe -DSCRIPT=Codeniac.vbs launcher.nsi && makensis -V2 "-DOUT=Parar Codeniac.exe" "-DSCRIPT=Parar Codeniac.vbs" launcher.nsi)
mv "$WORK/Codeniac.exe" "$WORK/Parar Codeniac.exe" "$APP/"

# 3) instalador
cp "$HERE/codeniac.nsi" "$WORK/"
(cd "$WORK" && makensis -V2 "-DOUTFILE=$OUT/Codeniac-Setup-$VERSION.exe" codeniac.nsi)

# 4) zips: instalador e versão portátil
(cd "$OUT" && rm -f "Codeniac-Instalador-$VERSION.zip" && zip -q -9 "Codeniac-Instalador-$VERSION.zip" "Codeniac-Setup-$VERSION.exe")
(cd "$WORK" && mv app Codeniac && unzip -q "Codeniac/payload-public.zip" -d Codeniac/public && unzip -q "Codeniac/payload-node_modules.zip" -d Codeniac && rm -f Codeniac/payload-*.zip && rm -f "$OUT/Codeniac-Portatil-$VERSION.zip" && zip -q -r -9 "$OUT/Codeniac-Portatil-$VERSION.zip" Codeniac)
ls -la "$OUT"
