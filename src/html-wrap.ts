import { PAGE_MARGIN_PX, VIEWPORT_HEIGHT_PX, VIEWPORT_WIDTH_PX } from "./converter/constants.js";

/** Match validator / benchmark harness: letter page, 1″ margins, Arial 14px body. */
export function wrapHtml(fragment: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: ${PAGE_MARGIN_PX}px;
      width: ${VIEWPORT_WIDTH_PX}px;
      min-height: ${VIEWPORT_HEIGHT_PX}px;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #111;
      background: #fff;
    }
  </style>
</head>
<body>${fragment}</body>
</html>`;
}
