import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { NOTE_FONTS, NOTE_SIZES, NOTE_COLOURS, NOTE_HIGHLIGHTS, NOTE_MAX_BYTES } from "../../shared/doc.js";
import "./notepad.css";

const FONT_NAMES = ["Normal", "Serif", "Mono", "Rounded", "Handwriting"];
const COLOUR_NAMES = ["white", "red", "orange", "yellow", "green", "blue", "indigo", "purple", "pink"];
const HIGHLIGHT_NAMES = ["yellow", "green", "blue", "pink", "orange", "white"];
const DEFAULT_SIZE = "18px";
const WIN_KEY = "mfs-notepad-win-v1";
const MIN_W = 320;
const MIN_H = 240;

/* Notepad button: the pencil writes a little line on hover. */
export function NotepadButton({ onClick }) {
  return (
    <button className="tool-btn np-btn" onClick={onClick} aria-label="Open notepad" title="Notepad">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M6 3h9l3 3v15H6z" />
        <path className="np-line" d="M9 10h6M9 13.5h6M9 17h3" />
        <path className="np-pencil" d="M16.5 19.5 21 15l1.5 1.5-4.5 4.5H16.5z" />
      </svg>
    </button>
  );
}

function defaultWin() {
  const w = Math.round(innerWidth * 0.8);
  const h = Math.round(innerHeight * 0.8);
  return { x: Math.round((innerWidth - w) / 2), y: Math.round((innerHeight - h) / 2), w, h, max: false };
}
function loadWin() {
  try {
    const v = JSON.parse(localStorage.getItem(WIN_KEY) || "null");
    if (v && [v.x, v.y, v.w, v.h].every(Number.isFinite)) return fit(v);
  } catch {
    /* ignore */
  }
  return defaultWin();
}
// keep the window on screen and at least the minimum size
function fit(v) {
  const w = Math.max(MIN_W, Math.min(v.w, innerWidth));
  const h = Math.max(MIN_H, Math.min(v.h, innerHeight));
  return { ...v, w, h, x: Math.max(0, Math.min(v.x, innerWidth - w)), y: Math.max(0, Math.min(v.y, innerHeight - h)) };
}

// Pasted text keeps only bold / italic / underline: styles, links, images and headings are dropped.
const stripPaste = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<img[^>]*>/gi, "");

/* The notepad window: black, white text, covers 80% of the screen; move, resize, full size, close. */
export function Notepad({ notes, onNotes, onClose }) {
  const [win, setWinState] = useState(loadWin);
  const [full, setFull] = useState(false);
  const [saved, setSaved] = useState(true);
  const [msg, setMsg] = useState("");
  const [, force] = useState(0);
  const onNotesRef = useRef(onNotes);
  onNotesRef.current = onNotes;
  const lastSent = useRef(null); // the editor content last handed to the app (JSON string)
  const setWin = (v) => {
    const next = fit(v);
    setWinState(next);
    try {
      localStorage.setItem(WIN_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
    ],
    content: notes || "",
    editorProps: { transformPastedHTML: stripPaste, attributes: { "aria-label": "Note", spellcheck: "true" } },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      if (JSON.stringify(json).length > NOTE_MAX_BYTES) {
        ed.commands.undo();
        setMsg("Your note is full. Delete some text to keep writing.");
        return;
      }
      setMsg("");
      lastSent.current = JSON.stringify(json);
      onNotesRef.current(json); // saved in this browser at once, online 2 s later
      setSaved(true);
    },
    onCreate: ({ editor: ed }) => {
      lastSent.current = JSON.stringify(ed.getJSON());
    },
    onSelectionUpdate: () => force((n) => n + 1),
    onTransaction: () => force((n) => n + 1),
  });

  // A newer copy from another device arrived. Show it, even with the cursor in the notepad, unless this editor has
  // text the app has not been given yet (then that text is kept and handed over, so screen and saved copy agree).
  useEffect(() => {
    if (!editor) return;
    const shown = JSON.stringify(editor.getJSON());
    const incoming = notes || { type: "doc", content: [{ type: "paragraph" }] };
    if (shown === JSON.stringify(incoming)) return;
    if (shown === lastSent.current || !editor.isFocused) {
      const { from } = editor.state.selection;
      editor.commands.setContent(incoming, { emitUpdate: false });
      lastSent.current = JSON.stringify(editor.getJSON());
      if (editor.isFocused) editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size));
    } else {
      lastSent.current = shown;
      onNotesRef.current(editor.getJSON());
    }
  }, [notes, editor]);

  useEffect(() => {
    const onResize = () => setWinState((v) => fit(v));
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);

  // drag the title bar to move, the corner to resize
  function drag(e, mode) {
    if (full || e.button !== 0) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ...win };
    const move = (ev) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      setWin(mode === "move" ? { ...start, x: start.x + dx, y: start.y + dy } : { ...start, w: start.w + dx, h: start.h + dy });
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  const style = full ? { left: 0, top: 0, width: "100vw", height: "100vh" } : { left: win.x, top: win.y, width: win.w, height: win.h };
  const ts = editor?.getAttributes("textStyle") || {};
  const hl = editor?.getAttributes("highlight") || {};
  const chain = () => editor.chain().focus();

  return (
    <div className={`np${full ? " np-full" : ""}`} style={style} role="dialog" aria-modal="false" aria-label="Notepad">
      <div className="np-bar" onPointerDown={(e) => !e.target.closest("button") && drag(e, "move")}>
        <b>Notepad</b>
        <span className="np-saved" aria-live="polite">
          {saved ? "Saved" : ""}
        </span>
        <button className="np-icon" onClick={() => setFull((f) => !f)} aria-label={full ? "Normal size" : "Full size"} title={full ? "Normal size" : "Full size"}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
        <button className="np-icon" onClick={onClose} aria-label="Close notepad" title="Close">
          ×
        </button>
      </div>

      {editor && (
        <div className="np-tools" role="toolbar" aria-label="Text style">
          <select aria-label="Font" value={NOTE_FONTS.includes(ts.fontFamily) ? ts.fontFamily : "Archivo"} onChange={(e) => chain().setFontFamily(e.target.value).run()}>
            {NOTE_FONTS.map((f, i) => (
              <option key={f} value={f}>
                {FONT_NAMES[i]}
              </option>
            ))}
          </select>
          <select aria-label="Text size" value={NOTE_SIZES.includes(ts.fontSize) ? ts.fontSize : DEFAULT_SIZE} onChange={(e) => chain().setFontSize(e.target.value).run()}>
            {NOTE_SIZES.map((s) => (
              <option key={s} value={s}>
                {parseInt(s, 10)}
              </option>
            ))}
          </select>
          <span className="np-sep" />
          <button className={`np-fmt${editor.isActive("bold") ? " on" : ""}`} onClick={() => chain().toggleBold().run()} aria-label="Bold" aria-pressed={editor.isActive("bold")}>
            <b>B</b>
          </button>
          <button className={`np-fmt${editor.isActive("italic") ? " on" : ""}`} onClick={() => chain().toggleItalic().run()} aria-label="Italic" aria-pressed={editor.isActive("italic")}>
            <i>I</i>
          </button>
          <button className={`np-fmt${editor.isActive("underline") ? " on" : ""}`} onClick={() => chain().toggleUnderline().run()} aria-label="Underline" aria-pressed={editor.isActive("underline")}>
            <u>U</u>
          </button>
          <span className="np-sep" />
          <span className="np-swatches" aria-label="Text colour">
            {NOTE_COLOURS.map((c, i) => (
              <button
                key={c}
                className={`np-sw${(ts.color || "#ffffff") === c ? " on" : ""}`}
                style={{ background: c }}
                onClick={() => (c === "#ffffff" ? chain().unsetColor().run() : chain().setColor(c).run())}
                aria-label={`Text colour ${COLOUR_NAMES[i]}`}
                title={`Text colour: ${COLOUR_NAMES[i]}`}
              />
            ))}
          </span>
          <span className="np-sep" />
          <span className="np-swatches" aria-label="Highlight">
            <button className={`np-sw np-sw-none${hl.color ? "" : " on"}`} onClick={() => chain().unsetHighlight().run()} aria-label="No highlight" title="No highlight" />
            {NOTE_HIGHLIGHTS.map((c, i) => (
              <button
                key={c}
                className={`np-sw np-sw-hl${hl.color === c ? " on" : ""}`}
                style={{ background: c }}
                onClick={() => chain().setHighlight({ color: c }).run()}
                aria-label={`Highlight ${HIGHLIGHT_NAMES[i]}`}
                title={`Highlight: ${HIGHLIGHT_NAMES[i]}`}
              />
            ))}
          </span>
          <span className="np-sep" />
          <button className="np-fmt" onClick={() => chain().undo().run()} disabled={!editor.can().undo()} aria-label="Undo" title="Undo">
            ↶
          </button>
          <button className="np-fmt" onClick={() => chain().redo().run()} disabled={!editor.can().redo()} aria-label="Redo" title="Redo">
            ↷
          </button>
        </div>
      )}

      {msg && (
        <p className="np-msg" role="alert">
          {msg}
        </p>
      )}
      <EditorContent editor={editor} className="np-editor" />
      {!full && <div className="np-resize" onPointerDown={(e) => drag(e, "resize")} aria-hidden="true" title="Drag to resize" />}
    </div>
  );
}
