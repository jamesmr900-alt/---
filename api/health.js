import proxy from '../worker/worker.js';
export const GET = req => proxy.fetch(req, process.env);
