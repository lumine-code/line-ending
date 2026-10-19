describe("Line-ending buffer metadata", () => {
  it("updates after edits, undo and redo without searching the document", async () => {
    const main = (await lumine.packages.activatePackage("line-ending")).mainModule;
    const editor = await lumine.workspace.open();
    const buffer = editor.getBuffer();
    spyOn(buffer, "find").and.throwError("Unexpected full-document search");
    editor.setText("first\r\nsecond\r\n");
    expect(await main.getLineEndings(editor)).toEqual(new Set(["\r\n"]));
    buffer.setTextInRange(
      [
        [1, 0],
        [1, 0],
      ],
      "third\n",
      { normalizeLineEndings: false },
    );
    expect(await main.getLineEndings(editor)).toEqual(new Set(["\n", "\r\n"]));
    buffer.undo();
    expect(await main.getLineEndings(editor)).toEqual(new Set(["\r\n"]));
    buffer.redo();
    expect(await main.getLineEndings(editor)).toEqual(new Set(["\n", "\r\n"]));
    editor.setText("no ending\r");
    expect(await main.getLineEndings(editor)).toEqual(new Set());
  });
});
