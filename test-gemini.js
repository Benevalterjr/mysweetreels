import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

try {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Ola'
  });
  console.log('Resposta:', response.text);
} catch (err) {
  console.error('Erro completo:', err);
  if (err.cause) {
    console.error('Causa:', err.cause);
  }
}
