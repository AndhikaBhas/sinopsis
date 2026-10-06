# Konfigurasi Perekaman Audio

Aplikasi ini mendukung fungsionalitas auto-stop yang dapat dikonfigurasi dan perekaman chunked untuk rekaman audio melalui variabel environment.

## Variabel Environment

Tambahkan variabel ini ke file `.env` Anda untuk mengontrol perilaku perekaman:

### Konfigurasi Perekaman Dasar

### `VITE_MAX_RECORDING_DURATION_MINUTES`

- **Default**: `10`
- **Deskripsi**: Durasi perekaman maksimum dalam menit. Set ke `0` untuk perekaman tanpa batas.
- **Contoh**: `VITE_MAX_RECORDING_DURATION_MINUTES="15"` (maksimal 15 menit)

### `VITE_SILENCE_TIMEOUT_SECONDS`

- **Default**: `5`
- **Deskripsi**: Otomatis hentikan perekaman setelah sekian detik hening. Set ke `0` untuk menonaktifkan deteksi keheningan.
- **Contoh**: `VITE_SILENCE_TIMEOUT_SECONDS="3"` (berhenti setelah 3 detik hening)

### `VITE_SILENCE_THRESHOLD`

- **Default**: `0.01`
- **Deskripsi**: Ambang batas amplitudo audio di bawah mana audio dianggap "hening" (0.01 = 1% amplitudo).
- **Contoh**: `VITE_SILENCE_THRESHOLD="0.005"` (lebih sensitif terhadap suara pelan)

### Konfigurasi Perekaman Chunked

### `VITE_CHUNKED_RECORDING_ENABLED`

- **Default**: `true`
- **Deskripsi**: Aktifkan mode perekaman chunked di mana rekaman otomatis dipecah menjadi chunk dan diunggah secara terpisah.
- **Contoh**: `VITE_CHUNKED_RECORDING_ENABLED="false"` (nonaktifkan perekaman chunked)

### `VITE_MIN_CHUNK_LENGTH_SECONDS`

- **Default**: `10`
- **Deskripsi**: Panjang chunk minimum dalam detik sebelum deteksi keheningan dapat memicu pemisahan chunk.
- **Contoh**: `VITE_MIN_CHUNK_LENGTH_SECONDS="15"` (perlu minimal 15 detik sebelum pemisahan chunk)

### `VITE_CHUNK_SILENCE_THRESHOLD_DBFS`

- **Default**: `-40`
- **Deskripsi**: Ambang batas deteksi keheningan dalam dBFS (desibel relatif terhadap skala penuh) untuk perekaman chunked.
- **Contoh**: `VITE_CHUNK_SILENCE_THRESHOLD_DBFS="-35"` (kurang sensitif terhadap suara pelan)

### `VITE_CHUNK_SILENCE_DURATION_SECONDS`

- **Default**: `2`
- **Deskripsi**: Durasi keheningan awal dalam detik yang diperlukan untuk memicu pemisahan chunk dan upload. Durasi ini akan berkurang seiring waktu berdasarkan interval yang ditentukan.
- **Contoh**: `VITE_CHUNK_SILENCE_DURATION_SECONDS="3"` (mulai dengan 3 detik keheningan)

### `VITE_CHUNK_SILENCE_DECREMENT_INTERVAL_SECONDS`

- **Default**: `1`
- **Deskripsi**: Interval dalam detik untuk mengurangi durasi keheningan sebesar 0.25 detik. Pengurangan dilakukan secara linear dan halus (bukan step diskrit), sehingga durasi keheningan berkurang secara kontinyu dengan minimum 0.5 detik.
- **Contoh**: `VITE_CHUNK_SILENCE_DECREMENT_INTERVAL_SECONDS="2"` (durasi keheningan berkurang 0.125 detik per detik)

## Contoh Konfigurasi

### Perekaman chunked standar dengan pemisahan cepat:

```env
VITE_CHUNKED_RECORDING_ENABLED="true"
VITE_MIN_CHUNK_LENGTH_SECONDS="10"
VITE_CHUNK_SILENCE_THRESHOLD_DBFS="-40"
VITE_CHUNK_SILENCE_DURATION_SECONDS="2"
VITE_CHUNK_SILENCE_DECREMENT_INTERVAL_SECONDS="1"
VITE_MAX_RECORDING_DURATION_MINUTES="0"
```

Dengan konfigurasi ini:

- Detik 0-9: Tidak ada deteksi keheningan (belum mencapai minimum 10 detik)
- Detik ke-10: Mulai deteksi keheningan, butuh 2.0s keheningan
- Detik ke-10.5: Butuh 1.875s keheningan (berkurang halus 0.125s)
- Detik ke-11: Butuh 1.75s keheningan (berkurang halus 0.25s)
- Detik ke-11.5: Butuh 1.625s keheningan (dan seterusnya secara linear)
- Detik ke-16+: Butuh 0.5s keheningan (minimum tercapai)
- **Pengurangan linear**: 0.25s per interval = 0.125s per detik (halus, bukan step)
- **Setiap chunk baru**: Proses reset dan dimulai lagi dari awal

### Perekaman bentuk panjang dengan chunking santai:

```env
VITE_CHUNKED_RECORDING_ENABLED="true"
VITE_MIN_CHUNK_LENGTH_SECONDS="30"
VITE_CHUNK_SILENCE_THRESHOLD_DBFS="-35"
VITE_CHUNK_SILENCE_DURATION_SECONDS="5"
VITE_CHUNK_SILENCE_DECREMENT_INTERVAL_SECONDS="2"
VITE_MAX_RECORDING_DURATION_MINUTES="60"
```

Dengan konfigurasi ini:

- Mulai dengan durasi keheningan 5 detik
- Setiap 2 detik berlalu, durasi keheningan berkurang 0.25 detik
- Lebih cocok untuk percakapan panjang yang membutuhkan waktu pemisahan yang lebih fleksibel

### Mode perekaman tunggal tradisional:

```env
VITE_CHUNKED_RECORDING_ENABLED="false"
VITE_MAX_RECORDING_DURATION_MINUTES="10"
VITE_SILENCE_TIMEOUT_SECONDS="5"
VITE_SILENCE_THRESHOLD="0.01"
```

## Cara Kerja

### Mode Perekaman Chunked

Ketika `VITE_CHUNKED_RECORDING_ENABLED="true"`:

1. **Panjang Chunk Minimum**: Perekaman harus berlanjut setidaknya selama `VITE_MIN_CHUNK_LENGTH_SECONDS` sebelum pemisahan chunk dapat terjadi.

2. **Deteksi Keheningan**: Sistem memantau level audio menggunakan kalkulasi dBFS. Setelah mencapai panjang minimum chunk, ketika audio turun di bawah `VITE_CHUNK_SILENCE_THRESHOLD_DBFS` selama durasi keheningan yang diperlukan, chunk saat ini diselesaikan dan diunggah. Durasi keheningan dimulai dari `VITE_CHUNK_SILENCE_DURATION_SECONDS` dan berkurang 0.25 detik setiap `VITE_CHUNK_SILENCE_DECREMENT_INTERVAL_SECONDS` detik setelah minimum chunk length tercapai, dengan minimum 0.5 detik.

3. **Restart Otomatis**: Setelah chunk diunggah, perekaman otomatis dimulai ulang untuk chunk berikutnya, berlanjut hingga dihentikan secara manual.

4. **Umpan Balik Visual**: Tombol perekaman menampilkan warna orange dan menunjukkan jumlah chunk serta durasi total.

### Mode Perekaman Tradisional

Ketika `VITE_CHUNKED_RECORDING_ENABLED="false"`:

1. **Durasi Maksimum**: Perekaman berhenti setelah `VITE_MAX_RECORDING_DURATION_MINUTES` jika diset > 0.

2. **Deteksi Keheningan**: Perekaman berhenti setelah `VITE_SILENCE_TIMEOUT_SECONDS` detik hening jika diaktifkan.

3. **Kontrol Manual**: Pengguna dapat menghentikan perekaman secara manual kapan saja.

## Detail Teknis

- **dBFS vs Amplitudo**: Perekaman chunked menggunakan dBFS (desibel relatif terhadap skala penuh) untuk deteksi keheningan yang lebih akurat, sementara mode tradisional menggunakan persentase amplitudo.
- **Auto-Upload**: Dalam mode chunked, setiap chunk otomatis diunggah ketika keheningan terdeteksi, menyediakan kemampuan pemrosesan real-time.
- **Manajemen Sumber Daya**: Stream audio dan analisis berlanjut di antara chunk untuk memberikan pengalaman perekaman yang mulus.

## Catatan

- Perubahan pada variabel environment ini memerlukan restart server agar dapat berlaku.
- Semua variabel dengan prefiks `VITE_` terekspos ke kode sisi klien.
- Perekaman chunked ideal untuk percakapan panjang atau wawancara di mana Anda ingin pemrosesan real-time dari segmen ucapan.
