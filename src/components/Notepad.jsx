import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Extension } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { ColourMenu } from "./ColourMenu.jsx";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { NOTE_FONTS, NOTE_SIZES, NOTE_COLOURS, NOTE_HIGHLIGHTS, NOTE_MAX_BYTES, NOTE_MAX_CHARS } from "../../shared/doc.js";
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
  // only these keys are kept (older versions also saved the mouse start point here, which made the next drag jump)
  return { w, h, x: Math.max(0, Math.min(v.x, innerWidth - w)), y: Math.max(0, Math.min(v.y, innerHeight - h)), max: !!v.max };
}

// Pasted text keeps only bold / italic / underline: styles, links, images and headings are dropped.
const stripPaste = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<img[^>]*>/gi, "");

// Refuses any typing or paste that would take the note past 50,000 letters; nothing already written changes.
// Deleting, and copies arriving from another device (marked "remote"), always go through.
const LetterLimit = Extension.create({
  name: "letterLimit",
  addOptions: () => ({ onRefused: () => {} }),
  addProseMirrorPlugins() {
    const { onRefused } = this.options;
    return [
      new Plugin({
        filterTransaction(tr, state) {
          if (!tr.docChanged || tr.getMeta("remote")) return true;
          const len = tr.doc.textContent.length;
          if (len <= NOTE_MAX_CHARS || len <= state.doc.textContent.length) return true;
          queueMicrotask(onRefused);
          return false;
        },
      }),
    ];
  },
});

const MENU_W = 300; // colour menu size (see notepad.css .cm)
const MENU_H = 450;

/* Rainbow swatch: opens the colour menu. Shows the chosen colour in its middle when it is not one of the swatches. */
function Rainbow({ kind, current, palette, open, onOpen }) {
  const custom = current && !palette.includes(current) ? current : null;
  const name = kind === "color" ? "Text colour" : "Highlight";
  return (
    <button
      className={`np-sw np-sw-rainbow${kind === "highlight" ? " np-sw-hl" : ""}${custom ? " on" : ""}`}
      style={custom ? { "--c": custom } : undefined}
      onClick={(e) => onOpen(kind, e.currentTarget)}
      aria-label={`${name}: more colours`}
      aria-expanded={open}
      title="More colours"
    />
  );
}

/* A labelled group of tools in the notepad toolbar: the small label sits above the tools. */
const Group = ({ label, children }) => (
  <span className="np-group">
    <span className="np-lbl" aria-hidden="true">
      {label}
    </span>
    <span className="np-group-tools">{children}</span>
  </span>
);

/* The notepad window: black, white text, covers 80% of the screen; move, resize, full size, close. */
export function Notepad({ notes, onNotes, onClose }) {
  const [win, setWinState] = useState(loadWin);
  const [full, setFull] = useState(false);
  const [saved, setSaved] = useState(true);
  const [menu, setMenu] = useState(null); // open colour menu: { kind: "color" | "highlight", pos }
  const closeMenu = useCallback(() => setMenu(null), []);
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
      LetterLimit.configure({ onRefused: () => setMsg(`Your note can have up to ${NOTE_MAX_CHARS.toLocaleString("en-GB")} letters. Delete some to keep writing.`) }),
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

  // drag the title bar to move; drag any edge or corner to resize ("n", "se", "w", ... = which sides move)
  function drag(e, mode) {
    if (full || e.button !== 0) return;
    e.preventDefault();
    const start = { ...win, px: e.clientX, py: e.clientY };
    const move = (ev) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      if (mode === "move") return setWin({ ...win, x: start.x + dx, y: start.y + dy });
      let { x, y, w, h } = start;
      if (mode.includes("e")) w = Math.min(start.w + dx, innerWidth - start.x);
      if (mode.includes("s")) h = Math.min(start.h + dy, innerHeight - start.y);
      // left / top edges: the opposite side stays put, so stop at the minimum size and at the screen edge
      if (mode.includes("w")) {
        const nx = Math.max(0, Math.min(start.x + dx, start.x + start.w - MIN_W));
        w = start.w + start.x - nx;
        x = nx;
      }
      if (mode.includes("n")) {
        const ny = Math.max(0, Math.min(start.y + dy, start.y + start.h - MIN_H));
        h = start.h + start.y - ny;
        y = ny;
      }
      setWin({ ...win, x, y, w, h });
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
  const letters = editor ? editor.state.doc.textContent.length : 0;

  // the colour menu opens under its rainbow button (above it when there is no room), always on screen
  const openMenu = (kind, btn) => {
    if (menu?.kind === kind) return setMenu(null);
    const r = btn.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left - 140, innerWidth - MENU_W - 8));
    const y = r.bottom + 8 + MENU_H > innerHeight ? Math.max(8, r.top - MENU_H - 8) : r.bottom + 8;
    setMenu({ kind, pos: { x, y } });
  };

  return (
    <div className={`np${full ? " np-full" : ""}`} style={style} role="dialog" aria-modal="false" aria-label="Notepad">
      <div className="np-bar" onPointerDown={(e) => !e.target.closest("button") && drag(e, "move")}>
        <b>Notepad</b>
        <span className="np-saved" aria-live="polite">
          {saved ? "Saved" : ""}
        </span>
        {editor && (
          <span className={`np-count${letters > NOTE_MAX_CHARS * 0.9 ? " near" : ""}`} title="Letters used">
            {letters.toLocaleString("en-GB")} / {NOTE_MAX_CHARS.toLocaleString("en-GB")}
          </span>
        )}
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
          <Group label="Font">
            <select aria-label="Font" value={NOTE_FONTS.includes(ts.fontFamily) ? ts.fontFamily : "Archivo"} onChange={(e) => chain().setFontFamily(e.target.value).run()}>
              {NOTE_FONTS.map((f, i) => (
                <option key={f} value={f}>
                  {FONT_NAMES[i]}
                </option>
              ))}
            </select>
          </Group>
          <Group label="Size">
            <select aria-label="Text size" value={NOTE_SIZES.includes(ts.fontSize) ? ts.fontSize : DEFAULT_SIZE} onChange={(e) => chain().setFontSize(e.target.value).run()}>
              {NOTE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {parseInt(s, 10)}
                </option>
              ))}
            </select>
          </Group>
          <span className="np-sep" />
          <Group label="Style">
            <button className={`np-fmt${editor.isActive("bold") ? " on" : ""}`} onClick={() => chain().toggleBold().run()} aria-label="Bold" title="Bold" aria-pressed={editor.isActive("bold")}>
              <b>B</b>
            </button>
            <button className={`np-fmt${editor.isActive("italic") ? " on" : ""}`} onClick={() => chain().toggleItalic().run()} aria-label="Italic" title="Italic" aria-pressed={editor.isActive("italic")}>
              <i>I</i>
            </button>
            <button className={`np-fmt${editor.isActive("underline") ? " on" : ""}`} onClick={() => chain().toggleUnderline().run()} aria-label="Underline" title="Underline" aria-pressed={editor.isActive("underline")}>
              <u>U</u>
            </button>
          </Group>
          <span className="np-sep" />
          <Group label="Text colour">
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
            <Rainbow kind="color" current={ts.color} palette={NOTE_COLOURS} open={menu?.kind === "color"} onOpen={openMenu} />
          </span>
          </Group>
          <span className="np-sep" />
          <Group label="Highlight">
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
            <Rainbow kind="highlight" current={hl.color} palette={NOTE_HIGHLIGHTS} open={menu?.kind === "highlight"} onOpen={openMenu} />
          </span>
          </Group>
          <span className="np-sep" />
          <Group label="Undo / Redo">
            <button className="np-fmt" onClick={() => chain().undo().run()} disabled={!editor.can().undo()} aria-label="Undo" title="Undo">
              ↶
            </button>
            <button className="np-fmt" onClick={() => chain().redo().run()} disabled={!editor.can().redo()} aria-label="Redo" title="Redo">
              ↷
            </button>
          </Group>
        </div>
      )}

      {msg && (
        <p className="np-msg" role="alert">
          {msg}
        </p>
      )}
      <EditorContent editor={editor} className="np-editor" />
      {menu &&
        editor &&
        createPortal(
        <ColourMenu
          key={menu.kind}
          title={menu.kind === "color" ? "Text colour" : "Highlight colour"}
          start={menu.kind === "color" ? ts.color || "#ffffff" : hl.color || "#ffd84c"}
          pos={menu.pos}
          onClose={closeMenu}
          onPick={(c) => {
            if (menu.kind === "color") chain().setColor(c).run();
            else chain().setHighlight({ color: c }).run();
            closeMenu();
          }}
        />,
          document.body
        )}
      {!full && <div className="np-resize" onPointerDown={(e) => drag(e, "se")} aria-hidden="true" title="Drag to resize" />}
      {!full &&
        ["n", "s", "e", "w", "ne", "nw", "sw"].map((d) => (
          <div key={d} className={`np-edge np-edge-${d}`} onPointerDown={(e) => drag(e, d)} aria-hidden="true" />
        ))}
    </div>
  );
}
