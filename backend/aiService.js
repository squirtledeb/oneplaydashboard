const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://inference.samaira.ai/openai'
});

class AIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async generateResponse(prompt, model = 'llama4-scout') {
    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: 'You are a helpful support assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7
      });
      if (response && response.choices && response.choices.length > 0) {
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
      const stream = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: 'You are a helpful support assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7,
        stream: true
      });

      return stream;
    } catch (error) {
      console.error('AIService streamResponse error:', error.message || error);
      throw error;
    }
  }

  // Enhanced context extraction from uploaded sources
  async extractKnowledgeContext(query) {
    try {
      // TODO: Implement actual logic to search and extract relevant text from uploaded sources
      // This could involve keyword matching, vector similarity search, or text ranking on stored documents
      // For now, simulate with a dummy relevant context string
      const relevantContext = "Extracted relevant information from uploaded sources based on query: " + query;

      if (!relevantContext || relevantContext.trim().length === 0) {
        throw new Error('No relevant context found');
      }

      return relevantContext;
    } catch (error) {
      console.error('AIService extractKnowledgeContext error:', error.message || error);
      // Return a safe fallback context or empty string
      return "No relevant information found in uploaded sources.";
    }
  }
}

module.exports = AIService;
