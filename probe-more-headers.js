import 'dotenv/config';

const base = process.env.LLM_BASE_URL;
const key = process.env.LLM_API_KEY;
const url = `${base}/v1/models`;

async function testHeader(headers) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers
    });
    const text = await res.text();
    const hStr = Object.keys(headers).map(k => `${k}: ${headers[k]}`).join(', ');
    console.log(`Headers [${hStr}] -> Status: ${res.status}, Response: ${text.slice(0, 100)}`);
    return res.status === 200;
  } catch (e) {
    console.error(`Failed with headers:`, headers, e.message);
    return false;
  }
}

async function run() {
  console.log(`Probing wide range of authentication headers on ${url}...`);
  await testHeader({ 'token': key });
  await testHeader({ 'token': `Bearer ${key}` });
  await testHeader({ 'X-Token': key });
  await testHeader({ 'X-Auth-Token': key });
  await testHeader({ 'x-api-token': key });
  await testHeader({ 'api-token': key });
  await testHeader({ 'Authorization': `token ${key}` });
  await testHeader({ 'Authorization': `Token ${key}` });
  await testHeader({ 'Authorization': `Apikey ${key}` });
  await testHeader({ 'Authorization': `Key ${key}` });
}

run();
