# -*- coding: utf-8 -*-
"""
E123.svg（東1-3ホール）にサークル番号と島名ラベルを注入するスクリプト

【番号配置（ユーザー確認済み 2026-08-14 / data/c108_day1.jsonc 参照）】
- レイアウト: 右=東1、中央=東2、左=東3
- 通常の島（37個）: 4ブロック横断の蛇行配置（東7と同じ）
  - 右列: 下のブロックから上へ、各ブロック内は下→上
  - 左列: 上のブロックから下へ、各ブロック内は上→下
- ア島（g23）: 右端1〜22（下→上）、上端23〜73（右→左）、左端74〜88/93〜95（上→下。89〜92は空き）
- テキストは rect と同じローカル座標で配置（rotate transform を考慮）
"""

import math
import re
import sys
import xml.etree.ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

# 島名リスト（左から右、37島。アは壁沿いで別扱い）
ISLAND_NAMES = [
    "ヨ", "ユ", "ヤ", "モ", "メ", "ム", "ミ", "マ", "ホ", "ヘ", "フ", "ヒ",
    "ハ", "ノ", "ネ", "ヌ", "ニ", "ナ", "ト", "テ", "ツ", "チ", "タ", "ソ", "セ",
    "ス", "シ", "サ", "コ", "ケ", "ク", "キ", "カ", "オ", "エ", "ウ", "イ",
]
A_ISLAND_ID = "g23"


def parse_transform_ops(t):
    if not t:
        return []
    ops = []
    for part in re.findall(r"(translate|rotate|matrix)\(([^)]*)\)", t):
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


def cell_abs_center(elem, parent_map):
    rx = float(elem.get("x", 0))
    ry = float(elem.get("y", 0))
    rw = float(elem.get("width", 0))
    rh = float(elem.get("height", 0))
    x, y = rx + rw / 2, ry + rh / 2
    node = elem
    while node is not None:
        x, y = apply_ops(x, y, parse_transform_ops(node.get("transform", "")))
        node = parent_map.get(node)
    return x, y


def cell_abs_corner(elem, parent_map):
    rx = float(elem.get("x", 0))
    ry = float(elem.get("y", 0))
    x, y = rx, ry
    node = elem
    while node is not None:
        x, y = apply_ops(x, y, parse_transform_ops(node.get("transform", "")))
        node = parent_map.get(node)
    return x, y


def add_number_text(parent, rect_elem, num_text):
    rx = float(rect_elem.get("x", 0))
    ry = float(rect_elem.get("y", 0))
    rw = float(rect_elem.get("width", 0))
    rh = float(rect_elem.get("height", 0))
    t_el = ET.SubElement(parent, f"{{{SVG_NS}}}text")
    t_el.set("x", f"{rx + rw / 2:.3f}")
    t_el.set("y", f"{ry + rh / 2 + 0.5:.3f}")
    t_el.set("font-family", "sans-serif")
    t_el.set("font-size", "2.4")
    t_el.set("text-anchor", "middle")
    t_el.set("fill", "#333333")
    t_el.text = num_text


def add_number_text_unrotated(layer1, rect_elem, num_text, parent_map, l1_tx, l1_ty):
    """ア島用: rotate を無視して横向きのまま配置（layer1 直下に絶対座標で追加）"""
    x, y = cell_abs_center(rect_elem, parent_map)
    t_el = ET.SubElement(layer1, f"{{{SVG_NS}}}text")
    t_el.set("x", f"{x - l1_tx:.3f}")
    t_el.set("y", f"{y - l1_ty + 0.5:.3f}")
    t_el.set("font-family", "sans-serif")
    t_el.set("font-size", "2.4")
    t_el.set("text-anchor", "middle")
    t_el.set("fill", "#333333")
    t_el.text = num_text


def add_label_text(layer1, abs_cx, abs_y, text, l1_tx, l1_ty):
    label_el = ET.SubElement(layer1, f"{{{SVG_NS}}}text")
    label_el.set("x", f"{abs_cx - l1_tx:.3f}")
    label_el.set("y", f"{abs_y - l1_ty - 1.0:.3f}")
    label_el.set("font-family", "sans-serif")
    label_el.set("font-size", "4")
    label_el.set("font-weight", "bold")
    label_el.set("text-anchor", "middle")
    label_el.set("fill", "#333333")
    label_el.text = text


def split_left_right(cells):
    xs = sorted(c["cx"] for c in cells)
    if not xs:
        return [], []
    mid = xs[len(xs) // 2]
    left = [c for c in cells if c["cx"] < mid]
    right = [c for c in cells if c["cx"] >= mid]
    return left, right


def snake_order(blocks, parent_map):
    """東7と同じ4ブロック蛇行配置。右列（下→上）、左列（上→下）"""
    blocks.sort(key=lambda b: b["cy"])
    right_cells = []
    left_cells = []
    for b in blocks:
        left, right = split_left_right(b["cells"])
        left_cells.append(left)
        right_cells.append(right)
    ordered_right = []
    for b_cells in reversed(right_cells):
        ordered_right.extend(sorted(b_cells, key=lambda c: c["cy"], reverse=True))
    ordered_left = []
    for b_cells in left_cells:
        ordered_left.extend(sorted(b_cells, key=lambda c: c["cy"]))
    return ordered_right + ordered_left


def assign_a_island(a_blocks, parent_map):
    """ア島（壁沿いコの字型）の番号割り当て"""
    cells = []
    for b in a_blocks:
        gid = b["elem"].get("id") or ""
        for r in b["rects"]:
            x, y = cell_abs_center(r, parent_map)
            cells.append({"cx": x, "cy": y, "elem": r, "gid": gid})
    right = sorted([c for c in cells if c["cx"] > 370 and c["gid"].startswith("g16-2-2-9-4")],
                   key=lambda c: c["cy"], reverse=True)
    left = sorted([c for c in cells if c["cx"] < 15 and c["gid"].startswith("g16-2-2-9-4")],
                  key=lambda c: c["cy"])
    top = sorted([c for c in cells if c["gid"].startswith("g16-82")],
                 key=lambda c: c["cx"], reverse=True)
    left_blocks = []
    current = []
    prev_y = None
    for c in left:
        if prev_y is not None and c["cy"] - prev_y > 10:
            left_blocks.append(current)
            current = []
        current.append(c)
        prev_y = c["cy"]
    if current:
        left_blocks.append(current)

    assignments = []
    for i, c in enumerate(right):
        assignments.append((c["elem"], str(i + 1)))
    for i, c in enumerate(top):
        assignments.append((c["elem"], str(23 + i)))
    offsets = [74, 85, 93]
    for bi, lb in enumerate(left_blocks):
        for i, c in enumerate(lb):
            assignments.append((c["elem"], str(offsets[bi] + i)))
    return assignments


def inject_numbers(svg_path, out_path):
    tree = ET.parse(svg_path)
    root = tree.getroot()
    parent_map = {c: p for p in root.iter() for c in p}

    layer1 = None
    for elem in root.iter():
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if tag == "g" and elem.get("id") == "layer1":
            layer1 = elem
            break
    if layer1 is None:
        print("layer1 not found")
        return

    l1_tx, l1_ty = 0.0, 0.0
    for op in parse_transform_ops(layer1.get("transform", "")):
        if op[0] == "translate":
            l1_tx += op[1]
            l1_ty += op[2]

    # layer1 の直接の子 g を島として収集
    islands = []
    for child in layer1:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag != "g":
            continue
        # 島内のブロック（rectを持つ子 g）を収集
        blocks = []
        for sub in child.iter():
            stag = sub.tag.split("}")[-1] if "}" in sub.tag else sub.tag
            if stag != "g":
                continue
            rects = [c for c in sub if c.tag.endswith("}rect")]
            if not rects:
                continue
            cell_data = []
            for r in rects:
                x, y = cell_abs_center(r, parent_map)
                cell_data.append({"cx": x, "cy": y, "elem": r})
            miny = min(c["cy"] for c in cell_data)
            blocks.append({
                "elem": sub,
                "rects": rects,
                "cells": cell_data,
                "cy": miny,
            })
        islands.append({"id": child.get("id"), "elem": child, "blocks": blocks})

    # ア島（g23）と通常の島に分ける
    a_island = None
    normal_islands = []
    for island in islands:
        if island["id"] == A_ISLAND_ID:
            a_island = island
        else:
            normal_islands.append(island)

    # 通常の島を x座標で左→右にソート
    for island in normal_islands:
        xs = [c["cx"] for b in island["blocks"] for c in b["cells"]]
        island["minx"] = min(xs)
    normal_islands.sort(key=lambda i: i["minx"])

    text_count = 0

    # 通常の島（37個）: 島名リスト（ヨ〜イ）を左→右に割り当て
    for i, island in enumerate(normal_islands):
        if i >= len(ISLAND_NAMES):
            break
        island_name = ISLAND_NAMES[i]
        all_cells = [c for b in island["blocks"] for c in b["cells"]]
        min_y = min(c["cy"] for c in all_cells)
        max_y = max(c["cy"] for c in all_cells)
        min_x = min(c["cx"] for c in all_cells)
        max_x = max(c["cx"] for c in all_cells)
        cx = (min_x + max_x) / 2
        cy = (min_y + max_y) / 2
        add_label_text(layer1, cx, cy, island_name, l1_tx, l1_ty)
        text_count += 1

        snake_cells = snake_order(island["blocks"], parent_map)
        for idx, cell in enumerate(snake_cells):
            num_text = str(idx + 1)
            cell["elem"].set("data-circle", f"東1-3-{island_name}-{num_text}")
            cell["elem"].set("data-island", island_name)
            parent = parent_map.get(cell["elem"])
            add_number_text(parent, cell["elem"], num_text)
            text_count += 1
        print(f"  島{i}: {island_name}, {len(snake_cells)}セル")

    # ア島（g23）: 壁沿いの特別配置
    if a_island is not None:
        a_cells = [c for b in a_island["blocks"] for c in b["cells"]]
        right_cells = [c for c in a_cells if c["cx"] > 400]
        left_cells = [c for c in a_cells if c["cx"] < 15]
        top_cells = [c for c in a_cells if 15 <= c["cx"] <= 400]

        def center(cells):
            min_x = min(c["cx"] for c in cells)
            max_x = max(c["cx"] for c in cells)
            min_y = min(c["cy"] for c in cells)
            max_y = max(c["cy"] for c in cells)
            return (min_x + max_x) / 2, (min_y + max_y) / 2

        for cells in (right_cells, top_cells, left_cells):
            lx, ly = center(cells)
            add_label_text(layer1, lx, ly, "ア", l1_tx, l1_ty)
            text_count += 1

        assignments = assign_a_island(a_island["blocks"], parent_map)
        for rect_elem, num_text in assignments:
            rect_elem.set("data-circle", f"東1-3-ア-{num_text}")
            rect_elem.set("data-island", "ア")
            add_number_text_unrotated(layer1, rect_elem, num_text, parent_map, l1_tx, l1_ty)
            text_count += 1
        print(f"  ア島: {len(assignments)}セル（1〜22, 23〜73, 74〜88, 93〜95）")

    tree.write(out_path, encoding="utf-8", xml_declaration=True)
    print(f"注入完了: {text_count} テキスト要素追加 -> {out_path}")


if __name__ == "__main__":
    svg_path = r"C:\Users\koboy\Documents\comiket-map\docs\inkscape\E123.svg"
    out_path = r"C:\Users\koboy\Documents\comiket-map\docs\inkscape\E123_numbered.svg"
    if len(sys.argv) > 1:
        svg_path = sys.argv[1]
    if len(sys.argv) > 2:
        out_path = sys.argv[2]
    inject_numbers(svg_path, out_path)
