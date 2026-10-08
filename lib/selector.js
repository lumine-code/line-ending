// What a file whose lines do not agree is. It is a state, not a setting: there
// is no line ending to convert to called "Mixed", so the row is shown only
// when it is the answer, carries the tick, and refuses to be picked.
const MIXED_ITEM = Object.freeze({ name: "Mixed", value: null });

class Selector {
  lineEndingList;

  // Make a selector object (should be called once)
  constructor(selectorItems) {
    this.baseItems = selectorItems;
    this.currentName = null;
    this.showVersion = 0;
    this.disposed = false;

    this.lineEndingListHost = lumine.workspace.addSelectList(
      {
        itemsClassList: ["mark-active"],
        items: selectorItems,
        getItemId: (lineEnding) => lineEnding.name,
        search: { getFilterText: (lineEnding) => lineEnding.name },
        renderItem: (lineEnding, { highlight }) => {
          return {
            className: [
              lineEnding.name === this.currentName && "active",
              isReadOnly(lineEnding) && "text-subtle",
            ].filter(Boolean),
            primary: highlight(lineEnding.name),
            didRender: (element) => {
              element.dataset.lineEnding = lineEnding.name;
            },
          };
        },
        commands: {
          "line-ending:use-selected-line-ending": {
            description: "Convert the current file to the selected line ending.",
            didDispatch: (event) => this.useLineEnding(event.detail.item),
          },
          "line-ending:explain-mixed-line-endings": {
            description: "Explain why mixed line endings cannot be selected.",
            didDispatch: () =>
              this.lineEndingList.setStatus({
                type: "info",
                message: "Mixed is what the file is. Pick LF or CRLF to convert it.",
                duration: 4000,
              }),
          },
        },
        actions: [
          {
            command: "line-ending:use-selected-line-ending",
            context: "item",
            when: ({ item }) => !isReadOnly(item),
            primary: true,
            disposition: "close",
          },
          {
            command: "line-ending:explain-mixed-line-endings",
            context: "item",
            when: ({ item }) => isReadOnly(item),
            primary: true,
            disposition: "stay",
          },
        ],
      },
      { className: "line-ending", crumb: "Line Endings" },
    );
    this.lineEndingList = this.lineEndingListHost.getModel();
    this.cancelSubscription = this.lineEndingListHost.onDidCancel(() => {
      this.showVersion++;
      this.editor = null;
    });
  }

  useLineEnding(lineEnding) {
    // The file editor captured when the picker opened: for a notebook this is
    // the backing .ipynb editor, even if another tab is active by now.
    const editor = this.editor;
    this.showVersion++;
    this.editor = null;
    if (editor) {
      // Required here rather than at the top: main.js requires this module,
      // so a load-time require would see a half-built exports object.
      require("./main").setLineEnding(editor, lineEnding.value);
    }
  }

  // Show a selector object. `lineEndings` is the set the file actually uses,
  // which decides the tick and whether the "Mixed" row exists at all.
  async show(editor, lineEndings = new Set()) {
    if (this.disposed) return;
    const version = ++this.showVersion;
    this.editor = editor;
    try {
      const endings = await lineEndings;
      if (!this.isCurrentShow(version, editor)) return;
      this.currentName = currentName(endings);
      await this.lineEndingList.update({
        // Last: LF and CRLF are what Enter should land on, and "Mixed" is a
        // footnote about the file rather than a third choice.
        items:
          this.currentName === MIXED_ITEM.name ? [...this.baseItems, MIXED_ITEM] : this.baseItems,
        status: null,
      });
    } catch (error) {
      if (!this.isCurrentShow(version, editor)) return;
      throw error;
    }
    if (!this.isCurrentShow(version, editor)) return;
    this.lineEndingListHost.show();
  }

  isCurrentShow(version, editor) {
    return (
      !this.disposed &&
      this.showVersion === version &&
      this.editor === editor &&
      !editor?.isDestroyed?.() &&
      !this.lineEndingListHost.isDestroyed()
    );
  }

  // Dispose selector
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.showVersion++;
    this.editor = null;
    this.cancelSubscription.dispose();
    this.lineEndingListHost.destroy();
  }
}

// A row with no line ending to apply cannot be chosen.
function isReadOnly(lineEnding) {
  return lineEnding.value == null;
}

// The same three answers the status bar tile gives, from the same input.
function currentName(lineEndings) {
  if (lineEndings.size > 1) return MIXED_ITEM.name;
  if (lineEndings.has("\n")) return "LF";
  if (lineEndings.has("\r\n")) return "CRLF";
  return null;
}

module.exports = { Selector };
