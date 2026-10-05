# Leo Monitor

Situs statis di `public/` dengan API serverless untuk status layanan dan RSS berita dark web. Tab **Lab & tools** memuat pemeriksaan header keamanan pasif untuk situs yang sedang dibuka, contoh scanner lokal, peta visual, dan deface preview di iframe sandbox. Preview tidak mengubah situs atau mengirim konten ke server lain.

## Deploy ke Vercel

1. Upload/push folder proyek ini ke repository Git.
2. Di Vercel, pilih **Add New Project** lalu impor repository tersebut.
3. Gunakan preset **Other**. Biarkan Build Command dan Output Directory kosong; tidak ada proses build atau dependensi npm yang diperlukan.
4. Deploy. Vercel menyajikan berkas di `public/` sebagai aset statis. Endpoint `/api/monitor` dan `/api/news` berjalan sebagai Functions.

Maintenance harian 09.00–14.00 WIB diberlakukan oleh `middleware.ts`, termasuk pada endpoint API. `scripts/server.local.cjs` hanya untuk menjalankan backend lokal dan tidak dipakai saat deploy.

## Menjalankan lokal

Gunakan Node.js 20 atau lebih baru, lalu jalankan:

```sh
npm start
```

Buka alamat lokal yang ditampilkan di terminal.
