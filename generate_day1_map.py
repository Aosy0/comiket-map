"""
C108 1日目サークルマップ SVG 生成スクリプト
- 入力: data/c108_day1.json (ホール・島構成・サークル番号形式の事実データ)
- 出力: app/maps/ 配下の SVG ファイル

デザイン方針:
- 画像・外部フォント・フレームワークを使わない軽量SVG
- 著作権配慮: 公式PDFの配色・フォント・装飾は使わず、ホール構造と配置という事実のみを表現
- 公式マップの構造に合わせ、ホール内に「島（ブロック）」を配置し、各島の中にサークル番号を表示
- フラットでシンプルな配色（省電力・低描画コスト）
"""

import json
import os
import sys

AREA_COLORS = {
    "east123": "#e8f5e9",
    "east7": "#fff3e0",
    "west12": "#e3f2fd",
    "south12": "#fff8e1",
}

HALL_STROKE = "#64748b"
ISLAND_STROKE = "#94a3b8"
CELL_STROKE = "#cbd5e1"
TEXT_COLOR = "#334155"
LABEL_COLOR = "#475569"
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
    """島内に表示するサークル番号のリストを生成する"""
    fmt = number_cfg.get("format", "digit")
    start = number_cfg.get("start", 1)
    if fmt == "digit_suffix":
        # 01a 01b / 02a 02b ... 形式（a=左列, b=右列）
        rows = per_island // 2
        cells = []
        for r in range(rows):
            n = start + r
            cells.append(f"{n:02d}a")
            cells.append(f"{n:02d}b")
        return cells
    # digit: 連番
    return [str(start + i) for i in range(per_island)]


def generate_area_svg(area, width=2000, height=1400):
    """1エリア分のSVGを生成（ホール内に島を配置し、島内にサークル番号を表示）"""
    area_id = area["id"]
    label = area["label"]
    halls = area["halls"]
    area_color = AREA_COLORS.get(area_id, "#f1f5f9")

    svg = []
    svg.append('<?xml version="1.0" encoding="utf-8" ?>')
    svg.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
    )
    svg.append("<defs>")
    svg.append("<style>")
    svg.append("  .area-bg { fill: " + BACKGROUND + "; }")
    svg.append("  .title { font-family: sans-serif; font-size: 44px; font-weight: bold; fill: " + TEXT_COLOR + "; }")
    svg.append("  .hall { fill: " + area_color + "; stroke: " + HALL_STROKE + "; stroke-width: 3; }")
    svg.append("  .hall-label { font-family: sans-serif; font-size: 34px; font-weight: bold; fill: " + LABEL_COLOR + "; text-anchor: middle; }")
    svg.append("  .island { fill: #ffffff; stroke: " + ISLAND_STROKE + "; stroke-width: 1.5; }")
    svg.append("  .island-label { font-family: sans-serif; font-size: 20px; font-weight: bold; fill: " + TEXT_COLOR + "; text-anchor: middle; dominant-baseline: central; }")
    svg.append("  .cell { fill: #f8fafc; stroke: " + CELL_STROKE + "; stroke-width: 0.5; }")
    svg.append("  .cell-label { font-family: sans-serif; font-size: 12px; fill: " + LABEL_COLOR + "; text-anchor: middle; dominant-baseline: central; }")
    svg.append("</style>")
    svg.append("</defs>")
    svg.append(f'<rect class="area-bg" x="0" y="0" width="{width}" height="{height}" />')
    svg.append(f'<text class="title" x="30" y="55">{svg_escape(label)}</text>')

    hall_count = len(halls)
    margin_x = 50
    margin_y = 100
    content_w = width - margin_x * 2
    content_h = height - margin_y - 60
    hall_w = content_w / hall_count - 24
    hall_h = content_h

    for i, hall in enumerate(halls):
        hx = margin_x + i * (hall_w + 24)
        hy = margin_y
        name = hall["name"]
        islands = hall["islands"]
        number_cfg = hall.get("number", {"format": "digit", "start": 1})
        per_island = number_cfg.get("perIsland", 16)

        # ホール枠
        svg.append(f'<rect class="hall" x="{hx:.1f}" y="{hy:.1f}" width="{hall_w:.1f}" height="{hall_h:.1f}" rx="8" />')
        svg.append(f'<text class="hall-label" x="{hx + hall_w / 2:.1f}" y="{hy + 32:.1f}">{svg_escape(name)}</text>')

        island_count = len(islands)
        if island_count == 0:
            continue

        # 島を横一列に配置
        island_gap = 8
        island_w = (hall_w - 2 * 16 - island_gap * (island_count - 1)) / island_count
        island_h = hall_h - 60  # ホール名ラベル分を除く

        for b_idx, island_name in enumerate(islands):
            ix = hx + 16 + b_idx * (island_w + island_gap)
            iy = hy + 50

            # 島（ブロック）の枠
            svg.append(f'<rect class="island" x="{ix:.1f}" y="{iy:.1f}" width="{island_w:.1f}" height="{island_h:.1f}" rx="3" />')
            svg.append(f'<text class="island-label" x="{ix + island_w / 2:.1f}" y="{iy + 18:.1f}">{svg_escape(island_name)}</text>')

            # 島の中にサークル番号をグリッド配置（2列×複数行）
            numbers = build_circle_numbers(number_cfg, per_island)
            if not numbers:
                continue
            cell_gap = 2
            cell_rows = len(numbers) // 2
            cell_cols = 2
            avail_w = island_w - 8
            avail_h = island_h - 34  # 島名ラベル分
            cell_w = (avail_w - cell_gap * (cell_cols - 1)) / cell_cols
            cell_h = (avail_h - cell_gap * (cell_rows - 1)) / cell_rows
            cell_h = min(cell_h, 22)  # 高さの上限

            for n_idx, num_text in enumerate(numbers):
                col = n_idx % 2
                row = n_idx // 2
                cx = ix + 4 + col * (cell_w + cell_gap)
                cy = iy + 28 + row * (cell_h + cell_gap)
                svg.append(
                    f'<rect class="cell" x="{cx:.1f}" y="{cy:.1f}" '
                    f'width="{cell_w:.1f}" height="{cell_h:.1f}" rx="1.5" />'
                )
                svg.append(f'<text class="cell-label" x="{cx + cell_w / 2:.1f}" y="{cy + cell_h / 2:.1f}">{svg_escape(num_text)}</text>')

    svg.append("</svg>")
    return "\n".join(svg)


def generate_all_maps(json_path, out_dir):
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    os.makedirs(out_dir, exist_ok=True)

    for idx, area in enumerate(data["areas"]):
        area_id = area["id"]
        svg_content = generate_area_svg(area)
        filename = os.path.join(out_dir, f"map_{area_id}.svg")
        with open(filename, "w", encoding="utf-8") as f:
            f.write(svg_content)
        print(f"Generated {filename}")

    generate_overview_svg(data, out_dir)
    print("Done.")


def generate_overview_svg(data, out_dir):
    """全体図SVG（ビッグサイトの配置: 東・西・南）"""
    width = 2400
    height = 1600
    svg = []
    svg.append('<?xml version="1.0" encoding="utf-8" ?>')
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">')
    svg.append("<defs>")
    svg.append("<style>")
    svg.append("  .bg { fill: #ffffff; }")
    svg.append("  .title { font-family: sans-serif; font-size: 52px; font-weight: bold; fill: " + TEXT_COLOR + "; }")
    svg.append("  .subtitle { font-family: sans-serif; font-size: 24px; fill: " + LABEL_COLOR + "; }")
    svg.append("  .hall { stroke: " + HALL_STROKE + "; stroke-width: 3; }")
    svg.append("  .hall-label { font-family: sans-serif; font-size: 30px; font-weight: bold; fill: " + TEXT_COLOR + "; text-anchor: middle; dominant-baseline: central; }")
    svg.append("  .island { fill: #ffffff; stroke: " + ISLAND_STROKE + "; stroke-width: 1; }")
    svg.append("  .island-label { font-family: sans-serif; font-size: 14px; fill: " + LABEL_COLOR + "; text-anchor: middle; dominant-baseline: central; }")
    svg.append("  .note { font-family: sans-serif; font-size: 18px; fill: #94a3b8; }")
    svg.append("</style>")
    svg.append("</defs>")
    svg.append(f'<rect class="bg" x="0" y="0" width="{width}" height="{height}" />')
    svg.append(f'<text class="title" x="30" y="70">{svg_escape(data["title"])}</text>')
    svg.append(f'<text class="subtitle" x="30" y="110">開催日: {svg_escape(data.get("date", ""))} (1日目)</text>')

    layout_positions = {
        "east123": {"x": 1350, "y": 250, "w": 950, "h": 480, "label": "東1-3"},
        "east7": {"x": 1350, "y": 780, "w": 950, "h": 480, "label": "東7"},
        "west12": {"x": 150, "y": 250, "w": 1000, "h": 1010, "label": "西1-2"},
        "south12": {"x": 300, "y": 1330, "w": 1300, "h": 190, "label": "南1-2"},
    }

    for area in data["areas"]:
        pos = layout_positions.get(area["id"])
        if not pos:
            continue
        color = AREA_COLORS.get(area["id"], "#f1f5f9")
        svg.append(f'<rect class="hall" fill="{color}" x="{pos["x"]}" y="{pos["y"]}" width="{pos["w"]}" height="{pos["h"]}" rx="8" />')
        svg.append(f'<text class="hall-label" x="{pos["x"] + pos["w"] / 2}" y="{pos["y"] + 40}">{svg_escape(pos["label"])}</text>')

        all_islands = []
        for hall in area["halls"]:
            all_islands.extend(hall["islands"])

        if all_islands:
            label_area_h = 60
            content_x = pos["x"] + 20
            content_y = pos["y"] + label_area_h
            content_w = pos["w"] - 40
            content_h = pos["h"] - label_area_h - 20
            island_gap = 4
            island_w = (content_w - island_gap * (len(all_islands) - 1)) / len(all_islands)
            for i, island_name in enumerate(all_islands):
                ix = content_x + i * (island_w + island_gap)
                svg.append(
                    f'<rect class="island" x="{ix:.1f}" y="{content_y:.1f}" '
                    f'width="{island_w:.1f}" height="{content_h:.1f}" rx="2" />'
                )
                svg.append(
                    f'<text class="island-label" x="{ix + island_w / 2:.1f}" y="{content_y + content_h / 2:.1f}">'
                    f'{svg_escape(island_name)}</text>'
                )

    svg.append(f'<text class="note" x="30" y="{height - 40}">{svg_escape(data.get("note", ""))}</text>')
    svg.append("</svg>")

    filename = os.path.join(out_dir, "map_overview.svg")
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(svg))
    print(f"Generated {filename}")


if __name__ == "__main__":
    repo_root = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(repo_root, "data", "c108_day1.json")
    out_dir = os.path.join(repo_root, "app", "maps")
    if len(sys.argv) > 1:
        json_path = sys.argv[1]
    if len(sys.argv) > 2:
        out_dir = sys.argv[2]
    generate_all_maps(json_path, out_dir)
