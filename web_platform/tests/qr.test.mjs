import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, printableQrHtml, qrMatrix, qrSvgPath } from "../src/lib/qr-svg.mjs";

// D-09 / R27: the dashboard QR is a real symbol. Without a camera in the test run, the structure a scanner locks onto is checked:
// the three finder patterns, the timing patterns, the always-dark module and a valid BCH-protected format word.
const URL_TEXT = "https://primora.example/shop/4b6e9f1a-0c52-4d34-9d5f-6c1f2a7e8b90?source=qr";

// ISO/IEC 18004 format information: 5 data bits + 10 BCH bits, XOR 0x5412.
function formatWord(eccBits, mask) {
  let data = (eccBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

describe("qrMatrix (D-09)", () => {
  const { size, dark } = qrMatrix(URL_TEXT);

  it("has a valid symbol size", () => {
    assert.ok(size >= 21 && (size - 17) % 4 === 0, `size ${size}`);
  });

  it("draws three finder patterns (7x7 ring, 3x3 centre) and their separators", () => {
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const ring = x === 0 || y === 0 || x === 6 || y === 6;
          const centre = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          assert.equal(dark(ox + x, oy + y), ring || centre, `finder at ${ox},${oy} module ${x},${y}`);
        }
      }
    }
    for (let i = 0; i < 8; i += 1) {
      assert.equal(dark(7, i), false); assert.equal(dark(i, 7), false);
      assert.equal(dark(size - 8, i), false); assert.equal(dark(size - 8 + i, 7), false);
      assert.equal(dark(7, size - 8 + i), false); assert.equal(dark(i, size - 8), false);
    }
  });

  it("has alternating timing patterns on row 6 and column 6, and the dark module", () => {
    for (let i = 8; i < size - 8; i += 1) {
      assert.equal(dark(i, 6), i % 2 === 0, `timing row at ${i}`);
      assert.equal(dark(6, i), i % 2 === 0, `timing column at ${i}`);
    }
    // version 1 puts the dark module at (8, 4 * version + 9) = (8, size - 8)
    assert.equal(dark(8, size - 8), true);
  });

  it("carries a valid format word (error-correction level M) twice, and the two copies agree", () => {
    // Module placement of ISO/IEC 18004 section 7.9: bit i of the 15-bit format word, least significant first.
    const first = new Array(15).fill(0);
    for (let i = 0; i <= 5; i += 1) first[i] = dark(8, i) ? 1 : 0;
    first[6] = dark(8, 7) ? 1 : 0;
    first[7] = dark(8, 8) ? 1 : 0;
    first[8] = dark(7, 8) ? 1 : 0;
    for (let i = 9; i < 15; i += 1) first[i] = dark(14 - i, 8) ? 1 : 0;
    const second = new Array(15).fill(0);
    for (let i = 0; i < 8; i += 1) second[i] = dark(size - 1 - i, 8) ? 1 : 0;
    for (let i = 8; i < 15; i += 1) second[i] = dark(8, size - 15 + i) ? 1 : 0;
    const read = (list) => list.reduce((acc, bit, i) => acc | (bit << i), 0);
    const value = read(first);
    assert.equal(read(second), value, "both copies of the format information are identical");
    const unmasked = value ^ 0x5412;
    const mask = (unmasked >> 10) & 7;
    assert.equal((unmasked >> 13) & 3, 0, "error-correction level M is 00 in the format word");
    assert.equal(value, formatWord(0, mask), "the ten BCH check bits match the data bits");
  });

  it("is deterministic and depends on the text", () => {
    const again = qrMatrix(URL_TEXT);
    const other = qrMatrix(URL_TEXT + "x");
    let sameAgain = true; let differs = false;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      if (again.dark(x, y) !== dark(x, y)) sameAgain = false;
      if (other.size === size && other.dark(x, y) !== dark(x, y)) differs = true;
    }
    assert.equal(sameAgain, true);
    assert.ok(differs || other.size !== size);
  });
});

describe("qrSvgPath and the printable page (D-09)", () => {
  it("draws exactly the dark modules, inside a four-module quiet zone", () => {
    const { size, dark } = qrMatrix(URL_TEXT);
    const { size: full, d } = qrSvgPath(URL_TEXT);
    assert.equal(full, size + 8);
    let darkModules = 0;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (dark(x, y)) darkModules += 1;
    const drawn = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)].reduce((sum, m) => sum + Number(m[3]), 0);
    assert.equal(drawn, darkModules);
    const first = /^M(\d+) (\d+)/.exec(d);
    assert.ok(Number(first[1]) >= 4 && Number(first[2]) >= 4, "nothing is drawn in the quiet zone");
  });

  it("escapes the business name and never calls a third party", () => {
    const html = printableQrHtml({ title: '<script>alert(1)</script> & "Co"', caption: "Scan <b>to</b> book", url: "https://example.com/shop/1?a=1&b=2", printLabel: "Print", lang: "en" });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;"));
    assert.ok(!/qrserver|https?:\/\/[^"'<\s]*\.(png|jpg)/i.test(html));
    assert.ok(html.includes("<svg") && html.includes("<path"));
  });

  it("escapes every special character", () => {
    assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
    assert.equal(escapeHtml(null), "");
  });
});
