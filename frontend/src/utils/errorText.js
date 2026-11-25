// The API's own message when it sent one. Validation errors (422) come as a list, not text.
export default function errorText(error, fallback) {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}
