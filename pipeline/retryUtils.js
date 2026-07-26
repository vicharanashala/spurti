/**
 * Executes an async function and retries it if it fails.
 * 
 * @param {Function} asyncOperation - The API call to attempt
 * @param {number} maxRetries - How many times to try before giving up (default: 3)
 * @param {number} delayMs - How long to wait between attempts in milliseconds (default: 2000)
 * @returns The result of the asyncOperation
 */
async function withRetry(asyncOperation, maxRetries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try to execute the API call
      return await asyncOperation();
    } catch (error) {
      console.warn(`[Retry ${attempt}/${maxRetries}] Operation failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        console.error('Max retries reached. Failing permanently.');
        throw error; // Give up and throw the error to be handled by the main script
      }
      
      // Wait for the specified delay before the next loop
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export { withRetry };
