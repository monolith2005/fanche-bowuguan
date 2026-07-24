# 抖音作品关键词检索 API（优质库）

本文档记录“翻车博物馆”视频检索模块所需的外部接口。服务端代理已经接入并完成真实连通验证；前端检索页面仍待接入。

## 待配置项

```text
REDFOX_API_KEY=
```

密钥由启动脚本使用 Windows DPAPI 加密保存在当前账户的 `%LOCALAPPDATA%\FailureMuseum\secrets`，启动后只解密到服务端进程环境变量，不得写入前端 JavaScript、提交到代码仓库或返回给浏览器。

## 外部接口

```text
POST https://redfox.hk/story/api/dyData/searchArticle
Content-Type: application/json
REDFOX_API_KEY: ${REDFOX_API_KEY}
```

### 请求体

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `keyword` | String | 是 | — | 搜索关键词 |
| `offset` | Integer | 否 | `0` | 分页偏移量 |
| `sortType` | String | 否 | `default` | 排序类型 |

```json
{
  "keyword": "眼线晕染",
  "offset": 0,
  "sortType": "default"
}
```

## 外部响应

成功状态码暂按 `code === 2000` 判断；实际接入时仍需验证错误响应、限流规则和字段空值情况。

```json
{
  "code": 2000,
  "msg": "成功",
  "data": {
    "total": 100,
    "hasMore": true,
    "list": [
      {
        "workId": "7388888888888888888",
        "title": "作品标题示例",
        "content": "这是抖音作品正文内容",
        "workUrl": "https://www.douyin.com/video/7388888888888888888",
        "coverUrl": "https://example.com/cover.jpg",
        "audioUrl": "https://example.com/audio.mp3",
        "workType": "视频",
        "duration": 60,
        "publishTime": "2026-05-20 10:00:00",
        "repostCount": 500,
        "commentCount": 280,
        "shareCount": 150,
        "likeCount": 8000,
        "collectCount": 500,
        "commentTopKeywords": ["关键词1", "关键词2"],
        "isPromotion": 0,
        "authorId": "dy_user123",
        "accountName": "抖音用户昵称",
        "authorLink": "https://www.douyin.com/user/xxx",
        "authorUrl": "https://example.com/avatar.jpg",
        "followerCount": 100000,
        "crawlTime": "2026-05-20 12:00:00",
        "accountType": "100"
      }
    ]
  }
}
```

## 字段约定

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.total` | Long | 结果总数 |
| `data.hasMore` | Boolean/Integer | 是否还有下一页，接入时兼容 `true/false` 与 `0/1` |
| `data.list` | Array | 作品列表 |
| `workId` | String | 作品 ID |
| `title` | String | 作品标题 |
| `content` | String | 作品正文 |
| `workUrl` | String | 抖音作品链接 |
| `coverUrl` | String | 封面链接 |
| `audioUrl` | String | 音频链接 |
| `workType` | String | 视频或图文 |
| `duration` | Integer | 时长，单位为秒 |
| `publishTime` | String | 发布时间 |
| `repostCount` | Integer | 转发数 |
| `commentCount` | Integer | 评论数 |
| `shareCount` | Integer | 分享数 |
| `likeCount` | Integer | 点赞数 |
| `collectCount` | Integer | 收藏数 |
| `commentTopKeywords` | Array | 评论高频关键词 |
| `isPromotion` | Integer | 是否带货：`0` 否，`1` 是 |
| `authorId` | String | 作者抖音号 |
| `accountName` | String | 作者昵称 |
| `authorLink` | String | 作者主页链接 |
| `authorUrl` | String | 作者头像链接 |
| `followerCount` | Integer | 作者粉丝数 |
| `crawlTime` | String | 数据更新时间 |
| `accountType` | String | 账号类型 |

## 项目内预留接口

`local_server.py` 已提供同源代理，前端不直接访问第三方接口：

```text
POST /api/v1/douyin/search
```

请求结构：

```json
{
  "keyword": "眼线晕染",
  "offset": 0,
  "sortType": "default",
  "limit": 6,
  "fingerprint": {
    "shortName": "下眼睑晕染脱妆",
    "anomaly": "左侧下眼睑出现黑色晕染",
    "area": "左侧下眼睑",
    "stage": "完妆后一段时间",
    "target": "完成对称眼线",
    "hypotheses": [{"name": "出油导致脱妆"}]
  }
}
```

当前职责：

1. 从服务端环境变量读取 `REDFOX_API_KEY`。
2. 校验关键词、分页偏移量和排序参数。
3. 转发至 Redfox 接口，并统一第三方错误结构。
4. 仅返回页面实际使用的作品字段。
5. 为配置缺失、参数错误、超时、第三方错误和空结果提供明确状态。

## 快速筛选

第三方仍然只请求一次。代理收到候选后在本地根据失败指纹执行轻量筛选，不增加模型调用，也不下载视频：

- 标题匹配权重最高；
- 正文和评论热词提供过程证据；
- 教程、补救、修复等意图获得加权；
- 带货内容轻微降权，互动量只用于弱排序；
- 按作品 ID 去重，并限制同一作者最多出现两条；
- 返回 `relevanceScore` 和 `relevanceReasons`，页面展示筛选依据。

接口结果在服务进程内缓存 10 分钟。相同关键词、分页和排序参数再次请求时复用第三方响应，但仍按照当前失败指纹重新执行本地排序。缓存有 256 个查询的内存上限。

本地性能回归中，2000 条候选完成筛选约需 89ms；当前外部接口通常只返回约 20 条，因此新增筛选不会形成可感知等待。

代理统一响应使用 `items` 作为作品数组，并将 `hasMore` 归一化为布尔值：

```json
{
  "keyword": "眼线晕染",
  "offset": 0,
  "sortType": "default",
  "total": 100,
  "hasMore": true,
  "retrievedCount": 20,
  "selectedCount": 6,
  "items": [
    {
      "workUrl": "https://www.douyin.com/video/xxx",
      "relevanceScore": 86,
      "relevanceReasons": ["标题命中失败指纹", "包含教程或补救意图"]
    }
  ],
  "screening": {"mode": "metadata-fingerprint-v1", "elapsedMs": 1.2},
  "delivery": {"cacheHit": false, "networkElapsedMs": 7500, "cacheTtlSeconds": 600},
  "source": "redfox-douyin-quality-library"
}
```

## 接入前仍需确认

- 每次启动时通过隐藏输入配置 `REDFOX_API_KEY`；密钥不落盘。
- 接口调用额度、计费、QPS 和每日限额。
- `offset` 的翻页步长以及最大可翻页范围。
- `sortType` 除 `default` 外的合法枚举。
- `hasMore` 的实际类型。
- 图片、视频、音频链接的有效期及浏览器防盗链策略。
- 作品数据的展示、缓存、二次分析和参赛演示授权边界。
