import axios from 'axios';

export const api = axios.create({ baseURL: '/api/v1' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Surface the API's own error text; components can just render err.message.
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(new Error(err.response?.data?.error || err.message)),
);

export const setToken = (token) =>
  token ? localStorage.setItem('token', token) : localStorage.removeItem('token');

export const RANCHI = { lat: 23.344, lng: 85.31 };

// Mirrors server/config.js. Both lists are static, so a build-time copy beats
// an extra round trip on every page that needs a dropdown.
export const WARDS = Array.from({ length: 12 }, (_, i) => `Ward ${i + 1}`);

export const DEPARTMENTS = ['Waste Management', 'Roads', 'Water', 'Drainage', 'Electrical', 'Environment', 'Public Works'];

export const CATEGORY_LABELS = {
  garbage: 'Garbage / Waste',
  pothole: 'Pothole / Road Damage',
  water_leak: 'Water Leakage',
  drainage: 'Drainage',
  waterlogging: 'Waterlogging',
  streetlight: 'Streetlight',
  dumping: 'Illegal Dumping',
  pollution: 'Pollution',
  infrastructure: 'Damaged Public Infrastructure',
  tree: 'Tree / Green Area Issue',
  other: 'Other',
};
