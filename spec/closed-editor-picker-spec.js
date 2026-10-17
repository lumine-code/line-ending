describe("Line Ending visible picker editor ownership", () => {
  let editor, panel, model;
  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("line-ending");
    editor = await lumine.workspace.open();
    editor.setText("first\nsecond\n");
    await lumine.commands.dispatch(lumine.workspace.getElement(), "line-ending:show");
    await conditionPromise(() => lumine.workspace.getModalPanels().some((p) => p.isVisible()));
    panel = lumine.workspace.getModalPanels().find((p) => p.isVisible());
    model = panel.getItem();
  });
  afterEach(async () => {
    if (lumine.packages.isPackageLoaded("line-ending"))
      await lumine.packages.unloadPackage("line-ending");
    editor?.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
  });
  it("dismisses a visible picker when the editor it owns is closed", () => {
    editor.destroy();
    expect(editor.isDestroyed()).toBe(true);
    expect(panel.isVisible()).toBe(false);
  });
  it("still converts the captured living editor after another editor becomes active", async () => {
    const other = await lumine.workspace.open();
    try {
      other.setText("other\n");
      await model.selectIndex(1);
      await model.confirmSelection();
      expect(editor.getText()).toBe("first\r\nsecond\r\n");
      expect(other.getText()).toBe("other\n");
      expect(panel.isVisible()).toBe(false);
    } finally {
      other.destroy();
    }
  });

  it("converts repeatedly without losing the opening file or its active marker", async () => {
    await model.runAction("select-list:toggle-keep-open");
    const other = await lumine.workspace.open();
    try {
      other.setText("other\n");
      for (const [name, ending] of [
        ["CRLF", "\r\n"],
        ["LF", "\n"],
      ]) {
        await model.selectItemById(name);
        await model.confirmSelection();
        expect(editor.getText()).toBe(`first${ending}second${ending}`);
        expect(other.getText()).toBe("other\n");
        expect(panel.isVisible()).toBe(true);
        expect(model.getElement().querySelector("li.active").dataset.lineEnding).toBe(name);
      }
      editor.destroy();
      expect(panel.isVisible()).toBe(false);
    } finally {
      other.destroy();
    }
  });
});
