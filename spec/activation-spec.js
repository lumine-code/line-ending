describe("line-ending bootstrap", () => {
  it("keeps its command registrations in the eager JavaScript facade", () => {
    expect(require("../package.json").engines).toEqual({ lumine: "^1.0.0" });
  });
});
