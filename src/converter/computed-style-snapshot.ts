export interface ComputedStyleSnapshot {
  path: string;
  styles: Record<string, string>;
}

const ELEMENT_NODE = 1;

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

/**
 * Batch-read `getComputedStyle` for every element under `document.body` children.
 * Browser-native primitive — no Playwright, no server round-trip.
 */
export function snapshotComputedStylesFromDocument(
  doc: Document = document,
): ComputedStyleSnapshot[] {
  const elementStylePath = (el: Element): string => {
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current.tagName !== "BODY") {
      const tagName = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter(
        (c: Element) => c.tagName.toLowerCase() === tagName,
      );
      const index = siblings.indexOf(current);
      parts.unshift(`${tagName}[${index}]`);
      current = parent;
    }
    return parts.join("/");
  };

  const props = [
    "color",
    "backgroundColor",
    "display",
    "flexDirection",
    "gap",
    "columnGap",
    "rowGap",
    "textAlign",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "height",
    "width",
    "maxWidth",
    "borderTopWidth",
    "borderTopColor",
    "borderRightWidth",
    "borderRightColor",
    "borderBottomWidth",
    "borderBottomColor",
    "borderLeftWidth",
    "borderLeftColor",
  ] as const;

  const results: ComputedStyleSnapshot[] = [];

  const walk = (el: Element): void => {
    const cs = doc.defaultView?.getComputedStyle(el);
    if (!cs) return;
    const styles: Record<string, string> = {};
    for (const prop of props) {
      styles[prop] = cs[prop as keyof CSSStyleDeclaration] as string;
    }
    results.push({ path: elementStylePath(el), styles });
    for (const child of el.children) {
      if (isElement(child)) walk(child);
    }
  };

  for (const child of doc.body.children) {
    if (isElement(child)) walk(child);
  }
  return results;
}
