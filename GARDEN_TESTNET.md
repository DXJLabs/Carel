# CAREL · Garden testnet bridge

Integrasi ini menambahkan Garden API v2 ke Agent → Bridge, riwayat Garden di Activity, dan saldo token Bitcoin publik di Portfolio. Basis repo: `DXJLabs/Carel`, commit `c75faa2fc68a9cfbf08ccfd6c60fd89f040262b9`.

## Jaringan dan aset

- Bitcoin **Testnet4** ↔ **Starknet Sepolia**. Alamat Bitcoin yang didukung: SegWit/Taproot `tb1…` dengan checksum valid.
- Aset dan alamat kontrak diambil dari katalog Garden testnet. Dokumentasi Garden yang diperiksa mencantumkan **WBTC** di Sepolia. **strkBTC hanya tersedia jika katalog API benar-benar mengembalikannya**; kode tidak mengganti nama WBTC menjadi strkBTC.
- Katalog aset bukan jaminan likuiditas. Tombol pembuatan order memerlukan quote Garden yang masih tersedia dengan nominal penerimaan yang sama dengan review.
- Bridge menggunakan saldo publik. Pilih **Unshield / Public routes** di Agent. Memilih mode ini tidak menarik saldo dari pool privat; Shield/Unshield STRK tetap dijalankan lewat aksi yang sudah ada.
- Saldo Bitcoin ditampilkan terpisah dari total STRK di Portfolio.

## Pasang di Termux

Unduh `carel-garden-testnet.zip` ke folder Download terlebih dahulu. Jika folder `~/storage/downloads` belum tersedia, jalankan `termux-setup-storage` sekali dan izinkan akses penyimpanan. Jika `unzip` belum ada, jalankan `pkg install unzip`.

```bash
cd ~/carel-v2-mock &&
unzip -o ~/storage/downloads/carel-garden-testnet.zip -d ~/carel-garden-package &&
node ~/carel-garden-package/carel-garden-testnet/apply.mjs . &&
npx tsc --noEmit &&
node --test tests/garden.test.cjs
```

Installer memeriksa seluruh file sebelum menulis. Jika file sumber berbeda dari commit basis, pemasangan berhenti dengan daftar konflik, sebelum mengubah proyek. Menjalankan ulang paket yang sama aman. Tidak ada folder backup yang dibuat.

Tidak ada dependency baru. `package.json` dan lockfile tetap memakai dependency repo yang sudah ada. Build Next.js dilakukan oleh Vercel; cukup typecheck dan test Node di Termux.

## Aktifkan Garden di Vercel

Buat atau ambil App ID dari [Garden Portal](https://portal.garden.finance), lalu tambahkan sebagai environment variable **server** pada project Vercel yang terhubung dengan folder repo:

```bash
cd ~/carel-v2-mock &&
vercel env add GARDEN_APP_ID production
```

Masukkan App ID ketika CLI memintanya. Nama variabel harus `GARDEN_APP_ID`, tanpa awalan `NEXT_PUBLIC_`. Jika variabel sudah ada, perbarui nilainya melalui pengaturan Environment Variables project Vercel. Untuk Preview deployment, tambahkan juga ke lingkungan Preview jika diperlukan. Untuk pengembangan lokal, simpan `GARDEN_APP_ID=...` dalam `.env.local` yang diabaikan Git.

Kemudian commit dan deploy:

```bash
cd ~/carel-v2-mock &&
git add components/CarelWorkspace.tsx components/testnet/Strk20Testnet.tsx components/bridge lib/garden app/api/garden tests/garden.test.cjs GARDEN_TESTNET.md &&
git commit -m "feat: integrate Garden Bitcoin-Starknet testnet bridge" &&
git push origin main &&
vercel --prod
```

Lingkungan Vercel bernama `production` adalah target deployment situs. Endpoint bridge dalam kode tetap testnet dan tidak dapat diubah ke mainnet melalui environment variable. Environment baru berlaku setelah deployment ulang.

Jika App ID belum diatur, API CAREL merespons `503 NOT_CONFIGURED` dan UI menampilkan bridge belum aktif. Endpoint: `/api/garden?action=catalog`.

## Uji dengan wallet

### Bitcoin Testnet4 → Starknet Sepolia

1. Hubungkan wallet Starknet pada Sepolia. Buka Agent → Bridge, lalu pilih **Use public route** bila diminta.
2. Pilih token yang ditawarkan Garden, isi nominal BTC dan alamat refund Bitcoin Testnet4 milikmu. Pastikan jaringan wallet BTC adalah **Testnet4**, karena awalan `tb1` juga dipakai jaringan testnet Bitcoin lain.
3. Pilih **Get live quote**, periksa jaringan, alamat penerima dan jumlah kirim/terima, lalu **Create bridge order**.
4. Kirim nominal BTC testnet yang ditampilkan ke alamat deposit khusus order tersebut menggunakan wallet Bitcoin milikmu. Pengiriman Bitcoin dilakukan manual; CAREL tidak mengakses private key Bitcoin.
5. Tunggu konfirmasi dan delivery di Activity. **Received** baru ditampilkan setelah transaksi redeem tujuan tercatat dalam blok. Konfirmasi deposit saja belum berarti bridge selesai.

Faucet Testnet4 yang dirujuk Garden: [testnetbtc.com](https://testnetbtc.com/). Nominal harus memenuhi batas quote yang berlaku; `0.0005` pada form hanya contoh awal.

### Starknet Sepolia → Bitcoin Testnet4

1. Gunakan saldo publik token yang tercantum di Garden serta saldo gas yang cukup di wallet Sepolia.
2. Balik arah bridge, isi nominal dan alamat penerima Bitcoin Testnet4 milikmu, lalu minta quote dan buat order.
3. Periksa detail order dan pilih **Approve & fund bridge**. Wallet meminta persetujuan untuk approval sebesar nominal bridge dan deposit HTLC dalam satu transaksi.
4. Pantau source dan destination transaction di Activity. Jika respons wallet hilang, cek transaksi wallet terlebih dahulu sebelum mengizinkan retry; jangan mendanai order dua kali.

Status aktif diperbarui saat halaman terlihat. Riwayat Garden dapat dipulihkan melalui Activity setelah reload; adapter mengambil 50 order terbaru per wallet, sementara daftar lokal menyimpan 30 order terbaru. Tombol Refresh memuat ulang riwayat atau saldo. Tidak ada klaim riwayat tak terbatas atau indexer milik CAREL.

Order yang tidak didanai selama satu jam ditandai kedaluwarsa sesuai jendela funding Garden yang didokumentasikan. Untuk order yang sudah didanai tetapi settlement gagal, **Request refund** meminta refund melalui Garden setelah memenuhi timelock. Garden memeriksa kelayakan; tombol ini tidak menjamin refund langsung. Penerima refund tidak bisa diganti dari CAREL.

## Validasi dan batas uji

- 15 test Node lulus terhadap parser dan adapter server yang sebenarnya, dengan respons Garden tiruan: nominal satoshi, checksum Bitcoin testnet, filter jaringan/aset, quote berubah, penerima dua arah, recovery nonce, approval terbatas, pencegahan funding ulang, status delivery/refund, dan kredensial yang belum dikonfigurasi.
- TypeScript dan build produksi Next.js lulus dengan dependency lockfile repo.
- Route HTTP lokal diperiksa untuk konfigurasi kosong, permintaan rusak, dan origin yang berbeda.
- **Belum ada transaksi wallet end-to-end yang dilakukan.** Permintaan langsung ke API Garden dari lingkungan pengembangan ini mendapat HTTP 403 dari gerbang akses, dan App ID deployment milikmu belum tersedia. Karena itu ketersediaan quote, kontrak aktif, likuiditas, settlement otomatis dan refund langsung perlu diverifikasi di deployment yang sudah dikonfigurasi.

Implementasi memakai flow API Garden dengan preimage manager: `secret_hash` tidak dikirim saat create agar Garden menangani settlement tujuan. Private key wallet tidak dikirim ke server CAREL. Riwayat lokal hanya menyimpan ID order, alamat publik, waktu, dan hash transaksi funding.

## Referensi

- [Garden API quickstart](https://garden.finance/docs/api-reference/quickstart)
- [Supported chains and assets](https://garden.finance/docs/developers/supported-chains)
- [Preimage manager / 1-click API](https://garden.finance/docs/developers/api/1click)
- [Order lifecycle](https://garden.finance/docs/developers/core/order-lifecycle)
- [Starknet contract interface](https://garden.finance/docs/contracts/starknet)

