# Selamat Datang di Sinopsis!

Template modern dan siap produksi untuk membangun aplikasi React full-stack menggunakan React Router dengan fokus pada pemrosesan audio dan transkripsi.

[![Buka di StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Fitur

- 🚀 Rendering sisi server
- ⚡️ Hot Module Replacement (HMR)
- 📦 Bundling dan optimasi aset
- 🔄 Pemuatan data dan mutasi
- 🔒 TypeScript secara default
- 🎉 TailwindCSS untuk styling
- 🎙️ Perekaman dan pemrosesan audio real-time
- 📝 Transkripsi otomatis dengan Whisper
- 👥 Diarisasi speaker untuk identifikasi pembicara
- 📋 Ringkasan otomatis dan ekstraksi item tindakan
- 📖 [Dokumentasi React Router](https://reactrouter.com/)

## Memulai

### Instalasi

Install dependensi:

```bash
npm install
```

### Pengembangan

Jalankan server pengembangan dengan HMR:

```bash
npm run dev
```

Aplikasi akan tersedia di `http://localhost:5173`.

## Build untuk Produksi

Buat build produksi:

```bash
npm run build
```

## Deployment

### Deployment Docker

Untuk build dan menjalankan menggunakan Docker:

```bash
docker build -t sinopsis-app .

# Jalankan container
docker run -p 3000:3000 sinopsis-app
```

Aplikasi yang dikontainerisasi dapat di-deploy ke platform mana pun yang mendukung Docker, termasuk:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### Deployment DIY

Jika Anda familiar dengan deployment aplikasi Node, server aplikasi bawaan sudah siap produksi.

Pastikan untuk men-deploy output dari `npm run build`

```
├── package.json
├── package-lock.json (atau pnpm-lock.yaml, atau bun.lockb)
├── build/
│   ├── client/    # Aset statis
│   └── server/    # Kode sisi server
```

## Styling

Template ini sudah dilengkapi dengan [Tailwind CSS](https://tailwindcss.com/) yang telah dikonfigurasi untuk pengalaman awal yang sederhana. Anda dapat menggunakan framework CSS apa pun yang Anda sukai.

## Audio Recording Configuration

For optimal audio recording on different systems, especially Debian 12:

### Quick Setup for Debian 12

Add these environment variables to your `.env` file:

```bash
# Audio format preference (auto-detection recommended for Linux)
VITE_PREFERRED_AUDIO_FORMAT=auto
VITE_ENHANCED_AUDIO_PROCESSING=true
VITE_AUDIO_QUALITY=medium
```

### Common Issues and Solutions

- **"MP4 file may not have proper ftyp header"** → Set `VITE_PREFERRED_AUDIO_FORMAT=webm` or `auto`
- **"WebM file may not have proper EBML header"** → Set `VITE_PREFERRED_AUDIO_FORMAT=mp4` (less common now)
- **Audio clipping or echo** → Enable `VITE_ENHANCED_AUDIO_PROCESSING=true` and use `VITE_AUDIO_QUALITY=medium`
- **Poor performance** → Use `VITE_AUDIO_QUALITY=low` on resource-constrained systems
- **Unplayable audio files** → Enable `VITE_TEST_AUDIO_HEADERS=true` for validation

### Configuration Test

Run the audio configuration test script:

```bash
./scripts/test-audio-config.sh
```

This will analyze your system and provide optimal configuration recommendations.

## Dokumentasi

Dokumentasi lengkap tersedia di folder `/docs`:

- 📋 [Alur Kerja Pemrosesan Audio](<./docs/ALUR\ PEMROSESAN\ AUDIO.md>) - Panduan lengkap alur kerja sistem
- 🏗️ **AI-Generated Documentation** - Lihat [`docs/ai/`](./docs/ai/) untuk dokumentasi yang dibuat oleh Copilot AI
- 📚 [Ringkasan Dokumentasi](./docs/README.md) - Indeks semua dokumentasi

### Struktur Dokumentasi

```
docs/
├── ai/                          # � Semua dokumentasi yang dibuat oleh AI
│   ├── README.md               # Panduan untuk dokumentasi AI
│   ├── ASYNC_UPLOAD_*.md       # Panduan upload async
│   ├── NGINX_*.md              # Konfigurasi Nginx
│   ├── AUTHENTICATION_*.md     # Implementasi autentikasi
│   └── ...                      # Dan file lainnya
├── ALUR PEMROSESAN AUDIO.md    # Dokumentasi manual
└── README.md                    # Ringkasan dokumentasi
```

**💡 Catatan**: Semua dokumentasi baru yang dibuat dengan bantuan Copilot AI harus ditempatkan di folder `docs/ai/`. Lihat [`docs/ai/README.md`](./docs/ai/README.md) untuk panduan lebih lanjut.

---

Dibangun dengan ❤️ menggunakan React Router untuk pemrosesan audio dan transkripsi Indonesia.
