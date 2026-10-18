import asyncio, html
from playwright.async_api import async_playwright

INK='#1b2559'; RED='#c42b1c'; GRN='#17794d'; AMB='#b97800'; MUT='#4a5173'; LINE='#c9cfe0'; PAPER='#f4f5f1'

def box(x,y,w,h,title,sub='',fill='#fff',stroke=INK,tc=INK,sw=2.5,r=14):
    lines=[]
    ty=y+h/2-(10 if sub else 0)+6
    out=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
    out+=f'<text x="{x+w/2}" y="{ty}" text-anchor="middle" font-size="22" font-weight="800" fill="{tc}">{html.escape(title)}</text>'
    for i,l in enumerate(sub.split('\n') if sub else []):
        out+=f'<text x="{x+w/2}" y="{ty+24+i*20}" text-anchor="middle" font-size="15.5" fill="{MUT if tc==INK else tc}" font-weight="500">{html.escape(l)}</text>'
    return out

def arrow(x1,y1,x2,y2,label='',color=INK,dash=False,lx=None,ly=None,anchor='middle'):
    d=' stroke-dasharray="7 6"' if dash else ''
    out=f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2.6"{d} marker-end="url(#a{color[1:]})"/>'
    if label:
        mx=lx if lx is not None else (x1+x2)/2; my=ly if ly is not None else (y1+y2)/2-8
        out+=f'<text x="{mx}" y="{my}" text-anchor="{anchor}" font-size="15" font-weight="700" fill="{color}" paint-order="stroke" stroke="{PAPER}" stroke-width="5">{html.escape(label)}</text>'
    return out

def wrap(w,h,body,title):
    defs=''.join(f'<marker id="a{c[1:]}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="{c}"/></marker>' for c in (INK,RED,GRN,AMB,MUT))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="Anek Latin, Anek Devanagari, system-ui, sans-serif"><defs>{defs}</defs><rect width="{w}" height="{h}" fill="{PAPER}"/>{body}</svg>'

# ---------------- architecture 1600x820
def poly(pts,color=INK,dash=False,label='',lx=0,ly=0,anchor='middle'):
    d=' stroke-dasharray="7 6"' if dash else ''
    pstr=' '.join(f'{x},{y}' for x,y in pts)
    out=f'<polyline points="{pstr}" fill="none" stroke="{color}" stroke-width="2.6"{d} marker-end="url(#a{color[1:]})"/>'
    if label: out+=f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" font-size="15" font-weight="700" fill="{color}">{html.escape(label)}</text>'
    return out
W,H=1600,820
b=''
b+=f'<text x="40" y="52" font-size="30" font-weight="800" fill="{INK}">Kavach architecture</text>'
b+=f'<text x="40" y="80" font-size="17" fill="{MUT}">Everything runs on Google Cloud and Firebase. One Cloud Run service serves the app and the API.</text>'
b+=box(40,150,300,120,'Parent phone','Paste / photo / voice note\n7 languages, read-aloud')
b+=box(40,520,300,120,'Guardian dashboard','Live feed, one-tap actions\nScam Radar')
b+=box(420,150,260,120,'Firebase Hosting','Static app + rewrite\nto Cloud Run',fill='#eef0fa')
b+=f'<rect x="760" y="120" width="420" height="330" rx="18" fill="#fff" stroke="{INK}" stroke-width="3.5"/>'
b+=f'<text x="970" y="156" text-anchor="middle" font-size="22" font-weight="800" fill="{INK}">Cloud Run  (Node / Express)</text>'
b+=box(780,176,185,84,'/api/analyze','text, image, audio',fill='#eef0fa',r=10,sw=2)
b+=box(975,176,185,84,'Safety net','rule-based guardrails',fill='#fdf1d6',stroke=AMB,r=10,sw=2)
b+=box(780,282,185,84,'Verdict merge','Gemini + rules',fill='#eef0fa',r=10,sw=2)
b+=box(975,282,185,84,'Scam Radar','embedding match',fill='#fbe9e6',stroke=RED,r=10,sw=2)
b+=f'<text x="970" y="410" text-anchor="middle" font-size="15" fill="{MUT}">Admin SDK writes. Browsers only read.</text>'
b+=box(1330,150,230,140,'Gemini API','Image, audio, text in\nJSON verdict, explanation\nin 7 languages, embeddings',fill='#e2f3ea',stroke=GRN)
b+=box(1330,500,230,150,'Firestore','families · reports\ncampaigns · radar_items\nrules: guardian-only reads',fill='#fdf1d6',stroke=AMB)
b+=box(420,520,260,120,'Firebase Auth','Google or guest\nguardian identity',fill='#eef0fa')
b+=arrow(340,210,420,210,'HTTPS',lx=380,ly=198)
b+=arrow(680,210,760,210)
b+=arrow(1180,205,1330,205,'prompt + media',GRN,lx=1255,ly=190)
b+=arrow(1330,255,1180,255,'JSON verdict',GRN,lx=1255,ly=280)
b+=arrow(1180,400,1330,520,'write report + campaign',AMB,lx=1272,ly=470,anchor='end')
b+=arrow(340,580,420,580,'sign in',INK,lx=380,ly=568)
b+=arrow(790,452,640,520,'verify ID token',MUT,lx=700,ly=500,anchor='end')
b+=poly([(1445,650),(1445,730),(190,730),(190,650)],AMB,False,'live updates: Firestore onSnapshot listeners',820,718)
b+=arrow(190,270,190,520,'',MUT,dash=True)
b+=f'<text x="204" y="400" font-size="15" font-weight="700" fill="{MUT}">verdict back to the parent,</text><text x="204" y="420" font-size="15" font-weight="700" fill="{MUT}">alert to the guardian</text>'
b+=f'<rect x="40" y="776" width="14" height="14" fill="{GRN}"/><text x="62" y="789" font-size="15" fill="{INK}">Gemini</text>'
b+=f'<rect x="150" y="776" width="14" height="14" fill="{AMB}"/><text x="172" y="789" font-size="15" fill="{INK}">Firestore data and live sync</text>'
b+=f'<rect x="390" y="776" width="14" height="14" fill="{RED}"/><text x="412" y="789" font-size="15" fill="{INK}">Community early warning</text>'
open('docs/diagrams/architecture.svg','w').write(wrap(W,H,b,'arch'))

# ---------------- flow 1600x760
W,H=1600,760
f=''
f+=f'<text x="40" y="52" font-size="30" font-weight="800" fill="{INK}">What happens when a parent checks a message</text>'
xs=[40,330,620,910,1200]
steps=[('1  Parent shares','Text, screenshot or\nvoice note (WAV 16 kHz)',INK,'#fff'),
       ('2  Gemini reads it','Transcribes / OCRs, names\nthe scam type and tactics',GRN,'#e2f3ea'),
       ('3  Safety net','Rules can raise a verdict\nbut never lower it',AMB,'#fdf1d6'),
       ('4  Radar match','Embedding vs last 24 h\njoins or starts a campaign',RED,'#fbe9e6'),
       ('5  Everyone told','Parent sees the stamp.\nGuardian dashboard updates',INK,'#eef0fa')]
for x,(t,s,c,fl) in zip(xs,steps):
    f+=box(x,130,260,130,t,s,fill=fl,stroke=c)
for i in range(4): f+=arrow(xs[i]+260,195,xs[i+1],195)
# parent result
f+=box(40,360,430,150,'Parent gets (own language)','Stamp: SCAM / CAREFUL / LOOKS SAFE\nHighlighted tricks in the message\nWhat to do · what not to do · read-aloud',fill='#fff')
f+=arrow(1330,260,330,360,'',MUT,dash=True)
f+=arrow(1330,260,1330,360,'',MUT,dash=True)
# guardian
f+=box(980,360,580,150,'Guardian dashboard (live, Firestore listeners)','English summary · tactic chips\nCall Papa · Mark handled · Block sender\nRadar: "14 similar reports in the last hour"',fill='#fff')
# bottom: fallbacks
f+=f'<rect x="40" y="580" width="1520" height="130" rx="14" fill="#fff" stroke="{LINE}" stroke-width="2"/>'
f+=f'<text x="64" y="618" font-size="20" font-weight="800" fill="{INK}">Built so a demo never breaks</text>'
f+=f'<text x="64" y="652" font-size="16.5" fill="{MUT}">Model chain tries gemini-3.8-flash, then older Flash models if one is unavailable. If Gemini is down, the rule engine still answers.</text>'
f+=f'<text x="64" y="680" font-size="16.5" fill="{MUT}">Identical inputs are cached. Radar falls back to a local embedder. Prompt-injection text inside a message is treated as a scam signal.</text>'
open('docs/diagrams/flow.svg','w').write(wrap(W,H,f,'flow'))

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for name,(w,h) in {'architecture':(1600,820),'flow':(1600,760)}.items():
            pg=await b.new_page(viewport={'width':w,'height':h})
            svg=open(f'docs/diagrams/{name}.svg').read()
            await pg.set_content(f'<html><head><link rel="stylesheet" href="file:///home/claude/kavach/public/fonts.css"></head><body style="margin:0">{svg}</body></html>')
            await pg.goto(f'file:///home/claude/kavach/docs/diagrams/{name}.svg') if False else None
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'docs/diagrams/{name}.png')
        await b.close()
asyncio.run(main())
