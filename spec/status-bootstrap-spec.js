const path = require("node:path");
const windowService = require("./helpers/window-service");

describe("line-ending status bootstrap", () => {
  let main, bar, lease;
  const tiles = () =>
    bar.getRightTiles().filter((tile) => tile.getItem().element?.matches(".line-ending-tile"));

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    if (lumine.packages.isPackageLoaded("line-ending"))
      await lumine.packages.unloadPackage("line-ending");
    await lumine.workspace.open({
      getTitle: () => "Preview",
      element: document.createElement("div"),
    });
    main = (await lumine.packages.activatePackage("line-ending")).mainModule;
    const StatusBar =
      lumine.packages.getActivePackage("status-bar").mainModule.statusBar.constructor;
    bar = new StatusBar();
    lease = main.consumeStatusBar(windowService(bar));
  });

  afterEach(async () => {
    lease.dispose();
    await lumine.packages.unloadPackage("line-ending");
    bar.destroy();
  });

  it("keeps absent file UI cold and mounts on the first editor before its async read", async () => {
    const filename = path.join(__dirname, "../lib/status-bar-item.js");
    expect(Object.values(require.cache).some((entry) => entry?.filename === filename)).toBe(false);
    expect(tiles()).toEqual([]);
    const editor = await lumine.workspace.open();
    editor.setText("first\nsecond\n");
    expect(tiles().length).toBe(1);
    expect(Object.values(require.cache).some((entry) => entry?.filename === filename)).toBe(true);
    await conditionPromise(() => tiles()[0].getItem().element.textContent === "LF");
  });

  it("does not mount from an editor event after its waiting lease is revoked", async () => {
    lease.dispose();
    await lumine.workspace.open();
    expect(tiles().length).toBe(0);
  });
});
