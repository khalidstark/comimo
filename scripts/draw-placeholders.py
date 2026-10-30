"""Draws the code-made placeholder art in public/art/placeholder.

Usage: python3 scripts/draw-placeholders.py public/art/placeholder
Illustrations carry a small "placeholder" tag; icons, mood icons and the logo
mark are too small for one, so the manifest flag marks them instead.
"""
import os, sys
OUT = sys.argv[1]
INK="#1b2148"; PINK="#f2397a"; YEL="#ffc738"; TEAL="#0f9e8e"; PAPER="#eceff2"; SURF="#fafbfc"
CLOUD="#a9b3c7"; RAIN="#3d7fe0"; STORM="#3a4369"; SKIN1="#c98b62"; SKIN2="#8d5a3b"; SKIN3="#e0ad84"

def label(w, h):
    tw = 78
    return (f'<g transform="translate({w-tw-8} {h-26})"><rect width="{tw}" height="18" rx="3" fill="{INK}"/>'
            f'<text x="{tw/2}" y="12.5" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" '
            f'font-size="10" font-weight="700" letter-spacing=".04em" fill="{YEL}">placeholder</text></g>')

def dots(id_, color, size=10, r=2.2):
    return (f'<pattern id="{id_}" width="{size}" height="{size}" patternUnits="userSpaceOnUse">'
            f'<circle cx="{size/2}" cy="{size/2}" r="{r}" fill="{color}"/></pattern>')

def svg(w, h, body, defs="", lab=True, title=""):
    t = f"<title>{title}</title>" if title else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}'
            f'<defs>{defs}</defs>{body}{label(w,h) if lab else ""}</svg>\n')

def write(name, content):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)

S = f'stroke="{INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"'
S3 = f'stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'

# ---------- icons (mask images: single colour, 24x24 stroke) ----------
IC = 'fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
icons = {
 "icon-today.svg": f'<rect x="3" y="3" width="18" height="18" rx="2" {IC}/><path d="M3 11h18M12 11v10" {IC}/><circle cx="8" cy="7" r="1.4" fill="#000"/>',
 "icon-record.svg": f'<rect x="8.5" y="2.5" width="7" height="12" rx="3.5" {IC}/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7" {IC}/>',
 "icon-cast.svg": f'<circle cx="8.5" cy="8" r="3.5" {IC}/><path d="M2.5 20c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5" {IC}/><circle cx="16.5" cy="7" r="3" {IC}/><path d="M16 13.2c3 0 5 1.7 5.6 5" {IC}/>',
 "icon-month.svg": f'<path d="M12 6.5C9.5 4.8 6.3 4.5 3 5v14c3.3-.5 6.5-.2 9 1.5 2.5-1.7 5.7-2 9-1.5V5c-3.3-.5-6.5-.2-9 1.5zM12 6.5v14" {IC}/>',
 "icon-theme.svg": f'<circle cx="12" cy="12" r="8.5" {IC}/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="#000"/>',
 "icon-upload.svg": f'<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" {IC}/>',
 "icon-book-open.svg": f'<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" {IC}/>',
 "icon-plus.svg": f'<path d="M12 5v14M5 12h14" {IC}/>',
}
for n, b in icons.items():
    write(n, svg(24, 24, b, lab=False))

# ---------- logo mark ----------
write("logo-mark.svg", svg(64, 64,
 f'<path d="M10 8h44a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H30l-12 11 2-11h-10a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill="{PINK}" {S}/>'
 f'<path d="M14 14h17v26H14zM35 14h15v12H35zM35 30h15v10H35z" fill="{YEL}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>',
 lab=False, title="Comimo logo mark (placeholder)"))

# ---------- mood icons (64x64, coloured) ----------
def cloud(x, y, s, fill):
    return (f'<path transform="translate({x} {y}) scale({s})" d="M10 34h32a10 10 0 0 0 0-20 13 13 0 0 0-24-4A11 11 0 0 0 10 34z" fill="{fill}" {S3}/>')
rays = "".join(f'<path d="M32 4v8" {S3} transform="rotate({a} 32 32)"/>' for a in range(0, 360, 45))
write("mood-sunny.svg", svg(64, 64, rays + f'<circle cx="32" cy="32" r="14" fill="{YEL}" {S3}/><path d="M26 34q6 5 12 0" fill="none" {S3}/>', lab=False, title="Sunny day"))
write("mood-cloudy.svg", svg(64, 64, f'<circle cx="42" cy="20" r="10" fill="{YEL}" {S3}/>' + cloud(4, 14, 1.05, CLOUD), lab=False, title="Cloudy day"))
write("mood-rainy.svg", svg(64, 64, cloud(4, 4, 1.05, CLOUD) + "".join(f'<path d="M{x} {44+o}l-3 9" stroke="{RAIN}" stroke-width="4" stroke-linecap="round"/>' for x, o in [(20,0),(32,4),(44,0)]), lab=False, title="Rainy day"))
write("mood-stormy.svg", svg(64, 64, cloud(4, 2, 1.05, STORM) + f'<path d="M34 38l-10 13h8l-4 11 13-16h-8l4-8z" fill="{YEL}" {S3}/>', lab=False, title="Stormy day"))
write("mood-rainbow.svg", svg(64, 64,
 f'<path d="M6 48a26 26 0 0 1 52 0" fill="none" stroke="{PINK}" stroke-width="7"/>'
 f'<path d="M13 48a19 19 0 0 1 38 0" fill="none" stroke="{YEL}" stroke-width="7"/>'
 f'<path d="M20 48a12 12 0 0 1 24 0" fill="none" stroke="{TEAL}" stroke-width="7"/>'
 f'<path d="M2.5 48a29.5 29.5 0 0 1 59 0M23.5 48a8.5 8.5 0 0 1 17 0" fill="none" {S3}/>'
 + cloud(3, 30, 0.6, "#fff") + cloud(30, 30, 0.6, "#fff"), lab=False, title="Rainbow day"))

# ---------- sprites (sticker style, white die-cut edge) ----------
def sprite(name, title, figure):
    w, h = 300, 360
    defs = f'<g id="fig">{figure}</g>'
    body = (f'<use href="#fig" xlink:href="#fig" stroke="#ffffff" stroke-width="22" stroke-linejoin="round"/>'
            f'<use href="#fig" xlink:href="#fig"/>')
    write(name, svg(w, h, body, defs, title=title))

def person(skin, top, hair, extra="", face_extra=""):
    return (f'<path d="M70 352c4-70 36-104 80-104s76 34 80 104z" fill="{top}" {S}/>'
            f'<path d="M132 230h36v26c-6 8-30 8-36 0z" fill="{skin}" {S}/>'
            f'<ellipse cx="150" cy="160" rx="62" ry="70" fill="{skin}" {S}/>'
            f'{hair}'
            f'<circle cx="128" cy="168" r="6" fill="{INK}"/><circle cx="172" cy="168" r="6" fill="{INK}"/>'
            f'<path d="M134 198q16 12 32 0" fill="none" {S}/>'
            f'<circle cx="112" cy="190" r="8" fill="{PINK}" opacity=".45"/><circle cx="188" cy="190" r="8" fill="{PINK}" opacity=".45"/>'
            f'{face_extra}{extra}')

sprite("sprite-nour.svg", "Nour (placeholder sprite)", person(SKIN1, YEL,
  f'<path d="M86 156c-10-62 30-96 68-96 44 0 76 30 66 92-10-22-24-36-42-40-20 14-58 22-92 44z" fill="{INK}" {S}/>'
  + "".join(f'<circle cx="{x}" cy="{y}" r="14" fill="{INK}"/>' for x,y in [(98,98),(126,74),(160,68),(192,80),(212,108)]),
  f'<path d="M110 300h80" {S}/><path d="M150 252v40" {S}/>'))
sprite("sprite-karim.svg", "Karim (placeholder sprite)", person(SKIN2, TEAL,
  f'<path d="M86 140c0-48 28-72 64-72s64 24 64 72z" fill="{PINK}" {S}/><path d="M200 136h52c4 0 6 8 0 10l-60 6z" fill="{PINK}" {S}/><circle cx="150" cy="70" r="7" fill="{YEL}" {S3}/>',
  f'<path d="M120 300l30-40 30 40" fill="none" {S}/>'))
sprite("sprite-teta.svg", "Teta Samia (placeholder sprite)", person(SKIN3, PINK,
  f'<path d="M80 176c-8-80 30-112 70-112s80 32 70 112c-8 34-22 66-30 82h-80c-8-16-22-48-30-82z" fill="{TEAL}" {S}/>'
  f'<ellipse cx="150" cy="168" rx="50" ry="56" fill="{SKIN3}" {S}/>',
  f'<circle cx="150" cy="300" r="10" fill="{YEL}" {S3}/>',
  f'<circle cx="128" cy="168" r="13" fill="none" {S3}/><circle cx="172" cy="168" r="13" fill="none" {S3}/><path d="M141 168h18" {S3}/>'))
sprite("sprite-mishmish.svg", "Mishmish the cat (placeholder sprite)",
  f'<path d="M232 300c50-10 40-80 4-70" fill="none" stroke="{INK}" stroke-width="16" stroke-linecap="round"/>'
  f'<path d="M232 300c50-10 40-80 4-70" fill="none" stroke="{YEL}" stroke-width="9" stroke-linecap="round"/>'
  f'<path d="M78 344c-6-70 22-120 72-120s78 50 72 120z" fill="{YEL}" {S}/>'
  f'<path d="M88 150 76 64l54 40zM212 150l12-86-54 40z" fill="{YEL}" {S}/>'
  f'<ellipse cx="150" cy="170" rx="74" ry="64" fill="{YEL}" {S}/>'
  f'<path d="M150 108v20M132 112l6 16M168 112l-6 16" {S3}/>'
  f'<path d="M118 172q8-10 16 0M166 172q8-10 16 0" fill="none" {S}/>'
  f'<path d="M144 190h12l-6 7z" fill="{PINK}" {S3}/><path d="M150 197q-8 12-18 4M150 197q8 12 18 4" fill="none" {S3}/>'
  f'<path d="M84 188l-34-4M84 200l-32 8M216 188l34-4M216 200l32 8" {S3}/>'
  f'<path d="M120 344v-30M180 344v-30" {S3}/>')

# ---------- mascot: Mimo, a walking speech bubble ----------
write("mascot.svg", svg(260, 260,
 f'<path d="M50 222l14-30" {S}/><path d="M118 226v-24" {S}/>'
 f'<ellipse cx="62" cy="228" rx="18" ry="8" fill="{INK}"/><ellipse cx="122" cy="230" rx="18" ry="8" fill="{INK}"/>'
 f'<path d="M40 40h170a26 26 0 0 1 26 26v92a26 26 0 0 1-26 26H112l-46 38 10-38H40a26 26 0 0 1-26-26V66a26 26 0 0 1 26-26z" fill="{PINK}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'
 f'<path d="M30 70a20 20 0 0 1 18-18" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".7"/>'
 f'<ellipse cx="96" cy="104" rx="15" ry="19" fill="#fff" {S}/><ellipse cx="160" cy="104" rx="15" ry="19" fill="#fff" {S}/>'
 f'<circle cx="100" cy="108" r="7" fill="{INK}"/><circle cx="164" cy="108" r="7" fill="{INK}"/>'
 f'<path d="M108 140q20 18 40 0" fill="{INK}" {S}/>'
 f'<path d="M236 92l16-10M238 116h18M236 140l16 10" stroke="{YEL}" stroke-width="6" stroke-linecap="round"/>',
 title="Mimo the mascot (placeholder)"))

# ---------- hero scene: rooftops at golden hour ----------
def windows(x0, y0, cols, rows, lit):
    out = ""
    for r in range(rows):
        for c in range(cols):
            on = (r * cols + c) in lit
            out += f'<rect x="{x0+c*22}" y="{y0+r*26}" width="12" height="14" fill="{YEL if on else STORM}" stroke="{INK}" stroke-width="2"/>'
    return out
write("hero-scene.svg", svg(640, 480,
 f'<rect width="640" height="480" fill="{PAPER}"/><rect width="640" height="480" fill="url(#hd)"/>'
 f'<circle cx="470" cy="190" r="92" fill="{PINK}" {S}/>'
 f'<path d="M0 300h70v-90h60v40h50v-120h80v170h40v-60h70v80h60v-140h90v60h60v60h60v200H0z" fill="{INK}"/>'
 + windows(196, 150, 3, 5, {1,4,6,9,13}) + windows(426, 200, 3, 4, {0,5,7,10}) + windows(80, 230, 2, 3, {1,2})
 + f'<path d="M520 120v-30h50v30M528 90v-12h34v12" fill="{TEAL}" {S}/><path d="M545 120v60" {S}/>'
 f'<path d="M0 380h640v100H0z" fill="{TEAL}" {S}/>'
 f'<path d="M110 360h240a16 16 0 0 1 16 16v46H94v-46a16 16 0 0 1 16-16z" fill="{YEL}" {S}/>'
 + "".join(f'<rect x="{x}" y="372" width="40" height="24" rx="3" fill="#fff" {S3}/>' for x in (112, 166, 220, 274))
 + f'<circle cx="140" cy="426" r="16" fill="{INK}"/><circle cx="320" cy="426" r="16" fill="{INK}"/>'
 f'<path d="M40 70q40-24 80 0M160 50q30-18 60 0" fill="none" {S3}/>',
 defs=dots("hd", "#c9cfd9", 12, 2.6), title="Hero scene: a city at golden hour (placeholder)"))

# ---------- how it works ----------
write("how-talk.svg", svg(400, 300,
 f'<rect width="400" height="300" fill="{PAPER}"/><rect width="400" height="300" fill="url(#d1)"/>'
 f'<rect x="150" y="40" width="100" height="190" rx="18" fill="{INK}" {S}/><rect x="162" y="62" width="76" height="140" rx="6" fill="{TEAL}"/>'
 f'<circle cx="200" cy="132" r="26" fill="{PINK}" {S}/><rect x="193" y="116" width="14" height="24" rx="7" fill="#fff"/>'
 + "".join(f'<path d="M{x} {150-hh}v{2*hh}" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>' for x, hh in [(70,14),(90,30),(110,46),(130,22),(270,22),(290,40),(310,28),(330,12)]),
 defs=dots("d1", "#d5dae2", 12, 2.4), title="Talking into a phone (placeholder)"))
write("how-script.svg", svg(400, 300,
 f'<rect width="400" height="300" fill="{PAPER}"/><rect width="400" height="300" fill="url(#d2)"/>'
 f'<path d="M110 30h170l30 30v210H110z" fill="#fff" {S}/><path d="M280 30v30h30" fill="none" {S}/>'
 + "".join(f'<path d="M132 {y}h{w}" stroke="{c}" stroke-width="8" stroke-linecap="round"/>' for y, w, c in [(80,90,PINK),(108,150,CLOUD),(130,120,CLOUD),(160,80,TEAL),(188,150,CLOUD),(210,100,CLOUD),(238,60,YEL)])
 + f'<path d="M300 250l50-130 18 7-50 130-22 14z" fill="{YEL}" {S}/>',
 defs=dots("d2", "#d5dae2", 12, 2.4), title="A comic script page (placeholder)"))
write("how-draw.svg", svg(400, 300,
 f'<rect width="400" height="300" fill="{PAPER}"/><rect width="400" height="300" fill="url(#d3)"/>'
 f'<rect x="40" y="50" width="150" height="100" fill="#fff" {S}/><rect x="210" y="50" width="150" height="100" fill="{YEL}" {S}/><rect x="40" y="170" width="320" height="90" fill="{TEAL}" {S}/>'
 f'<circle cx="100" cy="95" r="18" fill="{SKIN1}" {S3}/><path d="M76 150c4-20 44-20 48 0" fill="{PINK}" {S3}/>'
 f'<circle cx="290" cy="95" r="18" fill="{SKIN2}" {S3}/><path d="M266 150c4-20 44-20 48 0" fill="#fff" {S3}/>'
 f'<rect x="140" y="64" width="40" height="22" rx="10" fill="#fff" {S3}/>'
 f'<path d="M70 230q50-40 100 0t100 0t60-10" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>',
 defs=dots("d3", "#d5dae2", 12, 2.4), title="Panels being drawn (placeholder)"))

# ---------- scenes for sample comic panels (600x400) ----------
def scene(name, title, body):
    write(name, svg(600, 400, f'<rect width="600" height="400" fill="{PAPER}"/><rect width="600" height="400" fill="url(#sd)"/>' + body,
                    defs=dots("sd", "#d5dae2", 12, 2.4), title=title))
scene("scene-street.svg", "A bus stop on a grey morning (placeholder)",
 cloud(40, 30, 2.2, CLOUD) + cloud(330, 50, 1.8, CLOUD)
 + f'<path d="M0 300h600v100H0z" fill="{STORM}" {S}/><path d="M0 300h600" {S}/>'
 f'<path d="M380 120h8v180h-8z" fill="{INK}"/><rect x="350" y="96" width="68" height="40" rx="6" fill="{YEL}" {S}/>'
 f'<path d="M80 180h200v120H80z" fill="{TEAL}" {S}/><path d="M70 170h220v16H70z" fill="{INK}"/><path d="M96 260h170" {S}/>'
 + "".join(f'<path d="M{x} 340h50" stroke="{YEL}" stroke-width="8"/>' for x in range(20, 600, 110)))
scene("scene-home.svg", "A kitchen table with a cake (placeholder)",
 f'<rect x="60" y="40" width="140" height="120" fill="#fff" {S}/><path d="M130 40v120M60 100h140" {S3}/>'
 f'<path d="M0 290h600v110H0z" fill="{TEAL}" {S}/><path d="M80 250h440v40H80z" fill="{YEL}" {S}/>'
 f'<path d="M230 170h140v80H230z" fill="{PINK}" {S}/><path d="M230 200q35 20 70 0t70 0" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'
 + "".join(f'<path d="M{x} 170v-30" {S}/><path d="M{x} 132q-6-8 0-16 6 8 0 16z" fill="{YEL}" {S3}/>' for x in (262, 300, 338))
 + f'<path d="M430 120h80v130h-80z" fill="{CLOUD}" {S}/>')
scene("scene-desk.svg", "A late-night desk with a laptop (placeholder)",
 f'<rect width="600" height="400" fill="{STORM}"/><circle cx="500" cy="80" r="40" fill="{YEL}" {S}/>'
 f'<path d="M0 300h600v100H0z" fill="{INK}"/><path d="M160 120h280v170H160z" fill="{INK}" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>'
 f'<rect x="176" y="136" width="248" height="138" fill="{PAPER}"/>'
 + "".join(f'<rect x="{x}" y="136" width="76" height="20" fill="{c}" stroke="{INK}" stroke-width="2"/>' for x, c in [(176, PINK), (252, YEL), (328, CLOUD)])
 + f'<path d="M120 290h360l20 22H100z" fill="{CLOUD}" {S}/>'
 f'<path d="M60 290v-140l40-30" fill="none" stroke="#fff" stroke-width="5"/><path d="M84 112l50 0-20 30z" fill="{YEL}" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>')
scene("scene-rooftop.svg", "Tea on a rooftop at sunset (placeholder)",
 f'<rect width="600" height="260" fill="{YEL}"/><rect width="600" height="260" fill="url(#sd)"/><circle cx="300" cy="250" r="90" fill="{PINK}" {S}/>'
 f'<path d="M0 260h40v-60h50v40h60v-90h60v110h80v-50h70v70h60v-100h60v80h50v40h70v140H0z" fill="{INK}"/>'
 f'<path d="M0 320h600v80H0z" fill="{TEAL}" {S}/>'
 f'<path d="M210 290h30l-4 34h-22zM360 290h30l-4 34h-22z" fill="#fff" {S}/><path d="M240 298q12 4 0 14M390 298q12 4 0 14" fill="none" {S3}/>'
 f'<path d="M222 280q-6-10 0-18M372 280q-6-10 0-18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>')

# ---------- empty states (400x300) ----------
write("empty-days.svg", svg(400, 300,
 f'<path d="M100 30h200v240H100z" fill="#fff" {S}/>'
 f'<path d="M116 46h168v70H116zM116 130h80v70H116zM206 130h78v70H206zM116 214h168v40H116z" fill="none" stroke="{CLOUD}" stroke-width="3" stroke-dasharray="8 7"/>'
 f'<path d="M270 220l70-80 18 16-70 80-26 10z" fill="{PINK}" {S}/><path d="M340 140l18 16" {S}/>',
 title="An empty comic page (placeholder)"))
write("empty-cast.svg", svg(400, 300,
 f'<circle cx="200" cy="110" r="50" fill="none" stroke="{CLOUD}" stroke-width="4" stroke-dasharray="10 8"/>'
 f'<path d="M110 270c6-60 44-90 90-90s84 30 90 90" fill="none" stroke="{CLOUD}" stroke-width="4" stroke-dasharray="10 8"/>'
 f'<circle cx="290" cy="80" r="26" fill="{YEL}" {S}/><path d="M290 68v24M278 80h24" {S}/>',
 title="An empty character outline (placeholder)"))
write("empty-month.svg", svg(400, 300,
 f'<path d="M120 60h170v200H120z" fill="{PAPER}" {S} transform="rotate(6 205 160)"/>'
 f'<path d="M110 50h170v200H110z" fill="#fff" {S}/>'
 f'<path d="M126 70h138v40H126z" fill="{PINK}" {S3}/><path d="M126 126h90M126 146h120M126 166h70" stroke="{CLOUD}" stroke-width="7" stroke-linecap="round"/>'
 f'<path d="M240 50v60l14-10 14 10V50" fill="{TEAL}" {S3}/>',
 title="A blank magazine (placeholder)"))

# ---------- month cover art (480x600) ----------
rays2 = "".join(f'<path d="M240 330L{240+600*__import__("math").cos(__import__("math").radians(a))} {330+600*__import__("math").sin(__import__("math").radians(a))}L{240+600*__import__("math").cos(__import__("math").radians(a+10))} {330+600*__import__("math").sin(__import__("math").radians(a+10))}z" fill="{YEL}"/>' for a in range(0, 360, 20))
write("month-cover.svg", svg(480, 600,
 f'<rect width="480" height="600" fill="{PINK}"/>' + rays2 + f'<rect width="480" height="600" fill="url(#cd)"/>'
 f'<circle cx="240" cy="330" r="120" fill="#fff" {S}/>'
 f'<path d="M190 300h100a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12h-46l-24 20 6-20h-36a12 12 0 0 1-12-12v-40a12 12 0 0 1 12-12z" fill="{PINK}" {S}/>'
 f'<circle cx="222" cy="330" r="6" fill="{INK}"/><circle cx="258" cy="330" r="6" fill="{INK}"/>'
 f'<path d="M0 520h480v80H0z" fill="{INK}"/>',
 defs=dots("cd", "rgba(27,33,72,.18)", 14, 3), title="Monthly magazine cover art (placeholder)"))
print("ok")
