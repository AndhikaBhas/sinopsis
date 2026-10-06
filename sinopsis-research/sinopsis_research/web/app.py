"""Antarmuka web MVP (Flask): Unggah -> Proses -> Beri nama pembicara -> Hasil.

Jalankan:
    .venv/bin/python scripts/web.py            # http://127.0.0.1:5000

Hanya mendengarkan di localhost (on-premise). Rapat diproses satu per satu
oleh satu worker thread karena pemrosesan memakai seluruh CPU.
"""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from flask import Flask, abort, flash, redirect, render_template, request, send_from_directory, url_for

from ..app.pipeline import AUDIO_EXTENSIONS, STEPS, AppConfig, Job, NotulensiPipeline, create_job, list_jobs

DOWNLOADS = {
    "risalah.docx": "Risalah (Word)",
    "risalah.md": "Risalah (Markdown)",
    "notulensi.json": "Notulensi terstruktur (JSON)",
    "transkrip.txt": "Transkrip berlabel",
    "diarization.rttm": "Garis waktu pembicara (RTTM)",
}
ACTIVE = {"antri", "proses", "meringkas"}


def create_app(config: AppConfig = None) -> Flask:
    config = config or AppConfig.load()
    config.hasil_dir.mkdir(parents=True, exist_ok=True)
    pipeline = NotulensiPipeline(config)
    worker = ThreadPoolExecutor(max_workers=1)

    app = Flask(__name__)
    app.secret_key = "sinopsis-research-lokal"
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024**3  # 2 GB

    # Job yang terputus karena server dimatikan ditandai gagal agar bisa diproses ulang.
    for meta in list_jobs(config.hasil_dir):
        if meta.get("status") in ACTIVE:
            Job(config.hasil_dir / meta["id"]).update(status="gagal", error="Server dimulai ulang saat proses berjalan.")

    def get_job(job_id: str) -> Job:
        job = Job(config.hasil_dir / job_id)
        if "/" in job_id or ".." in job_id or not job.meta_path.exists():
            abort(404)
        return job

    @app.get("/")
    def index():
        return render_template("index.html", jobs=list_jobs(config.hasil_dir), extensions=sorted(AUDIO_EXTENSIONS))

    @app.post("/proses")
    def proses():
        upload = request.files.get("audio")
        if not upload or not upload.filename:
            flash("Pilih berkas audio terlebih dahulu.")
            return redirect(url_for("index"))
        try:
            job = create_job(
                config.hasil_dir,
                upload.filename,
                judul=request.form.get("judul", ""),
                tanggal=request.form.get("tanggal", ""),
                tempat=request.form.get("tempat", ""),
                mulai=request.form.get("mulai", ""),
            )
        except ValueError as e:
            flash(str(e))
            return redirect(url_for("index"))
        upload.save(job.audio_path)
        worker.submit(pipeline.analyze, job)
        return redirect(url_for("rapat", job_id=job.id))

    @app.get("/rapat/<job_id>")
    def rapat(job_id):
        job = get_job(job_id)
        meta = job.read()
        files = {name: label for name, label in DOWNLOADS.items() if (job.dir / name).exists()}
        risalah_md = (job.dir / "risalah.md").read_text() if (job.dir / "risalah.md").exists() else ""
        return render_template(
            "rapat.html",
            meta=meta,
            steps=[(key, meta["steps"][key]) for key, _ in STEPS],
            refresh=meta["status"] in ACTIVE,
            files=files,
            risalah_md=risalah_md,
        )

    @app.post("/rapat/<job_id>/nama")
    def simpan_nama(job_id):
        job = get_job(job_id)
        meta = job.read()
        if meta["status"] not in {"menunggu_nama", "selesai", "gagal"}:
            abort(409)
        names = {label: request.form.get(f"nama_{label}", "") for label in meta["speakers"]}
        job.update(status="antri")
        worker.submit(pipeline.finalize, job, names)
        return redirect(url_for("rapat", job_id=job.id))

    @app.post("/rapat/<job_id>/ulang")
    def proses_ulang(job_id):
        job = get_job(job_id)
        if job.read()["status"] in ACTIVE:
            abort(409)
        job.update(status="antri", error=None)
        worker.submit(pipeline.analyze, job)
        return redirect(url_for("rapat", job_id=job.id))

    @app.get("/rapat/<job_id>/berkas/<path:name>")
    def berkas(job_id, name):
        job = get_job(job_id)
        allowed = set(DOWNLOADS) | {job.read()["audio"]}
        if name.startswith("contoh/") and name.endswith(".wav") and "/" not in name[len("contoh/"):]:
            allowed.add(name)
        if name not in allowed or not (job.dir / name).exists():
            abort(404)
        return send_from_directory(job.dir, name, as_attachment=name in DOWNLOADS)

    @app.template_filter("menit")
    def menit(seconds):
        seconds = int(seconds or 0)
        return f"{seconds // 60}:{seconds % 60:02d}"

    return app
