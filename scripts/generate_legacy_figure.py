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
        attrs = "".join(f' {key}="{html.escape(value or "", quote=True)}"' for key, value in self.attrs.items())
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


def strip_small_suffix(path: str) -> str:
    """Legacy thumbnails end with "_small" before the extension (e.g.
    WR2_010_small.jpg). The full-size image drops that suffix."""
    match = re.match(r"^(.*?)_small(\.[^./]+)$", path, re.IGNORECASE)
    return f"{match.group(1)}{match.group(2)}" if match else path


def full_size_image_source(image: Node) -> str:
    """Legacy pages wrap thumbnails as <a href="full.jpg"><img
    src="full_small.jpg" /></a>. Prefer the <a href> target (the full-size
    image); fall back to stripping "_small" from the <img src>."""
    ancestor = image.parent
    while ancestor is not None:
        if ancestor.tag == "a":
            href = ancestor.attrs.get("href") or ""
            if href.split("?", 1)[0].lower().endswith((".jpg", ".jpeg", ".png", ".gif")):
                return href
            break
        ancestor = ancestor.parent
    return strip_small_suffix(image.attrs.get("src") or "")


def node_images(node: Node) -> list[str]:
    return [image_path(full_size_image_source(image)) for image in node.descendants("img") if image.attrs.get("src")]


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
        r"(?:販売開始時期|発売開始時期|発売開始|販売開始)\s*[：:：]?\s*"
        r"((?:19|20)\d{2})(?:年|[./-])\s*(\d{1,2})(?:月|[./-])?",
        text,
    )
    if not match:
        return None
    return f"{match.group(1)}.{int(match.group(2)):02d}"


def sales_period(text: str) -> str | None:
    date = r"((?:19|20)\d{2})(?:年|[./-])\s*(\d{1,2})(?:月|[./-])\s*(\d{1,2})日?"
    match = re.search(
        rf"(?:販売時期|発売時期|販売期間|発売期間)\s*[：:：]?\s*"
        rf"{date}\s*(?:～|〜|~|–|—|－|-|から)\s*{date}",
        text,
    )
    if not match:
        return None
    start_year, start_month, start_day, end_year, end_month, end_day = match.groups()
    return (
        f"{start_year}.{int(start_month):02d}.{int(start_day):02d}-"
        f"{end_year}.{int(end_month):02d}.{int(end_day):02d}"
    )


def extract_price(text: str) -> str | None:
    match = re.search(r"価格\s*[：:：]?\s*([^\s　]+)", text)
    if not match:
        return None
    return match.group(1)


METADATA_LABELS = {
    "maker": ("販売元", "発売元", "メーカー", "製造元"),
    "sculptor": ("原型制作", "原形制作", "原型製作", "原形製作"),
    "executiveProducer": ("製作総指揮", "総指揮"),
    "seriesName": ("シリーズ名", "シリーズ"),
    "species": ("種名", "生物名", "和名", "種類"),
    "speciesGroup": ("種群", "種グループ", "分類"),
    "scientificName": ("学名",),
    "releaseDate": ("発売日", "販売日"),
    "size": ("サイズ", "全高", "全長"),
    "price": ("価格",),
    "genre": ("ジャンル",),
    "tags": ("タグ", "タグ情報"),
}


def metadata_text(nodes: list[Node]) -> str:
    value = "\n".join(node.inner_html() for node in nodes)
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", " ", value)
    return html.unescape(value)


def extract_metadata(text: str) -> dict[str, str]:
    labels = sorted({label for values in METADATA_LABELS.values() for label in values}, key=len, reverse=True)
    label_pattern = "|".join(re.escape(label) for label in labels)
    metadata = {}
    for field, field_labels in METADATA_LABELS.items():
        names = "|".join(re.escape(label) for label in sorted(field_labels, key=len, reverse=True))
        match = re.search(
            rf"(?:^|[\s　])(?:{names})\s*[：:]\s*(.*?)(?=(?:[\s　]+(?:{label_pattern})\s*[：:]|[\r\n]|$))",
            text,
        )
        if match:
            value = normalize_text(match.group(1)).strip(" ,、")
            if value:
                if field == "releaseDate":
                    date_match = re.search(r"((?:19|20)\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日", value)
                    if date_match:
                        metadata[field] = f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"
                else:
                    metadata[field] = value
    return metadata


def yaml_field(name: str, value: str) -> str:
    return f"{name}: {quoted(value)}"


def append_metadata(lines: list[str], metadata: dict[str, str], fields: tuple[str, ...]):
    for field in fields:
        if field == "salesPeriod" and not metadata.get(field):
            continue
        if field in {"genre", "tags"}:
            lines.append(f"{field}:")
            value = metadata.get(field, "")
            parts = [part.strip() for part in re.split(r"[,、/]", value) if part.strip()]
            lines.extend(
                f"  - {quoted(part)}"
                for part in (parts or ["-"])
            )
        else:
            lines.append(yaml_field(field, metadata.get(field) or "-"))


def figure_content_id(folder: Path) -> str:
    content_root = Path(__file__).resolve().parents[1] / "src" / "content" / "figures"
    try:
        return folder.resolve().relative_to(content_root.resolve()).as_posix()
    except ValueError as error:
        raise ValueError(f"Output folder must be inside {content_root}: {folder}") from error


def commented_heading_text(raw_html: str) -> str | None:
    """Some legacy pages have their <h4> title commented out (FrontPage
    template placeholders), e.g. <!--<h4>...</h4>-->. Recover the text so the
    title is not lost.
    """
    match = re.search(r"<!--\s*<h4[^>]*>(.*?)</h4>", raw_html, re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    text = re.sub(r"<br\s*/?>", " ", match.group(1), flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return normalize_text(text) or None


def make_topic(images: list[str], comment: str = "") -> dict:
    return {"images": images, "comment": comment}


def extract_sculptor(inner_html: str) -> str | None:
    match = re.search(r"(?:原型制作|原形制作)\s*[：:]\s*([^<]+)", inner_html)
    if not match:
        return None
    return normalize_text(match.group(1)) or None


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
        # A row can contain multiple <td> cells side by side (two-column
        # image layouts), so gather images/text across the whole row rather
        # than only the first cell.
        images = node_images(row)
        if images:
            current["topics"].append(make_topic(images))
        else:
            # Extract the sculptor name from the raw HTML (still containing
            # <br /> tags) before it collapses into a single space, so the
            # name does not swallow the rest of the comment text.
            if "sculptor" not in current:
                sculptor = extract_sculptor(row.inner_html())
                if sculptor:
                    current["sculptor"] = sculptor
            comment = visible_without_images(row)
            if comment and current["topics"]:
                current["topics"][-1]["comment"] = comment
    return items


def yaml_topics(topics: list[dict]) -> list[str]:
    if not topics:
        return ["topics: []"]
    lines = ["topics:"]
    for topic in topics:
        lines.extend([f"  - title: {quoted(topic.get('title', ''))}", "    images:"])
        for image in topic["images"]:
            lines.append(f"      - {quoted(image)}")
        if topic.get("comment"):
            lines.append("    comment: |")
            lines.extend(f"      {line}" for line in topic["comment"].splitlines())
    return lines


def write_title_page(
    folder: Path,
    title: str,
    maker: str,
    overview: str,
    items: list[dict],
    cover: str,
    collection: str,
    metadata: dict[str, str],
    resources: dict[str, dict[str, str]],
):
    title_id = figure_content_id(folder)
    lines = [
        "---",
        f"title: {quoted(title)}",
        'description: ""',
        "contentType: title",
        "kind: series",
        f"maker: {quoted(maker or '-')}",
        "figureIds:",
    ]
    lines.extend(f"  - {title_id}/{index:03d}" for index in range(1, len(items) + 1))
    append_metadata(lines, metadata, (
        "executiveProducer", "seriesName", "releaseStart", "price", "species",
        "speciesGroup", "salesPeriod", "genre", "tags",
    ))
    lines.extend([f"coverImage: {quoted(cover)}", f"collectionImage: {quoted(collection)}"])
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


def write_figure_page(folder: Path, item: dict, index: int, maker: str, metadata: dict[str, str]):
    figure_folder = folder / f"{index:03d}"
    figure_folder.mkdir(exist_ok=True)
    first_image = Path(item["topics"][0]["images"][0]).name if item["topics"] else ""
    title_id = figure_content_id(folder)
    lines = [
        "---",
        f"title: {quoted(item['name'])}",
        'description: ""',
        "contentType: figure",
        f"titleId: {title_id}",
        f"figureId: {quoted(f'{index:03d}')}",
        f"maker: {quoted(maker or '-')}",
    ]
    figure_metadata = {**metadata, **({"sculptor": item["sculptor"]} if item.get("sculptor") else {})}
    figure_metadata.setdefault("species", item["name"])
    append_metadata(lines, figure_metadata, (
        "sculptor", "executiveProducer", "species", "speciesGroup",
        "price", "releaseStart", "salesPeriod", "genre", "tags",
    ))
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


def leading_topic(main: Node) -> dict | None:
    images = []
    comments = []
    for row in direct_rows(main):
        if row_heading(row):
            break
        row_images = node_images(row)
        if row_images:
            images.extend(row_images)
        else:
            comment = visible_without_images(row)
            if comment:
                comments.append(comment)
    if not images and not comments:
        return None
    return make_topic(images, "\n".join(comments)) | {"title": "全体"}


def write_single_figure_page(
    folder: Path,
    title: str,
    maker: str,
    overview: str,
    items: list[dict],
    metadata: dict[str, str],
    cover: str,
    main: Node,
):
    lines = [
        "---",
        f"title: {quoted(title)}",
        'description: ""',
        "contentType: figure",
        "kind: singleLineup",
        f"maker: {quoted(maker or '-')}",
    ]
    append_metadata(lines, metadata, (
        "sculptor", "executiveProducer", "seriesName", "species", "speciesGroup",
        "price", "releaseStart", "salesPeriod", "genre", "tags",
    ))
    lines.extend([f"figureTopImage: {quoted(cover)}", f"coverImage: {quoted(cover)}"])

    topics = []
    initial = leading_topic(main)
    if initial:
        topics.append(initial)
    for item in items:
        images = [image for topic in item["topics"] for image in topic["images"]]
        comments = [topic["comment"] for topic in item["topics"] if topic.get("comment")]
        if images or comments:
            topics.append(make_topic(images, "\n".join(comments)) | {"title": item["name"]})
    if not topics:
        topics = [make_topic(node_images(main), overview) | {"title": "全体"}]
    lines.extend(yaml_topics([
        {**topic, "images": [f"img/{Path(image).name}" for image in topic["images"]]}
        for topic in topics
    ]))
    lines.extend(["---", "", overview, ""])
    (folder / "index.md").write_text("\n".join(lines), encoding="utf-8")


def generate(source: Path, content_type: str):
    if source.parent.parent.name == "legacy-html":
        output_folder = Path.cwd().resolve()
    else:
        output_folder = source.parent.parent if source.parent.name == "_legacy" else source.parent
    document = DocumentParser()
    raw_html = source.read_text(encoding="utf-8", errors="replace")
    document.feed(raw_html)
    content = find_by_id(document.root, "collection_page")
    main = find_by_id(document.root, "collection_page_main")
    if content is None or main is None:
        raise RuntimeError("collection_page and collection_page_main were not found")

    heading = first_descendant(content, "h4")
    title = heading.text() if heading else commented_heading_text(raw_html) or source.stem
    paragraphs = list(content.descendants("p"))
    overview = paragraphs[0].inner_html().strip() if paragraphs else ""
    metadata_source = metadata_text(paragraphs)
    metadata = extract_metadata(metadata_source)
    maker_candidates = ("海洋堂", "バンダイ", "いきもん", "奇譚クラブ", "タカラトミー", "リーメント")
    maker_text = " ".join(paragraph.text() for paragraph in paragraphs)
    maker = metadata.get("maker") or next((candidate for candidate in maker_candidates if candidate in maker_text), "")
    if maker and title.startswith(maker):
        title = title[len(maker):].strip()
    metadata.setdefault("maker", maker)
    items = extract_items(main)
    resources = extract_resources(main)
    metadata.setdefault("releaseStart", release_start(metadata_source) or "")
    metadata.setdefault("salesPeriod", sales_period(metadata_source) or "")
    metadata.setdefault("price", extract_price(metadata_source) or "")
    metadata.setdefault("sculptor", extract_sculptor(metadata_source) or "")
    # Always resolve images relative to the working collection folder, since
    # the source HTML may have been relocated to _legacy/ or legacy-html/.
    image_dir = output_folder / "img"
    all_images = list(content.descendants("img"))
    cover_source = next(
        (image_path(full_size_image_source(image)) for image in all_images if image.attrs.get("src")),
        "",
    )
    collection_source = next(
        (image_path(link.attrs["href"]) for link in content.descendants("a") if (link.attrs.get("href") or "").lower().endswith((".jpg", ".jpeg", ".png", ".gif"))),
        cover_source,
    )
    cover = f"img/{Path(cover_source).name}" if cover_source else ""
    collection = f"img/{Path(collection_source).name}" if collection_source else cover
    if content_type == "title":
        write_title_page(output_folder, title, maker, overview, items, cover, collection, metadata, resources)
        title_id = figure_content_id(output_folder)
        for index, item in enumerate(items, 1):
            for topic in item["topics"]:
                for image in topic["images"]:
                    source_image = image_dir / Path(image).name
                    target_dir = output_folder / f"{index:03d}"
                    target_dir.mkdir(exist_ok=True)
                    target_image = target_dir / source_image.name
                    if source_image.is_file() and not target_image.exists():
                        shutil.copy2(source_image, target_image)
            write_figure_page(output_folder, item, index, maker, metadata)
        print(f"Generated {output_folder / 'index.md'} and {len(items)} figure pages (titleId: {title_id}).")
    else:
        write_single_figure_page(output_folder, title, maker, overview, items, metadata, cover, main)
        print(f"Generated {output_folder / 'index.md'} as a singleLineup figure.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", type=Path, default=Path("index.html"))
    parser.add_argument("--content-type", choices=("title", "figure"), default="title")
    args = parser.parse_args()
    source = args.source.resolve()
    if not source.exists() and source.name == "index.html" and (source.parent / "_legacy" / "index.html.bak").exists():
        source = source.parent / "_legacy" / "index.html.bak"
    if not source.exists() and source.name == "index.html":
        repository_root = Path(__file__).resolve().parents[1]
        archived_source = repository_root / "legacy-html" / source.parent.name / "index.html"
        if archived_source.exists():
            source = archived_source
    generate(source, args.content_type)
    if source.name == "index.html" and "legacy-html" not in source.parts:
        legacy_source = source.parent / "_legacy" / "index.html.bak"
        legacy_source.parent.mkdir(exist_ok=True)
        source.replace(legacy_source)
        print(f"Moved legacy source to {legacy_source}")


if __name__ == "__main__":
    main()
