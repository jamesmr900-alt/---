/* Адрес прокси для страницы ассистента.
   На Vercel ничего менять не нужно: прокси работает по адресу /api этого же сайта.
   Если прокси развёрнут отдельно (например, Cloudflare Worker), впишите его адрес:
   workerUrl: 'https://maytoni-agent.ваш-аккаунт.workers.dev' */
window.MAYTONI_CONFIG = {
  workerUrl: '',
};
