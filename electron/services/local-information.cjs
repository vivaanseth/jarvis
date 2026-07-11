function tokenize(expression) {
  const compact = String(expression).replace(/,/g, '').replace(/\s+/g, '');
  if (!compact || compact.length > 120 || /[^0-9+\-*/().%]/.test(compact)) throw new Error('Use numbers and +, −, ×, ÷, %, or parentheses.');
  return compact.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
}

function calculate(expression) {
  const tokens = tokenize(expression); const output = []; const operators = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
  let previous = 'operator';
  for (const token of tokens) {
    if (/^\d/.test(token)) { output.push(Number(token)); previous = 'number'; continue; }
    if (token === '(') { operators.push(token); previous = 'operator'; continue; }
    if (token === ')') {
      while (operators.length && operators.at(-1) !== '(') output.push(operators.pop());
      if (operators.pop() !== '(') throw new Error('The calculation has unmatched parentheses.');
      previous = 'number'; continue;
    }
    if (token === '-' && previous === 'operator') output.push(0);
    while (operators.length && precedence[operators.at(-1)] >= precedence[token]) output.push(operators.pop());
    operators.push(token); previous = 'operator';
  }
  while (operators.length) { const op = operators.pop(); if (op === '(') throw new Error('The calculation has unmatched parentheses.'); output.push(op); }
  const stack = [];
  for (const token of output) {
    if (typeof token === 'number') { stack.push(token); continue; }
    const right = stack.pop(); const left = stack.pop();
    if (!Number.isFinite(left) || !Number.isFinite(right)) throw new Error('That calculation is incomplete.');
    if ((token === '/' || token === '%') && right === 0) throw new Error('Division by zero is undefined.');
    stack.push(token === '+' ? left + right : token === '-' ? left - right : token === '*' ? left * right : token === '/' ? left / right : left % right);
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error('That calculation could not be completed.');
  return Math.round(stack[0] * 1e10) / 1e10;
}

async function weather(location) {
  const query = String(location || '').trim();
  if (!query) throw new Error('Tell me which city or place to check.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`, { signal: controller.signal }).then(response => response.ok ? response.json() : Promise.reject(new Error('Weather location lookup failed.')));
    const place = geo.results?.[0]; if (!place) throw new Error(`I could not find “${query}”.`);
    const data = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`, { signal: controller.signal }).then(response => response.ok ? response.json() : Promise.reject(new Error('Weather service is unavailable.')));
    const current = data.current; if (!current) throw new Error('Weather service returned no current conditions.');
    return `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}: ${Math.round(current.temperature_2m)}°F, feels like ${Math.round(current.apparent_temperature)}°F, wind ${Math.round(current.wind_speed_10m)} mph, precipitation ${current.precipitation} mm.`;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Weather lookup timed out.');
    throw error;
  } finally { clearTimeout(timer); }
}

module.exports = { calculate, weather };
