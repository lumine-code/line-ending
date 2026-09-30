const { Emitter, TextEditor } = require("lumine");
const path = require("path");

describe("line ending selector", () => {
  let helpers, lineEndingTile, Selector;

  beforeEach(async () => {
    jasmine.useRealClock();

    await lumine.packages.activatePackage("status-bar");

    await lumine.packages.activatePackage("line-ending");
    helpers = require("../lib/helpers");
    ({ Selector } = require("../lib/selector"));

    await timeoutPromise(1);

    const statusBar = lumine.workspace.getFooterPanels()[0].getItem();
    lineEndingTile = statusBar.getRightTiles()[0].getItem();
    expect(lineEndingTile.element.className).toMatch(/line-ending-tile/);
    expect(lineEndingTile.element.textContent).toBe("");
  });

  it("destroys its tile when the status-bar service edge disappears", () => {
    const tile = { destroy: jasmine.createSpy("destroy") };
    const mainModule = lumine.packages.getActivePackage("line-ending").mainModule;
    const registration = mainModule.consumeStatusBar({
      addRightTile() {
        return tile;
      },
    });

    registration.dispose();
    expect(tile.destroy).toHaveBeenCalled();
  });

  describe("Commands", () => {
    let editor, editorElement;

    beforeEach(async () => {
      const e = await lumine.workspace.open(path.join(__dirname, "fixtures", "mixed-endings.md"));
      editor = e;
      editorElement = lumine.views.getView(editor);
      jasmine.attachToDOM(editorElement);
    });

    it("does not register conversion commands on mini editors", () => {
      const miniEditor = lumine.workspace.buildTextEditor({ mini: true });
      const miniElement = lumine.views.getView(miniEditor);

      try {
        const commands = lumine.commands
          .findCommands({ target: miniElement })
          .map((command) => command.name);
        expect(commands).not.toContain("line-ending:convert-to-lf");
        expect(commands).not.toContain("line-ending:convert-to-crlf");
      } finally {
        miniEditor.destroy();
      }
    });

    describe('When "line-ending:convert-to-lf" is run', () => {
      it("converts the file to LF line endings", () => {
        editorElement.focus();
        lumine.commands.dispatch(document.activeElement, "line-ending:convert-to-lf");
        expect(editor.getText()).toBe("Hello\nGoodbye\nMixed\n");
      });
    });

    describe('When "line-ending:convert-to-crlf" is run', () => {
      it("converts the file to CRLF line endings", () => {
        editorElement.focus();
        lumine.commands.dispatch(document.activeElement, "line-ending:convert-to-crlf");
        expect(editor.getText()).toBe("Hello\r\nGoodbye\r\nMixed\r\n");
      });
    });

    it("converts the active file editor when dispatched from an embedded editor", () => {
      const cellText = editor.getText();
      const fileEditor = lumine.workspace.buildTextEditor();
      fileEditor.setLineEnding = jasmine.createSpy("setLineEnding");
      spyOn(lumine.workspace, "getActiveFileTextEditor").and.returnValue(fileEditor);

      lumine.commands.dispatch(editorElement, "line-ending:convert-to-crlf");

      expect(fileEditor.setLineEnding).toHaveBeenCalledWith("\r\n");
      expect(editor.getText()).toBe(cellText);
      fileEditor.destroy();
    });

    it("converts a rich view's file when its dormant editor is targeted in command mode", async () => {
      const pane = lumine.workspace.getCenter().getActivePane();
      const fileEditor = lumine.workspace.buildTextEditor();
      const cellEditor = lumine.workspace.buildTextEditor();
      const cellElement = lumine.views.getView(cellEditor);
      const host = document.createElement("div");
      const cellText = "Cell\r\nsource\r\n";
      cellEditor.setText(cellText);
      fileEditor.setLineEnding = jasmine.createSpy("setLineEnding");
      host.getTitle = () => "Rich file";
      host.getFileTextEditor = () => fileEditor;
      host.getActiveEmbeddedTextEditor = () => null;
      host.onDidChangeActiveTextEditors = () => ({ dispose() {} });
      host.appendChild(cellElement);
      pane.activateItem(host);

      try {
        expect(lumine.workspace.getActiveEmbeddedTextEditor()).toBeUndefined();

        lumine.commands.dispatch(cellElement, "line-ending:convert-to-lf");

        expect(fileEditor.setLineEnding).toHaveBeenCalledWith("\n");
        expect(cellEditor.getText()).toBe(cellText);
      } finally {
        await pane.destroyItem(host, true);
        cellEditor.destroy();
        fileEditor.destroy();
      }
    });

    it("retains the dispatch target when it is not the active embedded editor", () => {
      const activeEditor = lumine.workspace.buildTextEditor();
      activeEditor.setText("Active\n");
      spyOn(lumine.workspace, "getActiveEmbeddedTextEditor").and.returnValue(activeEditor);
      spyOn(lumine.workspace, "getActiveFileTextEditor").and.returnValue(activeEditor);

      lumine.commands.dispatch(editorElement, "line-ending:convert-to-lf");

      expect(editor.getText()).toBe("Hello\nGoodbye\nMixed\n");
      expect(activeEditor.getText()).toBe("Active\n");
      activeEditor.destroy();
    });

    describe('When "line-ending:show" is run', () => {
      async function showSelector() {
        lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "line-ending:show");
        await conditionPromise(() => lumine.workspace.getModalPanels().length > 0);
        const view = lumine.workspace.getModalPanels()[0].getItem();
        await conditionPromise(() => view.getElement().querySelector("li"));
        return view;
      }

      function rowNames(view) {
        return Array.from(view.getElement().querySelectorAll("li"), (li) => li.dataset.lineEnding);
      }

      it("offers Mixed, ticked and last, when the file uses both", async () => {
        const view = await showSelector();

        expect(rowNames(view)).toEqual(["LF", "CRLF", "Mixed"]);
        expect(view.getElement().querySelector("li.active").dataset.lineEnding).toBe("Mixed");
      });

      it("refuses to apply Mixed and says why, without closing", async () => {
        const view = await showSelector();
        const before = editor.getText();

        await view.selectIndex(rowNames(view).indexOf("Mixed"));
        await view.confirmSelection();

        expect(editor.getText()).toBe(before);
        expect(lumine.workspace.getModalPanels()[0].isVisible()).toBe(true);
        expect(view.getStatus().message).toContain("Pick LF or CRLF");
      });

      it("offers only the two real endings when the file agrees with itself, ticking the one it uses", async () => {
        await lumine.workspace.open(path.join(__dirname, "fixtures", "unix-endings.md"));
        const view = await showSelector();

        expect(rowNames(view)).toEqual(["LF", "CRLF"]);
        expect(view.getElement().querySelector("li.active").dataset.lineEnding).toBe("LF");
      });

      it("applies a real ending and closes", async () => {
        const view = await showSelector();

        await view.selectIndex(rowNames(view).indexOf("CRLF"));
        await view.confirmSelection();

        expect(editor.getText()).toBe("Hello\r\nGoodbye\r\nMixed\r\n");
        expect(lumine.workspace.getModalPanels()[0].isVisible()).toBe(false);
      });

      it("applies an asynchronous file protocol to the editor captured on open", async () => {
        const fileEditor = lumine.workspace.buildTextEditor();
        fileEditor.getLineEndings = () => Promise.resolve(new Set(["\n"]));
        fileEditor.setLineEnding = jasmine.createSpy("setLineEnding");
        await lumine.workspace.open(fileEditor);

        const view = await showSelector();
        const otherEditor = await lumine.workspace.open("");
        otherEditor.setLineEnding = jasmine.createSpy("otherSetLineEnding");
        await view.selectIndex(rowNames(view).indexOf("CRLF"));
        await view.confirmSelection();

        expect(fileEditor.setLineEnding).toHaveBeenCalledWith("\r\n");
        expect(otherEditor.setLineEnding).not.toHaveBeenCalled();
      });

      it("forgets its captured editor when cancelled", async () => {
        const selector = new Selector([
          { name: "LF", value: "\n" },
          { name: "CRLF", value: "\r\n" },
        ]);

        try {
          await selector.show(editor, new Set(["\n"]));
          expect(selector.editor).toBe(editor);

          selector.lineEndingListHost.cancel();

          expect(selector.editor).toBeNull();
        } finally {
          selector.dispose();
        }
      });
    });
  });

  describe("Status bar tile", () => {
    describe("when an empty file is opened", () => {
      it("uses CRLF on Windows", async () => {
        await new Promise((done) => {
          spyOn(helpers, "getProcessPlatform").and.returnValue("win32");

          lumine.workspace.open("").then((editor) => {
            const subscription = lineEndingTile.onDidChange(() => {
              subscription.dispose();
              expect(lineEndingTile.element.textContent).toBe("CRLF");
              expect(editor.getBuffer().getPreferredLineEnding()).toBe("\r\n");
              expect(getTooltipText(lineEndingTile.element)).toBe(
                "File uses CRLF (Windows) line endings",
              );
              done();
            });
          });
        });
      });

      it("uses LF on Unix platforms", async () => {
        await new Promise((done) => {
          spyOn(helpers, "getProcessPlatform").and.returnValue("darwin");

          lumine.workspace.open("").then((editor) => {
            const subscription = lineEndingTile.onDidChange(() => {
              subscription.dispose();
              expect(lineEndingTile.element.textContent).toBe("LF");
              expect(editor.getBuffer().getPreferredLineEnding()).toBe("\n");
              expect(getTooltipText(lineEndingTile.element)).toBe(
                "File uses LF (Unix) line endings",
              );

              done();
            });
          });
        });
      });

      describe('when the "defaultLineEnding" setting is set to "LF"', () => {
        beforeEach(() => {
          lumine.config.set("line-ending.defaultLineEnding", "LF");
        });

        it("uses LF line endings, regardless of the platform", async () => {
          await new Promise((done) => {
            spyOn(helpers, "getProcessPlatform").and.returnValue("win32");

            lumine.workspace.open("").then((editor) => {
              lineEndingTile.onDidChange(() => {
                expect(lineEndingTile.element.textContent).toBe("LF");
                expect(editor.getBuffer().getPreferredLineEnding()).toBe("\n");
                done();
              });
            });
          });
        });
      });

      describe('when the "defaultLineEnding" setting is set to "CRLF"', () => {
        beforeEach(() => {
          lumine.config.set("line-ending.defaultLineEnding", "CRLF");
        });

        it("uses CRLF line endings, regardless of the platform", async () => {
          await new Promise((done) => {
            lumine.workspace.open("").then((editor) => {
              lineEndingTile.onDidChange(() => {
                expect(lineEndingTile.element.textContent).toBe("CRLF");
                expect(editor.getBuffer().getPreferredLineEnding()).toBe("\r\n");
                done();
              });
            });
          });
        });
      });
    });

    describe("when a file is opened that contains only CRLF line endings", () => {
      it('displays "CRLF" as the line ending', async () => {
        await new Promise((done) => {
          lumine.workspace.open(path.join(__dirname, "fixtures", "windows-endings.md")).then(() => {
            lineEndingTile.onDidChange(() => {
              expect(lineEndingTile.element.textContent).toBe("CRLF");
              done();
            });
          });
        });
      });
    });

    describe("when a file is opened that contains only LF line endings", () => {
      it('displays "LF" as the line ending', async () => {
        await new Promise((done) => {
          lumine.workspace
            .open(path.join(__dirname, "fixtures", "unix-endings.md"))
            .then((editor) => {
              lineEndingTile.onDidChange(() => {
                expect(lineEndingTile.element.textContent).toBe("LF");
                expect(editor.getBuffer().getPreferredLineEnding()).toBe(null);
                done();
              });
            });
        });
      });
    });

    describe("when a file is opened that contains mixed line endings", () => {
      it('displays "Mixed" as the line ending', async () => {
        await new Promise((done) => {
          lumine.workspace.open(path.join(__dirname, "fixtures", "mixed-endings.md")).then(() => {
            lineEndingTile.onDidChange(() => {
              expect(lineEndingTile.element.textContent).toBe("Mixed");
              done();
            });
          });
        });
      });
    });

    describe("clicking the tile", () => {
      let lineEndingModal, lineEndingSelector;

      // The picker reads the buffer's line endings before it opens — that is
      // what decides the tick and whether there is a "Mixed" row — so the
      // panel arrives a turn after the click rather than during it.
      async function clickTile() {
        lineEndingTile.element.dispatchEvent(new MouseEvent("click", {}));
        await conditionPromise(() => lumine.workspace.getModalPanels().length > 0);
        lineEndingModal = lumine.workspace.getModalPanels()[0];
        lineEndingSelector = lineEndingModal.getItem();
        await conditionPromise(() => lineEndingSelector.getElement().querySelector("li"));
      }

      beforeEach(async () => {
        jasmine.attachToDOM(lumine.views.getView(lumine.workspace));

        await new Promise((done) =>
          lumine.workspace
            .open(path.join(__dirname, "fixtures", "unix-endings.md"))
            .then(() => lineEndingTile.onDidChange(done)),
        );
      });

      describe("when the text editor has focus", () => {
        it("opens the line ending selector modal for the text editor", async () => {
          lumine.workspace.getCenter().activate();
          const item = lumine.workspace.getActivePaneItem();
          expect(item.getFileName && item.getFileName()).toBe("unix-endings.md");

          await clickTile();

          expect(lineEndingModal.isVisible()).toBe(true);
          expect(lineEndingSelector.getElement().contains(document.activeElement)).toBe(true);
          let listItems = lineEndingSelector.getElement().querySelectorAll("li");
          expect(listItems[0].textContent).toBe("LF");
          expect(listItems[1].textContent).toBe("CRLF");
        });
      });

      describe("when the text editor does not have focus", () => {
        it("opens the line ending selector modal for the active text editor", async () => {
          lumine.workspace.getLeftDock().activate();
          const item = lumine.workspace.getActivePaneItem();
          expect(item instanceof TextEditor).toBe(false);

          await clickTile();

          expect(lineEndingModal.isVisible()).toBe(true);
          expect(lineEndingSelector.getElement().contains(document.activeElement)).toBe(true);
          let listItems = lineEndingSelector.getElement().querySelectorAll("li");
          expect(listItems[0].textContent).toBe("LF");
          expect(listItems[1].textContent).toBe("CRLF");
        });
      });

      describe("when selecting a different line ending for the file", () => {
        it("changes the line endings in the buffer", async () => {
          await clickTile();

          const lineEndingChangedPromise = new Promise((resolve) => {
            lineEndingTile.onDidChange(() => {
              expect(lineEndingTile.element.textContent).toBe("CRLF");
              const editor = lumine.workspace.getActiveTextEditor();
              expect(editor.getText()).toBe("Hello\r\nGoodbye\r\nUnix\r\n");
              expect(editor.getBuffer().getPreferredLineEnding()).toBe("\r\n");
              resolve();
            });
          });

          lineEndingSelector.getQueryEditor().setText("CR");
          await lineEndingSelector.confirmSelection();
          expect(lineEndingModal.isVisible()).toBe(false);

          await lineEndingChangedPromise;
        });
      });

      describe("when modal is exited", () => {
        it("leaves the tile selection as-is", async () => {
          await clickTile();

          lineEndingModal.hide();
          expect(lineEndingTile.element.textContent).toBe("LF");
        });
      });
    });

    describe("closing the last text editor", () => {
      it("displays no line ending in the status bar", async () => {
        await lumine.workspace.open(path.join(__dirname, "fixtures", "unix-endings.md"));
        lumine.workspace.getActivePane().destroy();
        expect(lineEndingTile.element.textContent).toBe("");
      });
    });

    describe("when the buffer's line endings change", () => {
      let editor;

      beforeEach(async () => {
        await new Promise((done) => {
          lumine.workspace.open(path.join(__dirname, "fixtures", "unix-endings.md")).then((e) => {
            editor = e;
            lineEndingTile.onDidChange(done);
          });
        });
      });

      it("updates the line ending text in the tile", async () => {
        let tileText = lineEndingTile.element.textContent;
        let tileUpdateCount = 0;
        Object.defineProperty(lineEndingTile.element, "textContent", {
          get() {
            return tileText;
          },

          set(text) {
            tileUpdateCount++;
            tileText = text;
          },
        });

        expect(lineEndingTile.element.textContent).toBe("LF");
        expect(getTooltipText(lineEndingTile.element)).toBe("File uses LF (Unix) line endings");

        await new Promise((done) => {
          editor.setTextInBufferRange(
            [
              [0, 0],
              [0, 0],
            ],
            "... ",
          );
          editor.setTextInBufferRange(
            [
              [0, Infinity],
              [1, 0],
            ],
            "\r\n",
            {
              normalizeLineEndings: false,
            },
          );
          lineEndingTile.onDidChange(done);
        });

        expect(tileUpdateCount).toBe(1);
        expect(lineEndingTile.element.textContent).toBe("Mixed");
        expect(getTooltipText(lineEndingTile.element)).toBe("File uses mixed line endings");

        await new Promise((done) => {
          lumine.commands.dispatch(editor.getElement(), "line-ending:convert-to-crlf");
          lineEndingTile.onDidChange(done);
        });

        expect(tileUpdateCount).toBe(2);
        expect(lineEndingTile.element.textContent).toBe("CRLF");
        expect(getTooltipText(lineEndingTile.element)).toBe(
          "File uses CRLF (Windows) line endings",
        );

        await new Promise((done) => {
          lumine.commands.dispatch(editor.getElement(), "line-ending:convert-to-lf");
          lineEndingTile.onDidChange(done);
        });

        expect(tileUpdateCount).toBe(3);
        expect(lineEndingTile.element.textContent).toBe("LF");

        editor.setTextInBufferRange(
          [
            [0, 0],
            [0, 0],
          ],
          "\n",
        );

        await timeoutPromise(100);

        expect(tileUpdateCount).toBe(3);
      });

      it("rescans when the removed text starts with a line ending", async () => {
        const mixedEditor = await lumine.workspace.open(
          path.join(__dirname, "fixtures", "mixed-endings.md"),
        );
        await conditionPromise(() => lineEndingTile.element.textContent === "Mixed");

        mixedEditor.setTextInBufferRange(
          [
            [2, Infinity],
            [3, 0],
          ],
          "\r\n",
          { normalizeLineEndings: false },
        );
        await conditionPromise(() => lineEndingTile.element.textContent === "CRLF");

        expect(mixedEditor.getText()).toBe("Hello\r\nGoodbye\r\nMixed\r\n");
      });
    });

    describe("when the file editor owns its line-ending protocol", () => {
      it("uses its async value and dedicated change event instead of its buffer", async () => {
        const emitter = new Emitter();
        const fileEditor = lumine.workspace.buildTextEditor();
        let lineEndings = new Set(["\n"]);
        fileEditor.getLineEndings = jasmine
          .createSpy("getLineEndings")
          .and.callFake(() => Promise.resolve(lineEndings));
        fileEditor.onDidChangeLineEndings = jasmine
          .createSpy("onDidChangeLineEndings")
          .and.callFake((callback) => emitter.on("did-change", callback));

        await lumine.workspace.open(fileEditor);
        await conditionPromise(() => lineEndingTile.element.textContent === "LF");

        expect(fileEditor.getLineEndings).toHaveBeenCalled();
        expect(fileEditor.onDidChangeLineEndings).toHaveBeenCalled();

        lineEndings = new Set(["\r\n"]);
        emitter.emit("did-change", lineEndings);
        await conditionPromise(() => lineEndingTile.element.textContent === "CRLF");

        expect(fileEditor.getBuffer().getText()).toBe("");
        emitter.dispose();
      });

      it("ignores an older asynchronous value that resolves after a newer one", async () => {
        const emitter = new Emitter();
        const requests = [];
        const fileEditor = lumine.workspace.buildTextEditor();
        fileEditor.getLineEndings = () =>
          new Promise((resolve) => {
            requests.push(resolve);
          });
        fileEditor.onDidChangeLineEndings = (callback) => emitter.on("did-change", callback);

        await lumine.workspace.open(fileEditor);
        await conditionPromise(() => requests.length === 1);

        emitter.emit("did-change");
        await conditionPromise(() => requests.length === 2);
        requests[1](new Set(["\r\n"]));
        await conditionPromise(() => lineEndingTile.element.textContent === "CRLF");

        requests[0](new Set(["\n"]));
        await timeoutPromise(20);

        expect(lineEndingTile.element.textContent).toBe("CRLF");
        emitter.dispose();
      });
    });
  });
});

function getTooltipText(element) {
  const [tooltip] = lumine.tooltips.findTooltips(element);
  return tooltip.getTitle();
}
