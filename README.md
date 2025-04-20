# Discord Auto-Forwarder v0.1.0

Discord Auto-Forwarder adalah aplikasi untuk meneruskan pesan dari channel Discord ke webhook Discord lainnya secara otomatis.

## Fitur

- Menghubungkan ke akun Discord menggunakan token pengguna
- Meneruskan pesan dari channel tertentu ke webhook Discord lainnya
- Mendukung banyak server dan channel sekaligus
- Antarmuka web yang mudah digunakan untuk mengelola koneksi
- Log aktivitas untuk memantau pesan yang diteruskan

## Cara Menggunakan

### 1. Instalasi

```
git clone https://github.com/username/discord-autoforwarder-v2.git
cd discord-autoforwarder-v2
npm install
```

### 2. Konfigurasi

Buat file `.env` di direktori root aplikasi:

```
PORT=3000
```

Anda dapat mengganti port jika diperlukan.

### 3. Membuat Direktori Data

Pastikan direktori untuk database SQLite tersedia:

```
mkdir -p data
```

### 4. Menjalankan Aplikasi

```
npm start
```

Untuk pengembangan (dengan auto-restart saat ada perubahan):

```
npm run dev
```

Aplikasi akan berjalan di `http://localhost:3000` (atau port yang ditentukan di .env file).

### 5. Cara Menggunakan

#### Menambahkan Server Discord

1. Buka halaman **Servers**
2. Masukkan nama server (bisa bebas) dan token Discord Anda
3. Klik tombol **Add Server**
4. Setelah server ditambahkan, klik tombol **Connect** untuk menghubungkan

> **Catatan**: Menggunakan token user Discord mungkin melanggar ToS Discord. Gunakan dengan risiko Anda sendiri.

#### Mendapatkan Token Discord

1. Buka Discord di browser web
2. Tekan F12 untuk membuka Developer Tools
3. Pilih tab Network
4. Refresh halaman
5. Temukan request ke "discord.com"
6. Cari di Headers - Request Headers untuk "Authorization"

#### Menambahkan Channel untuk Diteruskan

1. Buka halaman **Channels**
2. Pilih server yang telah terhubung
3. Masukkan ID channel Discord yang ingin diteruskan
4. Masukkan URL webhook tujuan
5. Klik tombol **Add Channel**

#### Mendapatkan ID Channel Discord

1. Aktifkan Developer Mode di Discord (User Settings > Advanced > Developer Mode)
2. Klik kanan pada channel > Copy ID

#### Membuat Webhook Discord

1. Buka channel Discord tujuan
2. Buka pengaturan channel > Integrations > Webhooks
3. Buat webhook baru
4. Salin URL webhook

#### Mengaktifkan/Menonaktifkan Pengalihan

- Pada halaman **Channels**, gunakan tombol **Enable Forwarding** atau **Disable Forwarding** untuk mengontrol setiap channel

#### Memantau Aktivitas

- Buka halaman **Logs** untuk melihat riwayat pesan yang diteruskan
- Halaman **Dashboard** menampilkan ringkasan status sistem

## Menjalankan di Server RDP Windows

### Persiapan

1. Pastikan Node.js sudah terinstall di server RDP
2. Download/Clone repository ke server RDP
   ```
   git clone https://github.com/username/discord-autoforwarder-v2.git
   ```
   Atau upload folder aplikasi ke server RDP

### Menggunakan Batch Files (Cara Mudah)

Di dalam folder aplikasi, tersedia beberapa file batch (.bat) untuk memudahkan penggunaan:

1. **Instalasi Awal**: Double-click file `setup.bat`
   - File ini akan menginstall semua dependensi yang diperlukan
   - Menginstall PM2 secara global
   - Membuat folder data
   - Membuat file .env dengan konfigurasi default

2. **Menjalankan Aplikasi**: Double-click file `start-autoforwarder.bat`
   - Aplikasi akan berjalan sebagai service di background menggunakan PM2
   - Browser akan terbuka otomatis dengan alamat http://localhost:3000
   - Aplikasi akan tetap berjalan meskipun anda logout dari RDP

3. **Menghentikan Aplikasi**: Double-click file `stop-autoforwarder.bat`
   - Menghentikan aplikasi yang sedang berjalan

4. **Restart Aplikasi**: Double-click file `restart-autoforwarder.bat` 
   - Berguna jika aplikasi mengalami error atau perlu di-refresh

5. **Melihat Log**: Double-click file `view-logs.bat`
   - Menampilkan log aplikasi secara real-time
   - Tekan Ctrl+C untuk keluar dari tampilan log

### Memastikan Aplikasi Berjalan Setelah Reboot

Untuk memastikan aplikasi berjalan otomatis setelah server di-restart:

1. Buat shortcut file `start-autoforwarder.bat` 
2. Tekan `Win + R`, ketik `shell:startup` dan tekan Enter
3. Pindahkan shortcut ke folder Startup yang terbuka

### Troubleshooting

1. **Error "Port already in use"**: 
   - Jalankan `stop-autoforwarder.bat` terlebih dahulu
   - Atau ubah port di file `.env`

2. **PM2 tidak terinstall**: 
   - Jalankan `npm install -g pm2` secara manual

3. **Aplikasi crash/tidak berjalan**:
   - Periksa log dengan menjalankan `view-logs.bat`
   - Restart aplikasi dengan `restart-autoforwarder.bat`

## Keamanan

- **PENTING**: Token Discord Anda memberi akses penuh ke akun. Jangan bagikan dengan siapa pun.
- Aplikasi ini menyimpan token dalam database lokal. Pastikan keamanan komputer Anda.
- Pastikan hanya Anda yang memiliki akses ke alamat web aplikasi ini.

## Pemecahan Masalah

- **Error "Invalid Discord token"**: Token Discord Anda tidak valid atau telah kedaluwarsa. Dapatkan token baru.
- **Error "Channel not found"**: ID channel tidak valid atau akun tidak memiliki akses ke channel tersebut.
- **Error "Discord client not found"**: Server belum terhubung. Klik Connect terlebih dahulu.
- **Pesan tidak diteruskan**: Pastikan channel telah diaktifkan untuk pengalihan dan webhook URL valid.
- **Error saat startup**: Pastikan file database.sqlite dapat dibuat dan diakses. Cek folder permissions.

## Teknologi

- Node.js
- Express
- SQLite
- discord.js-selfbot-v13
- EJS templating
- Bootstrap UI

## Kontak & Copyright

&copy; 2025 Benss | Discord: .naban

*Penggunaan aplikasi ini adalah tanggung jawab pengguna sepenuhnya. Pengembang tidak bertanggung jawab atas penyalahgunaan atau pelanggaran ToS Discord.* 