import 'dotenv/config';

const base = process.env.LLM_BASE_URL;
const key = process.env.LLM_API_KEY;

async function probeQueryParams() {
  const queries = [
    `api_key=${key}`,
    `key=${key}`,
    `token=${key}`,
    `api-key=${key}`,
    `apikey=${key}`
  ];
  
  for (const q of queries) {
    const url = `${base}/v1/models?${q}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`Query: ?${q.split('=')[0]} -> Status: ${res.status}, Response: ${text.slice(0, 100)}`);
    } catch (e) {
      console.error(`Query: ?${q.split('=')[0]} failed:`, e.message);
    }
  }
}

probeQueryParams();
