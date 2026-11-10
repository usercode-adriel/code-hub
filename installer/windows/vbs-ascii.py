#!/usr/bin/env python3
"""Converte um .vbs em UTF-8 para ASCII puro: letras acentuadas dentro de strings viram ChrW(n).
O Windows Script Host lê .vbs como ANSI; assim os acentos aparecem certos em qualquer Windows."""
import re
import sys

def convert_line(line):
    if line.lstrip().startswith("'"):
        return line.encode('ascii', 'ignore').decode()  # comentário: só remove acentos
    out, i = [], 0
    while i < len(line):
        c = line[i]
        if c == '"':
            j = i + 1
            buf = ''
            while j < len(line):
                if line[j] == '"' and j + 1 < len(line) and line[j + 1] == '"':
                    buf += '""'; j += 2; continue
                if line[j] == '"':
                    break
                buf += line[j]; j += 1
            parts, cur = [], ''
            for ch in buf:
                if ord(ch) < 128:
                    cur += ch
                else:
                    parts.append(f'"{cur}"' if cur else None)
                    parts.append(f'ChrW({ord(ch)})')
                    cur = ''
            parts.append(f'"{cur}"' if cur or not parts else None)
            out.append(' & '.join(p for p in parts if p) if any(p and p.startswith('ChrW') for p in parts) else f'"{buf}"')
            i = j + 1
        elif c == "'":
            out.append(line[i:].encode('ascii', 'ignore').decode()); break
        else:
            out.append(c); i += 1
    return ''.join(out)

src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8').read().replace('\r\n', '\n')
res = '\r\n'.join(convert_line(l) for l in text.split('\n'))
res.encode('ascii')
open(dst, 'w', encoding='ascii', newline='').write(res)
