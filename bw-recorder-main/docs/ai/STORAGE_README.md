# Konfigurasi Penyimpanan Audio

Aplikasi ini sekarang mendukung dua opsi penyimpanan untuk file audio yang diunggah:

## Opsi Penyimpanan

### 1. Penyimpanan Filesystem (Default)

File disimpan secara lokal di direktori `uploads/audio/`.

### 2. Penyimpanan Objek MinIO

File disimpan di server penyimpanan objek MinIO.

## Konfigurasi

### Variabel Environment

Tambahkan variabel ini ke file `.env` Anda:

```env
# Konfigurasi Penyimpanan
# Opsi: "filesystem" atau "minio"
STORAGE_TYPE="filesystem"

# Konfigurasi MinIO (hanya diperlukan jika STORAGE_TYPE="minio")
MINIO_ENDPOINT="http://your-minio-server:9000"
MINIO_USER="your-access-key"
MINIO_PASSWORD="your-secret-key"
MINIO_BUCKET="your-bucket-name"
```

### Mengganti Jenis Penyimpanan

1. **Untuk menggunakan penyimpanan filesystem (default):**

   ```env
   STORAGE_TYPE="filesystem"
   ```

   - File akan disimpan ke direktori `uploads/audio/`
   - Tidak perlu konfigurasi tambahan

2. **Untuk menggunakan penyimpanan MinIO:**

   ```env
   STORAGE_TYPE="minio"
   MINIO_ENDPOINT="http://10.252.178.141:9000"
   MINIO_USER="sinopsis"
   MINIO_PASSWORD="sinopsis231"
   MINIO_BUCKET="sinopsis-raw-audio"
   ```

   - File akan diunggah ke server MinIO Anda
   - Bucket akan dibuat secara otomatis jika belum ada

## Fitur

### Fallback Otomatis

Jika MinIO dikonfigurasi tetapi koneksi gagal, sistem akan secara otomatis beralih ke penyimpanan filesystem dengan pesan peringatan.

### Respons Upload

Respons upload sekarang menyertakan informasi tambahan tentang jenis penyimpanan:

```json
{
  "success": true,
  "message": "File audio berhasil diunggah ke penyimpanan minio",
  "fileName": "recording_20250915_143022.webm",
  "filePath": "https://your-minio-server/bucket/recording_20250915_143022.webm",
  "url": "https://your-minio-server/bucket/recording_20250915_143022.webm",
  "etag": "abc123...",
  "size": 12345,
  "type": "audio/webm",
  "uploadedAt": "2025-09-15T14:30:22.000Z",
  "storageType": "minio"
}
```

### Fitur MinIO

- **Pembuatan Bucket Otomatis**: Bucket yang ditentukan dalam `MINIO_BUCKET` akan dibuat secara otomatis jika belum ada
- **URL Presigned**: File dapat diakses melalui URL presigned yang kedaluwarsa setelah 7 hari
- **Metadata**: Metadata upload menyertakan ukuran file asli dan timestamp upload
- **Penanganan Kesalahan**: Penanganan kesalahan komprehensif dengan fallback ke penyimpanan filesystem

## Testing

1. **Test penyimpanan filesystem:**
   - Set `STORAGE_TYPE="filesystem"` di `.env`
   - Upload file audio
   - Periksa direktori `uploads/audio/` untuk file tersebut

2. **Test penyimpanan MinIO:**
   - Set `STORAGE_TYPE="minio"` di `.env`
   - Konfigurasi kredensial MinIO
   - Upload file audio
   - Periksa server MinIO Anda untuk file yang diunggah

## Troubleshooting

### Masalah Koneksi MinIO

- Verifikasi URL `MINIO_ENDPOINT` benar dan dapat diakses
- Pastikan server MinIO berjalan
- Periksa bahwa `MINIO_USER` dan `MINIO_PASSWORD` benar
- Verifikasi konektivitas jaringan ke server MinIO

### Masalah Bucket

- Aplikasi akan mencoba membuat bucket secara otomatis
- Pastikan user MinIO memiliki izin untuk membuat bucket
- Periksa bahwa nama bucket mengikuti konvensi penamaan MinIO

### Perilaku Fallback

Jika MinIO dikonfigurasi tetapi gagal, Anda akan melihat peringatan ini di log:

```
Konfigurasi MinIO tidak lengkap, beralih ke penyimpanan filesystem
```

Aplikasi akan terus bekerja menggunakan penyimpanan filesystem.
