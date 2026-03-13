import os

def create_svg_file(filename, halls, title, width=3000, height=2000):
    svg_content = [
        f'<?xml version="1.0" encoding="utf-8" ?>',
        f'<svg baseProfile="full" height="{height}" version="1.1" width="{width}" xmlns="http://www.w3.org/2000/svg">',
        '<defs>',
        '<style type="text/css"><![CDATA[',
        '    .hall { fill: #f8fafc; stroke: #94a3b8; stroke-width: 4; }',
        '    .hall-label { font-family: sans-serif; font-size: 80px; fill: #64748b; font-weight: bold; opacity: 0.6; }',
        '    .block { fill: #ffffff; stroke: #e2e8f0; stroke-width: 2; }',
        '    .block-label { font-family: sans-serif; font-size: 40px; fill: #475569; font-weight: bold; text-anchor: middle; dominant-baseline: middle; }',
        '    .block-watermark { font-family: sans-serif; font-size: 150px; fill: #475569; font-weight: bold; text-anchor: middle; opacity: 0.1; }',
        '    .wall { stroke: #334155; stroke-width: 8; fill: none; }',
        '    .area-west { fill: #bfdbfe; opacity: 0.3; }',
        '    .area-south { fill: #fde047; opacity: 0.2; }',
        '    .area-east1 { fill: #bbf7d0; opacity: 0.3; }',
        '    .area-east2 { fill: #fecaca; opacity: 0.3; }',
        '    .area-east3 { fill: #ddd6fe; opacity: 0.3; }',
        '    .title { font-family: sans-serif; font-size: 100px; fill: #334155; font-weight: bold; }',
        ']]></style>',
        '</defs>',
        f'<rect fill="#ffffff" height="{height}" width="{width}" x="0" y="0" />',
        f'<text class="title" x="50" y="120">{title}</text>'
    ]

    # ホール描画関数
    def draw_hall(points, name, color, blocks):
        buffer = []
        x, y, w, h = points
        
        # ホール外枠
        buffer.append(f'<rect class="hall" height="{h}" width="{w}" x="{x}" y="{y}" />')
        # エリアカラー
        buffer.append(f'<rect class="{color}" height="{h-40}" width="{w-40}" x="{x+20}" y="{y+20}" />')
        # ホール名
        buffer.append(f'<text class="hall-label" text-anchor="middle" x="{x+w/2}" y="{y+100}">{name}</text>')

        # ブロック（島）
        block_list = list(blocks)
        if not block_list: return buffer
        
        count = len(block_list)
        margin_x = 60
        margin_y = 150
        content_w = w - (margin_x * 2)
        col_w = content_w / count
        
        for i, char in enumerate(block_list):
            bx = x + margin_x + (i * col_w)
            by = y + margin_y
            bw = col_w - 20
            bh = (h - 300) / 2 # 上下の島

            # 上の島
            buffer.append(f'<rect class="block" height="{bh}" width="{bw}" x="{bx+10}" y="{by}" />')
            buffer.append(f'<text class="block-label" x="{bx + (col_w / 2)}" y="{by-20}">{char}</text>')
            buffer.append(f'<text class="block-watermark" x="{bx + (col_w / 2)}" y="{by+bh/2}">{char}</text>')

            # 下の島
            buffer.append(f'<rect class="block" height="{bh}" width="{bw}" x="{bx+10}" y="{by+bh+100}" />')
            buffer.append(f'<text class="block-label" x="{bx + (col_w / 2)}" y="{by+bh+100-20}">{char}</text>')
            buffer.append(f'<text class="block-watermark" x="{bx + (col_w / 2)}" y="{by+bh+100+bh/2}">{char}</text>')

        return buffer

    # ホールデータを処理
    for hall in halls:
        svg_content.extend(draw_hall(hall['rect'], hall['name'], hall['color'], hall['blocks']))

    svg_content.append('</svg>')

    with open(filename, 'w', encoding='utf-8') as f:
        f.write('\n'.join(svg_content))
    
    print(f"Generated {filename}")

def generate_all_maps():
    base_dir = "/home/aosy/Docker/comiketmap/app/maps"
    
    # 1. 西地区 (West) - 西1-4 全て使用
    create_svg_file(
        os.path.join(base_dir, "map_west.svg"),
        [
            {'rect': (100, 200, 800, 1600), 'name': '西1', 'color': 'area-west', 'blocks': 'ABCDE'},
            {'rect': (950, 200, 800, 1600), 'name': '西2', 'color': 'area-west', 'blocks': 'FGHIJ'},
            {'rect': (1900, 200, 800, 1600), 'name': '西3', 'color': 'area-west', 'blocks': 'KLMNO'},
            {'rect': (2750, 200, 800, 1600), 'name': '西4', 'color': 'area-west', 'blocks': 'PQRST'}
        ],
        "西地区 (West 1-4)",
        width=3700, height=2000
    )

    # 2. 南地区 (South) - 南1-4 全て使用
    create_svg_file(
        os.path.join(base_dir, "map_south.svg"),
        [
            {'rect': (100, 200, 800, 1600), 'name': '南1', 'color': 'area-south', 'blocks': 'abcde'},
            {'rect': (950, 200, 800, 1600), 'name': '南2', 'color': 'area-south', 'blocks': 'fghij'},
            {'rect': (1900, 200, 800, 1600), 'name': '南3', 'color': 'area-south', 'blocks': 'klmno'},
            {'rect': (2750, 200, 800, 1600), 'name': '南4', 'color': 'area-south', 'blocks': 'pqrst'}
        ],
        "南地区 (South 1-4)",
        width=3700, height=2000
    )

    # 3. 東456地区 (East 4-6) ※東1-3は改修工事のため使用しない
    # 画像に基づき、右(東6)から左(東4)へ ア〜ヨ の順に配置
    # 東6: ア〜シ (12)
    # 東5: ス〜ハ (14)
    # 東4: ヒ〜ヨ (12)
    create_svg_file(
        os.path.join(base_dir, "map_east456.svg"),
        [
            {'rect': (100, 200, 1300, 1600), 'name': '東4', 'color': 'area-east1', 'blocks': 'ヨユヤモメムミマホヘフヒ'},
            {'rect': (1450, 200, 1500, 1600), 'name': '東5', 'color': 'area-east1', 'blocks': 'ハノネヌニナトテツチタソセス'},
            {'rect': (3000, 200, 1300, 1600), 'name': '東6', 'color': 'area-east1', 'blocks': 'シサコケクキカオエウイア'}
        ],
        "東地区 (East 4-6)",
        width=4400, height=2000
    )

    # 4. 東78地区 (East 7-8) - 東新展示棟
    create_svg_file(
        os.path.join(base_dir, "map_east78.svg"),
        [
            {'rect': (100, 200, 1200, 1600), 'name': '東7', 'color': 'area-east2', 'blocks': 'たちつてとな'},
            {'rect': (1350, 200, 1200, 1600), 'name': '東8', 'color': 'area-east2', 'blocks': 'にぬねのはひ'}
        ],
        "東新展示棟 (East 7-8)",
        width=2700, height=2000
    )

if __name__ == "__main__":
    generate_all_maps()
