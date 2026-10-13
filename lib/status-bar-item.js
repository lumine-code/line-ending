const { Disposable, Emitter } = require("lumine");

module.exports = class StatusBarItem {
  constructor(document = globalThis.document) {
    this.element = document.createElement("status-bar-tile");
    this.element.className = "line-ending-tile";
    this.element.setAttribute("data-context-menu-boundary", "");
    this.emitter = new Emitter();
    this.setLineEndings(new Set());
  }

  setLineEndings(lineEndings) {
    this.lineEndings = lineEndings;
    this.element.textContent = lineEndingName(lineEndings);
    this.element.style.display = lineEndingBlockStyle(lineEndings);
    this.emitter.emit("did-change");
  }

  onDidChange(callback) {
    return this.emitter.on("did-change", callback);
  }

  hasLineEnding(lineEnding) {
    return this.lineEndings.has(lineEnding);
  }

  description() {
    return lineEndingDescription(this.lineEndings);
  }

  onClick(callback) {
    this.element.addEventListener("click", callback);
    return new Disposable(() => this.element.removeEventListener("click", callback));
  }

  destroy() {
    this.emitter.dispose();
    this.element.remove();
  }
};

function lineEndingName(lineEndings) {
  if (lineEndings.size > 1) {
    return "Mixed";
  } else if (lineEndings.has("\n")) {
    return "LF";
  } else if (lineEndings.has("\r\n")) {
    return "CRLF";
  } else {
    return "";
  }
}

function lineEndingDescription(lineEndings) {
  switch (lineEndingName(lineEndings)) {
    case "Mixed":
      return "mixed";
    case "LF":
      return "LF (Unix)";
    case "CRLF":
      return "CRLF (Windows)";
    default:
      return "unknown";
  }
}

function lineEndingBlockStyle(lineEndings) {
  switch (lineEndingName(lineEndings)) {
    case "":
      return "none";
    default:
      return "";
  }
}
