describe("Line-ending status value", () => {
  it("preserves the DOM and emits only when the value changes", () => {
    const StatusBarItem = require("../lib/status-bar-item");
    const item = new StatusBarItem();
    const changed = jasmine.createSpy("changed");
    item.onDidChange(changed);
    try {
      const endings = new Set(["\r\n"]);
      item.setLineEndings(endings);
      const label = item.element.firstChild;
      for (let i = 0; i < 1000; i++) item.setLineEndings(new Set(["\r\n"]));
      expect(changed.calls.count()).toBe(1);
      expect(item.element.firstChild).toBe(label);
      endings.add("\n");
      item.setLineEndings(endings);
      expect(changed.calls.count()).toBe(2);
      expect(item.element.textContent).toBe("Mixed");
      item.setLineEndings(new Set(["\n", "\r\n"]));
      expect(changed.calls.count()).toBe(2);
      item.setLineEndings(new Set());
      expect(item.element.style.display).toBe("none");
      expect(changed.calls.count()).toBe(3);
    } finally {
      item.destroy();
    }
  });
});
