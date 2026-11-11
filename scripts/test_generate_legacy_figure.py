import unittest

from generate_legacy_figure import DocumentParser, append_metadata, extract_items, find_by_id


class AppendMetadataTest(unittest.TestCase):
    def test_executive_producer_placeholder_is_only_emitted_for_kaiyodo(self):
        for maker, producer, expected in (
            ("海洋堂", "", ['executiveProducer: "-"']),
            ("YUJIN", "", []),
            ("YUJIN", "-", []),
            ("YUJIN", "Producer", ['executiveProducer: "Producer"']),
        ):
            with self.subTest(maker=maker, producer=producer):
                lines = []
                append_metadata(lines, {"maker": maker, "executiveProducer": producer}, ("executiveProducer",))
                self.assertEqual(lines, expected)


class ExtractItemsTest(unittest.TestCase):
    def test_parallel_and_single_column_figures(self):
        document = DocumentParser()
        document.feed(
            '<div id="collection_page_main"><table>'
            '<tr><th colspan="2">A</th><th colspan="2">B</th></tr>'
            '<tr><td><img src="a1.jpg"></td><td><img src="a2.jpg"></td>'
            '<td><img src="b1.jpg"></td><td><img src="b2.jpg"></td></tr>'
            '<tr><td colspan="2">first</td><td colspan="2">second</td></tr>'
            '<tr><th colspan="2">C</th></tr>'
            '<tr><td><img src="c1.jpg"></td><td><img src="c2.jpg"></td></tr>'
            '<tr><td colspan="2">third</td></tr></table></div>'
        )
        items = extract_items(find_by_id(document.root, "collection_page_main"))
        self.assertEqual(
            [(item["name"], item["topics"][0]["images"], item["topics"][0]["comment"]) for item in items],
            [
                ("A", ["a1.jpg", "a2.jpg"], "first"),
                ("B", ["b1.jpg", "b2.jpg"], "second"),
                ("C", ["c1.jpg", "c2.jpg"], "third"),
            ],
        )


if __name__ == "__main__":
    unittest.main()