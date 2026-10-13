// Yetenek Havuzu — tasarımdaki ekranı veritabanına bağlar (filtre, liste, yetenek ekleme, Excel).
(function () {
  const q = (s, r = document) => r.querySelector(s), qa = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const liste = q(".profile-list");
  const sablon = q(".profile-row", liste).cloneNode(true);
  let sonVeri = [];

  function bildir(m) {
    let t = q("#cl-toast");
    if (!t) { t = document.createElement("div"); t.id = "cl-toast"; document.body.appendChild(t); }
    t.textContent = m; t.classList.add("acik");
    clearTimeout(bildir.z); bildir.z = setTimeout(() => t.classList.remove("acik"), 1800);
  }

  // --- Açılır listeler (tasarımdaki .select kutuları) ---
  const SECENEK = {
    Kategori: { anahtar: "kategori", liste: ["Tümü", "Oyuncu", "Model"] },
    Cinsiyet: { anahtar: "cinsiyet", liste: ["Tümü", "Kadın", "Erkek"] },
    "Yaş": { anahtar: "yas", liste: ["Tümü", "18-25", "18-35", "26-35", "36-50"] },
    "Şehir": { anahtar: "sehir", liste: ["Tümü"] },
    Uygunluk: { anahtar: "durum", liste: ["Tümü", "Uygun", "Opsiyonlu", "Dolu"] },
    "AI Eşleşme": { anahtar: "ai", liste: ["Tümü", "%80+", "%90+"] },
  };
  const secim = {};
  qa(".filter-panel .field").forEach(f => {
    const etiket = q("label", f)?.textContent.trim(), kutu = q(".select", f), tanim = SECENEK[etiket];
    if (!kutu || !tanim) return;
    kutu.dataset.anahtar = tanim.anahtar;
    secim[tanim.anahtar] = kutu.firstChild.textContent.trim();
    kutu.addEventListener("click", e => { e.stopPropagation(); menuAc(kutu, tanim); });
  });
  function menuAc(kutu, tanim) {
    qa(".cl-menu").forEach(m => m.remove());
    const m = document.createElement("div"); m.className = "cl-menu";
    tanim.liste.forEach(d => {
      const o = document.createElement("div"); o.className = "cl-secenek" + (d === secim[tanim.anahtar] ? " secili" : "");
      o.textContent = d; o.dataset.deger = d;
      o.onclick = e => { e.stopPropagation(); secim[tanim.anahtar] = d; kutu.firstChild.textContent = d + " "; m.remove(); };
      m.appendChild(o);
    });
    const k = kutu.getBoundingClientRect();
    Object.assign(m.style, { position: "fixed", top: k.bottom + 6 + "px", left: k.left + "px", width: k.width + "px" });
    document.body.appendChild(m);
  }
  ["click", "scroll"].forEach(o => document.addEventListener(o, () => qa(".cl-menu").forEach(m => m.remove()), true));

  const girdi = {
    ust: q(".castimus-standard-search input"),
    kelime: q('.filter-panel input[placeholder^="İsim"]'),
    etiket: q('.filter-panel input[placeholder^="Etiket"]'),
    beceri: q('.filter-panel input[placeholder^="Yetenek"]'),
  };
  Object.values(girdi).forEach(i => i && i.addEventListener("keydown", e => { if (e.key === "Enter") yukle(); }));

  function parametreler() {
    const p = new URLSearchParams();
    const kelime = (girdi.kelime.value || girdi.ust.value).trim();
    if (kelime) p.set("q", kelime);
    const etiket = (girdi.etiket.value || girdi.beceri.value).trim();
    if (etiket) p.set("etiket", etiket);
    for (const [k, v] of Object.entries(secim)) {
      if (!v || v === "Tümü") continue;
      p.set(k, k === "ai" ? v.replace(/\D/g, "") : v);
    }
    return p;
  }

  // --- Liste ---
  function avatar(ad) {
    const bas = ad.split(/\s+/).map(s => s[0] || "").join("").slice(0, 2).toLocaleUpperCase("tr");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#126ef5"/><stop offset="1" stop-color="#0aa56a"/></linearGradient></defs><rect width="300" height="360" fill="url(#g)"/><text x="150" y="205" font-family="Inter,Arial" font-size="110" font-weight="800" fill="#fff" text-anchor="middle">${bas}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function satir(r) {
    const a = sablon.cloneNode(true);
    q("h3", a).textContent = r.ad;
    const d = q(".name-status", a); d.className = "name-status " + r.durum_renk; d.textContent = r.durum;
    q(".name-rating", a).textContent = r.puan;
    q(".role-line", a).textContent = r.rol;
    const meta = qa(".meta-line > span", a);
    const yas = r.yas ? `${r.yas} yaşında${r.dogum ? ` (${r.dogum})` : ""}` : "";
    [`${r.sehir}, Türkiye`, yas, `Manager: ${r.manager}`].forEach((t, i) => meta[i] && (meta[i].lastChild.textContent = " " + t));
    const b = qa(".stats-grid b", a);
    [r.boy, r.kilo, r.sac, r.goz, r.beden, r.ayakkabi].forEach((v, i) => b[i] && (b[i].textContent = v || "—"));
    q(".lang-line", a).innerHTML = "<b>Diller:</b> " + esc(r.diller || "—");
    q(".tag-row", a).innerHTML = (r.etiketler || "").split(",").filter(Boolean).map(t => `<span>${esc(t.trim())}</span>`).join("");
    const ai = +r.ai || 0, renk = ai >= 85 ? "#27b36a" : ai >= 70 ? "#f28a1d" : "#ea4545";
    q(".donut", a).style.background = `conic-gradient(${renk} 0 ${ai}%, #e8edf5 ${ai}% 100%)`;
    q(".donut-inner", a).textContent = ai + "%";
    const li = qa(".ai-main li", a); if (li.length) li[li.length - 1].textContent = "Lokasyon: " + r.sehir;
    const tel = q(".contact-chip.phone span", a), mail = q(".contact-chip.mail span", a);
    if (tel) tel.textContent = r.telefon || "—"; if (mail) mail.textContent = r.eposta || "—";
    const img = q(".photo-box img", a); img.src = r.foto || avatar(r.ad); img.alt = r.ad;
    const id = q(".id-row div", a); if (id) id.textContent = "ID: " + r.kod;
    q(".photo-check input", a).addEventListener("change", sayaclar);
    a.dataset.kod = r.kod;
    return a;
  }
  function sayaclar() {
    const k = qa(".summary-box b");
    const n = sonVeri.length, ort = n ? Math.round(sonVeri.reduce((s, r) => s + (+r.ai || 0), 0) / n) : 0;
    if (k[1]) k[1].textContent = n.toLocaleString("tr");
    if (k[2]) k[2].textContent = ort + "%";
    if (k[3]) k[3].textContent = qa(".profile-list .photo-check input:checked").length;
    const g = q(".select-all-profiles span"); if (g) g.textContent = `${n} Profil Gösteriliyor`;
  }
  async function yukle(vurgu) {
    const v = await (await fetch("/api/yetenekler?" + parametreler())).json();
    sonVeri = v.sonuc;
    SECENEK["Şehir"].liste = ["Tümü", ...v.sehirler];
    liste.innerHTML = "";
    if (!v.sonuc.length) liste.innerHTML = '<div class="card cl-bos">Bu filtrelerle eşleşen yetenek yok.</div>';
    v.sonuc.forEach(r => liste.appendChild(satir(r)));
    const k = qa(".summary-box b"); if (k[0]) k[0].textContent = v.toplam.toLocaleString("tr");
    sayaclar();
    if (vurgu) { const el = q(`[data-kod="${vurgu}"]`); if (el) { el.classList.add("cl-yeni"); el.scrollIntoView({ behavior: "smooth", block: "center" }); } }
  }

  const btn = metin => qa(".filter-panel button").find(b => b.textContent.trim() === metin);
  btn("Filtrele")?.addEventListener("click", () => { yukle(); bildir("Filtre uygulandı"); });
  btn("Temizle")?.addEventListener("click", () => {
    Object.values(girdi).forEach(i => i && (i.value = ""));
    qa(".filter-panel .select[data-anahtar]").forEach(k => { secim[k.dataset.anahtar] = "Tümü"; k.firstChild.textContent = "Tümü "; });
    yukle(); bildir("Filtreler temizlendi");
  });
  q(".select-all-profiles input")?.addEventListener("change", e => { qa(".profile-list .photo-check input").forEach(c => c.checked = e.target.checked); sayaclar(); });

  // --- Excel (CSV) ---
  q(".excel-action")?.addEventListener("click", () => {
    const bas = ["ID", "Ad Soyad", "Rol", "Cinsiyet", "Şehir", "Yaş", "Boy", "Kilo", "Durum", "Telefon", "E-posta"];
    const sat = sonVeri.map(r => [r.kod, r.ad, r.rol, r.cinsiyet, r.sehir, r.yas, r.boy, r.kilo, r.durum, r.telefon, r.eposta]);
    const csv = "﻿" + [bas, ...sat].map(s => s.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    l.download = "yetenek-havuzu.csv"; l.click(); bildir("Excel dosyası indirildi");
  });

  // --- Yetenek Ekle ---
  const FORM = [
    ["ad", "Ad Soyad", "text", "örn. Deniz Aksoy"], ["rol", "Rol", "select", ["Oyuncu · Kadın Oyuncu", "Oyuncu · Erkek Oyuncu", "Model · Kadın Model", "Model · Erkek Model", "Oyuncu · Figüran"]],
    ["cinsiyet", "Cinsiyet", "select", ["Kadın", "Erkek"]], ["yas", "Yaş", "number", "25"],
    ["sehir", "Şehir", "text", "İstanbul"], ["durum", "Uygunluk", "select", ["Uygun", "Opsiyonlu", "Dolu"]],
    ["boy", "Boy", "text", "170 cm"], ["kilo", "Kilo", "text", "55 kg"], ["sac", "Saç", "text", "Kahverengi"],
    ["goz", "Göz", "text", "Ela"], ["beden", "Beden", "text", "36 (S)"], ["ayakkabi", "Ayakkabı", "text", "38"],
    ["diller", "Diller", "text", "Türkçe · İngilizce"], ["etiketler", "Etiketler (virgülle)", "text", "Doğal, Kamera önü, Reklam"],
    ["telefon", "Telefon", "text", "+90 5xx xxx xx xx"], ["eposta", "E-posta", "text", "ad@castimus.com"],
  ];
  function formAc() {
    const o = document.createElement("div"); o.className = "cl-perde";
    o.innerHTML = `<form class="cl-form card"><div class="cl-baslik"><h2>Yetenek Ekle</h2><button type="button" class="btn cl-kapat">Vazgeç</button></div>
      <div class="cl-izgara">${FORM.map(([k, l, t, p]) => `<label class="field"><span>${l}</span>${t === "select"
        ? `<select name="${k}">${p.map(x => `<option>${x}</option>`).join("")}</select>`
        : `<input name="${k}" type="${t}" placeholder="${p}">`}</label>`).join("")}
      <label class="field cl-foto"><span>Fotoğraf</span><input name="foto" type="file" accept="image/*"></label></div>
      <div class="cl-alt"><button type="submit" class="btn primary">Kaydet</button></div></form>`;
    document.body.appendChild(o);
    q(".cl-kapat", o).onclick = () => o.remove();
    q("form", o).onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), v = Object.fromEntries([...f.entries()].filter(([k]) => k !== "foto"));
      const dosya = f.get("foto");
      if (dosya && dosya.size) v.foto = await kucult(dosya);
      const c = await fetch("/api/yetenekler", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const r = await c.json();
      if (!c.ok) return bildir(r.hata || "Kaydedilemedi");
      o.remove(); bildir(`${r.ad} kaydedildi (${r.kod})`); yukle(r.kod);
    };
    setTimeout(() => q("input", o).focus(), 50);
  }
  function kucult(dosya) {
    return new Promise(ok => {
      const im = new Image(); im.onload = () => {
        const o = Math.min(1, 480 / im.width), c = document.createElement("canvas");
        c.width = im.width * o; c.height = im.height * o; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", .85));
      }; im.src = URL.createObjectURL(dosya);
    });
  }
  q(".add-action")?.addEventListener("click", formAc);

  yukle();
})();
