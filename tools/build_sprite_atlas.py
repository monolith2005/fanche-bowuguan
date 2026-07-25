"""Normalize source character sheets to fixed pixel-art cells and foot anchors."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "images" / "pixel-world" / "sprites"


def source_cell(image: Image.Image, columns: int, rows: int, column: int, row: int) -> Image.Image:
    left = round(image.width * column / columns)
    right = round(image.width * (column + 1) / columns)
    top = round(image.height * row / rows)
    bottom = round(image.height * (row + 1) / rows)
    return image.crop((left, top, right, bottom)).convert("RGBA")


def normalized(cell: Image.Image, size: tuple[int, int], visible_height: int, max_width: int, foot_y: int) -> Image.Image:
    bbox = cell.getchannel("A").getbbox()
    output = Image.new("RGBA", size, (0, 0, 0, 0))
    if not bbox:
        return output
    subject = cell.crop(bbox)
    scale = min(visible_height / subject.height, max_width / subject.width)
    width = max(1, round(subject.width * scale))
    height = max(1, round(subject.height * scale))
    subject = subject.resize((width, height), Image.Resampling.NEAREST)
    output.alpha_composite(subject, ((size[0] - width) // 2, foot_y - height))
    return output


def largest_alpha_component(cell: Image.Image) -> Image.Image:
    """Remove fragments that leaked across the source sheet's uneven cell edges."""
    alpha = cell.getchannel("A")
    pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if pixels[x, y] == 0 or (x, y) in seen:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < alpha.width and 0 <= ny < alpha.height and pixels[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            components.append(component)
    if not components:
        return cell
    keep = max(components, key=len)
    mask = Image.new("L", cell.size, 0)
    mask_pixels = mask.load()
    for x, y in keep:
        mask_pixels[x, y] = pixels[x, y]
    result = cell.copy()
    result.putalpha(mask)
    return result


def build_player() -> None:
    front_side = Image.open(SPRITES / "player-sheet.png").convert("RGBA")
    back = Image.open(SPRITES / "player-up-square.png").convert("RGBA")
    atlas = Image.new("RGBA", (128 * 4, 128 * 3), (0, 0, 0, 0))
    for direction in range(4):
        for frame in range(3):
            cell = source_cell(back, 3, 1, frame, 0) if direction == 3 else source_cell(front_side, 4, 3, direction, frame)
            atlas.alpha_composite(normalized(cell, (128, 128), 104, 78, 114), (direction * 128, frame * 128))
    atlas.save(SPRITES / "player-normalized.png", optimize=True)


def build_curators() -> None:
    source = Image.open(SPRITES / "curators.png").convert("RGBA")
    atlas = Image.new("RGBA", (96 * 6, 192), (0, 0, 0, 0))
    for index in range(6):
        cell = largest_alpha_component(source_cell(source, 6, 1, index, 0))
        atlas.alpha_composite(normalized(cell, (96, 192), 164, 78, 174), (index * 96, 0))
    atlas.save(SPRITES / "curators-normalized.png", optimize=True)


if __name__ == "__main__":
    build_player()
    build_curators()
    print("Built player-normalized.png and curators-normalized.png")
