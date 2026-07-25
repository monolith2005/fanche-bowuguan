import io
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import local_server  # noqa: E402


class SpriteAtlasTests(unittest.TestCase):
    def test_player_frames_share_visible_height_and_safe_anchor(self):
        atlas = Image.open(ROOT / "assets/images/pixel-world/sprites/player-normalized.png").convert("RGBA")
        heights = []
        for direction in range(4):
            for frame in range(3):
                cell = atlas.crop((direction * 128, frame * 128, (direction + 1) * 128, (frame + 1) * 128))
                bbox = cell.getchannel("A").getbbox()
                self.assertIsNotNone(bbox)
                heights.append(bbox[3] - bbox[1])
                self.assertEqual(bbox[3], 114)
        self.assertLessEqual(max(heights) - min(heights), 2)

    def test_curators_do_not_touch_cell_edges(self):
        atlas = Image.open(ROOT / "assets/images/pixel-world/sprites/curators-normalized.png").convert("RGBA")
        for index in range(6):
            bbox = atlas.crop((index * 96, 0, (index + 1) * 96, 192)).getchannel("A").getbbox()
            self.assertIsNotNone(bbox)
            self.assertGreater(bbox[0], 0)
            self.assertLess(bbox[2], 96)
            self.assertEqual(bbox[3], 174)


class ArtifactTests(unittest.TestCase):
    def test_green_background_becomes_transparent_128_png(self):
        image = Image.new("RGB", (256, 256), (0, 255, 0))
        ImageDraw.Draw(image).rectangle((80, 50, 176, 210), fill=(170, 70, 50))
        source = io.BytesIO()
        image.save(source, "PNG")
        output = Image.open(io.BytesIO(local_server.transparent_artifact(source.getvalue()))).convert("RGBA")
        self.assertEqual(output.size, (128, 128))
        self.assertEqual(output.getpixel((0, 0))[3], 0)
        self.assertGreater(output.getchannel("A").getbbox()[2], 64)

    def test_analysis_exposes_suggested_hall(self):
        raw = {
            "hall": "植物急救馆", "name": "叶子垂头", "target": "挺立叶片", "stage": "养护中",
            "anomaly": "叶片下垂", "area": "叶片", "severity": "中度", "reversible": "中",
            "question": "盆土现在是否潮湿？", "hypotheses": [{"name": "水分异常", "probability": 100}],
            "classificationReason": "异常集中在植株叶片和养护阶段。",
        }
        result = local_server.normalize_analysis(raw)
        self.assertEqual(result["suggestedHallId"], "plant")
        self.assertIn("植株", result["classificationReason"])


if __name__ == "__main__":
    unittest.main()
