# Monta public/assets/rpg a partir das folhas de pixel art enviadas (fundo preto/painel removido).
import cv2, numpy as np, json, os
from PIL import Image
from collections import deque
U='/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/'
OUT='/home/user/code-hub/public/assets/rpg/'
for d in ['cars','air','fx','npc','props']: os.makedirs(OUT+d,exist_ok=True)
meta={}
def load(f): return Image.open(U+f).convert('RGBA')
S={k:load(v) for k,v in {'s1':'e1fa9d36-image.png','s2':'c1793cdb-image.png','s3':'2958a898-image.png','s4':'52c6a111-image.png','s5':'33308191-image.png','s6':'87fb08c8-image.png'}.items()}
B={k:json.load(open(k+'.json')) for k in ['s3','s4','s5']}
def knock(c, bgfn):
    a=np.asarray(c).copy(); H,W=a.shape[:2]; seen=np.zeros((H,W),bool)
    q=deque([(x,0) for x in range(W)]+[(x,H-1) for x in range(W)]+[(0,y) for y in range(H)]+[(W-1,y) for y in range(H)])
    while q:
        x,y=q.popleft()
        if x<0 or y<0 or x>=W or y>=H or seen[y,x]: continue
        seen[y,x]=True
        if bgfn(a[y,x]): a[y,x,3]=0; q.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
    out=Image.fromarray(a); bb=out.getbbox(); return out.crop(bb) if bb else out
blackbg=lambda p: int(p[0])+int(p[1])+int(p[2])<70
navybg=lambda p: int(p[0])<40 and 15<int(p[1])<60 and 15<int(p[2])<65 and abs(int(p[1])-int(p[2]))<18
def save(cat,name,img,maxside=None):
    if maxside and max(img.size)>maxside:
        s=maxside/max(img.size); img=img.resize((max(1,round(img.width*s)),max(1,round(img.height*s))),Image.LANCZOS)
    img.save(f'{OUT}{cat}/{name}.png',optimize=True); meta[f'{cat}/{name}']=[img.width,img.height]
def box(sheet,b,pad=2): x,y,w,h=b[:4]; return S[sheet].crop((x-pad,y-pad,x+w+pad,y+h+pad))
# ---- carros (s3 linha de cima) e caminhões
cars=['esportivo-vermelho','azul','verde','taxi','laranja','branco','preto','roxo','policia','ambulancia','bombeiros','suv-amarelo']
for i,n in zip(range(10,22),cars): save('cars',n,knock(box('s3',B['s3'][i]),blackbg),160)
trucks=['van-branca','jipe-verde','picape-azul','caminhao-branco','caminhao-vermelho','caminhao-azul','caminhao-verde','coleta','betoneira','guindaste','trator']
for i,n in zip(range(46,57),trucks): save('cars',n,knock(box('s3',B['s3'][i]),blackbg),200)
# ---- danificados (s4): fileira y 290-480, x<910, os 9 maiores em ordem
dm=[b for b in B['s4'] if 290<b[1]<330+60 and b[0]<910 and b[3]>110]; dm.sort(key=lambda b:b[0])
for b,n in zip(dm[:9],['esportivo-vermelho','azul','verde','taxi','laranja','branco','preto','roxo','policia']): save('cars',n+'-dmg',knock(box('s4',b),blackbg),160)
print('danificados',len(dm))
# ---- aviões e helicópteros (s3)
for i,n in zip([78,79,80,81,82],['mono-vermelho','mono-azul','mono-amarelo','mono-branco','mono-verde']): save('air',n,knock(box('s3',B['s3'][i]),blackbg),200)
for i,n in zip([83,84,85],['jato-cinza','jato-azul','jato-branco']): save('air',n,knock(box('s3',B['s3'][i]),blackbg),200)
for i,n in zip([88,116,117,115],['comercial','airliner-azul','airliner-vermelho','cargueiro']): save('air',n,knock(box('s3',B['s3'][i]),blackbg),320)
for i,n in zip([111,112,113,114],['heli-resgate','heli-policia','heli-amarelo','heli-verde']): save('air',n,knock(box('s3',B['s3'][i]),blackbg),220)
# ---- efeitos (s5): explosão linha 1 e 2, fogo linha 1, fumaça
def row(sheet,y0,y1,x0=0,x1=9999,minh=40):
    r=[b for b in B[sheet] if y0<=b[1]<=y1 and x0<=b[0]<=x1 and b[3]>=minh]; r.sort(key=lambda b:b[0]); return r
for k,b in enumerate(row('s5',55,95,0,780)[:5]): save('fx',f'exp{k}',knock(box('s5',b),blackbg),160)
for k,b in enumerate(row('s5',200,215,0,780)[:5]): save('fx',f'expf{k}',knock(box('s5',b),blackbg),160)
for k,b in enumerate(row('s5',55,95,800,1530)[:7]): save('fx',f'fogo{k}',knock(box('s5',b),blackbg),120)
for k,b in enumerate(row('s5',770,900,570,1010,50)[:6]): save('fx',f'fumaca{k}',knock(box('s5',b),blackbg),140)
# ---- NPCs (s6) por bandas
NB=json.load(open('npc_boxes.json'))
def npc(b): x0,y0,x1,y1=b; return knock(S['s6'].crop((x0-2,y0-2,x1+2,y1+2)),blackbg)
roles=[]
def addn(role,boxes):
    for b in boxes:
        n=f'{role}{sum(1 for r in roles if r[0]==role)}'; save('npc',n,npc(b),64); roles.append([role,n])
addn('civil',NB['r1'][:12]+NB['r2'][:12]+NB['r5'][14:20]+NB['r6'][14:20])
addn('obra',NB['r1'][12:23]+NB['r2'][12:23])
addn('policia',NB['r3'][:5])
addn('bombeiro',NB['r3'][10:14])
addn('saude',NB['r3'][14:19]+NB['r4'][14:19])
save('npc','caido',knock(S['s6'].crop((626,944,706,980)),blackbg),64)
json.dump(roles,open(OUT+'npc/roles.json','w'))
# ---- mobiliário (s1, painéis navy) por retângulos aproximados + s2 (fundo preto)
def crop1(r): return knock(S['s1'].crop(r),navybg)
props={
 'arvore0':(300,582,350,666),'arvore1':(350,582,400,666),'arvore2':(403,585,445,666),'arvore3':(452,585,494,666),'arvore4':(500,585,540,666),
 'arbusto0':(300,670,345,725),'arbusto1':(350,670,390,725),'canteiro0':(388,672,430,702),'canteiro1':(430,672,480,702),'canteiro2':(487,672,540,702),
 'poste0':(304,388,328,448),'poste1':(340,388,366,448),'poste2':(380,388,406,448),'poste3':(420,388,446,448),
 'banco0':(18,592,80,628),'banco1':(85,592,140,628),'lixeira0':(565,590,590,632),'lixeira1':(598,590,628,632),'lixeira2':(632,590,660,632),'hidrante':(678,682,706,725),
 'chafariz':(560,772,632,836),'jardim0':(640,772,710,836),'banca0':(298,778,350,840),'banca1':(352,778,404,840),'banca2':(406,778,460,840),'banca3':(462,778,540,840),
 'guarda-sol0':(298,846,350,890),'guarda-sol1':(352,846,404,890),
 'fachada-shop':(18,462,70,532),'fachada-food':(74,462,124,532),'fachada-cafe':(126,462,178,532),'fachada-game':(180,462,230,532),'fachada-24':(232,462,282,532),
 'toldo0':(18,390,72,450),'toldo1':(78,390,128,450),'toldo2':(132,390,205,450),'toldo3':(210,390,280,450),
 'outdoor-sale':(908,775,1000,830),'outdoor-burger':(1012,775,1100,830),'outdoor-drink':(1110,775,1196,830),
}
for n,r in props.items(): save('props',n,crop1(r),96)
json.dump(meta,open(OUT+'meta.json','w'),separators=(',',':'))
print(len(meta))
