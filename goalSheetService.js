import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
};

const goalSheetService = {
  getAll: async () => {
    const res = await axios.get(
      `${API_URL}/goals`,
      getAuthHeader()
    );
    return res.data;
  },

  create: async (data) => {
    const res = await axios.post(
      `${API_URL}/goals`,
      data,
      getAuthHeader()
    );
    return res.data;
  },

  getApprovals: async () => {
    const res = await axios.get(
      `${API_URL}/goals`,
      getAuthHeader()
    );
    return res.data;
  }
};

export default goalSheetService;