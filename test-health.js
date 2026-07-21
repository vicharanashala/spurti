async function checkHealth() {
  const endpoints = ['/health', '/version', '/load', '/ping'];
  for (const ep of endpoints) {
    const url = `https://api.vicharanashala.org${ep}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`${ep} -> Status: ${res.status}, Response: ${text}`);
    } catch (e) {
      console.error(`${ep} failed:`, e.message);
    }
  }
}

checkHealth();
