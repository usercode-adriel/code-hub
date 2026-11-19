# Recorta a folha "City Decorations & Details" (sem marca d'água). O outdoor com marca registrada fica de fora.
from PIL import Image
import numpy as np, json
from collections import deque
U='/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/'
OUT='/home/user/code-hub/public/assets/rpg/deco/'
R={'arvore':(16,120,152,332),'coqueiro':(168,116,302,336),'arvore-vaso':(306,176,402,314),'arvore-vaso2':(414,178,504,314),
 'flores-v':(522,176,626,248),'flores-b':(644,176,736,248),'flores-a':(746,168,830,248),'arbusto-c':(844,164,912,236),'arbusto-c2':(930,160,1004,236),'arbusto-vaso':(1032,196,1094,258),
 'banco':(518,262,666,336),'banco2':(682,262,814,336),'lixeira-verde':(848,256,906,338),'lixeira-cinza':(934,256,992,338),'correio-azul':(1018,262,1066,336),'correio-vermelho':(1082,262,1128,336),
 'poste-duplo':(1128,130,1216,328),'poste':(1236,124,1290,334),'poste-triplo':(1300,122,1406,336),'poste-madeira':(1412,110,1518,340),
 'grade':(22,364,150,470),'grade2':(170,364,282,470),'cerca':(294,370,440,468),'barreira':(452,370,592,456),'cone':(594,376,658,466),'cavalete':(662,370,770,470),'tambor':(780,380,836,466),
 'hidrante':(852,356,944,488),'banca-jornal':(966,356,1040,508),'telefone':(1074,356,1162,522),'ponto-onibus':(1188,362,1416,520),'placa-onibus':(1442,356,1514,514),
 'placa-direcao':(26,512,220,694),'placa-hotel':(552,508,630,694),'placa-bar':(644,508,736,694),'placa-motel':(742,508,828,694),
 'placa-p':(844,558,928,690),'placa-proibido':(954,558,1052,690),'placa-50':(1080,552,1162,690),'placa-pare':(1192,560,1292,690),'placa-pedestre':(1310,548,1432,690),'semaforo':(1460,542,1514,690),
 'maq-bebida':(24,838,110,988),'maq-lanche':(128,838,206,986),'orelhao':(242,842,312,984),'quiosque':(338,838,466,982),'feira':(490,836,626,986),'guarita':(648,848,766,988),
 'caixa-luz':(780,854,866,976),'armario':(882,852,946,976),'armario2':(960,852,1040,976),'arbusto-vaso2':(1056,852,1150,976),'caixotes':(1176,854,1246,978),'pneus':(1268,876,1330,966),'barril':(1370,856,1440,972),'cavalete2':(1440,852,1518,958)}
TILES={'faixa-pedestre':(26,708,190,808),'boeiro':(780,890,900,1000),'grade-rua':(34,888,158,1000)}
def knock(c):
    a=np.asarray(c.convert('RGBA')).copy(); H,W=a.shape[:2]; seen=np.zeros((H,W),bool)
    q=deque([(x,0) for x in range(W)]+[(x,H-1) for x in range(W)]+[(0,y) for y in range(H)]+[(W-1,y) for y in range(H)])
    while q:
        x,y=q.popleft()
        if x<0 or y<0 or x>=W or y>=H or seen[y,x]: continue
        seen[y,x]=True
        if int(a[y,x,0])+int(a[y,x,1])+int(a[y,x,2])<70: a[y,x,3]=0; q.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
    im=Image.fromarray(a); bb=im.getbbox(); return im.crop(bb)
meta={}
src=Image.open(U+'a104dc45-image.png').convert('RGB')
for k,r in R.items(): im=knock(src.crop(r)); im.save(OUT+k+'.png',optimize=True); meta[k]=[im.width,im.height]
src2=Image.open(U+'4de5e5eb-image.png').convert('RGB')
for k,r in TILES.items():
    s=src if k=='faixa-pedestre' else src2
    im=knock(s.crop(r)); im.save(OUT+k+'.png',optimize=True); meta[k]=[im.width,im.height]
json.dump(meta,open(OUT+'meta.json','w'),separators=(',',':'))
open('/home/user/code-hub/public/js/drive/decometa.js','w').write('// tamanhos dos sprites de public/assets/rpg/deco — gerado por tools/drive/deco.py\nexport const DECO = '+json.dumps(meta,separators=(',',':'))+';\n')
print(len(meta))
