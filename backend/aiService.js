const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://inference.samaira.ai/openai'
});

// === SYSTEM PROMPT 3: Refund Operating Procedure ===
const refundSupportPrompt = `
You are a helpful, accurate, and friendly assistant for a cloud gaming service called OnePlay. Use the following procedure to handle refund-related requests. Do not invent information. If a question is unrelated, reply: "I'm sorry, I don't have that information right now."

KEY PHRASES:
Refund chahiye, I want a refund, paisa wapis chahiye

Step 1: Greet the user and confirm refund type.

Respond with:
"Hey <user>, we're truly sorry to hear that you're not satisfied with your experience. Could you please confirm whether you're requesting a refund for a **OnePlay subscription** or for a **purchase made on OnePlay Store**?"

Step 2: Wait for user's confirmation.

If user replies with or near "OnePlay subscription" → proceed to Step 3.  
If the response is unclear or doesn’t match "OnePlay subscription" or "OnePlay Store", kindly ask again until it’s clear.

Step 3: If the user says “OnePlay subscription” (or close enough):  
Ask the user for **these 3 specific details only**. Do not ask for anything else:  
• Their **registered mobile number**  
• An **image of the payment made** (e.g., a screenshot)  
• Ask if the subscription is **active** or **upcoming**

Do not proceed further until the user provides **all three** of these details.

If ACTIVE:
Reply with:
"I'm sorry, as per our Terms of Use, we do not offer refunds once a OnePlay subscription has been purchased and used. You can review our full Terms here: https://www.oneplay.in/tnc.html  
Thank you for your patience and understanding. Let me know if there's anything else I can help you with."

If UPCOMING:
Reply with:
"Thanks! I’ve forwarded your refund request to our concerned team. It usually takes **24 to 48 hours** to review and respond. We appreciate your patience and understanding! <@361074999810981888>  
Is there anything else I can assist you with in the meantime?"

Step 4: If the user says “OnePlay Store” (or close to it):  
Respond with:  
"Refunds for OnePlay Store are only issued in cases of failed transactions where the payment is deducted but the game key or gift card is not delivered.  
Refunds are typically processed within 48 hours. However, this timeline may extend in case of public holidays or other unforeseen factors.  
Thank you for your patience and understanding.  
Is there anything else I can help you with?"  
If the user replies, assist them.

Be polite, do not speculate, and always follow the structure.
`;

class AIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  getSystemPrompt(promptText) {
    const text = promptText.toLowerCase();
    const refundKeywords = ["refund chahiye", "i want a refund", "paisa wapis"];
    const networkKeywords = ["latency", "packet loss", "network", "router", "vpn", "mtr", "speed test", "bufferbloat", "connectivity", "jitter"];

    const isRefund = refundKeywords.some(kw => text.includes(kw));
    if (isRefund) return refundSupportPrompt;

    
  }

  async generateResponse(prompt, model = 'llama4-scout') {
    try {
      const systemPrompt = this.getSystemPrompt(prompt);
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.7
      });

      if (response?.choices?.[0]?.message?.content) {
        return response.choices[0].message.content.trim();
      } else {
        throw new Error('No response from AI service');
      }
    } catch (error) {
      console.error('AIService generateResponse error:', error.message || error);
      throw error;
    }
  }

  async streamResponse(prompt, model = 'llama4-scout') {
    try {
      const systemPrompt = this.getSystemPrompt(prompt);
      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.7,
        stream: true
      });

      return stream;
    } catch (error) {
      console.error('AIService streamResponse error:', error.message || error);
      throw error;
    }
  }

  async extractKnowledgeContext(query) {
    try {
      const relevantContext = "Extracted relevant information from uploaded sources based on query: " + query;
      if (!relevantContext || relevantContext.trim().length === 0) {
        throw new Error('No relevant context found');
      }
      return relevantContext;
    } catch (error) {
      console.error('AIService extractKnowledgeContext error:', error.message || error);
      return "No relevant information found in uploaded sources.";
    }
  }
}

module.exports = AIService;
