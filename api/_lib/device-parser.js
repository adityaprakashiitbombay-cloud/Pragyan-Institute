// Helper to parse device type, OS, browser, and client IP from HTTP headers
export function parseDeviceInfo(userAgent = '', ip = '') {
  const ua = String(userAgent || '');
  let deviceType = 'desktop';
  let os = 'Unknown OS';
  let browser = 'Web Browser';

  // Device Type Detection
  if (/iPad|Tablet|PlayBook/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    deviceType = 'tablet';
  } else if (/iPhone|iPod|Mobile|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    deviceType = 'mobile';
  } else {
    deviceType = 'desktop';
  }

  // OS Detection
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6.2/i.test(ua)) os = 'Windows 8';
  else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/iPhone OS (\d+_\d+)/i.test(ua)) os = `iOS ${RegExp.$1.replace(/_/g, '.')}`;
  else if (/iPad.*OS (\d+_\d+)/i.test(ua)) os = `iPadOS ${RegExp.$1.replace(/_/g, '.')}`;
  else if (/Mac OS X (\d+[._]\d+)/i.test(ua)) os = `macOS ${RegExp.$1.replace(/_/g, '.')}`;
  else if (/Android (\d+(\.\d+)?)/i.test(ua)) os = `Android ${RegExp.$1}`;
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'Chrome OS';

  // Browser Detection
  if (/Edg(?:e|A|IOS)?\/(\d+(\.\d+)?)/i.test(ua)) browser = `Edge ${RegExp.$1.split('.')[0]}`;
  else if (/OPR\/(\d+(\.\d+)?)|Opera/i.test(ua)) browser = `Opera`;
  else if (/Chrome\/(\d+)/i.test(ua) && !/Chromium/i.test(ua)) browser = `Chrome ${RegExp.$1}`;
  else if (/Firefox\/(\d+)/i.test(ua)) browser = `Firefox ${RegExp.$1}`;
  else if (/Version\/(\d+(\.\d+)?).*Safari/i.test(ua)) browser = `Safari ${RegExp.$1.split('.')[0]}`;
  else if (/Safari/i.test(ua)) browser = 'Safari';

  const cleanIp = String(ip || '').replace(/^::ffff:/, '').trim() || '127.0.0.1';
  const name = `${browser} on ${os}`;

  return {
    name,
    type: deviceType,
    browser,
    os,
    ip: cleanIp
  };
}

export function getClientIp(req) {
  if (!req || !req.headers) return '127.0.0.1';
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first.replace(/^::ffff:/, '');
  }
  const realIp = req.headers['x-real-ip'] || req.headers['cf-connecting-ip'];
  if (realIp) return String(realIp).trim().replace(/^::ffff:/, '');
  const socketIp = req.socket?.remoteAddress || req.connection?.remoteAddress;
  return socketIp ? String(socketIp).trim().replace(/^::ffff:/, '') : '127.0.0.1';
}
