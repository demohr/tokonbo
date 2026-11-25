# PANDUAN — NEXALAP Commerce & CMS

Panduan lengkap pemasangan, operasional, dan pengembangan **NEXALAP**, toko online jual‑beli laptop & PC berbasis **1 halaman (SPA)** dengan **REST API Google Apps Script**, **database Google Sheets**, dan **penyimpanan gambar Google Drive**.

| Item | Nilai |
|---|---|
| Nama aplikasi | NEXALAP — Commerce & CMS Engine |
| Versi | 1.0.0 |
| Berkas | `index.html` (storefront + CMS), `code.gs` (backend), `PANDUAN.md` (dokumen ini) |
| Database | Google Sheets — 17 sheet |
| Media | Google Drive — folder `NEXALAP Media` |
| Bahasa | Indonesia · mata uang Rupiah · zona waktu Asia/Jakarta |
| Token sesi | 12 jam (HMAC‑SHA256) |
| Batas unggah | 8 MB per gambar |

---

## Daftar Isi

1. [Ringkasan & arsitektur](#1-ringkasan--arsitektur)
2. [Apa yang perlu disiapkan](#2-apa-yang-perlu-disiapkan)
3. [Instalasi backend (Apps Script)](#3-instalasi-backend-apps-script)
4. [Deploy sebagai Web App](#4-deploy-sebagai-web-app)
5. [Menghubungkan frontend](#5-menghubungkan-frontend)
6. [Login pertama & PIN](#6-login-pertama--pin)
7. [Tur storefront](#7-tur-storefront)
8. [Tur CMS / back office](#8-tur-cms--back-office)
9. [Modul CRUD satu per satu](#9-modul-crud-satu-per-satu)
10. [Gambar & Google Drive](#10-gambar--google-drive)
11. [Feature Manager (modular gating)](#11-feature-manager-modular-gating)
12. [Peran & hak akses](#12-peran--hak-akses)
13. [Referensi REST API](#13-referensi-rest-api)
14. [Struktur Google Sheets](#14-struktur-google-sheets)
15. [Alur bisnis & aturan hitung](#15-alur-bisnis--aturan-hitung)
16. [Kustomisasi tampilan](#16-kustomisasi-tampilan)
17. [Pemeliharaan, backup, keamanan](#17-pemeliharaan-backup-keamanan)
18. [Pemecahan masalah](#18-pemecahan-masalah)
19. [Lampiran: fungsi bantu & checklist go‑live](#19-lampiran-fungsi-bantu--checklist-go-live)

---

## 1. Ringkasan & arsitektur

```
┌────────────────────────────┐        HTTPS POST (JSON)        ┌──────────────────────────────┐
│  index.html                │  ───────────────────────────▶   │  Google Apps Script          │
│  · storefront (publik)     │  ◀───────────────────────────   │  doPost / doGet              │
│  · portal CMS (staf)       │        { ok, data, meta }       │  Router → 85 action          │
│  · mesin demo (offline)    │                                 └───────────┬──────────────────┘
└────────────────────────────┘                                             │
                                                            ┌──────────────┴───────────────┐
                                                            │                              │
                                                   Google Sheets (17 sheet)      Google Drive (media)
```

**Prinsip penting**

- **Satu berkas frontend.** Seluruh CSS, JavaScript, ikon (SVG inline), dan gambar demo (base64) tertanam di `index.html`. Tidak ada build step, tidak ada CDN wajib, tidak ada folder aset.
- **Mode demo otomatis.** Jika `CONFIG.API_URL` kosong, aplikasi memakai mesin data di dalam peramban (`DEMO`). Semua fungsi CRUD, laporan, POS, dan feature‑gating tetap berjalan — ideal untuk presentasi atau uji coba tanpa menyentuh Google sama sekali. Data demo kembali ke kondisi awal saat halaman di‑refresh.
- **Satu pintu API.** Semua aksi lewat satu endpoint dengan `action` di dalam payload. Tidak ada URL berbeda per resource sehingga tidak ada masalah CORS.
- **Gating dua lapis.** Setiap fitur diperiksa di backend (`featureOn_`) *dan* dirender kondisional di frontend (`F('kode.fitur')`).

---

## 2. Apa yang perlu disiapkan

| Kebutuhan | Catatan |
|---|---|
| Akun Google | Gratis. Disarankan akun khusus toko (bukan akun pribadi). |
| Google Spreadsheet | Satu spreadsheet baru, kosong. |
| Akses Apps Script | Menu **Extensions → Apps Script** pada spreadsheet. |
| Peramban modern | Chrome, Edge, Safari, Firefox versi 2 tahun terakhir. |
| Gambar produk | JPG/PNG/WebP, ideal 1200×900, maksimal 8 MB per berkas. |

Tidak diperlukan: server, hosting, database SQL, domain, atau langganan pihak ketiga. Untuk domain sendiri (opsional), lihat [§17](#17-pemeliharaan-backup-keamanan).

---

## 3. Instalasi backend (Apps Script)

1. Buka <https://sheets.new> → beri nama, misalnya **NEXALAP DB**.
2. Menu **Extensions → Apps Script**. Editor terbuka dengan file `Code.gs` kosong.
3. Hapus seluruh isi `Code.gs`, lalu **tempel seluruh isi `code.gs`** dari paket ini.
4. Simpan (`Ctrl/Cmd + S`). Nama proyek bebas, contoh **NEXALAP Engine**.
5. Pilih fungsi **`setupSistem`** pada dropdown di toolbar, klik **Run**.
6. Google meminta izin → **Review permissions** → pilih akun → **Advanced → Go to … (unsafe)** → **Allow**. Peringatan ini normal untuk skrip pribadi yang tidak dipublikasikan.
7. Buka **Execution log**. Akan tampil ringkasan seperti:

```
{
  "spreadsheet": "NEXALAP DB",
  "sheets": 17,
  "dibuat": ["PRODUCT", "CATEGORY", ...],
  "produk": 12,
  "staf": 6,
  "fitur": 41
}
```

**Apa yang dilakukan `setupSistem()`**

| Langkah | Efek |
|---|---|
| Menyimpan ID spreadsheet | Ke Script Property `NX_SHEET_ID` |
| Membuat 17 sheet + header | Sheet dibuat rapi, baris pertama dibekukan, header berwarna |
| Mengisi `FEATURE_REGISTRY` | 41 definisi fitur beserta dependensi, dampak, dan fallback |
| Seed data contoh | 5 kategori, 12 produk, 6 pelanggan, 9 pesanan, 3 tiket service, 1 trade‑in, 2 promo, 2 banner, 6 testimoni |
| Membuat secret token | Script Property `NX_SECRET` (HMAC) |
| Menyiapkan Drive | Folder `NEXALAP Media` + subfolder `produk`, `banner`, `kategori`, `umum`, `backup` |
| Membuat menu spreadsheet | Menu **NEXALAP** untuk menjalankan setup/seed/self‑test dari Sheets |

> **Penting:** jalankan `setupSistem()` **satu kali** pada spreadsheet kosong. Menjalankannya lagi aman (idempoten) — sheet dan header yang sudah ada tidak ditimpa, seed hanya mengisi baris yang belum ada.

### Fungsi bantu di editor Apps Script

| Fungsi | Kegunaan |
|---|---|
| `setupSistem()` | Instalasi awal (sheet, seed, fitur, Drive, secret). |
| `selfTest()` | 12 pemeriksaan mandiri: koneksi sheet, 17 sheet, registry fitur, login Owner, bootstrap publik, daftar produk, grafik, laporan, guard fitur, folder Drive. |
| `resetDataContoh()` | Memulihkan data contoh (menghapus data lalu seed ulang). |
| `kosongkanData()` | Mengosongkan produk/pesanan/pelanggan/etc. namun **mempertahankan** staf, pengaturan, dan konfigurasi fitur — dipakai saat go‑live. |
| `ping_()` | Cek cepat backend hidup. |

Jalankan `selfTest()` sebelum go‑live. Semua baris harus `PASS`; jika ada `FAIL`, kolom *info* menyebut penyebabnya. Hasilnya juga dicetak ke Execution log dalam bentuk tabel `PASS/FAIL`.

---

## 4. Deploy sebagai Web App

1. Di editor Apps Script klik **Deploy → New deployment**.
2. Ikon gerigi → pilih **Web app**.
3. Isi:

| Kolom | Nilai |
|---|---|
| Description | `NEXALAP API v1` |
| Execute as | **Me (email Anda)** |
| Who has access | **Anyone** |

4. **Deploy** → salin **Web app URL**, bentuknya:

```
https://script.google.com/macros/s/AKfycb..................../exec
```

5. Uji di peramban: buka `URL?action=ping`. Harus muncul JSON:

```json
{"ok":true,"data":{"pong":true,"app":"NEXALAP","version":"1.0.0","time":"..."},"meta":{...}}
```

> **Wajib "Anyone".** Jika memilih *Anyone with Google account*, storefront publik tidak bisa membaca data karena peramban pengunjung tidak membawa sesi Google. Backend tetap aman karena setiap aksi non‑publik menuntut token staf.

### Setiap kali `code.gs` diubah

**Deploy → Manage deployments → ✏️ (Edit) → Version: New version → Deploy.** URL tetap sama. Tanpa langkah ini, URL `/exec` masih menjalankan versi lama.

---

## 5. Menghubungkan frontend

1. Buka `index.html` dengan editor teks apa pun.
2. Cari baris paling atas skrip konfigurasi:

```js
var CONFIG = {
  API_URL: '',                 /* ← tempel URL /exec Google Apps Script di sini */
  BRAND: 'NEXALAP',
  WA_FALLBACK: '6281234567890',
  TIMEOUT: 20000,
  PAGE_SIZE: 8,
  VERSION: '1.0.0'
};
```

3. Tempel URL `/exec` di antara tanda kutip:

```js
API_URL: 'https://script.google.com/macros/s/AKfycb..../exec',
```

4. Simpan. Buka `index.html` di peramban — status di halaman Sistem akan berubah dari **Demo (memori)** menjadi **Produksi**.

**Cara hosting frontend**

| Cara | Langkah | Catatan |
|---|---|---|
| Berkas lokal | Klik dua kali `index.html` | Cukup untuk uji coba; sebagian peramban membatasi penyimpanan lokal. |
| Google Drive | Unggah → bagikan → pratinjau | Cepat, tetapi URL kurang profesional. |
| Netlify / Vercel / Cloudflare Pages | Tarik‑lepas folder berisi `index.html` | Gratis, HTTPS, domain kustom. **Disarankan.** |
| GitHub Pages | Push → Settings → Pages | Gratis, cocok untuk pengembangan. |

Tidak ada konfigurasi server tambahan: tanpa build, tanpa bundler, tanpa rewrites. Semua rute memakai hash (`#/`, `#/admin/produk`) sehingga hosting statis apa pun bekerja.

---

## 6. Login pertama & PIN

Buka `index.html#/admin`. Masuk dengan keypad PIN:

| Peran | PIN demo | Gunakan untuk |
|---|---|---|
| OWNER | `1234` | Semua modul, termasuk Staf, Fitur, Sistem |
| ADMIN | `2345` | Operasional harian |
| KASIR | `3456` | POS & pesanan |
| GUDANG | `4567` | Produk, kategori, media |
| TEKNISI | `5678` | Service & tukar tambah |
| MARKETING | `6789` | Konten, promo, pelanggan, laporan |

**Segera setelah login pertama:**

1. **Staf → Owner → Edit → PIN baru** (atau klik **Reset PIN** lalu catat PIN yang ditampilkan).
2. Ulangi untuk setiap staf; hapus akun yang tidak dipakai.
3. Ganti PIN lewat menu profil (kanan bawah sidebar) memakai **PIN lama + PIN baru**.

PIN disimpan sebagai `SHA-256(salt::pin)` di sheet `STAFF` — bukan teks biasa. PIN hanya ditampilkan satu kali saat dibuat/direset.

---

## 7. Tur storefront

Urutan section storefront. Semua kecuali header/footer bisa dimatikan lewat Feature Manager.

| # | Section | Isi | Fitur |
|---|---|---|---|
| 1 | Topbar | Gratis ongkir, nomor WA, tautan lacak | selalu tampil |
| 2 | Header | Logo, navigasi, tema, keranjang, tombol Admin | `storefront.tema`, `storefront.keranjang` |
| 3 | Hero | Headline gradien, CTA, kartu visual + banner, rating & jumlah ulasan | `storefront.hero` |
| 4 | Ticker | Marquee promo berjalan | `storefront.ticker` |
| 5 | Stats | 4 angka sosial dengan animasi hitung | `storefront.stats` |
| 6 | Kenapa Kami | 6 keunggulan + strip brand | `storefront.keunggulan` |
| 7 | Katalog | Pencarian, urutan, filter, tab kategori, kartu produk, muat lebih banyak | `storefront.katalog` |
| 8 | PC Rakitan | Paket siap pakai dengan spesifikasi ringkas | `storefront.paket` |
| 9 | Service | Alur 4 langkah + tombol daftar service | `storefront.layanan` |
| 10 | Tukar Tambah | Kalkulator estimasi real‑time + ajukan | `storefront.tukar_tambah` |
| 11 | Benefit | 4 jaminan layanan bertumpuk | — |
| 12 | Testimoni | Skor besar + kartu ulasan | `storefront.testimoni` |
| 13 | FAQ | Accordion 8 pertanyaan | `storefront.faq` |
| 14 | CTA Band | Ajakan besar dengan gradien | `storefront.cta` |
| 15 | Kontak | Alamat, jam, peta, form prospek | `storefront.kontak`, `pelanggan.lead` |
| 16 | Footer | Navigasi, kontak, sosial, tautan admin | selalu tampil |
| 17 | Keranjang | Drawer kanan, ubah qty, hapus, checkout | `storefront.keranjang` |
| 18 | FAB | WhatsApp + kembali ke atas | `storefront.wa_float` |
| 19 | Bottom nav | Katalog, lacak, keranjang, WhatsApp (mobile) | `storefront.keranjang`, `storefront.lacak` |

**Alur belanja online**

1. Pengunjung memilih produk → **Tambah ke keranjang** (animasi terbang ke ikon keranjang).
2. Buka drawer → **Checkout sekarang**.
3. Isi nama, WhatsApp, kota, alamat, metode bayar; kode promo opsional (`NEXA10` untuk 10%, `ONGKIRGRATIS` untuk potongan ongkir).
4. **Buat pesanan** → pesanan tersimpan berstatus `MENUNGGU`, muncul kode `INV-xxxx`.
5. Modal sukses menyediakan **Salin**, **Unduh struk**, dan **Kirim WhatsApp** dengan pesan siap kirim.
6. Staf membuka **Pesanan → Lunasi** saat pembayaran diterima → stok terpotong, poin pelanggan bertambah.

---

## 8. Tur CMS / back office

### Kerangka

- **Sidebar** dikelompokkan: Ringkasan, Penjualan, Katalog, Layanan, Pemasaran, Sistem. Item yang fiturnya nonaktif **hilang seluruhnya**; jika semua modul mati untuk sebuah peran, muncul layar "Tidak ada modul yang dapat diakses".
- **Topbar** memuat judul modul, deskripsi singkat, lonceng notifikasi, tombol tema, tombol ke storefront.
- **Body** memakai skeleton saat memuat, transisi masuk halus, dan panel/kolom yang menyesuaikan lebar layar.
- **Profil** di bawah sidebar: buka storefront, ganti PIN, keluar.

### Dashboard

| Blok | Isi |
|---|---|
| 4 KPI | Omzet hari ini, omzet bulan ini + laba kotor, pesanan menunggu, nilai stok |
| Grafik omzet | Garis 7/14/30 hari (tombol segmen), total periode di judul |
| Komposisi kategori | Donat dengan legenda nilai rupiah |
| Metode bayar | Batang horizontal |
| Transaksi harian | Batang jumlah transaksi |
| Status pesanan | Donat status |
| Transaksi terbaru | 6 pesanan terakhir, bisa diklik ke modul pesanan |
| Stok menipis | 8 produk ≤ 5 unit (bisa dimatikan) |
| Produk terlaris | 5 produk + harga |

Grafik memakai SVG yang dirender di sisi klien dari data `/dash.charts`, sehingga **selalu ikut data terbaru** setelah transaksi baru.

### Laporan

1. Pilih rentang tanggal atau tombol cepat **7/30/90 hari** → **Terapkan**.
2. KPI: omzet, laba kotor, rata‑rata transaksi, diskon.
3. Grafik: tren omzet harian, metode pembayaran, kontribusi kategori.
4. Tabel produk paling menguntungkan (qty, omzet, laba).
5. **CSV** mengunduh berkas untuk Excel/Sheets; **Cetak** membuka jendela cetak rapi.

### POS (Kasir)

- Grid produk dengan pencarian (`F2`), tab kategori, badge stok; klik untuk menambah.
- Panel kanan: item, ubah qty, hapus, pelanggan opsional, kode promo, diskon manual, metode bayar.
- Tombol uang cepat (nominal pas, 50rb, 100rb, 200rb) dan kembalian otomatis.
- **Bayar (F9)** → transaksi `LUNAS`, stok langsung terpotong, struk muncul (salin / cetak / kirim WA).
- `Esc` mengosongkan keranjang.

---

## 9. Modul CRUD satu per satu

Setiap modul memiliki pola sama: tabel/kartu → tombol **+ Baru** → form modal → simpan → tabel langsung menampilkan data terbaru. Semua tombol hapus meminta konfirmasi.

### Produk (`admin.produk`)

- **Lihat**: pencarian (nama/SKU/brand), filter kategori & status, KPI total/aktif/arsip/menipis, badge *Bekas* dan *Paket*, harga coret.
- **Tambah/Edit**: nama, SKU (otomatis bila kosong), kategori, brand, tipe (unit/paket), kondisi (baru/bekas), garansi, harga jual, harga coret, HPP, stok, urutan, status, unggulan, deskripsi, spesifikasi (`Kunci: Nilai` per baris), gambar.
- **Ubah status cepat**: ikon mata (AKTIF ↔ ARSIP) — produk arsip hilang dari storefront namun riwayat penjualan tetap.
- **Hapus**: hanya OWNER/ADMIN, dengan konfirmasi berisi nama produk.
- **Ekspor CSV**: semua kolom penting.

### Kategori (`admin.kategori`)

Kartu dengan gambar, ikon, jumlah produk, status aktif. Form: nama, deskripsi, urutan, ikon (10 pilihan), gambar. Kategori **tidak bisa dihapus** jika masih dipakai produk — pesan galat menyebut jumlah produk.

### Pustaka Media (`admin.media`)

Galeri gambar Drive. Aksi: **unggah** (tombol atau tarik‑lepas), **salin URL**, **ubah nama**, **hapus** (ke trash Drive). Filter folder & pencarian nama. Lihat [§10](#10-gambar--google-drive).

### Pesanan (`admin.pesanan`)

- KPI total/menunggu/lunas/omzet, filter status & tipe (ONLINE/POS), pencarian.
- **Detail**: item, total, ongkir, diskon, data pelanggan; aksi **Tandai lunas**, **Batalkan** (dengan alasan wajib), **Struk**, **Hapus** (OWNER/ADMIN).
- Efek lunas: stok turun, terjual naik, poin pelanggan bertambah, `total_belanja` & tier diperbarui, promo `terpakai` naik.
- Efek void: stok & terjual dipulihkan, tier pelanggan dihitung ulang, alasan dicatat di `catatan` dan audit log.

### Pelanggan (`admin.pelanggan`)

Kartu KPI (total, VIP, nilai belanja, poin beredar). Tabel dengan tier, progres ke tier berikutnya, total belanja, jumlah transaksi, poin. **Detail** menampilkan tab Pesanan / Service / Tukar Tambah. Aksi: WhatsApp langsung, edit, **sesuaikan poin** (delta + alasan wajib), hapus.

### Service (`admin.service`)

Dua tampilan:

- **Kanban** 6 kolom (MASUK, DIAGNOSA, DIKERJAKAN, SELESAI, DIAMBIL, BATAL). Kartu bisa **ditarik** ke kolom lain → status langsung tersimpan. Klik kartu untuk membuka form.
- **Tabel** untuk melihat keluhan, teknisi, dan biaya sekaligus.

Form tiket: nama, WA, perangkat, kategori, keluhan, status, teknisi, estimasi, biaya final, catatan. Tiket dari form publik storefront otomatis muncul di kolom MASUK.

### Tukar Tambah (`admin.tradein`)

KPI total/baru/disetujui/nilai. Tabel dengan estimasi sistem dan penawaran final. **Review** menampilkan estimasi (dari mesin hitung yang sama dengan storefront), memungkinkan perubahan harga awal & kondisi lalu **Hitung ulang**. **Setujui** meminta nilai penawaran final dan nama produk; backend otomatis membuat produk **BEKAS** baru dengan harga jual `penawaran × (1 + margin%)` dibulatkan ke ribuan, stok 1, garansi toko 1 bulan. **Tolak** meminta alasan.

### Promo (`admin.promo`)

Kartu promo: kode, judul, badge berlaku/tidak, nilai, minimum belanja, maksimum diskon, pemakaian/kuota, periode. Sakelar aktif di kartu langsung menyimpan. Form: kode, judul, tipe (persen/nominal), nilai, min belanja, maks diskon, mulai, berakhir, kuota, aktif. Kode duplikat ditolak.

### Konten Web (`admin.konten`)

Tiga tab:

- **Banner hero** — gambar, judul, subjudul, tautan, urutan, status. Banner aktif pertama dipakai di hero storefront.
- **Testimoni** — nama, kota, produk, rating 1–5, ulasan, status.
- **FAQ** — pertanyaan & jawaban; urutan mengikuti urutan daftar.

Semua perubahan langsung tercermin di storefront setelah halaman dimuat ulang.

### Staf (`admin.staf`)

Tabel akun: nama, WA, role, status, login terakhir. Aksi: edit, **reset PIN** (PIN baru ditampilkan sekali), hapus (akun sendiri tidak bisa dihapus). Form menyertakan PIN opsional — kosongkan saat edit untuk mempertahankan PIN lama. Di bawah tabel ada matriks penjelasan hak akses setiap role.

### Feature Manager (`admin.fitur`)

Lihat [§11](#11-feature-manager-modular-gating).

### Pengaturan (`admin.pengaturan`)

Empat tab: **Profil toko** (nama, tagline, deskripsi, alamat, kota, provinsi, WA, email, jam, tahun berdiri, Instagram, TikTok), **Operasional** (rekening/QRIS, ongkir default, minimum gratis ongkir, PPN, poin per Rp1.000, nilai poin, margin & bonus trade‑in), **Template WhatsApp** (pesan pesanan dengan variabel), **Teks storefront** (headline hero, sub‑headline, teks ticker). Tombol **Simpan** menempel di bawah layar.

### Audit Log (`admin.audit`)

Semua aksi penting tercatat: waktu, aksi, pengguna, role, entitas, detail. Filter aksi & pencarian teks, ekspor CSV.

### Sistem (`admin.sistem`)

Mode aplikasi, versi, zona waktu, nama spreadsheet & folder Drive, jumlah fitur aktif, jumlah action API, tombol buka spreadsheet. Daftar isi database per sheet. Tiga aksi: **backup** (salinan spreadsheet ke folder `backup`), **hangatkan cache**, **kosongkan data** (menuntut mengetik `RESET`).

---

## 10. Gambar & Google Drive

### Cara kerja

1. Pengguna memilih berkas pada pemilih gambar (form produk, kategori, banner, media).
2. Frontend **mengompres** gambar ke JPEG kualitas 0,86 dengan sisi terpanjang 1400 px memakai `<canvas>` — berkas 5 MB biasanya menjadi ±200–400 KB.
3. Data URL dikirim ke `media.upload`:

```json
{ "action": "media.upload", "token": "…", "data": "data:image/jpeg;base64,…", "nama": "nexabook-ultra", "folder": "produk" }
```

4. Backend mendekode base64, memeriksa tipe & ukuran (≤ 8 MB), lalu membuat berkas di subfolder Drive (`produk`, `banner`, `kategori`, `umum`, `backup`) di bawah **NEXALAP Media**.
5. Berkas dibagikan *anyone with link (viewer)* agar bisa tampil di storefront.
6. Baris `MEDIA` menyimpan `drive_id`, `url`, `thumb`, `lebar`, `tinggi`, `folder`.
7. URL gambar: `https://lh3.googleusercontent.com/d/<drive_id>=w1400`; versi thumbnail memakai `=w600`.

### Mengganti gambar tanpa membuat berkas baru

Kirim `media.upload` dengan `drive_id` yang sudah ada; isi berkas diganti di tempat sehingga semua produk yang memakainya otomatis ikut berubah. Di UI, tombol **Pustaka** memilih gambar yang sudah ada, sedangkan **Unggah** membuat berkas baru.

### Menghapus

`media.delete` memindahkan berkas ke **trash Drive** (bisa dipulihkan ±30 hari) dan menghapus baris `MEDIA`. Produk yang masih menunjuk `drive_id` tersebut akan menampilkan kotak kosong — ganti gambarnya sebelum menghapus.

### Reparasi tautan

Jika URL gambar berubah (mis. Drive mengubah pola), jalankan `media.repair` (OWNER) untuk menulis ulang `url`/`thumb` semua baris `MEDIA` dari `drive_id`.

### Jika fitur `admin.media` dinonaktifkan

Tombol unggah & pustaka hilang dari semua form; pemilih gambar berganti menjadi kolom URL manual. Gambar yang sudah ada tetap tampil.

---

## 11. Feature Manager (modular gating)

Feature Manager adalah inti permintaan "modular": **satu sakelar mematikan seluruh jejak sebuah modul**.

### Isi halaman

- Ringkasan: `n / total fitur aktif` + badge.
- **Preset**: `Toko Retail`, `Full Commerce`, `Marketing First`, `Katalog Saja` — sekali klik menerapkan sekumpulan nilai.
- **Reset**: menghapus semua override dan kembali ke nilai bawaan.
- Daftar per modul (Storefront, Back-office, POS, Transaksi, CRM, Analitik, Utilitas) dengan **kode fitur**, **dampak** yang ditulis dalam bahasa manusia, dan **dependensi**.
- Untuk fitur publik: satu sakelar **Publik**. Untuk fitur admin: kotak centang per role (OWNER, ADMIN, KASIR, GUDANG, TEKNISI, MARKETING).
- Riwayat perubahan (siapa, kapan, ON/OFF).

### Yang terjadi saat fitur dimatikan

| Lapisan | Perilaku |
|---|---|
| Sidebar CMS | Item menu dihapus; jika modul yang sedang dibuka ikut mati, pengguna dialihkan ke modul aktif pertama |
| Storefront | Section, tautan navigasi, footer link, dan tombol terkait tidak dirender sama sekali |
| Modal & form | Tombol pembuka tidak ada; endpoint API menolak dengan `FEATURE_OFF` |
| Laporan & grafik | Blok/kolom terkait disembunyikan (mis. `dash.grafik` → dashboard hanya KPI angka) |
| Tindakan turunan | `product.save`, `order.pay`, `pos.checkout`, dll. diblokir bila modul induk mati |
| Navigasi depan | Preset `KATALOG` menyembunyikan keranjang, checkout, pesanan, service, trade‑in, POS |
| Dependensi | Fitur dengan dependensi otomatis ikut tidak aktif (mis. `storefront.paket` butuh `storefront.katalog`) |

Perubahan berlaku **saat itu juga**: shell CMS dirender ulang, dan storefront memuat ulang fitur pada navigasi berikutnya.

### Contoh skenario

| Kebutuhan | Setelan |
|---|---|
| Toko hanya ingin jadi etalase (tanpa transaksi) | Nonaktifkan `storefront.keranjang`, `storefront.checkout`, `pesanan.online` |
| Tutup sementara pesanan online saat libur | Nonaktifkan `pesanan.online` (keranjang tetap bisa untuk WA) |
| Stok opname: gudang tidak boleh buka POS | Centang `pos.access` hanya untuk OWNER/ADMIN/KASIR |
| Storefront tanpa tukar tambah | Nonaktifkan `storefront.tukar_tambah` |
| Laporan disembunyikan dari marketing | Hapus centang `admin.laporan` untuk MARKETING |

---

## 12. Peran & hak akses

| Modul | OWNER | ADMIN | KASIR | GUDANG | TEKNISI | MARKETING |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Laporan | ✅ | ✅ | – | – | – | ✅ |
| POS | ✅ | ✅ | ✅ | – | – | – |
| Pesanan | ✅ | ✅ | ✅ | – | – | – |
| Pelanggan | ✅ | ✅ | ✅ | – | – | – |
| Produk | ✅ | ✅ | – | ✅ | – | ✅ |
| Kategori | ✅ | ✅ | – | ✅ | – | ✅ |
| Media | ✅ | ✅ | – | ✅ | – | ✅ |
| Service | ✅ | ✅ | ✅ | – | ✅ | – |
| Tukar Tambah | ✅ | ✅ | ✅ | – | ✅ | – |
| Promo | ✅ | ✅ | – | – | – | ✅ |
| Konten Web | ✅ | ✅ | – | – | – | ✅ |
| Staf | ✅ | – | – | – | – | – |
| Feature Manager | ✅ | – | – | – | – | – |
| Pengaturan | ✅ | ✅ | – | – | – | – |
| Audit Log | ✅ | ✅ | – | – | – | – |
| Sistem | ✅ | – | – | – | – | – |

**Aksi khusus OWNER:** hapus staf, reset PIN, toggle/preset/reset fitur, backup, reset data, repair media.
**Aksi yang butuh ADMIN+:** hapus produk/kategori/pesanan/pelanggan/service/trade‑in/promo/banner/testimoni, approve trade‑in.

Hak akses diperiksa **dua kali**: sidebar/route (frontend) dan `ROUTES[action].roles` (backend). Upaya memanggil endpoint terlarang mengembalikan `FORBIDDEN`; upaya memanggil modul yang dimatikan mengembalikan `FEATURE_OFF`.

---

## 13. Referensi REST API

**Endpoint:** `POST <URL /exec>` dengan `Content-Type: text/plain;charset=utf-8` (menghindari preflight CORS).

```json
{ "action": "product.list", "token": "<token>", "q": "nexabook", "page": 1, "limit": 10 }
```

**Alternatif GET (untuk JSONP):**

```
<URL /exec>?action=ping
<URL /exec>?payload={"action":"product.list","q":"nexa"}&callback=cb
```

### Bentuk respons

```json
{ "ok": true, "data": { }, "meta": { "ms": 132, "ts": "2026-11-25T10:00:00.000Z", "version": "1.0.0" } }
{ "ok": false, "error": { "code": "OUT_OF_STOCK", "message": "Stok NexaBook Ultra 14 OLED tidak cukup (sisa 2)", "hint": "Kurangi jumlah atau pilih unit lain." } }
```

| Kode | Arti | Tindakan UI |
|---|---|---|
| `BAD_REQUEST` | Input tidak valid | Tampilkan pesan di toast/form |
| `UNAUTHORIZED` | Token absen/kedaluwarsa/PIN salah | Hapus token, arahkan ke login |
| `FORBIDDEN` | Role tidak berhak | Toast galat |
| `FEATURE_OFF` | Modul dinonaktifkan | Toast + `hint` menjelaskan |
| `NOT_FOUND` | Data tidak ada | Toast galat |
| `DUPLICATE` | Kode/SKU ganda | Sorot kolom terkait |
| `OUT_OF_STOCK` | Stok tidak cukup | Toast galat |
| `SERVER_ERROR` | Kesalahan backend | Toast + anjurkan coba lagi |

### Daftar action

**Publik** (tanpa token): `ping`, `public.bootstrap`, `public.products`, `public.product`, `public.promo.check`, `public.order.create`, `public.track`, `public.service.apply`, `public.tradein.calc`, `public.tradein.apply`, `public.lead`, `public.testimonials`.

**Auth**: `auth.login`, `auth.me`, `auth.changePin`.

**Dashboard & laporan**: `dash.stats`, `dash.charts`, `report.summary`.

**Produk**: `product.list`, `product.get`, `product.save`, `product.delete`, `product.bulkDelete`, `product.toggle`, `product.import`, `product.export`.

**Kategori**: `category.list`, `category.save`, `category.delete`.

**Media**: `media.list`, `media.folders`, `media.upload`, `media.delete`, `media.rename`, `media.repair`.

**Pesanan & POS**: `order.list`, `order.get`, `order.pay`, `order.void`, `order.delete`, `pos.lookup`, `pos.checkout`, `pos.stock`.

**Pelanggan**: `customer.list`, `customer.get`, `customer.save`, `customer.delete`, `customer.points`.

**Service**: `service.list`, `service.save`, `service.status`, `service.delete`.

**Tukar tambah**: `tradein.list`, `tradein.review`, `tradein.approve`, `tradein.reject`, `tradein.delete`.

**Promo**: `promo.list`, `promo.save`, `promo.delete`, `promo.toggle`.

**Konten**: `content.get`, `banner.save`, `banner.delete`, `testi.save`, `testi.delete`.

**Staf & sistem**: `staff.list`, `staff.save`, `staff.delete`, `staff.resetPin`, `settings.get`, `settings.save`, `audit.list`, `system.info`, `system.backup`, `system.reset`, `system.warm`.

**Fitur**: `feature.list`, `feature.toggle`, `feature.bulk_toggle`, `feature.reset`, `feature.preset.list`, `feature.preset.apply`, `feature.log`, `feature.impact`.

### Contoh

```bash
# cek hidup
curl -L "https://script.google.com/macros/s/XXX/exec?action=ping"

# daftar produk publik
curl -L -X POST "https://script.google.com/macros/s/XXX/exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"public.products","kategori":"Laptop","limit":4}'

# login lalu simpan produk
TOKEN=$(curl -sL -X POST ".../exec" -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"auth.login","pin":"1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')

curl -sL -X POST ".../exec" -H "Content-Type: text/plain;charset=utf-8" \
  -d "{\"action\":\"product.save\",\"token\":\"$TOKEN\",\"data\":{\"nama\":\"NexaBook Uji\",\"kategori\":\"Laptop\",\"harga\":9500000,\"stok\":3}}"
```

---

## 14. Struktur Google Sheets

| # | Sheet | Isi | Kolom penting |
|---|---|---|---|
| 1 | `PRODUCT` | Katalog | id, sku, nama, kategori, brand, tipe, kondisi, harga, harga_coret, harga_beli, stok, garansi, gambar, deskripsi, spesifikasi, unggulan, status, terjual, rating, urutan |
| 2 | `CATEGORY` | Master kategori | id, nama, slug, ikon, deskripsi, gambar, urutan, aktif |
| 3 | `CUSTOMER` | Pelanggan | id, nama, wa, email, kota, alamat, total_belanja, trx, poin, tier, catatan |
| 4 | `ORDER` | Pesanan online & POS | id, tanggal, tipe, nama, wa, alamat, kota, items (JSON), subtotal, diskon, promo, ongkir, total, metode, status, sumber, catatan |
| 5 | `SERVICE` | Tiket servis | id, tanggal, nama, wa, perangkat, kategori, keluhan, teknisi, status, estimasi, biaya, catatan |
| 6 | `TRADEIN` | Pengajuan tukar tambah | id, tanggal, nama, wa, perangkat, kategori, brand, tahun, kondisi, harga_awal, estimasi_lo, estimasi_hi, penawaran, status, catatan |
| 7 | `PROMO` | Kode promo | id, kode, judul, tipe, nilai, min_belanja, maks_diskon, mulai, akhir, kuota, terpakai, aktif |
| 8 | `BANNER` | Banner hero | id, judul, subjudul, gambar, link, urutan, aktif |
| 9 | `TESTI` | Testimoni | id, nama, kota, rating, pesan, avatar, produk, urutan, aktif |
| 10 | `MEDIA` | Indeks gambar Drive | id, nama, mime, ukuran, drive_id, url, thumb, lebar, tinggi, folder |
| 11 | `STAFF` | Akun staf | id, nama, wa, role, pin_hash, pin_salt, aktif, dibuat, last_login |
| 12 | `SETTING` | Key–value pengaturan | id, value |
| 13 | `AUDIT` | Log aktivitas | id, tanggal, user, role, aksi, entitas, entitas_id, detail |
| 14 | `COUNTER` | Penomoran otomatis | id, value |
| 15 | `FEATURE_REGISTRY` | 41 definisi fitur | id, kode, nama, modul, deskripsi, default_status, roles, dependencies, conflicts, fallback, dampak, versi |
| 16 | `FEATURE_ACCESS` | Override per role | id, feature_kode, role, enabled, diubah_oleh, diubah_pada |
| 17 | `FEATURE_LOG` | Riwayat toggle | id, tanggal, feature_kode, role, dari, ke, oleh, alasan |

**Format data**

- Uang disimpan sebagai **angka** (bukan teks `Rp`). Format tampilan diurus frontend.
- `items` pada `ORDER` disimpan sebagai JSON: `[{"sku":"LAP-001","nama":"…","qty":1,"harga":15999000,"gambar":"…"}]`.
- `spesifikasi` pada `PRODUCT` disimpan sebagai JSON objek `{"Prosesor":"…","RAM":"…"}`.
- Tanggal memakai ISO 8601 (`2026-11-25T10:00:00.000Z`).
- Angka 1/0 dipakai untuk boolean (`aktif`, `unggulan`, `enabled`).

> Anda boleh mengedit spreadsheet secara manual, tetapi pertahankan **header kolom** dan hindari menyisipkan kolom di tengah. Setelah edit manual, klik **Sistem → Hangatkan cache** atau muat ulang halaman.

---

## 15. Alur bisnis & aturan hitung

### Status

| Entitas | Nilai |
|---|---|
| Pesanan | `MENUNGGU` → `LUNAS`, atau `MENUNGGU`/`LUNAS` → `VOID` |
| Service | `MASUK` → `DIAGNOSA` → `DIKERJAKAN` → `SELESAI` → `DIAMBIL`, kapan pun `BATAL` |
| Tukar tambah | `BARU` → `DISETUJUI` / `DITOLAK` |

### Stok

- Stok & `terjual` **hanya** berubah saat status menjadi `LUNAS`. Pesanan `MENUNGGU` belum memotong stok.
- Pembatalan pesanan `LUNAS` mengembalikan stok dan mengurangi `terjual`.
- Transaksi POS langsung `LUNAS` sehingga langsung memotong stok.

### Poin & tier pelanggan

```
tier   : BRONZE (0) · SILVER (≥1 jt) · GOLD (≥5 jt) · PLATINUM (≥15 jt)
poin   : ⌊total / 1000⌋ × faktor tier   (BRONZE 1× · SILVER 1,25× · GOLD 1,5× · PLATINUM 2×)
nilai  : 1 poin = Rp1.000 (dapat diubah di Pengaturan)
```

Poin ditambahkan saat pesanan `LUNAS`; `total_belanja` dan tier dihitung ulang otomatis.

### Promo

- `PERSEN`: diskon = `subtotal × nilai / 100`, dibatasi `maks_diskon` bila diisi.
- `NOMINAL`: diskon = `nilai`, dibatasi `maks_diskon` bila diisi.
- Syarat: aktif, dalam periode `mulai`–`akhir`, kuota belum habis, `subtotal ≥ min_belanja`.
- Diskon tidak pernah melebihi subtotal. `terpakai` bertambah setiap pelunasan/pembayaran POS.

### Ongkir

`ongkir_default` dipakai bila subtotal < `gratis_ongkir_min`; di atas ambang itu ongkir menjadi 0 (default ambang Rp5.000.000).

### Tukar tambah

```
nilai_dasar   = harga_awal × faktor_umur × faktor_kondisi × faktor_brand × faktor_kategori
estimasi_lo   = nilai_dasar × 0,94
estimasi_hi   = nilai_dasar × 1,06
bonus_upgrade = nilai_dasar × bonus_pct (default 5%)
harga_jual_produk_bekas = round(penawaran × (1 + margin_pct/100), -3)
```

Faktor umur menurun mengikuti selisih tahun, faktor kondisi: MULUS > BAIK > NORMAL > MINUS > RUSAK. Kalkulator yang sama dipakai di storefront dan di modal review agar angka konsisten.

---

## 16. Kustomisasi tampilan

### Mengganti identitas merek

1. **Cara termudah:** CMS → **Pengaturan → Profil toko** (nama, tagline, deskripsi, alamat, kontak, sosial). Nama & tagline langsung dipakai header, footer, dan judul halaman.
2. **Cara mendalam** (ubah `index.html`):

```css
:root{
  --brand-600:#2557e6;   /* warna utama */
  --brand-700:#1e44c4;   /* hover */
  --violet:#7c5cff;      /* aksen gradien */
  --mint:#0fbf94;        /* sukses */
  --grad-brand:linear-gradient(135deg,#2557e6 0%,#5b52f0 52%,#8b5cf6 100%);
  --grad-text:linear-gradient(120deg,#1e44c4 0%,#5b52f0 45%,#8b5cf6 100%);
  --font-display:'Plus Jakarta Sans',Inter,system-ui,sans-serif;
  --font-body:'Inter',system-ui,sans-serif;
}
```

Mengganti `--brand-600` dan `--grad-brand` sudah mengubah tombol, tautan aktif, grafik, badge, dan sorotan secara menyeluruh.

### Mengganti logo

Logo adalah SVG inline pada fungsi `I('laptop')` (peta `ICONS`). Ganti isi `<path>`/`<rect>` dengan bentuk logo Anda, atau ganti blok `<span class="brand-mark">` di `brandHTML()`.

### Mengganti gambar demo

Gambar bawaan disimpan sebagai `window.__ASSETS` (data URI base64) di blok `<script>` pertama. Untuk memakai foto asli:

1. Unggah foto ke **Pustaka Media** → salin URL gambar.
2. **Konten Web → Banner** untuk hero, atau **Produk → gambar** untuk katalog.
3. Alternatif cepat: ganti nilai kunci pada `window.__ASSETS` (mis. `hero`, `ultrabook`, `gaming`) dengan URL Drive Anda.

### Warna mode gelap

Mode gelap memakai `html[data-theme="dark"]` dengan variabel permukaan (`--surface`, `--bg`, `--line`, `--text`). Ubah blok tersebut untuk menyesuaikan nuansa gelap. Preferensi tersimpan di peramban pengunjung.

### Menambah section storefront

Section mengikuti pola: fungsi `xxxHTML()` mengembalikan string HTML, dipanggil di `renderStore()`, dan dibungkus `F('kode.fitur')` bila harus bisa dimatikan. Tambahkan kode fitur ke `FEATURE_LIST` (frontend) **dan** `FEATURE_REGISTRY` (backend) agar gating konsisten.

---

## 17. Pemeliharaan, backup, keamanan

### Backup

| Cara | Frekuensi | Langkah |
|---|---|---|
| Tombol CMS | Mingguan | **Sistem → Jalankan backup** → salinan spreadsheet tersimpan di folder Drive `backup` |
| Salinan manual | Sebelum perubahan besar | Sheets → **File → Make a copy** |
| Ekspor CSV | Bulanan | **Laporan → CSV**, **Produk → CSV**, **Audit → Ekspor** |

Untuk memulihkan: buka salinan → **Extensions → Apps Script** → tempel `code.gs` → jalankan `setupSistem()` → deploy ulang → perbarui `CONFIG.API_URL`.

### Rutinitas yang disarankan

| Interval | Tindakan |
|---|---|
| Harian | Lunasi pesanan `MENUNGGU`, cek notifikasi stok menipis, cek tiket service baru |
| Mingguan | Backup, tinjau Audit Log, rapikan `MEDIA` (hapus gambar tak terpakai) |
| Bulanan | Laporan 30 hari, tinjau margin trade‑in, perbarui promo, cek kuota Drive |
| Per kuartal | Ganti PIN staf, jalankan `selfTest()`, perbarui harga HPP |

### Keamanan

- PIN disimpan sebagai hash SHA‑256 dengan salt unik per akun.
- Token = `base64url(payload).HMAC-SHA256(payload, NX_SECRET)`, berlaku 12 jam. `NX_SECRET` hanya ada di Script Properties.
- Semua aksi non‑publik mewajibkan token; role diperiksa per action.
- Akses Drive: berkas dibagikan *viewer via link* agar bisa tampil; siapa pun yang tahu URL berkas dapat melihat gambar. Jangan unggah dokumen sensitif (KTP, invoice supplier) ke pustaka media.
- Gunakan akun Google khusus toko, aktifkan verifikasi dua langkah, dan batasi jumlah OWNER.
- Runtime Apps Script punya kuota harian; untuk toko dengan ratusan transaksi/hari, pantau **Executions** di editor.

### Domain sendiri (opsional)

1. Deploy frontend ke Netlify/Vercel/Cloudflare Pages.
2. Tambahkan domain kustom (mis. `nexalap.id`) melalui pengaturan DNS penyedia.
3. `CONFIG.API_URL` tetap menunjuk ke URL `/exec` Apps Script.

---

## 18. Pemecahan masalah

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| Storefront kosong / "Gagal memuat data toko" | `CONFIG.API_URL` kosong atau salah; deployment belum versi baru | Isi URL `/exec`; **Manage deployments → New version** |
| Chip "Demo (memori)" di halaman Sistem | `API_URL` masih kosong | Tempel URL deployment |
| Login: "PIN tidak dikenali" | PIN salah atau akun nonaktif | Reset PIN dari akun OWNER (mode demo: `1234`) |
| Semua menu hilang setelah login | Semua modul untuk role tersebut dimatikan | Login OWNER → Feature Manager → **Reset** atau preset **Full Commerce** |
| "Modul … sedang dinonaktifkan" | Fitur induk dimatikan | Aktifkan kembali di Feature Manager |
| Gambar tidak tampil | Berkas belum dibagikan, atau `drive_id` dihapus | Buka berkas di Drive → Share → *Anyone with the link*; unggah ulang bila perlu; `media.repair` |
| Unggah gagal "Ukuran maksimal 8 MB" | Berkas asli terlalu besar dan kompresi gagal | Perkecil ke < 8 MB, format JPG/PNG |
| Perubahan `code.gs` tidak berefek | Deployment belum diperbarui | **Deploy → Manage deployments → Edit → New version** |
| "Sesi berakhir, silakan login lagi" | Token > 12 jam atau `NX_SECRET` berubah | Login ulang |
| Angka rupiah jadi teks di Sheets | Kolom diformat teks | Pilih kolom → Format → Number → Number |
| JSONP gagal / CORS | Memakai GET dengan `callback` dari domain lain | Gunakan POST JSON (default aplikasi) |
| `selfTest()` gagal di "Spreadsheet terhubung" | `NX_SHEET_ID` tidak ada | Jalankan `setupSistem()` dari spreadsheet yang benar |
| Laporan kosong | Tidak ada pesanan `LUNAS` pada rentang tanggal | Pilih rentang lebih lebar / lunasi pesanan |
| Halaman CMS lambat | Cache Apps Script dingin setelah lama tidak dipakai | Klik **Sistem → Hangatkan cache** |

**Melihat log backend:** editor Apps Script → **Executions** (daftar panggilan + error) atau **View → Logs** setelah menjalankan fungsi. Setiap baris `AUDIT` juga merekam aksi pengguna.

---

## 19. Lampiran: fungsi bantu & checklist go‑live

### Fungsi bantu backend (dipanggil dari editor)

| Fungsi | Kegunaan |
|---|---|
| `setupSistem()` | Instalasi/penyempurnaan sheet, fitur, seed, Drive |
| `selfTest()` | Diagnostik menyeluruh |
| `resetDataContoh()` | Pulihkan data contoh |
| `kosongkanData()` | Hapus data transaksi, pertahankan konfigurasi |
| `doGet(e)` / `doPost(e)` | Titik masuk HTTP |
| `handle_(req)` | Router + auth + guard fitur/role |

### Perintah cepat di Apps Script

```js
setupSistem();        // instalasi
selfTest();           // pemeriksaan
kosongkanData();      // siap go-live
resetDataContoh();    // kembali ke data demo
```

### Checklist go‑live

- [ ] `setupSistem()` dijalankan pada spreadsheet produksi
- [ ] `selfTest()` semua **PASS**
- [ ] Web App dideploy ulang (*Execute as: Me*, *Access: Anyone*)
- [ ] `CONFIG.API_URL` di `index.html` menunjuk URL `/exec`
- [ ] Frontend diunggah ke hosting HTTPS
- [ ] Semua PIN demo diganti; akun tak terpakai dihapus
- [ ] Profil toko, rekening, jam operasional, dan template WhatsApp diisi
- [ ] `kosongkanData()` dijalankan, lalu produk asli dimasukkan (manual atau `product.import`)
- [ ] Banner, testimoni, dan FAQ diganti dengan konten asli
- [ ] Gambar produk diunggah ke Drive dan muncul di storefront
- [ ] Promo aktif dengan periode & kuota benar
- [ ] Feature Manager disesuaikan dengan layanan yang benar‑benar dibuka
- [ ] Uji alur: checkout online → lunasi → stok turun → laporan ikut naik
- [ ] Uji alur: tiket service baru → status DIKERJAKAN → SELESAI
- [ ] Uji alur: pengajuan trade‑in → setujui → produk bekas muncul di katalog
- [ ] Backup pertama dibuat
- [ ] Setiap role dicoba login dan dipastikan hanya melihat modul yang benar

---

### Ringkasan berkas

| Berkas | Ukuran isi | Peran |
|---|---|---|
| `code.gs` | ±2.700 baris | Backend: skema, util, auth, 85 action, seed, setup, self‑test |
| `index.html` | ±790 KB (satu berkas, CSS+JS+aset inline) | Frontend: CSS inline, JS inline (core · UI · storefront · admin · boot), storefront + CMS, aset gambar base64 |
| `PANDUAN.md` | Dokumen ini | Instalasi, operasional, referensi API & data |

Selamat berjualan — semoga **NEXALAP** membantu toko Anda tumbuh. 🚀
