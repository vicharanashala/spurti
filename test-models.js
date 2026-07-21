import 'dotenv/config';

const base = process.env.LLM_BASE_URL;
const key = process.env.LLM_API_KEY;

async function testModels() {
  const url = `${base}/v1/models`;
  console.log(`Querying ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${text}`);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testModels();
