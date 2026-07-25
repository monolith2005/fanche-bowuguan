# 火山 Supabase 部署与验收

## 1. 创建工作区

1. 在火山引擎 AI 原生 BaaS 平台创建 Supabase 引擎 Workspace，并等待状态变为运行中。
2. 获取 `SUPABASE_BASE_URL` 与 `SUPABASE_ANON_KEY`。匿名 Key 是浏览器客户端配置；`SERVICE_ROLE_KEY` 不得进入本项目的前端、截图、日志或 Git。
3. 在 SQL Editor 中执行 `supabase/migrations/202607250001_initial.sql`。脚本会创建私人案件、摆件、收藏、主动发布表，启用 RLS，并创建两个私有 Bucket。

## 2. 配置六位邮箱验证码

在 Authentication 的 Emails 设置中启用 Custom SMTP，并配置发送者、Host、Port、用户名和密码。邮件模板必须使用 `{{ .Token }}`，否则 SDK 会发送魔法链接而不是六位 OTP。

配置完成后启用邮箱注册与验证。生产环境应设置合理的发送间隔、验证码有效期和 SMTP 发件域名记录。

## 3. 启动本地联调

```bash
export SUPABASE_URL="https://你的-workspace-地址"
export SUPABASE_ANON_KEY="匿名客户端-key"
python3 local_server.py
```

打开“云端同步”，依次验证发送验证码、验证登录、上传本地馆藏、读取云端并合并。同步前的本地数据会保存为 `museum_collections_web_backup_<timestamp>`。

## 4. 权限与双端验收

- 账号 A 上传案件后，账号 B 查询 `cases`、`artifacts`、`collections` 应返回空结果；直接读取 A 的对象路径应失败。
- 账号 A 创建的签名地址应能在有效期内读取，过期后不能继续访问。
- 在设备 A 上传、设备 B 登录并合并后，应得到相同展品、最终分馆和发布状态。
- 未设置 `published_at` 的私人收藏不能进入公开查询；主动发布后只公开 `community_posts` 内容，撤回不删除私人收藏。
- 断网或同步失败时，本地 `museum_collections_web` 不得被清空。

官方参考：[火山引擎邮件登录配置](https://www.volcengine.com/docs/87275/2288737)、[火山引擎 Auth Hooks](https://www.volcengine.com/docs/87275/2482139)、[Supabase 邮箱 OTP](https://supabase.com/docs/reference/javascript/auth-signinwithotp)。
