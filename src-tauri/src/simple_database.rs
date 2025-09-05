use tauri::{AppHandle, Manager};
use rusqlite::{Connection, params};

// 简单的SQLite数据库实现，使用rusqlite
pub struct SimpleDatabase;

impl SimpleDatabase {
    // 获取数据库连接
    fn get_connection(app_handle: &AppHandle) -> Result<Connection, String> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("获取应用目录失败: {}", e))?;
        
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("创建应用目录失败: {}", e))?;
        
        let db_path = app_dir.join("batch_tasks.db");
        Connection::open(&db_path)
            .map_err(|e| format!("打开数据库失败: {}", e))
    }

    // 初始化数据库
    pub async fn init_db(app_handle: &AppHandle) -> Result<(), String> {
        let conn = Self::get_connection(app_handle)?;
        
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS batch_tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                progress INTEGER NOT NULL,
                total_items INTEGER NOT NULL,
                completed_items INTEGER NOT NULL,
                failed_items INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                config_json TEXT NOT NULL,
                items_json TEXT NOT NULL,
                results_json TEXT NOT NULL,
                error_text TEXT
            )
            "#,
            [],
        ).map_err(|e| format!("创建表失败: {}", e))?;
        
        Ok(())
    }

    // 获取所有批量任务
    pub async fn get_all_batch_tasks(app_handle: &AppHandle) -> Result<Vec<crate::BatchTask>, String> {
        let conn = Self::get_connection(app_handle)?;
        
        let mut stmt = conn.prepare(
            "SELECT * FROM batch_tasks ORDER BY created_at DESC"
        ).map_err(|e| format!("准备查询失败: {}", e))?;
        
        let task_iter = stmt.query_map([], |row| {
            let config_json: String = row.get(11)?;
            let items_json: String = row.get(12)?;
            let results_json: String = row.get(13)?;
            
            Ok(crate::BatchTask {
                id: row.get(0)?,
                name: row.get(1)?,
                r#type: row.get(2)?,
                status: row.get(3)?,
                progress: row.get(4)?,
                total_items: row.get(5)?,
                completed_items: row.get(6)?,
                failed_items: row.get(7)?,
                created_at: row.get(8)?,
                started_at: row.get(9)?,
                completed_at: row.get(10)?,
                config: serde_json::from_str(&config_json)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?,
                items: serde_json::from_str(&items_json)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?,
                results: serde_json::from_str(&results_json)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?,
                error: row.get(14)?,
            })
        }).map_err(|e| format!("查询失败: {}", e))?;
        
        let mut tasks = Vec::new();
        for task in task_iter {
            tasks.push(task.map_err(|e| format!("读取任务失败: {}", e))?);
        }
        
        Ok(tasks)
    }

    // 保存批量任务
    pub async fn save_batch_task(app_handle: &AppHandle, task: &crate::BatchTask) -> Result<(), String> {
        let conn = Self::get_connection(app_handle)?;
        
        let config_json = serde_json::to_string(&task.config)
            .map_err(|e| format!("序列化config失败: {}", e))?;
        let items_json = serde_json::to_string(&task.items)
            .map_err(|e| format!("序列化items失败: {}", e))?;
        let results_json = serde_json::to_string(&task.results)
            .map_err(|e| format!("序列化results失败: {}", e))?;
        
        conn.execute(
            r#"
            INSERT OR REPLACE INTO batch_tasks 
            (id, name, type, status, progress, total_items, completed_items, failed_items, 
             created_at, started_at, completed_at, config_json, items_json, results_json, error_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            params![
                task.id,
                task.name,
                task.r#type,
                task.status,
                task.progress,
                task.total_items,
                task.completed_items,
                task.failed_items,
                task.created_at,
                task.started_at,
                task.completed_at,
                config_json,
                items_json,
                results_json,
                task.error,
            ],
        ).map_err(|e| format!("保存任务失败: {}", e))?;
        
        Ok(())
    }

    // 删除批量任务
    pub async fn delete_batch_task(app_handle: &AppHandle, task_id: &str) -> Result<(), String> {
        let conn = Self::get_connection(app_handle)?;
        
        conn.execute(
            "DELETE FROM batch_tasks WHERE id = ?",
            params![task_id],
        ).map_err(|e| format!("删除任务失败: {}", e))?;
        
        Ok(())
    }

    // 清空所有批量任务
    pub async fn clear_batch_tasks(app_handle: &AppHandle) -> Result<(), String> {
        let conn = Self::get_connection(app_handle)?;
        
        conn.execute("DELETE FROM batch_tasks", [])
            .map_err(|e| format!("清空任务失败: {}", e))?;
        
        Ok(())
    }

    // 获取任务数量
    pub async fn get_task_count(app_handle: &AppHandle) -> Result<i64, String> {
        let conn = Self::get_connection(app_handle)?;
        
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM batch_tasks",
            [],
            |row| row.get(0),
        ).map_err(|e| format!("获取任务数量失败: {}", e))?;
        
        Ok(count)
    }

    // 清理旧任务
    pub async fn cleanup_old_tasks(app_handle: &AppHandle, max_tasks_to_keep: i64) -> Result<i64, String> {
        let conn = Self::get_connection(app_handle)?;
        
        // 获取要删除的任务ID
        let mut stmt = conn.prepare(
            "SELECT id FROM batch_tasks ORDER BY created_at DESC LIMIT -1 OFFSET ?"
        ).map_err(|e| format!("准备查询失败: {}", e))?;
        
        let task_ids: Vec<String> = stmt.query_map([max_tasks_to_keep], |row| row.get(0))
            .map_err(|e| format!("查询任务失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取任务ID失败: {}", e))?;
        
        let count = task_ids.len() as i64;
        
        if count > 0 {
            let placeholders = std::iter::repeat("?")
                .take(task_ids.len())
                .collect::<Vec<_>>()
                .join(",");
            
            let _sql = format!("DELETE FROM batch_tasks WHERE id IN ({})", placeholders);
            
            // 使用 rusqlite 的 execute_batch 来处理动态数量的参数
            let mut params_str = String::new();
            for (i, id) in task_ids.iter().enumerate() {
                if i > 0 {
                    params_str.push_str(", ");
                }
                params_str.push_str(&format!("'{}'", id.replace("'", "''")));
            }
            
            let final_sql = format!("DELETE FROM batch_tasks WHERE id IN ({})", params_str);
            
            conn.execute(&final_sql, [])
                .map_err(|e| format!("删除旧任务失败: {}", e))?;
        }
        
        Ok(count)
    }
}