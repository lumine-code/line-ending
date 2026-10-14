// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: [],
  viewport: { width: 1100, height: 720 },
  async before() {},
  async prepare(context) {
    const { state, open } = context;
    state.editor = await open("signal.js");
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Choose the line ending format.",
      timeout: 60000,
      async run(context) {
        const { lumine, state } = context;
        {
          lumine.commands.dispatch(lumine.views.getView(state.editor), "line-ending:show");
        }
      },
      ready(context) {
        const { lumine } = context;
        return Boolean(lumine.workspace.getModalPanels().some((panel) => panel.isVisible()));
      },
    },
  ],
  async cleanup() {},
};
