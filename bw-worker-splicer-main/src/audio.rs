use std::path::Path;
use std::process::{Command, Stdio};
use log::{info, error, debug};
use tokio::io::AsyncReadExt;

pub fn init_ffmpeg() {
    // No initialization needed when using external ffmpeg
}

pub async fn join_audio_chunks_in_memory(
    s3_client: &rusoto_s3::S3Client,
    bucket: &str,
    chunk_keys: &[String]
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    info!("Processing {} audio chunks in memory", chunk_keys.len());

    // If only one chunk, download and return directly (no conversion needed)
    if chunk_keys.len() == 1 {
        info!("Single chunk detected, downloading directly without conversion");
        return download_chunk_to_memory(s3_client, bucket, &chunk_keys[0]).await;
    }

    // Download all chunks to memory
    info!("Downloading all chunks to memory");
    let mut audio_chunks = Vec::new();
    for (i, chunk_key) in chunk_keys.iter().enumerate() {
        debug!("Downloading chunk {}/{}: {}", i + 1, chunk_keys.len(), chunk_key);
        let chunk_data = download_chunk_to_memory(s3_client, bucket, chunk_key).await?;
        let chunk_size = chunk_data.len();
        audio_chunks.push(chunk_data);
        debug!("Downloaded chunk {} ({} bytes)", i + 1, chunk_size);
    }
    info!("All chunks downloaded to memory successfully");

    // Process chunks using FFmpeg with temporary files
    join_chunks_with_ffmpeg_tempfiles(&audio_chunks).await
}

async fn download_chunk_to_memory(
    s3_client: &rusoto_s3::S3Client,
    bucket: &str,
    key: &str
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    use rusoto_s3::{GetObjectRequest, S3};
    
    let request = GetObjectRequest {
        bucket: bucket.to_string(),
        key: key.to_string(),
        ..Default::default()
    };

    let response = s3_client.get_object(request).await?;
    let mut data = Vec::new();
    
    if let Some(body) = response.body {
        let mut stream = body.into_async_read();
        stream.read_to_end(&mut data).await?;
    }
    
    Ok(data)
}

async fn join_chunks_with_ffmpeg_tempfiles(chunks: &[Vec<u8>]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    info!("Joining {} chunks using FFmpeg with temporary files", chunks.len());

    // Create temporary directory for audio files
    let temp_dir = tempfile::tempdir()?;
    let temp_dir_path = temp_dir.path();
    info!("Created temporary directory: {:?}", temp_dir_path);

    // Write chunks to temporary files
    let mut temp_files = Vec::new();
    for (i, chunk_data) in chunks.iter().enumerate() {
        let temp_file_path = temp_dir_path.join(format!("chunk_{}.webm", i));
        tokio::fs::write(&temp_file_path, chunk_data).await?;
        temp_files.push(temp_file_path);
        debug!("Wrote chunk {} to temporary file ({} bytes)", i, chunk_data.len());
    }

    // Create concat file content
    let concat_content = temp_files
        .iter()
        .map(|path| format!("file '{}'", path.display()))
        .collect::<Vec<_>>()
        .join("\n");

    let concat_file = temp_dir_path.join("concat.txt");
    tokio::fs::write(&concat_file, concat_content).await?;
    debug!("Created concat file: {:?}", concat_file);

    // Run FFmpeg
    info!("Starting FFmpeg process with temporary files");
    let output = Command::new("ffmpeg")
        .args(&[
            "-y",
            "-f", "concat",
            "-safe", "0", 
            "-i", concat_file.to_str().unwrap(),
            "-c:a", "libvorbis",
            "-ar", "16000",  // Strictly enforce 16000 Hz sample rate
            "-ac", "1",      // Force mono channel
            "-avoid_negative_ts", "make_zero",
            "-f", "webm",
            "pipe:1"  // Write output to stdout
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()?;

    if output.status.success() {
        info!("Successfully joined {} chunks using temporary files ({} bytes output)", chunks.len(), output.stdout.len());
        Ok(output.stdout)
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        error!("FFmpeg failed: {}", error_msg);
        Err(format!("FFmpeg failed: {}", error_msg).into())
    }
}

// Keep the old function for backward compatibility, but mark as deprecated
#[deprecated(note = "Use join_audio_chunks_in_memory instead for in-memory processing")]
pub async fn join_audio_files(input_files: &[String], output_file: &Path) -> Result<(), Box<dyn std::error::Error>> {
    info!("Joining {} audio files into {:?}", input_files.len(), output_file);

    // If only one audio chunk, just copy/rename the file without conversion
    if input_files.len() == 1 {
        let source_file = Path::new(&input_files[0]);
        info!("Only one audio chunk found, copying {} to {:?}", input_files[0], output_file);
        
        tokio::fs::copy(source_file, output_file).await?;
        info!("Successfully copied single audio file without conversion");
        return Ok(());
    }

    // Create a concat file for ffmpeg
    let concat_file = output_file.with_extension("txt");
    let mut concat_content = String::new();
    for file in input_files {
        let file_path = Path::new(file);
        let abs_path = std::fs::canonicalize(file_path)?;
        concat_content.push_str(&format!("file '{}'\n", abs_path.display()));
    }
    tokio::fs::write(&concat_file, concat_content).await?;

    // Use vorbis codec only (opus unable to save to 16000hz properly)
    let result = try_join_with_codec(&concat_file, output_file, "libvorbis").await;
    
    // Clean up concat file
    if concat_file.exists() {
        tokio::fs::remove_file(concat_file).await?;
    }
    
    match result {
        Ok(()) => {
            info!("Successfully joined audio files with vorbis codec");
            Ok(())
        }
        Err(e) => {
            error!("Vorbis codec failed: {}", e);
            Err(e)
        }
    }
}

async fn try_join_with_codec(concat_file: &Path, output_file: &Path, codec: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(&[
        "-y", // Overwrite output file if it exists
        "-f", "concat", 
        "-safe", "0", 
        "-i", concat_file.to_str().unwrap(),
        "-c:a", codec,
        "-ar", "16000", // Strictly enforce 16000 Hz sample rate
        "-ac", "1", // Force mono channel to ensure compatibility
        // "-b:a", "128k",
        "-avoid_negative_ts", "make_zero", // Fix timestamp issues
        output_file.to_str().unwrap()
    ]);

    info!("Running ffmpeg command with {} codec: {:?}", codec, cmd);
    let output = cmd.output()?;

    if output.status.success() {
        Ok(())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        error!("ffmpeg failed with {} codec: {}", codec, error_msg);
        Err(format!("ffmpeg failed with {}: {}", codec, error_msg).into())
    }
}