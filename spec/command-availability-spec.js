describe("Line ending command availability", () => {
  let main, editor;
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("line-ending")).mainModule;
    editor = await lumine.workspace.open();
    editor.setText("one\ntwo\n");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("line-ending");
    editor.destroy();
  });
  it("declines readonly conversion through both registry and the direct helper", async () => {
    editor.setReadOnly(true);
    for (const name of [
      "line-ending:show",
      "line-ending:convert-to-lf",
      "line-ending:convert-to-crlf",
    ])
      expect(lumine.commands.canDispatch(editor.element, name)).toBe(false);
    await lumine.commands.dispatch(editor.element, "line-ending:convert-to-crlf");
    expect(main.setLineEnding(editor, "\r\n")).toBe(false);
    expect(editor.getText()).toBe("one\ntwo\n");
  });
  it("guards a captured picker editor that becomes readonly", async () => {
    const { Selector } = require("../lib/selector");
    const selector = new Selector([{ name: "CRLF", value: "\r\n" }]);
    await selector.show(editor, new Set(["\n"]));
    editor.setReadOnly(true);
    const list = selector.lineEndingList;
    expect(
      lumine.commands.canDispatch(
        list.getElement(),
        "line-ending:use-selected-line-ending",
        list.getActionContext(),
      ),
    ).toBe(false);
    expect(selector.useLineEnding({ name: "CRLF", value: "\r\n" })).toBe(false);
    expect(editor.getText()).toBe("one\ntwo\n");
    selector.dispose();
  });
  it("keeps empty workspaces unavailable without reading or scanning a buffer", () => {
    editor.destroy();
    expect(lumine.commands.canDispatch(lumine.workspace.getElement(), "line-ending:show")).toBe(
      false,
    );
    expect(main.canChangeLineEnding(null)).toBe(false);
  });
});
