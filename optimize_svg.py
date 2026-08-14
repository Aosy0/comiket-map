"""
SVGマップ最適化スクリプト

Inkscape で作成したホールマップ（E7.svg / E123.svg 等）をアプリ用に最適化します。

- 非表示レイヤー・defs・カラープロファイルの削除
- セル rect の個別 style を class="cell" に集約（線幅 0.264583 のみ。外枠等の特殊スタイルは保持）
- 不要 id の削除・座標桁数の削減・1行化

使い方:
    python optimize_svg.py <入力.svg> <出力.svg>

例:
    python optimize_svg.py docs/inkscape/E123.svg app/maps/map_east123.svg
    python optimize_svg.py docs/inkscape/E7_numbered_v5.svg app/maps/map_east7.svg
"""

import re
import sys


def remove_hidden_layers(content):
    """display:none の g レイヤーをネスト対応で全て削除する"""
    while True:
        m = re.search(r'<g\s+[^>]*style="[^"]*display:none[^"]*"[^>]*>', content)
        if not m:
            return content
        depth = 1
        i = m.end()
        while depth > 0:
            next_open = content.find("<g", i)
            next_close = content.find("</g>", i)
            if next_close == -1:
                break
            if next_open != -1 and next_open < next_close:
                depth += 1
                i = next_open + 2
            else:
                depth -= 1
                i = next_close + 4
        content = content[: m.start()] + content[i:]


def optimize(input_path, output_path):
    with open(input_path, encoding="utf-8") as f:
        content = f.read()
    original_size = len(content)

    # カラープロファイル削除
    content = re.sub(r"<color-profile[^>]*>.*?</color-profile>", "", content, flags=re.DOTALL)
    content = re.sub(r"<color-profile[^>]*/>", "", content)

    # 非表示レイヤー削除（パス化された番号などの残骸）
    content = remove_hidden_layers(content)

    # defs 削除（グラデーション・クリップパス等は非表示レイヤー用）
    content = re.sub(r"<defs[^>]*>.*?</defs>", "", content, flags=re.S)

    # セル rect の個別 style を class="cell" に置換（特殊スタイルは保持）
    content = content.replace(
        'style="display:inline;fill:none;stroke:#000000;stroke-width:0.264583"',
        'class="cell"',
    )
    content = content.replace('style="fill:none;stroke:#000000;stroke-width:0.264583"', 'class="cell"')

    # style 内の冗長な display:inline を除去（class 化されなかった要素）
    content = content.replace('style="display:inline;', 'style="')

    # rect の不要 id を削除
    content = re.sub(r'\s+id="rect[^"]*"', "", content)

    # 座標・サイズの桁数を3桁に削減
    content = re.sub(r'width="(\d+\.\d{4,})"', lambda m: f'width="{float(m.group(1)):.3f}"', content)
    content = re.sub(r'height="(\d+\.\d{4,})"', lambda m: f'height="{float(m.group(1)):.3f}"', content)
    content = re.sub(r'\bx="(-?\d+\.\d{4,})"', lambda m: f'x="{float(m.group(1)):.3f}"', content)
    content = re.sub(r'\by="(-?\d+\.\d{4,})"', lambda m: f'y="{float(m.group(1)):.3f}"', content)

    # svg の width/height を viewBox に統一し、冗長な xmlns を削除
    m = re.search(r"<svg\b[^>]*>", content)
    svg_tag = m.group(0)
    vb = re.search(r'viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"', svg_tag)
    if vb:
        svg_tag = re.sub(r'\s+width="[^"]*"', f' width="{vb.group(3)}"', svg_tag)
        svg_tag = re.sub(r'\s+height="[^"]*"', f' height="{vb.group(4)}"', svg_tag)
    svg_tag = re.sub(r'\s+xmlns:xlink="[^"]*"', "", svg_tag)
    svg_tag = re.sub(r'\s+xmlns:svg="[^"]*"', "", svg_tag)
    content = content[: m.start()] + svg_tag + content[m.end() :]

    # <style> を追加（defs を削除したので新規に追加）
    if "<style>" not in content:
        cell_style = ".cell{fill:none;stroke:#000000;stroke-width:0.264583}"
        m = re.search(r"(<svg[^>]*>)", content)
        content = content[: m.end()] + f"<defs><style>{cell_style}</style></defs>" + content[m.end() :]

    # 1行化・空白整理
    content = re.sub(r">\s+<", "><", content)
    content = re.sub(r"\s{2,}", " ", content)
    content = content.strip()

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    new_size = len(content)
    print(f"サイズ: {original_size/1024:.0f}KB -> {new_size/1024:.0f}KB ({new_size/original_size*100:.1f}%)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    optimize(sys.argv[1], sys.argv[2])
