/**
 * Ordered-list numbering guard. Each ordered list must get its own `w:num`
 * so Word and LibreOffice restart at 1. A shared `w:numId` (docx instance 0)
 * makes the next `<ol>` continue 3, 4, … Nested ordered lists and lists split
 * across sections, table cells, and page chrome are separate counters too.
 * Bullets share one instance — they have no counter.
 *
 * Structural only: the bug is fully determined by `document.xml` / `numbering.xml`.
 */
import { unzipSync } from "fflate";
import { convertHtmlToDocx, type ConvertOptions } from "../src/converter.js";
import { writeGuardResult } from "./guard-result.js";

let failures = 0;
let checksRun = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checksRun += 1;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

async function parts(
  html: string,
  options?: ConvertOptions,
): Promise<Record<string, string>> {
  const buf = await convertHtmlToDocx(html, { onWarning: null, ...options });
  const files = unzipSync(new Uint8Array(buf));
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith(".xml")) out[name] = new TextDecoder().decode(data);
  }
  return out;
}

function numIds(xml: string): string[] {
  return [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]!);
}

function concreteNum(numberingXml: string, numId: string): string | undefined {
  return numberingXml.match(new RegExp(`<w:num w:numId="${numId}">[\\s\\S]*?</w:num>`))?.[0];
}

/** Level-0 start override. A fresh instance restarts there; a shared one does not. */
function level0Start(numXml: string | undefined): string | undefined {
  return numXml?.match(/<w:lvlOverride w:ilvl="0"><w:startOverride w:val="(\d+)"\/>/)?.[1];
}

/** Each group of `size` consecutive numIds is one list; groups must be internally shared and mutually distinct. */
function separateLists(ids: string[], size: number, label: string): void {
  check(`${label}: ${ids.length / size} lists × ${size} items`, ids.length % size === 0 && ids.length >= size * 2, ids.join(","));
  const groups: string[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const group = ids.slice(i, i + size);
    const id = group[0] ?? "";
    groups.push(id);
    check(`${label}: list ${groups.length} items share numId ${id}`, group.every((n) => n === id), group.join(","));
  }
  check(
    `${label}: each list has its own numId`,
    new Set(groups).size === groups.length,
    groups.join(","),
  );
}

async function main(): Promise<void> {
  console.log("Sibling ordered lists (issue #13):");
  {
    const xml = await parts(
      "<ol><li>First</li><li>Second</li></ol><p>Next section</p><ol><li>Alpha</li><li>Beta</li></ol>",
    );
    const ids = numIds(xml["word/document.xml"] ?? "");
    separateLists(ids, 2, "sibling ol");
    const numbering = xml["word/numbering.xml"] ?? "";
    const distinct = [...new Set(ids)];
    check("sibling ol: two concrete nums", distinct.length === 2, distinct.join(","));
    for (const id of distinct) {
      check(
        `sibling ol: numId ${id} restarts at 1`,
        level0Start(concreteNum(numbering, id)) === "1",
        concreteNum(numbering, id),
      );
    }
  }

  console.log("\nOne ordered list stays a single instance:");
  {
    const xml = await parts("<ol><li>One</li><li>Two</li><li>Three</li></ol>");
    const ids = numIds(xml["word/document.xml"] ?? "");
    check("single ol: 3 items", ids.length === 3, ids.join(","));
    check("single ol: one numId", new Set(ids).size === 1, ids.join(","));
  }

  console.log("\nNested ordered lists restart, including a second nested list:");
  {
    const xml = await parts(
      "<ol><li>A<ol><li>A1</li><li>A2</li></ol><ol><li>A3</li></ol></li><li>B</li></ol>",
    );
    const ids = numIds(xml["word/document.xml"] ?? "");
    // A, A1, A2, A3, B — parent items share; each nested <ol> is its own instance.
    check("nested: 5 numbered paragraphs", ids.length === 5, ids.join(","));
    check("nested: parent items share a numId", ids[0] === ids[4], ids.join(","));
    check("nested: first nested list is one instance", ids[1] === ids[2] && ids[1] !== ids[0], ids.join(","));
    check("nested: second nested list restarts on its own numId", ids[3] !== ids[1] && ids[3] !== ids[0], ids.join(","));
  }

  console.log("\nOrdered lists in table cells, across sections, and in page chrome:");
  {
    const xml = await parts(
      "<table><tr><td><ol><li>A</li><li>B</li></ol></td><td><ol><li>C</li></ol></td></tr></table>",
    );
    const ids = numIds(xml["word/document.xml"] ?? "");
    check("table cells: 3 items", ids.length === 3, ids.join(","));
    check("table cells: first cell shares a numId", ids[0] === ids[1], ids.join(","));
    check("table cells: second cell restarts", ids[2] !== ids[0], ids.join(","));
  }
  {
    const xml = await parts(
      '<ol><li>First</li><li>Second</li></ol><div style="page:landscape"><p>Middle</p></div><ol><li>Alpha</li><li>Beta</li></ol>',
    );
    const doc = xml["word/document.xml"] ?? "";
    const sections = (doc.match(/<w:sectPr/g) ?? []).length;
    check("sections: landscape split is two-plus sections", sections >= 2, String(sections));
    separateLists(numIds(doc), 2, "across sections");
  }
  {
    const xml = await parts("<ol><li>Body</li></ol>", {
      tocHtml: "<ol><li>Toc</li></ol>",
      headerHtml: "<ol><li>Header</li></ol>",
    });
    const bodyIds = numIds(xml["word/document.xml"] ?? "");
    const headerIds = numIds(xml["word/header1.xml"] ?? "");
    check("chrome: body has two numbered paragraphs (toc + body)", bodyIds.length === 2, bodyIds.join(","));
    check("chrome: toc and body lists differ", bodyIds[0] !== bodyIds[1], bodyIds.join(","));
    check("chrome: header list is present", headerIds.length === 1, headerIds.join(","));
    check(
      "chrome: header does not share the body lists",
      headerIds[0] !== undefined && !bodyIds.includes(headerIds[0]),
      `header ${headerIds.join(",")} body ${bodyIds.join(",")}`,
    );
  }

  console.log("\nFormat follows the numbering reference, not the tag:");
  {
    const xml = await parts(
      '<ul style="list-style-type:decimal"><li>One</li><li>Two</li></ul><p>gap</p><ul style="list-style-type:decimal"><li>Three</li></ul>',
    );
    const ids = numIds(xml["word/document.xml"] ?? "");
    check("decimal ul: 3 items", ids.length === 3, ids.join(","));
    check("decimal ul: first list shares a numId", ids[0] === ids[1], ids.join(","));
    check("decimal ul: second list restarts", ids[2] !== ids[0], ids.join(","));
  }
  {
    const xml = await parts(
      '<ol type="a"><li>A</li></ol><ol type="a"><li>B</li></ol>',
    );
    const ids = numIds(xml["word/document.xml"] ?? "");
    check("type=a: two items", ids.length === 2, ids.join(","));
    check("type=a: each list restarts", ids[0] !== ids[1], ids.join(","));
  }

  console.log("\nBullets share one instance:");
  {
    const xml = await parts("<ul><li>A</li><li>B</li></ul><ul><li>C</li></ul>");
    const ids = numIds(xml["word/document.xml"] ?? "");
    check("bullets: 3 items", ids.length === 3, ids.join(","));
    check("bullets: one shared numId", new Set(ids).size === 1, ids.join(","));
  }
  {
    const xml = await parts(
      '<ol style="list-style-type:disc"><li>A</li></ol><ol style="list-style-type:disc"><li>B</li></ol>',
    );
    const ids = numIds(xml["word/document.xml"] ?? "");
    check("disc ol: 2 items", ids.length === 2, ids.join(","));
    check("disc ol: bullets share a numId", ids[0] === ids[1], ids.join(","));
  }

  console.log("\nItems whose text is in a <p> (loose Markdown lists) keep their marker:");
  {
    const xml = await parts("<ol><li><p>Install</p></li><li><p>Configure</p><p>Then restart.</p></li></ol>");
    const doc = xml["word/document.xml"] ?? "";
    const paras = [...doc.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => m[0]);
    const numbered = (text: string) => paras.some((p) => p.includes(`>${text}<`) && /<w:numId /.test(p));
    check("li > p: first item numbered", numbered("Install"));
    check("li > p: second item numbered", numbered("Configure"));
    check("li > p: second paragraph of an item has no marker", !numbered("Then restart."));
    check("li > p: one list", new Set(numIds(doc)).size === 1, numIds(doc).join(","));
  }

  console.log("\n<ol start> continues the numbering:");
  {
    const xml = await parts('<ol><li>One</li><li>Two</li></ol><p>Note.</p><ol start="3"><li>Three</li></ol><ol type="a" start="2"><li>b</li></ol>');
    const ids = numIds(xml["word/document.xml"] ?? "");
    const numbering = xml["word/numbering.xml"] ?? "";
    check("ol start: 4 numbered items", ids.length === 4, ids.join(","));
    check("ol start: first list starts at 1", level0Start(concreteNum(numbering, ids[0]!)) === "1", concreteNum(numbering, ids[0]!));
    check('ol start="3" starts at 3', level0Start(concreteNum(numbering, ids[2]!)) === "3", concreteNum(numbering, ids[2]!));
    check('ol type="a" start="2" starts at 2', level0Start(concreteNum(numbering, ids[3]!)) === "2", concreteNum(numbering, ids[3]!));
  }

  const ok = failures === 0;
  await writeGuardResult({
    id: "list-numbering",
    label: "Ordered list numbering",
    passed: checksRun - failures,
    total: checksRun,
    ok,
    unit: "structural numId checks",
    command: "npm run guard:list-numbering",
  });
  console.log(ok ? `\nList numbering guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
