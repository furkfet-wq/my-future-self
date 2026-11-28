import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { STICKY_COLOURS, MAX_STICKIES, STICKY_MAX_CHARS } from "../../shared/doc.js";
import { letterLimit } from "../lib/letterLimit.js";
import "./sticky.css";

// Sticky notes, like Windows Sticky Notes: little papers you put anywhere on the page. They stay where you
// leave them (page position, so they scroll with the page) and are saved with the account.
// Kept: new note (+), 7 colours and delete (⋯), close (×), bold / italic / underline / strikethrough / bullets,
// drag by the top bar, resize from the corner. Left out: notes list, images, search, sign-in sync screens.

const COLOUR_NAMES = { yellow: "Yellow", green: "Green", pink: "Pink", purple: "Purple", blue: "Blue", gray: "Grey", charcoal: "Charcoal" };
const W = 300;
const H = 300;
const MIN_W = 200;
const MIN_H = 150;
const SAVE_TEXT_MS = 600; // text is handed to the app 0.6 s after the last key (the app then saves online 2 s later)
const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pageWidth = () => Math.max(document.documentElement.scrollWidth, innerWidth);
const stripPaste = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<img[^>]*>/gi, "");

/* Round button on the Today card: makes a new sticky note. */
export function StickyButton({ onClick, disabled }) {
  return (
    <button
      className="tool-btn stk-btn"
      onClick={onClick}
      disabled={disabled}
      aria-label="New sticky note"
      title={disabled ? `You have ${MAX_STICKIES} sticky notes (the most)` : "Sticky note"}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4.5 4.5h15v10l-5 5h-10z" />
        <path className="stk-fold" d="M19.5 14.5h-5v5" />
        <path d="M8 9h8M8 12.5h5" />
      </svg>
    </button>
  );
}

// A new note in the middle of what you can see now (or just below/right of the note it was made from).
export function newSticky(from) {
  const x = from ? from.x + 32 : window.scrollX + innerWidth / 2 - W / 2 + Math.round(Math.random() * 60 - 30);
  const y = from ? from.y + 32 : window.scrollY + Math.max(80, innerHeight / 2 - H / 2) + Math.round(Math.random() * 40 - 20);
  return { id: newId(), x: Math.max(0, Math.min(x, pageWidth() - W)), y: Math.max(0, y), w: W, h: H, color: from?.color || "yellow", doc: { type: "doc", content: [{ type: "paragraph" }] } };
}

function Icon({ d, size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function StickyNote({ note, z, fresh, onFront, onChange, onAdd, onDelete }) {
  const [box, setBox] = useState(null); // position/size while dragging or resizing (saved when you let go)
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState("");
  const [, force] = useState(0);
  const timer = useRef(null);
  const lastSent = useRef(JSON.stringify(note.doc));
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        orderedList: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
      letterLimit(STICKY_MAX_CHARS, () => setMsg(`A note can have up to ${STICKY_MAX_CHARS.toLocaleString("en-GB")} letters.`)),
    ],
    content: note.doc,
    autofocus: fresh ? "end" : false,
    editorProps: { transformPastedHTML: stripPaste, attributes: { "aria-label": "Sticky note text", spellcheck: "true" } },
    onUpdate: ({ editor: ed }) => {
      setMsg("");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const doc = ed.getJSON();
        lastSent.current = JSON.stringify(doc);
        changeRef.current({ doc });
      }, SAVE_TEXT_MS);
    },
    onTransaction: () => force((n) => n + 1),
  });

  // hand over typing still waiting when the note goes away
  useEffect(
    () => () => {
      if (timer.current && editor && !editor.isDestroyed) {
        clearTimeout(timer.current);
        changeRef.current({ doc: editor.getJSON() });
      }
    },
    [editor]
  );

  // a newer copy from another device: show it unless you are typing in this note right now
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const incoming = JSON.stringify(note.doc);
    if (incoming !== lastSent.current && incoming !== JSON.stringify(editor.getJSON())) {
      editor.commands.setContent(note.doc, { emitUpdate: false });
      lastSent.current = incoming;
    }
  }, [note.doc, editor]);

  // drag the top bar to move, the corner to resize; saved once, when you let go
  function drag(e, mode) {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    onFront();
    const start = { px: e.pageX, py: e.pageY, x: note.x, y: note.y, w: note.w, h: note.h };
    let cur = start;
    const move = (ev) => {
      const dx = ev.pageX - start.px;
      const dy = ev.pageY - start.py;
      cur =
        mode === "move"
          ? { ...start, x: Math.max(0, Math.min(start.x + dx, pageWidth() - start.w)), y: Math.max(0, start.y + dy) }
          : { ...start, w: Math.max(MIN_W, Math.min(900, start.w + dx)), h: Math.max(MIN_H, Math.min(900, start.h + dy)) };
      setBox(cur);
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setBox(null);
      if (cur !== start) onChange({ x: cur.x, y: cur.y, w: cur.w, h: cur.h });
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  const b = box || note;
  const empty = !editor || editor.isEmpty;
  const close = () => (empty ? onDelete() : (setMenu(true), setAsking(true)));
  const fmt = (name, label, d, run) => (
    <button className={`stk-fmt${editor?.isActive(name) ? " on" : ""}`} onClick={() => run(editor.chain().focus()).run()} aria-label={label} title={label} aria-pressed={!!editor?.isActive(name)}>
      {d}
    </button>
  );

  return (
    <div
      className={`stk stk-${note.color}${box ? " moving" : ""}`}
      style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: z }}
      onPointerDownCapture={onFront}
      role="note"
      aria-label="Sticky note"
    >
      <div className="stk-bar" onPointerDown={(e) => drag(e, "move")}>
        <button className="stk-icon" onClick={onAdd} aria-label="New note" title="New note">
          <Icon d="M12 5v14M5 12h14" />
        </button>
        <span className="stk-grip" aria-hidden="true" />
        <button className={`stk-icon${menu ? " on" : ""}`} onClick={() => (setMenu((m) => !m), setAsking(false))} aria-label="Menu" title="Menu" aria-expanded={menu}>
          <Icon d="M6 12h.01M12 12h.01M18 12h.01" />
        </button>
        <button className="stk-icon" onClick={close} aria-label="Close note" title="Close">
          <Icon d="M6 6l12 12M18 6 6 18" />
        </button>
      </div>

      {menu && (
        <div className="stk-menu">
          {asking ? (
            <div className="stk-ask">
              <b>Delete this note?</b>
              <div>
                <button className="stk-del" onClick={onDelete}>
                  Delete
                </button>
                <button onClick={() => (setAsking(false), setMenu(false))}>Keep</button>
              </div>
            </div>
          ) : (
            <>
              <div className="stk-colours" role="group" aria-label="Note colour">
                {STICKY_COLOURS.map((c) => (
                  <button
                    key={c}
                    className={`stk-swatch stk-${c}${note.color === c ? " on" : ""}`}
                    onClick={() => (onChange({ color: c }), setMenu(false))}
                    aria-label={COLOUR_NAMES[c]}
                    title={COLOUR_NAMES[c]}
                  />
                ))}
              </div>
              <button className="stk-menu-item" onClick={() => setAsking(true)}>
                <Icon d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9.5 7V4.5h5V7" />
                Delete note
              </button>
            </>
          )}
        </div>
      )}

      <EditorContent editor={editor} className="stk-text" />
      {msg && <p className="stk-msg">{msg}</p>}

      {editor && (
        <div className="stk-tools" role="toolbar" aria-label="Text style">
          {fmt("bold", "Bold", <b>B</b>, (c) => c.toggleBold())}
          {fmt("italic", "Italic", <i>I</i>, (c) => c.toggleItalic())}
          {fmt("underline", "Underline", <u>U</u>, (c) => c.toggleUnderline())}
          {fmt("strike", "Strikethrough", <s>ab</s>, (c) => c.toggleStrike())}
          {fmt("bulletList", "Bullet list", <Icon d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />, (c) => c.toggleBulletList())}
        </div>
      )}
      <div className="stk-resize" onPointerDown={(e) => drag(e, "resize")} aria-hidden="true" />
    </div>
  );
}

/* All the notes, placed on the page. `notes` comes from the saved data; `onNotes` saves a new list. */
export function StickyNotes({ notes, onNotes, freshId }) {
  const [order, setOrder] = useState([]); // ids, last = in front (this browser only, never saved)
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const front = (id) => setOrder((o) => (o.at(-1) === id ? o : [...o.filter((x) => x !== id), id]));
  const update = (id, patch) => onNotes(notesRef.current.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const remove = (id) => onNotes(notesRef.current.filter((n) => n.id !== id));
  const add = (from) => {
    if (notesRef.current.length >= MAX_STICKIES) return;
    const n = newSticky(from);
    onNotes([...notesRef.current, n], n.id);
    front(n.id);
  };
  return createPortal(
    <div className="stk-layer">
      {notes.map((n, i) => (
        <StickyNote
          key={n.id}
          note={n}
          z={order.includes(n.id) ? 40 + order.indexOf(n.id) : 1 + i} // inside the layer: clicked notes come to the front
          fresh={n.id === freshId}
          onFront={() => front(n.id)}
          onChange={(patch) => update(n.id, patch)}
          onAdd={() => add(n)}
          onDelete={() => remove(n.id)}
        />
      ))}
    </div>,
    document.body
  );
}
