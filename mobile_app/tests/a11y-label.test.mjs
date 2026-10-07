import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { textFromNode } from "../src/lib/a11y-label.ts";

const el = (children) => ({ props: { children } });

describe("accessible label from visible text", () => {
  it("reads strings, numbers and nested elements in order", () => {
    assert.equal(textFromNode(el(["Book", " ", el("now")])), "Book now");
    assert.equal(textFromNode(el([el("Total"), 120])), "Total 120");
  });
  it("ignores empty, boolean and null children", () => {
    assert.equal(textFromNode(el([null, false, undefined, "  ", el(null)])), "");
  });
  it("gives an icon-only control no derived label so it must be named explicitly", () => {
    assert.equal(textFromNode(el(el(undefined))), "");
  });
  it("does not loop forever on a self-referencing tree", () => {
    const a = { props: {} };
    a.props.children = a;
    assert.equal(textFromNode(a), "");
  });
});
