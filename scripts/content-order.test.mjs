import { test } from "node:test";
import assert from "node:assert/strict";
import { compareContentId, sortContentById } from "../src/lib/content-order.mjs";

test("content IDs have the same order regardless of collection input order", () => {
  const entries = [{ id: "series/010" }, { id: "series/002" }, { id: "series/001" }];
  const expected = ["series/001", "series/002", "series/010"];
  assert.deepEqual(sortContentById(entries).map((entry) => entry.id), expected);
  assert.deepEqual(sortContentById([...entries].reverse()).map((entry) => entry.id), expected);
  assert.deepEqual(entries.map((entry) => entry.id), ["series/010", "series/002", "series/001"]);
  assert.equal(compareContentId({ id: "same" }, { id: "same" }), 0);
});

test("filtering and limiting sorted collections produces the same related figures", () => {
  const entries = [
    { id: "series/004", titleId: "series" },
    { id: "other/001", titleId: "other" },
    { id: "series/002", titleId: "series" },
    { id: "series/001", titleId: "series" },
    { id: "series/003", titleId: "series" }
  ];
  const related = (input) => sortContentById(input)
    .filter((entry) => entry.titleId === "series" && entry.id !== "series/003")
    .slice(0, 3)
    .map((entry) => entry.id);
  assert.deepEqual(related(entries), ["series/001", "series/002", "series/004"]);
  assert.deepEqual(related([...entries].reverse()), related(entries));
});
