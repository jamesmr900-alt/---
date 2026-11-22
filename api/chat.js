// Vercel: прокси к Claude API. Ключ — переменная окружения ANTHROPIC_API_KEY в настройках проекта Vercel.
import proxy from '../worker/worker.js';
const run = req => proxy.fetch(req, process.env);
export const POST = run, OPTIONS = run, GET = run;
