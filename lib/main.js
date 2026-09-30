const _ = require("@lumine-code/underscore-plus");
const { CompositeDisposable, Disposable } = require("lumine");
const { Selector } = require("./selector");
const StatusBarItem = require("./status-bar-item");
const helpers = require("./helpers");

const LineEndingRegExp = /\r\n|\n/g;

// the following regular expression is executed natively via the `substring` package,
// where `\A` corresponds to the beginning of the string.
// More info: https://github.com/atom/line-ending-selector/pull/56
// eslint-disable-next-line no-useless-escape
const LFRegExp = /(\A|[^\r])\n/g;
const CRLFRegExp = /\r\n/g;

let disposables = null;

function activate() {
  disposables = new CompositeDisposable();
  let selectorDisposable;
  let selector;

  disposables.add(
    // On the workspace: the picker acts on the active item's file editor —
    // the line ending is a property of the file, so inside a notebook it
    // describes the backing .ipynb — and the status tile dispatches it
    // without an editor element holding focus.
    lumine.commands.add("lumine-workspace", {
      "line-ending:show": async () => {
        const editor = lumine.workspace.getActiveFileTextEditor();
        if (!editor) return;
        // Initiating Selector object - called only once when `line-ending:show` is called
        if (!selectorDisposable) {
          // make a Selector object
          selector = new Selector([
            { name: "LF", value: "\n" },
            { name: "CRLF", value: "\r\n" },
          ]);
          // Add disposable for selector
          selectorDisposable = new Disposable(() => selector.dispose());
          disposables.add(selectorDisposable);
        }

        // Capture the file editor before waiting: a modal selection must still
        // apply to the file it was opened for if another tab becomes active.
        await selector.show(editor, await getLineEndings(editor));
      },
    }),
    // The commands remain unavailable in mini editors, but resolve file
    // identity through the workspace. A notebook cell is the dispatch target,
    // while its backing .ipynb editor is the file to convert.
    lumine.commands.add("lumine-text-editor:not([mini])", {
      "line-ending:convert-to-lf": {
        description: "Rewrite every line ending in this file as a bare LF.",
        didDispatch: (event) => setLineEnding(fileEditorForEvent(event), "\n"),
      },

      "line-ending:convert-to-crlf": {
        description: "Rewrite every line ending in this file as CR then LF.",
        didDispatch: (event) => setLineEnding(fileEditorForEvent(event), "\r\n"),
      },
    }),
  );
}

function deactivate() {
  disposables.dispose();
}

function consumeStatusBar(statusBar) {
  const serviceDisposables = new CompositeDisposable();
  disposables.add(serviceDisposables);
  let statusBarItem = new StatusBarItem();
  let currentEditorDisposable = null;
  let tooltipDisposable = null;
  let updateGeneration = 0;

  const updateTile = _.debounce((editor, generation) => {
    getLineEndings(editor).then((lineEndings) => {
      if (generation !== updateGeneration) return;
      if (lumine.workspace.getActiveFileTextEditor() !== editor) return;
      if (lineEndings.size === 0 && !hasLineEndingProtocol(editor)) {
        let defaultLineEnding = getDefaultLineEnding();
        const buffer = editor.getBuffer();
        buffer.setPreferredLineEnding(defaultLineEnding);
        lineEndings = new Set().add(defaultLineEnding);
      }
      statusBarItem.setLineEndings(lineEndings);
    });
  }, 0);
  const scheduleTileUpdate = (editor) => updateTile(editor, ++updateGeneration);

  serviceDisposables.add(
    // The file resolution: inside a notebook the tile describes the backing
    // .ipynb, not a cell fragment.
    lumine.workspace.observeActiveFileTextEditor((editor) => {
      if (currentEditorDisposable) currentEditorDisposable.dispose();

      if (editor && (hasLineEndingProtocol(editor) || editor.getBuffer)) {
        scheduleTileUpdate(editor);
        if (typeof editor.onDidChangeLineEndings === "function") {
          currentEditorDisposable = editor.onDidChangeLineEndings(() => scheduleTileUpdate(editor));
        } else {
          const buffer = editor.getBuffer();
          currentEditorDisposable = buffer.onDidChange(({ oldText, newText }) => {
            if (!statusBarItem.hasLineEnding("\n")) {
              if (newText.indexOf("\n") >= 0) {
                scheduleTileUpdate(editor);
              }
            } else if (!statusBarItem.hasLineEnding("\r\n")) {
              if (newText.indexOf("\r\n") >= 0) {
                scheduleTileUpdate(editor);
              }
            } else if (oldText.indexOf("\n") >= 0) {
              scheduleTileUpdate(editor);
            }
          });
        }
      } else {
        updateGeneration++;
        statusBarItem.setLineEndings(new Set());
        currentEditorDisposable = null;
      }

      if (tooltipDisposable) {
        serviceDisposables.remove(tooltipDisposable);
        tooltipDisposable.dispose();
      }
      tooltipDisposable = lumine.tooltips.add(statusBarItem.element, {
        title() {
          return `File uses ${statusBarItem.description()} line endings`;
        },
      });
      serviceDisposables.add(tooltipDisposable);
    }),
  );

  serviceDisposables.add(
    new Disposable(() => {
      updateGeneration++;
      updateTile.cancel();
      if (currentEditorDisposable) currentEditorDisposable.dispose();
    }),
  );

  serviceDisposables.add(
    statusBarItem.onClick(() => {
      if (!lumine.workspace.getActiveFileTextEditor()) return;
      // At the workspace: a notebook's backing editor lives outside the DOM, so
      // its element can never carry a workspace-scoped dispatch.
      lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "line-ending:show");
    }),
    new Disposable(() => statusBarItem.destroy()),
  );

  // File-identity band, see packages/status-bar/README.md.
  let tile = statusBar.addRightTile({ item: statusBarItem, priority: 430 });
  serviceDisposables.add(new Disposable(() => tile.destroy()));
  return serviceDisposables;
}

function getDefaultLineEnding() {
  switch (lumine.config.get("line-ending.defaultLineEnding")) {
    case "LF":
      return "\n";
    case "CRLF":
      return "\r\n";
    case "OS Default":
    default:
      return helpers.getProcessPlatform() === "win32" ? "\r\n" : "\n";
  }
}

function hasLineEndingProtocol(item) {
  return typeof item?.getLineEndings === "function";
}

function fileEditorForEvent(event) {
  const target = event?.target;
  const targetEditor = lumine.workspace.getTextEditorForElement(event?.target, {
    includeMini: false,
  });
  if (!targetEditor) return lumine.workspace.getActiveFileTextEditor();

  const activeItem = lumine.workspace.getCenter().getActivePaneItem();
  if (typeof activeItem?.getFileTextEditor === "function") {
    const activeItemElement = lumine.views.getView(activeItem);
    if (
      target === activeItemElement ||
      (target?.nodeType && activeItemElement?.contains?.(target))
    ) {
      // In a rich view's command mode the cell remains in the DOM, but the
      // embedded-editor protocol intentionally reports no active editor. Its
      // commands must still describe the file rather than mutating that
      // dormant fragment.
      return activeItem.getFileTextEditor() || null;
    }
  }

  // A rich view exposes its currently edited fragment separately from the
  // editor that owns the file. Plain text editors resolve as both, while an
  // editor in another pane must retain the command's element-local meaning.
  if (targetEditor === lumine.workspace.getActiveEmbeddedTextEditor()) {
    return lumine.workspace.getActiveFileTextEditor() || targetEditor;
  }
  return targetEditor;
}

async function getLineEndings(item) {
  if (hasLineEndingProtocol(item)) {
    const lineEndings = await item.getLineEndings();
    return lineEndings instanceof Set ? new Set(lineEndings) : new Set(lineEndings || []);
  }

  const buffer = item?.getBuffer?.() || item;
  if (!buffer) return new Set();
  if (typeof buffer.find === "function") {
    const [hasLF, hasCRLF] = await Promise.all([buffer.find(LFRegExp), buffer.find(CRLFRegExp)]);
    const result = new Set();
    if (hasLF) result.add("\n");
    if (hasCRLF) result.add("\r\n");
    return result;
  } else {
    const result = new Set();
    for (let i = 0; i < buffer.getLineCount() - 1; i++) {
      result.add(buffer.lineEndingForRow(i));
    }
    return result;
  }
}

function setLineEnding(item, lineEnding) {
  if (typeof item?.setLineEnding === "function") {
    return item.setLineEnding(lineEnding);
  }
  if (item?.getBuffer) {
    let buffer = item.getBuffer();
    buffer.setPreferredLineEnding(lineEnding);
    buffer.setText(buffer.getText().replace(LineEndingRegExp, lineEnding));
  }
}

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "line-ending",
      tips: [
        "{% if keys['line-ending:show'] %}You can switch the current file between LF and CRLF with {{ 'line-ending:show' | keystroke }}{% else %}The status bar shows whether the current file uses LF or CRLF, and clicking it converts the file.{% endif %}",
      ],
    };
  },
  activate,
  deactivate,
  consumeStatusBar,
  setLineEnding,
  getLineEndings,
};
