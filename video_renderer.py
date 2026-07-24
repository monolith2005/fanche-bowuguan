"""FFmpeg based local renderer for free, one-click museum videos."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import textwrap
import threading
import time
import uuid
from pathlib import Path
from typing import Any


TEMPLATES = {
    "flash-15": {"name": "15秒事故快报", "duration": 15},
    "documentary-20": {"name": "20秒翻车纪录片", "duration": 20},
    "before-after-20": {"name": "20秒抢救前后对比", "duration": 20},
}


def discover_binary(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    local_app = Path(os.getenv("LOCALAPPDATA", ""))
    candidates = [local_app / "Microsoft" / "WinGet" / "Links" / f"{name}.exe"]
    packages = local_app / "Microsoft" / "WinGet" / "Packages"
    if packages.is_dir():
        candidates.extend(packages.glob(f"Gyan.FFmpeg*/*/bin/{name}.exe"))
        candidates.extend(packages.glob(f"Gyan.FFmpeg*/**/bin/{name}.exe"))
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def safe_extension(filename: str, content_type: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    allowed = {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm", ".mkv"}
    if suffix in allowed:
        return suffix
    return ".mp4" if content_type.startswith("video/") else ".jpg"


def wrapped(value: Any, width: int = 16, max_lines: int = 5) -> str:
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip()
    lines = textwrap.wrap(cleaned, width=width, break_long_words=True, break_on_hyphens=False)[:max_lines]
    return "\n".join(lines) or "待补充"


def ffmpeg_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:").replace("'", r"\'")


class VideoJobManager:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.ffmpeg = discover_binary("ffmpeg")
        self.jobs: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()
        self.render_slot = threading.Semaphore(1)
        self._load_existing_outputs()

    def _load_existing_outputs(self) -> None:
        for directory in self.root.glob("video-[a-f0-9]*"):
            if not directory.is_dir() or not re.fullmatch(r"video-[a-f0-9]{16}", directory.name):
                continue
            output = directory / "failure-museum.mp4"
            if not output.is_file():
                continue
            job_id = directory.name
            self.jobs[job_id] = {
                "id": job_id,
                "status": "completed",
                "progress": 100,
                "message": "本地成片已生成",
                "templateId": "local-existing",
                "templateName": "已生成本地成片",
                "createdAt": output.stat().st_mtime,
                "directory": str(directory),
                "source": "",
                "after": "",
                "output": str(output),
                "videoUrl": f"/api/v1/video-jobs/{job_id}/file",
                "downloadUrl": f"/api/v1/video-jobs/{job_id}/file?download=1",
                "error": "",
            }

    @property
    def available(self) -> bool:
        return bool(self.ffmpeg)

    def public_job(self, job_id: str) -> dict[str, Any] | None:
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                return None
            return {key: value for key, value in job.items() if key not in {"directory", "source", "after", "output"}}

    def output_path(self, job_id: str) -> Path | None:
        with self.lock:
            job = self.jobs.get(job_id)
            output = Path(job["output"]) if job and job.get("status") == "completed" else None
        return output if output and output.is_file() else None

    def create_job(
        self,
        media: bytes,
        filename: str,
        content_type: str,
        metadata: dict[str, Any],
        template_id: str,
        after_media: bytes | None = None,
        after_filename: str = "after.jpg",
        after_content_type: str = "image/jpeg",
    ) -> dict[str, Any]:
        if not self.available:
            raise RuntimeError("FFmpeg 未安装或无法找到")
        if template_id not in TEMPLATES:
            raise ValueError("未知视频模板")
        job_id = "video-" + uuid.uuid4().hex[:16]
        directory = self.root / job_id
        directory.mkdir(parents=True, exist_ok=False)
        source = directory / ("source" + safe_extension(filename, content_type))
        source.write_bytes(media)
        after: Path | None = None
        if after_media:
            after = directory / ("after" + safe_extension(after_filename, after_content_type))
            after.write_bytes(after_media)
        output = directory / "failure-museum.mp4"
        job = {
            "id": job_id,
            "status": "queued",
            "progress": 0,
            "message": "等待本地渲染",
            "templateId": template_id,
            "templateName": TEMPLATES[template_id]["name"],
            "createdAt": time.time(),
            "directory": str(directory),
            "source": str(source),
            "after": str(after) if after else "",
            "output": str(output),
            "videoUrl": "",
            "downloadUrl": "",
            "error": "",
        }
        with self.lock:
            self.jobs[job_id] = job
        threading.Thread(target=self._render, args=(job_id, metadata), daemon=True).start()
        return self.public_job(job_id) or {}

    def _update(self, job_id: str, **values: Any) -> None:
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id].update(values)

    def _render(self, job_id: str, metadata: dict[str, Any]) -> None:
        with self.render_slot:
            try:
                self._run_ffmpeg(job_id, metadata)
            except Exception as error:
                self._update(job_id, status="failed", message="本地渲染失败", error=str(error)[:1000])

    def _run_ffmpeg(self, job_id: str, metadata: dict[str, Any]) -> None:
        with self.lock:
            job = dict(self.jobs[job_id])
        directory = Path(job["directory"])
        source = Path(job["source"])
        after = Path(job["after"]) if job["after"] else None
        template = TEMPLATES[job["templateId"]]
        duration = int(template["duration"])
        font = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "msyh.ttc"
        if not font.is_file():
            font = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "simhei.ttf"
        if not font.is_file():
            raise RuntimeError("找不到可用于中文字幕的系统字体")

        primary = metadata.get("cause") or "原因仍待确认"
        route = metadata.get("route") or "请根据鉴定结果选择处置路线"
        steps = metadata.get("steps") if isinstance(metadata.get("steps"), list) else []
        cards = [
            ("title", "翻车博物馆\n" + wrapped(metadata.get("title"), 13, 3)),
            ("anomaly", "失败现场\n" + wrapped(metadata.get("anomaly"), 15, 4)),
            ("cause", "AI 鉴定\n" + wrapped(primary, 15, 4)),
            ("route", "处理路线\n" + wrapped(route + ("；" + "；".join(str(step) for step in steps[:2]) if steps else ""), 15, 5)),
            ("cta", "处理完成不等于自动成功\n复拍确认后，再收入馆藏"),
        ]
        text_paths: list[Path] = []
        for name, text in cards:
            path = directory / f"{name}.txt"
            path.write_text(text, encoding="utf-8")
            text_paths.append(path)

        image_suffixes = {".jpg", ".jpeg", ".png", ".webp"}
        command = [self.ffmpeg or "ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
        if source.suffix.lower() in image_suffixes:
            command += ["-loop", "1", "-framerate", "30", "-i", str(source)]
        else:
            command += ["-stream_loop", "-1", "-i", str(source)]
        if after:
            if after.suffix.lower() in image_suffixes:
                command += ["-loop", "1", "-framerate", "30", "-i", str(after)]
            else:
                command += ["-stream_loop", "-1", "-i", str(after)]

        base = "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x171512,fps=30"
        if after and job["templateId"] == "before-after-20":
            filter_parts = [
                f"[0:v]{base},trim=duration=10.4,setpts=PTS-STARTPTS[v0]",
                f"[1:v]{base},trim=duration=10.4,setpts=PTS-STARTPTS[v1]",
                "[v0][v1]xfade=transition=fade:duration=0.8:offset=9.6[bg]",
            ]
        else:
            filter_parts = [f"[0:v]{base},trim=duration={duration},setpts=PTS-STARTPTS[bg]"]

        font_arg = ffmpeg_path(font)
        intervals = [(0, 3), (3, 7), (7, 11), (11, duration - 2), (duration - 2, duration)]
        current = "bg"
        for index, (text_path, interval) in enumerate(zip(text_paths, intervals)):
            output_label = "vout" if index == len(text_paths) - 1 else f"v{index}"
            start, end = interval
            text_arg = ffmpeg_path(text_path)
            filter_parts.append(
                f"[{current}]drawbox=x=35:y=735:w=650:h=475:color=black@0.58:t=fill:enable='between(t\,{start}\,{end})',"
                f"drawtext=fontfile='{font_arg}':textfile='{text_arg}':fontcolor=white:fontsize=42:line_spacing=18:"
                f"x=(w-text_w)/2:y=790:enable='between(t\,{start}\,{end})'[{output_label}]"
            )
            current = output_label
        filter_parts.append("[vout]fade=t=in:st=0:d=0.5,fade=t=out:st=%s:d=0.5[final]" % (duration - 0.5))
        command += ["-filter_complex", ";".join(filter_parts), "-map", "[final]", "-map", "0:a?", "-t", str(duration)]
        command += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]
        command += ["-progress", "pipe:1", "-nostats", str(job["output"])]

        self._update(job_id, status="rendering", progress=2, message="正在生成免费本地成片")
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
        assert process.stdout is not None
        for line in process.stdout:
            key, _, value = line.strip().partition("=")
            if key in {"out_time_us", "out_time_ms"}:
                try:
                    progress = min(95, max(2, round(float(value) / 1_000_000 / duration * 100)))
                    self._update(job_id, progress=progress)
                except ValueError:
                    pass
        stderr = process.stderr.read() if process.stderr else ""
        return_code = process.wait()
        if return_code != 0 or not Path(job["output"]).is_file():
            raise RuntimeError(stderr.strip() or f"FFmpeg 退出码 {return_code}")
        self._update(
            job_id,
            status="completed",
            progress=100,
            message="本地成片已生成",
            videoUrl=f"/api/v1/video-jobs/{job_id}/file",
            downloadUrl=f"/api/v1/video-jobs/{job_id}/file?download=1",
        )
