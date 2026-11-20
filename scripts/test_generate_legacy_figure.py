from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from generate_legacy_figure import (
    DocumentParser,
    append_metadata,
    extract_items,
    find_by_id,
    main,
    write_figure_page,
    write_single_figure_page,
)


class ContinuationOrderTest(unittest.TestCase):
    def test_explicit_continuations_are_passed_in_requested_order(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source, first, second = [root / name for name in ("source.html", "first.html", "second.html")]
            for path in (source, first, second):
                path.touch()
            with patch.object(sys, "argv", [
                "generate_legacy_figure.py", str(source),
                "--continuation", str(second), "--continuation", str(first),
            ]), patch("generate_legacy_figure.generate") as generate:
                main()
            self.assertEqual(generate.call_args.args[2], [second.resolve(), first.resolve()])

    def test_duplicate_continuations_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source, extra = root / "source.html", root / "extra.html"
            source.touch()
            extra.touch()
            with patch.object(sys, "argv", [
                "generate_legacy_figure.py", str(source),
                "--continuation", str(extra), "--continuation", str(extra),
            ]), patch("generate_legacy_figure.generate") as generate:
                with self.assertRaises(SystemExit):
                    main()
            generate.assert_not_called()


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

    def test_species_parenthetical_notes_are_removed(self):
        for species in ("アメリカザリガニ(脱皮直後)", "アメリカザリガニ（白）"):
            with self.subTest(species=species):
                lines = []
                append_metadata(lines, {"species": species}, ("species",))
                self.assertEqual(lines, ['species: "アメリカザリガニ"'])


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
    @staticmethod
    def create_figure_image(folder: Path):
        figure_folder = folder / "001"
        figure_folder.mkdir(parents=True, exist_ok=True)
        (figure_folder / "figure.jpg").write_bytes(b"image")

    def test_registers_species_emitted_from_item_name(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            folder = root / "figures" / "series"
            folder.mkdir(parents=True)
            self.create_figure_image(folder)
            species_file = root / "species.yaml"
            species_file.write_text("groups:\n  その他の動物:\n    species:\n", encoding="utf-8")

            with patch("generate_legacy_figure.figure_content_id", return_value="yujin/series"):
                write_figure_page(folder, {"name": "シャコ", "topics": []}, 1, "YUJIN", {}, species_file)

            page = (folder / "001" / "index.md").read_text(encoding="utf-8")
            species_data = species_file.read_text(encoding="utf-8")
            self.assertIn('species: "シャコ"', page)
            self.assertIn('      - "シャコ"', species_data)

    def test_registers_species_without_parenthetical_note(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            folder = root / "figures" / "series"
            folder.mkdir(parents=True)
            self.create_figure_image(folder)
            species_file = root / "species.yaml"
            species_file.write_text("groups:\n  その他の動物:\n    species:\n", encoding="utf-8")

            with patch("generate_legacy_figure.figure_content_id", return_value="tta/series"):
                write_figure_page(
                    folder,
                    {"name": "アメリカザリガニ(脱皮直後)", "topics": []},
                    1,
                    "TTA",
                    {},
                    species_file,
                )

            page = (folder / "001" / "index.md").read_text(encoding="utf-8")
            species_data = species_file.read_text(encoding="utf-8")
            self.assertIn('species: "アメリカザリガニ"', page)
            self.assertIn('      - "アメリカザリガニ"', species_data)
            self.assertNotIn("脱皮直後", species_data)

    def test_does_not_duplicate_species_when_base_name_exists(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            folder = root / "figures" / "series"
            folder.mkdir(parents=True)
            self.create_figure_image(folder)
            species_file = root / "species.yaml"
            species_file.write_text(
                'groups:\n  その他の動物:\n    species:\n      - "アメリカザリガニ"\n',
                encoding="utf-8",
            )

            with patch("generate_legacy_figure.figure_content_id", return_value="tta/series"):
                write_figure_page(
                    folder,
                    {"name": "アメリカザリガニ(白)", "topics": []},
                    1,
                    "TTA",
                    {},
                    species_file,
                )

            species_data = species_file.read_text(encoding="utf-8")
            self.assertEqual(species_data.count('"アメリカザリガニ"'), 1)

    def test_registers_species_preserved_in_existing_page(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            folder = root / "figures" / "series"
            figure_folder = folder / "001"
            figure_folder.mkdir(parents=True)
            (figure_folder / "figure.jpg").write_bytes(b"image")
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

    def test_emits_empty_species_when_no_jpg_file_exists(self):
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
            self.assertIn('species: ""', page)
            self.assertNotIn('"保存済み種"', page)
            self.assertNotIn('"別の種"', species_data)


class WriteSingleFigurePageTest(unittest.TestCase):
    def generate_page(self, root: Path, create_image: bool) -> str:
        folder = root / "figures" / "series"
        image_dir = folder / "img"
        image_dir.mkdir(parents=True)
        if create_image:
            (image_dir / "figure.jpg").write_bytes(b"image")

        document = DocumentParser()
        document.feed(
            '<div id="collection_page_main"><table><tr><td><img src="figure.jpg"></td></tr></table></div>'
        )
        main = find_by_id(document.root, "collection_page_main")
        with patch("generate_legacy_figure.figure_content_id", return_value="yujin/series"):
            write_single_figure_page(
                folder, "フィギュア", "YUJIN", "", [], {"species": "設定済み種"},
                [], "", main, {}, "",
            )
        return (folder / "index.md").read_text(encoding="utf-8")

    def test_emits_empty_species_when_referenced_image_file_is_missing(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            page = self.generate_page(Path(temporary_directory), create_image=False)

        self.assertIn('species: ""', page)

    def test_keeps_species_when_figure_image_file_exists(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            page = self.generate_page(Path(temporary_directory), create_image=True)

        self.assertIn('species: "設定済み種"', page)


if __name__ == "__main__":
    unittest.main()