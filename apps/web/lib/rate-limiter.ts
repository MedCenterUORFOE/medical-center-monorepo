type RateLimitStore = {
    count: number;
    resetTime: number;
  };
  
  // In-memory store to track IPs and their request counts
  const rateLimitMap = new Map<string, RateLimitStore>();
  
  export function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(ip);
  
    // If no record exists, or the time window has passed, reset the count
    if (!record || now > record.resetTime) {
      rateLimitMap.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
      return true; // Request allowed
    }
  
    // If they are within the time window, check the count
    if (record.count < limit) {
      record.count += 1;
      rateLimitMap.set(ip, record);
      return true; // Request allowed
    }
  
    // If they hit the limit, block them
    return false; 
  }