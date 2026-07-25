"""翻车博物馆本地静态服务器与火山方舟安全代理。

密钥只从进程环境变量 ARK_API_KEY 读取，绝不返回给浏览器或写入日志。
"""

from __future__ import annotations

import base64
import cgi
import io
import json
import math
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from video_renderer import TEMPLATES as VIDEO_TEMPLATES
from video_renderer import VideoJobManager


ROOT = Path(__file__).resolve().parent
HOST = os.getenv("MUSEUM_HOST", "127.0.0.1")
PORT = int(os.getenv("MUSEUM_PORT", "5173"))
ARK_BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
ARK_MODEL = os.getenv("ARK_MODEL", "doubao-seed-2-0-lite-260428")
ARK_IMAGE_MODEL = os.getenv("ARK_IMAGE_MODEL", "doubao-seedream-5-0-pro-260628")
ARK_EXPLICIT_AUDIO = os.getenv("ARK_EXPLICIT_AUDIO", "").strip().lower() in {"1", "true", "yes"}
REDFOX_BASE_URL = os.getenv("REDFOX_BASE_URL", "https://redfox.hk").rstrip("/")
MAX_UPLOAD_BYTES = int(os.getenv("MUSEUM_MAX_UPLOAD_MB", "50")) * 1024 * 1024
ANALYSES: dict[str, dict[str, Any]] = {}
REDFOX_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
REDFOX_CACHE_SECONDS = int(os.getenv("REDFOX_CACHE_SECONDS", "600"))
VIDEO_JOBS = VideoJobManager(ROOT / "runtime" / "video_jobs")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, detail: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.detail = detail


def api_key() -> str:
    value = os.getenv("ARK_API_KEY", "").strip()
    if not value:
        raise ApiError(503, "ARK_NOT_CONFIGURED", "服务端尚未配置 ARK_API_KEY")
    return value


def redfox_api_key() -> str:
    value = os.getenv("REDFOX_API_KEY", "").strip()
    if not value:
        raise ApiError(503, "REDFOX_NOT_CONFIGURED", "服务端尚未配置 REDFOX_API_KEY")
    return value


def data_url(data: bytes, content_type: str) -> str:
    return f"data:{content_type};base64," + base64.b64encode(data).decode("ascii")


def ark_request(payload: dict[str, Any], timeout: int = 180) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{ARK_BASE_URL}/responses",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        provider_code = "ARK_HTTP_ERROR"
        provider_message = raw[:800]
        try:
            parsed = json.loads(raw).get("error", {})
            provider_code = parsed.get("code", provider_code)
            provider_message = parsed.get("message", provider_message)
        except json.JSONDecodeError:
            pass
        if provider_code in {"ModelNotOpen", "InvalidEndpointOrModel.NotFound"}:
            message = f"方舟模型 {ARK_MODEL} 尚未开通，请先在火山方舟控制台的开通管理中激活该模型"
        elif error.code in {401, 403}:
            message = "方舟 API Key 无效、已失效或没有调用权限"
        else:
            message = "方舟多模态分析请求失败"
        raise ApiError(502, provider_code, message, provider_message) from error
    except urllib.error.URLError as error:
        raise ApiError(502, "ARK_NETWORK_ERROR", "无法连接火山方舟服务", str(error.reason)) from error


def ark_image_request(payload: dict[str, Any], timeout: int = 240) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{ARK_BASE_URL}/images/generations",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        provider_code, provider_message = "ARK_IMAGE_HTTP_ERROR", raw[:800]
        try:
            parsed = json.loads(raw).get("error", {})
            provider_code = parsed.get("code", provider_code)
            provider_message = parsed.get("message", provider_message)
        except json.JSONDecodeError:
            pass
        if provider_code in {"ModelNotOpen", "InvalidEndpointOrModel.NotFound"}:
            message = f"方舟图片模型 {ARK_IMAGE_MODEL} 尚未开通或模型 ID 不可用"
        elif error.code in {401, 403}:
            message = "方舟 API Key 无效、已失效或没有图片生成权限"
        else:
            message = "方舟像素摆件生成失败"
        raise ApiError(502, provider_code, message, provider_message) from error
    except urllib.error.URLError as error:
        raise ApiError(502, "ARK_IMAGE_NETWORK_ERROR", "无法连接火山方舟图片生成服务", str(error.reason)) from error


def transparent_artifact(source: bytes) -> bytes:
    """Remove a flat border color and normalize the generated object to 128px."""
    try:
        from PIL import Image
    except ImportError as error:
        raise ApiError(503, "PILLOW_REQUIRED", "摆件去底需要 Pillow，请先执行 pip install pillow") from error
    try:
        image = Image.open(io.BytesIO(source)).convert("RGBA")
    except Exception as error:
        raise ApiError(502, "INVALID_ARTIFACT_IMAGE", "图片模型返回了无法解析的图片", str(error)) from error
    corners = [image.getpixel((0, 0))[:3], image.getpixel((image.width - 1, 0))[:3], image.getpixel((0, image.height - 1))[:3], image.getpixel((image.width - 1, image.height - 1))[:3]]
    key = tuple(sorted(value[channel] for value in corners)[len(corners) // 2] for channel in range(3))
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            delta = math.sqrt((red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2)
            if delta <= 24:
                pixels[x, y] = (red, green, blue, 0)
            elif delta < 72:
                pixels[x, y] = (red, green, blue, min(alpha, round((delta - 24) / 48 * 255)))
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ApiError(502, "EMPTY_ARTIFACT_IMAGE", "摆件去底后没有保留有效主体")
    subject = image.crop(bbox)
    scale = min(104 / subject.width, 104 / subject.height)
    subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.NEAREST)
    output = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    output.alpha_composite(subject, ((128 - subject.width) // 2, 112 - subject.height))
    stream = io.BytesIO()
    output.save(stream, "PNG", optimize=True)
    return stream.getvalue()


def generate_artifact(body: dict[str, Any]) -> dict[str, Any]:
    analysis = body.get("analysis")
    if not isinstance(analysis, dict):
        raise ApiError(400, "ANALYSIS_REQUIRED", "摆件生成需要 analysis 对象")
    source_image = str(body.get("source_image", ""))
    if source_image and not source_image.startswith("data:image/"):
        raise ApiError(400, "INVALID_SOURCE_IMAGE", "source_image 必须是图片 data URL")
    name = str(analysis.get("name") or analysis.get("short_name") or "未命名翻车现场")[:80]
    target = str(analysis.get("target") or "目标状态待确认")[:160]
    anomaly = str(analysis.get("anomaly") or "异常形态待确认")[:160]
    hall = str(analysis.get("hall") or "待分类展馆")[:40]
    prompt = f"""
Create one small collectible museum artifact representing this failed-case diagnosis: {name}.
Target state: {target}. Visible anomaly: {anomaly}. Suggested gallery: {hall}.
Render a single clever, recognizable object metaphor in cozy high-detail 16-bit pixel art, front three-quarter view, centered, crisp pixel clusters, limited warm palette, suitable for a 128x128 game pedestal.
Place it on a perfectly flat solid #00ff00 chroma-key background. The background must be uniform with no floor, gradient, texture, shadow, reflection, text, logo, border, character, or watermark. Do not use #00ff00 in the object. Keep generous padding around the object.
""".strip()
    payload: dict[str, Any] = {"model": ARK_IMAGE_MODEL, "prompt": prompt, "size": "1024x1024", "response_format": "b64_json", "watermark": False}
    if source_image:
        payload["image"] = source_image
    response = ark_image_request(payload)
    data = response.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise ApiError(502, "ARK_IMAGE_EMPTY_OUTPUT", "图片模型没有返回摆件图片")
    item = data[0]
    if item.get("b64_json"):
        try:
            raw = base64.b64decode(item["b64_json"], validate=True)
        except Exception as error:
            raise ApiError(502, "ARK_IMAGE_INVALID_BASE64", "图片模型返回的图片编码无效", str(error)) from error
    elif item.get("url"):
        try:
            with urllib.request.urlopen(str(item["url"]), timeout=120) as remote:
                raw = remote.read(12 * 1024 * 1024)
        except urllib.error.URLError as error:
            raise ApiError(502, "ARK_IMAGE_DOWNLOAD_ERROR", "无法下载图片模型生成结果", str(error.reason)) from error
    else:
        raise ApiError(502, "ARK_IMAGE_EMPTY_OUTPUT", "图片模型没有返回可用的 URL 或 base64")
    artifact = transparent_artifact(raw)
    return {"artifact_id": "artifact-" + uuid.uuid4().hex[:16], "status": "ready", "preview_data_url": data_url(artifact, "image/png"), "model": ARK_IMAGE_MODEL, "prompt_version": "pixel-artifact-v1"}


def output_text(response: dict[str, Any]) -> str:
    texts: list[str] = []
    if isinstance(response.get("output_text"), str):
        texts.append(response["output_text"])
    for item in response.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text":
                texts.append(content.get("text", ""))
    value = "".join(texts).strip()
    if not value:
        raise ApiError(502, "ARK_EMPTY_OUTPUT", "方舟返回了空的分析结果")
    return value


def parse_json_output(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1)
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start < 0 or end <= start:
            raise ApiError(502, "INVALID_MODEL_JSON", "模型没有返回可解析的结构化结果", cleaned[:1000])
        try:
            value = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as error:
            raise ApiError(502, "INVALID_MODEL_JSON", "模型返回的 JSON 格式不正确", str(error)) from error
    if not isinstance(value, dict):
        raise ApiError(502, "INVALID_MODEL_SCHEMA", "模型结构化结果必须是 JSON 对象")
    return value


def structured_output(response: dict[str, Any]) -> dict[str, Any]:
    """Parse model JSON and repair syntax once without resending the user's media."""
    text = output_text(response)
    try:
        return parse_json_output(text)
    except ApiError as error:
        if error.code != "INVALID_MODEL_JSON":
            raise
        repair_prompt = f"""
把下面这份模型输出修复成语义不变、可被标准 JSON.parse 解析的单个 JSON 对象。
只能输出 JSON，不要解释，不要 Markdown，不要新增事实；布尔值必须使用 true 或 false，字符串必须使用双引号。

待修复内容：
{text}
""".strip()
        repaired = ark_request(
            {
                "model": ARK_MODEL,
                "input": repair_prompt,
                "max_output_tokens": 6000,
                "thinking": {"type": "disabled"},
            }
        )
        return parse_json_output(output_text(repaired))


ANALYSIS_REQUIRED_FIELDS = ["hall", "name", "target", "stage", "anomaly", "area", "severity", "reversible", "question"]


def canonical_analysis(raw: dict[str, Any]) -> dict[str, Any]:
    """Flatten common model variants without inventing observations."""
    merged: dict[str, Any] = {}
    for key in ["analysis", "result", "failure_fingerprint", "failureFingerprint", "fingerprint"]:
        nested = raw.get(key)
        if isinstance(nested, dict):
            merged.update(nested)
    merged.update(raw)
    aliases = {
        "hall": ["category", "museum_hall", "museumHall", "馆别", "展馆"],
        "name": ["title", "exhibit_name", "exhibitName", "展品名"],
        "shortName": ["short_name", "fingerprint_name", "异常简称"],
        "target": ["target_state", "targetState", "goal", "目标状态"],
        "stage": ["current_stage", "failure_stage", "failureStage", "阶段"],
        "anomaly": ["abnormality", "failure_pattern", "failurePattern", "异常形态"],
        "area": ["region", "location", "anomaly_area", "anomalyArea", "异常区域"],
        "severity": ["severity_level", "severityLevel", "严重程度"],
        "repairability": ["repairability_level", "repairabilityLevel", "可修复度"],
        "reversible": ["reversibility", "reversible_level", "reversibleLevel", "可逆程度"],
        "evidence": ["visual_evidence", "visualEvidence", "observed_evidence", "证据"],
        "observations": ["timeline_observations", "timelineObservations", "视频观察"],
        "hypotheses": ["causes", "cause_hypotheses", "causeHypotheses", "原因假设"],
        "question": ["key_question", "keyQuestion", "follow_up_question", "followUpQuestion", "关键追问"],
        "safety": ["safety_warning", "safetyWarning", "安全提示"],
        "routes": ["action_routes", "actionRoutes", "处置路线"],
        "failureDetected": ["failure_detected", "is_failure", "isFailure"],
        "analysisConfidence": ["analysis_confidence", "confidence", "置信度"],
        "classificationReason": ["classification_reason", "hall_reason", "hallReason", "归馆理由"],
    }
    for canonical, variants in aliases.items():
        if merged.get(canonical) not in (None, "", [], {}):
            continue
        for variant in variants:
            if merged.get(variant) not in (None, "", [], {}):
                merged[canonical] = merged[variant]
                break
    return merged


def incomplete_analysis(raw: dict[str, Any]) -> list[str]:
    value = canonical_analysis(raw)
    missing = [key for key in ANALYSIS_REQUIRED_FIELDS if not isinstance(value.get(key), str) or not value[key].strip()]
    if not isinstance(value.get("hypotheses"), list) or not value["hypotheses"]:
        missing.append("hypotheses")
    return missing


def repair_analysis_schema(raw: dict[str, Any], missing: list[str]) -> dict[str, Any]:
    """Ask for a text-only schema repair; the user's large media is not resent."""
    prompt = f"""
把下面已有的多模态分析整理为单个完整 JSON 对象。缺少的字段是：{', '.join(missing)}。
只能使用原分析中的事实；无法确认的值写“待确认”，不得新增画面中不存在的事实。
hall 无法分类时写“待分类展馆”；name 无法确定时写“待确认的翻车现场”；question 缺失时写一条只确认一个变量的关键追问。
hypotheses 必须是数组，每项包含 name、probability、evidence、needs_confirmation，概率总和为100；证据不足时如实写“当前证据不足”。
保留 failureDetected、analysisConfidence、evidence、observations、safety、matches、routes 等已有字段。
必须在顶层提供这些字符串字段：hall、name、target、stage、anomaly、area、severity、repairability、reversible、question。
只输出 JSON，不要 Markdown 或解释。

原分析：
{json.dumps(raw, ensure_ascii=False)}
""".strip()
    response = ark_request({"model": ARK_MODEL, "input": prompt, "max_output_tokens": 6000, "thinking": {"type": "disabled"}})
    return structured_output(response)


def normalize_analysis(raw: dict[str, Any], case_id: str | None = None) -> dict[str, Any]:
    raw = canonical_analysis(raw)
    fallbacks = {
        "hall": "待分类展馆",
        "name": "待确认的翻车现场",
        "target": "目标状态待确认",
        "stage": "异常发生阶段待确认",
        "anomaly": "异常形态待确认",
        "area": "异常区域待确认",
        "severity": "待确认",
        "reversible": "待确认",
        "question": "你认为异常最明显的是哪个时间点？",
    }
    schema_warnings: list[str] = []
    for key, fallback in fallbacks.items():
        if not isinstance(raw.get(key), str) or not raw[key].strip():
            raw[key] = fallback
            schema_warnings.append(key)

    evidence = raw.get("evidence") if isinstance(raw.get("evidence"), list) else []
    evidence = [str(item).strip() for item in evidence if str(item).strip()][:8]
    hypotheses: list[dict[str, Any]] = []
    for item in raw.get("hypotheses", []) if isinstance(raw.get("hypotheses"), list) else []:
        if not isinstance(item, dict) or not item.get("name"):
            continue
        try:
            probability = max(0, min(100, int(round(float(item.get("probability", 0))))))
        except (TypeError, ValueError):
            probability = 0
        hypotheses.append(
            {
                "name": str(item["name"]).strip(),
                "probability": probability,
                "evidence": str(item.get("evidence", "当前证据不足")).strip(),
                "needsConfirmation": str(item.get("needs_confirmation", item.get("needsConfirmation", ""))).strip(),
            }
        )
    if not hypotheses:
        hypotheses = [{"name": "当前证据不足，原因待确认", "probability": 100, "evidence": "模型未返回可核验的原因证据", "needsConfirmation": raw["question"]}]
        schema_warnings.append("hypotheses")
    total = sum(item["probability"] for item in hypotheses)
    if total <= 0:
        equal = 100 // len(hypotheses)
        for item in hypotheses:
            item["probability"] = equal
        hypotheses[0]["probability"] += 100 - sum(item["probability"] for item in hypotheses)
    elif total != 100:
        running = 0
        for item in hypotheses[:-1]:
            item["probability"] = round(item["probability"] / total * 100)
            running += item["probability"]
        hypotheses[-1]["probability"] = max(0, 100 - running)

    routes: dict[str, Any] = {}
    raw_routes = raw.get("routes") if isinstance(raw.get("routes"), dict) else {}
    route_names = {"rescue": "抢救", "transform": "改造", "restart": "重开", "stop": "止损"}
    for key, label in route_names.items():
        item = raw_routes.get(key, {}) if isinstance(raw_routes.get(key), dict) else {}
        steps = item.get("steps") if isinstance(item.get("steps"), list) else []
        routes[key] = {
            "recommended": bool(item.get("recommended", False)),
            "summary": str(item.get("summary", f"暂未生成{label}路线说明")).strip(),
            "steps": [str(step).strip() for step in steps if str(step).strip()][:8],
        }
    if not any(route["recommended"] for route in routes.values()):
        routes["stop" if raw.get("safety") else "rescue"]["recommended"] = True

    failure_detected = bool(raw.get("failureDetected", raw.get("failure_detected", True)))
    try:
        analysis_confidence = max(0, min(100, int(round(float(raw.get("analysisConfidence", raw.get("analysis_confidence", 50)))))))
    except (TypeError, ValueError):
        analysis_confidence = 50
    if schema_warnings:
        analysis_confidence = min(analysis_confidence, 35)
    if not failure_detected:
        hypotheses = [{"name": "当前媒体不足以确认失败原因", "probability": 100, "evidence": "没有观察到相对于目标状态的明确异常", "needsConfirmation": "需要目标图、异常时间点或更清晰画面"}]
        for route in routes.values():
            route["recommended"] = False
        routes["stop"] = {"recommended": True, "summary": "先暂停处置并补充证据，避免对正常状态做错误修复。", "steps": ["补充目标效果图或原教程", "指出认为异常的时间点或区域", "重新提交更清晰的现场媒体"]}

    raw_media_evidence = raw.get("mediaEvidence", raw.get("media_evidence", {}))
    if not isinstance(raw_media_evidence, dict):
        raw_media_evidence = {}
    onscreen_texts = raw_media_evidence.get("onscreenTexts", raw_media_evidence.get("onscreen_texts", []))
    if not isinstance(onscreen_texts, list):
        onscreen_texts = [onscreen_texts] if onscreen_texts else []
    media_evidence = {
        "audioObserved": bool(raw_media_evidence.get("audioObserved", raw_media_evidence.get("audio_observed", False))),
        "speechSummary": str(raw_media_evidence.get("speechSummary", raw_media_evidence.get("speech_summary", "模型未单独返回口播摘要"))).strip(),
        "onscreenTexts": [str(item).strip() for item in onscreen_texts if str(item).strip()][:12],
        "visualSummary": str(raw_media_evidence.get("visualSummary", raw_media_evidence.get("visual_summary", ""))).strip(),
    }

    result = {
        "id": case_id or "ark-" + uuid.uuid4().hex[:16],
        "hall": raw["hall"].strip(),
        "name": raw["name"].strip(),
        "shortName": str(raw.get("shortName", raw.get("short_name", raw["anomaly"]))).strip(),
        "target": raw["target"].strip(),
        "stage": raw["stage"].strip(),
        "anomaly": raw["anomaly"].strip() if failure_detected else "未观察到明确失败状态",
        "area": raw["area"].strip() if failure_detected else "待确认",
        "severity": raw["severity"].strip() if failure_detected else "待确认",
        "repairability": str(raw.get("repairability", "待确认")).strip() if failure_detected else "待确认",
        "reversible": raw["reversible"].strip() if failure_detected else "待确认",
        "evidence": evidence,
        "hypotheses": hypotheses[:5],
        "question": raw["question"].strip(),
        "safety": str(raw.get("safety", "")).strip(),
        "observations": raw.get("observations", []) if isinstance(raw.get("observations"), list) else [],
        "mediaEvidence": media_evidence,
        "matches": [],
        "routes": routes,
        "failureDetected": failure_detected,
        "analysisConfidence": analysis_confidence,
        "suggestedHallId": {
            "厨房事故馆": "kitchen", "变美事故馆": "beauty", "手作事故馆": "craft",
            "家居改造馆": "home", "植物急救馆": "plant", "拍摄翻车馆": "camera",
        }.get(raw["hall"].strip(), ""),
        "classificationReason": str(raw.get("classificationReason", "根据目标对象、异常形态与处置知识边界综合推荐。")).strip(),
        "analysisMeta": {"provider": "volcengine-ark", "model": ARK_MODEL, "realModelOutput": True, "schemaWarnings": schema_warnings},
    }
    return result


def analysis_prompt(fields: dict[str, str], media_kind: str) -> str:
    return f"""
你是“翻车博物馆”的多模态鉴定 Agent。分析用户上传的{media_kind}，目标不是识别商品或泛泛描述，而是形成可检索的“失败指纹”，提出多个有证据的原因假设，并只追问一条最有信息增益的问题。

媒体取证优先级：
- 必须先完整理解视频的画面、音轨/口播、屏幕字幕和贴纸文字，再阅读下面的表单补充。
- 视频中的明确口播和画面字幕就是用户提供的有效描述；不能因为表单留空而忽略它们。
- evidence 和 observations 要标明信息来自“口播”“画面字幕”还是“可见现象”，并尽量写时间点。
- 当口播或字幕明确说出目标、步骤和异常（例如“做到第三步，奶油突然变成颗粒”），应据此建立目标与失败指纹；无需用户在表单重复填写。

用户补充：
- 发生经过：{fields.get('description') or '未提供'}
- 目标结果：{fields.get('target') or '未提供；请从目标图或上下文谨慎推断，不能确定就明确写待确认'}
- 现实约束：{fields.get('constraints') or '未提供'}
- 原教程：{fields.get('source_url') or '未提供'}
- 异常发生时间点：{fields.get('source_time') or '未提供'}
- 用户框选区域：{fields.get('region') or '未框选'}

严格要求：
1. 首先综合画面、口播、字幕判断是否展示或明确报告了失败状态。只有媒体自身和表单都没有目标/异常线索，或线索互相冲突且无法确认时，failureDetected=false；绝不能为了完成任务把正常画面解释成失败。
2. 只根据实际可见/可听内容和用户描述判断；不要捏造材料、步骤、尺寸、气味或温度。
3. evidence 必须是媒体中可核验的观察、逐字或忠实概括的口播/字幕；视频 observations 尽量包含时间点。仅靠口播报告而画面未展示细节时，可以确认“用户报告了失败”，但要降低原因诊断置信度并在证据中说明边界。
4. 原因只能作为假设，probability 总和必须为 100，并写明每个假设还需确认什么。
5. question 必须是一个单一问题，只确认一个变量；不能用“同时、以及、或者”拼接两个问题。
6. 食品、电器、眼部刺激、刀具等风险优先；不确定时明确止损或建议专业帮助。
7. matches 必须为空数组，因为当前调用没有真实向量案例库，禁止编造相似案例和数量。
8. failureDetected=false 时，原因只能写“证据不足”，四类处置不得提供实质修复操作，只能建议补充目标或画面。不得仅仅因为上面的表单为空就判 false。
9. 给出抢救 rescue、改造 transform、重开 restart、止损 stop 四条路线。只允许一条 recommended=true；高风险时优先止损。
10. 只输出一个 JSON 对象，不要 Markdown，不要解释。
11. mediaEvidence 必须填写：先报告是否听到有效口播、忠实概括与失败有关的口播、列出实际读到的屏幕文字，再做 failureDetected 判断。没有识别到时如实写“未识别到”，禁止猜测。

JSON 字段必须为：
{{
  "failureDetected":true或false,
  "analysisConfidence":0到100整数,
  "mediaEvidence":{{
    "audioObserved":true或false,
    "speechSummary":"与目标、步骤、异常有关的口播摘要；未识别到则明确写未识别到",
    "onscreenTexts":["实际读到的屏幕字幕或贴纸文字"],
    "visualSummary":"与失败判断有关的可见现象"
  }},
  "hall":"六馆之一：厨房事故馆/变美事故馆/手作事故馆/家居改造馆/植物急救馆/拍摄翻车馆",
  "classificationReason":"用一句话说明为什么推荐这个馆，只引用目标对象、异常形态或所需知识边界",
  "name":"有梗但不冒犯的展品名",
  "shortName":"简短异常名",
  "target":"目标对象和目标状态",
  "stage":"当前或发生异常的阶段",
  "anomaly":"异常形态",
  "area":"异常区域",
  "severity":"轻度/中度/重度/待确认",
  "repairability":"高/中/低/待确认",
  "reversible":"高/中/低/待确认",
  "evidence":["可核验观察"],
  "observations":[{{"time":"视频时间点或图片整体","observation":"观察"}}],
  "hypotheses":[{{"name":"可能原因","probability":整数,"evidence":"支持证据","needs_confirmation":"仍需确认"}}],
  "question":"唯一关键追问",
  "safety":"没有明确风险则为空字符串",
  "matches":[],
  "routes":{{
    "rescue":{{"recommended":false,"summary":"适用性和做法","steps":["安全步骤"]}},
    "transform":{{"recommended":false,"summary":"适用性和做法","steps":["步骤"]}},
    "restart":{{"recommended":false,"summary":"适用性和做法","steps":["步骤"]}},
    "stop":{{"recommended":false,"summary":"停止条件","steps":["安全动作"]}}
  }}
}}
""".strip()


def extract_audio_track(video_data: bytes, suffix: str = ".mp4") -> bytes | None:
    """Extract a compact mono track so speech remains an explicit model input."""
    ffmpeg = VIDEO_JOBS.ffmpeg
    if not ffmpeg:
        return None
    input_path = output_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as source:
            source.write(video_data)
            input_path = source.name
        output_path = input_path + ".mp3"
        completed = subprocess.run(
            [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", input_path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "40k", output_path],
            capture_output=True,
            timeout=90,
            check=False,
        )
        if completed.returncode != 0 or not Path(output_path).is_file():
            return None
        return Path(output_path).read_bytes()
    except (OSError, subprocess.SubprocessError):
        return None
    finally:
        for candidate in [input_path, output_path]:
            if candidate:
                try:
                    Path(candidate).unlink(missing_ok=True)
                except OSError:
                    pass


def build_media_contents(field: cgi.FieldStorage, kind: str) -> list[dict[str, Any]]:
    data = field.file.read()
    if not data:
        raise ApiError(400, "EMPTY_MEDIA", "上传的媒体文件为空")
    content_type = field.type or "application/octet-stream"
    if kind == "video" or content_type.startswith("video/"):
        items: list[dict[str, Any]] = [{"type": "input_video", "video_url": data_url(data, content_type), "fps": 2.0}]
        suffix = Path(getattr(field, "filename", "") or "video.mp4").suffix or ".mp4"
        audio = extract_audio_track(data, suffix) if ARK_EXPLICIT_AUDIO else None
        if audio:
            items.extend([
                {"type": "input_text", "text": "这是同一视频单独提取的音轨。请转写与失败目标、步骤、异常有关的口播，并和画面/字幕联合判断；不要把它当成另一件案例。"},
                {"type": "input_audio", "audio_url": data_url(audio, "audio/mpeg")},
            ])
        return items
    if kind == "audio" or content_type.startswith("audio/"):
        return [{"type": "input_audio", "audio_url": data_url(data, content_type)}]
    return [{"type": "input_image", "image_url": data_url(data, content_type), "detail": "high"}]


def analyze_form(form: cgi.FieldStorage) -> dict[str, Any]:
    media_field = form["image"] if "image" in form else None
    if media_field is None or not getattr(media_field, "file", None):
        raise ApiError(400, "MEDIA_REQUIRED", "缺少 image 媒体字段")
    content_type = media_field.type or ""
    media_kind = "video" if content_type.startswith("video/") else "audio" if content_type.startswith("audio/") else "image"
    fields = {key: form.getfirst(key, "") for key in ["description", "target", "constraints", "source_url", "source_time", "region"]}
    content: list[dict[str, Any]] = build_media_contents(media_field, media_kind)
    if "target_image" in form and getattr(form["target_image"], "file", None):
        content.append({"type": "input_text", "text": "下面是用户提供的目标效果图，请与翻车现场对比。"})
        content.extend(build_media_contents(form["target_image"], "image"))
    content.append({"type": "input_text", "text": analysis_prompt(fields, media_kind)})
    response = ark_request(
        {
            "model": ARK_MODEL,
            "input": [{"type": "message", "role": "user", "content": content}],
            "max_output_tokens": 6000,
            "thinking": {"type": "disabled"},
        }
    )
    raw = structured_output(response)
    missing = incomplete_analysis(raw)
    if missing:
        try:
            raw = repair_analysis_schema(raw, missing)
        except ApiError:
            # The original model observations remain useful. normalize_analysis
            # exposes uncertain fields honestly instead of discarding the run.
            pass
    result = normalize_analysis(raw)
    ANALYSES[result["id"]] = result
    return result


def follow_up(case_id: str, body: dict[str, Any]) -> dict[str, Any]:
    current = ANALYSES.get(case_id)
    if not current:
        raise ApiError(404, "ANALYSIS_NOT_FOUND", "本地服务已重启或找不到这次分析，请重新上传")
    prompt = f"""
你正在更新一份多模态失败鉴定。以下是原鉴定 JSON：
{json.dumps(current, ensure_ascii=False)}

用户回答了关键追问：
问题：{body.get('question', current.get('question', ''))}
回答：{body.get('answer', '')}

根据新证据更新 hypotheses 概率、evidence、question、safety 和 routes。不要改变媒体中已确认的失败指纹字段，除非答案直接纠正了它。概率总和为100。只输出与原结构相同的完整 JSON，不要 Markdown。
""".strip()
    response = ark_request({"model": ARK_MODEL, "input": prompt, "max_output_tokens": 5000, "thinking": {"type": "disabled"}})
    result = normalize_analysis(structured_output(response), case_id=case_id)
    ANALYSES[case_id] = result
    return result


def verify_form(case_id: str, form: cgi.FieldStorage) -> dict[str, Any]:
    current = ANALYSES.get(case_id)
    if not current:
        raise ApiError(404, "ANALYSIS_NOT_FOUND", "本地服务已重启或找不到这次分析，请重新上传")
    media_field = form["image"] if "image" in form else None
    if media_field is None or not getattr(media_field, "file", None):
        raise ApiError(400, "MEDIA_REQUIRED", "缺少复拍 image 字段")
    step = form.getfirst("step", "0")
    prompt = f"""
你是翻车博物馆的步骤复核 Agent。原鉴定为：
{json.dumps(current, ensure_ascii=False)}

用户提交了第 {step} 步之后的复拍。只判断当前画面是否提供了足够证据证明该步骤完成，不要把“画面改善”夸大为最终抢救成功。只输出 JSON：
{{"passed":true或false,"title":"短结论","message":"可核验的视觉依据和下一步建议","needsAnotherView":true或false}}
""".strip()
    content = build_media_contents(media_field, "image")
    content.append({"type": "input_text", "text": prompt})
    response = ark_request({"model": ARK_MODEL, "input": [{"type": "message", "role": "user", "content": content}], "max_output_tokens": 1000, "thinking": {"type": "disabled"}})
    result = structured_output(response)
    return {
        "passed": bool(result.get("passed", False)),
        "title": str(result.get("title", "视觉复核结果")),
        "message": str(result.get("message", "模型未提供具体复核依据")),
        "needsAnotherView": bool(result.get("needsAnotherView", result.get("needs_another_view", False))),
    }


def compact_search_text(value: Any) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", str(value or "").lower())


def text_ngrams(value: Any, size: int = 2) -> set[str]:
    text = compact_search_text(value)
    if len(text) < size:
        return {text} if text else set()
    return {text[index:index + size] for index in range(len(text) - size + 1)}


def signal_match(signal: str, candidate: str) -> float:
    signal_text, candidate_text = compact_search_text(signal), compact_search_text(candidate)
    if not signal_text or not candidate_text:
        return 0.0
    if signal_text in candidate_text:
        return 1.0
    grams = text_ngrams(signal_text)
    return len(grams & text_ngrams(candidate_text)) / len(grams) if grams else 0.0


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def screen_redfox_items(items: list[dict[str, Any]], keyword: str, fingerprint: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    signals = [keyword]
    for key in ("shortName", "anomaly", "area", "stage", "target"):
        value = fingerprint.get(key)
        if isinstance(value, str) and value.strip():
            signals.append(value.strip())
    hypotheses = fingerprint.get("hypotheses")
    if isinstance(hypotheses, list):
        for item in hypotheses[:2]:
            value = item.get("name") if isinstance(item, dict) else item
            if value:
                signals.append(str(value).strip())
    signals = list(dict.fromkeys(signal for signal in signals if signal))[:8]
    intent_words = ("翻车", "失败", "补救", "修复", "改造", "避坑", "教程", "怎么", "解决")
    scored: list[dict[str, Any]] = []
    for source in items:
        item = dict(source)
        title = str(item.get("title") or "")
        content = str(item.get("content") or "")
        comments = " ".join(str(value) for value in (item.get("commentTopKeywords") or []) if value)
        title_match = max((signal_match(signal, title) for signal in signals), default=0.0)
        content_match = max((signal_match(signal, content) for signal in signals), default=0.0)
        comment_match = max((signal_match(signal, comments) for signal in signals), default=0.0)
        combined = compact_search_text(title + content)
        intent_hits = sum(1 for word in intent_words if word in combined)
        engagement = max(0, safe_int(item.get("likeCount"))) + max(0, safe_int(item.get("collectCount"))) * 2 + max(0, safe_int(item.get("commentCount")))
        score = title_match * 42 + content_match * 25 + comment_match * 16 + min(9, intent_hits * 3)
        score += min(5, math.log10(engagement + 1))
        if safe_int(item.get("isPromotion")) == 1:
            score -= 5
        reasons: list[str] = []
        if title_match >= 0.45:
            reasons.append("标题命中失败指纹")
        if content_match >= 0.45:
            reasons.append("正文描述相关过程")
        if comment_match >= 0.45:
            reasons.append("评论热词出现相关异常")
        if intent_hits:
            reasons.append("包含教程或补救意图")
        if not reasons:
            reasons.append("与核心关键词存在部分重合")
        item["relevanceScore"] = max(0, min(100, round(score)))
        item["relevanceReasons"] = reasons[:3]
        scored.append(item)

    scored.sort(key=lambda item: (item["relevanceScore"], safe_int(item.get("likeCount"))), reverse=True)
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    author_counts: dict[str, int] = {}
    for item in scored:
        identity = str(item.get("workId") or compact_search_text(item.get("title")))
        if not identity or identity in seen:
            continue
        author = str(item.get("authorId") or item.get("accountName") or "")
        if author and author_counts.get(author, 0) >= 2:
            continue
        seen.add(identity)
        if author:
            author_counts[author] = author_counts.get(author, 0) + 1
        selected.append(item)
        if len(selected) >= limit:
            break
    return selected


def redfox_search(body: dict[str, Any]) -> dict[str, Any]:
    keyword = str(body.get("keyword", "")).strip()
    if not keyword:
        raise ApiError(400, "KEYWORD_REQUIRED", "搜索关键词不能为空")
    if len(keyword) > 100:
        raise ApiError(400, "KEYWORD_TOO_LONG", "搜索关键词不能超过 100 个字符")
    try:
        offset = int(body.get("offset", 0))
    except (TypeError, ValueError) as error:
        raise ApiError(400, "INVALID_OFFSET", "offset 必须是非负整数") from error
    if offset < 0:
        raise ApiError(400, "INVALID_OFFSET", "offset 必须是非负整数")
    sort_type = str(body.get("sortType", "default")).strip() or "default"
    if len(sort_type) > 40 or not re.fullmatch(r"[A-Za-z0-9_-]+", sort_type):
        raise ApiError(400, "INVALID_SORT_TYPE", "sortType 格式不正确")
    fingerprint = body.get("fingerprint") if isinstance(body.get("fingerprint"), dict) else {}
    try:
        limit = max(1, min(20, int(body.get("limit", 6))))
    except (TypeError, ValueError) as error:
        raise ApiError(400, "INVALID_LIMIT", "limit 必须是 1 到 20 的整数") from error

    cache_key = json.dumps([keyword, offset, sort_type], ensure_ascii=False)
    if len(REDFOX_CACHE) > 256:
        expired_keys = [key for key, value in REDFOX_CACHE.items() if time.time() - value[0] >= REDFOX_CACHE_SECONDS]
        for key in expired_keys:
            REDFOX_CACHE.pop(key, None)
        while len(REDFOX_CACHE) > 256:
            REDFOX_CACHE.pop(min(REDFOX_CACHE, key=lambda key: REDFOX_CACHE[key][0]), None)
    cached = REDFOX_CACHE.get(cache_key)
    cache_hit = bool(cached and time.time() - cached[0] < REDFOX_CACHE_SECONDS)
    network_started = time.perf_counter()
    if cache_hit:
        external = cached[1]
    else:
        request = urllib.request.Request(
            f"{REDFOX_BASE_URL}/story/api/dyData/searchArticle",
            data=json.dumps({"keyword": keyword, "offset": offset, "sortType": sort_type}, ensure_ascii=False).encode("utf-8"),
            headers={"REDFOX_API_KEY": redfox_api_key(), "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                external = json.load(response)
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", errors="replace")
            raise ApiError(502, "REDFOX_HTTP_ERROR", "抖音作品检索服务请求失败", raw[:500]) from error
        except urllib.error.URLError as error:
            raise ApiError(502, "REDFOX_NETWORK_ERROR", "无法连接抖音作品检索服务", str(error.reason)) from error
        except json.JSONDecodeError as error:
            raise ApiError(502, "REDFOX_INVALID_JSON", "抖音作品检索服务返回了无效 JSON", str(error)) from error
        REDFOX_CACHE[cache_key] = (time.time(), external)
    network_elapsed_ms = round((time.perf_counter() - network_started) * 1000, 2)

    if not isinstance(external, dict):
        raise ApiError(502, "REDFOX_INVALID_SCHEMA", "抖音作品检索服务返回结构不正确")
    if external.get("code") != 2000:
        message = str(external.get("msg", external.get("message", "第三方服务未返回成功状态")))
        raise ApiError(502, "REDFOX_API_ERROR", "抖音作品检索未成功", message[:500])
    data = external.get("data") if isinstance(external.get("data"), dict) else {}
    source_items = data.get("list") if isinstance(data.get("list"), list) else []
    allowed_fields = (
        "workId", "title", "content", "workUrl", "coverUrl", "audioUrl", "workType", "duration",
        "publishTime", "repostCount", "commentCount", "shareCount", "likeCount", "collectCount",
        "commentTopKeywords", "isPromotion", "authorId", "accountName", "authorLink", "authorUrl",
        "followerCount", "crawlTime", "accountType",
    )
    items = [{key: item.get(key) for key in allowed_fields} for item in source_items if isinstance(item, dict)]
    screening_started = time.perf_counter()
    selected_items = screen_redfox_items(items, keyword, fingerprint, limit)
    screening_elapsed_ms = round((time.perf_counter() - screening_started) * 1000, 2)
    has_more = data.get("hasMore", False)
    return {
        "keyword": keyword,
        "offset": offset,
        "sortType": sort_type,
        "total": data.get("total", len(items)),
        "hasMore": bool(has_more),
        "retrievedCount": len(items),
        "selectedCount": len(selected_items),
        "items": selected_items,
        "screening": {"mode": "metadata-fingerprint-v1", "elapsedMs": screening_elapsed_ms},
        "delivery": {"cacheHit": cache_hit, "networkElapsedMs": network_elapsed_ms, "cacheTtlSeconds": REDFOX_CACHE_SECONDS},
        "source": "redfox-douyin-quality-library",
    }


class MuseumHandler(BaseHTTPRequestHandler):
    server_version = "FailureMuseumLocal/1.0"

    def log_message(self, format_string: str, *args: Any) -> None:
        # 不记录 Authorization、请求体或用户媒体。
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), format_string % args))

    def send_json(self, status: int, value: dict[str, Any]) -> None:
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def handle_api_error(self, error: ApiError) -> None:
        self.send_json(error.status, {"error": {"code": error.code, "message": error.message, "detail": error.detail}})

    def do_GET(self) -> None:  # noqa: N802
        path = urllib.parse.urlsplit(self.path).path
        if path == "/api/v1/health":
            self.send_json(
                200,
                {
                    "ok": True,
                    "arkConfigured": bool(os.getenv("ARK_API_KEY", "").strip()),
                    "redfoxConfigured": bool(os.getenv("REDFOX_API_KEY", "").strip()),
                    "model": ARK_MODEL,
                    "imageModel": ARK_IMAGE_MODEL,
                    "provider": "volcengine-ark",
                    "ffmpegAvailable": VIDEO_JOBS.available,
                    "videoTemplates": [{"id": key, **value} for key, value in VIDEO_TEMPLATES.items()],
                },
            )
            return
        video_job_match = re.fullmatch(r"/api/v1/video-jobs/(video-[a-f0-9]{16})", path)
        if video_job_match:
            job = VIDEO_JOBS.public_job(video_job_match.group(1))
            if not job:
                self.handle_api_error(ApiError(404, "VIDEO_JOB_NOT_FOUND", "找不到本地视频任务"))
                return
            self.send_json(200, job)
            return
        video_file_match = re.fullmatch(r"/api/v1/video-jobs/(video-[a-f0-9]{16})/file", path)
        if video_file_match:
            output = VIDEO_JOBS.output_path(video_file_match.group(1))
            if not output:
                self.handle_api_error(ApiError(404, "VIDEO_NOT_READY", "本地成片尚未生成"))
                return
            size = output.stat().st_size
            download = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("download") == ["1"]
            start, end = 0, size - 1
            range_header = self.headers.get("Range", "")
            range_match = re.fullmatch(r"bytes=(\d+)-(\d*)", range_header)
            if range_match:
                start = int(range_match.group(1))
                end = int(range_match.group(2)) if range_match.group(2) else size - 1
                if start >= size or end < start:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return
                end = min(end, size - 1)
            length = end - start + 1
            self.send_response(206 if range_match else 200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            if range_match:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Disposition", ("attachment" if download else "inline") + '; filename="failure-museum.mp4"')
            self.end_headers()
            with output.open("rb") as stream:
                stream.seek(start)
                remaining = length
                while remaining:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            return
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/web/")
            self.end_headers()
            return
        self.serve_static(path)

    def do_POST(self) -> None:  # noqa: N802
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length > MAX_UPLOAD_BYTES:
                raise ApiError(413, "UPLOAD_TOO_LARGE", f"单次上传不能超过 {MAX_UPLOAD_BYTES // 1024 // 1024}MB")
            path = urllib.parse.urlsplit(self.path).path
            if path == "/api/v1/video-jobs":
                if "multipart/form-data" not in self.headers.get("Content-Type", ""):
                    raise ApiError(400, "MULTIPART_REQUIRED", "本地成片接口需要 multipart/form-data")
                form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers.get("Content-Type", ""), "CONTENT_LENGTH": str(length)}, keep_blank_values=True)
                media_field = form["media"] if "media" in form else None
                if media_field is None or not getattr(media_field, "file", None):
                    raise ApiError(400, "MEDIA_REQUIRED", "缺少用于成片的 media 文件")
                metadata_text = form.getfirst("metadata", "{}")
                metadata = json.loads(metadata_text)
                if not isinstance(metadata, dict):
                    raise ApiError(400, "INVALID_METADATA", "metadata 必须是 JSON 对象")
                after_field = form["after_media"] if "after_media" in form else None
                after_bytes = after_field.file.read() if after_field is not None and getattr(after_field, "file", None) else None
                try:
                    job = VIDEO_JOBS.create_job(
                        media=media_field.file.read(),
                        filename=media_field.filename or "source.jpg",
                        content_type=media_field.type or "application/octet-stream",
                        metadata=metadata,
                        template_id=form.getfirst("template_id", "documentary-20"),
                        after_media=after_bytes,
                        after_filename=(after_field.filename or "after.jpg") if after_field is not None else "after.jpg",
                        after_content_type=(after_field.type or "image/jpeg") if after_field is not None else "image/jpeg",
                    )
                except ValueError as error:
                    raise ApiError(400, "INVALID_VIDEO_TEMPLATE", str(error)) from error
                except RuntimeError as error:
                    raise ApiError(503, "FFMPEG_UNAVAILABLE", str(error)) from error
                self.send_json(202, job)
                return
            if path == "/api/v1/douyin/search":
                if "application/json" not in self.headers.get("Content-Type", ""):
                    raise ApiError(400, "JSON_REQUIRED", "检索接口需要 application/json")
                raw = self.rfile.read(length)
                body = json.loads(raw.decode("utf-8")) if raw else {}
                self.send_json(200, redfox_search(body))
                return
            if path == "/api/v1/artifacts/generate":
                if "application/json" not in self.headers.get("Content-Type", ""):
                    raise ApiError(400, "JSON_REQUIRED", "摆件生成接口需要 application/json")
                raw = self.rfile.read(length)
                body = json.loads(raw.decode("utf-8")) if raw else {}
                if not isinstance(body, dict):
                    raise ApiError(400, "INVALID_JSON", "请求必须是 JSON 对象")
                self.send_json(200, generate_artifact(body))
                return
            if path == "/api/v1/cases/analyze":
                if "multipart/form-data" not in self.headers.get("Content-Type", ""):
                    raise ApiError(400, "MULTIPART_REQUIRED", "分析接口需要 multipart/form-data")
                form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers.get("Content-Type", ""), "CONTENT_LENGTH": str(length)}, keep_blank_values=True)
                self.send_json(200, analyze_form(form))
                return
            verify_match = re.fullmatch(r"/api/v1/cases/([^/]+)/verify", path)
            if verify_match:
                if "multipart/form-data" not in self.headers.get("Content-Type", ""):
                    raise ApiError(400, "MULTIPART_REQUIRED", "验证接口需要 multipart/form-data")
                form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers.get("Content-Type", ""), "CONTENT_LENGTH": str(length)}, keep_blank_values=True)
                self.send_json(200, verify_form(urllib.parse.unquote(verify_match.group(1)), form))
                return
            match = re.fullmatch(r"/api/v1/cases/([^/]+)/follow-up", path)
            if match:
                raw = self.rfile.read(length)
                body = json.loads(raw.decode("utf-8")) if raw else {}
                self.send_json(200, follow_up(urllib.parse.unquote(match.group(1)), body))
                return
            raise ApiError(404, "NOT_FOUND", "接口不存在")
        except ApiError as error:
            self.handle_api_error(error)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            self.handle_api_error(ApiError(400, "INVALID_JSON", "请求 JSON 格式错误", str(error)))
        except Exception as error:  # 保留本地调试信息，但不泄露密钥。
            traceback.print_exc()
            self.handle_api_error(ApiError(500, "LOCAL_SERVER_ERROR", "本地服务处理失败", str(error)))

    def serve_static(self, url_path: str) -> None:
        decoded = urllib.parse.unquote(url_path).lstrip("/")
        candidate = (ROOT / decoded).resolve()
        if candidate.is_dir():
            candidate = candidate / "index.html"
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            self.send_error(403)
            return
        if not candidate.is_file():
            self.send_error(404)
            return
        content = candidate.read_bytes()
        content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        if candidate.suffix in {".js", ".json", ".css", ".html"}:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store" if candidate.suffix in {".js", ".json", ".css", ".html"} else "public, max-age=3600")
        self.end_headers()
        self.wfile.write(content)


def main() -> None:
    configured = bool(os.getenv("ARK_API_KEY", "").strip())
    redfox_configured = bool(os.getenv("REDFOX_API_KEY", "").strip())
    print(f"翻车博物馆本地服务：http://{HOST}:{PORT}/web/")
    print(f"方舟模型：{ARK_MODEL}；API Key：{'已配置' if configured else '未配置'}")
    print(f"抖音作品检索：{'已配置' if redfox_configured else '未配置'}")
    if not configured:
        print("提示：未配置密钥时页面可运行，自选图片的真实 AI 分析会返回配置提示。")
    server = ThreadingHTTPServer((HOST, PORT), MuseumHandler)
    if os.getenv("MUSEUM_OPEN_BROWSER", "1") != "0":
        webbrowser.open(f"http://{HOST}:{PORT}/web/")
    server.serve_forever()


if __name__ == "__main__":
    main()
