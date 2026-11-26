import assert from "node:assert/strict";
import test from "node:test";
import { getCreatorFigures } from "../src/lib/creator-figures.mjs";

const figures = [
  { id: "sculptors/example/index", data: { contentType: "title", figureIds: ["sculptors/example/b", "sculptors/example/a", "sculptors/example/missing"] } },
  { id: "sculptors/example/a", data: { contentType: "figure" } },
  { id: "sculptors/example/b/index.md", data: { contentType: "figure" } },
  { id: "sculptors/example/nested/c", data: { contentType: "figure" } },
  { id: "sculptors/example/nested", data: { contentType: "title" } },
  { id: "sculptors/example-other/a", data: { contentType: "figure" } }
];

test("lists the creator's figures in configured order, followed by other nested figures", () => {
  assert.deepEqual(
    getCreatorFigures(figures, { href: "/figures/sculptors/example/" }).map((entry) => entry.id),
    ["sculptors/example/b/index.md", "sculptors/example/a", "sculptors/example/nested/c"]
  );
});

test("uses an explicitly configured folder without a creator link or figureIds", () => {
  assert.deepEqual(
    getCreatorFigures(figures, { figureFolder: "sculptors/example/nested" }).map((entry) => entry.id),
    ["sculptors/example/nested/c"]
  );
  assert.deepEqual(getCreatorFigures(figures, {}), []);
});
