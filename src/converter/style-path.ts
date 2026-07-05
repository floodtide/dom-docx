import type { AnyNode, Element } from "domhandler";

/** Stable path for style lookup — must match browser batch resolver. */
export function elementStylePath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.name.toLowerCase() !== "body") {
    const tagName = current.name.toLowerCase();
    const parent = current.parent as Element | null | undefined;
    if (!parent || parent.type !== "tag") break;

    const siblings = (parent.children ?? []).filter(
      (c: AnyNode): c is Element => c.type === "tag" && c.name.toLowerCase() === tagName,
    );
    const index = siblings.indexOf(current);
    parts.unshift(`${tagName}[${index}]`);
    current = parent;
  }

  return parts.join("/");
}

