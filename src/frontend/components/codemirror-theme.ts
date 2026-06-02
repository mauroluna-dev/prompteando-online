import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Pγ — CodeMirror 6 theme aligned to prompteando design tokens.
 *
 * All colors map to CSS vars defined in `styles/globals.css`. No
 * hardcoded hex (per conventions §11.1) so theme switches with the
 * rest of the design system if/when we add dark mode.
 */
export const prompteandoEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-background)",
    color: "var(--color-foreground)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    lineHeight: "1.5",
  },
  ".cm-content": {
    caretColor: "var(--color-primary)",
    padding: "16px 0",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-primary)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--color-primary)" },
  ".cm-gutters": {
    backgroundColor: "var(--color-card)",
    color: "var(--color-muted-foreground)",
    border: "none",
    borderRight: "1px solid var(--color-border)",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--color-foreground)",
  },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    { backgroundColor: "color-mix(in oklch, var(--color-primary) 15%, transparent)" },
  ".cm-line": { padding: "0 12px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
});

/**
 * Markdown-specific syntax highlighting using lezer tags.
 * Heading levels get progressively larger; emphasis bold/italic;
 * code spans use a subtle muted bg.
 */
export const prompteandoMarkdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.4em", fontWeight: "600", color: "var(--color-foreground)" },
  { tag: t.heading2, fontSize: "1.25em", fontWeight: "600", color: "var(--color-foreground)" },
  { tag: t.heading3, fontSize: "1.1em", fontWeight: "600", color: "var(--color-foreground)" },
  { tag: t.heading4, fontWeight: "600", color: "var(--color-foreground)" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "var(--color-primary)", textDecoration: "underline" },
  { tag: t.url, color: "var(--color-primary)" },
  { tag: t.monospace, color: "var(--color-foreground)" },
  { tag: t.processingInstruction, color: "var(--color-muted-foreground)" },
  { tag: t.contentSeparator, color: "var(--color-muted-foreground)" },
  { tag: t.list, color: "var(--color-foreground)" },
  { tag: t.quote, color: "var(--color-muted-foreground)", fontStyle: "italic" },
  { tag: t.comment, color: "var(--color-muted-foreground)" },
  { tag: t.invalid, color: "var(--color-destructive)" },
]);

export const prompteandoSyntaxHighlighting = syntaxHighlighting(
  prompteandoMarkdownHighlight,
);
