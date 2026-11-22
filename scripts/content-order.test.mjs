import { test } from "node:test";
import assert from "node:assert/strict";
import { compareContentId, selectRecentFigures, sortContentById } from "../src/lib/content-order.mjs";

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

test("recent titles replace their figures and backfill the remaining slots", () => {
  const entries = [
    { id: "series/001/index.md", data: { contentType: "figure", titleId: "series", date: new Date("2026-11-23") } },
    { id: "series/002/index.md", data: { contentType: "figure", titleId: "series", date: new Date("2026-11-22") } },
    { id: "series/index.md", data: { contentType: "title", date: new Date("2026-11-22") } },
    { id: "other/001", data: { contentType: "figure", date: new Date("2026-11-21") } },
    { id: "undated", data: { contentType: "figure" } }
  ];
  assert.deepEqual(selectRecentFigures(entries, 3).map((entry) => entry.id), ["series/index.md", "other/001"]);
});

test("recent figures remain when their title is outside the results or has no date", () => {
  const entries = [
    { id: "series/001", data: { contentType: "figure", titleId: "series/index", date: new Date("2026-11-23") } },
    { id: "undated/001", data: { contentType: "figure", titleId: "undated", date: new Date("2026-11-22") } },
    { id: "series/index", data: { contentType: "title", date: new Date("2026-11-21") } },
    { id: "undated/index", data: { contentType: "title" } }
  ];
  assert.deepEqual(selectRecentFigures(entries, 2).map((entry) => entry.id), ["series/001", "undated/001"]);
});

test("backfilled titles also replace figures already selected", () => {
  const entries = [
    { id: "first/001", data: { contentType: "figure", titleId: "first", date: new Date("2026-11-25") } },
    { id: "second/001", data: { contentType: "figure", titleId: "second", date: new Date("2026-11-24") } },
    { id: "first/index", data: { contentType: "title", date: new Date("2026-11-23") } },
    { id: "second/index", data: { contentType: "title", date: new Date("2026-11-22") } },
    { id: "other/001", data: { contentType: "figure", date: new Date("2026-11-21") } }
  ];
  assert.deepEqual(selectRecentFigures(entries, 3).map((entry) => entry.id), ["first/index", "second/index", "other/001"]);
});
