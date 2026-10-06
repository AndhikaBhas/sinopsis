use rusoto_core::Region;
use rusoto_s3::{S3Client, S3, GetObjectRequest, PutObjectRequest, StreamingBody};
use std::path::Path;
use log::{info, error};

pub async fn download_file(
    client: &S3Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("Downloading file: {} from bucket: {}", key, bucket);
    let get_req = GetObjectRequest {
        bucket: bucket.to_string(),
        key: key.to_string(),
        ..Default::default()
    };

    let result = client.get_object(get_req).await?;
    if let Some(body) = result.body {
        let mut file = tokio::fs::File::create(local_path).await?;
        let mut stream = body.into_async_read();
        tokio::io::copy(&mut stream, &mut file).await?;
        info!("Downloaded file: {} to {:?}", key, local_path);
        Ok(())
    } else {
        error!("No body in response for file: {}", key);
        Err("No body in response".into())
    }
}

pub async fn upload_file(
    client: &S3Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("Uploading file: {:?} to bucket: {} as {}", local_path, bucket, key);
    let file = tokio::fs::read(local_path).await?;
    let body = StreamingBody::from(file);

    let put_req = PutObjectRequest {
        bucket: bucket.to_string(),
        key: key.to_string(),
        body: Some(body),
        ..Default::default()
    };

    client.put_object(put_req).await?;
    info!("Uploaded file: {} to bucket: {}", key, bucket);
    Ok(())
}

pub async fn upload_data_from_memory(
    client: &S3Client,
    bucket: &str,
    key: &str,
    data: Vec<u8>,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("Uploading {} bytes from memory to bucket: {} as {}", data.len(), bucket, key);
    let body = StreamingBody::from(data);

    let put_req = PutObjectRequest {
        bucket: bucket.to_string(),
        key: key.to_string(),
        body: Some(body),
        content_type: Some("audio/webm".to_string()),
        ..Default::default()
    };

    client.put_object(put_req).await?;
    info!("Successfully uploaded data from memory to bucket: {} as {}", bucket, key);
    Ok(())
}

pub fn create_s3_client(endpoint: &str, access_key: &str, secret_key: &str) -> S3Client {
    let region = Region::Custom {
        name: "minio".to_string(),
        endpoint: endpoint.to_string(),
    };
    S3Client::new_with(
        rusoto_core::request::HttpClient::new().unwrap(),
        rusoto_credential::StaticProvider::new_minimal(access_key.to_string(), secret_key.to_string()),
        region,
    )
}