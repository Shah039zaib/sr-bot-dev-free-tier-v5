
/*
  Minimal sales flow handler.
  Returns object { text, context }.
  You can replace this with smart LLM logic later.
*/
async function runSalesFlow({ from, text, context }) {
  context = context || {};
  // simple state machine
  if (!context.stage) {
    context.stage = 'greeted';
    return { text: 'Assalamualaikum! Main SR bot hoon. Aapko kya chahiye? (type "order <amount>" to create order)', context };
  }
  // user wants to create order with "order 5000"
  const m = text && text.match(/order\s+(\d+)/i);
  if (m) {
    const amount = parseInt(m[1], 10);
    // Tell user to send 'paid' after payment
    return { text: `Order request received for ${amount} PKR. Aap payment kar ke "paid" type kar dein. Admin verify karega.`, context };
  }
  // fallback echo
  return { text: `Maaf, mujhe samajh nahi aaya. Aap "order <amount>" try karein.`, context };
}

module.exports = { runSalesFlow };
