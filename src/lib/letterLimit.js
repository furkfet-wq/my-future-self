// A TipTap extension that refuses any typing or paste that would take the text past `max` letters.
// Nothing already written changes, and deleting always goes through.
import { Extension } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";

export const letterLimit = (max, onRefused = () => {}) =>
  Extension.create({
    name: "letterLimit",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          filterTransaction(tr, state) {
            if (!tr.docChanged) return true;
            const len = tr.doc.textContent.length;
            if (len <= max || len <= state.doc.textContent.length) return true;
            queueMicrotask(onRefused);
            return false;
          },
        }),
      ];
    },
  });
