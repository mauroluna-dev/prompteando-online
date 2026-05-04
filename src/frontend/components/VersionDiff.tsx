import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { MergeView } from "@codemirror/merge";
import { cn } from "@/lib/utils";
import {
  promptstashEditorTheme,
  promptstashSyntaxHighlighting,
} from "./codemirror-theme";

/**
 * P17 — Side-by-side version diff using @codemirror/merge.
 *
 * Read-only on both sides (versions are immutable). Highlights use
 * the diff-add/diff-del semantic tokens via theme rules below.
 *
 * Both panes are recreated whenever any of (`contentA`, `contentB`)
 * changes — MergeView doesn't expose a clean API to replace docs in
 * place, and the merge is cheap enough (<5KB typical) that this is
 * fine.
 */
export function VersionDiff({
  contentA,
  contentB,
  labelA,
  labelB,
  className,
}: {
  contentA: string;
  contentB: string;
  labelA: string;
  labelB: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MergeView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const baseExtensions = [
      lineNumbers(),
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      promptstashEditorTheme,
      promptstashSyntaxHighlighting,
      diffHighlightTheme,
    ];

    const view = new MergeView({
      a: { doc: contentA, extensions: baseExtensions },
      b: { doc: contentB, extensions: baseExtensions },
      parent: containerRef.current,
      orientation: "a-b",
      gutter: true,
      highlightChanges: true,
      collapseUnchanged: { margin: 4, minSize: 6 },
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [contentA, contentB]);

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-md border", className)}>
      <div className="bg-card grid grid-cols-2 border-b text-xs font-medium">
        <div className="border-r px-4 py-2">
          <span className="text-muted-foreground mr-2">A</span>
          <span className="font-mono">{labelA}</span>
        </div>
        <div className="px-4 py-2">
          <span className="text-muted-foreground mr-2">B</span>
          <span className="font-mono">{labelB}</span>
        </div>
      </div>
      <div ref={containerRef} className="bg-background min-h-[400px]" />
    </div>
  );
}

/**
 * Pγ — Diff highlight colors mapped to design tokens. Overrides the
 * default green/red built into @codemirror/merge so the colors line
 * up with the rest of the design system.
 */
const diffHighlightTheme = EditorView.theme({
  ".cm-deletedChunk": {
    backgroundColor: "var(--color-diff-del-bg)",
    color: "var(--color-diff-del-fg)",
  },
  ".cm-insertedChunk, .cm-changedLine": {
    backgroundColor: "var(--color-diff-add-bg)",
    color: "var(--color-diff-add-fg)",
  },
  ".cm-deletedLine": {
    backgroundColor: "var(--color-diff-del-bg)",
    color: "var(--color-diff-del-fg)",
  },
  ".cm-changedText": {
    backgroundColor: "color-mix(in oklch, var(--color-diff-add-bg) 60%, transparent)",
  },
  ".cm-mergeSpacer": {
    backgroundColor: "var(--color-muted)",
  },
});
