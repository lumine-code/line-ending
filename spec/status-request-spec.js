const { Emitter } = require("lumine");
describe("Line Ending status request ownership", () => {
  let main, editor, bar, emitter, release, reject, reads, leases;
  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openPath", "openExternal", "openApplication", "showItemInFolder"])
      spyOn(lumine.shell, method).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    main = (await lumine.packages.activatePackage("line-ending")).mainModule;
    bar = lumine.workspace
      .getFooterPanels()
      .find((panel) => typeof panel.getItem()?.getRightTiles === "function")
      .getItem();
    emitter = new Emitter();
    leases = [];
    reads = 0;
    editor = lumine.workspace.buildTextEditor();
    editor.getLineEndings = () => {
      reads++;
      return new Promise((done, fail) => {
        release = done;
        reject = fail;
      });
    };
    editor.onDidChangeLineEndings = (callback) => emitter.on("change", callback);
    await lumine.workspace.open(editor);
    await conditionPromise(() => reads > 0, "the actual debounced file protocol read");
  });
  afterEach(async () => {
    release?.(new Set(["\n"]));
    for (const lease of leases) lease.dispose();
    await lumine.packages.deactivatePackage("line-ending");
    editor.destroy();
    emitter.dispose();
  });
  const tiles = () =>
    bar
      .getRightTiles()
      .filter((tile) => tile.getItem().element?.classList.contains("line-ending-tile"));

  it("observes and ignores a rejected old file read after the package is retired", async () => {
    await lumine.packages.deactivatePackage("line-ending");
    const error = new Error("Owned obsolete line endings");
    const errors = [];
    const observe = (event) => {
      if (event.reason === error) {
        errors.push(event.reason);
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", observe, true);
    try {
      reject(error);
      await new Promise((done) => setTimeout(done, 30));
      expect(errors).toEqual([]);
      expect(tiles().length).toBe(0);
    } finally {
      window.removeEventListener("unhandledrejection", observe, true);
    }
  });

  it("destroys an actual tile returned after its addRightTile factory retires the consumer", () => {
    const create = bar.addRightTile.bind(bar);
    let late;
    spyOn(bar, "addRightTile").and.callFake((options) => {
      late = create(options);
      main.deactivate();
      return late;
    });
    leases.push(main.consumeStatusBar(bar));
    expect(late).toBeDefined();
    expect(tiles().length).toBe(0);
    expect(lumine.workspace.getFooterPanels().some((panel) => panel.getItem() === bar)).toBe(true);
    // Retire the original leaked fixture tile before the next test.
    late.destroy();
  });

  it("publishes a current protocol answer and keeps exported read rejection semantics", async () => {
    release(new Set(["\n"]));
    await conditionPromise(
      () => tiles().some((tile) => tile.getItem().element.textContent === "LF"),
      "the live native status tile",
    );
    const error = new Error("Owned public protocol rejection");
    editor.getLineEndings = () => Promise.reject(error);
    await expectAsync(main.getLineEndings(editor)).toBeRejectedWith(error);
  });

  it("handles a current failed status read while retaining a diagnostic", async () => {
    const error = new Error("Owned current line endings");
    const errors = [];
    const observe = (event) => {
      if (event.reason === error) {
        errors.push(event.reason);
        event.preventDefault();
      }
    };
    spyOn(console, "warn");
    window.addEventListener("unhandledrejection", observe, true);
    try {
      reject(error);
      await new Promise((done) => setTimeout(done, 30));
      expect(errors).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith("line-ending: failed to read line endings", error);
    } finally {
      window.removeEventListener("unhandledrejection", observe, true);
    }
  });
});
