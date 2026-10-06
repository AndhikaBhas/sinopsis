use tokio_postgres::NoTls;
use std::error::Error;
use log::info;

#[derive(Debug)]
pub struct AudioChunk {
    pub nama_file_audio: String,
}

pub async fn get_audio_chunks(rapat_id: &str, db_url: &str) -> Result<Vec<AudioChunk>, Box<dyn Error>> {
    info!("Connecting to database for rapat_id: {}", rapat_id);
    let (client, connection) = tokio_postgres::connect(db_url, NoTls).await?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    let rapat_id_int: i32 = rapat_id.parse()?;
    let rows = client
        .query("SELECT nama_file_audio FROM rapat_chunk WHERE rapat_id = $1 ORDER BY \"urutan_chunk\"", &[&rapat_id_int])
        .await?;

    let chunks: Vec<AudioChunk> = rows.into_iter().map(|row| AudioChunk {
        nama_file_audio: row.get("nama_file_audio"),
    }).collect();

    info!("Found {} audio chunks for rapat_id: {}", chunks.len(), rapat_id);
    Ok(chunks)
}