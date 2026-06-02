import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, keymap, drawSelection, highlightActiveLineGutter } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { cn } from "@/lib/utils";
import {
  prompteandoEditorTheme,
  prompteandoSyntaxHighlighting,
} from "./codemirror-theme";

/**
 * Pγ + P17 — Markdown editor wrapping CodeMirror 6.
 *
 * Headless editor with markdown lang, soft-wrap, line numbers, undo
 * history, and a theme mapped to design tokens. Replaces the legacy
 * <textarea> in the prompt detail page.
 *
 * Controlled component: `value` is the source of truth; mutations
 * dispatched externally update the editor's doc, and edits inside
 * the editor fire `onChange`.
 */
export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  className,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Compartment for runtime-toggleable readOnly. CodeMirror facets
  // can't be reconfigured directly — Compartment is the official
  // wrapper for this.
  const readOnlyCompartmentRef = useRef<Compartment>(new Compartment());
  // Keep the latest onChange in a ref so we don't re-create the view
  // every time the parent re-renders with a fresh handler closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount once.
  useEffect(() => {
    if (!containerRef.current) return;
    const readOnlyCompartment = readOnlyCompartmentRef.current;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        prompteandoEditorTheme,
        prompteandoSyntaxHighlighting,
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });
    viewRef.current = view;

    if (autoFocus) view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount-only effect. `value` and `readOnly` updates are handled
    // by the dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external `value` changes into the editor doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  // Sync readOnly toggles via the compartment.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "bg-background overflow-hidden rounded-md border",
        className,
      )}
      data-placeholder={placeholder}
    />
  );
}
