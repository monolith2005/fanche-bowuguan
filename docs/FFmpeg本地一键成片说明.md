# FFmpeg 本地一键成片说明

## 当前状态

项目已经接入真实 FFmpeg 本地渲染。整个过程使用当前电脑计算，不调用 VectCut、AI 生视频或其他付费云渲染服务。

当前支持：

- 图片或视频现场作为主素材；
- 可选处置后复拍作为第二素材；
- 失败指纹、首要原因和处置步骤自动生成中文字幕卡；
- 竖屏 `720×1280`、H.264、MP4 输出；
- 原视频有音轨时保留原声音；
- 异步任务、真实进度、网页播放和下载；
- HTTP Range，支持浏览器拖动播放进度；
- 服务重启后仍能读取已经生成的本地 MP4。

## 使用方法

1. 启动 `start-local.bat`。
2. 完成一次案例鉴定和处置流程。
3. 在“处理结果与馆藏”中打开“生成内容”。
4. 选择本地成片模板。
5. 点击“一键生成免费本地成片”。
6. 渲染完成后直接播放或下载 MP4。

## 免费模板

| 模板 ID | 时长 | 用途 |
|---|---:|---|
| `flash-15` | 15秒 | 事故快报，适合快速分享 |
| `documentary-20` | 20秒 | 目标、异常、原因和处置的完整复盘 |
| `before-after-20` | 20秒 | 有复拍时使用淡入淡出展示前后状态 |

三套模板只使用用户媒体、系统字体、色块和淡入淡出，不依赖付费素材、音乐、字体或特效。

## 本地接口

创建任务：

```text
POST /api/v1/video-jobs
Content-Type: multipart/form-data
```

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `media` | File | 必填，当前图片或视频 |
| `after_media` | File | 可选，处置后复拍 |
| `template_id` | String | 三个模板 ID 之一 |
| `metadata` | JSON String | 标题、异常、原因、路线和步骤 |

查询状态：

```text
GET /api/v1/video-jobs/{job_id}
```

播放和下载：

```text
GET /api/v1/video-jobs/{job_id}/file
GET /api/v1/video-jobs/{job_id}/file?download=1
```

## FFmpeg 安装

Windows 推荐：

```powershell
winget install --id Gyan.FFmpeg --exact
```

当前开发电脑已经安装 `Gyan.FFmpeg 8.1.2`。服务会同时检查系统 `PATH` 和 WinGet 包目录。

健康检查中的 `ffmpegAvailable` 表示是否可用：

```text
GET /api/v1/health
```

## 文件与隐私

生成任务保存在：

```text
runtime/video_jobs/{job_id}/
```

`runtime/` 已加入 `.gitignore`，不会进入代码仓库。素材和成片都留在当前电脑，不会因为本地生成而上传到第三方。

## 当前限制

- 单次请求仍受本地服务默认 50MB 上传限制。
- 同时只执行一个渲染任务，避免比赛电脑被多个任务占满。
- 图片成片默认没有配音或背景音乐；视频成片保留原始音轨。
- 当前是固定分镜模板，不会自动选择音乐、版权素材或发布到抖音。
- 输出文件会占用本地磁盘，现阶段由开发者按需清理 `runtime/video_jobs` 中不再需要的任务目录。
