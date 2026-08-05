#!/usr/bin/env python3
"""テスト用の記入済み申請書類フォームを「テンプレの見た目を壊さずに」作る（ハマり⑤）。

openpyxl でテンプレを再保存すると全シートの画像が消え、結合一括解除で崩れ、exceljsが
`anchors` エラーで読めなくなる。→ lxml で xl/worksheets/sheetN.xml の該当セル値だけ
書き換えて zip 再パッケージする。画像/結合/書式/図形を100%保持し、exceljsも読める。

さらに、数式セルを値で上書きすると xl/calcChain.xml と矛盾し Excel が「修復」して結合を
消すため、calcChain.xml とその宣言(Content_Types / workbook.rels)も出力から除去する。

使い方:
  1. SRC/OUT を実パスに。SRC はユーザー添付テンプレ（消える前に scratchpad へコピーしておく）。
  2. FILL に {シート名: {セル: 値}} を書く。値の型で自動判定:
       str -> inlineStr / int|float -> 数値 / bool(True/False) -> チェックボックス等の真偽
     ※ app34(実在法人)に書くセルは現在値そのまま(no-op)にして法人マスタを壊さない。
  3. 実行 -> OUT が生成される。openpyxl で結合/画像がテンプレと一致するか確認し、
     transcribeWorkbook(dryRun) で payload を、実書込で kintone を再取得して検証する。
"""
import re
import zipfile
from lxml import etree

# TODO: 実パスに変更
SRC = "template.xlsx"
OUT = "test_form.xlsx"

# TODO: {シート名: {セル参照: 値}} を埋める
FILL = {
    # "はじめに": {"E14": "8011405000064", "E16": "12345678901"},
    # "1-6": {"B17": 2026, "E17": 9, "G17": 1, "B32": True, "M25": "■"},
}

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
RELNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def col_to_num(col):
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def split_ref(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    return m.group(1), int(m.group(2))


def set_cell(sheet_data, ref, val):
    col, row = split_ref(ref)
    colnum = col_to_num(col)
    # find/create <row> (行番号昇順を維持)
    row_el = None
    for r in sheet_data.findall(f"{{{NS}}}row"):
        if int(r.get("r")) == row:
            row_el = r
            break
    if row_el is None:
        row_el = etree.Element(f"{{{NS}}}row")
        row_el.set("r", str(row))
        placed = False
        for r in sheet_data.findall(f"{{{NS}}}row"):
            if int(r.get("r")) > row:
                r.addprevious(row_el)
                placed = True
                break
        if not placed:
            sheet_data.append(row_el)
    # find/create <c> (列昇順・style属性 s は保持)
    c_el = None
    for c in row_el.findall(f"{{{NS}}}c"):
        if c.get("r") == ref:
            c_el = c
            break
    if c_el is None:
        c_el = etree.Element(f"{{{NS}}}c")
        c_el.set("r", ref)
        placed = False
        for c in row_el.findall(f"{{{NS}}}c"):
            ccol, _ = split_ref(c.get("r"))
            if col_to_num(ccol) > colnum:
                c.addprevious(c_el)
                placed = True
                break
        if not placed:
            row_el.append(c_el)
    # 値を設定（既存の子要素・t属性をクリア、s=styleは残す）
    for ch in list(c_el):
        c_el.remove(ch)
    if c_el.get("t") is not None:
        del c_el.attrib["t"]
    if isinstance(val, bool):
        c_el.set("t", "b")
        etree.SubElement(c_el, f"{{{NS}}}v").text = "1" if val else "0"
    elif isinstance(val, (int, float)):
        etree.SubElement(c_el, f"{{{NS}}}v").text = ("%g" % val) if isinstance(val, float) else str(val)
    else:
        c_el.set("t", "inlineStr")
        t_el = etree.SubElement(etree.SubElement(c_el, f"{{{NS}}}is"), f"{{{NS}}}t")
        t_el.set(XML_SPACE, "preserve")
        t_el.text = str(val)


def build(src=SRC, out=OUT, fill=FILL):
    zin = zipfile.ZipFile(src)
    wb = etree.fromstring(zin.read("xl/workbook.xml"))
    rels = etree.fromstring(zin.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {rel.get("Id"): rel.get("Target") for rel in rels}
    name_to_path = {}
    for sh in wb.find(f"{{{NS}}}sheets"):
        tgt = rid_to_target[sh.get(f"{{{RELNS}}}id")]
        name_to_path[sh.get("name")] = tgt if tgt.startswith("xl/") else "xl/" + tgt

    edited = {}
    for sheet, cells in fill.items():
        path = name_to_path[sheet]
        tree = etree.fromstring(zin.read(path))
        sd = tree.find(f"{{{NS}}}sheetData")
        for ref, val in cells.items():
            set_cell(sd, ref, val)
        edited[path] = etree.tostring(tree, xml_declaration=True, encoding="UTF-8", standalone=True)

    # calcChain.xml を除去（数式セルを値で上書きした矛盾でExcelが修復→結合を消すのを防ぐ）
    ct = zin.read("[Content_Types].xml").decode("utf-8")
    ct = re.sub(r'<Override[^>]*PartName="/xl/calcChain\.xml"[^>]*/>', "", ct)
    rels_wb = zin.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    rels_wb = re.sub(r'<Relationship[^>]*Target="calcChain\.xml"[^>]*/>', "", rels_wb)

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == "xl/calcChain.xml":
                continue
            if item.filename == "[Content_Types].xml":
                zout.writestr(item, ct)
                continue
            if item.filename == "xl/_rels/workbook.xml.rels":
                zout.writestr(item, rels_wb)
                continue
            zout.writestr(item, edited.get(item.filename, zin.read(item.filename)))
    zin.close()
    print("SAVED (画像/結合/書式を保持・calcChain除去):", out)


if __name__ == "__main__":
    build()
