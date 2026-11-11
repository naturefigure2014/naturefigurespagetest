from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from generate_legacy_figure import DocumentParser, append_metadata, extract_items, find_by_id, write_figure_page


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


class WriteFigurePageTest(unittest.TestCase):
    def test_registers_species_emitted_from_item_name(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            folder = root / "figures" / "series"
            folder.mkdir(parents=True)
            species_file = root / "species.yaml"
            species_file.write_text("groups:\n  その他の動物:\n    species:\n", encoding="utf-8")

            with patch("generate_legacy_figure.figure_content_id", return_value="yujin/series"):
                write_figure_page(folder, {"name": "シャコ", "topics": []}, 1, "YUJIN", {}, species_file)

            page = (folder / "001" / "index.md").read_text(encoding="utf-8")
            species_data = species_file.read_text(encoding="utf-8")
            self.assertIn('species: "シャコ"', page)
            self.assertIn('      - "シャコ"', species_data)

    def test_registers_species_preserved_in_existing_page(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            folder = root / "figures" / "series"
            figure_folder = folder / "001"
            figure_folder.mkdir(parents=True)
            page_path = figure_folder / "index.md"
            page_path.write_text('---\nspecies: "保存済み種"\n---\n', encoding="utf-8")
            species_file = root / "species.yaml"
            species_file.write_text("groups:\n  その他の動物:\n    species:\n", encoding="utf-8")

            with patch("generate_legacy_figure.figure_content_id", return_value="yujin/series"):
                write_figure_page(folder, {"name": "別の種", "topics": []}, 1, "YUJIN", {}, species_file)

            page = page_path.read_text(encoding="utf-8")
            species_data = species_file.read_text(encoding="utf-8")
            self.assertIn('species: "保存済み種"', page)
            self.assertIn('      - "保存済み種"', species_data)
            self.assertNotIn('"別の種"', species_data)


if __name__ == "__main__":
    unittest.main()