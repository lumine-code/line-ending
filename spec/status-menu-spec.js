describe("line-ending status action menu", () => {
  let editor;
  const tile = () => lumine.workspace.getElement().querySelector(".line-ending-tile");
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    await lumine.packages.activatePackage("line-ending");
    editor = await lumine.workspace.open();
    editor.setText("first\nsecond\n");
    await conditionPromise(() => tile() && tile().style.display !== "none");
  });
  afterEach(async () => {
    await lumine.workspace.discardEditorWindows();
    await lumine.packages.deactivatePackage("line-ending");
  });

  it("offers the primary mouse action and ignores right button clicks", () => {
    const element = tile();
    expect(element.hasAttribute("data-context-menu-boundary")).toBe(true);
    const commands = lumine.contextMenu.templateForElement(element).map((item) => item.command);
    expect(commands).toContain("line-ending:show");
    const [tooltip] = lumine.tooltips.findTooltips(element);
    expect(tooltip.getTitle()).toContain("Click to");
    expect(tooltip.getTitle()).not.toContain("tooltip-composite");
    const dispatch = spyOn(lumine.commands, "dispatch");
    element.dispatchEvent(new MouseEvent("click", { button: 2, bubbles: true }));
    lumine.contextMenu.templateForElement(element);
    expect(dispatch).not.toHaveBeenCalled();
    element.click();
    expect(dispatch).toHaveBeenCalledOnceWith(element, "line-ending:show");
  });

  it("retires the tile click handler and its menu on deactivation", async () => {
    const element = tile();
    await lumine.packages.deactivatePackage("line-ending");
    const dispatch = spyOn(lumine.commands, "dispatch");
    element.click();
    expect(dispatch).not.toHaveBeenCalled();
    expect(
      lumine.contextMenu.templateForElement(element).map((item) => item.command),
    ).not.toContain("line-ending:show");
  });

  it("converts the file directly from the tile without requiring editor focus", async () => {
    editor.setText("first\r\nsecond\r\n");
    const commands = lumine.contextMenu.templateForElement(tile()).map((item) => item.command);
    expect(commands).toContain("line-ending:convert-to-lf");
    expect(commands).toContain("line-ending:convert-to-crlf");
    await lumine.commands.dispatch(tile(), "line-ending:convert-to-lf");
    expect(editor.getText()).toBe("first\nsecond\n");
    await lumine.commands.dispatch(tile(), "line-ending:convert-to-crlf");
    expect(editor.getText()).toBe("first\r\nsecond\r\n");
  });

  it("converts a window's backing file while leaving its embedded editor alone", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    const cell = lumine.workspace.buildTextEditor();
    cell.setText("Cell\nsource\n");
    const file = lumine.workspace.buildTextEditor();
    file.getLineEndings = () => new Set(["\n"]);
    file.setLineEnding = jasmine.createSpy("setLineEnding");
    const host = extra.getDocument().createElement("div");
    host.canCopy = () => false;
    host.getFileTextEditor = () => file;
    host.getActiveEmbeddedTextEditor = () => cell;
    host.onDidChangeActiveTextEditors = () => ({ dispose() {} });
    host.append(lumine.views.getView(cell));
    extra.getEditorContainer().getActivePane().activateItem(host, { activatePane: true });
    const remoteTile = extra.getElement().querySelector(".line-ending-tile");
    try {
      await lumine.commands.dispatch(remoteTile, "line-ending:convert-to-crlf");
      expect(file.setLineEnding).toHaveBeenCalledOnceWith("\r\n");
      expect(cell.getText()).toBe("Cell\nsource\n");
      expect(editor.getText()).toBe("first\nsecond\n");
    } finally {
      await extra.getEditorContainer().getActivePane().destroyItem(host, true);
      cell.destroy();
      file.destroy();
    }
  });
});
