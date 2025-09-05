// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod simple_database;

use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri::Emitter;
use sysinfo::System;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};

// 批量任务相关结构体定义
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BatchTaskConfig {
    pub model: String,
    pub model_type: String,
    pub concurrent_limit: i32,
    pub retry_attempts: i32,
    pub retry_delay: i32,
    pub auto_download: bool,
    pub aspect_ratio: String,
    pub size: String,
    pub quality: String,
    pub generate_count: Option<i32>,
    pub api_timeout_ms: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskItem {
    pub id: String,
    pub prompt: String,
    pub source_image: Option<String>,
    pub mask: Option<String>,
    pub priority: i32,
    pub status: String,
    pub attempt_count: i32,
    pub created_at: String,
    pub processed_at: Option<String>,
    pub error: Option<String>,
    pub debug_logs: Option<Vec<DebugLog>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskResult {
    pub id: String,
    pub task_item_id: String,
    pub image_url: String,
    pub local_path: Option<String>,
    pub downloaded: bool,
    pub created_at: String,
    pub duration_ms: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DebugLog {
    pub id: String,
    pub task_item_id: String,
    pub timestamp: String,
    pub r#type: String,
    pub data: serde_json::Value,
    pub duration: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BatchTask {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub status: String,
    pub progress: i32,
    pub total_items: i32,
    pub completed_items: i32,
    pub failed_items: i32,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub config: BatchTaskConfig,
    pub items: Vec<TaskItem>,
    pub results: Vec<TaskResult>,
    pub error: Option<String>,
}

#[tauri::command]
fn read_local_file(path: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Read;
    use base64::{Engine as _, engine::general_purpose};
    
    // 直接使用前端传递的路径，不进行额外的路径转换
    let file_path = PathBuf::from(&path);
    
    println!("尝试读取文件: {:?}", file_path);
    
    let mut file = File::open(&file_path)
        .map_err(|e| format!("无法打开文件: {} (路径: {:?})", e, file_path))?;
    
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    // 检查文件类型
    let mime_type = match file_path.to_string_lossy().to_lowercase().as_str() {
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
                            let _ = last_err.insert(format!("读取流失败: {}", e));
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

#[tauri::command]
fn get_machine_id() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    // 收集多维度硬件信息
    let hostname = System::host_name().unwrap_or_default();
    let os_version = System::long_os_version().unwrap_or_default();
    let cpu_brand = sys.cpus().get(0).map(|c| c.brand().to_string()).unwrap_or_default();
    let cpu_freq = sys.cpus().get(0).map(|c| c.frequency().to_string()).unwrap_or_default();
    let total_mem = sys.total_memory().to_string();
    // 为兼容性移除磁盘信息，避免不同平台 API 差异
    let seed = format!("{}|{}|{}|{}|{}", hostname, os_version, cpu_brand, cpu_freq, total_mem);
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    let hash = hasher.finalize();
    // 取前16个十六进制字符
    let id = format!("{:x}", hash)[..16].to_string();
    Ok(id)
}

// SQLite 数据库命令
#[tauri::command]
async fn get_batch_tasks(app_handle: tauri::AppHandle) -> Result<Vec<BatchTask>, String> {
    // 初始化数据库
    simple_database::SimpleDatabase::init_db(&app_handle).await?;
    
    simple_database::SimpleDatabase::get_all_batch_tasks(&app_handle)
        .await
        .map_err(|e| format!("获取任务失败: {}", e))
}

#[tauri::command]
async fn save_batch_task(app_handle: tauri::AppHandle, task: BatchTask) -> Result<(), String> {
    // 初始化数据库
    simple_database::SimpleDatabase::init_db(&app_handle).await?;
    
    simple_database::SimpleDatabase::save_batch_task(&app_handle, &task)
        .await
        .map_err(|e| format!("保存任务失败: {}", e))
}

#[tauri::command]
async fn delete_batch_task(app_handle: tauri::AppHandle, task_id: String) -> Result<(), String> {
    // 初始化数据库
    simple_database::SimpleDatabase::init_db(&app_handle).await?;
    
    simple_database::SimpleDatabase::delete_batch_task(&app_handle, &task_id)
        .await
        .map_err(|e| format!("删除任务失败: {}", e))
}

#[tauri::command]
async fn clear_batch_tasks(app_handle: tauri::AppHandle) -> Result<(), String> {
    // 初始化数据库
    simple_database::SimpleDatabase::init_db(&app_handle).await?;
    
    simple_database::SimpleDatabase::clear_batch_tasks(&app_handle)
        .await
        .map_err(|e| format!("清空任务失败: {}", e))
}

#[tauri::command]
async fn get_task_count(app_handle: tauri::AppHandle) -> Result<i64, String> {
    // 初始化数据库
    simple_database::SimpleDatabase::init_db(&app_handle).await?;
    
    simple_database::SimpleDatabase::get_task_count(&app_handle)
        .await
        .map_err(|e| format!("获取任务数量失败: {}", e))
}

#[tauri::command]
async fn cleanup_old_tasks(app_handle: tauri::AppHandle, max_tasks_to_keep: Option<i32>) -> Result<i64, String> {
    // 初始化数据库
    simple_database::SimpleDatabase::init_db(&app_handle).await?;
    
    let max_keep = max_tasks_to_keep.unwrap_or(100) as i64;
    
    simple_database::SimpleDatabase::cleanup_old_tasks(&app_handle, max_keep)
        .await
        .map_err(|e| format!("清理旧任务失败: {}", e))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_local_file,
            get_download_dir,
            download_file,
            get_machine_id,
            get_batch_tasks,
            save_batch_task,
            delete_batch_task,
            clear_batch_tasks,
            get_task_count,
            cleanup_old_tasks
        ])
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
