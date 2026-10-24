const PREFIX = 'chatlate.';

export const get = (key, fallback = '') => localStorage.getItem(PREFIX + key) ?? fallback;
export const put = (key, value) => localStorage.setItem(PREFIX + key, value);
