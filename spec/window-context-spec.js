describe("line-ending presentation contexts", () => {
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    await lumine.packages.activatePackage("line-ending");
  });
  afterEach(async () => {
    await lumine.workspace.discardEditorWindows();
  });
  it("keeps simultaneous pickers beside their invoking editors", async () => {
    const workspace = lumine.workspace;
    const main = workspace.getMainWindow();
    const editor = await workspace.open();
    const extra = await workspace.openEditorWindow({ show: false });
    const copy = editor.copy();
    extra.getEditorContainer().getActivePane().activateItem(copy, { activatePane: true });
    await lumine.commands.dispatch(main.getElement(), "line-ending:show");
    await conditionPromise(() => main.getElement().querySelector(".line-ending"));
    await lumine.commands.dispatch(extra.getElement(), "line-ending:show");
    await conditionPromise(() => extra.getElement().querySelector(".line-ending"));
    expect(main.getElement().querySelector(".line-ending")).not.toBeNull();
    expect(extra.getElement().querySelector(".line-ending").ownerDocument).toBe(
      extra.getDocument(),
    );
  });
});
