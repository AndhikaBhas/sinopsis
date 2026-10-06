# Dokumentasi Sinopsis

Folder ini berisi dokumentasi lengkap untuk sistem pemrosesan audio Sinopsis.

## Ringkasan Dokumen

### 📋 [Alur Kerja Pemrosesan Audio](./audio-processing-workflow.md)

**Dokumentasi alur kerja utama** yang menjelaskan proses lengkap dari perekaman audio hingga ringkasan akhir.

**Isi:**

- Deskripsi alur kerja langkah demi langkah
- Diagram mermaid visual dari alur proses
- Penjelasan rinci setiap tahap pemrosesan
- Pertimbangan kinerja dan penanganan kesalahan
- Rencana peningkatan di masa depan

**Diagram Utama:**

- Diagram alur kerja lengkap
- Diagram sekuens untuk pemrosesan real-time
- Aliran data dan hubungan penyimpanan

### 🏗️ [Arsitektur Teknis](./technical-architecture.md)

**Spesifikasi implementasi teknis** yang rinci dan arsitektur sistem.

**Isi:**

- Gambaran umum arsitektur sistem
- Detail pipeline pemrosesan
- Skema database dan model data
- Spesifikasi endpoint API
- Desain sistem antrian
- Manajemen konfigurasi

**Diagram Utama:**

- Lapisan arsitektur sistem
- Mesin state pemrosesan
- Diagram hubungan entitas
- Sistem manajemen antrian

## Referensi Cepat

### Langkah-langkah Alur Kerja

1. **Rekam Audio dalam Potongan** → Pengambilan audio real-time
2. **Normalisasi Volume & Sample Rate** → Pra-pemrosesan audio
3. **Transkripsi Setiap Potongan** → Transkripsi potongan individual
4. **Gabungkan Potongan Audio** → Perakitan audio pasca-rapat
5. **Gabungkan Transkripsi** → Pembuatan transkrip lengkap
6. **Diarisasi** → Identifikasi pembicara
7. **Gabungkan Hasil** → Transkrip dengan atribusi pembicara
8. **Ringkasan** → Analisis akhir dan wawasan

### Komponen Inti

- **Frontend**: UI React dengan perekaman audio real-time
- **Lapisan API**: REST API dan WebSocket untuk komunikasi real-time
- **Pemrosesan**: Pipeline pemrosesan audio berbasis antrian
- **Penyimpanan**: Database dan penyimpanan file dengan dukungan CDN
- **Layanan Eksternal**: Integrasi Speech-to-Text dan LLM

### Aliran Data

```
Perekaman Audio → Pemrosesan Potongan → Transkripsi Real-time →
Perakitan Audio Lengkap → Transkripsi Akhir → Diarisasi Pembicara →
Hasil Gabungan → Ringkasan AI → Laporan Akhir
```

## Catatan Implementasi

### Teknologi Utama

- **Pemrosesan Audio**: WebRTC, FFmpeg, normalisasi audio
- **Transkripsi**: Whisper, Google Speech-to-Text, Azure Speech
- **Diarisasi**: Algoritma clustering embedding pembicara
- **Ringkasan**: OpenAI GPT-4, Anthropic Claude
- **Sistem Antrian**: Redis/Bull untuk pemrosesan job
- **Database**: PostgreSQL dengan JSONB untuk metadata
- **Penyimpanan File**: Integrasi MinIO/S3 dengan CDN

### Target Kinerja

- **Latensi Real-time**: < 5 detik speech-to-text
- **Sesi Bersamaan**: 50+ perekaman simultan
- **Kualitas Pemrosesan**: > 95% akurasi transkripsi
- **Efisiensi Penyimpanan**: Audio terkompresi dengan preservasi kualitas

## Memulai

1. **Baca Alur Kerja**: Mulai dengan [Alur Kerja Pemrosesan Audio](./audio-processing-workflow.md)
2. **Pahami Arsitektur**: Tinjau [Arsitektur Teknis](./technical-architecture.md)
3. **Implementasi**: Gunakan spesifikasi API dan skema database
4. **Konfigurasi**: Lihat contoh konfigurasi dalam dokumen teknis

## Berkontribusi pada Dokumentasi

Saat memperbarui dokumen-dokumen ini:

- Jaga diagram mermaid tetap up to date dengan perubahan kode
- Perbarui spesifikasi API ketika endpoint berubah
- Pertahankan dokumentasi skema database
- Sertakan benchmark kinerja dan pertimbangan
- Dokumentasikan prosedur penanganan kesalahan dan pemulihan

## Sumber Daya Terkait

- **README Proyek**: `../README.md` - Gambaran umum dan setup proyek
- **Dokumentasi API**: Dihasilkan dari spesifikasi OpenAPI
- **Migrasi Database**: `../prisma/` - Perubahan skema database
- **Contoh Konfigurasi**: `../config/` - Konfigurasi lingkungan

---

_Terakhir diperbarui: 19 September 2025_
