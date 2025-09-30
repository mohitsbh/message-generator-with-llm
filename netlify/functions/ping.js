exports.handler = async function (event, context) {
  if (event.httpMethod === 'GET') return { statusCode: 200, body: 'pong' };
  return { statusCode: 200, body: JSON.stringify({ ok: true, method: event.httpMethod }) };
};
