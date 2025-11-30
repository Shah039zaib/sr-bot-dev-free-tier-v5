/*
  Placeholder AI service.
  Replace with OpenAI / local LLM integration.
*/
async function summarizeContext(ctx) {
  return 'Summary: ' + (ctx.stage || 'none');
}
module.exports = { summarizeContext };
