"""
C108 1日目サークルマップ 下地テンプレート生成スクリプト
- 入力: data/c108_day1.json (ホール・島構成・サークル番号形式の事実データ)
- 出力: templates/ 配下の SVG ファイル（Inkscape で島の外形を描き込むためのガイド）

テンプレートの内容:
- ホールの外枠（実寸比率に近い）
- 島の位置ガイド（点線の長方形。ユーザーがここに島の外形を描く）
- 島名ラベル（ス, シ, サ... / A, B, C... など）
- サークル番号のヒント（各島内にどの番号を振るかの目安）
"""

import json
import os
import sys

HALL_STROKE = "#334155"
GUIDE_STROKE = "#94a3b8"
GUIDE_FILL = "#f1f5f9"
TEXT_COLOR = "#475569"
HINT_COLOR = "#94a3b8"
BACKGROUND = "#ffffff"


def svg_escape(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_circle_numbers(number_cfg, per_island):
    fmt = number_cfg.get("format", "digit")
    start = number_cfg.get("start", 1)
    if fmt == "digit_suffix":
        rows = per_island // 2
        cells = []
        for r in range(rows):
            n = start + r
            cells.append(f"{n:02d}a")
            cells.append(f"{n:02d}b")
        return cells
    return [str(start + i) for i in range(per_island)]


def generate_hall_template(hall, width, height, filepath):
    """1ホール分の下地テンプレートを生成"""
    name = hall["name"]
    islands = hall["islands"]
    number_cfg = hall.get("number", {"format": "digit", "start": 1})
    per_island = number_cfg.get("perIsland", 16)

    svg = []
    svg.append('<?xml version="1.0" encoding="utf-8" ?>')
    svg.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
    )
    svg.append("<defs>")
    svg.append("<style>")
    svg.append("  .bg { fill: " + BACKGROUND + "; }")
    svg.append("  .title { font-family: sans-serif; font-size: 40px; font-weight: bold; fill: " + TEXT_COLOR + "; }")
    svg.append("  .hall { fill: none; stroke: " + HALL_STROKE + "; stroke-width: 3; }")
    svg.append("  .hall-label { font-family: sans-serif; font-size: 30px; font-weight: bold; fill: " + TEXT_COLOR + "; text-anchor: middle; }")
    svg.append("  .island-guide { fill: " + GUIDE_FILL + "; stroke: " + GUIDE_STROKE + "; stroke-width: 1.5; stroke-dasharray: 6,4; }")
    svg.append("  .island-label { font-family: sans-serif; font-size: 24px; font-weight: bold; fill: " + TEXT_COLOR + "; text-anchor: middle; dominant-baseline: central; }")
    svg.append("  .number-hint { font-family: sans-serif; font-size: 12px; fill: " + HINT_COLOR + "; text-anchor: middle; dominant-baseline: central; }")
    svg.append("  .note { font-family: sans-serif; font-size: 18px; fill: " + HINT_COLOR + "; }")
    svg.append("</style>")
    svg.append("</defs>")
    svg.append(f'<rect class="bg" x="0" y="0" width="{width}" height="{height}" />')
    svg.append(f'<text class="title" x="30" y="55">{svg_escape(name)} ホール 下地テンプレート</text>')
    svg.append(f'<text class="note" x="30" y="90">点線の長方形が島の位置ガイドです。Inkscapeでこの上に島の外形を描いてください。</text>')

    margin_x = 40
    margin_y = 120
    content_w = width - margin_x * 2
    content_h = height - margin_y - 60
    island_count = len(islands)
    if island_count == 0:
        return None

    island_gap = 12
    island_w = (content_w - island_gap * (island_count - 1)) / island_count
    island_h = content_h

    for b_idx, island_name in enumerate(islands):
        ix = margin_x + b_idx * (island_w + island_gap)
        iy = margin_y

        # 島の位置ガイド（点線）
        svg.append(f'<rect class="island-guide" x="{ix:.1f}" y="{iy:.1f}" width="{island_w:.1f}" height="{island_h:.1f}" rx="4" />')
        svg.append(f'<text class="island-label" x="{ix + island_w / 2:.1f}" y="{iy + 28:.1f}">{svg_escape(island_name)}</text>')

        # サークル番号のヒント
        numbers = build_circle_numbers(number_cfg, per_island)
        if numbers:
            hint_text = ", ".join(numbers[:8])
            svg.append(
                f'<text class="number-hint" x="{ix + island_w / 2:.1f}" y="{iy + 55:.1f}">'
                f'{svg_escape(hint_text)}...</text>'
            )

    svg.append("</svg>")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(svg))
    print(f"Generated {filepath}")


def generate_all_templates(json_path, out_dir):
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    os.makedirs(out_dir, exist_ok=True)

    for area in data["areas"]:
        for hall in area["halls"]:
            name = hall["name"]
            filename = os.path.join(out_dir, f"template_{area['id']}_{name}.svg")
            generate_hall_template(hall, 2200, 1400, filename)

    print("Done.")


if __name__ == "__main__":
    repo_root = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(repo_root, "data", "c108_day1.json")
    out_dir = os.path.join(repo_root, "templates")
    if len(sys.argv) > 1:
        json_path = sys.argv[1]
    if len(sys.argv) > 2:
        out_dir = sys.argv[2]
    generate_all_templates(json_path, out_dir)
