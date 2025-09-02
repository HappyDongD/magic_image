// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri::Emitter;

#[tauri::command]
fn read_local_file(path: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Read;
    use base64::{Engine as _, engine::general_purpose};
    
    let mut file = File::open(&path)
        .map_err(|e| format!("无法打开文件: {}", e))?;
    
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    // 检查文件类型
    let mime_type = match path.to_lowercase().as_str() {
        p if p.ends_with(".png") => "image/png",
        p if p.ends_with(".jpg") || p.ends_with(".jpeg") => "image/jpeg",
        p if p.ends_with(".gif") => "image/gif",
        p if p.ends_with(".webp") => "image/webp",
        _ => "application/octet-stream",
    };
    
    let base64 = general_purpose::STANDARD.encode(&buffer);
    Ok(format!("data:{};base64,{}", mime_type, base64))
}

#[tauri::command]
fn get_download_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = app_handle
        .path()
        .download_dir()
        .map_err(|e| format!("无法获取下载目录: {}", e))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn download_file(url: String, filename: String, dir: Option<String>, app_handle: tauri::AppHandle) -> Result<String, String> {
    let save_dir = match dir {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => app_handle
            .path()
            .download_dir()
            .map_err(|e| format!("无法获取下载目录: {}", e))?,
    };

    let mut save_path = save_dir;
    save_path.push(filename);

    if let Some(parent) = save_path.parent() {
        if let Err(e) = create_dir_all(parent) {
            return Err(format!("创建目录失败: {}", e));
        }
    }

    // HTTP 客户端，设置 UA/Referer 与超时
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
        .build()
        .map_err(|e| format!("构建HTTP客户端失败: {}", e))?;

    // 重试 3 次
    let mut last_err: Option<String> = None;
    for attempt in 0..3 {
        let req = client
            .get(&url)
            .header("Referer", "http://localhost")
            .build()
            .map_err(|e| format!("构建请求失败: {}", e))?;

        match client.execute(req) {
            Ok(mut resp) => {
                if !resp.status().is_success() {
                    last_err = Some(format!("HTTP {}", resp.status()));
                    continue;
                }

                let total = resp
                    .headers()
                    .get(reqwest::header::CONTENT_LENGTH)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                let mut file = match File::create(&save_path) {
                    Ok(f) => f,
                    Err(e) => return Err(format!("创建文件失败: {}", e)),
                };

                let mut downloaded: u64 = 0;
                let mut buffer = [0u8; 64 * 1024];
                let start = Instant::now();
                loop {
                    let n = match resp.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(e) => {
                            last_err = Some(format!("读取流失败: {}", e));
                            break;
                        }
                    };
                    if let Err(e) = file.write_all(&buffer[..n]) {
                        return Err(format!("写入文件失败: {}", e));
                    }
                    downloaded += n as u64;

                    // 上报进度
                    let elapsed = start.elapsed().as_secs_f64();
                    let speed = if elapsed > 0.0 { (downloaded as f64 / elapsed) as u64 } else { 0 };
                    let _ = app_handle.emit(
                        "download:progress",
                        serde_json::json!({
                            "url": url,
                            "path": save_path.to_string_lossy(),
                            "downloaded": downloaded,
                            "total": total,
                            "bytesPerSec": speed,
                        }),
                    );
                }

                // 成功
                return Ok(save_path.to_string_lossy().to_string());
            }
            Err(e) => {
                last_err = Some(format!("请求失败: {}", e));
                std::thread::sleep(Duration::from_millis(300 * (attempt + 1) as u64));
                continue;
            }
        }
    }

    Err(last_err.unwrap_or_else(|| "下载失败".to_string()))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_local_file, get_download_dir, download_file])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                println!("应用正在开发模式下运行");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行Tauri应用程序时出错");
}
