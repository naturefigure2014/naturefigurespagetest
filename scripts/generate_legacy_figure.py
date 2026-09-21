r"""Generate current Astro content from a legacy Nature Figure index.html.

Run this script from a legacy collection directory, for example:
    python C:\astro\7\scripts\generate_legacy_figure.py
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
from html.parser import HTMLParser
from pathlib import Path


class Node:
    def __init__(self, tag: str = "", attrs: dict[str, str] | None = None, parent: "Node | None" = None):
        self.tag = tag
        self.attrs = attrs or {}
        self.parent = parent
        self.children: list[Node | str] = []

    def descendants(self, tag: str | None = None):
        for child in self.children:
            if isinstance(child, Node):
                if tag is None or child.tag == tag:
                    yield child
                yield from child.descendants(tag)

    def text(self) -> str:
        return normalize_text("".join(child.text() if isinstance(child, Node) else child for child in self.children))

    def inner_html(self) -> str:
        return "".join(
            child.to_html() if isinstance(child, Node) else html.escape(child, quote=False)
            for child in self.children
        )

    def to_html(self) -> str:
        if self.tag == "#root":
            return self.inner_html()
        attrs = "".join(f' {key}="{html.escape(value, quote=True)}"' for key, value in self.attrs.items())
        if self.tag in {"br", "img", "meta", "link", "input", "hr"}:
            return f"<{self.tag}{attrs} />"
        return f"<{self.tag}{attrs}>{self.inner_html()}</{self.tag}>"


class DocumentParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag.lower(), dict(attrs), self.current)
        self.current.children.append(node)
        if tag.lower() not in {"br", "img", "meta", "link", "input", "hr"}:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.current.tag == tag.lower():
            self.current = self.current.parent or self.root

    def handle_endtag(self, tag):
        node = self.current
        while node is not self.root:
            if node.tag == tag.lower():
                self.current = node.parent or self.root
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def quoted(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def image_path(src: str) -> str:
    src = src.split("?", 1)[0].replace("\\", "/")
    return src.lstrip("./")


def node_images(node: Node) -> list[str]:
    return [image_path(image.attrs["src"]) for image in node.descendants("img") if image.attrs.get("src")]


def visible_without_images(node: Node) -> str:
    def text_without_images(value: Node | str) -> str:
        if isinstance(value, str):
            return value
        if value.tag in {"img", "script", "style"}:
            return ""
        return "".join(text_without_images(child) for child in value.children)

    return normalize_text(text_without_images(node))


def find_by_id(root: Node, node_id: str) -> Node | None:
    return next((node for node in root.descendants() if node.attrs.get("id") == node_id), None)


def first_descendant(root: Node, tag: str) -> Node | None:
    return next(root.descendants(tag), None)


def direct_rows(table: Node) -> list[Node]:
    return [node for node in table.descendants("tr")]


def row_heading(row: Node) -> str:
    headings = list(row.descendants("th"))
    return normalize_text(headings[0].text()) if headings else ""


def extract_resources(main: Node) -> dict[str, dict[str, str]]:
    resources: dict[str, dict[str, str]] = {}
    labels = {
        "解説書": "guide",
        "ディスプレイポップ": "displayPop",
        "DP": "displayPop",
    }
    active: str | None = None
    for row in direct_rows(main):
        heading = row_heading(row)
        if heading:
            active = labels.get(heading)
            continue
        if not active:
            continue
        cells = list(row.descendants("td"))
        if not cells:
            continue
        images = node_images(cells[0])
        if images and active not in resources:
            resources[active] = {
                "image": images[0],
                "description": visible_without_images(cells[0]),
            }
    return resources


def release_start(text: str) -> str | None:
    match = re.search(
        r"(?:販売開始時期|発売開始|販売開始)\s*[：:：]?\s*"
        r"((?:19|20)\d{2})(?:年|[./-])\s*(\d{1,2})(?:月|[./-])?",
        text,
    )
    if not match:
        return None
    return f"{match.group(1)}.{int(match.group(2)):02d}"


def make_topic(images: list[str], comment: str = "") -> dict:
    return {"images": images, "comment": comment}


def extract_items(main: Node, limit: int = 12):
    rows = direct_rows(main)
    items = []
    current = None
    for row in rows:
        headings = list(row.descendants("th"))
        if headings:
            heading = normalize_text(headings[0].text())
            if heading in {"解説書", "ディスプレイポップ", "DP", "ミニパンフ", "ブックレット"}:
                break
            if len(items) >= limit:
                break
            current = {"name": heading, "topics": []}
            items.append(current)
            continue
        if current is None:
            continue
        cells = list(row.descendants("td"))
        if not cells:
            continue
        images = node_images(cells[0])
        current["cell_text"] = f"{current.get('cell_text', '')} {visible_without_images(cells[0])}"
        if images:
            current["topics"].append(make_topic(images))
        else:
            comment = visible_without_images(cells[0])
            if comment and current["topics"]:
                current["topics"][-1]["comment"] = comment
    return items


def yaml_topics(topics: list[dict]) -> list[str]:
    if not topics:
        return ["topics: []"]
    lines = ["topics:"]
    for topic in topics:
        lines.extend(["  - title: \"\"", "    images:"])
        for image in topic["images"]:
            lines.append(f"      - {quoted(image)}")
        lines.append("    comment: |")
        lines.append(f"      {topic['comment']}" if topic["comment"] else "      ")
    return lines


def write_title_page(
    folder: Path,
    title: str,
    maker: str,
    overview: str,
    items: list[dict],
    cover: str,
    collection: str,
    release: str | None,
    resources: dict[str, dict[str, str]],
):
    folder_name = folder.name
    lines = [
        "---",
        f"title: {quoted(title)}",
        'description: ""',
        "contentType: title",
        "kind: series",
        f"maker: {quoted(maker)}",
        "series:",
        "  - capsuleq",
        "seriesName: カプセルQミュージアム",
        "figureIds:",
    ]
    lines.extend(f"  - kaiyodo/capsuleq/{folder_name}/{index:03d}" for index in range(1, len(items) + 1))
    lines.extend([
        "executiveProducer: 松村しのぶ" if "総指揮" in overview else None,
        f"releaseStart: {quoted(release)}" if release else None,
        f"coverImage: {quoted(cover)}",
        f"collectionImage: {quoted(collection)}",
    ])
    if resources:
        lines.append("resources:")
        for key in ("guide", "displayPop"):
            resource = resources.get(key)
            if resource:
                lines.extend([
                    f"  {key}:",
                    f"    image: {quoted(resource['image'])}",
                ])
                if resource["description"]:
                    lines.extend(["    description: |", f"      {resource['description']}"])
    lines.extend(["---", "", overview, ""])
    (folder / "index.md").write_text("\n".join(line for line in lines if line is not None), encoding="utf-8")


def write_figure_page(folder: Path, item: dict, index: int, maker: str):
    figure_folder = folder / f"{index:03d}"
    figure_folder.mkdir(exist_ok=True)
    first_image = Path(item["topics"][0]["images"][0]).name if item["topics"] else ""
    sculptor_match = re.search(r"(?:原型制作|原形制作)\s*[：:]\s*([^<\n]+)", item.get("cell_text", ""))
    lines = [
        "---",
        f"title: {quoted(item['name'])}",
        'description: ""',
        "contentType: figure",
        f"titleId: kaiyodo/capsuleq/{folder.name}",
        f"figureId: {quoted(f'{index:03d}')}",
        f"species: {quoted(item['name'])}",
        'speciesGroup: ""',
        f"maker: {quoted(maker)}",
    ]
    if sculptor_match:
        lines.append(f"sculptor: {quoted(normalize_text(sculptor_match.group(1)))}")
    lines.extend([
        f"figureTopImage: {quoted(first_image)}",
        f"coverImage: {quoted(first_image)}",
    ])
    local_topics = [
        {**topic, "images": [Path(image).name for image in topic["images"]]}
        for topic in item["topics"]
    ]
    lines.extend(yaml_topics(local_topics))
    lines.extend(["---", ""])
    (figure_folder / "index.md").write_text("\n".join(lines), encoding="utf-8")


def generate(source: Path):
    if source.parent.parent.name == "legacy-html":
        output_folder = Path.cwd().resolve()
    else:
        output_folder = source.parent.parent if source.parent.name == "_legacy" else source.parent
    document = DocumentParser()
    document.feed(source.read_text(encoding="utf-8", errors="replace"))
    content = find_by_id(document.root, "collection_page")
    main = find_by_id(document.root, "collection_page_main")
    if content is None or main is None:
        raise RuntimeError("collection_page and collection_page_main were not found")

    heading = first_descendant(content, "h4")
    title = heading.text() if heading else source.stem
    paragraphs = list(content.descendants("p"))
    overview = paragraphs[0].inner_html().strip() if paragraphs else ""
    maker_candidates = ("海洋堂", "バンダイ", "いきもん", "奇譚クラブ")
    maker_text = " ".join(paragraph.text() for paragraph in paragraphs)
    maker = next((candidate for candidate in maker_candidates if candidate in maker_text), "海洋堂")
    items = extract_items(main)
    resources = extract_resources(main)
    release = release_start(" ".join(paragraph.text() for paragraph in paragraphs))
    image_dir = source.parent / "img"
    all_images = list(content.descendants("img"))
    cover_source = next((image_path(image.attrs["src"]) for image in all_images if image.attrs.get("src")), "")
    collection_source = next(
        (image_path(link.attrs["href"]) for link in content.descendants("a") if link.attrs.get("href", "").lower().endswith((".jpg", ".jpeg", ".png", ".gif"))),
        cover_source,
    )
    cover = f"img/{Path(cover_source).name}" if cover_source else ""
    collection = f"img/{Path(collection_source).name}" if collection_source else cover
    write_title_page(output_folder, title, maker, overview, items, cover, collection, release, resources)
    for index, item in enumerate(items, 1):
        for topic in item["topics"]:
            for image in topic["images"]:
                source_image = image_dir / Path(image).name
                target_dir = output_folder / f"{index:03d}"
                target_dir.mkdir(exist_ok=True)
                target_image = target_dir / source_image.name
                if source_image.is_file() and not target_image.exists():
                    shutil.copy2(source_image, target_image)
        write_figure_page(output_folder, item, index, maker)
    print(f"Generated {output_folder / 'index.md'} and {len(items)} figure pages.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", type=Path, default=Path("index.html"))
    args = parser.parse_args()
    source = args.source.resolve()
    if not source.exists() and source.name == "index.html" and (source.parent / "_legacy" / "index.html.bak").exists():
        source = source.parent / "_legacy" / "index.html.bak"
    if not source.exists() and source.name == "index.html":
        repository_root = Path(__file__).resolve().parents[1]
        archived_source = repository_root / "legacy-html" / source.parent.name / "index.html"
        if archived_source.exists():
            source = archived_source
    generate(source)
    if source.name == "index.html" and "legacy-html" not in source.parts:
        legacy_source = source.parent / "_legacy" / "index.html.bak"
        legacy_source.parent.mkdir(exist_ok=True)
        source.replace(legacy_source)
        print(f"Moved legacy source to {legacy_source}")


if __name__ == "__main__":
    main()
