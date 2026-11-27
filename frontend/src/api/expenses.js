import client from './client';

export const getExpenseCategories = (includeInactive = false) =>
  client.get('/expenses/categories', { params: includeInactive ? { include_inactive: true } : {} });

export const createExpenseCategory = (name) => client.post('/expenses/categories', { name });

// data: { name?, is_active? }
export const updateExpenseCategory = (id, data) => client.patch(`/expenses/categories/${id}`, data);

// Multipart: claim fields plus an optional receipt file (PDF/JPG/PNG, 2 MB).
export const submitExpenseClaim = ({ category_id, amount, expense_date, description, receipt }) => {
  const form = new FormData();
  form.append('amount', amount);
  form.append('expense_date', expense_date);
  if (category_id) form.append('category_id', category_id);
  if (description) form.append('description', description);
  if (receipt) form.append('receipt', receipt);
  return client.post('/expenses/claims', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const getExpenseReceipt = (id) => client.get(`/expenses/claims/${id}/receipt`, { responseType: 'blob' });

export const getMyExpenseClaims = () => client.get('/expenses/my-claims');

export const getPendingExpenseClaims = () => client.get('/expenses/pending');

export const getAllExpenseClaims = () => client.get('/expenses/');

export const approveRejectExpense = (id, status) =>
  client.put(`/expenses/claims/${id}/approve`, { status });

export const reimburseExpense = (id) => client.put(`/expenses/claims/${id}/reimburse`);
