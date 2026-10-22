#!/usr/bin/env python3
"""Build/check a review-only EPUB from an immutable, indexed manuscript commit.

Python standard library + the repository's existing Node runtime; no publishing.
"""
import argparse
from collections import Counter
from datetime import date
from hashlib import sha1, sha256
from html import escape
from io import BytesIO
import json
from pathlib import Path
import posixpath
import re
import subprocess
import uuid
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
XHTML = "http://www.w3.org/1999/xhtml"
OPF = "http://www.idpf.org/2007/opf"
EPUB = "http://www.idpf.org/2007/ops"
NS = {"h": XHTML, "o": OPF}
BASE = "https://github.com/ForceMind/Return-to-Starship"
CSS = """@charset "UTF-8";
body { font-family: serif; line-height: 1.85; margin: 1em; }
h1 { font-size: 1.6em; line-height: 1.5; margin: 2em 0 1.5em; }
p { margin: 0 0 .7em; text-indent: 2em; text-align: justify;
    line-break: strict; overflow-wrap: break-word; orphans: 2; widows: 2; }
hr { border: 0; border-top: 1px solid; width: 12%; margin: 2.5em auto; }
.title-page { text-align: center; margin-top: 3em; }
.title-page h1 { font-size: 2.5em; letter-spacing: .15em; }
.title-page p, .review-note p { text-indent: 0; text-align: inherit; }
.review-note { margin-top: 3em; }
.source { overflow-wrap: anywhere; font-size: .8em; }
nav ol { padding-left: 1.6em; }
nav li { margin: .6em 0; }
"""


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def inline(text):
    text = escape(text, quote=False)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    require("*" not in text, "Unsupported/unbalanced emphasis in manuscript")
    return text


def blocks(source):
    body = source.split("\n", 1)[1].strip()
    result = []
    for raw in re.split(r"\n\s*\n", body):
        text = " ".join(raw.splitlines()).strip()
        if text == "***":
            result.append(("hr", ""))
        else:
            require(not re.match(r"^(#{1,6}\s|>|```|[-+]\s|\d+\.\s)", text)
                    and not re.search(r"!?\[[^]]*\]\(|<[/!a-zA-Z]", text),
                    "Unsupported Markdown block: " + text[:60])
            result.append(("p", text))
    return result


def document(title, content):
    return ('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
            f'<html xmlns="{XHTML}" xmlns:epub="{EPUB}" lang="zh-CN" xml:lang="zh-CN">'
            f'<head><meta charset="utf-8" /><title>{escape(title)}</title>'
            '<link rel="stylesheet" type="text/css" href="style.css" /></head>'
            f'<body>{content}</body></html>\n')


def build(index_path):
    index = json.loads(index_path.read_text())
    require(index["schema_version"] == 1 and index["edition"] == "R1"
            and index["status"] == "author_review_candidate"
            and index["publish_approved"] is False, "Expected review-only R1 index")
    source = index["source_commit"]
    require(re.fullmatch(r"[a-f0-9]{40}", source), "Invalid source commit")
    require(git("rev-parse", source + "^{commit}").decode().strip() == source,
            "Immutable source commit required")
    stamp = date.fromisoformat(index["date"])
    require(index["chapter_count"] == len(index["chapters"]) == 23, "Expected 23 chapters")
    compiled = ROOT / index["compiled_path"]
    require(compiled.resolve().is_relative_to(ROOT / "editions/zh"), "Invalid compiled path")
    require(sha256(compiled.read_bytes()).hexdigest() == index["compiled_sha256"],
            "Compiled review copy differs from frozen index")
    chapters = []
    for i, meta in enumerate(index["chapters"]):
        cid = f"{i:02d}"
        expected = f'manuscript/zh/{cid}-{"introduction" if i == 0 else "chapter"}.md'
        require(meta["id"] == cid and meta["path"] == expected, "Invalid chapter order/path")
        raw = git("show", f"{source}:{expected}")
        require(sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest() == meta["blob_sha"],
                "Chapter blob differs: " + cid)
        text = raw.decode("utf-8")
        require(text.splitlines()[0] == "# " + meta["title"], "Chapter title differs: " + cid)
        chapters.append({**meta, "source": text, "blocks": blocks(text)})
    counts = json.loads(subprocess.check_output([
        "node", "-e", "let s='';process.stdin.setEncoding('utf8');"
        "process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>"
        "console.log(JSON.stringify(JSON.parse(s).map(x=>(x.match(/\\p{Script=Han}/gu)||[]).length))));"
    ], input=json.dumps([c["source"].split("\n", 1)[1] for c in chapters]).encode()))
    require(counts == [c["hanzi"] for c in chapters]
            and sum(counts) == index["manuscript_hanzi"], "Hanzi totals differ")
    files = {"mimetype": "application/epub+zip",
             "META-INF/container.xml": '<?xml version="1.0" encoding="utf-8"?>\n'
             '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
             '<rootfiles><rootfile full-path="OEBPS/package.opf" '
             'media-type="application/oebps-package+xml" /></rootfiles></container>\n',
             "OEBPS/style.css": CSS}
    files["OEBPS/title.xhtml"] = document("重返星舰｜中文审阅候选R1", f'''
<section class="title-page" epub:type="titlepage">
<h1>重返星舰</h1><p lang="en" xml:lang="en">Return to Starship</p>
<p>中文集中审阅候选 R1</p><p>{stamp.isoformat()} · 待作者审定</p></section>
<section class="review-note" epub:type="preface"><h2>审阅说明</h2>
<p>引言至第二十二章，共23篇，正文{sum(counts):,}汉字。此电子书与R1合并稿使用同一固定正文源；仅转换排版，没有另改小说文字。</p>
<p>本稿采用当前D路线，是内部审校后的完整创作候选，未经作者批准出版。作者原始设定与D路线新增谜底分开管理。</p>
<p>作者集中审阅三组内容：白球为探索者五号及库克生还；海克关闭睿海的动机；米克事故与瑞娜责任结构。</p>
<p>本书不含正式发行书号、出版机构或已批准作者署名；这些信息应随作者审定的发行版另行确认。</p>
<p class="source">正文源提交：<a href="{BASE}/commit/{source}">{source}</a></p>
<p><a href="{BASE}/blob/{source}/docs/d-route-ending-register.md">D路线审阅登记</a> · <a href="nav.xhtml">章节目录</a></p>
</section>''')
    nav = ['<nav epub:type="toc" id="toc"><h1>目录</h1><ol>',
           '<li><a href="title.xhtml">审阅说明</a></li>']
    items = ['<item id="title" href="title.xhtml" media-type="application/xhtml+xml" />',
             '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
             '<item id="style" href="style.css" media-type="text/css" />']
    spine = ['<itemref idref="title" />', '<itemref idref="nav" />']
    for c in chapters:
        name = f'chapter-{c["id"]}'
        seen = Counter()
        rendered = []
        for kind, text in c["blocks"]:
            if kind == "hr":
                rendered.append('<hr aria-label="场景转换" />')
            else:
                key = sha256(text.encode()).hexdigest()[:12]
                seen[key] += 1
                rendered.append(f'<p id="p-{key}-{seen[key]}">{inline(text)}</p>')
        files[f"OEBPS/{name}.xhtml"] = document(c["title"],
            f'<main><h1>{escape(c["title"])}</h1><section epub:type="chapter" '
            'aria-label="正文">' + "\n".join(rendered) + '</section></main>')
        nav.append(f'<li><a href="{name}.xhtml">{escape(c["title"])}</a></li>')
        items.append(f'<item id="{name}" href="{name}.xhtml" media-type="application/xhtml+xml" />')
        spine.append(f'<itemref idref="{name}" />')
    files["OEBPS/nav.xhtml"] = document("目录｜重返星舰", "".join(nav) + "</ol></nav>")
    identifier = uuid.uuid5(uuid.NAMESPACE_URL, f"{BASE}/review/R1/{stamp}/{source}")
    files["OEBPS/package.opf"] = f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="{OPF}" version="3.0" unique-identifier="book-id" xml:lang="zh-CN">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:uuid:{identifier}</dc:identifier>
<dc:title>重返星舰｜中文审阅候选R1</dc:title><dc:language>zh-CN</dc:language>
<dc:description>完整23篇，{sum(counts):,}汉字。待作者审定，未经批准出版。</dc:description>
<dc:source>{BASE}/commit/{source}</dc:source>
<meta property="dcterms:modified">{stamp.isoformat()}T00:00:00Z</meta>
<meta property="rendition:layout">reflowable</meta></metadata>
<manifest>{''.join(items)}</manifest><spine>{''.join(spine)}</spine></package>
'''
    out = BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        for name, text in files.items():
            info = zipfile.ZipInfo(name, (stamp.year, stamp.month, stamp.day, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, text.encode("utf-8"), compresslevel=9)
    data = out.getvalue()
    verify(data, chapters)
    report = {"schema_version": 1, "edition": "R1", "status": "author_review_candidate",
              "publish_approved": False, "date": stamp.isoformat(), "source_commit": source,
              "chapter_count": 23, "manuscript_hanzi": sum(counts),
              "epub_sha256": sha256(data).hexdigest(), "epub_bytes": len(data),
              "checks": ["ordered_source_blobs_and_hanzi", "compiled_markdown_sha256",
                         "zip_container_and_xml", "manifest_spine_and_navigation",
                         "all_chapter_text_and_scene_breaks", "local_links_and_fragments"],
              "chapters": [{k: c[k] for k in ("id", "title", "hanzi", "blob_sha")} for c in chapters]}
    return data, report


def verify(data, chapters):
    with zipfile.ZipFile(BytesIO(data)) as archive:
        require(archive.testzip() is None, "ZIP CRC failure")
        entries = archive.infolist()
        require(entries[0].filename == "mimetype" and entries[0].compress_type == zipfile.ZIP_STORED
                and not entries[0].extra and archive.read("mimetype") == b"application/epub+zip",
                "Invalid EPUB mimetype entry")
        names = archive.namelist()
        require(len(names) == len(set(names)) and len(names) == 29, "Unexpected/duplicate ZIP entries")
        docs = {n: ET.fromstring(archive.read(n)) for n in names if n.endswith((".xml", ".opf", ".xhtml"))}
        package = docs["OEBPS/package.opf"]
        items = package.findall("o:manifest/o:item", NS)
        require({"OEBPS/" + el.attrib["href"] for el in items} ==
                set(names) - {"mimetype", "META-INF/container.xml", "OEBPS/package.opf"},
                "Manifest does not cover all publication resources")
        require([x.attrib["idref"] for x in package.findall("o:spine/o:itemref", NS)] ==
                ["title", "nav"] + ["chapter-" + c["id"] for c in chapters], "Spine order differs")
        nav = docs["OEBPS/nav.xhtml"].findall(".//h:nav/h:ol/h:li/h:a", NS)
        require([x.attrib["href"] for x in nav] == ["title.xhtml"] +
                [f'chapter-{c["id"]}.xhtml' for c in chapters], "Navigation differs")
        for c in chapters:
            doc = docs[f'OEBPS/chapter-{c["id"]}.xhtml']
            require(doc.find(".//h:h1", NS).text == c["title"], "Rendered chapter heading differs")
            section = doc.find(".//h:section", NS)
            actual = [(el.tag.removeprefix("{" + XHTML + "}"), "".join(el.itertext())) for el in section]
            # Independent text-only removal preserves punctuation, spaces and block order.
            expected = [(kind, re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", text))
                        for kind, text in c["blocks"]]
            require(actual == expected, "Rendered paragraphs/scene breaks differ: " + c["id"])
        for name, doc in docs.items():
            ids = [el.attrib["id"] for el in doc.iter() if "id" in el.attrib]
            require(len(ids) == len(set(ids)), "Duplicate XML IDs: " + name)
            for el in doc.iter():
                require(el.tag != "{" + XHTML + "}script", "Scripts are not allowed")
                for attr in ("href", "src"):
                    target = el.attrib.get(attr, "")
                    if not target or target.startswith("https://"):
                        continue
                    dest, _, fragment = target.partition("#")
                    dest = posixpath.normpath(posixpath.join(posixpath.dirname(name), dest)) if dest else name
                    require(dest in names, "Broken local link: " + target)
                    if fragment:
                        require(any(x.attrib.get("id") == fragment for x in docs[dest].iter()),
                                "Broken local fragment: " + target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", required=True, help="Frozen R1 .sources.json path")
    parser.add_argument("--check", action="store_true", help="Verify saved bytes without writing")
    args = parser.parse_args()
    index_path = (ROOT / args.index).resolve()
    require(index_path.is_relative_to(ROOT / "editions/zh") and index_path.name.endswith(".sources.json"),
            "Use an editions/zh source index")
    stem = index_path.name.removesuffix(".sources.json")
    output = index_path.with_name(stem + ".epub")
    report_path = index_path.with_name(stem + ".epub-checks.json")
    data, report = build(index_path)
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        require(output.read_bytes() == data, "Saved EPUB differs from reproducible build")
        require(report_path.read_text() == serialized, "Saved checks differ")
    else:
        require(not output.exists() or output.read_bytes() == data,
                "Refusing to overwrite a different candidate; create a new dated source index")
        output.write_bytes(data)
        report_path.write_text(serialized, encoding="utf-8")
    print(json.dumps({"output": str(output.relative_to(ROOT)), "chapters": 23,
                      "hanzi": report["manuscript_hanzi"], "sha256": report["epub_sha256"],
                      "checked_saved_bytes": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
