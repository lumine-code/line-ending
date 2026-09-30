# line-ending

Show and change the line ending used by the current editor.

## Features

- **Line ending indicator**: displays the current line ending (`CRLF`, `LF`, or `Mixed`) in the status bar.
- **Quick switching**: pick a new line ending from a modal in the status bar.
- **Marks what the file is**: ticks the current line ending, and lists `Mixed` as a read-only row when the file uses both.
- **Conversion commands**: convert the active file to `LF` or `CRLF`.
- **Default line ending**: choose the line ending applied to newly created files.
- **Format-aware files**: richer file views can report and convert the serialized file's line endings instead of an embedded editor's buffer.

## Installation

To install `line-ending` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/line-ending`.

## Commands

Commands available in `lumine-text-editor`:

- `line-ending:show`: open the line ending picker,
- `line-ending:convert-to-lf`: convert the file to `LF` line endings,
- `line-ending:convert-to-crlf`: convert the file to `CRLF` line endings.

## Services

- `status-bar`: consumed to show the current line ending in the status bar.

File editors may implement `getLineEndings()` (returning a `Set` or `Promise<Set>`), `setLineEnding(lineEnding)`, and `onDidChangeLineEndings(callback)`. The selector prefers that protocol and otherwise reads and rewrites the editor's buffer.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
