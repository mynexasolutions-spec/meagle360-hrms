import client from './client';

export const getMyCompany = () => client.get('/companies/me');

export const updateMyCompany = (data) => client.put('/companies/me', data);

export const uploadCompanyBranding = (file, imageType) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post(`/companies/branding-image?image_type=${imageType}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
