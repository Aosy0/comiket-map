"""
SVG最適化スクリプト v3（E7_plain_layer_5.svg 用）
- 共通スタイルを <style> に集約（各rectのstyle属性を削除）
- 不要な id / display:inline を削除
- 座標・サイズの桁数を削減
"""

import re
import sys


def optimize(input_path, output_path):
    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()

    original_size = len(content)

    # 0. ICCカラープロファイル（巨大な base64 data URI）を削除
    content = re.sub(r'<color-profile[^>]*>.*?</color-profile>', '', content, flags=re.DOTALL)
    content = re.sub(r'<color-profile[^>]*/>', '', content)
    content = re.sub(r'\s+xlink:href="data:[^"]{500,}"', '', content)

    # 1. 共通の rect スタイルを class に置換
    content = content.replace(
        'style="display:inline;fill:none;stroke:#000000;stroke-width:0.264583"',
        'class="cell"',
    )
    content = content.replace(
        'style="fill:none;stroke:#000000;stroke-width:0.264583"',
        'class="cell"',
    )

    # 2. rect の id を削除
    content = re.sub(r'\s+id="rect[^"]*"', '', content)

    # 3. 座標・サイズの桁数を削減（小数点3桁）
    content = re.sub(r'width="(\d+\.\d{4,})"', lambda m: f'width="{float(m.group(1)):.3f}"', content)
    content = re.sub(r'height="(\d+\.\d{4,})"', lambda m: f'height="{float(m.group(1)):.3f}"', content)
    content = re.sub(r'\bx="(\d+\.\d{4,})"', lambda m: f'x="{float(m.group(1)):.3f}"', content)
    content = re.sub(r'\by="(\d+\.\d{4,})"', lambda m: f'y="{float(m.group(1)):.3f}"', content)

    # 4. rect 要素を1行に圧縮
    content = re.sub(
        r'<rect\s+([^>]*?)\s*/>',
        lambda m: '<rect ' + re.sub(r'\s+', ' ', m.group(1)).strip() + ' />',
        content,
    )

    # 5. <style> を追加（無ければ）
    if "<style>" not in content:
        cell_style = (
            '<defs><style>'
            '.cell{fill:none;stroke:#000000;stroke-width:0.264583}'
            '</style></defs>'
        )
        if "</defs>" in content:
            content = content.replace("</defs>", cell_style + "</defs>", 1)
        else:
            m = re.search(r'(<svg[^>]*>)', content)
            if m:
                content = content[:m.end()] + cell_style + content[m.end():]

    # 6. 空白行を削除
    content = re.sub(r'\n\s*\n', '\n', content)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    new_size = len(content)
    print(f"サイズ: {original_size/1024:.0f}KB -> {new_size/1024:.0f}KB ({new_size/original_size*100:.0f}%)")


if __name__ == "__main__":
    input_path = r"C:\Users\koboy\Documents\comiket-map\docs\inkscape\E7_plain_layer_5.svg"
    output_path = r"C:\Users\koboy\Documents\comiket-map\docs\inkscape\E7_min.svg"
    if len(sys.argv) > 1:
        input_path = sys.argv[1]
    if len(sys.argv) > 2:
        output_path = sys.argv[2]
    optimize(input_path, output_path)
