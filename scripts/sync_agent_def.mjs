// Копирует инструкцию ассистента и список инструментов из worker/worker.js в js/agent-def.js
// (страница использует их, когда открыта как артефакт Claude). Запуск: node scripts/sync_agent_def.mjs
import fs from 'fs';
const src = fs.readFileSync(new URL('../worker/worker.js', import.meta.url), 'utf8');
const sys = src.slice(src.indexOf('const SYSTEM = '), src.indexOf('const TOOLS = '));
const tools = src.slice(src.indexOf('const TOOLS = '), src.indexOf('const mem = '));
const { SYSTEM, TOOLS } = new Function(sys + tools + 'return { SYSTEM, TOOLS };')();
fs.writeFileSync(new URL('../js/agent-def.js', import.meta.url),
  '/* Сгенерировано scripts/sync_agent_def.mjs из worker/worker.js — правьте там. */\nwindow.MT_AGENT = ' + JSON.stringify({ SYSTEM, TOOLS }) + ';\n');
console.log('ok', TOOLS.length, 'tools; schema sizes:', TOOLS.map(t => t.name + ':' + JSON.stringify(t.input_schema).length).join(' '));
