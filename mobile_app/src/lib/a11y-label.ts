// Reads the words a control shows so a screen reader can announce them when no explicit label is given.
// Duck-typed on React elements ({ props: { children } }) so it needs neither React nor React Native and a node test can run it.
export function textFromNode(node: unknown, depth = 0): string {
  if (node == null || typeof node === "boolean" || depth > 8) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    return node.map((child) => textFromNode(child, depth + 1)).filter(Boolean).join(" ");
  }
  if (typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return textFromNode(props?.children, depth + 1);
  }
  return "";
}
