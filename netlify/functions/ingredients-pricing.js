import { getRecipeIngredientsPricing } from '../../lib/infoprice.js';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    let items = [];
    let cep = '04025010';
    let raio = 5;

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      items = data.items || [];
      cep = data.cep || cep;
      raio = data.raio || raio;
    } else {
      const q = event.queryStringParameters || {};
      cep = q.cep || cep;
      raio = Number(q.raio) || raio;
      if (q.items) items = q.items.split(',').map(s => s.trim()).filter(Boolean);
    }

    const result = await getRecipeIngredientsPricing({ items, cep, raio });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
