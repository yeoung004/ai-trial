import type { FoldedItem } from "@muse-code/sdk";
export function finalText(items: Iterable<FoldedItem>) {
  return (
    [...items]
      .filter(
        (item) =>
          item.kind === "agentMessage" &&
          item.status === "completed" &&
          !item.cutOff,
      )
      .map((item) => item.text ?? "")
      .at(-1) ?? ""
  );
}
export function parseJSON(text: string): unknown {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}
