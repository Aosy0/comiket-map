# -*- coding: utf-8 -*-
"""
新しい E7.svg（Inkscape 制作・Q修正版 v5）にサークル番号を自動記入するスクリプト

【新構造対応】
- 島 = layer2 直下の g（inkscape:label は保存時に失われているため、座標で特定）
- 各島はサブグループ（W1/W2 など上下2ブロック）を持ち、rect はサブグループの中にある
- サークル番号はサブグループを横断して振られる（公式マップの蛇行配置）

【番号配置（公式マップ参考・制作資料「左列25→36増加、右列24→13減少」）】
標準島（48セル = 上24 + 下24）:
  下ブロック右列: 下→上 1..12
  上ブロック右列: 下→上 13..24
  上ブロック左列: 上→下 25..36
  下ブロック左列: 上→下 37..48
※ 島によってセル数が異なる（46/24/12）場合は同じ蛇行パターンで 1..N を割り当てる
※ A 島（最上段・横長）は rotate 変換を持つ特殊形状。セルを絶対座標で並べ、
  ブロック分割・列分割をせず、座標の x→y 順で番号を振る（1..48）
"""

import math
import re
import sys
import xml.etree.ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def parse_transform_ops(transform):
    """transform 文字列を演算リストに変換する"""
    if not transform:
        return []
    ops = []
    for part in re.findall(r"(translate|rotate|matrix)\(([^)]*)\)", transform):
        kind, args_str = part
        args = [a.strip() for a in args_str.split(",")]
        if kind == "translate":
            tx = float(args[0])
            ty = float(args[1]) if len(args) > 1 else 0.0
            ops.append(("translate", tx, ty))
        elif kind == "rotate":
            ang = float(args[0])
            if len(args) > 2:
                ops.append(("rotate_c", ang, float(args[1]), float(args[2])))
            else:
                ops.append(("rotate", ang))
        elif kind == "matrix":
            a, b, c, d, e, f = (float(x) for x in args)
            ops.append(("matrix", a, b, c, d, e, f))
    return ops


def apply_ops(x, y, ops):
    """点 (x, y) に ops を適用する（SVG: transform="A B" は B を先に適用）"""
    for op in reversed(ops):
        kind = op[0]
        if kind == "translate":
            x += op[1]
            y += op[2]
        elif kind == "rotate":
            rad = math.radians(op[1])
            nx = x * math.cos(rad) - y * math.sin(rad)
            ny = x * math.sin(rad) + y * math.cos(rad)
            x, y = nx, ny
        elif kind == "rotate_c":
            rad = math.radians(op[1])
            cx, cy = op[2], op[3]
            x -= cx
            y -= cy
            nx = x * math.cos(rad) - y * math.sin(rad)
            ny = x * math.sin(rad) + y * math.cos(rad)
            x, y = nx + cx, ny + cy
        elif kind == "matrix":
            a, b, c, d, e, f = op[1:]
            nx = a * x + c * y + e
            ny = b * x + d * y + f
            x, y = nx, ny
    return x, y


def cell_abs(cell, parent_map):
    """セルの絶対座標。祖先の transform を SVG 仕様（子→親）の順で適用する"""
    x, y = cell["x"], cell["y"]
    node = cell["elem"]
    while node is not None:
        x, y = apply_ops(x, y, parse_transform_ops(node.get("transform")))
        node = parent_map.get(node)
    return x, y


def extract_rects(elem):
    """要素配下の rect を「ローカル座標」で抽出"""
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


def collect_islands(layer2):
    """layer2 直下の g を「島」として収集（サブグループの rect もすべて島のセル）"""
    islands = []
    for child in layer2:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag != "g":
            continue
        rects = extract_rects(child)
        if rects:
            islands.append({"elem": child, "rects": rects})
    return islands


def island_bbox(island, parent_map):
    """島の全セルの絶対座標から bbox を計算"""
    pts = [cell_abs(c, parent_map) for c in island["rects"]]
    minx = min(p[0] for p in pts)
    maxx = max(p[0] for p in pts)
    miny = min(p[1] for p in pts)
    maxy = max(p[1] for p in pts)
    return minx, maxx, miny, maxy


def snake_order(cells, parent_map):
    """
    セルを公式マップの蛇行配置順にソートする。

    1. 上下ブロックを y のギャップで分割（中央の通路ギャップ > 4.0）
    2. 各ブロック内で左右列を x クラスタで分割
    3. 並び順:
       下ブロック右列: y 降順（下→上）
       上ブロック右列: y 降順（下→上）
       上ブロック左列: y 昇順（上→下）
       下ブロック左列: y 昇順（上→下）
    """
    if not cells:
        return []

    positioned = []
    for c in cells:
        x, y = cell_abs(c, parent_map)
        positioned.append({"cell": c, "x": x, "y": y})

    ys = sorted(set(round(p["y"], 2) for p in positioned))

    # 上下ブロック分割: y の大きなギャップを探す（セル高3.15、ブロック間ギャップ~5.7）
    gap_threshold = 4.5
    split_y = None
    for i in range(len(ys) - 1):
        if ys[i + 1] - ys[i] > gap_threshold:
            split_y = (ys[i] + ys[i + 1]) / 2
            break

    if split_y is None:
        lower = positioned
        upper = []
    else:
        lower = [p for p in positioned if p["y"] > split_y]
        upper = [p for p in positioned if p["y"] <= split_y]

    def cluster_cols(pts):
        xs = sorted(set(round(p["x"], 2) for p in pts))
        clusters = []
        for x in xs:
            placed = False
            for cl in clusters:
                if abs(cl[0] - x) < 1.0:
                    cl[1].append(x)
                    placed = True
                    break
            if not placed:
                clusters.append([x, [x]])
        clusters.sort(key=lambda c: c[0])
        return clusters

    def order_block(pts):
        """ブロック内のセルを列（左→右）→ 行（上→下）でソート"""
        if not pts:
            return []
        cols = cluster_cols(pts)
        ordered = []
        for cl in cols:
            col_pts = [p for p in pts if abs(p["x"] - cl[0]) < 1.0]
            col_pts.sort(key=lambda p: p["y"])
            ordered.append(col_pts)
        return ordered

    lower_cols = order_block(lower)
    upper_cols = order_block(upper)

    result = []
    # 下ブロック右列（最後の列、y降順 = 下→上）
    if lower_cols:
        result.extend(sorted(lower_cols[-1], key=lambda p: p["y"], reverse=True))
    # 上ブロック右列（最後の列、y降順）
    if upper_cols:
        result.extend(sorted(upper_cols[-1], key=lambda p: p["y"], reverse=True))
    # 上ブロック左列（最初の列、y昇順 = 上→下）
    if upper_cols:
        result.extend(sorted(upper_cols[0], key=lambda p: p["y"]))
    # 下ブロック左列（最初の列、y昇順）
    if lower_cols:
        result.extend(sorted(lower_cols[0], key=lambda p: p["y"]))

    return [p["cell"] for p in result]


def a_island_order(cells, parent_map):
    """A 島（最上段・横長・rotate 変換あり）のセルを座標順でソート"""
    positioned = []
    for c in cells:
        x, y = cell_abs(c, parent_map)
        positioned.append({"cell": c, "x": x, "y": y})
    positioned.sort(key=lambda p: (p["y"], p["x"]))
    return [p["cell"] for p in positioned]


def inject_numbers(svg_path, json_path, out_path):
    ET.register_namespace("", SVG_NS)
    tree = ET.parse(svg_path)
    root = tree.getroot()
    parent_map = {c: p for p in root.iter() for c in p}

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

    # 島を座標でソート（y → x）
    def island_sort_key(ig):
        minx, maxx, miny, maxy = island_bbox(ig, parent_map)
        return (miny, minx)
    islands.sort(key=island_sort_key)

    print(f"島グループ: {len(islands)}個")

    # 島名を座標ベースで割り当て
    # 最上段 (miny<10): A / 上段 (10<=miny<100): M..B / 下段 (miny>=100): W..N
    island_names = []
    for ig in islands:
        minx, maxx, miny, maxy = island_bbox(ig, parent_map)
        if miny < 10:
            island_names.append("A")
        elif miny < 100:
            idx = sum(1 for o in islands
                      if 10 <= island_bbox(o, parent_map)[2] < 100
                      and island_bbox(o, parent_map)[0] < minx)
            island_names.append(chr(ord('M') - idx))
        else:
            idx = sum(1 for o in islands
                      if island_bbox(o, parent_map)[2] >= 100
                      and island_bbox(o, parent_map)[0] < minx)
            island_names.append(chr(ord('W') - idx))
    print("島名:", island_names)

    text_count = 0
    l2_ops = parse_transform_ops(layer2.get("transform"))
    l2_tx = sum(op[1] for op in l2_ops if op[0] == "translate")
    l2_ty = sum(op[2] for op in l2_ops if op[0] == "translate")

    # 島の絶対座標 bbox を収集 (2ブロック間ギャップと1ブロック島の高さ揃え用)
    island_abs_boxes = []
    for ig in islands:
        pts = [cell_abs(c, parent_map) for c in ig["rects"]]
        island_abs_boxes.append({
            "minx": min(p[0] for p in pts),
            "maxx": max(p[0] for p in pts),
            "miny": min(p[1] for p in pts),
            "maxy": max(p[1] for p in pts),
        })

    for i, island in enumerate(islands):
        island_name = island_names[i]
        if island_name == "A":
            cells = a_island_order(island["rects"], parent_map)
        else:
            cells = snake_order(island["rects"], parent_map)
        n = len(cells)
        print(f"  島{island_name}: {n}セル")

        box = island_abs_boxes[i]
        abs_cx = (box["minx"] + box["maxx"]) / 2

        # A 島(最上段・rotate付き特殊形状)は最上部の上にラベル配置
        if island_name == "A":
            label_abs_y = box["miny"] - 1.5
        else:
            # 2ブロック島: ブロック間ギャップの中央にラベル配置
            ys = sorted(set(round(cell_abs(c, parent_map)[1], 2) for c in island["rects"]))
            gap_y = None
            for k in range(len(ys) - 1):
                if ys[k + 1] - ys[k] > 4.5:
                    gap_y = (ys[k] + ys[k + 1]) / 2
                    break

            if gap_y is not None:
                label_abs_y = gap_y
            else:
                row_gap = None
                box_row = "upper" if box["miny"] < 100 else "lower"
                for oi, other_box in enumerate(island_abs_boxes):
                    if oi == i:
                        continue
                    other_row = "upper" if other_box["miny"] < 100 else "lower"
                    if other_row != box_row:
                        continue
                    other_ys = sorted(set(round(cell_abs(c, parent_map)[1], 2)
                                          for c in islands[oi]["rects"]))
                    for k in range(len(other_ys) - 1):
                        if other_ys[k + 1] - other_ys[k] > 4.5:
                            row_gap = (other_ys[k] + other_ys[k + 1]) / 2
                            break
                    if row_gap is not None:
                        break
                label_abs_y = row_gap if row_gap is not None else box["miny"] - 1.5

        # layer2 直下に追加 → 絶対座標から layer2 の transform を引いたローカル座標で配置
        label_el = ET.SubElement(layer2, f"{{{SVG_NS}}}text")
        label_el.set("x", f"{abs_cx - l2_tx:.3f}")
        label_el.set("y", f"{label_abs_y - l2_ty:.3f}")
        label_el.set("font-family", "sans-serif")
        label_el.set("font-size", "4")
        label_el.set("font-weight", "bold")
        label_el.set("text-anchor", "middle")
        label_el.set("fill", "#333333")
        label_el.text = island_name
        text_count += 1

        for j, cell in enumerate(cells):
            num_text = str(j + 1)
            tx = cell["x"] + cell["w"] / 2
            ty = cell["y"] + cell["h"] / 2 + 1.1
            cell["elem"].set("data-circle", f"東7-{island_name}-{num_text}")
            cell["elem"].set("data-island", island_name)
            parent = parent_map.get(cell["elem"])
            t_el = ET.SubElement(parent, f"{{{SVG_NS}}}text")
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
    svg_path = r"C:\Users\koboy\Documents\comiket-map\docs\inkscape\E7.svg"
    json_path = r"C:\Users\koboy\Documents\comiket-map\data\c108_day1.json"
    out_path = r"C:\Users\koboy\Documents\comiket-map\docs\inkscape\E7_numbered_v5.svg"
    if len(sys.argv) > 1:
        svg_path = sys.argv[1]
    if len(sys.argv) > 2:
        json_path = sys.argv[2]
    if len(sys.argv) > 3:
        out_path = sys.argv[3]
    inject_numbers(svg_path, json_path, out_path)
