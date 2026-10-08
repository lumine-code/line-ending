describe("line-ending pending picker ownership", () => {
  let Selector, editor, selector;

  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };

  beforeEach(async () => {
    await lumine.packages.activatePackage("line-ending");
    ({ Selector } = require("../lib/selector"));
    editor = await lumine.workspace.open();
    selector = new Selector([
      { name: "LF", value: "\n" },
      { name: "CRLF", value: "\r\n" },
    ]);
  });

  afterEach(() => selector.dispose());

  it("consumes an obsolete rejected lookup handed to an already disposed selector", async () => {
    let consumed = false;
    // A rejection-capable thenable records whether anyone consumes the input
    // without letting the intentionally broken baseline report a global error.
    const lookup = {
      then(_resolve, reject) {
        consumed = true;
        reject(new Error("retired lookup"));
      },
    };
    selector.dispose();
    const version = selector.showVersion;
    const show = spyOn(selector.lineEndingListHost, "show").and.callThrough();
    await selector.show(editor, lookup);
    await Promise.resolve();

    expect(consumed).toBe(true);
    expect(selector.editor).toBeNull();
    expect(selector.showVersion).toBe(version);
    expect(show).not.toHaveBeenCalled();
  });

  it("preserves a failed lookup belonging to the live request", async () => {
    const error = new Error("current lookup failed");
    const show = spyOn(selector.lineEndingListHost, "show").and.callThrough();
    const lookup = {
      then(_resolve, reject) {
        reject(error);
      },
    };
    const result = await selector.show(editor, lookup).then(
      () => null,
      (failure) => failure,
    );

    expect(result).toBe(error);
    expect(show).not.toHaveBeenCalled();
  });

  it("settles a pending model update after disposal without calling its destroyed host", async () => {
    const update = deferred();
    spyOn(selector.lineEndingList, "update").and.returnValue(update.promise);
    const show = spyOn(selector.lineEndingListHost, "show").and.callThrough();
    const result = selector.show(editor, new Set(["\n"])).then(
      () => null,
      (error) => error,
    );
    await Promise.resolve();
    selector.dispose();
    await selector.lineEndingListHost.destroy();
    update.resolve();

    expect(await result).toBe(null);
    expect(show).not.toHaveBeenCalled();
  });

  it("keeps the newer picker when an older model update finishes last", async () => {
    const update = deferred();
    const originalUpdate = selector.lineEndingList.update.bind(selector.lineEndingList);
    spyOn(selector.lineEndingList, "update").and.returnValues(update.promise, originalUpdate({}));
    const show = spyOn(selector.lineEndingListHost, "show").and.callThrough();
    const first = selector.show(editor, new Set(["\n", "\r\n"]));
    await conditionPromise(() => selector.lineEndingList.update.calls.count() === 1);
    await selector.show(editor, new Set(["\n"]));
    update.resolve();
    await first;

    expect(show.calls.count()).toBe(1);
    expect(selector.currentName).toBe("LF");
  });

  it("does not reopen a picker cancelled during its model update", async () => {
    const update = deferred();
    spyOn(selector.lineEndingList, "update").and.returnValue(update.promise);
    const show = spyOn(selector.lineEndingListHost, "show").and.callThrough();
    const pending = selector.show(editor, new Set(["\n"]));
    await Promise.resolve();
    selector.lineEndingListHost.cancel();
    update.resolve();
    await pending;

    expect(show).not.toHaveBeenCalled();
    expect(selector.editor).toBeNull();
  });

  it("ignores a file lookup that finishes after its captured editor is destroyed", async () => {
    const endings = deferred();
    const result = selector.show(editor, endings.promise).then(
      () => null,
      (error) => error,
    );
    const show = spyOn(selector.lineEndingListHost, "show").and.callThrough();
    editor.destroy();
    endings.resolve(new Set(["\n"]));

    expect(await result).toBe(null);
    expect(show).not.toHaveBeenCalled();
  });

  it("keeps the latest command target when an older file lookup finishes last", async () => {
    const endings = deferred();
    editor.getLineEndings = () => endings.promise;
    editor.setLineEnding = jasmine.createSpy("old target");
    const workspace = lumine.views.getView(lumine.workspace);
    const first = lumine.commands.dispatch(workspace, "line-ending:show");
    const newer = await lumine.workspace.open();
    newer.getLineEndings = () => Promise.resolve(new Set(["\r\n"]));
    newer.setLineEnding = jasmine.createSpy("new target");
    await lumine.commands.dispatch(workspace, "line-ending:show");
    endings.resolve(new Set(["\n"]));
    await first;
    const model = lumine.workspace.getModalPanels()[0].getItem();
    await model.selectIndex(0);
    await model.confirmSelection();

    expect(newer.setLineEnding).toHaveBeenCalledWith("\n");
    expect(editor.setLineEnding).not.toHaveBeenCalled();
  });

  it("preserves a captured file through an active-tab change while its lookup is pending", async () => {
    const endings = deferred();
    editor.getLineEndings = () => endings.promise;
    editor.setLineEnding = jasmine.createSpy("captured target");
    const pending = lumine.commands.dispatch(
      lumine.views.getView(lumine.workspace),
      "line-ending:show",
    );
    const other = await lumine.workspace.open();
    other.setLineEnding = jasmine.createSpy("active other target");
    endings.resolve(new Set(["\n"]));
    await pending;
    const model = lumine.workspace.getModalPanels()[0].getItem();
    await model.selectIndex(1);
    await model.confirmSelection();

    expect(editor.setLineEnding).toHaveBeenCalledWith("\r\n");
    expect(other.setLineEnding).not.toHaveBeenCalled();
  });

  it("settles a file lookup after package deactivation without publishing a modal", async () => {
    const endings = deferred();
    editor.getLineEndings = () => endings.promise;
    const pending = lumine.commands
      .dispatch(lumine.views.getView(lumine.workspace), "line-ending:show")
      .then(
        () => null,
        (error) => error,
      );
    await lumine.packages.deactivatePackage("line-ending");
    endings.resolve(new Set(["\n"]));

    expect(await pending).toBe(null);
    expect(lumine.workspace.getModalPanels().length).toBe(0);
  });
});
