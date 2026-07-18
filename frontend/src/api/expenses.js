import client from './client';

export const getExpenseCategories = () => client.get('/expenses/categories');

export const createExpenseCategory = (data) => client.post('/expenses/categories', data);

export const submitExpenseClaim = (data) => client.post('/expenses/claims', data);

export const getMyExpenseClaims = () => client.get('/expenses/my-claims');

export const getPendingExpenseClaims = () => client.get('/expenses/pending');

export const getAllExpenseClaims = () => client.get('/expenses/');

export const approveRejectExpense = (id, status) =>
  client.put(`/expenses/claims/${id}/approve`, { status });

export const reimburseExpense = (id) => client.put(`/expenses/claims/${id}/reimburse`);
