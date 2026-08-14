"""
CircleMap_E7.svg（Inkscape 制作）にサークル番号を自動記入するスクリプト v4

【ズレの原因と修正】
従来は「テキストをグループ内に追加したのに、実表示座標（transform加算済み）で指定」していたため、
グループの transform が二重適用されて番号がズレていた。

【修正方針】
テキストは rect と同じ座標系（同じ transform グループのローカル座標）で配置する。
つまり rect の素の x/y を基準にテキスト座標を計算し、rect と同じ親グループに追加する。
これにより矩形と番号が必ず同じ位置関係になる。
"""

import json
import re
import sys
import xml.etree.ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"


def parse_translate(transform):
    """transform 属性から translate(x, y) を抽出。無ければ (0, 0)。"""
    if not transform:
        return (0.0, 0.0)
    m = re.search(r"translate\(\s*([-\d.]+)\s*[, ]\s*([-\d.]+)\s*\)", transform)
    if m:
        return (float(m.group(1)), float(m.group(2)))
    m = re.search(r"translate\(\s*([-\d.]+)\s*\)", transform)
    if m:
        return (float(m.group(1)), 0.0)
    return (0.0, 0.0)


def build_circle_numbers(number_cfg, per_island):
    fmt = number_cfg.get("format", "digit")
    start = number_cfg.get("start", 1)
    if fmt == "digit_suffix":
        rows = per_island // 2
        left = [f"{start + r:02d}a" for r in range(rows)]
        right = [f"{start + r:02d}b" for r in range(rows)]
        return left + right
    return [str(start + i) for i in range(per_island)]


def extract_rects(elem):
    """要素配下の rect を「ローカル座標」（transform加算なし）で抽出"""
    rects = []
    for r in elem.iter():
        if r.tag.endswith("}rect"):
            rects.append({
                "x": float(r.get("x", 0)),
                "y": float(r.get("y", 0)),
                "w": float(r.get("width", 0)),
                "h": float(r.get("height", 0)),
                "elem": r,
            })
    return rects


def sort_cells_by_grid(rects):
    """セルをグリッド順（左列上→下、右列上→下）にソート"""
    if not rects:
        return []
    xs = sorted(r["x"] for r in rects)
    clusters = []
    for r in sorted(rects, key=lambda r: r["x"]):
        placed = False
        for cluster in clusters:
            if abs(cluster[0] - r["x"]) < 1.0:
                cluster[1].append(r)
                placed = True
                break
        if not placed:
            clusters.append([r["x"], [r]])
    sorted_rects = []
    for _, col_rects in sorted(clusters, key=lambda c: c[0]):
        sorted_rects.extend(sorted(col_rects, key=lambda r: r["y"]))
    return sorted_rects


def collect_islands(layer2):
    """
    layer2 内の島（24セルのまとまり）を収集。
    各島の rect はローカル座標のままで保持し、追加先グループ（elem）も記録する。
    """
    islands = []
    for child in layer2:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag != "g":
            continue
        nested_groups = [c for c in child if c.tag.endswith("}g")]
        if nested_groups:
            for ng in nested_groups:
                rects = extract_rects(ng)
                if rects:
                    islands.append({"elem": ng, "rects": rects})
        else:
            rects = extract_rects(child)
            if rects:
                islands.append({"elem": child, "rects": rects})
    return islands


def get_absolute_position(elem):
    """要素から見た祖先の transform を累積し、絶対座標オフセットを計算"""
    tx, ty = 0.0, 0.0
    node = elem
    while node is not None:
        t = parse_translate(node.get("transform"))
        tx += t[0]
        ty += t[1]
        node = node.getparent() if hasattr(node, "getparent") else None
    return tx, ty


def inject_numbers(svg_path, json_path, out_path):
    # デフォルト名前空間として出力（ns0: 接頭辞を防ぐ）
    ET.register_namespace("", SVG_NS)
    tree = ET.parse(svg_path)
    root = tree.getroot()

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    east7 = None
    for area in data["areas"]:
        if area["id"] == "east7":
            east7 = area
            break
    if east7 is None or not east7["halls"]:
        print("east7 data not found in JSON")
        return
    hall = east7["halls"][0]
    island_names = hall["islands"]
    number_cfg = hall.get("number", {"format": "digit", "start": 1})
    per_island = number_cfg.get("perIsland", 24)

    layer2 = None
    for elem in root.iter():
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if tag == "g" and elem.get("id") == "layer2":
            layer2 = elem
            break
    if layer2 is None:
        print("layer2 not found")
        return

    islands = collect_islands(layer2)
    # 島の順序を「絶対位置の y → x」でソート
    def island_sort_key(ig):
        abs_pos = []
        for r in ig["rects"]:
            tx, ty = get_absolute_position(r["elem"])
            abs_pos.append((r["x"] + tx, r["y"] + ty))
        min_y = min(p[1] for p in abs_pos)
        min_x = min(p[0] for p in abs_pos)
        return (min_y, min_x)
    islands.sort(key=island_sort_key)
    print(f"島グループ: {len(islands)}個, 島名: {len(island_names)}個")

    text_count = 0
    for i, island in enumerate(islands[: len(island_names)]):
        island_name = island_names[i]
        cells = sort_cells_by_grid(island["rects"])
        numbers = build_circle_numbers(number_cfg, per_island)

        # 島名ラベル: セルの最小 y より上（ローカル座標）
        bbox_min_y = min(r["y"] for r in cells)
        bbox_min_x = min(r["x"] for r in cells)
        bbox_max_x = max(r["x"] + r["w"] for r in cells)
        cx = (bbox_min_x + bbox_max_x) / 2

        label_el = ET.SubElement(island["elem"], f"{{{SVG_NS}}}text")
        label_el.set("x", f"{cx:.3f}")
        label_el.set("y", f"{bbox_min_y - 1.5:.3f}")
        label_el.set("font-family", "sans-serif")
        label_el.set("font-size", "4")
        label_el.set("font-weight", "bold")
        label_el.set("text-anchor", "middle")
        label_el.set("fill", "#333333")
        label_el.text = island_name
        text_count += 1

        for j, cell in enumerate(cells[: len(numbers)]):
            num_text = numbers[j]
            # ローカル座標（rect の素の x/y）で指定 → 同じグループに追加
            tx = cell["x"] + cell["w"] / 2
            ty = cell["y"] + cell["h"] / 2 + 1.1
            cell["elem"].set("data-circle", f"東7-{island_name}-{num_text}")
            cell["elem"].set("data-island", island_name)
            t_el = ET.SubElement(island["elem"], f"{{{SVG_NS}}}text")
            t_el.set("x", f"{tx:.3f}")
            t_el.set("y", f"{ty:.3f}")
            t_el.set("font-family", "sans-serif")
            t_el.set("font-size", "2.4")
            t_el.set("text-anchor", "middle")
            t_el.set("fill", "#333333")
            t_el.text = num_text
            text_count += 1

    tree.write(out_path, encoding="utf-8", xml_declaration=True)
    print(f"注入完了: {text_count} テキスト要素追加 -> {out_path}")


if __name__ == "__main__":
    svg_path = r"C:\Users\koboy\Documents\comiket-map\docs\inkscape\CircleMap_E7.svg"
    json_path = r"C:\Users\koboy\Documents\comiket-map\data\c108_day1.json"
    out_path = r"C:\Users\koboy\Documents\comiket-map\docs\inkscape\CircleMap_E7_numbered_v4.svg"
    if len(sys.argv) > 1:
        svg_path = sys.argv[1]
    if len(sys.argv) > 2:
        json_path = sys.argv[2]
    if len(sys.argv) > 3:
        out_path = sys.argv[3]
    inject_numbers(svg_path, json_path, out_path)
