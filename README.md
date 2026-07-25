# 翻车博物馆

## 本地预览

```bash
python3 -m pip install -r requirements.txt
python3 local_server.py
```

浏览器会打开 `http://127.0.0.1:5173/web/`。未配置模型密钥时，内置馆藏案例仍可完整体验。

## 像素世界操作

- 手机和电脑均可点击/触摸场景移动角色。
- 电脑支持 `WASD` 与方向键连续移动。
- 点击主馆大门、六座展馆入口或馆长，角色会自动寻路并在靠近后触发交互。
- 校园中央总馆接收未分类案例；AI 推荐六馆之一，用户确认或改馆后再归档。
- 六座分馆各展示最新四件私人藏品，更多记录可从“我的馆藏”查看。
- 草坪和馆内右上方功能栏可进入社区、馆长中心、我的馆藏与服务设置；手机端通过菜单按钮展开。

## 方舟模型配置

密钥只配置在启动服务的终端环境中，不要写进仓库：

```bash
export ARK_API_KEY="轮换后的密钥"
export ARK_MODEL="doubao-seed-2-0-lite-260428"
export ARK_IMAGE_MODEL="doubao-seedream-5-0-pro-260628"
python3 local_server.py
```

图片模型未开通时，鉴定和归档仍可使用，展台会显示确定性的本地像素占位并提供重试入口。

## 云端同步（可选）

云端采用火山引擎 Supabase 版。未配置时页面保持本地模式；配置 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 后，“云端同步”页面会启用邮箱验证码与私人馆藏同步。

建表、RLS、私有 Storage 和 SMTP 验收步骤见 [火山 Supabase 部署与验收](docs/火山Supabase部署与验收.md)。
