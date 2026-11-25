/**
 * ============================================================================
 *  NEXALAP — Commerce & CMS Engine
 *  REST API · Google Apps Script (V8) · Google Sheets Database · Google Drive
 *  Versi 1.0.0 · Toko Online Jual Beli Laptop & PC
 * ----------------------------------------------------------------------------
 *  Cara pakai singkat (detail lengkap: PANDUAN.md)
 *   1. Buat Google Spreadsheet → Extensions → Apps Script.
 *   2. Tempel seluruh isi file ini ke Code.gs, simpan.
 *   3. Jalankan fungsi  setupSistem()  satu kali, izinkan akses.
 *   4. Deploy → New deployment → Web app
 *        Execute as : Me
 *        Who has access : Anyone
 *   5. Salin URL /exec → tempel ke  CONFIG.API_URL  di index.html.
 *
 *  Peta modul
 *   01 Konfigurasi            08 Kategori & Media (Drive)
 *   02 Skema database         09 Pesanan & POS
 *   03 Utilitas               10 Pelanggan
 *   04 Lapisan database       11 Service & Tukar Tambah
 *   05 Counter & Cache        12 Promo, Banner, Testimoni
 *   06 Audit & Setting        13 Staf, Fitur, Laporan
 *   07 Auth & Router          14 Sistem, Seed, Setup, Entry, Routes
 * ============================================================================
 */

/* ==========================================================================
 * 01. KONFIGURASI
 * ========================================================================== */
var APP = {
  NAME: 'NEXALAP',
  TITLE: 'Nexalap Commerce & CMS',
  VERSION: '1.0.0',
  TZ: 'Asia/Jakarta',
  TOKEN_TTL: 12 * 60 * 60,
  CACHE_TTL: 120,
  LOCK_WAIT: 15000,
  MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
  DRIVE_FOLDER: 'NEXALAP Media',
  PROP_SECRET: 'NX_SECRET',
  PROP_SHEET: 'NX_SHEET_ID',
  PROP_FOLDER: 'NX_FOLDER_ID'
};

var ROLES = ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI', 'MARKETING'];
var ROLE_DESC = {
  OWNER: 'Akses penuh: staf, fitur modular, pengaturan, sistem & backup.',
  ADMIN: 'Operasional harian: produk, pesanan, konten, promo, laporan.',
  KASIR: 'POS, konfirmasi pesanan, pelanggan, service.',
  GUDANG: 'Produk, stok, kategori, media, purchase order.',
  TEKNISI: 'Service, tukar tambah, dan riwayat perangkat.',
  MARKETING: 'Konten, banner, testimoni, promo, pelanggan, laporan.'
};

var ORDER_STATUS = ['MENUNGGU', 'LUNAS', 'VOID'];
var ORDER_TIPE = ['ONLINE', 'POS'];
var SERVICE_STATUS = ['MASUK', 'DIAGNOSA', 'DIKERJAKAN', 'SELESAI', 'DIAMBIL', 'BATAL'];
var TRADEIN_STATUS = ['BARU', 'DISETUJUI', 'DITOLAK'];
var KONDISI = ['BARU', 'BEKAS'];
var TIER = [
  { nama: 'BRONZE', min: 0, multiplier: 1 },
  { nama: 'SILVER', min: 1000000, multiplier: 1.25 },
  { nama: 'GOLD', min: 5000000, multiplier: 1.5 },
  { nama: 'PLATINUM', min: 15000000, multiplier: 2 }
];

/* ==========================================================================
 * 02. SKEMA DATABASE — 17 sheet
 * ========================================================================== */
var SCHEMA = {
  PRODUCT: ['id', 'sku', 'nama', 'kategori', 'brand', 'tipe', 'kondisi', 'harga', 'harga_coret', 'harga_beli', 'stok', 'garansi', 'gambar', 'deskripsi', 'spesifikasi', 'unggulan', 'status', 'terjual', 'rating', 'urutan', 'dibuat', 'diubah'],
  CATEGORY: ['id', 'nama', 'slug', 'ikon', 'deskripsi', 'gambar', 'urutan', 'aktif', 'dibuat'],
  CUSTOMER: ['id', 'nama', 'wa', 'email', 'kota', 'alamat', 'total_belanja', 'trx', 'poin', 'tier', 'catatan', 'dibuat'],
  ORDER: ['id', 'tanggal', 'tipe', 'nama', 'wa', 'alamat', 'kota', 'items', 'subtotal', 'diskon', 'promo', 'ongkir', 'total', 'metode', 'status', 'sumber', 'catatan', 'dibuat'],
  SERVICE: ['id', 'tanggal', 'nama', 'wa', 'perangkat', 'kategori', 'keluhan', 'teknisi', 'status', 'estimasi', 'biaya', 'catatan', 'dibuat'],
  TRADEIN: ['id', 'tanggal', 'nama', 'wa', 'perangkat', 'kategori', 'brand', 'tahun', 'kondisi', 'harga_awal', 'estimasi_lo', 'estimasi_hi', 'penawaran', 'status', 'catatan', 'dibuat'],
  PROMO: ['id', 'kode', 'judul', 'tipe', 'nilai', 'min_belanja', 'maks_diskon', 'mulai', 'akhir', 'kuota', 'terpakai', 'aktif', 'dibuat'],
  BANNER: ['id', 'judul', 'subjudul', 'gambar', 'link', 'urutan', 'aktif', 'dibuat'],
  TESTI: ['id', 'nama', 'kota', 'rating', 'pesan', 'avatar', 'produk', 'urutan', 'aktif', 'dibuat'],
  MEDIA: ['id', 'nama', 'mime', 'ukuran', 'drive_id', 'url', 'thumb', 'lebar', 'tinggi', 'folder', 'dibuat', 'diubah'],
  STAFF: ['id', 'nama', 'wa', 'role', 'pin_hash', 'pin_salt', 'aktif', 'dibuat', 'last_login'],
  SETTING: ['id', 'value'],
  AUDIT: ['id', 'tanggal', 'user', 'role', 'aksi', 'entitas', 'entitas_id', 'detail'],
  COUNTER: ['id', 'value'],
  FEATURE_REGISTRY: ['id', 'kode', 'nama', 'modul', 'deskripsi', 'default_status', 'roles', 'dependencies', 'conflicts', 'fallback', 'dampak', 'versi'],
  FEATURE_ACCESS: ['id', 'feature_kode', 'role', 'enabled', 'diubah_oleh', 'diubah_pada'],
  FEATURE_LOG: ['id', 'tanggal', 'feature_kode', 'role', 'dari', 'ke', 'oleh', 'alasan']
};

var ID_PREFIX = {
  PRODUCT: 'PRD', CATEGORY: 'CAT', CUSTOMER: 'CST', ORDER: 'INV', SERVICE: 'SVC', TRADEIN: 'TRD',
  PROMO: 'PRM', BANNER: 'BNR', TESTI: 'TST', MEDIA: 'IMG', STAFF: 'STF', AUDIT: 'AUD',
  FEATURE_REGISTRY: 'FTR', FEATURE_ACCESS: 'FAC', FEATURE_LOG: 'FLG'
};
var JSON_COLS = { items: 1, spesifikasi: 1, roles: 1, dependencies: 1, conflicts: 1 };

/* ==========================================================================
 * 03. REGISTRY FITUR MODULAR
 *  Setiap fitur: kode · nama · modul · deskripsi · default · roles
 *  · dependencies · conflicts · fallback · dampak (yang hilang saat OFF)
 * ========================================================================== */
var FEATURE_REGISTRY = [
  /* ---------- Modul: Storefront ---------- */
  { kode: 'storefront.hero', nama: 'Hero Section', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Bagian pembuka dengan headline, CTA, dan kartu produk unggulan.',
    fallback: 'Landing langsung menampilkan katalog.', dampak: 'Section hero, headline, CTA utama, kartu produk melayang.' },
  { kode: 'storefront.ticker', nama: 'Ticker Pengumuman', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Teks promo berjalan di bawah hero.', fallback: 'Layout naik tanpa ticker.', dampak: 'Marquee promo pada storefront.' },
  { kode: 'storefront.stats', nama: 'Statistik Sosial', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Empat angka kunci dengan animasi count-up.', fallback: 'Strip statistik disembunyikan.', dampak: 'Strip statistik + animasi angka.' },
  { kode: 'storefront.keunggulan', nama: 'Kenapa Kami', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Enam kartu alasan berbelanja + deretan brand.', fallback: 'Section dilewati.', dampak: 'Section "Kenapa Kami" & brand strip.' },
  { kode: 'storefront.katalog', nama: 'Katalog Produk', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Grid produk dengan pencarian, filter, dan urutan.', fallback: 'Storefront menampilkan ajakan hubungi WhatsApp.', dampak: 'Section katalog, kartu produk, modal detail.' },
  { kode: 'storefront.paket', nama: 'Paket PC Rakitan', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: ['storefront.katalog'], conflicts: [],
    deskripsi: 'Kartu paket rakitan beserta daftar komponen.', fallback: 'Section paket disembunyikan.', dampak: 'Section PC Rakitan + tab paket.' },
  { kode: 'storefront.layanan', nama: 'Layanan Service', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Showcase layanan servis dan form pendaftaran.', fallback: 'Section service hilang, menu terkait disembunyikan.', dampak: 'Section service, form service, tautan navigasi.' },
  { kode: 'storefront.tukar_tambah', nama: 'Tukar Tambah', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Kalkulator estimasi dan pengajuan tukar tambah.', fallback: 'Section & menu tukar tambah hilang.', dampak: 'Section trade-in, kalkulator, form pengajuan.' },
  { kode: 'storefront.testimoni', nama: 'Testimoni', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Marquee ulasan pelanggan + ringkasan rating.', fallback: 'Section testimoni hilang.', dampak: 'Section testimoni, marquee, ringkasan rating.' },
  { kode: 'storefront.faq', nama: 'FAQ', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Accordion pertanyaan yang sering diajukan.', fallback: 'Section FAQ hilang.', dampak: 'Section FAQ + menu FAQ.' },
  { kode: 'storefront.cta', nama: 'CTA Band', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Pita ajakan bertindak bergradien sebelum footer.', fallback: 'Pita CTA hilang.', dampak: 'Section CTA band.' },
  { kode: 'storefront.kontak', nama: 'Kontak & Lead', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Kartu kontak dan form prospek.', fallback: 'Form lead hilang, kontak tetap di footer.', dampak: 'Section kontak, form lead, kolom kontak footer.' },
  { kode: 'storefront.keranjang', nama: 'Keranjang', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: ['storefront.katalog'], conflicts: [],
    deskripsi: 'Drawer keranjang, tombol tambah, dan badge jumlah.', fallback: 'Tombol beli langsung ke WhatsApp.', dampak: 'Drawer keranjang, tombol tambah, badge, bottom-nav keranjang.' },
  { kode: 'storefront.checkout', nama: 'Checkout Online', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: ['storefront.keranjang'], conflicts: [],
    deskripsi: 'Modal checkout lengkap dengan validasi promo.', fallback: 'Checkout dialihkan ke WhatsApp.', dampak: 'Modal checkout, form pesanan, endpoint order.create.' },
  { kode: 'storefront.lacak', nama: 'Lacak Pesanan', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Pelacakan pesanan, service, dan tukar tambah.', fallback: 'Menu & modal lacak hilang.', dampak: 'Modal lacak, menu navigasi, bottom-nav.' },
  { kode: 'storefront.wa_float', nama: 'Tombol WhatsApp', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'FAB WhatsApp mengambang dengan animasi ping.', fallback: 'FAB disembunyikan.', dampak: 'FAB WhatsApp + back-to-top.' },
  { kode: 'storefront.tema', nama: 'Mode Gelap', modul: 'Storefront', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Tombol ganti tema terang/gelap.', fallback: 'Selalu tema terang.', dampak: 'Tombol tema, penyimpanan preferensi.' },

  /* ---------- Modul: Back-office ---------- */
  { kode: 'admin.dashboard', nama: 'Dashboard', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'KPI, grafik omzet, produk terlaris, stok menipis.', fallback: 'Login diarahkan ke modul pertama yang aktif.',
    dampak: 'Menu dashboard, KPI, grafik, notifikasi stok.' },
  { kode: 'admin.produk', nama: 'Modul Produk', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'GUDANG', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'CRUD produk, gambar, spesifikasi, status tayang.', fallback: 'Menu produk hilang, endpoint product.* ditolak.',
    dampak: 'Menu produk, tabel, form, tombol tambah/edit/hapus, kolom produk di dashboard.' },
  { kode: 'admin.kategori', nama: 'Modul Kategori', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'GUDANG', 'MARKETING'], dependencies: ['admin.produk'], conflicts: [],
    deskripsi: 'Master kategori untuk tab katalog dan form produk.', fallback: 'Kategori memakai daftar bawaan.', dampak: 'Menu kategori, tab katalog dinamis, select kategori.' },
  { kode: 'admin.media', nama: 'Pustaka Media', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'GUDANG', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'Unggah, ganti, hapus, dan kelola gambar di Google Drive.', fallback: 'Unggah gambar dinonaktifkan, hanya URL manual.',
    dampak: 'Menu media, tombol unggah, dropzone, galeri, lightbox.' },
  { kode: 'admin.pesanan', nama: 'Modul Pesanan', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'KASIR', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'Daftar pesanan, detail, pelunasan, pembatalan.', fallback: 'Menu pesanan hilang, checkout publik ditutup.',
    dampak: 'Menu pesanan, tabel, modal detail, tombol lunas/void, KPI pesanan.' },
  { kode: 'admin.pelanggan', nama: 'Modul Pelanggan', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'KASIR', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'Database pelanggan, tier, poin, dan riwayat.', fallback: 'Menu pelanggan hilang.', dampak: 'Menu pelanggan, tabel, form, KPI pelanggan.' },
  { kode: 'admin.service', nama: 'Modul Service', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'KASIR', 'TEKNISI'], dependencies: [], conflicts: [],
    deskripsi: 'Tiket service dengan papan kanban dan status.', fallback: 'Menu service hilang.', dampak: 'Menu service, kanban, form tiket, form publik service.' },
  { kode: 'admin.tradein', nama: 'Modul Tukar Tambah', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'KASIR', 'TEKNISI'], dependencies: [], conflicts: [],
    deskripsi: 'Review pengajuan, penawaran, setujui/tolak.', fallback: 'Menu tukar tambah hilang.', dampak: 'Menu trade-in, tabel, modal approval.' },
  { kode: 'admin.promo', nama: 'Modul Promo', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'Kode promo persen/nominal dengan masa berlaku.', fallback: 'Menu promo hilang, input promo disembunyikan.', dampak: 'Menu promo, form, input kode di checkout.' },
  { kode: 'admin.konten', nama: 'Konten Web', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'Banner hero, testimoni, dan FAQ storefront.', fallback: 'Konten memakai nilai bawaan.', dampak: 'Menu konten, tab banner/testimoni/FAQ, banner storefront.' },
  { kode: 'admin.laporan', nama: 'Laporan & Analitik', modul: 'Back-office', default: true, roles: ['OWNER', 'ADMIN', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'Ringkasan penjualan, grafik, dan ekspor CSV.', fallback: 'Menu laporan hilang.', dampak: 'Menu laporan, grafik, tombol ekspor.' },
  { kode: 'admin.staf', nama: 'Manajemen Staf', modul: 'Keamanan', default: true, roles: ['OWNER'], dependencies: [], conflicts: [],
    deskripsi: 'CRUD staf, role, dan reset PIN.', fallback: 'Menu staf hilang untuk semua role.', dampak: 'Menu staf, tabel, form, tombol reset PIN.' },
  { kode: 'admin.fitur', nama: 'Feature Manager', modul: 'Keamanan', default: true, roles: ['OWNER'], dependencies: [], conflicts: [],
    deskripsi: 'Aktif/nonaktifkan modul per role + preset.', fallback: 'Konfigurasi fitur terkunci.', dampak: 'Menu fitur, matriks toggle, preset, log.' },
  { kode: 'admin.pengaturan', nama: 'Pengaturan Toko', modul: 'Keamanan', default: true, roles: ['OWNER', 'ADMIN'], dependencies: [], conflicts: [],
    deskripsi: 'Identitas toko, kontak, pembayaran, FAQ.', fallback: 'Menu pengaturan hilang.', dampak: 'Menu pengaturan, form setting, teks brand.' },
  { kode: 'admin.audit', nama: 'Audit Log', modul: 'Keamanan', default: true, roles: ['OWNER', 'ADMIN'], dependencies: [], conflicts: [],
    deskripsi: 'Jejak aktivitas pengguna dan perubahan data.', fallback: 'Menu audit hilang.', dampak: 'Menu audit, tabel log, KPI audit.' },
  { kode: 'admin.sistem', nama: 'Sistem & Backup', modul: 'Keamanan', default: true, roles: ['OWNER'], dependencies: [], conflicts: [],
    deskripsi: 'Info koneksi, backup spreadsheet, reset data.', fallback: 'Menu sistem hilang.', dampak: 'Menu sistem, panel backup, tombol reset.' },

  /* ---------- Modul: Fitur penunjang ---------- */
  { kode: 'pos.access', nama: 'POS Kasir', modul: 'POS', default: true, roles: ['OWNER', 'ADMIN', 'KASIR'], dependencies: ['admin.produk'], conflicts: [],
    deskripsi: 'Antarmuka kasir cepat dengan keranjang dan struk.', fallback: 'Menu POS hilang, penjualan lewat pesanan online.', dampak: 'Menu POS, grid produk, keranjang, struk.' },
  { kode: 'pesanan.online', nama: 'Pesanan Online', modul: 'Transaksi', default: true, roles: ['PUBLIC', 'OWNER', 'ADMIN', 'KASIR'], dependencies: ['storefront.keranjang'], conflicts: [],
    deskripsi: 'Menerima pesanan dari storefront.', fallback: 'Checkout storefront dialihkan ke WhatsApp.', dampak: 'Endpoint order publik, KPI pesanan online.' },
  { kode: 'promo.publik', nama: 'Promo di Checkout', modul: 'Transaksi', default: true, roles: ['PUBLIC'], dependencies: ['admin.promo'], conflicts: [],
    deskripsi: 'Validasi kode promo pada checkout publik.', fallback: 'Kolom kode promo disembunyikan.', dampak: 'Input promo, baris diskon, endpoint promo.check.' },
  { kode: 'pelanggan.lead', nama: 'Form Prospek', modul: 'CRM', default: true, roles: ['PUBLIC'], dependencies: [], conflicts: [],
    deskripsi: 'Menangkap calon pelanggan dari storefront.', fallback: 'Form lead disembunyikan.', dampak: 'Form lead + endpoint public.lead.' },
  { kode: 'dash.grafik', nama: 'Grafik Dashboard', modul: 'Analitik', default: true, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI', 'MARKETING'], dependencies: ['admin.dashboard'], conflicts: [],
    deskripsi: 'Grafik omzet, kategori, metode bayar, transaksi.', fallback: 'Dashboard hanya menampilkan KPI angka.', dampak: 'Panel grafik, filter periode, tooltip.' },
  { kode: 'dash.stok_menipis', nama: 'Notifikasi Stok Menipis', modul: 'Analitik', default: true, roles: ['OWNER', 'ADMIN', 'GUDANG'], dependencies: ['admin.dashboard', 'admin.produk'], conflicts: [],
    deskripsi: 'Daftar produk di bawah stok minimum.', fallback: 'Panel stok menipis hilang.', dampak: 'Panel stok menipis + badge peringatan.' },
  { kode: 'exports.csv', nama: 'Ekspor CSV', modul: 'Analitik', default: true, roles: ['OWNER', 'ADMIN', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'Unduh laporan dan daftar data sebagai CSV.', fallback: 'Tombol ekspor disembunyikan.', dampak: 'Tombol ekspor pada tabel & laporan.' },
  { kode: 'notif.center', nama: 'Pusat Notifikasi', modul: 'Utilitas', default: true, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI', 'MARKETING'], dependencies: [], conflicts: [],
    deskripsi: 'Lonceng notifikasi pesanan baru dan stok menipis.', fallback: 'Ikon lonceng hilang.', dampak: 'Tombol lonceng, panel notifikasi, badge.' }
];

var FEATURE_PRESETS = {
  RETAIL: {
    nama: 'Toko Retail', deskripsi: 'Storefront + POS + katalog + pesanan + service.',
    off: ['pos.access', 'admin.tradein', 'storefront.tukar_tambah']
  },
  FULL: { nama: 'Full Commerce', deskripsi: 'Seluruh modul aktif seperti bawaan.', off: [] },
  MARKETING: {
    nama: 'Marketing First', deskripsi: 'Fokus konten, promo, testimoni, dan laporan.',
    off: ['pos.access', 'admin.staf', 'admin.audit', 'admin.sistem']
  },
  KATALOG: {
    nama: 'Katalog Saja', deskripsi: 'Storefront ringan tanpa checkout dan akun staf.',
    off: ['storefront.keranjang', 'storefront.checkout', 'pesanan.online', 'admin.pesanan', 'admin.service', 'admin.tradein', 'pos.access']
  }
};

/* ==========================================================================
 * 03b. PENGATURAN BAWAAN
 * ========================================================================== */
var DEFAULT_SETTINGS = {
  toko_nama: 'NEXALAP',
  toko_tagline: 'Laptop & PC pilihan, harga jujur, garansi jelas.',
  toko_deskripsi: 'Nexalap adalah toko laptop & PC yang fokus pada unit terkurasi, garansi transparan, dan layanan purna jual yang benar-benar membantu. Ribuan pelanggan sudah mempercayakan perangkat kerja dan hobi mereka kepada kami.',
  toko_alamat: 'Ruko Digital Center Blok C-5, Jl. Teknologi No. 88',
  toko_kota: 'Surabaya',
  toko_provinsi: 'Jawa Timur',
  toko_wa: '6281234567890',
  toko_email: 'halo@nexalap.id',
  toko_jam: 'Senin–Sabtu 09.00–20.00 WIB',
  toko_ig: 'https://instagram.com/nexalap',
  toko_tiktok: 'https://tiktok.com/@nexalap',
  toko_maps: 'https://maps.google.com/?q=Surabaya',
  toko_sejak: '2016',
  rekening: 'BCA 1234567890 a.n. Nexalap · QRIS tersedia',
  ongkir_default: 0,
  gratis_ongkir_min: 5000000,
  ppn_pct: 0,
  poin_per_1000: 1,
  poin_nilai: 1000,
  tradein_bonus_pct: 5,
  tradein_margin_pct: 18,
  wa_tpl_order: 'Halo {toko}, saya ingin memesan:\n{items}\n\nSubtotal: {subtotal}\nDiskon: {diskon}\nTotal: {total}\n\nNama: {nama}\nWA: {wa}\nAlamat: {alamat}\nKode: {kode}\nMohon konfirmasi stok dan pembayaran. Terima kasih!',
  wa_tpl_track: 'Halo {toko}, saya ingin menanyakan pesanan {kode}. Terima kasih!',
  hero_judul: 'Laptop impian, harga jujur, garansi jelas.',
  hero_sub: 'Unit terkurasi untuk kerja, kuliah, dan gaming. Dites satu per satu, bergaransi resmi, dan dikirim hari ini juga.',
  ticker_teks: 'Gratis ongkir nasional min. Rp5 juta · Cicilan 0% 12 bulan · Garansi resmi 1–3 tahun · Trade-in laptop lama diterima · Unit bekas bergaransi toko · Servis di tempat untuk kantor',
  faq: JSON.stringify([
    { q: 'Apakah semua produk bergaransi?', a: 'Ya. Unit baru bergaransi resmi distributor 1–3 tahun, unit bekas bergaransi toko 3–6 bulan sesuai keterangan di setiap produk.' },
    { q: 'Bagaimana cara memastikan unit bukan rekondisi palsu?', a: 'Setiap unit melewati 24 titik pemeriksaan dan hasilnya dilampirkan pada lembar garansi. Kami juga menyertakan masa uji coba 7 hari.' },
    { q: 'Bisa cicilan tanpa kartu kredit?', a: 'Bisa. Tersedia cicilan 0% dengan kartu kredit bank mitra, serta pembiayaan melalui partner leasing dengan DP mulai 10%.' },
    { q: 'Berapa lama pengiriman?', a: 'Pesanan sebelum pukul 15.00 WIB dikirim hari yang sama. Dalam kota 1 hari, luar kota 2–4 hari kerja dengan asuransi pengiriman.' },
    { q: 'Bagaimana proses tukar tambah?', a: 'Hitung estimasi di halaman tukar tambah, ajukan, lalu bawa unit ke toko untuk verifikasi fisik. Nilai final langsung memotong harga unit baru.' },
    { q: 'Apakah PC rakitan sudah dirakit dan dites?', a: 'Semua PC rakitan dirakit teknisi kami, melewati burn-test 6 jam, instalasi sistem operasi, dan cable management rapi sebelum dikirim.' },
    { q: 'Bisa konsultasi dulu sebelum membeli?', a: 'Tentu. Tim kami membantu memilih spesifikasi sesuai kebutuhan dan anggaran lewat WhatsApp tanpa biaya.' },
    { q: 'Bagaimana jika unit bermasalah saat diterima?', a: 'Laporkan maksimal 1×24 jam dengan video unboxing. Kami ganti unit baru atau kembalikan dana penuh.' }
  ])
};
/* ==========================================================================
 * 03c. UTILITAS
 * ========================================================================== */
function now_() { return new Date(); }
function iso_(d) {
  if (!d) return '';
  var x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return String(d);
  return x.toISOString();
}
function today_() { return Utilities.formatDate(now_(), APP.TZ, 'yyyy-MM-dd'); }
function stamp_() { return Utilities.formatDate(now_(), APP.TZ, 'yyyy-MM-dd HH:mm'); }
function num_(v, d) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? (d || 0) : n; }
function int_(v, d) { var n = parseInt(v, 10); return isNaN(n) ? (d || 0) : n; }
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function bool_(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE' || v === 'on'; }
function up_(v) { return str_(v).toUpperCase(); }
function low_(v) { return str_(v).toLowerCase(); }
function arr_(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v) { try { var p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
  return [];
}
function obj_(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string' && v) { try { var p = JSON.parse(v); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; } }
  return {};
}
function clamp_(v, a, b) { return Math.max(a, Math.min(b, v)); }
function esc_(s) { return str_(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function slugify_(s) { return low_(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function waNorm_(w) {
  var s = str_(w).replace(/[^0-9]/g, '');
  if (!s) return '';
  if (s.indexOf('0') === 0) s = '62' + s.slice(1);
  if (s.indexOf('8') === 0) s = '62' + s;
  return s;
}
function fillTpl_(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
}
function rupiah_(n) {
  n = Math.round(num_(n));
  return 'Rp' + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^/, n < 0 ? '-' : '');
}
function dayKey_(d) { return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd'); }
function daysAgoKey_(n) {
  var d = new Date(now_().getTime() - n * 86400000);
  return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd');
}
function monthKey_(d) { return Utilities.formatDate(d, APP.TZ, 'yyyy-MM'); }
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(function (b) {
    return ((b < 0 ? b + 256 : b)).toString(16).padStart(2, '0');
  }).join('');
}
function uuid_() { return Utilities.getUuid(); }
function randPin_(len) {
  var s = '';
  for (var i = 0; i < (len || 4); i++) s += String(Math.floor(Math.random() * 10));
  return s;
}
function b64_(str, mime) {
  var bytes = Utilities.base64Decode(str);
  return Utilities.newBlob(bytes, mime);
}

/* Jarak waktu human-readable */
function humanAgo_(d) {
  var t = d instanceof Date ? d : new Date(d);
  if (isNaN(t.getTime())) return '-';
  var s = Math.floor((now_().getTime() - t.getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  if (s < 2592000) return Math.floor(s / 86400) + ' hari lalu';
  return Utilities.formatDate(t, APP.TZ, 'dd MMM yyyy');
}

/* ==========================================================================
 * 04. LAPISAN DATABASE (Google Sheets)
 * ========================================================================== */
var _sheetCache = {};
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty(APP.PROP_SHEET);
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { } }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw apiErr_('SERVER_ERROR', 'Spreadsheet tidak ditemukan. Jalankan setupSistem() dari spreadsheet.');
  return ss;
}
function sheet_(name, createIfMissing) {
  if (_sheetCache[name]) return _sheetCache[name];
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh && createIfMissing !== false) {
    sh = ss.insertSheet(name);
    var cols = SCHEMA[name];
    if (cols) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#eef4ff');
    }
  }
  _sheetCache[name] = sh;
  return sh;
}
function readAll_(name) {
  var sh = sheet_(name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var cols = SCHEMA[name];
  var width = Math.max(cols ? cols.length : 1, sh.getLastColumn());
  var values = sh.getRange(2, 1, last - 1, width).getValues();
  var header = [];
  if (!cols) {
    header = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return str_(h); });
  }
  var keys = cols || header;
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!str_(row[0])) continue;
    var o = {};
    for (var c = 0; c < keys.length; c++) {
      var k = keys[c];
      if (!k) continue;
      var v = row[c];
      if (JSON_COLS[k] && typeof v === 'string' && v) {
        try { v = JSON.parse(v); } catch (e) { v = v; }
      }
      o[k] = v;
    }
    out.push(o);
  }
  return out;
}
function writeRow_(name, obj) {
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var keyCol = 'id';
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return str_(r[0]); }) : [];
  var idx = ids.indexOf(str_(obj[keyCol]));
  var row = cols.map(function (c) {
    var v = obj[c];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  if (idx >= 0) {
    sh.getRange(idx + 2, 1, 1, cols.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
  return obj;
}
function deleteRow_(name, id) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return false;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (str_(ids[i][0]) === str_(id)) { sh.deleteRow(i + 2); return true; }
  }
  return false;
}
function findById_(name, id) {
  var rows = readAll_(name);
  for (var i = 0; i < rows.length; i++) if (str_(rows[i].id) === str_(id)) return rows[i];
  return null;
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(APP.LOCK_WAIT);
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}

/* ==========================================================================
 * 05. COUNTER & CACHE
 * ========================================================================== */
function nextId_(name) {
  return withLock_(function () {
    var sh = sheet_('COUNTER');
    var prefix = ID_PREFIX[name] || name.slice(0, 3).toUpperCase();
    var rows = readAll_('COUNTER');
    var hit = null;
    for (var i = 0; i < rows.length; i++) if (str_(rows[i].id) === prefix) { hit = rows[i]; break; }
    var next = (hit ? int_(hit.value, 0) : 0) + 1;
    if (hit) {
      var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
      for (var j = 0; j < ids.length; j++) {
        if (str_(ids[j][0]) === prefix) { sh.getRange(j + 2, 2).setValue(next); break; }
      }
    } else {
      sh.appendRow([prefix, next]);
    }
    var seq = String(next);
    while (seq.length < 4) seq = '0' + seq;
    return prefix + '-' + seq;
  });
}
function cacheGet_(k) {
  try { var v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function cachePut_(k, v, ttl) {
  try { CacheService.getScriptCache().put(k, JSON.stringify(v), ttl || APP.CACHE_TTL); } catch (e) { }
}
function cacheBust_(prefix) {
  try {
    var c = CacheService.getScriptCache();
    ['public.bootstrap', 'products.all', 'settings.all', 'content.all', 'features.map'].forEach(function (k) { c.remove(k); });
    c.removeAll(['public.bootstrap', 'products.all', 'settings.all', 'content.all', 'features.map']);
  } catch (e) { }
}

/* ==========================================================================
 * 06. AUDIT & PENGATURAN
 * ========================================================================== */
function audit_(aksi, entitas, entitasId, detail, user) {
  try {
    var u = user || (typeof CTX !== 'undefined' && CTX && CTX.user ? CTX.user : null);
    writeRow_('AUDIT', {
      id: nextId_('AUDIT'), tanggal: iso_(now_()), user: u ? u.nama : 'Publik', role: u ? u.role : 'PUBLIC',
      aksi: aksi, entitas: entitas || '', entitas_id: entitasId || '', detail: str_(detail).slice(0, 500)
    });
  } catch (e) { }
}
var _settings = null;
function settingsAll_(fresh) {
  if (!fresh) {
    var cached = cacheGet_('settings.all');
    if (cached) { _settings = cached; return cached; }
  }
  var rows = readAll_('SETTING');
  var map = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { map[k] = DEFAULT_SETTINGS[k]; });
  rows.forEach(function (r) { if (str_(r.id)) map[r.id] = r.value; });
  map.__faq = map.faq;
  _settings = map;
  cachePut_('settings.all', map, 300);
  return map;
}
function setting_(k, d) {
  var s = _settings || settingsAll_();
  return s[k] === undefined || s[k] === '' ? (d !== undefined ? d : '') : s[k];
}
function settingNum_(k, d) { var v = setting_(k, d); return num_(v, d); }
function saveSettings_(data) {
  var sh = sheet_('SETTING');
  var rows = readAll_('SETTING');
  var keys = Object.keys(data);
  keys.forEach(function (k) {
    var val = data[k];
    if (val !== null && typeof val === 'object') val = JSON.stringify(val);
    var hit = null;
    for (var i = 0; i < rows.length; i++) if (str_(rows[i].id) === k) { hit = rows[i]; break; }
    if (hit) {
      var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
      for (var j = 0; j < ids.length; j++) if (str_(ids[j][0]) === k) { sh.getRange(j + 2, 2).setValue(val); break; }
    } else {
      sh.appendRow([k, val]);
    }
  });
  _settings = null;
  cacheBust_();
  return settingsAll_(true);
}

/* ==========================================================================
 * 07. ERROR & RESPONS
 * ========================================================================== */
function apiErr_(code, message, hint) {
  var e = new Error(message);
  e.apiCode = code;
  e.apiHint = hint || '';
  e.isApi = true;
  return e;
}
function ok_(data, meta) { return { ok: true, data: data === undefined ? null : data, meta: meta || {} }; }
function fail_(code, message, hint) { return { ok: false, error: { code: code, message: message, hint: hint || '' } }; }
function page_(rows, req) {
  var page = Math.max(1, int_(req && req.page, 1));
  var limit = clamp_(int_(req && req.limit, 20), 1, 500);
  if (req && (req.export === true || req.export === '1' || req.export === 'true')) limit = Math.max(rows.length, 1);
  var start = (page - 1) * limit;
  return {
    items: rows.slice(start, start + limit), total: rows.length, page: page,
    pages: Math.max(1, Math.ceil(rows.length / limit)), has_more: start + limit < rows.length, limit: limit
  };
}
function sortBy_(rows, key, dir) {
  var f = dir === 'asc' ? 1 : -1;
  return rows.sort(function (a, b) {
    var x = a[key], y = b[key];
    if (typeof x === 'number' || typeof y === 'number') return (num_(x) - num_(y)) * f;
    return String(x || '').localeCompare(String(y || '')) * f;
  });
}
/* ==========================================================================
 * 07b. AUTH — PIN (SHA-256 + salt) & token (HMAC-SHA256)
 * ========================================================================== */
function secret_() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty(APP.PROP_SECRET);
  if (!s) { s = uuid_() + uuid_(); p.setProperty(APP.PROP_SECRET, s); }
  return s;
}
function signToken_(payload) {
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  var sig = Utilities.computeHmacSha256Signature(body, secret_());
  return body + '.' + Utilities.base64EncodeWebSafe(sig);
}
function verifyToken_(token) {
  if (!token) return null;
  var parts = str_(token).split('.');
  if (parts.length !== 2) return null;
  var expect = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], secret_()));
  if (expect !== parts[1]) return null;
  try {
    var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!payload.exp || payload.exp < Math.floor(now_().getTime() / 1000)) return null;
    return payload;
  } catch (e) { return null; }
}
function hashPin_(pin, salt) { return sha256_(salt + '::' + str_(pin)); }

function login_(req) {
  var pin = str_(req.pin).replace(/\s/g, '');
  if (!pin) throw apiErr_('BAD_REQUEST', 'PIN wajib diisi');
  var staff = readAll_('STAFF');
  for (var i = 0; i < staff.length; i++) {
    var s = staff[i];
    if (str_(s.pin_hash) === hashPin_(pin, s.pin_salt)) {
      if (!bool_(s.aktif)) throw apiErr_('FORBIDDEN', 'Akun staf tidak aktif', 'Hubungi Owner untuk mengaktifkan kembali.');
      var user = { id: s.id, nama: s.nama, role: up_(s.role), wa: str_(s.wa) };
      try { writeRow_('STAFF', Object.assign({}, s, { last_login: iso_(now_()) })); } catch (e) { }
      audit_('LOGIN', 'STAFF', s.id, 'Login berhasil', user);
      var exp = Math.floor(now_().getTime() / 1000) + APP.TOKEN_TTL;
      return {
        token: signToken_({ id: user.id, nama: user.nama, role: user.role, exp: exp }),
        user: user, ttl: APP.TOKEN_TTL, exp: exp,
        features: featureMapFor_(user.role), settings: publicSettings_()
      };
    }
  }
  throw apiErr_('UNAUTHORIZED', 'PIN tidak dikenali', 'Periksa PIN Anda (4 digit) atau minta Owner melakukan reset.');
}
function me_(req, ctx) {
  return { user: ctx.user, features: featureMapFor_(ctx.user.role), settings: publicSettings_(), ttl: APP.TOKEN_TTL };
}
function changePin_(req, ctx) {
  var lama = str_(req.pin_lama), baru = str_(req.pin_baru);
  if (baru.length < 4) throw apiErr_('BAD_REQUEST', 'PIN baru minimal 4 digit');
  var s = findById_('STAFF', ctx.user.id);
  if (!s) throw apiErr_('NOT_FOUND', 'Staf tidak ditemukan');
  if (hashPin_(lama, s.pin_salt) !== str_(s.pin_hash)) throw apiErr_('UNAUTHORIZED', 'PIN lama salah');
  var salt = uuid_().slice(0, 12);
  writeRow_('STAFF', Object.assign({}, s, { pin_salt: salt, pin_hash: hashPin_(baru, salt) }));
  audit_('GANTI_PIN', 'STAFF', s.id, 'Staf mengganti PIN sendiri');
  return { ok: true };
}

/* ==========================================================================
 * 08. FEATURE ENGINE — registry, access per role, guard, dependency, dampak
 * ========================================================================== */
var _featDefMap = null;
function featureDefs_() {
  if (_featDefMap) return _featDefMap;
  var rows = readAll_('FEATURE_REGISTRY');
  var map = {};
  if (rows.length) {
    rows.forEach(function (r) {
      map[str_(r.kode)] = {
        kode: str_(r.kode), nama: str_(r.nama), modul: str_(r.modul), deskripsi: str_(r.deskripsi),
        default: bool_(r.default_status), roles: arr_(r.roles).length ? arr_(r.roles) : ['PUBLIC'],
        dependencies: arr_(r.dependencies), conflicts: arr_(r.conflicts),
        fallback: str_(r.fallback), dampak: str_(r.dampak)
      };
    });
    _featDefMap = map;
    return map;
  }
  FEATURE_REGISTRY.forEach(function (f) {
    map[f.kode] = {
      kode: f.kode, nama: f.nama, modul: f.modul, deskripsi: f.deskripsi, default: !!f.default,
      roles: f.roles, dependencies: f.dependencies || [], conflicts: f.conflicts || [],
      fallback: f.fallback, dampak: f.dampak
    };
  });
  _featDefMap = map;
  return map;
}
function featureAccessRows_() {
  var cached = cacheGet_('features.map');
  if (cached) return cached;
  var rows = readAll_('FEATURE_ACCESS');
  var map = {};
  rows.forEach(function (r) {
    var k = str_(r.feature_kode), role = up_(r.role);
    if (!k) return;
    if (!map[k]) map[k] = {};
    map[k][role] = bool_(r.enabled);
  });
  cachePut_('features.map', map, 60);
  return map;
}
/* Status efektif sebuah fitur untuk role tertentu (default role → 'PUBLIC' untuk publik) */
function featureOn_(kode, role) {
  if (!kode) return true;
  var defs = featureDefs_();
  var def = defs[kode];
  if (!def) return true;
  var acc = featureAccessRows_();
  var r = up_(role || 'PUBLIC');
  var key = def.roles.indexOf('PUBLIC') >= 0 ? 'PUBLIC' : (def.roles.indexOf(r) >= 0 ? r : 'PUBLIC');
  var val = def.default;
  if (acc[kode] && acc[kode][key] !== undefined) val = acc[kode][key];
  if (!val) return false;
  /* dependency: semua dependensi harus hidup */
  for (var i = 0; i < (def.dependencies || []).length; i++) {
    if (!featureOn_(def.dependencies[i], role)) return false;
  }
  return true;
}
function featureMapFor_(role) {
  var defs = featureDefs_();
  var map = {};
  Object.keys(defs).forEach(function (k) { map[k] = featureOn_(k, role); });
  return map;
}
function featureGuard_(kode, role) {
  if (!kode) return;
  if (featureOn_(kode, role)) return;
  var def = featureDefs_()[kode] || { nama: kode, fallback: '' };
  throw apiErr_('FEATURE_OFF', 'Fitur "' + def.nama + '" sedang dinonaktifkan',
    def.fallback || 'Aktifkan kembali lewat Feature Manager (Owner).');
}
function featureList_(req, ctx) {
  var defs = featureDefs_();
  var acc = featureAccessRows_();
  var modul = str_(req.modul);
  var q = low_(req.q);
  var items = Object.keys(defs).map(function (k) {
    var d = defs[k];
    var rolesMap = {};
    d.roles.forEach(function (r) {
      if (r === 'PUBLIC') rolesMap.PUBLIC = featureOn_(k, 'PUBLIC');
      else rolesMap[r] = acc[k] && acc[k][r] !== undefined ? acc[k][r] : d.default;
    });
    var activeAny = Object.keys(rolesMap).some(function (r) { return rolesMap[r] === true; });
    return {
      kode: d.kode, nama: d.nama, modul: d.modul, deskripsi: d.deskripsi, default: d.default,
      roles: d.roles, per_role: rolesMap, dependencies: d.dependencies, conflicts: d.conflicts,
      fallback: d.fallback, dampak: d.dampak, aktif: activeAny,
      terkunci: d.dependencies.some(function (x) { return !featureOn_(x, 'OWNER'); })
    };
  });
  if (modul) items = items.filter(function (i) { return i.modul === modul; });
  if (q) items = items.filter(function (i) { return (i.kode + i.nama + i.deskripsi).toLowerCase().indexOf(q) >= 0; });
  var modules = {};
  items.forEach(function (i) {
    if (!modules[i.modul]) modules[i.modul] = { nama: i.modul, total: 0, aktif: 0 };
    modules[i.modul].total++; if (i.aktif) modules[i.modul].aktif++;
  });
  return {
    items: items, modul: Object.keys(modules).map(function (k) { return modules[k]; }),
    ringkasan: { total: items.length, aktif: items.filter(function (i) { return i.aktif; }).length }
  };
}
function featureToggle_(req, ctx) {
  var kode = str_(req.kode), role = up_(req.role || 'PUBLIC'), enabled = bool_(req.enabled);
  var def = featureDefs_()[kode];
  if (!def) throw apiErr_('NOT_FOUND', 'Fitur tidak dikenali: ' + kode);
  var rows = readAll_('FEATURE_ACCESS');
  var hit = null;
  rows.forEach(function (r) { if (str_(r.feature_kode) === kode && up_(r.role) === role) hit = r; });
  var dari = featureOn_(kode, role);
  var row = {
    id: hit ? hit.id : nextId_('FEATURE_ACCESS'), feature_kode: kode, role: role,
    enabled: enabled ? 1 : 0, diubah_oleh: ctx.user.nama, diubah_pada: iso_(now_())
  };
  writeRow_('FEATURE_ACCESS', row);
  writeRow_('FEATURE_LOG', {
    id: nextId_('FEATURE_LOG'), tanggal: iso_(now_()), feature_kode: kode, role: role,
    dari: dari ? 'ON' : 'OFF', ke: enabled ? 'ON' : 'OFF', oleh: ctx.user.nama, alasan: str_(req.alasan)
  });
  audit_('TOGGLE_FITUR', 'FEATURE', kode, (enabled ? 'Aktifkan ' : 'Nonaktifkan ') + kode + ' untuk ' + role);
  cacheBust_();
  return { kode: kode, role: role, enabled: enabled, dampak: enabled ? [] : str_(def.dampak) };
}
function featureBulkToggle_(req, ctx) {
  var items = arr_(req.items);
  var hasil = [];
  items.forEach(function (it) {
    try {
      hasil.push(featureToggle_({ kode: it.kode, role: it.role || 'PUBLIC', enabled: it.enabled, alasan: it.alasan || req.alasan }, ctx));
    } catch (e) { hasil.push({ kode: it.kode, error: e.message }); }
  });
  return { hasil: hasil };
}
function featureReset_(req, ctx) {
  var rows = readAll_('FEATURE_ACCESS');
  rows.forEach(function (r) { deleteRow_('FEATURE_ACCESS', r.id); });
  audit_('RESET_FITUR', 'FEATURE', '', 'Semua override fitur dihapus');
  cacheBust_();
  _featDefMap = null;
  return { ok: true, features: featureMapFor_(ctx.user.role) };
}
function presetApply_(req, ctx) {
  var key = up_(req.preset);
  var p = FEATURE_PRESETS[key];
  if (!p) throw apiErr_('NOT_FOUND', 'Preset tidak ditemukan');
  var off = (p.off || []).map(function (x) { return low_(x); });
  var defs = featureDefs_();
  Object.keys(defs).forEach(function (kode) {
    var def = defs[kode];
    def.roles.forEach(function (role) {
      var enabled = off.indexOf(low_(kode)) < 0;
      var rows = readAll_('FEATURE_ACCESS');
      var hit = null;
      rows.forEach(function (r) { if (str_(r.feature_kode) === kode && up_(r.role) === role) hit = r; });
      writeRow_('FEATURE_ACCESS', {
        id: hit ? hit.id : nextId_('FEATURE_ACCESS'), feature_kode: kode, role: role,
        enabled: enabled ? 1 : 0, diubah_oleh: ctx.user.nama, diubah_pada: iso_(now_())
      });
    });
  });
  audit_('PRESET_FITUR', 'FEATURE', key, 'Terapkan preset ' + key);
  cacheBust_();
  return { preset: key, features: featureMapFor_(ctx.user.role) };
}
function featureLog_(req) {
  var rows = sortBy_(readAll_('FEATURE_LOG'), 'tanggal', 'desc');
  return page_(rows, req);
}
function featureImpact_(req) {
  var def = featureDefs_()[str_(req.kode)];
  if (!def) throw apiErr_('NOT_FOUND', 'Fitur tidak ditemukan');
  var dependents = [];
  var defs = featureDefs_();
  Object.keys(defs).forEach(function (k) {
    if ((defs[k].dependencies || []).indexOf(def.kode) >= 0) dependents.push({ kode: k, nama: defs[k].nama });
  });
  return {
    kode: def.kode, nama: def.nama, modul: def.modul, deskripsi: def.deskripsi,
    fallback: def.fallback, dampak: def.dampak, dependencies: def.dependencies,
    dependents: dependents, conflicts: def.conflicts
  };
}
function featureGuardCheck_(req, ctx) { return { kode: str_(req.kode), on: featureOn_(req.kode, ctx.user ? ctx.user.role : 'PUBLIC') }; }
function featurePresets_() {
  return {
    presets: Object.keys(FEATURE_PRESETS).map(function (k) {
      return { kode: k, nama: FEATURE_PRESETS[k].nama, deskripsi: FEATURE_PRESETS[k].deskripsi, off: FEATURE_PRESETS[k].off };
    })
  };
}

/* ==========================================================================
 * 09. ROUTER
 * ========================================================================== */
var CTX = { user: null };
function handle_(req) {
  var action = str_(req.action);
  if (!action) throw apiErr_('BAD_REQUEST', 'Parameter "action" wajib diisi');
  var route = ROUTES[action];
  if (!route) throw apiErr_('NOT_FOUND', 'Action tidak dikenali: ' + action);
  CTX = { user: null };
  if (route.roles !== null) {
    var payload = verifyToken_(req.token);
    if (!payload) throw apiErr_('UNAUTHORIZED', 'Sesi berakhir. Silakan login ulang.', 'Token berlaku 12 jam.');
    CTX.user = { id: payload.id, nama: payload.nama, role: up_(payload.role) };
    if (route.roles !== '*' && route.roles.indexOf(CTX.user.role) < 0) {
      throw apiErr_('FORBIDDEN', 'Role ' + CTX.user.role + ' tidak berhak mengakses ' + action);
    }
    if (route.feature) featureGuard_(route.feature, CTX.user.role);
  } else if (route.feature) {
    /* route publik dengan guard fitur → cek PUBLIC */
    featureGuard_(route.feature, 'PUBLIC');
  }
  var t0 = now_().getTime();
  var data = route.fn(req, CTX);
  return ok_(data, { app: APP.NAME, version: APP.VERSION, action: action, ms: now_().getTime() - t0, ts: iso_(now_()) });
}
function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    if (params.payload) {
      var req = JSON.parse(params.payload);
      var res = handle_(req);
      if (params.callback) return jsonpOut_(params.callback, res);
      return jsonOut_(res);
    }
    if (params.action) return jsonOut_(handle_(params));
    return jsonOut_(fail_('BAD_REQUEST', 'Gunakan ?action=ping atau ?payload={...}'));
  } catch (err) {
    return jsonOut_(errOut_(err));
  }
}
function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) || '{}';
    var req = JSON.parse(body);
    return jsonOut_(handle_(req));
  } catch (err) {
    return jsonOut_(errOut_(err));
  }
}
function errOut_(err) {
  if (err && err.isApi) return fail_(err.apiCode, err.message, err.apiHint);
  return fail_('SERVER_ERROR', (err && err.message) || 'Terjadi kesalahan pada server', 'Coba lagi beberapa saat.');
}
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function jsonpOut_(cb, obj) {
  if (!/^[A-Za-z_$][\w$.]*$/.test(cb)) cb = 'callback';
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function ping_() {
  return {
    pong: true, app: APP.NAME, version: APP.VERSION, time: iso_(now_()), tz: APP.TZ,
    sheets: Object.keys(SCHEMA).length, fitur: Object.keys(featureDefs_()).length, routes: Object.keys(ROUTES).length
  };
}
/* ==========================================================================
 * 10. MEDIA — Google Drive (unggah, ganti, hapus, tampilkan)
 * ========================================================================== */
function driveFolder_(sub) {
  var props = PropertiesService.getScriptProperties();
  var parentId = props.getProperty(APP.PROP_FOLDER);
  var parent = null;
  if (parentId) { try { parent = DriveApp.getFolderById(parentId); } catch (e) { parent = null; } }
  if (!parent) {
    var it = DriveApp.getFoldersByName(APP.DRIVE_FOLDER);
    parent = it.hasNext() ? it.next() : DriveApp.createFolder(APP.DRIVE_FOLDER);
    props.setProperty(APP.PROP_FOLDER, parent.getId());
  }
  if (!sub) return parent;
  var name = str_(sub).replace(/[^\w\- ]/g, '') || 'umum';
  var c = parent.getFoldersByName(name);
  return c.hasNext() ? c.next() : parent.createFolder(name);
}
function driveUrl_(id) { return 'https://lh3.googleusercontent.com/d/' + id + '=w1400'; }
function driveThumb_(id) { return 'https://lh3.googleusercontent.com/d/' + id + '=w600'; }
function mediaObj_(file, folder) {
  var id = file.getId();
  return {
    drive_id: id, nama: file.getName(), mime: file.getMimeType(), ukuran: file.getSize(),
    url: driveUrl_(id), thumb: driveThumb_(id), folder: folder || 'umum',
    dibuat: iso_(file.getDateCreated()), diubah: iso_(file.getLastUpdated())
  };
}
function mediaList_(req) {
  var folder = str_(req.folder) || 'umum';
  var f = driveFolder_(folder === 'semua' ? null : folder);
  var files = f.getFiles();
  var out = [];
  var i = 0;
  while (files.hasNext() && i < 300) {
    var file = files.next();
    var mime = file.getMimeType();
    if (mime.indexOf('image/') !== 0) continue;
    var m = mediaObj_(file, folder);
    m.id = 'IMG-' + m.drive_id.slice(-8);
    if (req.q && low_(m.nama).indexOf(low_(req.q)) < 0) continue;
    out.push(m);
    i++;
  }
  sortBy_(out, 'dibuat', 'desc');
  return { items: out, folder: folder, total: out.length };
}
function mediaFolders_() {
  var parent = driveFolder_();
  var it = parent.getFolders();
  var out = [{ nama: 'umum', label: 'Umum' }];
  while (it.hasNext()) { var f = it.next(); out.push({ nama: f.getName(), label: f.getName() }); }
  return { items: out, root: parent.getName(), root_id: parent.getId() };
}
function mediaUpload_(req, ctx) {
  var data = str_(req.data);
  if (!data) throw apiErr_('BAD_REQUEST', 'Data gambar kosong');
  var m = data.match(/^data:([\w/+.-]+);base64,(.+)$/);
  var mime = m ? m[1] : 'image/jpeg';
  var b64 = m ? m[2] : data.replace(/^data:[^,]+,/, '');
  if (mime.indexOf('image/') !== 0) throw apiErr_('BAD_REQUEST', 'Hanya berkas gambar yang diizinkan');
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > APP.MAX_UPLOAD_BYTES) throw apiErr_('BAD_REQUEST', 'Ukuran gambar maksimal 8 MB');
  var ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  var base = slugify_(req.nama || 'gambar-' + Date.now());
  var folder = str_(req.folder) || 'produk';
  var blob = Utilities.newBlob(bytes, mime, base + '.' + ext);
  var folderObj = driveFolder_(folder);
  var file = req.drive_id ? (function () {
    var f = DriveApp.getFileById(req.drive_id);
    f.setContent(blob);
    if (req.nama) f.setName(base + '.' + ext);
    return f;
  })() : folderObj.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
  var obj = mediaObj_(file, folder);
  writeRow_('MEDIA', Object.assign({ id: 'IMG-' + obj.drive_id.slice(-8) }, obj));
  audit_(req.drive_id ? 'GANTI_GAMBAR' : 'UNGGAH_GAMBAR', 'MEDIA', obj.drive_id, obj.nama);
  return obj;
}
function mediaDelete_(req, ctx) {
  var id = str_(req.drive_id);
  if (!id) throw apiErr_('BAD_REQUEST', 'drive_id wajib');
  var file = DriveApp.getFileById(id);
  var nama = file.getName();
  file.setTrashed(true);
  var row = null;
  readAll_('MEDIA').forEach(function (r) { if (str_(r.drive_id) === id) row = r; });
  if (row) deleteRow_('MEDIA', row.id);
  audit_('HAPUS_GAMBAR', 'MEDIA', id, nama);
  return { ok: true, drive_id: id };
}
function mediaRename_(req, ctx) {
  var file = DriveApp.getFileById(str_(req.drive_id));
  file.setName(slugify_(req.nama || file.getName().split('.')[0]) + '.' + (file.getName().split('.').pop() || 'jpg'));
  audit_('UBAH_NAMA_GAMBAR', 'MEDIA', str_(req.drive_id), str_(req.nama));
  return mediaObj_(file);
}
function mediaRepair_() {
  var folder = driveFolder_();
  var files = folder.getFiles();
  var n = 0;
  while (files.hasNext()) {
    var f = files.next();
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); n++; } catch (e) { }
  }
  return { diproses: n };
}

/* ==========================================================================
 * 11. PUBLIK — storefront
 * ========================================================================== */
function publicSettings_() {
  var keys = ['toko_nama', 'toko_tagline', 'toko_deskripsi', 'toko_alamat', 'toko_kota', 'toko_provinsi',
    'toko_wa', 'toko_email', 'toko_jam', 'toko_ig', 'toko_tiktok', 'toko_maps', 'toko_sejak', 'rekening',
    'hero_judul', 'hero_sub', 'ticker_teks', 'ongkir_default', 'gratis_ongkir_min', 'ppn_pct', 'poin_per_1000', 'poin_nilai'];
  var out = {};
  keys.forEach(function (k) { out[k] = setting_(k, DEFAULT_SETTINGS[k] || ''); });
  return out;
}
function productsSafe_(rows) {
  return rows.filter(function (p) { return up_(p.status) !== 'ARSIP'; }).map(function (p) {
    return {
      id: p.id, sku: p.sku, nama: p.nama, kategori: p.kategori, brand: p.brand, tipe: p.tipe,
      kondisi: p.kondisi, harga: num_(p.harga), harga_coret: num_(p.harga_coret), stok: num_(p.stok),
      garansi: p.garansi, gambar: p.gambar, deskripsi: p.deskripsi, spesifikasi: obj_(p.spesifikasi),
      unggulan: bool_(p.unggulan), terjual: num_(p.terjual), rating: num_(p.rating, 5), urutan: num_(p.urutan)
    };
  });
}
function publicBootstrap_(req) {
  var cached = cacheGet_('public.bootstrap');
  if (cached && !req.refresh) return cached;
  var prods = productsSafe_(readAll_('PRODUCT'));
  var cats = readAll_('CATEGORY').filter(function (c) { return bool_(c.aktif); });
  var banners = readAll_('BANNER').filter(function (b) { return bool_(b.aktif); });
  var testis = readAll_('TESTI').filter(function (t) { return bool_(t.aktif); });
  var orders = readAll_('ORDER');
  var custs = readAll_('CUSTOMER');
  sortBy_(banners, 'urutan', 'asc');
  sortBy_(testis, 'urutan', 'asc');
  var feat = featureMapFor_('PUBLIC');
  var ratingSum = 0, ratingN = 0;
  testis.forEach(function (t) { ratingSum += num_(t.rating, 5); ratingN++; });
  var data = {
    settings: publicSettings_(),
    features: feat,
    categories: cats.map(function (c) { return { id: c.id, nama: c.nama, slug: c.slug, ikon: c.ikon, gambar: c.gambar, deskripsi: c.deskripsi }; }),
    banners: banners.map(function (b) { return { id: b.id, judul: b.judul, subjudul: b.subjudul, gambar: b.gambar, link: b.link }; }),
    testimonials: testis.map(function (t) { return { id: t.id, nama: t.nama, kota: t.kota, rating: num_(t.rating, 5), pesan: t.pesan, avatar: t.avatar, produk: t.produk }; }),
    products: prods,
    stats: {
      produk: prods.length,
      terjual: orders.filter(function (o) { return up_(o.status) === 'LUNAS'; }).length,
      pelanggan: custs.length,
      rating: ratingN ? Math.round((ratingSum / ratingN) * 10) / 10 : 5,
      ulasan: ratingN
    },
    faq: (function () { try { return JSON.parse(setting_('faq', DEFAULT_SETTINGS.faq)); } catch (e) { return []; } })(),
    config: { gratis_ongkir_min: settingNum_('gratis_ongkir_min', 5000000), ongkir_default: settingNum_('ongkir_default', 0) }
  };
  cachePut_('public.bootstrap', data, 90);
  return data;
}
function publicProducts_(req) {
  var rows = productsSafe_(readAll_('PRODUCT'));
  var q = low_(req.q);
  if (q) rows = rows.filter(function (p) { return (low_(p.nama) + ' ' + low_(p.brand) + ' ' + low_(p.sku) + ' ' + low_(p.kategori)).indexOf(q) >= 0; });
  if (req.kategori && req.kategori !== 'Semua') rows = rows.filter(function (p) { return p.kategori === req.kategori; });
  if (req.kondisi) rows = rows.filter(function (p) { return up_(p.kondisi) === up_(req.kondisi); });
  if (bool_(req.unggulan)) rows = rows.filter(function (p) { return p.unggulan; });
  if (bool_(req.tersedia)) rows = rows.filter(function (p) { return p.stok > 0; });
  if (bool_(req.paket)) rows = rows.filter(function (p) { return up_(p.tipe) === 'PAKET'; });
  if (bool_(req.diskon)) rows = rows.filter(function (p) { return p.harga_coret > p.harga; });
  var sort = str_(req.sort || 'unggulan');
  if (sort === 'termurah') sortBy_(rows, 'harga', 'asc');
  else if (sort === 'termahal') sortBy_(rows, 'harga', 'desc');
  else if (sort === 'terbaru') rows = rows.reverse();
  else if (sort === 'terlaris') sortBy_(rows, 'terjual', 'desc');
  else if (sort === 'nama') sortBy_(rows, 'nama', 'asc');
  else rows.sort(function (a, b) { return (b.unggulan - a.unggulan) || (a.urutan - b.urutan) || (b.terjual - a.terjual); });
  return page_(rows, req);
}
function publicProductDetail_(req) {
  var rows = readAll_('PRODUCT');
  var p = null;
  rows.forEach(function (x) { if (str_(x.sku) === str_(req.sku) || str_(x.id) === str_(req.id)) p = x; });
  if (!p) throw apiErr_('NOT_FOUND', 'Produk tidak ditemukan');
  var safe = productsSafe_([p])[0];
  var related = productsSafe_(rows.filter(function (x) { return x.id !== p.id; })
    .filter(function (x) { return x.kategori === p.kategori || x.brand === p.brand; })).slice(0, 6);
  return { product: safe, related: related };
}
function publicPromoCheck_(req) {
  var kode = up_(req.kode);
  var subtotal = num_(req.subtotal);
  var promo = null;
  readAll_('PROMO').forEach(function (p) { if (up_(p.kode) === kode) promo = p; });
  if (!promo) throw apiErr_('NOT_FOUND', 'Kode promo tidak ditemukan');
  if (!bool_(promo.aktif)) throw apiErr_('BAD_REQUEST', 'Kode promo tidak aktif');
  var today = today_();
  if (promo.mulai && today < str_(promo.mulai).slice(0, 10)) throw apiErr_('BAD_REQUEST', 'Promo belum berlaku');
  if (promo.akhir && today > str_(promo.akhir).slice(0, 10)) throw apiErr_('BAD_REQUEST', 'Promo sudah berakhir');
  if (num_(promo.kuota) > 0 && num_(promo.terpakai) >= num_(promo.kuota)) throw apiErr_('BAD_REQUEST', 'Kuota promo habis');
  if (subtotal < num_(promo.min_belanja)) throw apiErr_('BAD_REQUEST', 'Minimal belanja ' + rupiah_(promo.min_belanja) + ' untuk kode ini');
  var diskon = up_(promo.tipe) === 'PERSEN' ? subtotal * num_(promo.nilai) / 100 : num_(promo.nilai);
  if (num_(promo.maks_diskon) > 0) diskon = Math.min(diskon, num_(promo.maks_diskon));
  diskon = Math.min(diskon, subtotal);
  return { kode: up_(promo.kode), judul: promo.judul, tipe: promo.tipe, nilai: num_(promo.nilai), diskon: Math.round(diskon) };
}
function publicOrderCreate_(req) {
  if (!featureOn_('pesanan.online', 'PUBLIC')) throw apiErr_('FEATURE_OFF', 'Pesanan online sedang ditutup', 'Silakan hubungi kami lewat WhatsApp.');
  var nama = str_(req.nama), wa = waNorm_(req.wa), items = arr_(req.items);
  if (!nama) throw apiErr_('BAD_REQUEST', 'Nama wajib diisi');
  if (!wa || wa.length < 9) throw apiErr_('BAD_REQUEST', 'Nomor WhatsApp tidak valid');
  if (!items.length) throw apiErr_('BAD_REQUEST', 'Keranjang kosong');
  var prods = readAll_('PRODUCT');
  var lines = [], subtotal = 0;
  items.forEach(function (it) {
    var p = null;
    prods.forEach(function (x) { if (str_(x.sku) === str_(it.sku)) p = x; });
    if (!p) throw apiErr_('NOT_FOUND', 'Produk ' + it.sku + ' tidak dijual lagi');
    var qty = clamp_(int_(it.qty, 1), 1, 99);
    if (num_(p.stok) < qty) throw apiErr_('OUT_OF_STOCK', 'Stok ' + p.nama + ' tersisa ' + p.stok);
    lines.push({ sku: p.sku, nama: p.nama, qty: qty, harga: num_(p.harga), gambar: p.gambar });
    subtotal += num_(p.harga) * qty;
  });
  var diskon = 0, promoKode = '';
  if (req.promo && featureOn_('promo.publik', 'PUBLIC')) {
    try { var pr = publicPromoCheck_({ kode: req.promo, subtotal: subtotal }); diskon = pr.diskon; promoKode = pr.kode; } catch (e) { diskon = 0; }
  }
  var ongkir = num_(req.ongkir, settingNum_('ongkir_default', 0));
  var gratisMin = settingNum_('gratis_ongkir_min', 0);
  if (gratisMin > 0 && subtotal >= gratisMin) ongkir = 0;
  var ppn = settingNum_('ppn_pct', 0);
  var pajak = ppn > 0 ? Math.round((subtotal - diskon) * ppn / 100) : 0;
  var total = Math.max(0, subtotal - diskon + ongkir + pajak);
  var id = nextId_('ORDER');
  var order = {
    id: id, tanggal: iso_(now_()), tipe: 'ONLINE', nama: nama, wa: wa,
    alamat: str_(req.alamat), kota: str_(req.kota), items: lines, subtotal: subtotal, diskon: diskon,
    promo: promoKode, ongkir: ongkir, total: total, metode: str_(req.metode || 'TRANSFER'),
    status: 'MENUNGGU', sumber: 'WEB', catatan: str_(req.catatan), dibuat: iso_(now_())
  };
  writeRow_('ORDER', order);
  audit_('PESANAN_BARU', 'ORDER', id, nama + ' · ' + rupiah_(total));
  /* daftarkan pelanggan */
  upsertCustomer_({ nama: nama, wa: wa, kota: str_(req.kota), alamat: str_(req.alamat) });
  cacheBust_();
  var itemsText = lines.map(function (l) { return '• ' + l.nama + ' ×' + l.qty + ' = ' + rupiah_(l.harga * l.qty); }).join('\n');
  var waText = fillTpl_(setting_('wa_tpl_order', DEFAULT_SETTINGS.wa_tpl_order), {
    toko: setting_('toko_nama'), items: itemsText, subtotal: rupiah_(subtotal), diskon: rupiah_(diskon),
    total: rupiah_(total), nama: nama, wa: wa, alamat: str_(req.alamat) + (req.kota ? ', ' + req.kota : ''),
    kode: id, tahun: now_().getFullYear()
  });
  return { order: order, wa_link: 'https://wa.me/' + setting_('toko_wa') + '?text=' + encodeURIComponent(waText), rekening: setting_('rekening') };
}
function publicTrack_(req) {
  var q = str_(req.q).trim();
  if (q.length < 4) throw apiErr_('BAD_REQUEST', 'Masukkan kode pesanan atau nomor WhatsApp');
  var isCode = /^(INV|SVC|TRD)-/i.test(q);
  var orders = readAll_('ORDER').filter(function (o) {
    return isCode ? low_(o.id) === low_(q) : str_(o.wa) === waNorm_(q);
  });
  var services = readAll_('SERVICE').filter(function (s) {
    return isCode ? low_(s.id) === low_(q) : str_(s.wa) === waNorm_(q);
  });
  var tradeins = readAll_('TRADEIN').filter(function (t) {
    return isCode ? low_(t.id) === low_(q) : str_(t.wa) === waNorm_(q);
  });
  if (!orders.length && !services.length && !tradeins.length) throw apiErr_('NOT_FOUND', 'Tidak ada data untuk "' + q + '"');
  return {
    orders: orders.map(function (o) {
      return { id: o.id, tanggal: o.tanggal, status: o.status, total: num_(o.total), items: arr_(o.items), metode: o.metode, nama: o.nama };
    }).slice(0, 10),
    services: services.map(function (s) {
      return { id: s.id, tanggal: s.tanggal, nama: s.nama, perangkat: s.perangkat, status: s.status, biaya: num_(s.biaya), estimasi: num_(s.estimasi), keluhan: s.keluhan };
    }).slice(0, 10),
    tradeins: tradeins.map(function (t) {
      return { id: t.id, tanggal: t.tanggal, nama: t.nama, perangkat: t.perangkat, status: t.status, penawaran: num_(t.penawaran), estimasi_lo: num_(t.estimasi_lo), estimasi_hi: num_(t.estimasi_hi) };
    }).slice(0, 10)
  };
}
function publicServiceApply_(req) {
  if (!featureOn_('admin.service', 'PUBLIC')) throw apiErr_('FEATURE_OFF', 'Pendaftaran service sedang ditutup');
  var nama = str_(req.nama), wa = waNorm_(req.wa), perangkat = str_(req.perangkat), keluhan = str_(req.keluhan);
  if (!nama || !wa || !perangkat || !keluhan) throw apiErr_('BAD_REQUEST', 'Nama, WhatsApp, perangkat, dan keluhan wajib diisi');
  var id = nextId_('SERVICE');
  var row = {
    id: id, tanggal: iso_(now_()), nama: nama, wa: wa, perangkat: perangkat,
    kategori: str_(req.kategori || 'Laptop'), keluhan: keluhan, teknisi: '', status: 'MASUK',
    estimasi: 0, biaya: 0, catatan: 'Pendaftaran dari web', dibuat: iso_(now_())
  };
  writeRow_('SERVICE', row);
  audit_('SERVICE_BARU', 'SERVICE', id, perangkat);
  upsertCustomer_({ nama: nama, wa: wa });
  return { service: row, wa_link: 'https://wa.me/' + setting_('toko_wa') + '?text=' + encodeURIComponent('Halo ' + setting_('toko_nama') + ', saya sudah mendaftar service dengan kode ' + id + '.') };
}
function tradeinEstimate_(req) {
  var tahun = int_(req.tahun, now_().getFullYear() - 2);
  var harga = num_(req.harga_awal || req.harga);
  var kondisi = up_(req.kondisi || 'BAIK');
  var umur = Math.max(0, now_().getFullYear() - tahun);
  var fUmur = umur <= 1 ? 0.78 : umur <= 2 ? 0.68 : umur <= 3 ? 0.58 : umur <= 4 ? 0.48 : umur <= 5 ? 0.38 : umur <= 7 ? 0.28 : 0.18;
  var fKondisi = { MULUS: 1, BAIK: 0.9, NORMAL: 0.78, MINUS: 0.62, RUSAK: 0.42 }[kondisi] || 0.78;
  var brand = up_(req.brand || '');
  var fBrand = ['APPLE', 'ROG', 'LEGION', 'MSI', 'THINKPAD', 'XPS', 'MACBOOK'].some(function (b) { return brand.indexOf(b) >= 0; }) ? 1.08 : 1;
  var kat = low_(req.kategori || 'Laptop');
  var fKat = kat.indexOf('laptop') >= 0 ? 1.05 : kat.indexOf('komponen') >= 0 ? 0.9 : 1;
  var dasar = harga * fUmur * fKondisi * fBrand * fKat;
  var lo = Math.round(dasar * 0.92 / 1000) * 1000;
  var hi = Math.round(dasar * 1.06 / 1000) * 1000;
  var bonus = Math.round(hi * settingNum_('tradein_bonus_pct', 5) / 100 / 1000) * 1000;
  return {
    faktor: { umur: fUmur, kondisi: fKondisi, brand: fBrand, kategori: fKat, tahun_unit: umur },
    estimasi_lo: lo, estimasi_hi: hi, bonus_upgrade: bonus, dasar: Math.round(dasar),
    catatan: 'Estimasi indikatif. Nilai final ditentukan setelah pemeriksaan fisik unit.'
  };
}
function publicTradeinApply_(req) {
  var nama = str_(req.nama), wa = waNorm_(req.wa);
  if (!nama || !wa) throw apiErr_('BAD_REQUEST', 'Nama dan WhatsApp wajib diisi');
  var est = tradeinEstimate_(req);
  var id = nextId_('TRADEIN');
  var row = {
    id: id, tanggal: iso_(now_()), nama: nama, wa: wa, perangkat: str_(req.perangkat || 'Laptop'),
    kategori: str_(req.kategori || 'Laptop'), brand: str_(req.brand), tahun: int_(req.tahun, 0),
    kondisi: up_(req.kondisi || 'BAIK'), harga_awal: num_(req.harga_awal || req.harga),
    estimasi_lo: est.estimasi_lo, estimasi_hi: est.estimasi_hi, penawaran: 0,
    status: 'BARU', catatan: 'Pengajuan dari web', dibuat: iso_(now_())
  };
  writeRow_('TRADEIN', row);
  audit_('TRADEIN_BARU', 'TRADEIN', id, row.perangkat);
  upsertCustomer_({ nama: nama, wa: wa });
  return { tradein: row, wa_link: 'https://wa.me/' + setting_('toko_wa') + '?text=' + encodeURIComponent('Halo, saya mengajukan tukar tambah ' + row.perangkat + ' dengan kode ' + id + '.') };
}
function publicLead_(req) {
  var nama = str_(req.nama), wa = waNorm_(req.wa);
  if (!nama || !wa) throw apiErr_('BAD_REQUEST', 'Nama dan WhatsApp wajib diisi');
  var c = upsertCustomer_({ nama: nama, wa: wa, catatan: 'LEAD: ' + str_(req.minat || 'Konsultasi umum') });
  audit_('LEAD_BARU', 'CUSTOMER', c.id, nama + ' · ' + str_(req.minat));
  return { ok: true, pesan: 'Terima kasih! Tim kami akan menghubungi Anda lewat WhatsApp.' };
}
function publicTestimonials_() {
  return page_(readAll_('TESTI').filter(function (t) { return bool_(t.aktif); }), { limit: 50 });
}
/* ==========================================================================
 * 12. DASHBOARD & LAPORAN
 * ========================================================================== */
function ordersPaid_() {
  return readAll_('ORDER').filter(function (o) { return up_(o.status) === 'LUNAS'; });
}
function dashStats_(req, ctx) {
  var orders = readAll_('ORDER');
  var paid = orders.filter(function (o) { return up_(o.status) === 'LUNAS'; });
  var prods = readAll_('PRODUCT');
  var custs = readAll_('CUSTOMER');
  var services = readAll_('SERVICE');
  var tradeins = readAll_('TRADEIN');
  var today = today_();
  var month = today.slice(0, 7);
  var omzetHari = 0, omzetBulan = 0, labaBulan = 0;
  var costMap = {};
  prods.forEach(function (p) { costMap[str_(p.sku)] = num_(p.harga_beli); });
  paid.forEach(function (o) {
    var d = str_(o.tanggal).slice(0, 10);
    var t = num_(o.total);
    if (d === today) omzetHari += t;
    if (d.slice(0, 7) === month) {
      omzetBulan += t;
      var hpp = arr_(o.items).reduce(function (a, it) { return a + num_(costMap[str_(it.sku)]) * num_(it.qty, 1); }, 0);
      labaBulan += (num_(o.subtotal) - num_(o.diskon) - hpp);
    }
  });
  var lowStock = prods.filter(function (p) { return up_(p.status) !== 'ARSIP' && num_(p.stok) <= 5; });
  var nilaiStok = prods.reduce(function (a, p) { return a + num_(p.harga_beli) * num_(p.stok); }, 0);
  var statusCount = {};
  SERVICE_STATUS.forEach(function (s) { statusCount[s] = services.filter(function (x) { return up_(x.status) === s; }).length; });
  var notif = [];
  if (featureOn_('dash.stok_menipis', ctx.user.role)) {
    lowStock.slice(0, 6).forEach(function (p) {
      notif.push({ tipe: num_(p.stok) <= 0 ? 'bad' : 'warn', judul: 'Stok ' + (num_(p.stok) <= 0 ? 'habis' : 'menipis') + ': ' + p.nama, sub: 'Sisa ' + num_(p.stok) + ' unit · ' + p.sku });
    });
  }
  orders.filter(function (o) { return up_(o.status) === 'MENUNGGU'; }).slice(0, 6).forEach(function (o) {
    notif.push({ tipe: 'info', judul: 'Pesanan menunggu: ' + o.id, sub: o.nama + ' · ' + rupiah_(o.total) });
  });
  services.filter(function (s) { return up_(s.status) === 'MASUK'; }).slice(0, 4).forEach(function (s) {
    notif.push({ tipe: 'violet', judul: 'Service baru: ' + s.id, sub: s.perangkat + ' · ' + s.nama });
  });
  return {
    kpi: {
      omzet_hari: omzetHari, omzet_bulan: omzetBulan, laba_bulan: Math.round(labaBulan),
      trx_bulan: paid.filter(function (o) { return str_(o.tanggal).slice(0, 7) === month; }).length,
      pesanan_menunggu: orders.filter(function (o) { return up_(o.status) === 'MENUNGGU'; }).length,
      produk: prods.filter(function (p) { return up_(p.status) !== 'ARSIP'; }).length,
      stok_menipis: lowStock.length, nilai_stok: nilaiStok,
      pelanggan: custs.length,
      service_aktif: services.filter(function (s) { return ['MASUK', 'DIAGNOSA', 'DIKERJAKAN'].indexOf(up_(s.status)) >= 0; }).length,
      tradein_baru: tradeins.filter(function (t) { return up_(t.status) === 'BARU'; }).length
    },
    status_service: statusCount,
    notifikasi: notif.slice(0, 10),
    terbaru: sortBy_(orders, 'tanggal', 'desc').slice(0, 6).map(function (o) {
      return { id: o.id, nama: o.nama, total: num_(o.total), status: o.status, tanggal: o.tanggal, tipe: o.tipe };
    }),
    terlaris: sortBy_(prods.slice(), 'terjual', 'desc').slice(0, 5).map(function (p) {
      return { sku: p.sku, nama: p.nama, terjual: num_(p.terjual), gambar: p.gambar, harga: num_(p.harga) };
    }),
    stok_menipis_list: lowStock.slice(0, 8).map(function (p) { return { sku: p.sku, nama: p.nama, stok: num_(p.stok) }; }),
    staf: addDays_(0)
  };
}
function addDays_(n) { return iso_(new Date(now_().getTime() + n * 86400000)); }

function dashCharts_(req, ctx) {
  var days = clamp_(int_(req.days, 14), 7, 60);
  var paid = ordersPaid_();
  var prods = readAll_('PRODUCT');
  var katMap = {};
  prods.forEach(function (p) { katMap[str_(p.sku)] = str_(p.kategori) || 'Lainnya'; });
  var daily = [], dailyTrx = [];
  for (var i = days - 1; i >= 0; i--) {
    var key = daysAgoKey_(i);
    var t = paid.filter(function (o) { return str_(o.tanggal).slice(0, 10) === key; });
    daily.push({ label: key.slice(8, 10) + '/' + key.slice(5, 7), key: key, value: t.reduce(function (a, o) { return a + num_(o.total); }, 0) });
    dailyTrx.push({ label: key.slice(8, 10) + '/' + key.slice(5, 7), key: key, value: t.length });
  }
  var katAgg = {};
  var payAgg = {};
  var prodAgg = {};
  paid.forEach(function (o) {
    var k = up_(o.metode) || 'LAINNYA';
    payAgg[k] = (payAgg[k] || 0) + 1;
    arr_(o.items).forEach(function (it) {
      var kat = katMap[str_(it.sku)] || 'Lainnya';
      var val = num_(it.harga) * num_(it.qty, 1);
      katAgg[kat] = (katAgg[kat] || 0) + val;
      var nm = str_(it.nama);
      if (!prodAgg[nm]) prodAgg[nm] = { nama: nm, qty: 0, nilai: 0 };
      prodAgg[nm].qty += num_(it.qty, 1);
      prodAgg[nm].nilai += val;
    });
  });
  var statusAgg = {};
  readAll_('ORDER').forEach(function (o) { var s = up_(o.status); statusAgg[s] = (statusAgg[s] || 0) + 1; });
  var tiers = {};
  readAll_('CUSTOMER').forEach(function (c) { var t = up_(c.tier) || 'BRONZE'; tiers[t] = (tiers[t] || 0) + 1; });
  return {
    days: days,
    omzet: { labels: daily.map(function (d) { return d.label; }), values: daily.map(function (d) { return Math.round(d.value); }) },
    transaksi: { labels: dailyTrx.map(function (d) { return d.label; }), values: dailyTrx.map(function (d) { return d.value; }) },
    kategori: { labels: Object.keys(katAgg), values: Object.keys(katAgg).map(function (k) { return Math.round(katAgg[k]); }) },
    metode: { labels: Object.keys(payAgg), values: Object.keys(payAgg).map(function (k) { return payAgg[k]; }) },
    status: { labels: Object.keys(statusAgg), values: Object.keys(statusAgg).map(function (k) { return statusAgg[k]; }) },
    tier: { labels: Object.keys(tiers), values: Object.keys(tiers).map(function (k) { return tiers[k]; }) },
    top_produk: Object.keys(prodAgg).map(function (k) { return prodAgg[k]; }).sort(function (a, b) { return b.nilai - a.nilai; }).slice(0, 6),
    total_omzet: daily.reduce(function (a, d) { return a + d.value; }, 0)
  };
}

function laporan_(req, ctx) {
  var dari = str_(req.dari) || monthKey_(now_()) + '-01';
  var sampai = str_(req.sampai) || today_();
  var paid = ordersPaid_().filter(function (o) {
    var d = str_(o.tanggal).slice(0, 10);
    return d >= dari && d <= sampai;
  });
  var prods = readAll_('PRODUCT');
  var costMap = {};
  prods.forEach(function (p) { costMap[str_(p.sku)] = num_(p.harga_beli); });
  var omzet = 0, hpp = 0, diskon = 0, ongkir = 0;
  var byKat = {}, byDay = {}, byPay = {}, byProd = {};
  paid.forEach(function (o) {
    omzet += num_(o.total); diskon += num_(o.diskon); ongkir += num_(o.ongkir);
    byPay[up_(o.metode)] = (byPay[up_(o.metode)] || 0) + num_(o.total);
    var key = str_(o.tanggal).slice(0, 10);
    if (!byDay[key]) byDay[key] = { omzet: 0, trx: 0 };
    byDay[key].omzet += num_(o.total);
    byDay[key].trx += 1;
    arr_(o.items).forEach(function (it) {
      var h = num_(costMap[str_(it.sku)]) * num_(it.qty, 1);
      var v = num_(it.harga) * num_(it.qty, 1);
      hpp += h;
      var kat = 'Lainnya';
      prods.forEach(function (p) { if (str_(p.sku) === str_(it.sku)) kat = str_(p.kategori) || 'Lainnya'; });
      byKat[kat] = (byKat[kat] || 0) + v;
      if (!byProd[it.nama]) byProd[it.nama] = { nama: it.nama, qty: 0, nilai: 0, laba: 0 };
      byProd[it.nama].qty += num_(it.qty, 1);
      byProd[it.nama].nilai += v;
      byProd[it.nama].laba += (v - h);
    });
  });
  var dayKeys = Object.keys(byDay).sort();
  return {
    periode: { dari: dari, sampai: sampai },
    ringkasan: {
      omzet: omzet, hpp: hpp, laba: Math.round(omzet - hpp), trx: paid.length,
      aov: paid.length ? Math.round(omzet / paid.length) : 0, diskon: diskon, ongkir: ongkir,
      unit: paid.reduce(function (a, o) { return a + arr_(o.items).reduce(function (b, it) { return b + num_(it.qty, 1); }, 0); }, 0)
    },
    harian: { labels: dayKeys.map(function (k) { return k.slice(8) + '/' + k.slice(5, 7); }), omzet: dayKeys.map(function (k) { return Math.round(byDay[k].omzet); }), trx: dayKeys.map(function (k) { return byDay[k].trx; }) },
    kategori: Object.keys(byKat).map(function (k) { return { nama: k, nilai: Math.round(byKat[k]) }; }).sort(function (a, b) { return b.nilai - a.nilai; }),
    metode: Object.keys(byPay).map(function (k) { return { nama: k, nilai: Math.round(byPay[k]) }; }).sort(function (a, b) { return b.nilai - a.nilai; }),
    produk: Object.keys(byProd).map(function (k) { return byProd[k]; }).sort(function (a, b) { return b.nilai - a.nilai; }).slice(0, 20),
    csv: req.export ? csvLaporan_(paid, byDay) : null
  };
}
function csvLaporan_(paid, byDay) {
  var rows = [['Tanggal', 'Kode', 'Nama', 'Tipe', 'Metode', 'Subtotal', 'Diskon', 'Total', 'Status']];
  paid.forEach(function (o) {
    rows.push([str_(o.tanggal).slice(0, 10), o.id, o.nama, o.tipe, o.metode, num_(o.subtotal), num_(o.diskon), num_(o.total), o.status]);
  });
  return rows.map(function (r) { return r.map(function (c) { return '"' + str_(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
}

/* ==========================================================================
 * 13. PRODUK
 * ========================================================================== */
function productList_(req, ctx) {
  var rows = readAll_('PRODUCT');
  var q = low_(req.q);
  if (q) rows = rows.filter(function (p) { return (low_(p.nama) + ' ' + low_(p.sku) + ' ' + low_(p.brand) + ' ' + low_(p.kategori)).indexOf(q) >= 0; });
  if (req.kategori && req.kategori !== 'Semua') rows = rows.filter(function (p) { return p.kategori === req.kategori; });
  if (req.status) rows = rows.filter(function (p) { return up_(p.status) === up_(req.status); });
  if (req.kondisi) rows = rows.filter(function (p) { return up_(p.kondisi) === up_(req.kondisi); });
  if (bool_(req.menipis)) rows = rows.filter(function (p) { return num_(p.stok) <= 5; });
  var sort = str_(req.sort || 'baru');
  if (sort === 'nama') sortBy_(rows, 'nama', 'asc');
  else if (sort === 'harga_asc') sortBy_(rows, 'harga', 'asc');
  else if (sort === 'harga_desc') sortBy_(rows, 'harga', 'desc');
  else if (sort === 'stok') sortBy_(rows, 'stok', 'asc');
  else if (sort === 'terjual') sortBy_(rows, 'terjual', 'desc');
  else rows = rows.reverse();
  var pg = page_(rows.map(mapProduct_), req);
  pg.kpi = {
    total: readAll_('PRODUCT').length,
    aktif: readAll_('PRODUCT').filter(function (p) { return up_(p.status) === 'AKTIF'; }).length,
    arsip: readAll_('PRODUCT').filter(function (p) { return up_(p.status) === 'ARSIP'; }).length,
    menipis: readAll_('PRODUCT').filter(function (p) { return num_(p.stok) <= 5; }).length
  };
  return pg;
}
function mapProduct_(p) {
  return {
    id: p.id, sku: p.sku, nama: p.nama, kategori: p.kategori, brand: p.brand, tipe: p.tipe,
    kondisi: p.kondisi, harga: num_(p.harga), harga_coret: num_(p.harga_coret), harga_beli: num_(p.harga_beli),
    stok: num_(p.stok), garansi: p.garansi, gambar: p.gambar, deskripsi: p.deskripsi,
    spesifikasi: obj_(p.spesifikasi), unggulan: bool_(p.unggulan), status: p.status,
    terjual: num_(p.terjual), rating: num_(p.rating, 5), urutan: num_(p.urutan), dibuat: p.dibuat, diubah: p.diubah
  };
}
function productGet_(req) {
  var p = null;
  readAll_('PRODUCT').forEach(function (x) { if (str_(x.id) === str_(req.id) || str_(x.sku) === str_(req.sku)) p = x; });
  if (!p) throw apiErr_('NOT_FOUND', 'Produk tidak ditemukan');
  return mapProduct_(p);
}
function productSave_(req, ctx) {
  var d = obj_(req.data) && Object.keys(obj_(req.data)).length ? obj_(req.data) : req;
  var nama = str_(d.nama);
  if (!nama) throw apiErr_('BAD_REQUEST', 'Nama produk wajib diisi');
  var ex = d.id ? findById_('PRODUCT', d.id) : null;
  if (!ex && d.sku) {
    readAll_('PRODUCT').forEach(function (p) { if (up_(p.sku) === up_(d.sku)) ex = p; });
  }
  var sku = up_(d.sku) || (ex ? ex.sku : nextSku_(d.kategori, d.brand));
  var dup = null;
  readAll_('PRODUCT').forEach(function (p) { if (up_(p.sku) === sku && (!ex || p.id !== ex.id)) dup = p; });
  if (dup) throw apiErr_('DUPLICATE', 'SKU ' + sku + ' sudah dipakai produk lain');
  var obj = {
    id: ex ? ex.id : nextId_('PRODUCT'), sku: sku, nama: nama,
    kategori: str_(d.kategori || 'Laptop'), brand: str_(d.brand), tipe: up_(d.tipe || 'UNIT'),
    kondisi: up_(d.kondisi || 'BARU'), harga: num_(d.harga), harga_coret: num_(d.harga_coret),
    harga_beli: num_(d.harga_beli), stok: int_(d.stok, ex ? ex.stok : 0), garansi: str_(d.garansi || 'Garansi resmi 1 tahun'),
    gambar: str_(d.gambar), deskripsi: str_(d.deskripsi), spesifikasi: obj_(d.spesifikasi),
    unggulan: bool_(d.unggulan) ? 1 : 0, status: up_(d.status || 'AKTIF'), terjual: ex ? num_(ex.terjual) : 0,
    rating: num_(d.rating, ex ? ex.rating : 5), urutan: int_(d.urutan, ex ? ex.urutan : 99),
    dibuat: ex ? ex.dibuat : iso_(now_()), diubah: iso_(now_())
  };
  writeRow_('PRODUCT', obj);
  audit_(ex ? 'UBAH_PRODUK' : 'TAMBAH_PRODUK', 'PRODUCT', obj.id, obj.sku + ' · ' + obj.nama);
  cacheBust_();
  return mapProduct_(obj);
}
function nextSku_(kategori, brand) {
  var map = { 'Laptop': 'LAP', 'PC Rakitan': 'PC', 'Komponen': 'KOM', 'Monitor': 'MON', 'Aksesoris': 'AKS', 'Lainnya': 'OTH' };
  var pre = map[str_(kategori)] || 'PRD';
  var n = 1;
  readAll_('PRODUCT').forEach(function (p) { var m = str_(p.sku).match(new RegExp('^' + pre + '-(\\d+)')); if (m) n = Math.max(n, int_(m[1]) + 1); });
  return pre + '-' + String(n).padStart(3, '0');
}
function productDelete_(req, ctx) {
  var p = findById_('PRODUCT', req.id);
  if (!p) throw apiErr_('NOT_FOUND', 'Produk tidak ditemukan');
  deleteRow_('PRODUCT', req.id);
  audit_('HAPUS_PRODUK', 'PRODUCT', req.id, p.sku + ' · ' + p.nama);
  cacheBust_();
  return { ok: true };
}
function productBulkDelete_(req, ctx) {
  var ids = arr_(req.ids);
  var n = 0;
  ids.forEach(function (id) { if (deleteRow_('PRODUCT', id)) n++; });
  audit_('HAPUS_PRODUK_MASSAL', 'PRODUCT', '', n + ' produk dihapus');
  cacheBust_();
  return { terhapus: n };
}
function productToggleStatus_(req, ctx) {
  var p = findById_('PRODUCT', req.id);
  if (!p) throw apiErr_('NOT_FOUND', 'Produk tidak ditemukan');
  var next = up_(p.status) === 'AKTIF' ? 'ARSIP' : 'AKTIF';
  writeRow_('PRODUCT', Object.assign({}, p, { status: next, diubah: iso_(now_()) }));
  audit_('UBAH_STATUS_PRODUK', 'PRODUCT', p.id, p.sku + ' → ' + next);
  cacheBust_();
  return { id: p.id, status: next };
}
function productExport_(req) {
  var rows = readAll_('PRODUCT');
  var head = ['sku', 'nama', 'kategori', 'brand', 'kondisi', 'harga', 'harga_coret', 'harga_beli', 'stok', 'garansi', 'gambar', 'status'];
  var lines = [head.join(',')];
  rows.forEach(function (p) {
    lines.push(head.map(function (h) { return '"' + str_(p[h]).replace(/"/g, '""') + '"'; }).join(','));
  });
  return { csv: lines.join('\n'), filename: 'produk-' + today_() + '.csv' };
}
function productImport_(req, ctx) {
  var rows = arr_(req.rows);
  if (!rows.length) throw apiErr_('BAD_REQUEST', 'Tidak ada baris untuk diimpor');
  var hasil = { dibuat: 0, diperbarui: 0, gagal: 0 };
  rows.forEach(function (r) {
    try {
      var ex = null;
      readAll_('PRODUCT').forEach(function (p) { if (up_(p.sku) === up_(r.sku)) ex = p; });
      if (ex) { productSave_(Object.assign({}, ex, r, { id: ex.id, spesifikasi: ex.spesifikasi }), ctx); hasil.diperbarui++; }
      else { productSave_(r, ctx); hasil.dibuat++; }
    } catch (e) { hasil.gagal++; }
  });
  audit_('IMPOR_PRODUK', 'PRODUCT', '', JSON.stringify(hasil));
  return hasil;
}

/* ==========================================================================
 * 14. KATEGORI
 * ========================================================================== */
function categoryList_(req, ctx) {
  var rows = readAll_('CATEGORY');
  sortBy_(rows, 'urutan', 'asc');
  var prods = readAll_('PRODUCT');
  rows = rows.map(function (c) {
    return {
      id: c.id, nama: c.nama, slug: c.slug, ikon: c.ikon, deskripsi: c.deskripsi, gambar: c.gambar,
      urutan: num_(c.urutan), aktif: bool_(c.aktif),
      jumlah: prods.filter(function (p) { return str_(p.kategori) === str_(c.nama) && up_(p.status) !== 'ARSIP'; }).length
    };
  });
  if (req.q) rows = rows.filter(function (c) { return low_(c.nama).indexOf(low_(req.q)) >= 0; });
  return { items: rows, total: rows.length };
}
function categorySave_(req, ctx) {
  var d = obj_(req.data) && Object.keys(obj_(req.data)).length ? obj_(req.data) : req;
  if (!str_(d.nama)) throw apiErr_('BAD_REQUEST', 'Nama kategori wajib diisi');
  var ex = d.id ? findById_('CATEGORY', d.id) : null;
  var obj = {
    id: ex ? ex.id : nextId_('CATEGORY'), nama: str_(d.nama), slug: slugify_(d.slug || d.nama),
    ikon: str_(d.ikon || 'laptop'), deskripsi: str_(d.deskripsi), gambar: str_(d.gambar),
    urutan: int_(d.urutan, 99), aktif: d.aktif === undefined ? 1 : (bool_(d.aktif) ? 1 : 0),
    dibuat: ex ? ex.dibuat : iso_(now_())
  };
  writeRow_('CATEGORY', obj);
  audit_(ex ? 'UBAH_KATEGORI' : 'TAMBAH_KATEGORI', 'CATEGORY', obj.id, obj.nama);
  cacheBust_();
  return obj;
}
function categoryDelete_(req, ctx) {
  var c = findById_('CATEGORY', req.id);
  if (!c) throw apiErr_('NOT_FOUND', 'Kategori tidak ditemukan');
  var used = readAll_('PRODUCT').filter(function (p) { return str_(p.kategori) === str_(c.nama); }).length;
  if (used > 0 && !bool_(req.paksa)) throw apiErr_('BAD_REQUEST', 'Kategori masih dipakai ' + used + ' produk', 'Pindahkan produk ke kategori lain terlebih dahulu.');
  deleteRow_('CATEGORY', req.id);
  audit_('HAPUS_KATEGORI', 'CATEGORY', req.id, c.nama);
  cacheBust_();
  return { ok: true };
}

/* ==========================================================================
 * 15. PESANAN & POS
 * ========================================================================== */
function orderList_(req, ctx) {
  var rows = readAll_('ORDER');
  var q = low_(req.q);
  if (q) rows = rows.filter(function (o) { return (low_(o.id) + ' ' + low_(o.nama) + ' ' + str_(o.wa)).indexOf(q) >= 0; });
  if (req.status && req.status !== 'SEMUA') rows = rows.filter(function (o) { return up_(o.status) === up_(req.status); });
  if (req.tipe && req.tipe !== 'SEMUA') rows = rows.filter(function (o) { return up_(o.tipe) === up_(req.tipe); });
  sortBy_(rows, 'tanggal', 'desc');
  var all = readAll_('ORDER');
  var pg = page_(rows.map(mapOrder_), req);
  pg.kpi = {
    total: all.length,
    menunggu: all.filter(function (o) { return up_(o.status) === 'MENUNGGU'; }).length,
    lunas: all.filter(function (o) { return up_(o.status) === 'LUNAS'; }).length,
    void: all.filter(function (o) { return up_(o.status) === 'VOID'; }).length,
    omzet: all.filter(function (o) { return up_(o.status) === 'LUNAS'; }).reduce(function (a, o) { return a + num_(o.total); }, 0)
  };
  return pg;
}
function mapOrder_(o) {
  return {
    id: o.id, tanggal: o.tanggal, tipe: o.tipe, nama: o.nama, wa: o.wa, alamat: o.alamat, kota: o.kota,
    items: arr_(o.items), subtotal: num_(o.subtotal), diskon: num_(o.diskon), promo: o.promo,
    ongkir: num_(o.ongkir), total: num_(o.total), metode: o.metode, status: o.status, catatan: o.catatan, sumber: o.sumber
  };
}
function orderGet_(req) {
  var o = findById_('ORDER', req.id);
  if (!o) throw apiErr_('NOT_FOUND', 'Pesanan tidak ditemukan');
  return mapOrder_(o);
}
function orderPay_(req, ctx) {
  var o = findById_('ORDER', req.id);
  if (!o) throw apiErr_('NOT_FOUND', 'Pesanan tidak ditemukan');
  if (up_(o.status) === 'LUNAS') throw apiErr_('BAD_REQUEST', 'Pesanan sudah lunas');
  if (up_(o.status) === 'VOID') throw apiErr_('BAD_REQUEST', 'Pesanan sudah dibatalkan');
  var prods = readAll_('PRODUCT');
  arr_(o.items).forEach(function (it) {
    var p = null;
    prods.forEach(function (x) { if (str_(x.sku) === str_(it.sku)) p = x; });
    if (p) {
      var stok = num_(p.stok) - num_(it.qty, 1);
      writeRow_('PRODUCT', Object.assign({}, p, { stok: stok, terjual: num_(p.terjual) + num_(it.qty, 1), diubah: iso_(now_()) }));
    }
  });
  writeRow_('ORDER', Object.assign({}, o, { status: 'LUNAS', metode: str_(req.metode || o.metode) }));
  if (o.promo) {
    var promo = null;
    readAll_('PROMO').forEach(function (p) { if (up_(p.kode) === up_(o.promo)) promo = p; });
    if (promo) writeRow_('PROMO', Object.assign({}, promo, { terpakai: num_(promo.terpakai) + 1 }));
  }
  var cust = upsertCustomer_({ nama: o.nama, wa: o.wa, kota: o.kota });
  applyLoyalty_(cust, num_(o.total));
  audit_('PELUNASAN', 'ORDER', o.id, rupiah_(o.total) + ' via ' + (req.metode || o.metode));
  cacheBust_();
  return { order: mapOrder_(Object.assign({}, o, { status: 'LUNAS' })), customer: cust };
}
function orderVoid_(req, ctx) {
  var o = findById_('ORDER', req.id);
  if (!o) throw apiErr_('NOT_FOUND', 'Pesanan tidak ditemukan');
  if (!str_(req.alasan)) throw apiErr_('BAD_REQUEST', 'Alasan pembatalan wajib diisi');
  if (up_(o.status) === 'VOID') throw apiErr_('BAD_REQUEST', 'Pesanan sudah dibatalkan');
  if (up_(o.status) === 'LUNAS') {
    var prods = readAll_('PRODUCT');
    arr_(o.items).forEach(function (it) {
      var p = null;
      prods.forEach(function (x) { if (str_(x.sku) === str_(it.sku)) p = x; });
      if (p) writeRow_('PRODUCT', Object.assign({}, p, { stok: num_(p.stok) + num_(it.qty, 1), terjual: Math.max(0, num_(p.terjual) - num_(it.qty, 1)), diubah: iso_(now_()) }));
    });
    var cust = upsertCustomer_({ nama: o.nama, wa: o.wa });
    if (cust) {
      writeRow_('CUSTOMER', Object.assign({}, cust, {
        total_belanja: Math.max(0, num_(cust.total_belanja) - num_(o.total)),
        trx: Math.max(0, num_(cust.trx) - 1),
        poin: Math.max(0, num_(cust.poin) - num_(o.poin_dapat))
      }));
    }
  }
  writeRow_('ORDER', Object.assign({}, o, { status: 'VOID', catatan: str_(o.catatan) + ' | VOID: ' + str_(req.alasan) }));
  audit_('VOID_PESANAN', 'ORDER', o.id, str_(req.alasan));
  cacheBust_();
  return { ok: true, id: o.id };
}
function orderDelete_(req, ctx) {
  var o = findById_('ORDER', req.id);
  if (!o) throw apiErr_('NOT_FOUND', 'Pesanan tidak ditemukan');
  deleteRow_('ORDER', req.id);
  audit_('HAPUS_PESANAN', 'ORDER', req.id, o.nama + ' · ' + rupiah_(o.total));
  cacheBust_();
  return { ok: true };
}
function posLookup_(req, ctx) {
  var rows = readAll_('PRODUCT').filter(function (p) { return up_(p.status) === 'AKTIF'; });
  var q = low_(req.q);
  if (q) rows = rows.filter(function (p) { return (low_(p.nama) + ' ' + low_(p.sku) + ' ' + low_(p.brand)).indexOf(q) >= 0; });
  if (req.kategori && req.kategori !== 'Semua') rows = rows.filter(function (p) { return p.kategori === req.kategori; });
  var items = rows.map(function (p) {
    return { sku: p.sku, nama: p.nama, harga: num_(p.harga), stok: num_(p.stok), kategori: p.kategori, gambar: p.gambar, brand: p.brand };
  }).sort(function (a, b) { return (b.stok > 0) - (a.stok > 0) || a.nama.localeCompare(b.nama); });
  var cats = {};
  rows.forEach(function (p) { cats[p.kategori] = 1; });
  return { items: items.slice(0, 120), kategori: ['Semua'].concat(Object.keys(cats)) };
}
function posCheckout_(req, ctx) {
  var items = arr_(req.items);
  if (!items.length) throw apiErr_('BAD_REQUEST', 'Keranjang masih kosong');
  var prods = readAll_('PRODUCT');
  var lines = [], subtotal = 0;
  items.forEach(function (it) {
    var p = null;
    prods.forEach(function (x) { if (str_(x.sku) === up_(it.sku)) p = x; });
    if (!p) throw apiErr_('NOT_FOUND', 'Produk ' + it.sku + ' tidak ditemukan');
    var qty = clamp_(int_(it.qty, 1), 1, 999);
    if (num_(p.stok) < qty) throw apiErr_('OUT_OF_STOCK', 'Stok ' + p.nama + ' tidak cukup (sisa ' + p.stok + ')');
    var harga = it.harga_override ? num_(it.harga_override) : num_(p.harga);
    lines.push({ sku: p.sku, nama: p.nama, qty: qty, harga: harga, gambar: p.gambar });
    subtotal += harga * qty;
  });
  var diskon = 0, promoKode = '';
  if (req.promo && featureOn_('admin.promo', ctx.user.role)) {
    try { var pr = publicPromoCheck_({ kode: req.promo, subtotal: subtotal }); diskon = pr.diskon; promoKode = pr.kode; } catch (e) { throw e; }
  }
  diskon += num_(req.diskon_manual);
  diskon = clamp_(diskon, 0, subtotal);
  var total = Math.max(0, subtotal - diskon);
  var bayar = num_(req.bayar, total);
  var id = nextId_('ORDER');
  var order = {
    id: id, tanggal: iso_(now_()), tipe: 'POS', nama: str_(req.nama || 'Pelanggan Umum'), wa: waNorm_(req.wa),
    alamat: '', kota: '', items: lines, subtotal: subtotal, diskon: diskon, promo: promoKode, ongkir: 0,
    total: total, metode: up_(req.metode || 'TUNAI'), status: 'LUNAS', sumber: 'KASIR ' + ctx.user.nama,
    catatan: str_(req.catatan), dibuat: iso_(now_())
  };
  writeRow_('ORDER', order);
  lines.forEach(function (l) {
    var p = null;
    prods.forEach(function (x) { if (str_(x.sku) === l.sku) p = x; });
    if (p) writeRow_('PRODUCT', Object.assign({}, p, { stok: num_(p.stok) - l.qty, terjual: num_(p.terjual) + l.qty, diubah: iso_(now_()) }));
  });
  if (promoKode) {
    var promo = null;
    readAll_('PROMO').forEach(function (p) { if (up_(p.kode) === promoKode) promo = p; });
    if (promo) writeRow_('PROMO', Object.assign({}, promo, { terpakai: num_(promo.terpakai) + 1 }));
  }
  var cust = null;
  if (order.wa) { cust = upsertCustomer_({ nama: order.nama, wa: order.wa }); applyLoyalty_(cust, total); }
  audit_('TRANSAKSI_POS', 'ORDER', id, rupiah_(total) + ' · ' + order.metode);
  cacheBust_();
  return {
    order: mapOrder_(order), kembali: Math.max(0, bayar - total),
    struk: struk_(order, bayar), wa_link: 'https://wa.me/' + setting_('toko_wa') + '?text=' + encodeURIComponent(struk_(order, bayar)),
    poin_dapat: cust ? num_(cust.poin) : 0
  };
}
function struk_(order, bayar) {
  var W = 40;
  function line(ch) { return new Array(W + 1).join(ch || '='); }
  function center(t) { t = str_(t); var pad = Math.max(0, Math.floor((W - t.length) / 2)); return new Array(pad + 1).join(' ') + t; }
  function row(l, r) { l = str_(l); r = str_(r); var space = Math.max(1, W - l.length - r.length); return l + new Array(space + 1).join(' ') + r; }
  var out = [];
  out.push(center(setting_('toko_nama')));
  out.push(center(str_(setting_('toko_alamat')).slice(0, 44)));
  out.push(center(setting_('toko_kota') + ' · ' + setting_('toko_wa')));
  out.push(line('-'));
  out.push(row('No: ' + order.id, Utilities.formatDate(new Date(order.tanggal), APP.TZ, 'dd/MM/yy HH:mm')));
  out.push(row('Kasir: ' + (order.sumber || '-'), order.tipe));
  out.push(row('Pelanggan: ' + order.nama, ''));
  out.push(line('-'));
  arr_(order.items).forEach(function (it) {
    out.push(str_(it.nama).slice(0, W));
    out.push(row('  ' + it.qty + ' x ' + rupiah_(it.harga), rupiah_(num_(it.harga) * num_(it.qty))));
  });
  out.push(line('-'));
  out.push(row('Subtotal', rupiah_(order.subtotal)));
  if (num_(order.diskon) > 0) out.push(row('Diskon' + (order.promo ? ' (' + order.promo + ')' : ''), '-' + rupiah_(order.diskon)));
  out.push(row('TOTAL', rupiah_(order.total)));
  out.push(row('Bayar (' + order.metode + ')', rupiah_(bayar)));
  out.push(row('Kembali', rupiah_(Math.max(0, bayar - num_(order.total)))));
  out.push(line('-'));
  out.push(center('Terima kasih telah berbelanja'));
  out.push(center('Garansi & layanan: ' + setting_('toko_wa')));
  return out.join('\n');
}
function posStockCheck_(req, ctx) {
  var items = arr_(req.items);
  var prods = readAll_('PRODUCT');
  var out = [];
  items.forEach(function (it) {
    var p = null;
    prods.forEach(function (x) { if (str_(x.sku) === str_(it.sku)) p = x; });
    out.push({ sku: it.sku, tersedia: p ? num_(p.stok) : 0, cukup: p ? num_(p.stok) >= num_(it.qty) : false, nama: p ? p.nama : it.sku });
  });
  return { items: out };
}
/* ==========================================================================
 * 16. PELANGGAN & LOYALITAS
 * ========================================================================== */
function tierFor_(total) {
  var t = TIER[0];
  for (var i = 0; i < TIER.length; i++) if (num_(total) >= TIER[i].min) t = TIER[i];
  return t;
}
function upsertCustomer_(data) {
  var wa = waNorm_(data.wa);
  if (!wa) return null;
  var rows = readAll_('CUSTOMER');
  var ex = null;
  rows.forEach(function (c) { if (str_(c.wa) === wa) ex = c; });
  if (ex) {
    var upd = Object.assign({}, ex);
    if (!upd.nama && data.nama) upd.nama = data.nama;
    if (data.kota && !upd.kota) upd.kota = data.kota;
    if (data.alamat && !upd.alamat) upd.alamat = data.alamat;
    if (data.catatan) upd.catatan = data.catatan;
    writeRow_('CUSTOMER', upd);
    return upd;
  }
  var obj = {
    id: nextId_('CUSTOMER'), nama: str_(data.nama) || 'Pelanggan', wa: wa, email: str_(data.email),
    kota: str_(data.kota), alamat: str_(data.alamat), total_belanja: 0, trx: 0, poin: 0,
    tier: 'BRONZE', catatan: str_(data.catatan), dibuat: iso_(now_())
  };
  writeRow_('CUSTOMER', obj);
  return obj;
}
function applyLoyalty_(cust, total) {
  if (!cust) return cust;
  var totalBaru = num_(cust.total_belanja) + num_(total);
  var tier = tierFor_(totalBaru);
  var poin = Math.floor(num_(total) / 1000) * settingNum_('poin_per_1000', 1) * num_(tier.multiplier, 1);
  var upd = Object.assign({}, cust, {
    total_belanja: totalBaru, trx: num_(cust.trx) + 1,
    poin: num_(cust.poin) + Math.floor(poin), tier: tier.nama
  });
  writeRow_('CUSTOMER', upd);
  return upd;
}
function customerList_(req, ctx) {
  var rows = readAll_('CUSTOMER');
  var q = low_(req.q);
  if (q) rows = rows.filter(function (c) { return (low_(c.nama) + ' ' + str_(c.wa) + ' ' + low_(c.kota) + ' ' + low_(c.email)).indexOf(q) >= 0; });
  if (req.tier) rows = rows.filter(function (c) { return up_(c.tier) === up_(req.tier); });
  var sort = str_(req.sort || 'belanja');
  if (sort === 'nama') sortBy_(rows, 'nama', 'asc');
  else if (sort === 'poin') sortBy_(rows, 'poin', 'desc');
  else if (sort === 'baru') sortBy_(rows, 'dibuat', 'desc');
  else sortBy_(rows, 'total_belanja', 'desc');
  var pg = page_(rows.map(function (c) {
    return {
      id: c.id, nama: c.nama, wa: c.wa, email: c.email, kota: c.kota, alamat: c.alamat,
      total_belanja: num_(c.total_belanja), trx: num_(c.trx), poin: num_(c.poin), tier: c.tier,
      catatan: c.catatan, dibuat: c.dibuat,
      next_tier: (function () {
        for (var i = 0; i < TIER.length; i++) if (num_(c.total_belanja) < TIER[i].min) return { nama: TIER[i].nama, butuh: TIER[i].min - num_(c.total_belanja), progress: Math.round(num_(c.total_belanja) / TIER[i].min * 100) };
        return null;
      })()
    };
  }), req);
  var all = readAll_('CUSTOMER');
  pg.kpi = {
    total: all.length,
    vip: all.filter(function (c) { return ['GOLD', 'PLATINUM'].indexOf(up_(c.tier)) >= 0; }).length,
    nilai: all.reduce(function (a, c) { return a + num_(c.total_belanja); }, 0),
    poin: all.reduce(function (a, c) { return a + num_(c.poin); }, 0)
  };
  return pg;
}
function customerSave_(req, ctx) {
  var d = obj_(req.data) && Object.keys(obj_(req.data)).length ? obj_(req.data) : req;
  if (!str_(d.nama)) throw apiErr_('BAD_REQUEST', 'Nama pelanggan wajib diisi');
  if (!waNorm_(d.wa)) throw apiErr_('BAD_REQUEST', 'Nomor WhatsApp wajib diisi');
  var ex = d.id ? findById_('CUSTOMER', d.id) : null;
  if (!ex) readAll_('CUSTOMER').forEach(function (c) { if (str_(c.wa) === waNorm_(d.wa)) ex = c; });
  var obj = {
    id: ex ? ex.id : nextId_('CUSTOMER'), nama: str_(d.nama), wa: waNorm_(d.wa), email: str_(d.email),
    kota: str_(d.kota), alamat: str_(d.alamat),
    total_belanja: ex ? num_(ex.total_belanja) : 0, trx: ex ? num_(ex.trx) : 0,
    poin: int_(d.poin, ex ? ex.poin : 0), tier: ex ? ex.tier : 'BRONZE',
    catatan: str_(d.catatan), dibuat: ex ? ex.dibuat : iso_(now_())
  };
  obj.tier = tierFor_(obj.total_belanja).nama;
  writeRow_('CUSTOMER', obj);
  audit_(ex ? 'UBAH_PELANGGAN' : 'TAMBAH_PELANGGAN', 'CUSTOMER', obj.id, obj.nama);
  return obj;
}
function customerDelete_(req, ctx) {
  var c = findById_('CUSTOMER', req.id);
  if (!c) throw apiErr_('NOT_FOUND', 'Pelanggan tidak ditemukan');
  deleteRow_('CUSTOMER', req.id);
  audit_('HAPUS_PELANGGAN', 'CUSTOMER', req.id, c.nama);
  return { ok: true };
}
function customerPoints_(req, ctx) {
  var c = findById_('CUSTOMER', req.id);
  if (!c) throw apiErr_('NOT_FOUND', 'Pelanggan tidak ditemukan');
  if (!str_(req.alasan)) throw apiErr_('BAD_REQUEST', 'Alasan penyesuaian poin wajib diisi');
  var poin = Math.max(0, num_(c.poin) + num_(req.delta));
  writeRow_('CUSTOMER', Object.assign({}, c, { poin: poin }));
  audit_('PENYESUAIAN_POIN', 'CUSTOMER', c.id, str_(req.alasan) + ' (' + (num_(req.delta) > 0 ? '+' : '') + num_(req.delta) + ')');
  return { id: c.id, poin: poin };
}
function customerGet_(req, ctx) {
  var c = findById_('CUSTOMER', req.id);
  if (!c) throw apiErr_('NOT_FOUND', 'Pelanggan tidak ditemukan');
  return {
    customer: c,
    orders: readAll_('ORDER').filter(function (o) { return str_(o.wa) === str_(c.wa); }).slice(-20).reverse().map(mapOrder_),
    services: readAll_('SERVICE').filter(function (s) { return str_(s.wa) === str_(c.wa); }).slice(-10),
    tradeins: readAll_('TRADEIN').filter(function (t) { return str_(t.wa) === str_(c.wa); }).slice(-10)
  };
}

/* ==========================================================================
 * 17. SERVICE
 * ========================================================================== */
function serviceList_(req, ctx) {
  var rows = readAll_('SERVICE');
  var q = low_(req.q);
  if (q) rows = rows.filter(function (s) { return (low_(s.id) + ' ' + low_(s.nama) + ' ' + low_(s.perangkat) + ' ' + str_(s.wa)).indexOf(q) >= 0; });
  if (req.status && req.status !== 'SEMUA') rows = rows.filter(function (s) { return up_(s.status) === up_(req.status); });
  sortBy_(rows, 'tanggal', 'desc');
  var kpi = {};
  SERVICE_STATUS.forEach(function (s) { kpi[s] = rows.filter(function (x) { return up_(x.status) === s; }).length; });
  return {
    items: rows.map(function (s) {
      return {
        id: s.id, tanggal: s.tanggal, nama: s.nama, wa: s.wa, perangkat: s.perangkat, kategori: s.kategori,
        keluhan: s.keluhan, teknisi: s.teknisi, status: s.status, estimasi: num_(s.estimasi), biaya: num_(s.biaya), catatan: s.catatan
      };
    }),
    kolom: SERVICE_STATUS, kpi: kpi, total: rows.length
  };
}
function serviceSave_(req, ctx) {
  var d = obj_(req.data) && Object.keys(obj_(req.data)).length ? obj_(req.data) : req;
  if (!str_(d.nama)) throw apiErr_('BAD_REQUEST', 'Nama pelanggan wajib diisi');
  if (!str_(d.perangkat)) throw apiErr_('BAD_REQUEST', 'Perangkat wajib diisi');
  var ex = d.id ? findById_('SERVICE', d.id) : null;
  var obj = {
    id: ex ? ex.id : nextId_('SERVICE'), tanggal: ex ? ex.tanggal : iso_(now_()),
    nama: str_(d.nama), wa: waNorm_(d.wa), perangkat: str_(d.perangkat), kategori: str_(d.kategori || 'Laptop'),
    keluhan: str_(d.keluhan), teknisi: str_(d.teknisi), status: up_(d.status || (ex ? ex.status : 'MASUK')),
    estimasi: num_(d.estimasi, ex ? ex.estimasi : 0), biaya: num_(d.biaya, ex ? ex.biaya : 0),
    catatan: str_(d.catatan), dibuat: ex ? ex.dibuat : iso_(now_())
  };
  writeRow_('SERVICE', obj);
  audit_(ex ? 'UBAH_SERVICE' : 'TAMBAH_SERVICE', 'SERVICE', obj.id, obj.perangkat);
  upsertCustomer_({ nama: obj.nama, wa: obj.wa });
  return obj;
}
function serviceStatus_(req, ctx) {
  var s = findById_('SERVICE', req.id);
  if (!s) throw apiErr_('NOT_FOUND', 'Tiket tidak ditemukan');
  var status = up_(req.status);
  if (SERVICE_STATUS.indexOf(status) < 0) throw apiErr_('BAD_REQUEST', 'Status tidak valid');
  writeRow_('SERVICE', Object.assign({}, s, { status: status }));
  audit_('UBAH_STATUS_SERVICE', 'SERVICE', s.id, s.status + ' → ' + status);
  return { id: s.id, status: status };
}
function serviceDelete_(req, ctx) {
  var s = findById_('SERVICE', req.id);
  if (!s) throw apiErr_('NOT_FOUND', 'Tiket tidak ditemukan');
  deleteRow_('SERVICE', req.id);
  audit_('HAPUS_SERVICE', 'SERVICE', req.id, s.perangkat);
  return { ok: true };
}

/* ==========================================================================
 * 18. TUKAR TAMBAH
 * ========================================================================== */
function tradeinList_(req, ctx) {
  var rows = readAll_('TRADEIN');
  var q = low_(req.q);
  if (q) rows = rows.filter(function (t) { return (low_(t.id) + ' ' + low_(t.nama) + ' ' + low_(t.perangkat) + ' ' + str_(t.wa)).indexOf(q) >= 0; });
  if (req.status && req.status !== 'SEMUA') rows = rows.filter(function (t) { return up_(t.status) === up_(req.status); });
  sortBy_(rows, 'tanggal', 'desc');
  var all = readAll_('TRADEIN');
  return {
    items: rows.map(function (t) {
      return {
        id: t.id, tanggal: t.tanggal, nama: t.nama, wa: t.wa, perangkat: t.perangkat, kategori: t.kategori,
        brand: t.brand, tahun: num_(t.tahun), kondisi: t.kondisi, harga_awal: num_(t.harga_awal),
        estimasi_lo: num_(t.estimasi_lo), estimasi_hi: num_(t.estimasi_hi), penawaran: num_(t.penawaran),
        status: t.status, catatan: t.catatan
      };
    }),
    kpi: {
      total: all.length,
      baru: all.filter(function (t) { return up_(t.status) === 'BARU'; }).length,
      disetujui: all.filter(function (t) { return up_(t.status) === 'DISETUJUI'; }).length,
      ditolak: all.filter(function (t) { return up_(t.status) === 'DITOLAK'; }).length,
      nilai: all.filter(function (t) { return up_(t.status) === 'DISETUJUI'; }).reduce(function (a, t) { return a + num_(t.penawaran); }, 0)
    }
  };
}
function tradeinReview_(req, ctx) {
  var t = findById_('TRADEIN', req.id);
  if (!t) throw apiErr_('NOT_FOUND', 'Pengajuan tidak ditemukan');
  if (req.harga_awal !== undefined || req.tahun !== undefined || req.kondisi !== undefined || req.brand !== undefined) {
    var est = tradeinEstimate_({ tahun: req.tahun || t.tahun, kondisi: req.kondisi || t.kondisi, brand: req.brand || t.brand, kategori: t.kategori, harga_awal: req.harga_awal || t.harga_awal });
    writeRow_('TRADEIN', Object.assign({}, t, { estimasi_lo: est.estimasi_lo, estimasi_hi: est.estimasi_hi }));
    return { tradein: findById_('TRADEIN', t.id), estimate: est };
  }
  return { tradein: t, estimate: tradeinEstimate_(t) };
}
function tradeinApprove_(req, ctx) {
  var t = findById_('TRADEIN', req.id);
  if (!t) throw apiErr_('NOT_FOUND', 'Pengajuan tidak ditemukan');
  var penawaran = num_(req.penawaran);
  if (!penawaran) throw apiErr_('BAD_REQUEST', 'Nilai penawaran wajib diisi');
  writeRow_('TRADEIN', Object.assign({}, t, { status: 'DISETUJUI', penawaran: penawaran }));
  /* buat produk bekas otomatis */
  var margin = settingNum_('tradein_margin_pct', 18);
  var hargaJual = Math.round(penawaran * (1 + margin / 100) / 1000) * 1000;
  var sku = up_(req.sku) || ('TI-' + str_(t.id).slice(-4));
  var produk = {
    id: nextId_('PRODUCT'), sku: sku, nama: str_(req.nama) || (t.perangkat + ' (Bekas)'),
    kategori: str_(t.kategori || 'Laptop'), brand: str_(t.brand || ''), tipe: 'UNIT', kondisi: 'BEKAS',
    harga: hargaJual, harga_coret: 0, harga_beli: penawaran, stok: 1,
    garansi: 'Garansi toko 1 bulan', gambar: str_(req.gambar), deskripsi: 'Unit bekas program tukar tambah. Sudah melewati pemeriksaan fungsi dan pembersihan.',
    spesifikasi: { Kondisi: 'Bekas', Tahun: str_(t.tahun), Asal: 'Tukar tambah ' + t.id },
    unggulan: 0, status: 'AKTIF', terjual: 0, rating: 5, urutan: 99, dibuat: iso_(now_()), diubah: iso_(now_())
  };
  writeRow_('PRODUCT', produk);
  audit_('SETUJUI_TRADEIN', 'TRADEIN', t.id, t.perangkat + ' · ' + rupiah_(penawaran));
  cacheBust_();
  return { ok: true, penawaran: penawaran, produk: mapProduct_(produk), sku: sku };
}
function tradeinReject_(req, ctx) {
  var t = findById_('TRADEIN', req.id);
  if (!t) throw apiErr_('NOT_FOUND', 'Pengajuan tidak ditemukan');
  if (!str_(req.alasan)) throw apiErr_('BAD_REQUEST', 'Alasan penolakan wajib diisi');
  writeRow_('TRADEIN', Object.assign({}, t, { status: 'DITOLAK', catatan: 'DITOLAK: ' + str_(req.alasan) }));
  audit_('TOLAK_TRADEIN', 'TRADEIN', t.id, str_(req.alasan));
  return { ok: true };
}
function tradeinDelete_(req, ctx) {
  var t = findById_('TRADEIN', req.id);
  if (!t) throw apiErr_('NOT_FOUND', 'Pengajuan tidak ditemukan');
  deleteRow_('TRADEIN', req.id);
  audit_('HAPUS_TRADEIN', 'TRADEIN', req.id, t.perangkat);
  return { ok: true };
}

/* ==========================================================================
 * 19. PROMO
 * ========================================================================== */
function promoList_(req, ctx) {
  var rows = readAll_('PROMO');
  if (req.q) rows = rows.filter(function (p) { return (low_(p.kode) + ' ' + low_(p.judul)).indexOf(low_(req.q)) >= 0; });
  sortBy_(rows, 'dibuat', 'desc');
  var today = today_();
  return {
    items: rows.map(function (p) {
      return {
        id: p.id, kode: p.kode, judul: p.judul, tipe: p.tipe, nilai: num_(p.nilai),
        min_belanja: num_(p.min_belanja), maks_diskon: num_(p.maks_diskon), mulai: p.mulai, akhir: p.akhir,
        kuota: num_(p.kuota), terpakai: num_(p.terpakai), aktif: bool_(p.aktif),
        berlaku: bool_(p.aktif) && (!p.mulai || today >= str_(p.mulai).slice(0, 10)) && (!p.akhir || today <= str_(p.akhir).slice(0, 10))
      };
    }),
    kpi: { total: rows.length, aktif: rows.filter(function (p) { return bool_(p.aktif); }).length, pemakaian: rows.reduce(function (a, p) { return a + num_(p.terpakai); }, 0) }
  };
}
function promoSave_(req, ctx) {
  var d = obj_(req.data) && Object.keys(obj_(req.data)).length ? obj_(req.data) : req;
  var kode = up_(d.kode);
  if (kode.length < 3) throw apiErr_('BAD_REQUEST', 'Kode promo minimal 3 karakter');
  var ex = d.id ? findById_('PROMO', d.id) : null;
  var dup = null;
  readAll_('PROMO').forEach(function (p) { if (up_(p.kode) === kode && (!ex || p.id !== ex.id)) dup = p; });
  if (dup) throw apiErr_('DUPLICATE', 'Kode promo sudah dipakai');
  var obj = {
    id: ex ? ex.id : nextId_('PROMO'), kode: kode, judul: str_(d.judul || kode), tipe: up_(d.tipe || 'PERSEN'),
    nilai: num_(d.nilai), min_belanja: num_(d.min_belanja), maks_diskon: num_(d.maks_diskon),
    mulai: str_(d.mulai), akhir: str_(d.akhir), kuota: int_(d.kuota), terpakai: ex ? num_(ex.terpakai) : 0,
    aktif: d.aktif === undefined ? 1 : (bool_(d.aktif) ? 1 : 0), dibuat: ex ? ex.dibuat : iso_(now_())
  };
  writeRow_('PROMO', obj);
  audit_(ex ? 'UBAH_PROMO' : 'TAMBAH_PROMO', 'PROMO', obj.id, obj.kode);
  cacheBust_();
  return obj;
}
function promoDelete_(req, ctx) {
  var p = findById_('PROMO', req.id);
  if (!p) throw apiErr_('NOT_FOUND', 'Promo tidak ditemukan');
  deleteRow_('PROMO', req.id);
  audit_('HAPUS_PROMO', 'PROMO', req.id, p.kode);
  cacheBust_();
  return { ok: true };
}
function promoToggle_(req, ctx) {
  var p = findById_('PROMO', req.id);
  if (!p) throw apiErr_('NOT_FOUND', 'Promo tidak ditemukan');
  var next = bool_(p.aktif) ? 0 : 1;
  writeRow_('PROMO', Object.assign({}, p, { aktif: next }));
  audit_('TOGGLE_PROMO', 'PROMO', p.id, p.kode + ' → ' + (next ? 'AKTIF' : 'NONAKTIF'));
  cacheBust_();
  return { id: p.id, aktif: !!next };
}

/* ==========================================================================
 * 20. BANNER & TESTIMONI
 * ========================================================================== */
function contentGet_(req, ctx) {
  var banners = readAll_('BANNER');
  var testis = readAll_('TESTI');
  sortBy_(banners, 'urutan', 'asc');
  sortBy_(testis, 'urutan', 'asc');
  return {
    banners: banners.map(function (b) { return { id: b.id, judul: b.judul, subjudul: b.subjudul, gambar: b.gambar, link: b.link, urutan: num_(b.urutan), aktif: bool_(b.aktif) }; }),
    testimonials: testis.map(function (t) { return { id: t.id, nama: t.nama, kota: t.kota, rating: num_(t.rating, 5), pesan: t.pesan, avatar: t.avatar, produk: t.produk, urutan: num_(t.urutan), aktif: bool_(t.aktif) }; }),
    faq: (function () { try { return JSON.parse(setting_('faq', DEFAULT_SETTINGS.faq)); } catch (e) { return []; } })()
  };
}
function bannerSave_(req, ctx) {
  var d = obj_(req.data) && Object.keys(obj_(req.data)).length ? obj_(req.data) : req;
  if (!str_(d.judul)) throw apiErr_('BAD_REQUEST', 'Judul banner wajib diisi');
  var ex = d.id ? findById_('BANNER', d.id) : null;
  var obj = {
    id: ex ? ex.id : nextId_('BANNER'), judul: str_(d.judul), subjudul: str_(d.subjudul), gambar: str_(d.gambar),
    link: str_(d.link), urutan: int_(d.urutan, 99), aktif: d.aktif === undefined ? 1 : (bool_(d.aktif) ? 1 : 0),
    dibuat: ex ? ex.dibuat : iso_(now_())
  };
  writeRow_('BANNER', obj);
  audit_(ex ? 'UBAH_BANNER' : 'TAMBAH_BANNER', 'BANNER', obj.id, obj.judul);
  cacheBust_();
  return obj;
}
function bannerDelete_(req, ctx) {
  var b = findById_('BANNER', req.id);
  if (!b) throw apiErr_('NOT_FOUND', 'Banner tidak ditemukan');
  deleteRow_('BANNER', req.id);
  audit_('HAPUS_BANNER', 'BANNER', req.id, b.judul);
  cacheBust_();
  return { ok: true };
}
function testiSave_(req, ctx) {
  var d = obj_(req.data) && Object.keys(obj_(req.data)).length ? obj_(req.data) : req;
  if (!str_(d.nama)) throw apiErr_('BAD_REQUEST', 'Nama pemberi testimoni wajib diisi');
  if (!str_(d.pesan)) throw apiErr_('BAD_REQUEST', 'Isi testimoni wajib diisi');
  var ex = d.id ? findById_('TESTI', d.id) : null;
  var obj = {
    id: ex ? ex.id : nextId_('TESTI'), nama: str_(d.nama), kota: str_(d.kota), rating: clamp_(num_(d.rating, 5), 1, 5),
    pesan: str_(d.pesan), avatar: str_(d.avatar), produk: str_(d.produk), urutan: int_(d.urutan, 99),
    aktif: d.aktif === undefined ? 1 : (bool_(d.aktif) ? 1 : 0), dibuat: ex ? ex.dibuat : iso_(now_())
  };
  writeRow_('TESTI', obj);
  audit_(ex ? 'UBAH_TESTI' : 'TAMBAH_TESTI', 'TESTI', obj.id, obj.nama);
  cacheBust_();
  return obj;
}
function testiDelete_(req, ctx) {
  var t = findById_('TESTI', req.id);
  if (!t) throw apiErr_('NOT_FOUND', 'Testimoni tidak ditemukan');
  deleteRow_('TESTI', req.id);
  audit_('HAPUS_TESTI', 'TESTI', req.id, t.nama);
  cacheBust_();
  return { ok: true };
}

/* ==========================================================================
 * 21. STAF
 * ========================================================================== */
function staffList_(req, ctx) {
  var rows = readAll_('STAFF').map(function (s) {
    return { id: s.id, nama: s.nama, wa: s.wa, role: s.role, aktif: bool_(s.aktif), dibuat: s.dibuat, last_login: s.last_login };
  });
  if (req.q) rows = rows.filter(function (s) { return low_(s.nama).indexOf(low_(req.q)) >= 0; });
  return { items: rows, roles: ROLES, role_desc: ROLE_DESC, total: rows.length };
}
function staffSave_(req, ctx) {
  var d = obj_(req.data) && Object.keys(obj_(req.data)).length ? obj_(req.data) : req;
  if (!str_(d.nama)) throw apiErr_('BAD_REQUEST', 'Nama staf wajib diisi');
  var role = up_(d.role || 'KASIR');
  if (ROLES.indexOf(role) < 0) throw apiErr_('BAD_REQUEST', 'Role tidak valid');
  var ex = d.id ? findById_('STAFF', d.id) : null;
  var pin = str_(d.pin);
  var salt = ex ? ex.pin_salt : uuid_().slice(0, 12);
  var hash = ex ? ex.pin_hash : '';
  if (pin) {
    if (pin.length < 4) throw apiErr_('BAD_REQUEST', 'PIN minimal 4 digit');
    salt = uuid_().slice(0, 12);
    hash = hashPin_(pin, salt);
  } else if (!ex) {
    pin = randPin_(4);
    salt = uuid_().slice(0, 12);
    hash = hashPin_(pin, salt);
  }
  var obj = {
    id: ex ? ex.id : nextId_('STAFF'), nama: str_(d.nama), wa: waNorm_(d.wa), role: role,
    pin_hash: hash, pin_salt: salt, aktif: d.aktif === undefined ? 1 : (bool_(d.aktif) ? 1 : 0),
    dibuat: ex ? ex.dibuat : iso_(now_()), last_login: ex ? ex.last_login : ''
  };
  writeRow_('STAFF', obj);
  audit_(ex ? 'UBAH_STAF' : 'TAMBAH_STAF', 'STAFF', obj.id, obj.nama + ' · ' + role);
  return { id: obj.id, nama: obj.nama, role: obj.role, aktif: bool_(obj.aktif), pin: pin || undefined };
}
function staffDelete_(req, ctx) {
  var s = findById_('STAFF', req.id);
  if (!s) throw apiErr_('NOT_FOUND', 'Staf tidak ditemukan');
  if (str_(s.id) === str_(ctx.user.id)) throw apiErr_('BAD_REQUEST', 'Tidak dapat menghapus akun sendiri');
  deleteRow_('STAFF', req.id);
  audit_('HAPUS_STAF', 'STAFF', req.id, s.nama);
  return { ok: true };
}
function staffResetPin_(req, ctx) {
  var s = findById_('STAFF', req.id);
  if (!s) throw apiErr_('NOT_FOUND', 'Staf tidak ditemukan');
  var pin = str_(req.pin) || randPin_(4);
  if (pin.length < 4) throw apiErr_('BAD_REQUEST', 'PIN minimal 4 digit');
  var salt = uuid_().slice(0, 12);
  writeRow_('STAFF', Object.assign({}, s, { pin_salt: salt, pin_hash: hashPin_(pin, salt) }));
  audit_('RESET_PIN', 'STAFF', s.id, s.nama);
  return { id: s.id, pin: pin };
}

/* ==========================================================================
 * 22. PENGATURAN, AUDIT
 * ========================================================================== */
function settingsGet_(req, ctx) {
  var s = settingsAll_(true);
  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = s[k]; });
  if (ctx && ctx.user && ctx.user.role === 'OWNER') out.__all = true;
  return { settings: out, defaults: DEFAULT_SETTINGS };
}
function settingsSave_(req, ctx) {
  var data = obj_(req.data);
  if (!Object.keys(data).length) throw apiErr_('BAD_REQUEST', 'Tidak ada perubahan');
  var allowed = {};
  Object.keys(data).forEach(function (k) {
    if (DEFAULT_SETTINGS[k] !== undefined || str_(k).indexOf('toko_') === 0) allowed[k] = data[k];
  });
  saveSettings_(allowed);
  audit_('UBAH_PENGATURAN', 'SETTING', '', Object.keys(allowed).join(', '));
  return { settings: publicSettings_(), saved: Object.keys(allowed) };
}
function auditList_(req, ctx) {
  var rows = readAll_('AUDIT');
  var q = low_(req.q);
  if (q) rows = rows.filter(function (a) { return (low_(a.aksi) + ' ' + low_(a.user) + ' ' + low_(a.detail) + ' ' + low_(a.entitas)).indexOf(q) >= 0; });
  if (req.aksi && req.aksi !== 'SEMUA') rows = rows.filter(function (a) { return up_(a.aksi) === up_(req.aksi); });
  sortBy_(rows, 'tanggal', 'desc');
  var all = readAll_('AUDIT');
  var aksiSet = {};
  all.forEach(function (a) { aksiSet[up_(a.aksi)] = 1; });
  var pg = page_(rows, req);
  pg.aksi = Object.keys(aksiSet).sort();
  pg.kpi = { total: all.length, hari_ini: all.filter(function (a) { return str_(a.tanggal).slice(0, 10) === today_(); }).length };
  return pg;
}
/* ==========================================================================
 * 23. SISTEM
 * ========================================================================== */
function systemInfo_(req, ctx) {
  var counts = {};
  Object.keys(SCHEMA).forEach(function (n) {
    try { counts[n] = Math.max(0, sheet_(n).getLastRow() - 1); } catch (e) { counts[n] = 0; }
  });
  var folder = null;
  try { folder = driveFolder_(); } catch (e) { }
  return {
    app: APP, counts: counts,
    user: ctx.user,
    spreadsheet: (function () { try { var s = ss_(); return { nama: s.getName(), id: s.getId(), url: s.getUrl() }; } catch (e) { return null; } })(),
    drive: folder ? { nama: folder.getName(), id: folder.getId(), url: folder.getUrl() } : null,
    fitur: { total: Object.keys(featureDefs_()).length, aktif: Object.keys(featureMapFor_(ctx.user.role)).filter(function (k) { return featureMapFor_(ctx.user.role)[k]; }).length },
    routes: Object.keys(ROUTES).length,
    sheet_link: (function () { try { return ss_().getUrl(); } catch (e) { return ''; } })()
  };
}
function systemBackup_(req, ctx) {
  var src = ss_();
  var name = 'Backup ' + APP.NAME + ' ' + Utilities.formatDate(now_(), APP.TZ, 'yyyy-MM-dd HH.mm');
  var copy = DriveApp.getFileById(src.getId()).makeCopy(name, driveFolder_('backup'));
  audit_('BACKUP', 'SISTEM', copy.getId(), name);
  return { nama: name, url: copy.getUrl(), id: copy.getId() };
}
function systemReset_(req, ctx) {
  if (str_(req.konfirmasi) !== 'RESET') throw apiErr_('BAD_REQUEST', 'Ketik RESET untuk konfirmasi');
  var kosong = ['PRODUCT', 'CATEGORY', 'ORDER', 'SERVICE', 'TRADEIN', 'PROMO', 'BANNER', 'TESTI', 'CUSTOMER', 'AUDIT'];
  kosong.forEach(function (n) {
    var sh = sheet_(n);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  cacheBust_();
  audit_('RESET_DATA', 'SISTEM', '', 'Data transaksi & konten dikosongkan');
  return { ok: true, dikosongkan: kosong };
}
function systemWarm_(req, ctx) {
  cacheBust_();
  publicBootstrap_({});
  audit_('HANGATKAN_CACHE', 'SISTEM', '', 'Cache storefront disegarkan');
  return { ok: true, waktu: iso_(now_()) };
}

/* ==========================================================================
 * 24. SEED DATA
 * ========================================================================== */
function seedCatalog_() {
  var cats = [
    { nama: 'Laptop', slug: 'laptop', ikon: 'laptop', deskripsi: 'Ultrabook, gaming, dan laptop bisnis terkurasi.', gambar: 'asset:ultrabook', urutan: 1 },
    { nama: 'PC Rakitan', slug: 'pc-rakitan', ikon: 'desktop', deskripsi: 'Rakitan custom dengan garansi dan burn-test 6 jam.', gambar: 'asset:pcrakit', urutan: 2 },
    { nama: 'Monitor', slug: 'monitor', ikon: 'monitor', deskripsi: 'Panel akurat warna untuk kerja desain dan gaming.', gambar: 'asset:monitor', urutan: 3 },
    { nama: 'Komponen', slug: 'komponen', ikon: 'cpu', deskripsi: 'GPU, SSD, RAM, dan pendingin pilihan.', gambar: 'asset:aksesoris', urutan: 4 },
    { nama: 'Aksesoris', slug: 'aksesoris', ikon: 'headphone', deskripsi: 'Keyboard, mouse, hub, dan tas laptop.', gambar: 'asset:aksesoris', urutan: 5 }
  ];
  var products = [
    { sku: 'LAP-001', nama: 'NexaBook Ultra 14 OLED', kategori: 'Laptop', brand: 'Nexalap', tipe: 'UNIT', kondisi: 'BARU', harga: 15999000, harga_coret: 18499000, harga_beli: 13500000, stok: 8, garansi: 'Garansi resmi 2 tahun', gambar: 'asset:ultrabook', unggulan: 1, terjual: 64, rating: 4.9,
      deskripsi: 'Ultrabook 1.19 kg dengan layar OLED 2.8K 120Hz, baterai tahan 14 jam, dan bodi aluminium CNC. Dirancang untuk profesional yang berpindah tempat sepanjang hari.',
      spesifikasi: { Prosesor: 'Intel Core Ultra 7 155H', RAM: '16 GB LPDDR5X', Penyimpanan: '1 TB NVMe Gen4', Layar: '14" OLED 2.8K 120Hz', Berat: '1.19 kg', Baterai: '75 Wh · fast charge 65W', Port: '2× Thunderbolt 4, HDMI 2.1, USB-A' } },
    { sku: 'LAP-002', nama: 'NexaBook Air 13 Ringan', kategori: 'Laptop', brand: 'Nexalap', tipe: 'UNIT', kondisi: 'BARU', harga: 10499000, harga_coret: 11999000, harga_beli: 8900000, stok: 12, garansi: 'Garansi resmi 2 tahun', gambar: 'asset:ultrabook', unggulan: 1, terjual: 132, rating: 4.8,
      deskripsi: 'Laptop 1.05 kg tanpa kipas untuk kuliah dan kerja mobile. Baterai 16 jam, layar 400 nits, dan keyboard senyap.',
      spesifikasi: { Prosesor: 'AMD Ryzen 5 8640U', RAM: '16 GB LPDDR5', Penyimpanan: '512 GB NVMe', Layar: '13.3" IPS 400 nits', Berat: '1.05 kg', Baterai: '60 Wh · 16 jam' } },
    { sku: 'LAP-003', nama: 'NexaBook Gaming RTX 4060', kategori: 'Laptop', brand: 'Nexalap', tipe: 'UNIT', kondisi: 'BARU', harga: 21499000, harga_coret: 24999000, harga_beli: 18500000, stok: 5, garansi: 'Garansi resmi 2 tahun', gambar: 'asset:gaming', unggulan: 1, terjual: 47, rating: 4.9,
      deskripsi: 'Gaming laptop dengan RTX 4060 140W, layar 165Hz QHD, dan sistem pendingin 6 heatpipe. Frame stabil untuk AAA dan rendering.',
      spesifikasi: { Prosesor: 'Intel Core i7-13700H', GPU: 'RTX 4060 8 GB 140W', RAM: '32 GB DDR5', Penyimpanan: '1 TB NVMe Gen4', Layar: '16" QHD+ 165Hz', Berat: '2.2 kg' } },
    { sku: 'LAP-004', nama: 'NexaBook Pro 16 Kreator', kategori: 'Laptop', brand: 'Nexalap', tipe: 'UNIT', kondisi: 'BARU', harga: 27999000, harga_coret: 0, harga_beli: 24000000, stok: 3, garansi: 'Garansi resmi 3 tahun', gambar: 'asset:gaming', unggulan: 0, terjual: 18, rating: 4.8,
      deskripsi: 'Workstation mobile untuk editor video dan 3D. Layar OLED 3K 100% DCI-P3 dengan warna terkalibrasi pabrik.',
      spesifikasi: { Prosesor: 'AMD Ryzen 9 8945HS', GPU: 'RTX 4070 8 GB', RAM: '64 GB DDR5', Penyimpanan: '2 TB NVMe', Layar: '16" OLED 3K 100% DCI-P3' } },
    { sku: 'LAP-005', nama: 'NexaBook Office 14 (Bekas Mulus)', kategori: 'Laptop', brand: 'Lenovo', tipe: 'UNIT', kondisi: 'BEKAS', harga: 4899000, harga_coret: 6500000, harga_beli: 3600000, stok: 6, garansi: 'Garansi toko 3 bulan', gambar: 'asset:bekas', unggulan: 0, terjual: 88, rating: 4.7,
      deskripsi: 'Unit bisnis ex-corporate, kondisi mulus 95%. Sudah dibersihkan, thermal paste diganti, dan lulus 24 titik pemeriksaan.',
      spesifikasi: { Prosesor: 'Intel Core i5-1135G7', RAM: '16 GB DDR4', Penyimpanan: '512 GB NVMe', Layar: '14" FHD IPS', Kondisi: 'Bekas mulus · grade A' } },
    { sku: 'LAP-006', nama: 'NexaBook Edu 11 Hemat', kategori: 'Laptop', brand: 'Nexalap', tipe: 'UNIT', kondisi: 'BARU', harga: 5299000, harga_coret: 5999000, harga_beli: 4300000, stok: 15, garansi: 'Garansi resmi 1 tahun', gambar: 'asset:ultrabook', unggulan: 0, terjual: 210, rating: 4.6,
      deskripsi: 'Pilihan paling hemat untuk sekolah dan administrasi. Ringan, baterai panjang, dan slot upgrade RAM/SSD.',
      spesifikasi: { Prosesor: 'Intel N100', RAM: '8 GB DDR4', Penyimpanan: '256 GB NVMe', Layar: '14" FHD', Berat: '1.35 kg' } },
    { sku: 'PC-001', nama: 'Paket PC Gaming Nexalap Vanta', kategori: 'PC Rakitan', brand: 'Nexalap', tipe: 'PAKET', kondisi: 'BARU', harga: 17499000, harga_coret: 19999000, harga_beli: 14500000, stok: 4, garansi: 'Garansi 2 tahun part & jasa', gambar: 'asset:pcrakit', unggulan: 1, terjual: 39, rating: 4.9,
      deskripsi: 'Rakitan seimbang untuk gaming 1440p dan streaming. Rakit oleh teknisi kami, burn-test 6 jam, cable management rapi, dan Windows terinstal.',
      spesifikasi: { CPU: 'Ryzen 7 7800X3D', GPU: 'RTX 4070 12 GB', Motherboard: 'B650M WiFi', RAM: '32 GB DDR5 6000', SSD: '1 TB Gen4', PSU: '750W 80+ Gold', Case: 'Mid tower airflow' } },
    { sku: 'PC-002', nama: 'Paket PC Desain Nexalap Studio', kategori: 'PC Rakitan', brand: 'Nexalap', tipe: 'PAKET', kondisi: 'BARU', harga: 26499000, harga_coret: 0, harga_beli: 22000000, stok: 2, garansi: 'Garansi 2 tahun part & jasa', gambar: 'asset:pcrakit', unggulan: 0, terjual: 12, rating: 4.8,
      deskripsi: 'Workstation untuk render 3D, video 4K, dan kompilasi berat. Fokus pada stabilitas dan keheningan.',
      spesifikasi: { CPU: 'Core i7-14700K', GPU: 'RTX 4070 Ti Super', RAM: '64 GB DDR5', SSD: '2 TB Gen4', PSU: '850W 80+ Gold', Cooling: 'AIO 360mm' } },
    { sku: 'PC-003', nama: 'Paket PC Kantor Nexalap Prima', kategori: 'PC Rakitan', brand: 'Nexalap', tipe: 'PAKET', kondisi: 'BARU', harga: 6999000, harga_coret: 7799000, harga_beli: 5800000, stok: 7, garansi: 'Garansi 1 tahun', gambar: 'asset:pcrakit', unggulan: 0, terjual: 56, rating: 4.7,
      deskripsi: 'PC kantor senyap dengan SSD cepat dan garansi on-site. Cocok untuk tim administrasi dan kasir.',
      spesifikasi: { CPU: 'Ryzen 5 5600G', RAM: '16 GB DDR4', SSD: '512 GB Gen3', PSU: '450W 80+ Bronze', Case: 'Mini tower senyap' } },
    { sku: 'MON-001', nama: 'Monitor NexaView 27 QHD 165Hz', kategori: 'Monitor', brand: 'Nexalap', tipe: 'UNIT', kondisi: 'BARU', harga: 3499000, harga_coret: 4299000, harga_beli: 2800000, stok: 11, garansi: 'Garansi resmi 3 tahun', gambar: 'asset:monitor', unggulan: 1, terjual: 74, rating: 4.8,
      deskripsi: 'Panel IPS QHD 165Hz dengan akurasi warna 95% DCI-P3 dan standar ergonomis tinggi-rendah.',
      spesifikasi: { Ukuran: '27 inci', Resolusi: '2560×1440', Refresh: '165 Hz', Panel: 'IPS · 95% DCI-P3', Port: '2× HDMI 2.0, DP 1.4, USB-C 65W' } },
    { sku: 'KOM-001', nama: 'SSD Nexalap NVMe 1TB Gen4', kategori: 'Komponen', brand: 'Nexalap', tipe: 'UNIT', kondisi: 'BARU', harga: 899000, harga_coret: 1099000, harga_beli: 690000, stok: 24, garansi: 'Garansi resmi 5 tahun', gambar: 'asset:aksesoris', unggulan: 0, terjual: 186, rating: 4.9,
      deskripsi: 'SSD NVMe PCIe Gen4 dengan kecepatan baca 5000 MB/s dan heatsink tipis untuk laptop maupun PC.',
      spesifikasi: { Kapasitas: '1 TB', Interface: 'PCIe Gen4 ×4', Baca: '5000 MB/s', Tulis: '4300 MB/s', TBW: '600 TB' } },
    { sku: 'AKS-001', nama: 'Keyboard Mekanik NexaType 75', kategori: 'Aksesoris', brand: 'Nexalap', tipe: 'UNIT', kondisi: 'BARU', harga: 749000, harga_coret: 899000, harga_beli: 560000, stok: 18, garansi: 'Garansi toko 1 tahun', gambar: 'asset:aksesoris', unggulan: 0, terjual: 143, rating: 4.7,
      deskripsi: 'Keyboard mekanik 75% hot-swap, koneksi tiga mode, dan foam peredam untuk suara yang rapi.',
      spesifikasi: { Layout: '75% · 82 tombol', Switch: 'Hot-swap linear', Koneksi: 'USB-C · Bluetooth · 2.4G', Baterai: '4000 mAh' } }
  ];
  return { cats: cats, products: products };
}

function seedSistem_(opts) {
  opts = opts || {};
  var now = iso_(now_());
  /* staff */
  if (!readAll_('STAFF').length) {
    var staff = [
      { nama: 'Owner Nexalap', role: 'OWNER', pin: '1234', wa: DEFAULT_SETTINGS.toko_wa },
      { nama: 'Admin Toko', role: 'ADMIN', pin: '2345', wa: '6281234567001' },
      { nama: 'Kasir Depan', role: 'KASIR', pin: '3456', wa: '6281234567002' },
      { nama: 'Gudang Utama', role: 'GUDANG', pin: '4567', wa: '6281234567003' },
      { nama: 'Teknisi Andi', role: 'TEKNISI', pin: '5678', wa: '6281234567004' },
      { nama: 'Marketing Nia', role: 'MARKETING', pin: '6789', wa: '6281234567005' }
    ];
    staff.forEach(function (s) {
      var salt = uuid_().slice(0, 12);
      writeRow_('STAFF', {
        id: nextId_('STAFF'), nama: s.nama, wa: s.wa, role: s.role,
        pin_hash: hashPin_(s.pin, salt), pin_salt: salt, aktif: 1, dibuat: now, last_login: ''
      });
    });
  }
  /* settings */
  var existingSettings = readAll_('SETTING').map(function (s) { return str_(s.id); });
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (existingSettings.indexOf(k) < 0) writeRow_('SETTING', { id: k, value: DEFAULT_SETTINGS[k] });
  });
  if (!opts.staffOnly) {
    var catalog = seedCatalog_();
    if (!readAll_('CATEGORY').length) {
      catalog.cats.forEach(function (c) {
        writeRow_('CATEGORY', Object.assign({ id: nextId_('CATEGORY'), aktif: 1, dibuat: now }, c));
      });
    }
    if (!readAll_('PRODUCT').length) {
      catalog.products.forEach(function (p) {
        writeRow_('PRODUCT', Object.assign({
          id: nextId_('PRODUCT'), status: 'AKTIF', urutan: 99, dibuat: now, diubah: now
        }, p));
      });
    }
    if (!readAll_('BANNER').length) {
      writeRow_('BANNER', { id: nextId_('BANNER'), judul: 'Laptop terkurasi, garansi jelas', subjudul: 'Dites satu per satu sebelum dikirim.', gambar: 'asset:hero', link: '#katalog', urutan: 1, aktif: 1, dibuat: now });
      writeRow_('BANNER', { id: nextId_('BANNER'), judul: 'PC rakitan siap pakai', subjudul: 'Burn-test 6 jam, cable management rapi.', gambar: 'asset:pcrakit', link: '#paket', urutan: 2, aktif: 1, dibuat: now });
    }
    if (!readAll_('PROMO').length) {
      writeRow_('PROMO', { id: nextId_('PROMO'), kode: 'NEXA10', judul: 'Diskon 10% pembelian pertama', tipe: 'PERSEN', nilai: 10, min_belanja: 3000000, maks_diskon: 1500000, mulai: today_(), akhir: daysAgoKey_(-30), kuota: 100, terpakai: 0, aktif: 1, dibuat: now });
      writeRow_('PROMO', { id: nextId_('PROMO'), kode: 'ONGKIRGRATIS', judul: 'Potongan ongkir Rp250.000', tipe: 'NOMINAL', nilai: 250000, min_belanja: 5000000, maks_diskon: 250000, mulai: today_(), akhir: daysAgoKey_(-60), kuota: 0, terpakai: 0, aktif: 1, dibuat: now });
    }
    if (!readAll_('CATEGORY').length || !readAll_('TESTI').length) {
      var testis = [
        { nama: 'Rizky Pratama', kota: 'Surabaya', rating: 5, pesan: 'Laptop sampai sehari setelah transfer, segel utuh, dan sudah diinstal aplikasi kerja. Packingnya benar-benar aman.', produk: 'NexaBook Ultra 14 OLED' },
        { nama: 'Dewi Anggraini', kota: 'Sidoarjo', rating: 5, pesan: 'Konsultasi dulu lewat WhatsApp, dibantu pilih spesifikasi sesuai budget. Tidak dipaksa upgrade. Recommended.', produk: 'NexaBook Air 13 Ringan' },
        { nama: 'Bagus Setiawan', kota: 'Gresik', rating: 5, pesan: 'PC rakitan rapi banget kabelnya, suhu adem, dan sudah ada benchmark-nya. Worth it dibanding rakit sendiri.', produk: 'Paket PC Gaming Vanta' },
        { nama: 'Nadia Kusuma', kota: 'Malang', rating: 4, pesan: 'Unit bekasnya masih mulus, garansi toko jelas. Respon service cepat saat saya tanya soal upgrade RAM.', produk: 'NexaBook Office 14' },
        { nama: 'Fajar Ramadhan', kota: 'Surabaya', rating: 5, pesan: 'Tukar tambah laptop lama prosesnya transparan. Nilai awal dan final tidak jauh, bonus upgrade langsung dipakai.', produk: 'NexaBook Gaming RTX 4060' },
        { nama: 'Sinta Maharani', kota: 'Jakarta', rating: 5, pesan: 'Monitor datang tanpa dead pixel, warna akurat untuk kerja desain. Pengiriman luar kota cepat dan aman.', produk: 'Monitor NexaView 27 QHD' }
      ];
      testis.forEach(function (t, i) {
        writeRow_('TESTI', Object.assign({ id: nextId_('TESTI'), avatar: '', urutan: i + 1, aktif: 1, dibuat: now }, t));
      });
    }
    if (!readAll_('CUSTOMER').length) {
      var custs = [
        { nama: 'Rizky Pratama', wa: '6281200000001', kota: 'Surabaya', total_belanja: 15999000, trx: 2, poin: 420, tier: 'PLATINUM' },
        { nama: 'Dewi Anggraini', wa: '6281200000002', kota: 'Sidoarjo', total_belanja: 10499000, trx: 1, poin: 210, tier: 'GOLD' },
        { nama: 'Bagus Setiawan', wa: '6281200000003', kota: 'Gresik', total_belanja: 17499000, trx: 3, poin: 560, tier: 'PLATINUM' },
        { nama: 'Nadia Kusuma', wa: '6281200000004', kota: 'Malang', total_belanja: 4899000, trx: 1, poin: 96, tier: 'SILVER' },
        { nama: 'Fajar Ramadhan', wa: '6281200000005', kota: 'Surabaya', total_belanja: 21499000, trx: 2, poin: 645, tier: 'PLATINUM' },
        { nama: 'Sinta Maharani', wa: '6281200000006', kota: 'Jakarta', total_belanja: 3499000, trx: 1, poin: 70, tier: 'SILVER' }
      ];
      custs.forEach(function (c) {
        writeRow_('CUSTOMER', Object.assign({ id: nextId_('CUSTOMER'), email: '', alamat: '', catatan: '', dibuat: now }, c));
      });
    }
    if (!readAll_('ORDER').length) {
      var seedOrders = [
        { hari: 0, nama: 'Rizky Pratama', wa: '6281200000001', items: [{ sku: 'LAP-001', nama: 'NexaBook Ultra 14 OLED', qty: 1, harga: 15999000 }], status: 'LUNAS', metode: 'TRANSFER' },
        { hari: 0, nama: 'Sinta Maharani', wa: '6281200000006', items: [{ sku: 'MON-001', nama: 'Monitor NexaView 27 QHD 165Hz', qty: 1, harga: 3499000 }], status: 'MENUNGGU', metode: 'TRANSFER' },
        { hari: 1, nama: 'Bagus Setiawan', wa: '6281200000003', items: [{ sku: 'PC-001', nama: 'Paket PC Gaming Nexalap Vanta', qty: 1, harga: 17499000 }], status: 'LUNAS', metode: 'KREDIT' },
        { hari: 2, nama: 'Nadia Kusuma', wa: '6281200000004', items: [{ sku: 'LAP-005', nama: 'NexaBook Office 14 (Bekas Mulus)', qty: 1, harga: 4899000 }], status: 'LUNAS', metode: 'QRIS' },
        { hari: 3, nama: 'Dewi Anggraini', wa: '6281200000002', items: [{ sku: 'LAP-002', nama: 'NexaBook Air 13 Ringan', qty: 1, harga: 10499000 }], status: 'LUNAS', metode: 'TRANSFER' },
        { hari: 4, nama: 'Fajar Ramadhan', wa: '6281200000005', items: [{ sku: 'LAP-003', nama: 'NexaBook Gaming RTX 4060', qty: 1, harga: 21499000 }], status: 'LUNAS', metode: 'TUNAI' },
        { hari: 6, nama: 'Rizky Pratama', wa: '6281200000001', items: [{ sku: 'AKS-001', nama: 'Keyboard Mekanik NexaType 75', qty: 2, harga: 749000 }], status: 'LUNAS', metode: 'QRIS' },
        { hari: 9, nama: 'Bagus Setiawan', wa: '6281200000003', items: [{ sku: 'KOM-001', nama: 'SSD Nexalap NVMe 1TB Gen4', qty: 1, harga: 899000 }], status: 'LUNAS', metode: 'TRANSFER' },
        { hari: 12, nama: 'Pelanggan Umum', wa: '', items: [{ sku: 'LAP-006', nama: 'NexaBook Edu 11 Hemat', qty: 1, harga: 5299000 }], status: 'LUNAS', metode: 'TUNAI' }
      ];
      seedOrders.forEach(function (o) {
        var sub = o.items.reduce(function (a, i) { return a + i.harga * i.qty; }, 0);
        var tgl = new Date(now_().getTime() - o.hari * 86400000);
        writeRow_('ORDER', {
          id: nextId_('ORDER'), tanggal: iso_(tgl), tipe: o.hari === 12 ? 'POS' : 'ONLINE', nama: o.nama, wa: o.wa,
          alamat: 'Alamat pelanggan', kota: 'Surabaya', items: o.items, subtotal: sub, diskon: 0, promo: '',
          ongkir: 0, total: sub, metode: o.metode, status: o.status,
          sumber: o.hari === 12 ? 'KASIR Kasir Depan' : 'WEB', catatan: '', dibuat: iso_(tgl)
        });
      });
    }
    if (!readAll_('SERVICE').length) {
      var svc = [
        { nama: 'Rizky Pratama', wa: '6281200000001', perangkat: 'NexaBook Ultra 14 OLED', kategori: 'Laptop', keluhan: 'Keyboard beberapa tombol tidak responsif.', status: 'DIKERJAKAN', teknisi: 'Teknisi Andi', estimasi: 450000, hari: 1 },
        { nama: 'Nadia Kusuma', wa: '6281200000004', perangkat: 'NexaBook Office 14', kategori: 'Laptop', keluhan: 'Upgrade RAM 16 GB dan pembersihan thermal.', status: 'SELESAI', teknisi: 'Teknisi Andi', estimasi: 750000, hari: 3 },
        { nama: 'Sinta Maharani', wa: '6281200000006', perangkat: 'PC Rakitan Studio', kategori: 'PC Rakitan', keluhan: 'Bunyi kipas tidak wajar saat render.', status: 'MASUK', teknisi: '', estimasi: 0, hari: 0 }
      ];
      svc.forEach(function (s) {
        var tgl = new Date(now_().getTime() - s.hari * 86400000);
        writeRow_('SERVICE', {
          id: nextId_('SERVICE'), tanggal: iso_(tgl), nama: s.nama, wa: s.wa, perangkat: s.perangkat, kategori: s.kategori,
          keluhan: s.keluhan, teknisi: s.teknisi, status: s.status, estimasi: s.estimasi, biaya: 0, catatan: '', dibuat: iso_(tgl)
        });
      });
    }
    if (!readAll_('TRADEIN').length) {
      writeRow_('TRADEIN', {
        id: nextId_('TRADEIN'), tanggal: iso_(now_()), nama: 'Fajar Ramadhan', wa: '6281200000005',
        perangkat: 'Laptop Gaming Lama', kategori: 'Laptop', brand: 'ASUS ROG', tahun: now_().getFullYear() - 3,
        kondisi: 'BAIK', harga_awal: 15000000, estimasi_lo: 5800000, estimasi_hi: 6700000,
        penawaran: 0, status: 'BARU', catatan: 'Pengajuan dari web', dibuat: iso_(now_())
      });
    }
  }
  cacheBust_();
  return { ok: true };
}

/* ==========================================================================
 * 25. SETUP & SELF TEST
 * ========================================================================== */
function setupSistem() {
  var started = now_().getTime();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka spreadsheet → Extensions → Apps Script, lalu jalankan setupSistem().');
  PropertiesService.getScriptProperties().setProperty(APP.PROP_SHEET, ss.getId());
  var created = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { created.push(name); }
    sh = sh || ss.insertSheet(name);
    var cols = SCHEMA[name];
    var head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
    var isEmpty = !str_(head[0]);
    if (isEmpty) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#eef4ff');
      sh.setFrozenRows(1);
    }
    if (!sh.getRange(1, 1).getValue()) sh.getRange(1, 1).setValue('id');
  });
  /* registry fitur */
  var existingFeat = {};
  readAll_('FEATURE_REGISTRY').forEach(function (f) { existingFeat[str_(f.kode)] = 1; });
  FEATURE_REGISTRY.forEach(function (f) {
    if (existingFeat[f.kode]) return;
    writeRow_('FEATURE_REGISTRY', {
      id: nextId_('FEATURE_REGISTRY'), kode: f.kode, nama: f.nama, modul: f.modul, deskripsi: f.deskripsi,
      default_status: f.default ? 1 : 0, roles: f.roles, dependencies: f.dependencies || [], conflicts: f.conflicts || [],
      fallback: f.fallback || '', dampak: f.dampak || '', versi: APP.VERSION
    });
  });
  seedSistem_({});
  _featDefMap = null;
  cacheBust_();
  var summary = {
    spreadsheet: ss.getName(),
    sheets: Object.keys(SCHEMA).length,
    dibuat: created,
    produk: readAll_('PRODUCT').length,
    staf: readAll_('STAFF').length,
    kategori: readAll_('CATEGORY').length,
    fitur: Object.keys(featureDefs_()).length,
    routes: Object.keys(ROUTES).length,
    pin_default: 'Owner 1234 · Admin 2345 · Kasir 3456 · Gudang 4567 · Teknisi 5678 · Marketing 6789',
    drive_folder: driveFolder_().getName(),
    durasi_ms: now_().getTime() - started,
    langkah_berikut: 'Deploy → New deployment → Web app (Execute as: Me, Access: Anyone) → salin URL /exec ke CONFIG.API_URL di index.html'
  };
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}
function resetDemo() {
  ['PRODUCT', 'CATEGORY', 'CUSTOMER', 'ORDER', 'SERVICE', 'TRADEIN', 'PROMO', 'BANNER', 'TESTI', 'AUDIT', 'COUNTER', 'MEDIA'].forEach(function (n) {
    var sh = sheet_(n);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  cacheBust_();
  seedSistem_({});
  Logger.log('Data demo dipulihkan.');
  return { ok: true };
}
function kosongkanData() {
  ['PRODUCT', 'CATEGORY', 'CUSTOMER', 'ORDER', 'SERVICE', 'TRADEIN', 'PROMO', 'BANNER', 'TESTI'].forEach(function (n) {
    var sh = sheet_(n);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  cacheBust_();
  Logger.log('Data transaksi & katalog dikosongkan. Staf, pengaturan, dan fitur dipertahankan.');
  return { ok: true };
}
function selfTest() {
  var hasil = [];
  function test(nama, fn) {
    try { var r = fn(); hasil.push({ nama: nama, status: 'PASS', info: r === undefined ? '' : String(r) }); }
    catch (e) { hasil.push({ nama: nama, status: 'FAIL', info: e.message }); }
  }
  test('Spreadsheet terhubung', function () { return ss_().getName(); });
  test('17 sheet tersedia', function () {
    var missing = Object.keys(SCHEMA).filter(function (n) { return !sheet_(n, false); });
    if (missing.length) throw new Error('Hilang: ' + missing.join(', '));
    return Object.keys(SCHEMA).length + ' sheet';
  });
  test('Registry fitur tersinkron', function () { return Object.keys(featureDefs_()).length + ' fitur'; });
  test('Registry fitur minimal 40', function () {
    var n = Object.keys(featureDefs_()).length;
    if (n < 40) throw new Error('Baru ' + n + ' fitur');
    return n + ' fitur';
  });
  test('Login Owner (PIN 1234)', function () { var r = login_({ pin: '1234' }); return r.user.nama + ' · ' + r.user.role; });
  test('Bootstrap publik', function () { var b = publicBootstrap_({ refresh: true }); return b.products.length + ' produk, ' + b.categories.length + ' kategori'; });
  test('Daftar produk API', function () { return productList_({ limit: 5 }, { user: { role: 'OWNER' } }).total + ' total'; });
  test('Grafik dashboard', function () { var c = dashCharts_({ days: 14 }, { user: { role: 'OWNER' } }); return c.omzet.values.length + ' titik'; });
  test('Laporan periode', function () { var l = laporan_({}, { user: { role: 'OWNER' } }); return 'omzet ' + rupiah_(l.ringkasan.omzet); });
  test('Guard fitur', function () { var on = featureOn_('storefront.katalog', 'PUBLIC'); return on ? 'katalog ON' : 'katalog OFF'; });
  test('Folder Drive media', function () { return driveFolder_().getName(); });
  var pass = hasil.filter(function (h) { return h.status === 'PASS'; }).length;
  var out = { ringkasan: pass + '/' + hasil.length + ' PASS', hasil: hasil };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ==========================================================================
 * 26. TABEL ROUTE
 * ========================================================================== */
var MG = ['OWNER', 'ADMIN'];
var ALL = ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI', 'MARKETING'];
var ROUTES = {
  /* Publik */
  'ping': { roles: null, fn: ping_ },
  'public.bootstrap': { roles: null, fn: publicBootstrap_ },
  'public.products': { roles: null, feature: 'storefront.katalog', fn: publicProducts_ },
  'public.product': { roles: null, feature: 'storefront.katalog', fn: publicProductDetail_ },
  'public.promo.check': { roles: null, feature: 'promo.publik', fn: publicPromoCheck_ },
  'public.order.create': { roles: null, feature: 'pesanan.online', fn: publicOrderCreate_ },
  'public.track': { roles: null, feature: 'storefront.lacak', fn: publicTrack_ },
  'public.service.apply': { roles: null, feature: 'admin.service', fn: publicServiceApply_ },
  'public.tradein.calc': { roles: null, feature: 'storefront.tukar_tambah', fn: tradeinEstimate_ },
  'public.tradein.apply': { roles: null, feature: 'storefront.tukar_tambah', fn: publicTradeinApply_ },
  'public.lead': { roles: null, feature: 'pelanggan.lead', fn: publicLead_ },
  'public.testimonials': { roles: null, fn: publicTestimonials_ },

  /* Auth */
  'auth.login': { roles: null, fn: login_ },
  'auth.me': { roles: '*', fn: me_ },
  'auth.changePin': { roles: '*', fn: changePin_ },

  /* Dashboard & laporan */
  'dash.stats': { roles: '*', feature: 'admin.dashboard', fn: dashStats_ },
  'dash.charts': { roles: '*', feature: 'dash.grafik', fn: dashCharts_ },
  'report.summary': { roles: MG.concat(['MARKETING']), feature: 'admin.laporan', fn: laporan_ },

  /* Produk */
  'product.list': { roles: ALL, feature: 'admin.produk', fn: productList_ },
  'product.get': { roles: ALL, feature: 'admin.produk', fn: productGet_ },
  'product.save': { roles: ['OWNER', 'ADMIN', 'GUDANG'], feature: 'admin.produk', fn: productSave_ },
  'product.delete': { roles: MG, feature: 'admin.produk', fn: productDelete_ },
  'product.bulkDelete': { roles: MG, feature: 'admin.produk', fn: productBulkDelete_ },
  'product.toggle': { roles: ['OWNER', 'ADMIN', 'GUDANG'], feature: 'admin.produk', fn: productToggleStatus_ },
  'product.import': { roles: ['OWNER', 'ADMIN', 'GUDANG'], feature: 'admin.produk', fn: productImport_ },
  'product.export': { roles: MG.concat(['GUDANG']), feature: 'exports.csv', fn: productExport_ },

  /* Kategori */
  'category.list': { roles: ALL, feature: 'admin.kategori', fn: categoryList_ },
  'category.save': { roles: ['OWNER', 'ADMIN', 'GUDANG'], feature: 'admin.kategori', fn: categorySave_ },
  'category.delete': { roles: MG, feature: 'admin.kategori', fn: categoryDelete_ },

  /* Media */
  'media.list': { roles: ALL, feature: 'admin.media', fn: mediaList_ },
  'media.folders': { roles: ALL, feature: 'admin.media', fn: mediaFolders_ },
  'media.upload': { roles: ALL, feature: 'admin.media', fn: mediaUpload_ },
  'media.delete': { roles: MG.concat(['GUDANG', 'MARKETING']), feature: 'admin.media', fn: mediaDelete_ },
  'media.rename': { roles: MG.concat(['GUDANG', 'MARKETING']), feature: 'admin.media', fn: mediaRename_ },
  'media.repair': { roles: ['OWNER'], feature: 'admin.media', fn: mediaRepair_ },

  /* Pesanan & POS */
  'order.list': { roles: ALL, feature: 'admin.pesanan', fn: orderList_ },
  'order.get': { roles: ALL, feature: 'admin.pesanan', fn: orderGet_ },
  'order.pay': { roles: ['OWNER', 'ADMIN', 'KASIR'], feature: 'admin.pesanan', fn: orderPay_ },
  'order.void': { roles: MG, feature: 'admin.pesanan', fn: orderVoid_ },
  'order.delete': { roles: MG, feature: 'admin.pesanan', fn: orderDelete_ },
  'pos.lookup': { roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG'], feature: 'pos.access', fn: posLookup_ },
  'pos.checkout': { roles: ['OWNER', 'ADMIN', 'KASIR'], feature: 'pos.access', fn: posCheckout_ },
  'pos.stock': { roles: ['OWNER', 'ADMIN', 'KASIR'], feature: 'pos.access', fn: posStockCheck_ },

  /* Pelanggan */
  'customer.list': { roles: ALL, feature: 'admin.pelanggan', fn: customerList_ },
  'customer.get': { roles: ALL, feature: 'admin.pelanggan', fn: customerGet_ },
  'customer.save': { roles: ['OWNER', 'ADMIN', 'KASIR', 'MARKETING'], feature: 'admin.pelanggan', fn: customerSave_ },
  'customer.delete': { roles: MG, feature: 'admin.pelanggan', fn: customerDelete_ },
  'customer.points': { roles: MG.concat(['MARKETING']), feature: 'admin.pelanggan', fn: customerPoints_ },

  /* Service */
  'service.list': { roles: ALL, feature: 'admin.service', fn: serviceList_ },
  'service.save': { roles: ['OWNER', 'ADMIN', 'KASIR', 'TEKNISI'], feature: 'admin.service', fn: serviceSave_ },
  'service.status': { roles: ['OWNER', 'ADMIN', 'KASIR', 'TEKNISI'], feature: 'admin.service', fn: serviceStatus_ },
  'service.delete': { roles: MG, feature: 'admin.service', fn: serviceDelete_ },

  /* Tukar tambah */
  'tradein.list': { roles: ALL, feature: 'admin.tradein', fn: tradeinList_ },
  'tradein.review': { roles: ['OWNER', 'ADMIN', 'KASIR', 'TEKNISI'], feature: 'admin.tradein', fn: tradeinReview_ },
  'tradein.approve': { roles: MG, feature: 'admin.tradein', fn: tradeinApprove_ },
  'tradein.reject': { roles: ['OWNER', 'ADMIN', 'TEKNISI'], feature: 'admin.tradein', fn: tradeinReject_ },
  'tradein.delete': { roles: MG, feature: 'admin.tradein', fn: tradeinDelete_ },

  /* Promo */
  'promo.list': { roles: MG.concat(['MARKETING']), feature: 'admin.promo', fn: promoList_ },
  'promo.save': { roles: MG.concat(['MARKETING']), feature: 'admin.promo', fn: promoSave_ },
  'promo.delete': { roles: MG, feature: 'admin.promo', fn: promoDelete_ },
  'promo.toggle': { roles: MG.concat(['MARKETING']), feature: 'admin.promo', fn: promoToggle_ },

  /* Konten */
  'content.get': { roles: ALL, feature: 'admin.konten', fn: contentGet_ },
  'banner.save': { roles: MG.concat(['MARKETING']), feature: 'admin.konten', fn: bannerSave_ },
  'banner.delete': { roles: MG.concat(['MARKETING']), feature: 'admin.konten', fn: bannerDelete_ },
  'testi.save': { roles: MG.concat(['MARKETING']), feature: 'admin.konten', fn: testiSave_ },
  'testi.delete': { roles: MG.concat(['MARKETING']), feature: 'admin.konten', fn: testiDelete_ },

  /* Staf, pengaturan, audit, sistem */
  'staff.list': { roles: ['OWNER'], feature: 'admin.staf', fn: staffList_ },
  'staff.save': { roles: ['OWNER'], feature: 'admin.staf', fn: staffSave_ },
  'staff.delete': { roles: ['OWNER'], feature: 'admin.staf', fn: staffDelete_ },
  'staff.resetPin': { roles: ['OWNER'], feature: 'admin.staf', fn: staffResetPin_ },
  'settings.get': { roles: '*', feature: 'admin.pengaturan', fn: settingsGet_ },
  'settings.save': { roles: MG, feature: 'admin.pengaturan', fn: settingsSave_ },
  'audit.list': { roles: MG, feature: 'admin.audit', fn: auditList_ },
  'system.info': { roles: MG, feature: 'admin.sistem', fn: systemInfo_ },
  'system.backup': { roles: ['OWNER'], feature: 'admin.sistem', fn: systemBackup_ },
  'system.reset': { roles: ['OWNER'], feature: 'admin.sistem', fn: systemReset_ },
  'system.warm': { roles: MG, fn: systemWarm_ },

  /* Fitur */
  'feature.list': { roles: MG, feature: 'admin.fitur', fn: featureList_ },
  'feature.toggle': { roles: ['OWNER'], feature: 'admin.fitur', fn: featureToggle_ },
  'feature.bulk_toggle': { roles: ['OWNER'], feature: 'admin.fitur', fn: featureBulkToggle_ },
  'feature.reset': { roles: ['OWNER'], feature: 'admin.fitur', fn: featureReset_ },
  'feature.preset.list': { roles: MG, fn: featurePresets_ },
  'feature.preset.apply': { roles: ['OWNER'], feature: 'admin.fitur', fn: presetApply_ },
  'feature.log': { roles: MG, feature: 'admin.fitur', fn: featureLog_ },
  'feature.impact': { roles: MG, feature: 'admin.fitur', fn: featureImpact_ }
};
