import 'dotenv/config';

const base = process.env.LLM_BASE_URL;
const key = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;

const url = `${base}/v1/chat/completions`;

async function probe(headerName, headerValueFormatter) {
  const headers = {
    'Content-Type': 'application/json'
  };
  headers[headerName] = headerValueFormatter(key);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    });
    const text = await res.text();
    console.log(`Header: ${headerName} -> Status: ${res.status}, Response: ${text.slice(0, 100)}`);
  } catch (err) {
    console.log(`Header: ${headerName} -> Error: ${err.message}`);
  }
}

async function run() {
  console.log(`Probing headers for ${url}...`);
  await probe('Authorization', k => `Bearer ${k}`);
  await probe('Authorization', k => k);
  await probe('api-key', k => k);
  await probe('x-api-key', k => k);
  await probe('api_key', k => k);
}

run();
