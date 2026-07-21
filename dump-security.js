async function dumpSecurity() {
  const url = 'https://api.vicharanashala.org/openapi.json';
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('Security:', JSON.stringify(data.security, null, 2));
    console.log('Components Security Schemes:', JSON.stringify(data.components?.securitySchemes, null, 2));
    
    // Also log the routes that need security, specifically /v1/chat/completions security property
    const chatRoute = data.paths['/v1/chat/completions']?.post;
    if (chatRoute) {
      console.log('Chat Completion security requirements:', JSON.stringify(chatRoute.security, null, 2));
    }
  } catch (e) {
    console.error(e);
  }
}

dumpSecurity();
