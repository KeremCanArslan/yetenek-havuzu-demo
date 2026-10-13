"""Yetenek Havuzu — çalışan örnek. Arayüz alıcının kendi tasarım dosyasıdır; açılışta ekinden indirilir.

Çalıştır: python3 sunucu.py  →  http://127.0.0.1:8765  (Render'da PORT ortam değişkeni kullanılır)
Veri: SQLite. İlk açılışta tasarımdaki profiller başlangıç verisi olarak yüklenir.
"""
import gzip, html, json, os, re, sqlite3, urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

KOK = Path(__file__).parent
DB = KOK / "veri.db"
TASARIM = KOK / ".tasarim.html"
TASARIM_URL = os.environ.get("TASARIM_URL", "https://gcdn.bionluk.com/uploads/request/317ca67e-3c6a-43dc-9129-b8a75f85f6c0.html")
CINSIYET = {"Ece Yılmaz": "Kadın", "Berkay Aydın": "Erkek", "Nil Kara": "Kadın",
            "Arda Nehir": "Erkek", "Zeynep Bulut": "Kadın", "Alp Korkmaz": "Erkek"}
ALANLAR = ["kod", "ad", "durum", "durum_renk", "puan", "rol", "kategori", "cinsiyet", "sehir", "yas", "dogum",
           "manager", "boy", "kilo", "sac", "goz", "beden", "ayakkabi", "diller", "etiketler", "telefon", "eposta",
           "foto", "ai"]


def tasarimi_yukle():
    if not TASARIM.exists():
        urllib.request.urlretrieve(TASARIM_URL, TASARIM)
    cerceve = TASARIM.read_text(encoding="utf-8")
    i = cerceve.index("S = {") + 4
    sayfalar, _ = json.JSONDecoder().raw_decode(cerceve[i:])
    cerceve = cerceve.replace("frame.srcdoc = PAGES[key];", "if(key==='3'){frame.removeAttribute('srcdoc');frame.src='/havuz';}"
                              "else{frame.removeAttribute('src');frame.srcdoc=PAGES[key];}").replace("openPage('1');", "openPage('3');")
    havuz = re.sub(r"<script>\s*\(function\(\)\{\s*const q=.*?</script>", "", sayfalar["3"], count=1, flags=re.S)  # tasarımdaki sahte tıklama bildirimi
    havuz = havuz.replace("</body>", '<link rel="stylesheet" href="/canli.css"><script src="/canli.js"></script></body>')
    return cerceve, havuz, sayfalar["3"]


def baglan():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute(f"CREATE TABLE IF NOT EXISTS yetenek (id INTEGER PRIMARY KEY AUTOINCREMENT, "
              f"{', '.join(a + ' TEXT' for a in ALANLAR)}, eklenme TEXT DEFAULT CURRENT_TIMESTAMP)")
    return c


def tohumla(c, sayfa):
    if c.execute("SELECT COUNT(*) FROM yetenek").fetchone()[0]:
        return
    for a in reversed(re.findall(r'<article class="profile-row card">(.*?)</article>', sayfa, flags=re.S)):
        t = lambda p: (re.search(p, a, flags=re.S) or [None, ""])[1]
        ad = html.unescape(t(r"<h3>([^<]*)</h3>"))
        rol = html.unescape(t(r'class="role-line">([^<]*)<'))
        stats = dict(re.findall(r"<small>([^<]*)</small><b>([^<]*)</b>", a))
        r = {
            "kod": t(r"ID: ([A-Z0-9-]+)"), "ad": ad,
            "durum": t(r'class="name-status \w+">([^<]*)<'), "durum_renk": t(r'class="name-status (\w+)"'),
            "puan": t(r'class="name-rating">([^<]*)<'), "rol": rol, "kategori": rol.split(" · ")[0],
            "cinsiyet": CINSIYET.get(ad, ""), "sehir": t(r'</svg> ([^<,]*), Türkiye'),
            "yas": t(r'</svg> (\d+) yaşında'), "dogum": t(r'yaşında \(([^)]*)\)'), "manager": t(r"Manager: ([^<]*)<"),
            "boy": stats.get("Boy", ""), "kilo": stats.get("Kilo", ""), "sac": stats.get("Saç", ""),
            "goz": stats.get("Göz", ""), "beden": stats.get("Beden", ""), "ayakkabi": stats.get("Ayakkabı", ""),
            "diller": html.unescape(t(r"<b>Diller:</b> ([^<]*)<")),
            "etiketler": ",".join(re.findall(r"<span>([^<]*)</span>", t(r'class="tag-row">(.*?)</div>'))),
            "telefon": t(r'contact-chip phone">.*?<span>([^<]*)<'), "eposta": t(r'contact-chip mail">.*?<span>([^<]*)<'),
            "foto": t(r'<img alt="[^"]*" src="([^"]*)"'), "ai": t(r'donut-inner">(\d+)%'),
        }
        c.execute(f"INSERT INTO yetenek ({','.join(ALANLAR)}) VALUES ({','.join('?' * len(ALANLAR))})",
                  [r[k] for k in ALANLAR])
    c.commit()


def ai_skoru(r):
    """Aktif brief'e (Reklama uygun · Doğal · Kamera önü, 18-35 yaş) kural tabanlı uyum."""
    etiket = r.get("etiketler", "").lower()
    s = 58 + sum(10 for k in ("doğal", "kamera önü", "reklam") if k in etiket)
    try:
        if 18 <= int(r.get("yas") or 0) <= 35:
            s += 12
    except ValueError:
        pass
    return str(min(s, 97))


def listele(q):
    c = baglan()
    satirlar = [dict(x) for x in c.execute("SELECT * FROM yetenek ORDER BY id DESC")]
    g = lambda k: (q.get(k) or [""])[0].strip()
    kelime, etiket = g("q").lower(), g("etiket").lower()
    sonuc = []
    for r in satirlar:
        if kelime and kelime not in f"{r['ad']} {r['rol']} {r['etiketler']}".lower(): continue
        if etiket and etiket not in r["etiketler"].lower(): continue
        if g("kategori") and r["kategori"] != g("kategori"): continue
        if g("cinsiyet") and r["cinsiyet"] != g("cinsiyet"): continue
        if g("sehir") and r["sehir"] != g("sehir"): continue
        if g("durum") and r["durum"] != g("durum"): continue
        if g("yas"):
            alt, ust = (int(x) for x in g("yas").split("-"))
            if not (alt <= int(r["yas"] or 0) <= ust): continue
        if g("ai") and int(r["ai"] or 0) < int(g("ai")): continue
        sonuc.append(r)
    return {"toplam": len(satirlar), "sonuc": sonuc, "sehirler": sorted({r["sehir"] for r in satirlar if r["sehir"]})}


def ekle(v):
    c = baglan()
    son = c.execute("SELECT MAX(CAST(SUBSTR(kod,5) AS INTEGER)) FROM yetenek").fetchone()[0] or 10247
    v = {k: str(v.get(k, "")).strip()[:400000 if k == "foto" else 200] for k in ALANLAR}
    if not v["ad"]:
        raise ValueError("Ad Soyad zorunlu")
    v.update(kod=f"YET-{son + 1}", manager=v["manager"] or "Mert Karaca", ai=ai_skoru(v),
             kategori=v["rol"].split(" · ")[0], puan=v["puan"] or "—")
    v["durum_renk"] = {"Uygun": "green", "Opsiyonlu": "orange", "Dolu": "red"}.get(v["durum"], "green")
    c.execute(f"INSERT INTO yetenek ({','.join(ALANLAR)}) VALUES ({','.join('?' * len(ALANLAR))})",
              [v[k] for k in ALANLAR])
    c.commit()
    return v


CERCEVE, HAVUZ, SAYFA3 = tasarimi_yukle()
STATIK = {"/": (CERCEVE.encode(), "text/html"), "/havuz": (HAVUZ.encode(), "text/html"),
          "/canli.js": ((KOK / "canli.js").read_bytes(), "text/javascript"),
          "/canli.css": ((KOK / "canli.css").read_bytes(), "text/css")}
STATIK_GZ = {k: gzip.compress(v[0], 6) for k, v in STATIK.items()}


class Isleyici(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def gonder(self, kod, govde, tur="application/json", gz=None):
        b = govde if isinstance(govde, bytes) else json.dumps(govde, ensure_ascii=False).encode()
        if gz is not None and "gzip" in self.headers.get("Accept-Encoding", ""):
            b = gz
        self.send_response(kod)
        self.send_header("Content-Type", tur + "; charset=utf-8")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        if b is gz: self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in STATIK:
            return self.gonder(200, STATIK[u.path][0], STATIK[u.path][1], STATIK_GZ[u.path])
        if u.path == "/api/yetenekler":
            return self.gonder(200, listele(parse_qs(u.query)))
        if u.path == "/saglik":
            return self.gonder(200, {"durum": "ok"})
        self.gonder(404, {"hata": "yok"})

    def do_HEAD(self):
        self.send_response(200 if urlparse(self.path).path in STATIK else 404); self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path != "/api/yetenekler":
            return self.gonder(404, {"hata": "yok"})
        try:
            uzunluk = int(self.headers["Content-Length"])
            if uzunluk > 1_000_000:
                raise ValueError("Kayıt çok büyük")
            self.gonder(201, ekle(json.loads(self.rfile.read(uzunluk))))
        except (ValueError, KeyError, TypeError) as e:
            self.gonder(400, {"hata": str(e)})


if __name__ == "__main__":
    tohumla(baglan(), SAYFA3)
    port = int(os.environ.get("PORT", 8765))
    print(f"http://0.0.0.0:{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Isleyici).serve_forever()
