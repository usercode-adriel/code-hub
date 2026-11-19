# Recorta os prédios das folhas "Buildings, Shops & Commercials" e "City Buildings & Commercial Structures"
# (fundo preto removido) e gera, para cada um, a camada de janelas acesas usada à noite.
import numpy as np, json, sys
from PIL import Image
from collections import deque
U=sys.argv[1] if len(sys.argv)>1 else '/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/'
OUT='/home/user/code-hub/public/assets/rpg/bld/'
A={'res-a1':(18,130,137,298),'res-a2':(156,133,264,298),'res-a3':(282,127,388,298),'res-a4':(403,124,515,298),
 'shop':(547,140,645,298),'food':(657,140,746,298),'cafe':(760,132,852,298),'market':(866,123,963,298),
 'bank':(997,140,1113,298),'hospital':(1128,130,1243,298),'police':(1256,125,1372,298),'fire':(1385,110,1521,298),
 'supermarket':(15,355,184,509),'garage':(198,358,325,509),'gym':(340,347,460,509),'cinema':(474,346,617,509),
 'burger':(647,365,753,509),'pizza':(766,365,866,509),'diner':(877,350,980,509),'bar':(993,345,1082,509),
 'gas':(1110,366,1308,509),'busterminal':(1322,348,1522,509),
 'warehouse-blue':(20,570,190,731),'warehouse-brick':(204,560,394,731),'silos':(408,548,531,731),'loading':(545,556,717,731),
 'hotel':(751,562,942,731),'office':(960,550,1119,731),'mall':(1130,550,1321,731),'cityhall':(1335,550,1523,731)}
B={'house':(20,208,108,333),'house-blue':(122,198,195,333),'apt-beige':(212,178,291,333),'apt-green':(300,162,393,333),'apt-brick':(409,153,503,333),
 'tower-beige':(520,120,618,333),'tower-glass':(630,120,711,333),'tower-heli':(722,78,787,333),
 'diner2':(826,190,908,338),'bar2':(922,188,1021,338),'hotel-tall':(1030,138,1137,338),'office2':(1150,158,1263,338),'bank2':(1276,162,1387,338),'tower-glass2':(1400,92,1521,338),
 'store247':(20,405,120,553),'grocery':(135,403,235,553),'pharmacy':(249,405,343,553),'pizza2':(357,405,441,553),'burger2':(455,405,542,553),'video':(557,405,651,553),'fashion':(667,403,768,553),'autoparts':(785,403,890,553),
 'factory':(922,402,1082,567),'industrial':(1090,408,1271,567),'ind-blue':(1286,405,1409,567),'cooling':(1420,360,1523,567),
 'police2':(14,620,151,775),'fire2':(160,618,299,775),'hospital2':(310,607,467,775),'courthouse':(474,620,605,775),'school':(612,613,761,775),
 'stadium':(784,640,969,777),'airport':(980,625,1146,777),'mall2':(1153,636,1319,779),'casino':(1330,625,1523,779)}
def knock(c):
    a=np.asarray(c.convert('RGBA')).copy(); H,W=a.shape[:2]; seen=np.zeros((H,W),bool)
    q=deque([(x,0) for x in range(W)]+[(x,H-1) for x in range(W)]+[(0,y) for y in range(H)]+[(W-1,y) for y in range(H)])
    while q:
        x,y=q.popleft()
        if x<0 or y<0 or x>=W or y>=H or seen[y,x]: continue
        seen[y,x]=True
        if int(a[y,x,0])+int(a[y,x,1])+int(a[y,x,2])<75: a[y,x,3]=0; q.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
    im=Image.fromarray(a); bb=im.getbbox(); return im.crop(bb)
meta={}
for sheet,tbl in [('863e8de0-image.png',A),('9c1cf738-image.png',B)]:
    src=Image.open(U+sheet).convert('RGB')
    for k,r in tbl.items():
        im=knock(src.crop(r)); im.save(OUT+k+'.png',optimize=True)
        a=np.asarray(im).astype(int); r_,g,b,al=a[...,0],a[...,1],a[...,2],a[...,3]
        glass=(al>0)&(b>r_+35)&(b>110)&(g>60)    # vidro azul das janelas
        lit=np.zeros_like(a); lit[glass]=[255,214,130,235]
        Image.fromarray(lit.astype(np.uint8)).save(OUT+k+'-lit.png',optimize=True)
        meta[k]=[im.width,im.height]
json.dump(meta,open(OUT+'meta.json','w'),separators=(',',':'))
open('/home/user/code-hub/public/js/drive/bldmeta.js','w').write('// tamanhos (largura, altura) dos sprites de prédios em public/assets/rpg/bld — gerado por tools/drive/buildings.py\nexport const BLD = '+json.dumps(meta,separators=(',',':'))+';\n')
print(len(meta))
