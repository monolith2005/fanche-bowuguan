# API 接入契约

小程序已在 `services/api.js` 中实现上传和错误处理。后端完成以下接口后，只需修改根目录 `config.js` 的 `apiBaseUrl`。

## 环境要求

- 正式环境必须使用 HTTPS 域名；不能直接使用 IP 或 `localhost`。
- 域名需在抖音开放平台配置为 request/uploadFile 合法域名，并完成 ICP 备案。
- 密钥只能放服务端，不能写入小程序包。
- 建议图片落对象存储时使用私有读权限和短期签名 URL；保存前征得用户同意。

## 1. 新展品分析

`POST /api/v1/cases/analyze`

请求为 `multipart/form-data`：

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| image | File | 是 | 翻车现场图片 |
| description | String | 否 | 过程描述 |
| target | String | 否 | 目标结果 |
| constraints | String | 否 | 时间、材料和处理限制 |

推荐响应：

```json
{
  "id": "server-case-id",
  "hall": "手作事故馆",
  "name": "《服务端生成或用户确认的展品名》",
  "target": "稳定的模型结构",
  "stage": "主体粘接后",
  "anomaly": "侧墙外扩",
  "area": "侧墙连接处",
  "severity": "中度",
  "reversible": "中",
  "evidence": ["可定位到图片的视觉证据"],
  "hypotheses": [
    { "name": "缺少临时支撑", "probability": 58, "evidence": "墙体整体外扩" }
  ],
  "question": "最有信息增益的一条追问",
  "safety": "没有风险时可为空",
  "matches": [
    { "kind": "长得最像", "title": "真实案例标题", "source": "真实数据源", "score": 91, "verified": true }
  ],
  "routes": {
    "rescue": { "recommended": false, "summary": "...", "steps": ["..."] },
    "transform": { "recommended": true, "summary": "...", "steps": ["..."] },
    "restart": { "recommended": false, "summary": "...", "steps": ["..."] },
    "stop": { "recommended": false, "summary": "...", "steps": ["..."] }
  }
}
```

响应约束：

- `probability` 为 0—100 的整数，同组总和建议为 100。
- `score` 必须来自实际检索计算，不能由大模型随意生成。
- 每个原因必须包含可核验的证据；信息不足时应返回“不确定”。
- 食品、电器、刺激性材料场景必须先执行安全规则，再生成处置建议。
- `matches` 必须来自真实索引；无结果时返回空数组。

## 2. 陪练视觉复核

`POST /api/v1/cases/{caseId}/verify`

请求为 `multipart/form-data`：

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| image | File | 是 | 当前步骤后的复拍 |
| step | String | 是 | 当前步骤索引，从 0 开始 |

响应示例：

```json
{
  "passed": false,
  "title": "结构仍向右倾斜",
  "message": "右侧顶点比左侧低，建议先保持当前步骤并补一张正面图。",
  "needsAnotherView": true
}
```

## 推荐的真实检索链路

1. 视觉模型从图片输出结构化异常描述和区域。
2. 图像向量负责“长得最像”。
3. 操作历史/材料/阶段的文本向量与结构化过滤负责“经历最像”。
4. 已验证原因、处理结果和用户反馈负责“最值得参考”。
5. 重排模型组合三类信号，但前端分别展示，避免把检索逻辑变成一个不可解释总分。

## 建议的最小数据表

- `cases`：案例、展馆、图片、目标、异常字段、审核状态。
- `case_embeddings`：图像/异常文本向量与模型版本。
- `diagnoses`：原因假设、证据、确认问题、版本。
- `rescue_runs`：步骤、复拍、验证结果、用户完成状态。
- `creators` 与 `sources`：真实来源、授权状态、原视频定位信息。
- `feedback`：用户是否采纳、是否完成、主观满意度；不要直接等同于医学/食品安全结论。
