// Resolve site-local paths under Astro's base (which includes a trailing slash).
export const sitePath = (path = '') => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
